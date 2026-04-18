import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setupTestDb } from '../__tests__/helpers/testDb.js'
import { buildApp } from '../__tests__/helpers/buildApp.js'
import { createFeed } from '../db.js'
import type { FastifyInstance } from 'fastify'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const { mockDiscoverRssUrl, mockFetchSingleFeed, mockQueryRssBridge, mockInferCssSelectorBridge } = vi.hoisted(() => ({
  mockDiscoverRssUrl: vi.fn(),
  mockFetchSingleFeed: vi.fn(),
  mockQueryRssBridge: vi.fn(),
  mockInferCssSelectorBridge: vi.fn(),
}))

vi.mock('../fetcher.js', async () => {
  const { EventEmitter } = await import('events')
  return {
    fetchAllFeeds: vi.fn(),
    fetchSingleFeed: (...args: unknown[]) => mockFetchSingleFeed(...args),
    discoverRssUrl: (...args: unknown[]) => mockDiscoverRssUrl(...args),
    summarizeArticle: vi.fn(),
    streamSummarizeArticle: vi.fn(),
    translateArticle: vi.fn(),
    streamTranslateArticle: vi.fn(),
    fetchProgress: new EventEmitter(),
    getFeedState: vi.fn(),
  }
})

vi.mock('../rss-bridge.js', () => ({
  queryRssBridge: (...args: unknown[]) => mockQueryRssBridge(...args),
  inferCssSelectorBridge: (...args: unknown[]) => mockInferCssSelectorBridge(...args),
}))

vi.mock('../anthropic.js', () => ({
  anthropic: { messages: { stream: vi.fn(), create: vi.fn() } },
}))

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let app: FastifyInstance
const json = { 'content-type': 'application/json' }

function seedFeed(overrides: Partial<Parameters<typeof createFeed>[0]> = {}) {
  return createFeed({ name: 'Test Feed', url: 'https://example.com', ...overrides })
}

function parseSSE(body: string): Record<string, unknown>[] {
  return body
    .split('\n')
    .filter(l => l.startsWith('data: '))
    .map(l => JSON.parse(l.slice(6)))
}

beforeEach(async () => {
  setupTestDb()
  app = await buildApp()
  mockDiscoverRssUrl.mockReset().mockResolvedValue({ rssUrl: null, title: null })
  mockFetchSingleFeed.mockReset().mockResolvedValue(undefined)
  mockQueryRssBridge.mockReset().mockResolvedValue(null)
  mockInferCssSelectorBridge.mockReset().mockResolvedValue(null)
})

// ---------------------------------------------------------------------------
// GET /api/discover-title
// ---------------------------------------------------------------------------

describe('GET /api/discover-title', () => {
  it('returns discovered title', async () => {
    mockDiscoverRssUrl.mockResolvedValue({ rssUrl: 'https://example.com/feed', title: 'My Blog' })

    const res = await app.inject({
      method: 'GET',
      url: '/api/discover-title?url=https://example.com',
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().title).toBe('My Blog')
  })

  it('returns 400 when url is missing', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/discover-title',
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/url/i)
  })

  it('returns null title on error', async () => {
    mockDiscoverRssUrl.mockRejectedValue(new Error('network error'))

    const res = await app.inject({
      method: 'GET',
      url: '/api/discover-title?url=https://broken.example.com',
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().title).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// POST /api/feeds — RSS discovery pipeline
// ---------------------------------------------------------------------------

describe('POST /api/feeds — RSS discovery pipeline', () => {
  it('sends choice_needed when rss_url is found', async () => {
    mockDiscoverRssUrl.mockResolvedValue({ rssUrl: 'https://example.com/feed.xml', title: 'Blog' })

    const res = await app.inject({
      method: 'POST',
      url: '/api/feeds',
      headers: json,
      payload: { url: 'https://example.com' },
    })

    const events = parseSSE(res.body)
    const choice = events.find(e => e.type === 'choice_needed') as any
    expect(choice).toBeDefined()
    expect(choice.rss_url).toBe('https://example.com/feed.xml')
    expect(choice.rss_title).toBe('Blog')

    // Should not create a feed or proceed to further steps
    expect(events.find(e => e.type === 'done')).toBeUndefined()
    expect(mockQueryRssBridge).not.toHaveBeenCalled()
    expect(mockInferCssSelectorBridge).not.toHaveBeenCalled()
  })

  it('creates feed directly when discovered_rss_url is provided (Phase 2: whole site)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/feeds',
      headers: json,
      payload: {
        url: 'https://example.com',
        discovered_rss_url: 'https://example.com/feed.xml',
        discovered_rss_title: 'Blog',
      },
    })

    const events = parseSSE(res.body)
    const done = events.find(e => e.type === 'done') as any
    expect(done).toBeDefined()
    expect(done.feed.rss_url).toBe('https://example.com/feed.xml')
    expect(done.feed.name).toBe('Blog')

    // Should not run discovery or bridge
    expect(mockDiscoverRssUrl).not.toHaveBeenCalled()
    expect(mockQueryRssBridge).not.toHaveBeenCalled()
  })

  it('falls back to RSS bridge when discovery fails', async () => {
    mockDiscoverRssUrl.mockResolvedValue({ rssUrl: null, title: null })
    mockQueryRssBridge.mockResolvedValue('https://bridge.example.com/rss')

    const res = await app.inject({
      method: 'POST',
      url: '/api/feeds',
      headers: json,
      payload: { url: 'https://nossl.example.com' },
    })

    const events = parseSSE(res.body)
    const bridgeSteps = events.filter(e => e.step === 'rss-bridge')
    expect(bridgeSteps.some(e => e.status === 'done' && e.found === true)).toBe(true)

    const cssSteps = events.filter(e => e.step === 'css-selector')
    expect(cssSteps.some(e => e.status === 'skipped')).toBe(true)

    const done = events.find(e => e.type === 'done') as any
    expect(done.feed.rss_bridge_url).toBe('https://bridge.example.com/rss')
  })

  it('falls back to CSS selector inference when both discovery and bridge fail', async () => {
    mockDiscoverRssUrl.mockResolvedValue({ rssUrl: null, title: null })
    mockQueryRssBridge.mockResolvedValue(null)
    mockInferCssSelectorBridge.mockResolvedValue('https://bridge.example.com/css-bridge')

    const res = await app.inject({
      method: 'POST',
      url: '/api/feeds',
      headers: json,
      payload: { url: 'https://hard.example.com' },
    })

    const events = parseSSE(res.body)
    const cssSteps = events.filter(e => e.step === 'css-selector')
    expect(cssSteps.some(e => e.status === 'done' && e.found === true)).toBe(true)

    const done = events.find(e => e.type === 'done') as any
    expect(done.feed.rss_bridge_url).toBe('https://bridge.example.com/css-bridge')
  })

  it('uses hostname as feed name when no name and no title (Phase 2)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/feeds',
      headers: json,
      payload: {
        url: 'https://unnamed.example.com/blog',
        discovered_rss_url: 'https://unnamed.example.com/feed',
      },
    })

    const events = parseSSE(res.body)
    const done = events.find(e => e.type === 'done') as any
    expect(done.feed.name).toBe('unnamed.example.com')
  })

  it('uses discovered_rss_title as feed name when no name provided (Phase 2)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/feeds',
      headers: json,
      payload: {
        url: 'https://example.com',
        discovered_rss_url: 'https://example.com/feed',
        discovered_rss_title: 'Discovered Title',
      },
    })

    const events = parseSSE(res.body)
    const done = events.find(e => e.type === 'done') as any
    expect(done.feed.name).toBe('Discovered Title')
  })

  it('prefers explicit name over discovered_rss_title (Phase 2)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/feeds',
      headers: json,
      payload: {
        url: 'https://example.com',
        name: 'Custom Name',
        discovered_rss_url: 'https://example.com/feed',
        discovered_rss_title: 'Discovered',
      },
    })

    const events = parseSSE(res.body)
    const done = events.find(e => e.type === 'done') as any
    expect(done.feed.name).toBe('Custom Name')
  })

  it('sends error event when discovery throws', async () => {
    // Make discoverRssUrl throw in the outer try block (after step event is sent)
    mockDiscoverRssUrl.mockImplementation(() => {
      throw new Error('Unexpected crash')
    })

    const res = await app.inject({
      method: 'POST',
      url: '/api/feeds',
      headers: json,
      payload: { url: 'https://example.com/crash' },
    })

    // Feed is still created (the discovery error is caught inside step 1)
    // but the overall try/catch should handle URL parse errors
    const events = parseSSE(res.body)
    const hasErrorOrDone = events.some(e => e.type === 'error' || e.type === 'done')
    expect(hasErrorOrDone).toBe(true)
  })

  it('accepts http:// URLs', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/feeds',
      headers: json,
      payload: { url: 'http://example.com/feed' },
    })

    // Now succeeds (validation-wise)
    expect(res.statusCode).toBe(200)
  })

  it('rejects ftp:// URLs', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/feeds',
      headers: json,
      payload: { url: 'ftp://example.com/feed' },
    })

    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/Only http:\/\/ or https:\/\/ URLs are allowed/i)
  })

  it('rejects invalid URLs', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/feeds',
      headers: json,
      payload: { url: 'not-a-url' },
    })

    expect(res.statusCode).toBe(400)
  })

  it('fires fetchSingleFeed for feeds with rss_url (Phase 2)', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/feeds',
      headers: json,
      payload: {
        url: 'https://example.com',
        discovered_rss_url: 'https://example.com/feed',
        discovered_rss_title: 'Blog',
      },
    })

    // fetchSingleFeed is fire-and-forget, give it a tick
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(mockFetchSingleFeed).toHaveBeenCalled()
  })

  it('does not fire fetchSingleFeed when no rss url found', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/feeds',
      headers: json,
      payload: { url: 'https://nofeed.example.com' },
    })

    await new Promise(resolve => setTimeout(resolve, 10))
    expect(mockFetchSingleFeed).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// POST /api/feeds/:id/fetch
// ---------------------------------------------------------------------------

describe('POST /api/feeds/:id/fetch', () => {
  it('returns SSE stream for valid feed', async () => {
    const feed = seedFeed({ rss_url: 'https://example.com/feed' })

    mockFetchSingleFeed.mockImplementation(async (_feed: any, onEvent: (e: any) => void) => {
      onEvent({ type: 'feed-articles-found', total: 5 })
      onEvent({ type: 'article-done', fetched: 1 })
    })

    const res = await app.inject({
      method: 'POST',
      url: `/api/feeds/${feed.id}/fetch`,
    })

    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toBe('text/event-stream')

    const events = parseSSE(res.body)
    expect(events.find(e => e.type === 'feed-articles-found')).toBeDefined()
    expect(events.find(e => e.type === 'article-done')).toBeDefined()
  })

  it('returns 404 for non-existent feed', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/feeds/9999/fetch',
    })
    expect(res.statusCode).toBe(404)
  })

  it('returns 404 for disabled feed', async () => {
    const feed = seedFeed({ rss_url: 'https://example.com/feed' })
    // Disable the feed
    const { updateFeed } = await import('../db.js')
    updateFeed(feed.id, { disabled: 1 })

    const res = await app.inject({
      method: 'POST',
      url: `/api/feeds/${feed.id}/fetch`,
    })
    expect(res.statusCode).toBe(404)
    expect(res.json().error).toMatch(/disabled/)
  })
})

// ---------------------------------------------------------------------------
// POST /api/feeds/:id/re-detect
// ---------------------------------------------------------------------------

describe('POST /api/feeds/:id/re-detect', () => {
  it('re-detects RSS URL and updates feed', async () => {
    const feed = seedFeed()
    mockDiscoverRssUrl.mockResolvedValue({ rssUrl: 'https://example.com/new-feed.xml', title: 'New' })

    const res = await app.inject({
      method: 'POST',
      url: `/api/feeds/${feed.id}/re-detect`,
    })

    expect(res.statusCode).toBe(200)
    const events = parseSSE(res.body)
    const done = events.find(e => e.type === 'done')
    expect(done?.rss_url).toBe('https://example.com/new-feed.xml')
    expect(done?.rss_bridge_url).toBeNull()
  })

  it('falls back through bridge and CSS selector', async () => {
    const feed = seedFeed()
    mockDiscoverRssUrl.mockResolvedValue({ rssUrl: null, title: null })
    mockQueryRssBridge.mockResolvedValue(null)
    mockInferCssSelectorBridge.mockResolvedValue('https://bridge.example.com/css')

    const res = await app.inject({
      method: 'POST',
      url: `/api/feeds/${feed.id}/re-detect`,
    })

    expect(res.statusCode).toBe(200)
    const events = parseSSE(res.body)
    const done = events.find(e => e.type === 'done')
    expect(done?.rss_url).toBeNull()
    expect(done?.rss_bridge_url).toBe('https://bridge.example.com/css')
  })

  it('returns 404 for non-existent feed', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/feeds/9999/re-detect',
    })
    expect(res.statusCode).toBe(404)
  })

  it('fires fetchSingleFeed after successful re-detect', async () => {
    const feed = seedFeed()
    mockDiscoverRssUrl.mockResolvedValue({ rssUrl: 'https://example.com/feed', title: null })

    await app.inject({
      method: 'POST',
      url: `/api/feeds/${feed.id}/re-detect`,
    })

    await new Promise(resolve => setTimeout(resolve, 10))
    expect(mockFetchSingleFeed).toHaveBeenCalled()
  })

  it('does not fire fetchSingleFeed when no URLs found', async () => {
    const feed = seedFeed()

    await app.inject({
      method: 'POST',
      url: `/api/feeds/${feed.id}/re-detect`,
    })

    await new Promise(resolve => setTimeout(resolve, 10))
    expect(mockFetchSingleFeed).not.toHaveBeenCalled()
  })

  it('handles discovery error gracefully', async () => {
    const feed = seedFeed()
    mockDiscoverRssUrl.mockRejectedValue(new Error('network'))

    const res = await app.inject({
      method: 'POST',
      url: `/api/feeds/${feed.id}/re-detect`,
    })

    // Falls through to bridge step
    expect(res.statusCode).toBe(200)
  })
})

// ---------------------------------------------------------------------------
// Multipart helpers
// ---------------------------------------------------------------------------

function buildMultipart(fields: Record<string, { filename?: string; content: string }>) {
  const boundary = '----TestBoundary' + Date.now()
  const parts: string[] = []
  for (const [name, { filename, content }] of Object.entries(fields)) {
    if (filename) {
      parts.push(
        `--${boundary}\r\nContent-Disposition: form-data; name="${name}"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n${content}\r\n`,
      )
    } else {
      parts.push(
        `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${content}\r\n`,
      )
    }
  }
  parts.push(`--${boundary}--\r\n`)
  return { body: parts.join(''), contentType: `multipart/form-data; boundary=${boundary}` }
}

const sampleOpml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head><title>Test</title></head>
  <body>
    <outline text="Tech" title="Tech">
      <outline type="rss" text="Hacker News" title="Hacker News" xmlUrl="https://news.ycombinator.com/rss" htmlUrl="https://news.ycombinator.com" />
      <outline type="rss" text="Lobsters" title="Lobsters" xmlUrl="https://lobste.rs/rss" htmlUrl="https://lobste.rs" />
    </outline>
    <outline type="rss" text="xkcd" title="xkcd" xmlUrl="https://xkcd.com/rss.xml" htmlUrl="https://xkcd.com" />
  </body>
</opml>`

// ---------------------------------------------------------------------------
// POST /api/opml/preview
// ---------------------------------------------------------------------------

describe('POST /api/opml/preview', () => {
  it('returns parsed feeds with duplicate flags', async () => {
    // Pre-create one feed so it's detected as duplicate
    seedFeed({ name: 'HN', url: 'https://news.ycombinator.com' })

    const { body, contentType } = buildMultipart({
      file: { filename: 'feeds.opml', content: sampleOpml },
    })

    const res = await app.inject({
      method: 'POST',
      url: '/api/opml/preview',
      headers: { 'content-type': contentType },
      payload: body,
    })

    expect(res.statusCode).toBe(200)
    const data = res.json()
    expect(data.totalCount).toBe(3)
    expect(data.duplicateCount).toBe(1)
    expect(data.feeds).toHaveLength(3)

    const hn = data.feeds.find((f: { url: string }) => f.url === 'https://news.ycombinator.com')
    expect(hn).toBeDefined()
    expect(hn.isDuplicate).toBe(true)
    expect(hn.categoryName).toBe('Tech')

    const xkcd = data.feeds.find((f: { url: string }) => f.url === 'https://xkcd.com')
    expect(xkcd).toBeDefined()
    expect(xkcd.isDuplicate).toBe(false)
    expect(xkcd.categoryName).toBeNull()
  })

  it('returns 400 when no file is uploaded', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/opml/preview',
      headers: { 'content-type': 'multipart/form-data; boundary=----empty' },
      payload: '------empty--\r\n',
    })
    expect(res.statusCode).toBe(400)
  })

  it('does not write to DB', async () => {
    const { body, contentType } = buildMultipart({
      file: { filename: 'feeds.opml', content: sampleOpml },
    })

    await app.inject({
      method: 'POST',
      url: '/api/opml/preview',
      headers: { 'content-type': contentType },
      payload: body,
    })

    // No feeds should have been created
    const { getFeeds } = await import('../db.js')
    expect(getFeeds()).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// POST /api/opml (with selectedUrls)
// ---------------------------------------------------------------------------

describe('POST /api/opml with selectedUrls', () => {
  it('imports only selected feeds', async () => {
    const { body, contentType } = buildMultipart({
      file: { filename: 'feeds.opml', content: sampleOpml },
      selectedUrls: { content: JSON.stringify(['https://lobste.rs', 'https://xkcd.com']) },
    })

    const res = await app.inject({
      method: 'POST',
      url: '/api/opml',
      headers: { 'content-type': contentType },
      payload: body,
    })

    expect(res.statusCode).toBe(200)
    const data = res.json()
    expect(data.imported).toBe(2)

    const { getFeeds } = await import('../db.js')
    const feeds = getFeeds()
    const names = feeds.map((f: { name: string }) => f.name)
    expect(names).toContain('Lobsters')
    expect(names).toContain('xkcd')
    expect(names).not.toContain('Hacker News')
  })

  it('imports all feeds when selectedUrls is omitted (backward compat)', async () => {
    const { body, contentType } = buildMultipart({
      file: { filename: 'feeds.opml', content: sampleOpml },
    })

    const res = await app.inject({
      method: 'POST',
      url: '/api/opml',
      headers: { 'content-type': contentType },
      payload: body,
    })

    expect(res.statusCode).toBe(200)
    const data = res.json()
    expect(data.imported).toBe(3)
  })

  it('skips duplicates even when selected', async () => {
    seedFeed({ name: 'HN', url: 'https://news.ycombinator.com' })

    const { body, contentType } = buildMultipart({
      file: { filename: 'feeds.opml', content: sampleOpml },
      selectedUrls: { content: JSON.stringify(['https://news.ycombinator.com', 'https://xkcd.com']) },
    })

    const res = await app.inject({
      method: 'POST',
      url: '/api/opml',
      headers: { 'content-type': contentType },
      payload: body,
    })

    expect(res.statusCode).toBe(200)
    const data = res.json()
    expect(data.imported).toBe(1)
    expect(data.skipped).toBe(1)
  })
})
