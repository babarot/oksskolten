import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setupTestDb } from './__tests__/helpers/testDb.js'
import { createFeed, insertArticle, getArticleByUrl, getFeedById, upsertSetting } from './db.js'
import type { Feed } from './db.js'

// --- Anthropic mock ---

const mockMessagesCreate = vi.fn()
const mockMessagesStream = vi.fn()

vi.mock('@anthropic-ai/sdk', () => ({
  default: class Anthropic {
    messages = { create: mockMessagesCreate, stream: mockMessagesStream }
  },
}))

// --- feedsmith mock (controllable) ---

let feedsmithShouldFail = false
let feedsmithOverride: unknown = null

vi.mock('feedsmith', async (importOriginal) => {
  const real = await importOriginal<typeof import('feedsmith')>()
  return {
    ...real,
    parseFeed: (...args: Parameters<typeof real.parseFeed>) => {
      if (feedsmithShouldFail) throw new Error('feedsmith parse error')
      if (feedsmithOverride) return feedsmithOverride
      return real.parseFeed(...args)
    },
  }
})

// Piscina mock is provided globally by server/__tests__/setup.ts

// --- FlareSolverr mock ---

const mockFlareSolverr = vi.fn<() => Promise<{ body: string; contentType: string } | null>>()

vi.mock('./fetcher/flaresolverr.js', () => ({
  fetchViaFlareSolverr: (...args: unknown[]) => mockFlareSolverr(...(args as Parameters<typeof mockFlareSolverr>)),
}))

// --- global.fetch mock ---

const mockFetch = vi.fn()

beforeEach(() => {
  setupTestDb()
  upsertSetting('api_key.anthropic', 'test-key')
  mockMessagesCreate.mockReset()
  mockMessagesStream.mockReset()
  mockFetch.mockReset()
  mockFlareSolverr.mockReset()
  mockFlareSolverr.mockResolvedValue(null)
  feedsmithShouldFail = false
  feedsmithOverride = null
  vi.stubGlobal('fetch', mockFetch)
})

// --- Fixture builders ---

function rss20Xml(title: string, items: { title: string; link: string; pubDate?: string }[]): string {
  const itemsXml = items
    .map(
      i => `<item>
      <title>${i.title}</title>
      <link>${i.link}</link>
      ${i.pubDate ? `<pubDate>${i.pubDate}</pubDate>` : ''}
    </item>`,
    )
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${title}</title>
    ${itemsXml}
  </channel>
</rss>`
}

function atomXml(title: string, entries: { title: string; href: string; published?: string }[]): string {
  const entriesXml = entries
    .map(
      e => `<entry>
      <title>${e.title}</title>
      <link rel="alternate" href="${e.href}" />
      ${e.published ? `<published>${e.published}</published>` : ''}
    </entry>`,
    )
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>${title}</title>
  ${entriesXml}
</feed>`
}

function articleHtml(opts: { title?: string; ogImage?: string; body?: string } = {}): string {
  const title = opts.title || 'Test Article'
  const ogTag = opts.ogImage ? `<meta property="og:image" content="${opts.ogImage}" />` : ''
  // Readability needs enough <p> content to extract an article
  const body =
    opts.body ||
    Array(10)
      .fill(
        '<p>This is a paragraph of article content that is long enough for Readability to consider it meaningful text. It contains multiple sentences and provides substantial content for extraction.</p>',
      )
      .join('\n')
  return `<!DOCTYPE html>
<html>
<head>
  <title>${title}</title>
  ${ogTag}
</head>
<body>
  <article>
    <h1>${title}</h1>
    ${body}
  </article>
</body>
</html>`
}

function htmlWithRssLink(href: string, title: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <title>${title}</title>
  <link rel="alternate" type="application/rss+xml" href="${href}" title="RSS" />
</head>
<body><p>Blog page</p></body>
</html>`
}

function htmlWithoutRss(title: string): string {
  return `<!DOCTYPE html>
<html>
<head><title>${title}</title></head>
<body><p>No RSS here</p></body>
</html>`
}

/** Create a mock Response */
function mockResponse(body: string, init?: { status?: number; headers?: Record<string, string> }): Response {
  const status = init?.status ?? 200
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(init?.headers || { 'content-type': 'text/html' }),
    text: () => Promise.resolve(body),
    json: () => Promise.resolve(JSON.parse(body)),
  } as Response
}

function seedFeed(overrides: Partial<Parameters<typeof createFeed>[0]> = {}): Feed {
  return createFeed({
    name: 'Test Feed',
    url: 'https://example.com',
    rss_url: 'https://example.com/feed.xml',
    ...overrides,
  })
}

// ==========================================================================
// normalizeDate
// ==========================================================================

describe('normalizeDate', () => {
  let normalizeDate: typeof import('./fetcher.js').normalizeDate

  beforeEach(async () => {
    const mod = await import('./fetcher.js')
    normalizeDate = mod.normalizeDate
  })

  it('converts RFC 2822 date to ISO', () => {
    expect(normalizeDate('Mon, 01 Jan 2024 12:00:00 GMT')).toBe('2024-01-01T12:00:00.000Z')
  })

  it('passes through ISO 8601 date', () => {
    expect(normalizeDate('2024-06-15T10:30:00Z')).toBe('2024-06-15T10:30:00.000Z')
  })

  it('returns null for invalid date string', () => {
    expect(normalizeDate('not-a-date')).toBeNull()
  })

  it('returns null for undefined', () => {
    expect(normalizeDate(undefined)).toBeNull()
  })

  it('returns null for null', () => {
    expect(normalizeDate(null)).toBeNull()
  })
})

// ==========================================================================
// detectLanguage
// ==========================================================================

describe('detectLanguage', () => {
  let detectLanguage: typeof import('./fetcher.js').detectLanguage

  beforeEach(async () => {
    const mod = await import('./fetcher.js')
    detectLanguage = mod.detectLanguage
  })

  it('detects Japanese text', () => {
    const jaText = 'これは日本語のテキストです。記事の内容について書かれています。' + 'あ'.repeat(100)
    expect(detectLanguage(jaText)).toBe('ja')
  })

  it('detects English text', () => {
    const enText =
      'This is an English text about programming and software development. It contains no CJK characters at all.'
    expect(detectLanguage(enText)).toBe('en')
  })

  it('samples only the first 1000 characters', () => {
    // First 1000 chars are English, then Japanese follows
    const enPart = 'A'.repeat(1000)
    const jaPart = 'あ'.repeat(500)
    expect(detectLanguage(enPart + jaPart)).toBe('en')
  })
})

// ==========================================================================
// discoverRssUrl
// ==========================================================================

describe('discoverRssUrl', () => {
  let discoverRssUrl: typeof import('./fetcher.js').discoverRssUrl

  beforeEach(async () => {
    const mod = await import('./fetcher.js')
    discoverRssUrl = mod.discoverRssUrl
  })

  it('discovers RSS URL from link[rel=alternate]', async () => {
    const blogHtml = htmlWithRssLink('/feed.xml', 'My Blog')
    const feedXml = rss20Xml('My Blog Feed', [])

    mockFetch.mockImplementation((url: string | URL) => {
      const u = url.toString()
      if (u === 'https://blog.example.com/') return Promise.resolve(mockResponse(blogHtml))
      if (u === 'https://blog.example.com/feed.xml')
        return Promise.resolve(mockResponse(feedXml, { headers: { 'content-type': 'application/rss+xml' } }))
      return Promise.resolve(mockResponse('', { status: 404 }))
    })

    const result = await discoverRssUrl('https://blog.example.com/')
    expect(result.rssUrl).toBe('https://blog.example.com/feed.xml')
    expect(result.title).toBe('My Blog Feed')
  })

  it('does not probe paths when link tag found', async () => {
    const blogHtml = htmlWithRssLink('/rss', 'My Blog')
    const feedXml = rss20Xml('RSS Feed', [])

    mockFetch.mockImplementation((url: string | URL) => {
      const u = url.toString()
      if (u === 'https://blog.example.com/') return Promise.resolve(mockResponse(blogHtml))
      if (u === 'https://blog.example.com/rss')
        return Promise.resolve(mockResponse(feedXml, { headers: { 'content-type': 'application/rss+xml' } }))
      return Promise.resolve(mockResponse('', { status: 404 }))
    })

    await discoverRssUrl('https://blog.example.com/')

    // Should only call: 1) blog page, 2) feed title fetch — no HEAD probes
    const calledUrls = mockFetch.mock.calls.map((c: unknown[]) => (c[0] as string).toString())
    const headCalls = mockFetch.mock.calls.filter((c: unknown[]) => (c[1] as RequestInit)?.method === 'HEAD')
    expect(headCalls).toHaveLength(0)
    expect(calledUrls).toContain('https://blog.example.com/')
    expect(calledUrls).toContain('https://blog.example.com/rss')
  })

  it('falls back to path probing when no link tag', async () => {
    const blogHtml = htmlWithoutRss('My Blog')

    mockFetch.mockImplementation((url: string | URL, init?: RequestInit) => {
      const u = url.toString()
      if (u === 'https://blog.example.com/') return Promise.resolve(mockResponse(blogHtml))
      // /feed returns 404, /feed.xml returns valid RSS
      if (u === 'https://blog.example.com/feed.xml' && (!init?.method || init.method === 'HEAD')) {
        return Promise.resolve(mockResponse('', { status: 200, headers: { 'content-type': 'application/xml' } }))
      }
      // Feed title fetch
      if (u === 'https://blog.example.com/feed.xml' && init?.method === undefined) {
        const feedXml = rss20Xml('Discovered Feed', [])
        return Promise.resolve(mockResponse(feedXml, { headers: { 'content-type': 'application/xml' } }))
      }
      return Promise.resolve(mockResponse('', { status: 404 }))
    })

    const result = await discoverRssUrl('https://blog.example.com/')
    expect(result.rssUrl).toBe('https://blog.example.com/feed.xml')
  })

  it('falls back to GET when HEAD returns 405', async () => {
    const blogHtml = htmlWithoutRss('My Blog')

    mockFetch.mockImplementation((url: string | URL, init?: RequestInit) => {
      const u = url.toString()
      if (u === 'https://blog.example.com/') return Promise.resolve(mockResponse(blogHtml))
      // First candidate /feed: HEAD → 405, GET → 200 with xml content-type
      if (u === 'https://blog.example.com/feed') {
        if (init?.method === 'HEAD') {
          return Promise.resolve(mockResponse('', { status: 405 }))
        }
        if (init?.method === 'GET') {
          return Promise.resolve(
            mockResponse(rss20Xml('Feed', []), { status: 200, headers: { 'content-type': 'application/rss+xml' } }),
          )
        }
      }
      // Feed title fetch (no method specified = GET)
      if (u === 'https://blog.example.com/feed' && !init?.method) {
        return Promise.resolve(
          mockResponse(rss20Xml('Feed', []), { headers: { 'content-type': 'application/rss+xml' } }),
        )
      }
      return Promise.resolve(mockResponse('', { status: 404 }))
    })

    const result = await discoverRssUrl('https://blog.example.com/')
    expect(result.rssUrl).toBe('https://blog.example.com/feed')
  })

  it('returns null when nothing found', async () => {
    const blogHtml = htmlWithoutRss('My Blog')

    mockFetch.mockImplementation((url: string | URL) => {
      const u = url.toString()
      if (u === 'https://blog.example.com/') return Promise.resolve(mockResponse(blogHtml))
      // All probes return 404
      return Promise.resolve(mockResponse('', { status: 404 }))
    })

    const result = await discoverRssUrl('https://blog.example.com/')
    expect(result.rssUrl).toBeNull()
    expect(result.title).toBe('My Blog')
  })
})

// ==========================================================================
// summarizeArticle
// ==========================================================================

describe('summarizeArticle', () => {
  let summarizeArticle: typeof import('./fetcher.js').summarizeArticle

  beforeEach(async () => {
    const mod = await import('./fetcher.js')
    summarizeArticle = mod.summarizeArticle
  })

  it('returns summary and token usage', async () => {
    mockMessagesCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'This is a summary' }],
      usage: { input_tokens: 100, output_tokens: 50 },
    })

    const result = await summarizeArticle('Some article text')
    expect(result.summary).toBe('This is a summary')
    expect(result.inputTokens).toBe(100)
    expect(result.outputTokens).toBe(50)
  })

  it('uses haiku model with 2048 max_tokens', async () => {
    mockMessagesCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'summary' }],
      usage: { input_tokens: 10, output_tokens: 5 },
    })

    await summarizeArticle('text')

    expect(mockMessagesCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2048,
      }),
    )
  })

  it('throws on non-text response', async () => {
    mockMessagesCreate.mockResolvedValue({
      content: [{ type: 'tool_use', id: 'x', name: 'y', input: {} }],
      usage: { input_tokens: 10, output_tokens: 5 },
    })

    await expect(summarizeArticle('text')).rejects.toThrow('Unexpected response type')
  })
})

// ==========================================================================
// translateArticle
// ==========================================================================

describe('translateArticle', () => {
  let translateArticle: typeof import('./fetcher.js').translateArticle

  beforeEach(async () => {
    const mod = await import('./fetcher.js')
    translateArticle = mod.translateArticle
  })

  it('returns fullTextTranslated and token usage', async () => {
    mockMessagesCreate.mockResolvedValue({
      content: [{ type: 'text', text: '翻訳されたテキスト' }],
      usage: { input_tokens: 200, output_tokens: 150 },
    })

    const result = await translateArticle('English text')
    expect(result.fullTextTranslated).toBe('翻訳されたテキスト')
    expect(result.inputTokens).toBe(200)
    expect(result.outputTokens).toBe(150)
  })

  it('uses sonnet model with 16384 max_tokens', async () => {
    mockMessagesCreate.mockResolvedValue({
      content: [{ type: 'text', text: '翻訳' }],
      usage: { input_tokens: 10, output_tokens: 5 },
    })

    await translateArticle('text')

    expect(mockMessagesCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'claude-sonnet-4-6',
        max_tokens: 16384,
      }),
    )
  })

  it('includes input text in prompt', async () => {
    mockMessagesCreate.mockResolvedValue({
      content: [{ type: 'text', text: '翻訳' }],
      usage: { input_tokens: 10, output_tokens: 5 },
    })

    await translateArticle('The quick brown fox')

    const call = mockMessagesCreate.mock.calls[0][0]
    const prompt = call.messages[0].content
    expect(prompt).toContain('The quick brown fox')
  })

  it('throws on non-text response', async () => {
    mockMessagesCreate.mockResolvedValue({
      content: [{ type: 'tool_use', id: 'x', name: 'y', input: {} }],
      usage: { input_tokens: 10, output_tokens: 5 },
    })

    await expect(translateArticle('text')).rejects.toThrow('Unexpected response type')
  })
})

// ==========================================================================
// fetchSingleFeed
// ==========================================================================

describe('fetchSingleFeed', () => {
  let fetchSingleFeed: typeof import('./fetcher.js').fetchSingleFeed

  beforeEach(async () => {
    const mod = await import('./fetcher.js')
    fetchSingleFeed = mod.fetchSingleFeed
  })

  it('parses RSS 2.0 and inserts articles', async () => {
    const feed = seedFeed()
    const rssXml = rss20Xml('Test', [
      { title: 'Article 1', link: 'https://example.com/1', pubDate: 'Mon, 01 Jan 2024 12:00:00 GMT' },
      { title: 'Article 2', link: 'https://example.com/2' },
    ])
    const html = articleHtml()

    mockFetch.mockImplementation((url: string | URL) => {
      const u = url.toString()
      if (u === feed.rss_url) return Promise.resolve(mockResponse(rssXml, { headers: { 'content-type': 'application/rss+xml' } }))
      return Promise.resolve(mockResponse(html))
    })

    await fetchSingleFeed(feed)

    const a1 = getArticleByUrl('https://example.com/1')
    expect(a1).toBeDefined()
    expect(a1!.title).toBe('Article 1')
    expect(a1!.full_text).toBeTruthy()

    const a2 = getArticleByUrl('https://example.com/2')
    expect(a2).toBeDefined()
    expect(a2!.title).toBe('Article 2')
  })

  it('parses Atom feed and inserts articles', async () => {
    const feed = seedFeed()
    const xml = atomXml('Atom Blog', [
      { title: 'Entry 1', href: 'https://example.com/e1', published: '2024-03-01T00:00:00Z' },
    ])
    const html = articleHtml()

    mockFetch.mockImplementation((url: string | URL) => {
      const u = url.toString()
      if (u === feed.rss_url) return Promise.resolve(mockResponse(xml, { headers: { 'content-type': 'application/atom+xml' } }))
      return Promise.resolve(mockResponse(html))
    })

    await fetchSingleFeed(feed)

    const article = getArticleByUrl('https://example.com/e1')
    expect(article).toBeDefined()
    expect(article!.title).toBe('Entry 1')
  })

  it('skips existing articles', async () => {
    const feed = seedFeed()
    // Pre-insert an article
    insertArticle({
      feed_id: feed.id,
      title: 'Existing',
      url: 'https://example.com/existing',
      published_at: '2024-01-01T00:00:00Z',
    })

    const rssXml = rss20Xml('Test', [
      { title: 'Existing', link: 'https://example.com/existing' },
      { title: 'New Article', link: 'https://example.com/new' },
    ])
    const html = articleHtml()

    mockFetch.mockImplementation((url: string | URL) => {
      const u = url.toString()
      if (u === feed.rss_url) return Promise.resolve(mockResponse(rssXml, { headers: { 'content-type': 'application/rss+xml' } }))
      return Promise.resolve(mockResponse(html))
    })

    await fetchSingleFeed(feed)

    // Only /new should be fetched, not /existing again
    const fetchedUrls = mockFetch.mock.calls.map((c: unknown[]) => (c[0] as string).toString())
    expect(fetchedUrls).toContain('https://example.com/new')
    expect(fetchedUrls.filter((u: string) => u === 'https://example.com/existing')).toHaveLength(0)
  })

  it('extracts og:image', async () => {
    const feed = seedFeed()
    const rssXml = rss20Xml('Test', [{ title: 'OG', link: 'https://example.com/og' }])
    const html = articleHtml({ ogImage: 'https://example.com/image.jpg' })

    mockFetch.mockImplementation((url: string | URL) => {
      const u = url.toString()
      if (u === feed.rss_url) return Promise.resolve(mockResponse(rssXml, { headers: { 'content-type': 'application/rss+xml' } }))
      return Promise.resolve(mockResponse(html))
    })

    await fetchSingleFeed(feed)

    const article = getArticleByUrl('https://example.com/og')
    expect(article).toBeDefined()
    expect(article!.og_image).toBe('https://example.com/image.jpg')
  })

  it('detects Japanese language for Japanese articles', async () => {
    const feed = seedFeed()
    const rssXml = rss20Xml('Test', [{ title: '日本語記事', link: 'https://example.com/ja' }])
    const jaBody = Array(10)
      .fill(
        '<p>これは日本語のテスト記事です。十分な長さのテキストが必要です。パラグラフの内容は多くの日本語文字を含む必要があります。記事の本文です。</p>',
      )
      .join('\n')
    const html = articleHtml({ body: jaBody })

    mockFetch.mockImplementation((url: string | URL) => {
      const u = url.toString()
      if (u === feed.rss_url) return Promise.resolve(mockResponse(rssXml, { headers: { 'content-type': 'application/rss+xml' } }))
      return Promise.resolve(mockResponse(html))
    })

    await fetchSingleFeed(feed)

    const article = getArticleByUrl('https://example.com/ja')
    expect(article).toBeDefined()
    // Check via raw DB since ArticleDetail doesn't include lang
    const { getDb } = await import('./db.js')
    const row = getDb().prepare('SELECT lang FROM articles WHERE url = ?').get('https://example.com/ja') as { lang: string }
    expect(row.lang).toBe('ja')
  })

  it('records last_error when article fetch fails', async () => {
    const feed = seedFeed()
    const rssXml = rss20Xml('Test', [{ title: 'Bad', link: 'https://example.com/bad' }])

    mockFetch.mockImplementation((url: string | URL) => {
      const u = url.toString()
      if (u === feed.rss_url) return Promise.resolve(mockResponse(rssXml, { headers: { 'content-type': 'application/rss+xml' } }))
      if (u === 'https://example.com/bad') return Promise.resolve(mockResponse('Server Error', { status: 500 }))
      return Promise.resolve(mockResponse('', { status: 404 }))
    })

    await fetchSingleFeed(feed)

    const { getDb } = await import('./db.js')
    const row = getDb().prepare('SELECT last_error, full_text FROM articles WHERE url = ?').get('https://example.com/bad') as { last_error: string; full_text: string | null }
    expect(row.last_error).toContain('HTTP 500')
    expect(row.full_text).toBeNull()
  })

  it('records feed error when RSS fetch fails', async () => {
    const feed = seedFeed()

    mockFetch.mockImplementation(() => {
      return Promise.resolve(mockResponse('Server Error', { status: 500 }))
    })

    await fetchSingleFeed(feed)

    const updatedFeed = getFeedById(feed.id)
    expect(updatedFeed!.last_error).toContain('HTTP 500')
    expect(updatedFeed!.error_count).toBe(1)
  })

  it('fetches all new articles without per-feed limit', async () => {
    const feed = seedFeed()
    const items = Array.from({ length: 35 }, (_, i) => ({
      title: `Article ${i}`,
      link: `https://example.com/art/${i}`,
    }))
    const rssXml = rss20Xml('Big Feed', items)
    const html = articleHtml()

    mockFetch.mockImplementation((url: string | URL) => {
      const u = url.toString()
      if (u === feed.rss_url) return Promise.resolve(mockResponse(rssXml, { headers: { 'content-type': 'application/rss+xml' } }))
      return Promise.resolve(mockResponse(html))
    })

    await fetchSingleFeed(feed)

    const { getDb } = await import('./db.js')
    const count = getDb().prepare('SELECT COUNT(*) AS cnt FROM articles WHERE feed_id = ?').get(feed.id) as { cnt: number }
    expect(count.cnt).toBe(35)
  })
})

// ==========================================================================
// fetchAllFeeds
// ==========================================================================

describe('fetchAllFeeds', () => {
  let fetchAllFeeds: typeof import('./fetcher.js').fetchAllFeeds
  let fetchSingleFeed: typeof import('./fetcher.js').fetchSingleFeed

  beforeEach(async () => {
    const mod = await import('./fetcher.js')
    fetchAllFeeds = mod.fetchAllFeeds
    fetchSingleFeed = mod.fetchSingleFeed
  })

  it('processes articles from multiple feeds', async () => {
    const feed1 = seedFeed({ name: 'Feed A', url: 'https://a.example.com', rss_url: 'https://a.example.com/rss' })
    const feed2 = seedFeed({ name: 'Feed B', url: 'https://b.example.com', rss_url: 'https://b.example.com/rss' })

    const rss1 = rss20Xml('Feed A', [{ title: 'A1', link: 'https://a.example.com/1' }])
    const rss2 = rss20Xml('Feed B', [{ title: 'B1', link: 'https://b.example.com/1' }])
    const html = articleHtml()

    mockFetch.mockImplementation((url: string | URL) => {
      const u = url.toString()
      if (u === feed1.rss_url) return Promise.resolve(mockResponse(rss1, { headers: { 'content-type': 'application/rss+xml' } }))
      if (u === feed2.rss_url) return Promise.resolve(mockResponse(rss2, { headers: { 'content-type': 'application/rss+xml' } }))
      return Promise.resolve(mockResponse(html))
    })

    await fetchAllFeeds()

    expect(getArticleByUrl('https://a.example.com/1')).toBeDefined()
    expect(getArticleByUrl('https://b.example.com/1')).toBeDefined()
  })

  it('retries articles with last_error', async () => {
    const feed = seedFeed()
    // Insert an article with last_error (no full_text)
    insertArticle({
      feed_id: feed.id,
      title: 'Retry Me',
      url: 'https://example.com/retry',
      published_at: '2024-01-01T00:00:00Z',
      last_error: 'fetchFullText: HTTP 500',
    })

    // Feed returns no new articles
    const rssXml = rss20Xml('Test', [])
    const html = articleHtml({ title: 'Retry Me' })

    mockFetch.mockImplementation((url: string | URL) => {
      const u = url.toString()
      if (u === feed.rss_url) return Promise.resolve(mockResponse(rssXml, { headers: { 'content-type': 'application/rss+xml' } }))
      if (u === 'https://example.com/retry') return Promise.resolve(mockResponse(html))
      return Promise.resolve(mockResponse('', { status: 404 }))
    })

    await fetchAllFeeds()

    const { getDb } = await import('./db.js')
    const row = getDb().prepare('SELECT full_text, last_error FROM articles WHERE url = ?').get('https://example.com/retry') as { full_text: string | null; last_error: string | null }
    expect(row.full_text).toBeTruthy()
    expect(row.last_error).toBeNull()
  })

  it('isolates feed errors — one failure does not affect others', async () => {
    const feedA = seedFeed({ name: 'Feed A', url: 'https://a.example.com', rss_url: 'https://a.example.com/rss' })
    const feedB = seedFeed({ name: 'Feed B', url: 'https://b.example.com', rss_url: 'https://b.example.com/rss' })

    const rssB = rss20Xml('Feed B', [{ title: 'B1', link: 'https://b.example.com/1' }])
    const html = articleHtml()

    mockFetch.mockImplementation((url: string | URL) => {
      const u = url.toString()
      // Feed A fails
      if (u === feedA.rss_url) return Promise.resolve(mockResponse('Server Error', { status: 500 }))
      // Feed B succeeds
      if (u === feedB.rss_url) return Promise.resolve(mockResponse(rssB, { headers: { 'content-type': 'application/rss+xml' } }))
      return Promise.resolve(mockResponse(html))
    })

    await fetchAllFeeds()

    // Feed A should have error
    const updatedA = getFeedById(feedA.id)
    expect(updatedA!.last_error).toBeTruthy()

    // Feed B article should still be saved
    expect(getArticleByUrl('https://b.example.com/1')).toBeDefined()
  })

  it('completes normally when no new articles', async () => {
    const feed = seedFeed()
    // Pre-insert the article
    insertArticle({
      feed_id: feed.id,
      title: 'Already Here',
      url: 'https://example.com/already',
      published_at: '2024-01-01T00:00:00Z',
    })

    const rssXml = rss20Xml('Test', [{ title: 'Already Here', link: 'https://example.com/already' }])

    mockFetch.mockImplementation((url: string | URL) => {
      const u = url.toString()
      if (u === feed.rss_url) return Promise.resolve(mockResponse(rssXml, { headers: { 'content-type': 'application/rss+xml' } }))
      return Promise.resolve(mockResponse('', { status: 404 }))
    })

    // Should not throw
    await expect(fetchAllFeeds()).resolves.toBeUndefined()
  })

  it('retry: skips fetchFullText when article already has full_text', async () => {
    const feed = seedFeed()
    // Insert article with full_text but with last_error (retry candidate)
    insertArticle({
      feed_id: feed.id,
      title: 'Has Text',
      url: 'https://example.com/has-text',
      published_at: '2024-01-01T00:00:00Z',
      full_text: 'existing content',
      last_error: 'summary: failed',
      og_image: 'https://example.com/img.jpg',
    })

    // No new RSS items
    const rssXml = rss20Xml('Test', [])
    mockFetch.mockImplementation((url: string | URL) => {
      const u = url.toString()
      if (u === feed.rss_url) return Promise.resolve(mockResponse(rssXml, { headers: { 'content-type': 'application/rss+xml' } }))
      return Promise.resolve(mockResponse('', { status: 404 }))
    })

    await fetchAllFeeds()

    // Should NOT have fetched the article URL (full_text already exists)
    const fetchedUrls = mockFetch.mock.calls.map((c: unknown[]) => (c[0] as string).toString())
    expect(fetchedUrls).not.toContain('https://example.com/has-text')

    // Article should retain og_image from retry path
    const { getDb } = await import('./db.js')
    const row = getDb().prepare('SELECT full_text, og_image, last_error FROM articles WHERE url = ?').get('https://example.com/has-text') as { full_text: string; og_image: string; last_error: string | null }
    expect(row.full_text).toBe('existing content')
    expect(row.og_image).toBe('https://example.com/img.jpg')
    expect(row.last_error).toBeNull()
  })

  it('retry: preserves existing lang', async () => {
    const feed = seedFeed()
    insertArticle({
      feed_id: feed.id,
      title: 'Has Lang',
      url: 'https://example.com/has-lang',
      published_at: '2024-01-01T00:00:00Z',
      full_text: 'some text in English for testing purposes that is long enough',
      lang: 'ja',
      last_error: 'summary: failed',
    })

    const rssXml = rss20Xml('Test', [])
    mockFetch.mockImplementation((url: string | URL) => {
      const u = url.toString()
      if (u === feed.rss_url) return Promise.resolve(mockResponse(rssXml, { headers: { 'content-type': 'application/rss+xml' } }))
      return Promise.resolve(mockResponse('', { status: 404 }))
    })

    await fetchAllFeeds()

    const { getDb } = await import('./db.js')
    const row = getDb().prepare('SELECT lang FROM articles WHERE url = ?').get('https://example.com/has-lang') as { lang: string }
    expect(row.lang).toBe('ja')
  })

  it('insertArticle UNIQUE violation is silently caught', async () => {
    const feed = seedFeed()
    // Pre-insert with same URL
    insertArticle({
      feed_id: feed.id,
      title: 'Already',
      url: 'https://example.com/dup',
      published_at: '2024-01-01T00:00:00Z',
    })

    const rssXml = rss20Xml('Test', [
      { title: 'Dup', link: 'https://example.com/dup' },
    ])
    const html = articleHtml()

    // Return dup article as "new" in RSS (simulating race condition: inserted between getExistingArticleUrls and insertArticle)
    mockFetch.mockImplementation((url: string | URL) => {
      const u = url.toString()
      if (u === feed.rss_url) return Promise.resolve(mockResponse(rssXml, { headers: { 'content-type': 'application/rss+xml' } }))
      return Promise.resolve(mockResponse(html))
    })

    // fetchAllFeeds calls getExistingArticleUrls which won't find the URL initially
    // But the feed returns it so fetchSingleFeed should handle insert gracefully
    // This test verifies no throw happens via fetchSingleFeed
    await expect(fetchSingleFeed(feed)).resolves.toBeUndefined()
  })

  it('non-Error rejection is stringified in feed error', async () => {
    const feed = seedFeed()

    mockFetch.mockRejectedValue('string error')

    await fetchSingleFeed(feed)

    const updatedFeed = getFeedById(feed.id)
    expect(updatedFeed!.last_error).toBe('string error')
  })
})

// ==========================================================================
// fetchSingleFeed — RSS parse fallback
// ==========================================================================

describe('fetchSingleFeed — RSS parse fallback', () => {
  let fetchSingleFeed: typeof import('./fetcher.js').fetchSingleFeed

  beforeEach(async () => {
    const mod = await import('./fetcher.js')
    fetchSingleFeed = mod.fetchSingleFeed
  })

  it('uses rss_bridge_url when rss_url is null', async () => {
    const feed = seedFeed({
      rss_url: null,
      rss_bridge_url: 'https://bridge.example.com/feed',
    })

    const rssXml = rss20Xml('Bridge Feed', [
      { title: 'Bridge Article', link: 'https://example.com/bridge-1' },
    ])
    const html = articleHtml()

    mockFetch.mockImplementation((url: string | URL) => {
      const u = url.toString()
      if (u === 'https://bridge.example.com/feed')
        return Promise.resolve(mockResponse(rssXml, { headers: { 'content-type': 'application/rss+xml' } }))
      return Promise.resolve(mockResponse(html))
    })

    await fetchSingleFeed(feed)

    const article = getArticleByUrl('https://example.com/bridge-1')
    expect(article).toBeDefined()
    expect(article!.title).toBe('Bridge Article')
  })

  it('records error when both rss_url and rss_bridge_url are null', async () => {
    const feed = seedFeed({ rss_url: null, rss_bridge_url: null })

    await fetchSingleFeed(feed)

    const updatedFeed = getFeedById(feed.id)
    expect(updatedFeed!.last_error).toContain('No RSS URL')
  })

  it('falls back to fast-xml-parser for RSS 2.0 when feedsmith fails', async () => {
    feedsmithShouldFail = true
    const feed = seedFeed()
    const manualRss = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <title>Test</title>
    <item>
      <title>FXP Article</title>
      <link>https://example.com/fxp-1</link>
      <pubDate>Mon, 01 Jan 2024 12:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`
    const html = articleHtml()

    mockFetch.mockImplementation((url: string | URL) => {
      const u = url.toString()
      if (u === feed.rss_url)
        return Promise.resolve(mockResponse(manualRss, { headers: { 'content-type': 'application/rss+xml' } }))
      return Promise.resolve(mockResponse(html))
    })

    await fetchSingleFeed(feed)

    const article = getArticleByUrl('https://example.com/fxp-1')
    expect(article).toBeDefined()
    expect(article!.title).toBe('FXP Article')
  })

  it('falls back to fast-xml-parser for Atom when feedsmith fails', async () => {
    feedsmithShouldFail = true
    const feed = seedFeed()
    const manualAtom = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom Blog</title>
  <entry>
    <title>Atom Entry</title>
    <link rel="alternate" href="https://example.com/atom-fxp-1" />
    <published>2024-03-01T00:00:00Z</published>
  </entry>
</feed>`
    const html = articleHtml()

    mockFetch.mockImplementation((url: string | URL) => {
      const u = url.toString()
      if (u === feed.rss_url)
        return Promise.resolve(mockResponse(manualAtom, { headers: { 'content-type': 'application/atom+xml' } }))
      return Promise.resolve(mockResponse(html))
    })

    await fetchSingleFeed(feed)

    const article = getArticleByUrl('https://example.com/atom-fxp-1')
    expect(article).toBeDefined()
    expect(article!.title).toBe('Atom Entry')
  })

  it('fast-xml-parser handles single RSS item (non-array)', async () => {
    feedsmithShouldFail = true
    const feed = seedFeed()
    const singleItemRss = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <title>Test</title>
    <item>
      <title>Single Item</title>
      <link>https://example.com/single</link>
    </item>
  </channel>
</rss>`
    const html = articleHtml()

    mockFetch.mockImplementation((url: string | URL) => {
      const u = url.toString()
      if (u === feed.rss_url)
        return Promise.resolve(mockResponse(singleItemRss, { headers: { 'content-type': 'application/rss+xml' } }))
      return Promise.resolve(mockResponse(html))
    })

    await fetchSingleFeed(feed)

    const article = getArticleByUrl('https://example.com/single')
    expect(article).toBeDefined()
    expect(article!.title).toBe('Single Item')
  })

  it('fast-xml-parser Atom: selects rel=alternate from link array', async () => {
    feedsmithShouldFail = true
    const feed = seedFeed()
    const atomWithLinks = `<?xml version="1.0"?>
<feed>
  <title>Multi Link</title>
  <entry>
    <title>Multi Link Entry</title>
    <link rel="self" href="https://example.com/self" />
    <link rel="alternate" href="https://example.com/alt" />
    <id>urn:uuid:123</id>
  </entry>
</feed>`
    const html = articleHtml()

    mockFetch.mockImplementation((url: string | URL) => {
      const u = url.toString()
      if (u === feed.rss_url)
        return Promise.resolve(mockResponse(atomWithLinks, { headers: { 'content-type': 'application/atom+xml' } }))
      return Promise.resolve(mockResponse(html))
    })

    await fetchSingleFeed(feed)

    const article = getArticleByUrl('https://example.com/alt')
    expect(article).toBeDefined()
    expect(article!.title).toBe('Multi Link Entry')
  })

  it('rss_bridge_url with zero new articles logs correctly', async () => {
    const feed = seedFeed({
      rss_url: null,
      rss_bridge_url: 'https://bridge.example.com/feed',
    })

    // Pre-insert the article
    insertArticle({
      feed_id: feed.id,
      title: 'Existing',
      url: 'https://example.com/existing',
      published_at: '2024-01-01T00:00:00Z',
    })

    const rssXml = rss20Xml('Test', [
      { title: 'Existing', link: 'https://example.com/existing' },
    ])

    mockFetch.mockImplementation((url: string | URL) => {
      const u = url.toString()
      if (u === 'https://bridge.example.com/feed')
        return Promise.resolve(mockResponse(rssXml, { headers: { 'content-type': 'application/rss+xml' } }))
      return Promise.resolve(mockResponse('', { status: 404 }))
    })

    // Should complete without error
    await expect(fetchSingleFeed(feed)).resolves.toBeUndefined()
  })

  it('fast-xml-parser RSS 2.0: uses guid when link is missing', async () => {
    feedsmithShouldFail = true
    const feed = seedFeed()
    const rssXml = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <title>Test</title>
    <item>
      <title>Guid Only</title>
      <guid>https://example.com/guid-only</guid>
    </item>
  </channel>
</rss>`
    const html = articleHtml()

    mockFetch.mockImplementation((url: string | URL) => {
      const u = url.toString()
      if (u === feed.rss_url)
        return Promise.resolve(mockResponse(rssXml, { headers: { 'content-type': 'application/rss+xml' } }))
      return Promise.resolve(mockResponse(html))
    })

    await fetchSingleFeed(feed)

    const article = getArticleByUrl('https://example.com/guid-only')
    expect(article).toBeDefined()
    expect(article!.title).toBe('Guid Only')
  })

  it('fast-xml-parser Atom: multiple entries (array path)', async () => {
    feedsmithShouldFail = true
    const feed = seedFeed()
    const atomXmlMulti = `<?xml version="1.0"?>
<feed>
  <title>Multi</title>
  <entry>
    <title>Entry A</title>
    <link rel="alternate" href="https://example.com/a" />
  </entry>
  <entry>
    <title>Entry B</title>
    <link rel="alternate" href="https://example.com/b" />
  </entry>
</feed>`
    const html = articleHtml()

    mockFetch.mockImplementation((url: string | URL) => {
      const u = url.toString()
      if (u === feed.rss_url)
        return Promise.resolve(mockResponse(atomXmlMulti, { headers: { 'content-type': 'application/atom+xml' } }))
      return Promise.resolve(mockResponse(html))
    })

    await fetchSingleFeed(feed)

    expect(getArticleByUrl('https://example.com/a')).toBeDefined()
    expect(getArticleByUrl('https://example.com/b')).toBeDefined()
  })

  it('fast-xml-parser Atom: single link (non-array) with href', async () => {
    feedsmithShouldFail = true
    const feed = seedFeed()
    const atomSingleLink = `<?xml version="1.0"?>
<feed>
  <title>Single</title>
  <entry>
    <title>Single Link</title>
    <link href="https://example.com/single-link" />
  </entry>
</feed>`
    const html = articleHtml()

    mockFetch.mockImplementation((url: string | URL) => {
      const u = url.toString()
      if (u === feed.rss_url)
        return Promise.resolve(mockResponse(atomSingleLink, { headers: { 'content-type': 'application/atom+xml' } }))
      return Promise.resolve(mockResponse(html))
    })

    await fetchSingleFeed(feed)

    const article = getArticleByUrl('https://example.com/single-link')
    expect(article).toBeDefined()
  })

  it('fast-xml-parser Atom: entry uses id when no link', async () => {
    feedsmithShouldFail = true
    const feed = seedFeed()
    const atomIdOnly = `<?xml version="1.0"?>
<feed>
  <title>ID Only</title>
  <entry>
    <title>ID Entry</title>
    <id>https://example.com/id-entry</id>
  </entry>
</feed>`
    const html = articleHtml()

    mockFetch.mockImplementation((url: string | URL) => {
      const u = url.toString()
      if (u === feed.rss_url)
        return Promise.resolve(mockResponse(atomIdOnly, { headers: { 'content-type': 'application/atom+xml' } }))
      return Promise.resolve(mockResponse(html))
    })

    await fetchSingleFeed(feed)

    const article = getArticleByUrl('https://example.com/id-entry')
    expect(article).toBeDefined()
  })

  it('feedsmith returns empty items — falls through to fast-xml-parser', async () => {
    const feed = seedFeed()
    const rssXml = rss20Xml('Test', [
      { title: 'Fallthrough', link: 'https://example.com/ft' },
    ])
    const html = articleHtml()

    mockFetch.mockImplementation((url: string | URL) => {
      const u = url.toString()
      if (u === feed.rss_url)
        return Promise.resolve(mockResponse(rssXml, { headers: { 'content-type': 'application/rss+xml' } }))
      return Promise.resolve(mockResponse(html))
    })

    await fetchSingleFeed(feed)

    const article = getArticleByUrl('https://example.com/ft')
    expect(article).toBeDefined()
  })

  it('feedsmith returns valid items with url field', async () => {
    feedsmithOverride = {
      items: [
        { title: 'FS Article', url: 'https://example.com/fs-url', published: '2024-01-15T00:00:00Z' },
      ],
    }
    const feed = seedFeed()
    const html = articleHtml()

    mockFetch.mockImplementation((url: string | URL) => {
      const u = url.toString()
      if (u === feed.rss_url)
        return Promise.resolve(mockResponse('<rss/>', { headers: { 'content-type': 'application/rss+xml' } }))
      return Promise.resolve(mockResponse(html))
    })

    await fetchSingleFeed(feed)

    const article = getArticleByUrl('https://example.com/fs-url')
    expect(article).toBeDefined()
    expect(article!.title).toBe('FS Article')
  })

  it('feedsmith returns valid items with link field (no url)', async () => {
    feedsmithOverride = {
      items: [
        { title: 'FS Link', link: 'https://example.com/fs-link', updated: '2024-02-01T00:00:00Z' },
      ],
    }
    const feed = seedFeed()
    const html = articleHtml()

    mockFetch.mockImplementation((url: string | URL) => {
      const u = url.toString()
      if (u === feed.rss_url)
        return Promise.resolve(mockResponse('<rss/>', { headers: { 'content-type': 'application/rss+xml' } }))
      return Promise.resolve(mockResponse(html))
    })

    await fetchSingleFeed(feed)

    const article = getArticleByUrl('https://example.com/fs-link')
    expect(article).toBeDefined()
  })

  it('feedsmith returns valid items with id field (no url/link)', async () => {
    feedsmithOverride = {
      items: [
        { title: 'FS ID', id: 'https://example.com/fs-id', date: '2024-03-01' },
      ],
    }
    const feed = seedFeed()
    const html = articleHtml()

    mockFetch.mockImplementation((url: string | URL) => {
      const u = url.toString()
      if (u === feed.rss_url)
        return Promise.resolve(mockResponse('<rss/>', { headers: { 'content-type': 'application/rss+xml' } }))
      return Promise.resolve(mockResponse(html))
    })

    await fetchSingleFeed(feed)

    const article = getArticleByUrl('https://example.com/fs-id')
    expect(article).toBeDefined()
  })

  it('feedsmith returns items with no title — uses Untitled', async () => {
    feedsmithOverride = {
      items: [
        { url: 'https://example.com/fs-untitled' },
      ],
    }
    const feed = seedFeed()
    const html = articleHtml()

    mockFetch.mockImplementation((url: string | URL) => {
      const u = url.toString()
      if (u === feed.rss_url)
        return Promise.resolve(mockResponse('<rss/>', { headers: { 'content-type': 'application/rss+xml' } }))
      return Promise.resolve(mockResponse(html))
    })

    await fetchSingleFeed(feed)

    const article = getArticleByUrl('https://example.com/fs-untitled')
    expect(article).toBeDefined()
    expect(article!.title).toBe('Untitled')
  })

  it('feedsmith filters items without url/link/id', async () => {
    feedsmithOverride = {
      items: [
        { title: 'No URL' }, // Should be filtered out
        { title: 'Has URL', url: 'https://example.com/fs-has-url' },
      ],
    }
    const feed = seedFeed()
    const html = articleHtml()

    mockFetch.mockImplementation((url: string | URL) => {
      const u = url.toString()
      if (u === feed.rss_url)
        return Promise.resolve(mockResponse('<rss/>', { headers: { 'content-type': 'application/rss+xml' } }))
      return Promise.resolve(mockResponse(html))
    })

    await fetchSingleFeed(feed)

    // Only the item with URL should be inserted
    const article = getArticleByUrl('https://example.com/fs-has-url')
    expect(article).toBeDefined()
    const { getDb } = await import('./db.js')
    const count = getDb().prepare('SELECT COUNT(*) AS cnt FROM articles WHERE feed_id = ?').get(feed.id) as { cnt: number }
    expect(count.cnt).toBe(1)
  })
})

// ==========================================================================
// fetchSingleFeed — content extraction branches
// ==========================================================================

describe('fetchSingleFeed — content extraction', () => {
  let fetchSingleFeed: typeof import('./fetcher.js').fetchSingleFeed

  beforeEach(async () => {
    const mod = await import('./fetcher.js')
    fetchSingleFeed = mod.fetchSingleFeed
  })

  it('converts <picture> to plain <img> markdown with resolved absolute URL', async () => {
    const feed = seedFeed()
    const rssXml = rss20Xml('Test', [
      { title: 'Pic', link: 'https://example.com/pic' },
    ])
    const body = `
      <picture>
        <source srcset="/images/hero-sm.jpg 480w, /images/hero-lg.jpg 1024w" />
        <img src="/images/hero.jpg" alt="hero" />
      </picture>
    ` + Array(10).fill('<p>This is a paragraph of article content that is long enough for Readability to consider it meaningful text. It contains multiple sentences and provides substantial content for extraction.</p>').join('\n')
    const html = articleHtml({ body })

    mockFetch.mockImplementation((url: string | URL) => {
      const u = url.toString()
      if (u === feed.rss_url) return Promise.resolve(mockResponse(rssXml, { headers: { 'content-type': 'application/rss+xml' } }))
      return Promise.resolve(mockResponse(html))
    })

    await fetchSingleFeed(feed)

    const { getDb } = await import('./db.js')
    const row = getDb().prepare('SELECT full_text FROM articles WHERE url = ?').get('https://example.com/pic') as { full_text: string }
    expect(row.full_text).toBeTruthy()
    // <picture> should be replaced with a simple markdown image
    expect(row.full_text).toContain('https://example.com/images/hero.jpg')
    expect(row.full_text).not.toContain('<picture>')
    expect(row.full_text).not.toContain('<source')
  })

  it('uses srcset when <img> has no src attribute', async () => {
    const feed = seedFeed()
    const rssXml = rss20Xml('Test', [
      { title: 'NoSrc', link: 'https://example.com/nosrc' },
    ])
    const body = `
      <picture>
        <img srcset="/images/hero-1x.jpg 1x, /images/hero-2x.jpg 2x" alt="responsive" />
      </picture>
    ` + Array(10).fill('<p>This is a paragraph of article content that is long enough for Readability to consider it meaningful text. It contains multiple sentences and provides substantial content for extraction.</p>').join('\n')
    const html = articleHtml({ body })

    mockFetch.mockImplementation((url: string | URL) => {
      const u = url.toString()
      if (u === feed.rss_url) return Promise.resolve(mockResponse(rssXml, { headers: { 'content-type': 'application/rss+xml' } }))
      return Promise.resolve(mockResponse(html))
    })

    await fetchSingleFeed(feed)

    const { getDb } = await import('./db.js')
    const row = getDb().prepare('SELECT full_text FROM articles WHERE url = ?').get('https://example.com/nosrc') as { full_text: string }
    expect(row.full_text).toBeTruthy()
    // Should fall back to first srcset URL
    expect(row.full_text).toContain('https://example.com/images/hero-1x.jpg')
    expect(row.full_text).not.toContain('<picture>')
  })

  it('uses <source> srcset when <picture> has no <img>', async () => {
    const feed = seedFeed()
    const rssXml = rss20Xml('Test', [
      { title: 'NoImg', link: 'https://example.com/noimg' },
    ])
    const body = `
      <picture>
        <source srcset="/images/fallback.webp 800w" type="image/webp" />
      </picture>
    ` + Array(10).fill('<p>This is a paragraph of article content that is long enough for Readability to consider it meaningful text. It contains multiple sentences and provides substantial content for extraction.</p>').join('\n')
    const html = articleHtml({ body })

    mockFetch.mockImplementation((url: string | URL) => {
      const u = url.toString()
      if (u === feed.rss_url) return Promise.resolve(mockResponse(rssXml, { headers: { 'content-type': 'application/rss+xml' } }))
      return Promise.resolve(mockResponse(html))
    })

    await fetchSingleFeed(feed)

    const { getDb } = await import('./db.js')
    const row = getDb().prepare('SELECT full_text FROM articles WHERE url = ?').get('https://example.com/noimg') as { full_text: string }
    expect(row.full_text).toBeTruthy()
    // Should extract URL from <source> srcset
    expect(row.full_text).toContain('https://example.com/images/fallback.webp')
    expect(row.full_text).not.toContain('<picture>')
  })

  it('resolves relative og:image to absolute URL', async () => {
    const feed = seedFeed()
    const rssXml = rss20Xml('Test', [
      { title: 'OG Rel', link: 'https://example.com/og-rel' },
    ])
    const html = articleHtml({ ogImage: '/images/og.jpg' })

    mockFetch.mockImplementation((url: string | URL) => {
      const u = url.toString()
      if (u === feed.rss_url) return Promise.resolve(mockResponse(rssXml, { headers: { 'content-type': 'application/rss+xml' } }))
      return Promise.resolve(mockResponse(html))
    })

    await fetchSingleFeed(feed)

    const article = getArticleByUrl('https://example.com/og-rel')
    expect(article).toBeDefined()
    expect(article!.og_image).toBe('https://example.com/images/og.jpg')
  })

  it('records last_error when Readability fails to extract content', async () => {
    const feed = seedFeed()
    const rssXml = rss20Xml('Test', [
      { title: 'Empty', link: 'https://example.com/empty' },
    ])
    // Truly empty page - no meaningful text at all
    const emptyHtml = `<!DOCTYPE html><html><head><title>Empty</title></head><body></body></html>`

    mockFetch.mockImplementation((url: string | URL) => {
      const u = url.toString()
      if (u === feed.rss_url) return Promise.resolve(mockResponse(rssXml, { headers: { 'content-type': 'application/rss+xml' } }))
      if (u === 'https://example.com/empty') return Promise.resolve(mockResponse(emptyHtml))
      return Promise.resolve(mockResponse('', { status: 404 }))
    })

    await fetchSingleFeed(feed)

    const { getDb } = await import('./db.js')
    const row = getDb().prepare('SELECT last_error, full_text FROM articles WHERE url = ?').get('https://example.com/empty') as { last_error: string | null; full_text: string | null }
    expect(row.last_error).toBeTruthy()
    expect(row.full_text).toBeNull()
  })

  it('density analysis overrides Readability when bestBlock is significantly longer', async () => {
    const feed = seedFeed()
    const rssXml = rss20Xml('Test', [
      { title: 'Dense', link: 'https://example.com/dense' },
    ])

    // Create HTML where the main article div has far more paragraph content
    // than what Readability might extract (simulating Readability picking sidebar)
    const longParagraphs = Array(20).fill(
      '<p>This is a very long paragraph with substantial article content that provides real meaningful information to the reader. It discusses important topics and contains multiple sentences with detailed explanations about the subject matter at hand. The content is rich and informative.</p>'
    ).join('\n')

    // The article tag has minimal content (what Readability might pick)
    // while a div has the real dense content
    const body = `
      <article><p>Short sidebar content</p></article>
      <div class="main-content">${longParagraphs}</div>
    `
    const html = `<!DOCTYPE html>
<html>
<head><title>Dense</title></head>
<body>${body}</body>
</html>`

    mockFetch.mockImplementation((url: string | URL) => {
      const u = url.toString()
      if (u === feed.rss_url) return Promise.resolve(mockResponse(rssXml, { headers: { 'content-type': 'application/rss+xml' } }))
      if (u === 'https://example.com/dense') return Promise.resolve(mockResponse(html))
      return Promise.resolve(mockResponse('', { status: 404 }))
    })

    await fetchSingleFeed(feed)

    const { getDb } = await import('./db.js')
    const row = getDb().prepare('SELECT full_text FROM articles WHERE url = ?').get('https://example.com/dense') as { full_text: string | null }
    // The extracted text should contain content from the dense div, not the short article
    expect(row.full_text).toBeTruthy()
    expect(row.full_text!.length).toBeGreaterThan(100)
  })

  it('skips elements with high link density (linkRatio > 0.4)', async () => {
    const feed = seedFeed()
    const rssXml = rss20Xml('Test', [
      { title: 'Links', link: 'https://example.com/links' },
    ])

    // Create HTML with a nav-heavy section AND a proper article section
    const articleContent = Array(15).fill(
      '<p>This is genuine article content with substantial text for the reader. It contains meaningful paragraphs about important topics.</p>'
    ).join('\n')

    const navContent = Array(10).fill(
      '<p><a href="/page1">Link text that is quite long to make up density</a> <a href="/page2">Another long link</a></p>'
    ).join('\n')

    const html = `<!DOCTYPE html>
<html>
<head><title>Links</title></head>
<body>
  <nav><div>${navContent}</div></nav>
  <main><div class="article">${articleContent}</div></main>
</body>
</html>`

    mockFetch.mockImplementation((url: string | URL) => {
      const u = url.toString()
      if (u === feed.rss_url) return Promise.resolve(mockResponse(rssXml, { headers: { 'content-type': 'application/rss+xml' } }))
      if (u === 'https://example.com/links') return Promise.resolve(mockResponse(html))
      return Promise.resolve(mockResponse('', { status: 404 }))
    })

    await fetchSingleFeed(feed)

    const { getDb } = await import('./db.js')
    const row = getDb().prepare('SELECT full_text FROM articles WHERE url = ?').get('https://example.com/links') as { full_text: string | null }
    expect(row.full_text).toBeTruthy()
    // Full text should contain article content, not nav links
    expect(row.full_text).toContain('genuine article content')
  })

  it('non-Error thrown in processArticle is stringified', async () => {
    const feed = seedFeed()
    const rssXml = rss20Xml('Test', [
      { title: 'Err', link: 'https://example.com/err' },
    ])

    // fetch for article throws a string (not an Error)
    mockFetch.mockImplementation((url: string | URL) => {
      const u = url.toString()
      if (u === feed.rss_url) return Promise.resolve(mockResponse(rssXml, { headers: { 'content-type': 'application/rss+xml' } }))
      if (u === 'https://example.com/err') return Promise.reject('string rejection')
      return Promise.resolve(mockResponse('', { status: 404 }))
    })

    await fetchSingleFeed(feed)

    const { getDb } = await import('./db.js')
    const row = getDb().prepare('SELECT last_error FROM articles WHERE url = ?').get('https://example.com/err') as { last_error: string }
    expect(row.last_error).toContain('string rejection')
  })
})

// ==========================================================================
// discoverRssUrl — additional branches
// ==========================================================================

describe('discoverRssUrl — additional branches', () => {
  let discoverRssUrl: typeof import('./fetcher.js').discoverRssUrl

  beforeEach(async () => {
    const mod = await import('./fetcher.js')
    discoverRssUrl = mod.discoverRssUrl
  })

  it('falls back to path probing when page fetch throws', async () => {
    mockFetch.mockImplementation((url: string | URL, init?: RequestInit) => {
      const u = url.toString()
      // Page fetch throws (network error)
      if (u === 'https://blog.example.com/') return Promise.reject(new Error('Network error'))
      // Path probe for /feed succeeds
      if (u === 'https://blog.example.com/feed' && init?.method === 'HEAD') {
        return Promise.resolve(mockResponse('', { status: 200, headers: { 'content-type': 'application/rss+xml' } }))
      }
      // Feed title fetch
      if (u === 'https://blog.example.com/feed' && !init?.method) {
        return Promise.resolve(mockResponse(rss20Xml('Probed Feed', []), { headers: { 'content-type': 'application/rss+xml' } }))
      }
      return Promise.resolve(mockResponse('', { status: 404 }))
    })

    const result = await discoverRssUrl('https://blog.example.com/')
    expect(result.rssUrl).toBe('https://blog.example.com/feed')
    expect(result.title).toBe('Probed Feed')
  })

  it('fetchFeedTitle returns null on HTTP error → uses page title', async () => {
    const blogHtml = htmlWithRssLink('/feed.xml', 'My Blog Title')

    mockFetch.mockImplementation((url: string | URL) => {
      const u = url.toString()
      if (u === 'https://blog.example.com/') return Promise.resolve(mockResponse(blogHtml))
      // Feed title fetch returns 404
      if (u === 'https://blog.example.com/feed.xml') return Promise.resolve(mockResponse('', { status: 404 }))
      return Promise.resolve(mockResponse('', { status: 404 }))
    })

    const result = await discoverRssUrl('https://blog.example.com/')
    expect(result.rssUrl).toBe('https://blog.example.com/feed.xml')
    // Falls back to page title
    expect(result.title).toBe('My Blog Title')
  })

  it('fetchFeedTitle extracts Atom feed title', async () => {
    const blogHtml = htmlWithRssLink('/atom.xml', 'Page Title')
    const atomFeed = atomXml('Atom Feed Title', [])

    mockFetch.mockImplementation((url: string | URL) => {
      const u = url.toString()
      if (u === 'https://blog.example.com/') return Promise.resolve(mockResponse(blogHtml))
      if (u === 'https://blog.example.com/atom.xml')
        return Promise.resolve(mockResponse(atomFeed, { headers: { 'content-type': 'application/atom+xml' } }))
      return Promise.resolve(mockResponse('', { status: 404 }))
    })

    const result = await discoverRssUrl('https://blog.example.com/')
    expect(result.rssUrl).toBe('https://blog.example.com/atom.xml')
    expect(result.title).toBe('Atom Feed Title')
  })

  it('fetchFeedTitle returns null on network error', async () => {
    const blogHtml = htmlWithRssLink('/feed.xml', 'Blog Title')

    mockFetch.mockImplementation((url: string | URL) => {
      const u = url.toString()
      if (u === 'https://blog.example.com/') return Promise.resolve(mockResponse(blogHtml))
      // Feed fetch throws network error
      if (u === 'https://blog.example.com/feed.xml') return Promise.reject(new Error('ECONNREFUSED'))
      return Promise.resolve(mockResponse('', { status: 404 }))
    })

    const result = await discoverRssUrl('https://blog.example.com/')
    expect(result.rssUrl).toBe('https://blog.example.com/feed.xml')
    // Falls back to page title since fetchFeedTitle returns null
    expect(result.title).toBe('Blog Title')
  })

  it('fetchFeedTitle: feedsmith fails → fast-xml-parser RSS 2.0 title', async () => {
    feedsmithShouldFail = true
    const blogHtml = htmlWithRssLink('/feed.xml', 'Page Title')
    const rssXml = rss20Xml('RSS Channel Title', [])

    mockFetch.mockImplementation((url: string | URL) => {
      const u = url.toString()
      if (u === 'https://blog.example.com/') return Promise.resolve(mockResponse(blogHtml))
      if (u === 'https://blog.example.com/feed.xml')
        return Promise.resolve(mockResponse(rssXml, { headers: { 'content-type': 'application/rss+xml' } }))
      return Promise.resolve(mockResponse('', { status: 404 }))
    })

    const result = await discoverRssUrl('https://blog.example.com/')
    expect(result.rssUrl).toBe('https://blog.example.com/feed.xml')
    expect(result.title).toBe('RSS Channel Title')
  })

  it('fetchFeedTitle: feedsmith fails → fast-xml-parser Atom title', async () => {
    feedsmithShouldFail = true
    const blogHtml = htmlWithRssLink('/atom.xml', 'Page Title')
    const feedXml = `<?xml version="1.0"?>
<feed>
  <title>Atom Title via FXP</title>
</feed>`

    mockFetch.mockImplementation((url: string | URL) => {
      const u = url.toString()
      if (u === 'https://blog.example.com/') return Promise.resolve(mockResponse(blogHtml))
      if (u === 'https://blog.example.com/atom.xml')
        return Promise.resolve(mockResponse(feedXml, { headers: { 'content-type': 'application/atom+xml' } }))
      return Promise.resolve(mockResponse('', { status: 404 }))
    })

    const result = await discoverRssUrl('https://blog.example.com/')
    expect(result.rssUrl).toBe('https://blog.example.com/atom.xml')
    expect(result.title).toBe('Atom Title via FXP')
  })

  it('fetchFeedTitle: feedsmith fails + no RSS/Atom title → null', async () => {
    feedsmithShouldFail = true
    const blogHtml = htmlWithRssLink('/feed.xml', 'Page Title')
    // Feed XML with no title element
    const feedXml = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <item><title>No Title</title><link>https://example.com/x</link></item>
  </channel>
</rss>`

    mockFetch.mockImplementation((url: string | URL) => {
      const u = url.toString()
      if (u === 'https://blog.example.com/') return Promise.resolve(mockResponse(blogHtml))
      if (u === 'https://blog.example.com/feed.xml')
        return Promise.resolve(mockResponse(feedXml, { headers: { 'content-type': 'application/rss+xml' } }))
      return Promise.resolve(mockResponse('', { status: 404 }))
    })

    const result = await discoverRssUrl('https://blog.example.com/')
    expect(result.rssUrl).toBe('https://blog.example.com/feed.xml')
    // Falls back to page title
    expect(result.title).toBe('Page Title')
  })

  it('page returns non-OK status → falls back to path probing', async () => {
    mockFetch.mockImplementation((url: string | URL, init?: RequestInit) => {
      const u = url.toString()
      // Page returns 403 (not OK, but no throw)
      if (u === 'https://blog.example.com/') return Promise.resolve(mockResponse('Forbidden', { status: 403 }))
      // Path probe for /feed succeeds
      if (u === 'https://blog.example.com/feed' && init?.method === 'HEAD') {
        return Promise.resolve(mockResponse('', { status: 200, headers: { 'content-type': 'application/rss+xml' } }))
      }
      // Feed title fetch
      if (u === 'https://blog.example.com/feed') {
        return Promise.resolve(mockResponse(rss20Xml('Probed', []), { headers: { 'content-type': 'application/rss+xml' } }))
      }
      return Promise.resolve(mockResponse('', { status: 404 }))
    })

    const result = await discoverRssUrl('https://blog.example.com/')
    expect(result.rssUrl).toBe('https://blog.example.com/feed')
  })

  it('path probe returns OK but wrong content-type → skips', async () => {
    const blogHtml = htmlWithoutRss('My Blog')

    mockFetch.mockImplementation((url: string | URL, init?: RequestInit) => {
      const u = url.toString()
      if (u === 'https://blog.example.com/') return Promise.resolve(mockResponse(blogHtml))
      // All probes return 200 but with text/html content-type (not RSS)
      if (init?.method === 'HEAD') {
        return Promise.resolve(mockResponse('', { status: 200, headers: { 'content-type': 'text/html' } }))
      }
      return Promise.resolve(mockResponse('', { status: 404 }))
    })

    const result = await discoverRssUrl('https://blog.example.com/')
    expect(result.rssUrl).toBeNull()
  })
})

// ==========================================================================
// FlareSolverr integration
// ==========================================================================

describe('FlareSolverr — discoverRssUrl', () => {
  let discoverRssUrl: typeof import('./fetcher.js').discoverRssUrl

  beforeEach(async () => {
    const mod = await import('./fetcher.js')
    discoverRssUrl = mod.discoverRssUrl
  })

  it('falls back to FlareSolverr when page returns 403 and finds direct feed', async () => {
    const feedXml = rss20Xml('CF Protected Feed', [
      { title: 'Post 1', link: 'https://cf-blog.example.com/post-1' },
    ])

    mockFetch.mockImplementation((url: string | URL) => {
      const u = url.toString()
      if (u === 'https://cf-blog.example.com/feed.xml')
        return Promise.resolve(mockResponse('Forbidden', { status: 403 }))
      return Promise.resolve(mockResponse('', { status: 404 }))
    })

    mockFlareSolverr.mockResolvedValue({
      body: feedXml,
      contentType: 'application/xml',
    })

    const result = await discoverRssUrl('https://cf-blog.example.com/feed.xml')
    expect(result.rssUrl).toBe('https://cf-blog.example.com/feed.xml')
    expect(result.usedFlareSolverr).toBe(true)
  })

  it('falls back to FlareSolverr when page returns 403 and finds RSS link in HTML', async () => {
    const blogHtml = htmlWithRssLink('/feed.xml', 'CF Blog')
    const feedXml = rss20Xml('CF Blog Feed', [])

    mockFetch.mockImplementation((url: string | URL) => {
      const u = url.toString()
      if (u === 'https://cf-blog.example.com/')
        return Promise.resolve(mockResponse('Forbidden', { status: 403 }))
      if (u === 'https://cf-blog.example.com/feed.xml')
        return Promise.resolve(mockResponse(feedXml, { headers: { 'content-type': 'application/rss+xml' } }))
      return Promise.resolve(mockResponse('', { status: 404 }))
    })

    mockFlareSolverr.mockResolvedValue({
      body: blogHtml,
      contentType: 'text/html',
    })

    const result = await discoverRssUrl('https://cf-blog.example.com/')
    expect(result.rssUrl).toBe('https://cf-blog.example.com/feed.xml')
    expect(result.usedFlareSolverr).toBe(true)
  })

  it('usedFlareSolverr is false when FlareSolverr is not needed', async () => {
    const blogHtml = htmlWithRssLink('/feed.xml', 'Normal Blog')
    const feedXml = rss20Xml('Normal Feed', [])

    mockFetch.mockImplementation((url: string | URL) => {
      const u = url.toString()
      if (u === 'https://blog.example.com/') return Promise.resolve(mockResponse(blogHtml))
      if (u === 'https://blog.example.com/feed.xml')
        return Promise.resolve(mockResponse(feedXml, { headers: { 'content-type': 'application/rss+xml' } }))
      return Promise.resolve(mockResponse('', { status: 404 }))
    })

    const result = await discoverRssUrl('https://blog.example.com/')
    expect(result.rssUrl).toBe('https://blog.example.com/feed.xml')
    expect(result.usedFlareSolverr).toBe(false)
    expect(mockFlareSolverr).not.toHaveBeenCalled()
  })

  it('usedFlareSolverr is true even when FlareSolverr finds HTML without RSS (falls to RSS Bridge)', async () => {
    const htmlNoRss = htmlWithoutRss('CF Protected Blog')

    mockFetch.mockImplementation((url: string | URL) => {
      const u = url.toString()
      if (u === 'https://cf-blog.example.com/')
        return Promise.resolve(mockResponse('Forbidden', { status: 403 }))
      return Promise.resolve(mockResponse('', { status: 404 }))
    })

    mockFlareSolverr.mockResolvedValue({
      body: htmlNoRss,
      contentType: 'text/html',
    })

    const result = await discoverRssUrl('https://cf-blog.example.com/')
    expect(result.rssUrl).toBeNull()
    expect(result.usedFlareSolverr).toBe(true)
  })

  it('FlareSolverr failure does not set usedFlareSolverr', async () => {
    mockFetch.mockImplementation((url: string | URL) => {
      const u = url.toString()
      if (u === 'https://cf-blog.example.com/')
        return Promise.resolve(mockResponse('Forbidden', { status: 403 }))
      return Promise.resolve(mockResponse('', { status: 404 }))
    })

    mockFlareSolverr.mockResolvedValue(null)

    const result = await discoverRssUrl('https://cf-blog.example.com/')
    expect(result.rssUrl).toBeNull()
    expect(result.usedFlareSolverr).toBe(false)
  })

  it('calls onFlareSolverr callback during discovery', async () => {
    const feedXml = rss20Xml('CF Feed', [])

    mockFetch.mockImplementation(() =>
      Promise.resolve(mockResponse('Forbidden', { status: 403 })),
    )

    mockFlareSolverr.mockResolvedValue({
      body: feedXml,
      contentType: 'application/xml',
    })

    const onFlareSolverr = vi.fn()
    await discoverRssUrl('https://cf-blog.example.com/feed.xml', { onFlareSolverr })

    expect(onFlareSolverr).toHaveBeenCalledWith('running')
    expect(onFlareSolverr).toHaveBeenCalledWith('done', true)
  })
})

describe('FlareSolverr — fetchAndParseRss', () => {
  let fetchAndParseRss: typeof import('./fetcher/rss.js').fetchAndParseRss

  beforeEach(async () => {
    const mod = await import('./fetcher/rss.js')
    fetchAndParseRss = mod.fetchAndParseRss
  })

  it('uses FlareSolverr directly when requires_js_challenge is set', async () => {
    const feed = createFeed({ name: 'CF Feed', url: 'https://cf-blog.example.com/' })
    // Manually set rss_url and requires_js_challenge
    const { getDb } = await import('./db/connection.js')
    getDb().prepare('UPDATE feeds SET rss_url = ?, requires_js_challenge = 1 WHERE id = ?')
      .run('https://cf-blog.example.com/feed.xml', feed.id)

    const updatedFeed = { ...feed, rss_url: 'https://cf-blog.example.com/feed.xml', requires_js_challenge: 1 }

    const feedXml = rss20Xml('CF Feed', [
      { title: 'Article 1', link: 'https://cf-blog.example.com/article-1' },
    ])

    mockFlareSolverr.mockResolvedValue({ body: feedXml, contentType: 'application/xml' })

    const result = await fetchAndParseRss(updatedFeed)
    expect(result.items).toHaveLength(1)
    expect(result.items[0].title).toBe('Article 1')
    // Should not call global fetch for the RSS URL
    const fetchedUrls = mockFetch.mock.calls.map((c: unknown[]) => (c[0] as string).toString())
    expect(fetchedUrls).not.toContain('https://cf-blog.example.com/feed.xml')
  })

  it('falls back to FlareSolverr on 403 even without requires_js_challenge', async () => {
    const feed = createFeed({ name: 'CF Feed', url: 'https://cf-blog.example.com/' })
    const updatedFeed = { ...feed, rss_url: 'https://cf-blog.example.com/feed.xml', requires_js_challenge: 0 }

    const feedXml = rss20Xml('CF Feed', [
      { title: 'Article 1', link: 'https://cf-blog.example.com/article-1' },
    ])

    mockFetch.mockResolvedValue(mockResponse('Forbidden', { status: 403 }))
    mockFlareSolverr.mockResolvedValue({ body: feedXml, contentType: 'application/xml' })

    const result = await fetchAndParseRss(updatedFeed)
    expect(result.items).toHaveLength(1)
    expect(result.items[0].title).toBe('Article 1')
  })
})

describe('FlareSolverr — fetchFullText', () => {
  let fetchFullText: typeof import('./fetcher/content.js').fetchFullText

  beforeEach(async () => {
    const mod = await import('./fetcher/content.js')
    fetchFullText = mod.fetchFullText
  })

  it('uses FlareSolverr directly when requiresJsChallenge is true', async () => {
    const html = articleHtml({ title: 'CF Article' })

    mockFlareSolverr.mockResolvedValue({ body: html, contentType: 'text/html' })

    const result = await fetchFullText('https://cf-blog.example.com/post-1', { requiresJsChallenge: true })
    expect(result.fullText).toContain('paragraph of article content')
    // Should not call global fetch
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('falls back to FlareSolverr on 403 without requiresJsChallenge', async () => {
    const html = articleHtml({ title: 'CF Article' })

    mockFetch.mockResolvedValue(mockResponse('Forbidden', { status: 403 }))
    mockFlareSolverr.mockResolvedValue({ body: html, contentType: 'text/html' })

    const result = await fetchFullText('https://cf-blog.example.com/post-1')
    expect(result.fullText).toContain('paragraph of article content')
  })

  it('throws when FlareSolverr also fails', async () => {
    mockFetch.mockResolvedValue(mockResponse('Forbidden', { status: 403 }))
    mockFlareSolverr.mockResolvedValue(null)

    await expect(fetchFullText('https://cf-blog.example.com/post-1'))
      .rejects.toThrow('HTTP 403')
  })
})

// ==========================================================================
// streamSummarizeArticle / streamTranslateArticle
// ==========================================================================

describe('streamSummarizeArticle', () => {
  let streamSummarizeArticle: typeof import('./fetcher.js').streamSummarizeArticle

  beforeEach(async () => {
    const mod = await import('./fetcher.js')
    streamSummarizeArticle = mod.streamSummarizeArticle
  })

  it('streams text deltas and returns final message', async () => {
    const textHandler = vi.fn()

    // Create a mock stream object
    const handlers: Record<string, ((...args: unknown[]) => void)[]> = {}
    const mockStream = {
      on: (event: string, cb: (...args: unknown[]) => void) => {
        if (!handlers[event]) handlers[event] = []
        handlers[event].push(cb)
        return mockStream
      },
      finalMessage: () => Promise.resolve({
        content: [{ type: 'text', text: 'final summary text' }],
        usage: { input_tokens: 100, output_tokens: 50 },
      }),
    }
    mockMessagesStream.mockReturnValue(mockStream)

    const promise = streamSummarizeArticle('article text', textHandler)

    // Simulate text events
    handlers['text']?.forEach(h => h('chunk1'))
    handlers['text']?.forEach(h => h('chunk2'))

    const result = await promise

    expect(textHandler).toHaveBeenCalledWith('chunk1')
    expect(textHandler).toHaveBeenCalledWith('chunk2')
    expect(result.summary).toBe('final summary text')
    expect(result.inputTokens).toBe(100)
    expect(result.outputTokens).toBe(50)
  })

  it('throws on non-text response', async () => {
    const handlers: Record<string, ((...args: unknown[]) => void)[]> = {}
    const mockStream = {
      on: (event: string, cb: (...args: unknown[]) => void) => {
        if (!handlers[event]) handlers[event] = []
        handlers[event].push(cb)
        return mockStream
      },
      finalMessage: () => Promise.resolve({
        content: [{ type: 'tool_use', id: 'x', name: 'y', input: {} }],
        usage: { input_tokens: 10, output_tokens: 5 },
      }),
    }
    mockMessagesStream.mockReturnValue(mockStream)

    await expect(streamSummarizeArticle('text', vi.fn())).rejects.toThrow('Unexpected response type')
  })
})

describe('streamTranslateArticle', () => {
  let streamTranslateArticle: typeof import('./fetcher.js').streamTranslateArticle

  beforeEach(async () => {
    const mod = await import('./fetcher.js')
    streamTranslateArticle = mod.streamTranslateArticle
  })

  it('streams text deltas and returns translated text', async () => {
    const textHandler = vi.fn()

    const handlers: Record<string, ((...args: unknown[]) => void)[]> = {}
    const mockStream = {
      on: (event: string, cb: (...args: unknown[]) => void) => {
        if (!handlers[event]) handlers[event] = []
        handlers[event].push(cb)
        return mockStream
      },
      finalMessage: () => Promise.resolve({
        content: [{ type: 'text', text: '翻訳テキスト' }],
        usage: { input_tokens: 200, output_tokens: 150 },
      }),
    }
    mockMessagesStream.mockReturnValue(mockStream)

    const result = await streamTranslateArticle('English text', textHandler)

    expect(result.fullTextTranslated).toBe('翻訳テキスト')
    expect(result.inputTokens).toBe(200)
    expect(result.outputTokens).toBe(150)

    // Verify correct model is used
    expect(mockMessagesStream).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'claude-sonnet-4-6',
        max_tokens: 16384,
      }),
    )
  })

  it('throws on non-text response', async () => {
    const handlers: Record<string, ((...args: unknown[]) => void)[]> = {}
    const mockStream = {
      on: (event: string, cb: (...args: unknown[]) => void) => {
        if (!handlers[event]) handlers[event] = []
        handlers[event].push(cb)
        return mockStream
      },
      finalMessage: () => Promise.resolve({
        content: [{ type: 'tool_use', id: 'x', name: 'y', input: {} }],
        usage: { input_tokens: 10, output_tokens: 5 },
      }),
    }
    mockMessagesStream.mockReturnValue(mockStream)

    await expect(streamTranslateArticle('text', vi.fn())).rejects.toThrow('Unexpected response type')
  })
})

// ==========================================================================
// RSS 1.0 (RDF) and non-HTTP id regression
// ==========================================================================

describe('fetchSingleFeed — RSS 1.0 (RDF) support', () => {
  let fetchSingleFeed: typeof import('./fetcher.js').fetchSingleFeed

  beforeEach(async () => {
    const mod = await import('./fetcher.js')
    fetchSingleFeed = mod.fetchSingleFeed
  })

  it('parses RSS 1.0 (RDF) feed via fast-xml-parser fallback', async () => {
    feedsmithShouldFail = true
    const rdfXml = `<?xml version="1.0" encoding="UTF-8"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
         xmlns="http://purl.org/rss/1.0/"
         xmlns:dc="http://purl.org/dc/elements/1.1/">
  <item rdf:about="https://example.com/rdf-1">
    <title>RDF Article</title>
    <link>https://example.com/rdf-1</link>
    <dc:date>2024-03-01T00:00:00Z</dc:date>
  </item>
</rdf:RDF>`
    const feed = seedFeed()
    const html = articleHtml()

    mockFetch.mockImplementation((url: string | URL) => {
      const u = url.toString()
      if (u === feed.rss_url)
        return Promise.resolve(mockResponse(rdfXml, { headers: { 'content-type': 'application/rss+xml' } }))
      return Promise.resolve(mockResponse(html))
    })

    await fetchSingleFeed(feed)

    const article = getArticleByUrl('https://example.com/rdf-1')
    expect(article).toBeDefined()
    expect(article!.title).toBe('RDF Article')
  })

  it('parses RSS 1.0 (RDF) feed via feedsmith when items are under feed.items', async () => {
    feedsmithOverride = {
      feed: {
        items: [
          { title: 'RDF via feedsmith', url: 'https://example.com/rdf-fs', date: '2024-03-01' },
        ],
      },
    }
    const feed = seedFeed()
    const html = articleHtml()

    mockFetch.mockImplementation((url: string | URL) => {
      const u = url.toString()
      if (u === feed.rss_url)
        return Promise.resolve(mockResponse('<rss/>', { headers: { 'content-type': 'application/rss+xml' } }))
      return Promise.resolve(mockResponse(html))
    })

    await fetchSingleFeed(feed)

    const article = getArticleByUrl('https://example.com/rdf-fs')
    expect(article).toBeDefined()
  })

  it('feedsmith feed.entries path works', async () => {
    feedsmithOverride = {
      feed: {
        entries: [
          { title: 'Entry via feed.entries', url: 'https://example.com/feed-entry', date: '2024-03-01' },
        ],
      },
    }
    const feed = seedFeed()
    const html = articleHtml()

    mockFetch.mockImplementation((url: string | URL) => {
      const u = url.toString()
      if (u === feed.rss_url)
        return Promise.resolve(mockResponse('<rss/>', { headers: { 'content-type': 'application/rss+xml' } }))
      return Promise.resolve(mockResponse(html))
    })

    await fetchSingleFeed(feed)

    const article = getArticleByUrl('https://example.com/feed-entry')
    expect(article).toBeDefined()
  })
})

describe('fetchSingleFeed — non-HTTP id must not be used as URL', () => {
  let fetchSingleFeed: typeof import('./fetcher.js').fetchSingleFeed

  beforeEach(async () => {
    const mod = await import('./fetcher.js')
    fetchSingleFeed = mod.fetchSingleFeed
  })

  it('feedsmith: skips item when id is hatenablog:// and no url/link', async () => {
    feedsmithOverride = {
      feed: {
        entries: [
          { title: 'Bad ID', id: 'hatenablog://entry/12345' },
          { title: 'Good URL', url: 'https://example.com/good' },
        ],
      },
    }
    const feed = seedFeed()
    const html = articleHtml()

    mockFetch.mockImplementation((url: string | URL) => {
      const u = url.toString()
      if (u === feed.rss_url)
        return Promise.resolve(mockResponse('<rss/>', { headers: { 'content-type': 'application/rss+xml' } }))
      return Promise.resolve(mockResponse(html))
    })

    await fetchSingleFeed(feed)

    const { getDb } = await import('./db.js')
    const count = getDb().prepare('SELECT COUNT(*) AS cnt FROM articles WHERE feed_id = ?').get(feed.id) as { cnt: number }
    expect(count.cnt).toBe(1)
    const article = getArticleByUrl('https://example.com/good')
    expect(article).toBeDefined()
  })

  it('feedsmith: skips item when id is tag: URI and no url/link', async () => {
    feedsmithOverride = {
      feed: {
        entries: [
          { title: 'Tag ID', id: 'tag:blog.example.com,2024:entry://2024-01-01' },
          { title: 'Good URL', url: 'https://example.com/good2' },
        ],
      },
    }
    const feed = seedFeed()
    const html = articleHtml()

    mockFetch.mockImplementation((url: string | URL) => {
      const u = url.toString()
      if (u === feed.rss_url)
        return Promise.resolve(mockResponse('<rss/>', { headers: { 'content-type': 'application/rss+xml' } }))
      return Promise.resolve(mockResponse(html))
    })

    await fetchSingleFeed(feed)

    const { getDb } = await import('./db.js')
    const count = getDb().prepare('SELECT COUNT(*) AS cnt FROM articles WHERE feed_id = ?').get(feed.id) as { cnt: number }
    expect(count.cnt).toBe(1)
  })

  it('feedsmith: uses id when it starts with http', async () => {
    feedsmithOverride = {
      feed: {
        entries: [
          { title: 'HTTP ID', id: 'https://example.com/http-id' },
        ],
      },
    }
    const feed = seedFeed()
    const html = articleHtml()

    mockFetch.mockImplementation((url: string | URL) => {
      const u = url.toString()
      if (u === feed.rss_url)
        return Promise.resolve(mockResponse('<rss/>', { headers: { 'content-type': 'application/rss+xml' } }))
      return Promise.resolve(mockResponse(html))
    })

    await fetchSingleFeed(feed)

    const article = getArticleByUrl('https://example.com/http-id')
    expect(article).toBeDefined()
  })

  it('fast-xml-parser Atom: skips entry when id is non-HTTP and no link', async () => {
    feedsmithShouldFail = true
    const atomXmlWithBadId = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Test</title>
  <entry>
    <title>Bad Entry</title>
    <id>hatenablog://entry/99999</id>
  </entry>
  <entry>
    <title>Good Entry</title>
    <link rel="alternate" href="https://example.com/good-atom" />
    <id>hatenablog://entry/88888</id>
  </entry>
</feed>`
    const feed = seedFeed()
    const html = articleHtml()

    mockFetch.mockImplementation((url: string | URL) => {
      const u = url.toString()
      if (u === feed.rss_url)
        return Promise.resolve(mockResponse(atomXmlWithBadId, { headers: { 'content-type': 'application/atom+xml' } }))
      return Promise.resolve(mockResponse(html))
    })

    await fetchSingleFeed(feed)

    const { getDb } = await import('./db.js')
    const count = getDb().prepare('SELECT COUNT(*) AS cnt FROM articles WHERE feed_id = ?').get(feed.id) as { cnt: number }
    expect(count.cnt).toBe(1)
    const article = getArticleByUrl('https://example.com/good-atom')
    expect(article).toBeDefined()
  })
})

describe('fetchSingleFeed — Atom link vs id URL preference', () => {
  let fetchSingleFeed: typeof import('./fetcher.js').fetchSingleFeed

  beforeEach(async () => {
    const mod = await import('./fetcher.js')
    fetchSingleFeed = mod.fetchSingleFeed
  })

  it('feedsmith: prefers links[].href over id when both are present', async () => {
    feedsmithOverride = {
      items: [
        {
          title: 'Link vs ID',
          links: [{ href: 'https://example.com/post.html', rel: 'alternate' }],
          id: 'https://example.com/post',
          published: '2024-01-15T00:00:00Z',
        },
      ],
    }
    const feed = seedFeed()
    const html = articleHtml()

    mockFetch.mockImplementation((url: string | URL) => {
      const u = url.toString()
      if (u === feed.rss_url)
        return Promise.resolve(mockResponse('<rss/>', { headers: { 'content-type': 'application/rss+xml' } }))
      return Promise.resolve(mockResponse(html))
    })

    await fetchSingleFeed(feed)

    const articleByLink = getArticleByUrl('https://example.com/post.html')
    expect(articleByLink).toBeDefined()
    const articleById = getArticleByUrl('https://example.com/post')
    expect(articleById).toBeUndefined()
  })

  it('feedsmith: uses id as fallback when links[] is empty', async () => {
    feedsmithOverride = {
      items: [
        {
          title: 'ID Only',
          links: [],
          id: 'https://example.com/id-only',
          published: '2024-01-15T00:00:00Z',
        },
      ],
    }
    const feed = seedFeed()
    const html = articleHtml()

    mockFetch.mockImplementation((url: string | URL) => {
      const u = url.toString()
      if (u === feed.rss_url)
        return Promise.resolve(mockResponse('<rss/>', { headers: { 'content-type': 'application/rss+xml' } }))
      return Promise.resolve(mockResponse(html))
    })

    await fetchSingleFeed(feed)

    const article = getArticleByUrl('https://example.com/id-only')
    expect(article).toBeDefined()
  })

  it('feedsmith: prefers rel=alternate link over other links', async () => {
    feedsmithOverride = {
      items: [
        {
          title: 'Multi Links',
          links: [
            { href: 'https://example.com/self', rel: 'self' },
            { href: 'https://example.com/alternate.html', rel: 'alternate' },
          ],
          id: 'https://example.com/id',
          published: '2024-01-15T00:00:00Z',
        },
      ],
    }
    const feed = seedFeed()
    const html = articleHtml()

    mockFetch.mockImplementation((url: string | URL) => {
      const u = url.toString()
      if (u === feed.rss_url)
        return Promise.resolve(mockResponse('<rss/>', { headers: { 'content-type': 'application/rss+xml' } }))
      return Promise.resolve(mockResponse(html))
    })

    await fetchSingleFeed(feed)

    const article = getArticleByUrl('https://example.com/alternate.html')
    expect(article).toBeDefined()
  })

  it('fast-xml-parser Atom: prefers link href over id when both present', async () => {
    feedsmithShouldFail = true
    const feed = seedFeed()
    const atomWithBoth = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Test</title>
  <entry>
    <title>Both Link and ID</title>
    <link rel="alternate" href="https://example.com/entry.html" />
    <id>https://example.com/entry</id>
    <published>2024-01-15T00:00:00Z</published>
  </entry>
</feed>`
    const html = articleHtml()

    mockFetch.mockImplementation((url: string | URL) => {
      const u = url.toString()
      if (u === feed.rss_url)
        return Promise.resolve(mockResponse(atomWithBoth, { headers: { 'content-type': 'application/atom+xml' } }))
      return Promise.resolve(mockResponse(html))
    })

    await fetchSingleFeed(feed)

    const articleByLink = getArticleByUrl('https://example.com/entry.html')
    expect(articleByLink).toBeDefined()
    const articleById = getArticleByUrl('https://example.com/entry')
    expect(articleById).toBeUndefined()
  })

  it('real-world Jekyll Atom: link.html is used, not bare id', async () => {
    // Simulates the exact structure from Jekyll GitHub Pages feeds
    // where <link> has .html but <id> does not
    const jekyllAtom = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>My Blog</title>
  <entry>
    <title>My Post</title>
    <link href="https://blog.example.com/2024/01/15/my-post.html" rel="alternate" type="text/html" title="My Post" />
    <published>2024-01-15T00:00:00+00:00</published>
    <updated>2024-01-15T00:00:00+00:00</updated>
    <id>https://blog.example.com/2024/01/15/my-post</id>
    <content type="html"><![CDATA[<p>Hello world</p>]]></content>
    <summary type="html">Hello world</summary>
  </entry>
</feed>`
    const feed = seedFeed()
    const html = articleHtml()

    mockFetch.mockImplementation((url: string | URL) => {
      const u = url.toString()
      if (u === feed.rss_url)
        return Promise.resolve(mockResponse(jekyllAtom, { headers: { 'content-type': 'application/atom+xml' } }))
      return Promise.resolve(mockResponse(html))
    })

    await fetchSingleFeed(feed)

    // Must use .html URL from <link>, not bare URL from <id>
    const articleByLink = getArticleByUrl('https://blog.example.com/2024/01/15/my-post.html')
    expect(articleByLink).toBeDefined()
    const articleById = getArticleByUrl('https://blog.example.com/2024/01/15/my-post')
    expect(articleById).toBeUndefined()
  })
})

describe('fetchFeedTitle — feed.title fallback', () => {
  let discoverRssUrl: typeof import('./fetcher.js').discoverRssUrl

  beforeEach(async () => {
    const mod = await import('./fetcher.js')
    discoverRssUrl = mod.discoverRssUrl
  })

  it('feedsmith: reads title from feed.title when top-level title is missing', async () => {
    feedsmithOverride = {
      feed: { title: 'Nested Title' },
    }
    mockFetch.mockImplementation((url: string | URL) => {
      const u = url.toString()
      if (u === 'https://example.com/')
        return Promise.resolve(mockResponse('', { status: 200, headers: { 'content-type': 'application/atom+xml' } }))
      return Promise.resolve(mockResponse(''))
    })

    const result = await discoverRssUrl('https://example.com/')
    expect(result.title).toBe('Nested Title')
  })
})
