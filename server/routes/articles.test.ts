import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setupTestDb } from '../__tests__/helpers/testDb.js'
import { buildApp } from '../__tests__/helpers/buildApp.js'
import { createFeed, createCategory, insertArticle, markArticleSeen } from '../db.js'
import type { FastifyInstance } from 'fastify'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const { mockStreamSummarize, mockStreamTranslate } = vi.hoisted(() => ({
  mockStreamSummarize: vi.fn(),
  mockStreamTranslate: vi.fn(),
}))

vi.mock('../fetcher.js', async () => {
  const { EventEmitter } = await import('events')
  return {
    fetchAllFeeds: vi.fn(),
    fetchSingleFeed: vi.fn(),
    discoverRssUrl: vi.fn().mockResolvedValue({ rssUrl: null, title: null }),
    summarizeArticle: vi.fn().mockResolvedValue({ summary: 'summary text', inputTokens: 10, outputTokens: 5, billingMode: 'standard', model: 'haiku' }),
    streamSummarizeArticle: (...args: unknown[]) => mockStreamSummarize(...args),
    translateArticle: vi.fn().mockResolvedValue({ fullTextTranslated: '翻訳テキスト', inputTokens: 10, outputTokens: 5, billingMode: 'standard', model: 'sonnet' }),
    streamTranslateArticle: (...args: unknown[]) => mockStreamTranslate(...args),
    fetchProgress: new EventEmitter(),
    getFeedState: vi.fn(),
  }
})

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

function seedArticle(feedId: number, overrides: Partial<Parameters<typeof insertArticle>[0]> = {}) {
  return insertArticle({
    feed_id: feedId,
    title: 'Test Article',
    url: `https://example.com/article/${Math.random()}`,
    published_at: '2025-01-01T00:00:00Z',
    ...overrides,
  })
}

beforeEach(async () => {
  setupTestDb()
  app = await buildApp()
  mockStreamSummarize.mockReset()
  mockStreamTranslate.mockReset()
})

// ---------------------------------------------------------------------------
// Streaming summarize
// ---------------------------------------------------------------------------

describe('POST /api/articles/:id/summarize?stream=1', () => {
  it('returns SSE stream with delta and done events', async () => {
    const feed = seedFeed()
    const artId = seedArticle(feed.id, { full_text: 'Long article content here' })

    mockStreamSummarize.mockImplementation(async (_text: string, onDelta: (d: string) => void) => {
      onDelta('sum')
      onDelta('mary')
      return { summary: 'summary', inputTokens: 10, outputTokens: 5, billingMode: 'standard', model: 'haiku' }
    })

    const res = await app.inject({
      method: 'POST',
      url: `/api/articles/${artId}/summarize?stream=1`,
      headers: json,
      payload: {},
    })

    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toBe('text/event-stream')

    const events = res.body
      .split('\n')
      .filter((l: string) => l.startsWith('data: '))
      .map((l: string) => JSON.parse(l.slice(6)))

    const deltas = events.filter((e: any) => e.type === 'delta')
    expect(deltas).toHaveLength(2)
    expect(deltas[0].text).toBe('sum')
    expect(deltas[1].text).toBe('mary')

    const done = events.find((e: any) => e.type === 'done')
    expect(done).toBeDefined()
    expect(done.usage.input_tokens).toBe(10)
  })

  it('returns cached summary even when stream=1', async () => {
    const feed = seedFeed()
    const artId = seedArticle(feed.id, { full_text: 'text', summary: 'Cached' })

    const res = await app.inject({
      method: 'POST',
      url: `/api/articles/${artId}/summarize?stream=1`,
      headers: json,
      payload: {},
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().text).toBe('Cached')
    expect(res.json().cached).toBe(true)
  })

  it('handles streaming error after headers sent', async () => {
    const feed = seedFeed()
    const artId = seedArticle(feed.id, { full_text: 'Long content' })

    mockStreamSummarize.mockRejectedValue(new Error('API timeout'))

    const res = await app.inject({
      method: 'POST',
      url: `/api/articles/${artId}/summarize?stream=1`,
      headers: json,
      payload: {},
    })

    // The SSE stream should contain an error event
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toBe('text/event-stream')

    const events = res.body
      .split('\n')
      .filter((l: string) => l.startsWith('data: '))
      .map((l: string) => JSON.parse(l.slice(6)))

    const errorEvent = events.find((e: any) => e.type === 'error')
    expect(errorEvent).toBeDefined()
    expect(errorEvent.error).toBe('SUMMARIZATION_FAILED')
  })
})

// ---------------------------------------------------------------------------
// Translate edge cases
// ---------------------------------------------------------------------------

describe('POST /api/articles/:id/translate', () => {
  it('returns cached translation', async () => {
    const feed = seedFeed()
    const artId = seedArticle(feed.id, { full_text: 'English text', full_text_translated: '日本語テキスト', translated_lang: 'en' })

    const res = await app.inject({
      method: 'POST',
      url: `/api/articles/${artId}/translate`,
      headers: json,
      payload: {},
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().text).toBe('日本語テキスト')
    expect(res.json().cached).toBe(true)
  })

  it('does not return cached translation when translated_lang differs from user language', async () => {
    const feed = seedFeed()
    // translated_lang='ja' but user language defaults to 'en' → stale, should re-translate
    const artId = seedArticle(feed.id, { full_text: 'French text', lang: 'fr', full_text_translated: '古い日本語訳', translated_lang: 'ja' })

    mockStreamTranslate.mockReset()

    const res = await app.inject({
      method: 'POST',
      url: `/api/articles/${artId}/translate`,
      headers: json,
      payload: {},
    })

    // Should NOT return cached — should invoke translation (non-stream returns new text)
    expect(res.statusCode).toBe(200)
    expect(res.json().cached).toBeUndefined()
  })

  it('does not return cached translation when translated_lang is null', async () => {
    const feed = seedFeed()
    // translated_lang=null (legacy data) → stale
    const artId = seedArticle(feed.id, { full_text: 'French text', lang: 'fr', full_text_translated: '古い翻訳' })

    const res = await app.inject({
      method: 'POST',
      url: `/api/articles/${artId}/translate`,
      headers: json,
      payload: {},
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().cached).toBeUndefined()
  })

  it('returns 400 when article is already in user language', async () => {
    const feed = seedFeed()
    // Default user language is 'en', so an English article should be rejected
    const artId = seedArticle(feed.id, { full_text: 'English article', lang: 'en' })

    const res = await app.inject({
      method: 'POST',
      url: `/api/articles/${artId}/translate`,
      headers: json,
      payload: {},
    })

    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/already in en/)
  })

  it('returns 400 when no full_text', async () => {
    const feed = seedFeed()
    const artId = seedArticle(feed.id, { full_text: null })

    const res = await app.inject({
      method: 'POST',
      url: `/api/articles/${artId}/translate`,
      headers: json,
      payload: {},
    })

    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/full text/i)
  })

  it('returns 404 for non-existent article', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/articles/9999/translate',
      headers: json,
      payload: {},
    })

    expect(res.statusCode).toBe(404)
  })
})

// ---------------------------------------------------------------------------
// Streaming translate
// ---------------------------------------------------------------------------

describe('POST /api/articles/:id/translate?stream=1', () => {
  it('returns SSE stream with deltas', async () => {
    const feed = seedFeed()
    const artId = seedArticle(feed.id, { full_text: 'Contenu en français', lang: 'fr' })

    mockStreamTranslate.mockImplementation(async (_text: string, onDelta: (d: string) => void) => {
      onDelta('翻訳')
      onDelta('テキスト')
      return { fullTextTranslated: '翻訳テキスト', inputTokens: 20, outputTokens: 15, billingMode: 'standard', model: 'sonnet' }
    })

    const res = await app.inject({
      method: 'POST',
      url: `/api/articles/${artId}/translate?stream=1`,
      headers: json,
      payload: {},
    })

    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toBe('text/event-stream')

    const events = res.body
      .split('\n')
      .filter((l: string) => l.startsWith('data: '))
      .map((l: string) => JSON.parse(l.slice(6)))

    const deltas = events.filter((e: any) => e.type === 'delta')
    expect(deltas).toHaveLength(2)

    const done = events.find((e: any) => e.type === 'done')
    expect(done).toBeDefined()
    expect(done.usage.input_tokens).toBe(20)
  })

  it('handles streaming translate error', async () => {
    const feed = seedFeed()
    const artId = seedArticle(feed.id, { full_text: 'Contenu', lang: 'fr' })

    mockStreamTranslate.mockRejectedValue(new Error('API error'))

    const res = await app.inject({
      method: 'POST',
      url: `/api/articles/${artId}/translate?stream=1`,
      headers: json,
      payload: {},
    })

    const events = res.body
      .split('\n')
      .filter((l: string) => l.startsWith('data: '))
      .map((l: string) => JSON.parse(l.slice(6)))

    const errorEvent = events.find((e: any) => e.type === 'error')
    expect(errorEvent).toBeDefined()
    expect(errorEvent.error).toBe('TRANSLATION_FAILED')
  })
})

// ---------------------------------------------------------------------------
// Limit/offset boundary values
// ---------------------------------------------------------------------------

describe('GET /api/articles boundary values', () => {
  it('clamps limit to 1-100 range', async () => {
    const feed = seedFeed()
    for (let i = 0; i < 3; i++) seedArticle(feed.id)

    // limit=0 → NaN || 20 → clamped to 20 via Math.min(Math.max(NaN||20,1),100)
    const res1 = await app.inject({ method: 'GET', url: '/api/articles?limit=0' })
    expect(res1.statusCode).toBe(200)
    // 0 is falsy so Number(0)||20 = 20, returns all 3
    expect(res1.json().articles.length).toBe(3)

    // limit=999 → clamped to 100
    const res2 = await app.inject({ method: 'GET', url: '/api/articles?limit=999' })
    expect(res2.statusCode).toBe(200)

    // limit=2 → returns exactly 2
    const res3 = await app.inject({ method: 'GET', url: '/api/articles?limit=2' })
    expect(res3.json().articles.length).toBe(2)
    expect(res3.json().has_more).toBe(true)
  })

  it('clamps negative offset to 0', async () => {
    const feed = seedFeed()
    seedArticle(feed.id)

    const res = await app.inject({ method: 'GET', url: '/api/articles?offset=-10' })
    expect(res.statusCode).toBe(200)
    expect(res.json().articles).toHaveLength(1)
  })

  it('handles non-numeric limit/offset gracefully', async () => {
    const feed = seedFeed()
    seedArticle(feed.id)

    const res = await app.inject({ method: 'GET', url: '/api/articles?limit=abc&offset=xyz' })
    expect(res.statusCode).toBe(200)
  })
})

// ---------------------------------------------------------------------------
// Category filter
// ---------------------------------------------------------------------------

describe('GET /api/articles?category_id', () => {
  it('filters articles by category', async () => {
    const cat = createCategory('Tech')
    const f1 = seedFeed({ category_id: cat.id, url: 'https://a.com' })
    const f2 = seedFeed({ url: 'https://b.com' })
    seedArticle(f1.id)
    seedArticle(f2.id)

    const res = await app.inject({
      method: 'GET',
      url: `/api/articles?category_id=${cat.id}`,
    })
    expect(res.json().articles).toHaveLength(1)
    expect(res.json().total).toBe(1)
  })
})

describe('GET /api/articles feed icon metadata', () => {
  it('returns feed_icon_url for article list items', async () => {
    const feed = seedFeed({ icon_url: 'https://cdn.example.com/feed-icon.png' })
    seedArticle(feed.id)

    const res = await app.inject({ method: 'GET', url: '/api/articles' })

    expect(res.statusCode).toBe(200)
    expect(res.json().articles[0].feed_icon_url).toBe('https://cdn.example.com/feed-icon.png')
  })

  it('filters article list items by article_kind', async () => {
    const feed = seedFeed({ url: 'https://x.com/example', rss_url: 'https://rsshub.app/twitter/user/example' })
    seedArticle(feed.id, { url: 'https://x.com/example/status/1', article_kind: 'original' })
    seedArticle(feed.id, { url: 'https://x.com/example/status/2', article_kind: 'repost' })

    const res = await app.inject({ method: 'GET', url: `/api/articles?feed_id=${feed.id}&article_kind=repost` })

    expect(res.statusCode).toBe(200)
    expect(res.json().articles).toHaveLength(1)
    expect(res.json().articles[0].article_kind).toBe('repost')
  })

  it('returns article_kind from by-url responses', async () => {
    const feed = seedFeed({ url: 'https://x.com/example', rss_url: 'https://rsshub.app/twitter/user/example' })
    seedArticle(feed.id, {
      url: 'https://x.com/example/status/3',
      article_kind: 'quote',
    })

    const res = await app.inject({
      method: 'GET',
      url: `/api/articles/by-url?url=${encodeURIComponent('https://x.com/example/status/3')}`,
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().article_kind).toBe('quote')
  })

  it('returns has_video from list and by-url responses', async () => {
    const feed = seedFeed()
    seedArticle(feed.id, {
      url: 'https://example.com/video',
      full_text: '<video src="https://video.example.com/post.mp4" controls></video>',
    })

    const listRes = await app.inject({ method: 'GET', url: `/api/articles?feed_id=${feed.id}` })
    expect(listRes.statusCode).toBe(200)
    expect(listRes.json().articles[0].has_video).toBe(true)

    const detailRes = await app.inject({
      method: 'GET',
      url: `/api/articles/by-url?url=${encodeURIComponent('https://example.com/video')}`,
    })
    expect(detailRes.statusCode).toBe(200)
    expect(detailRes.json().has_video).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Read filter
// ---------------------------------------------------------------------------

describe('GET /api/articles?read=1', () => {
  it('filters read articles', async () => {
    const feed = seedFeed()
    const artId = seedArticle(feed.id)
    seedArticle(feed.id)

    // Record a read
    await app.inject({ method: 'POST', url: `/api/articles/${artId}/read` })

    const res = await app.inject({ method: 'GET', url: '/api/articles?read=1' })
    expect(res.json().articles).toHaveLength(1)
    expect(res.json().articles[0].read_at).not.toBeNull()
  })
})

// ---------------------------------------------------------------------------
// total_all: distinguish "no articles" from "all read"
// ---------------------------------------------------------------------------

describe('GET /api/articles?unread=1 — total_all field', () => {
  it('returns total_all when unread filter yields 0 results but articles exist', async () => {
    const feed = seedFeed()
    const artId1 = seedArticle(feed.id)
    const artId2 = seedArticle(feed.id)
    markArticleSeen(artId1, true)
    markArticleSeen(artId2, true)

    const res = await app.inject({ method: 'GET', url: '/api/articles?unread=1' })
    expect(res.statusCode).toBe(200)
    expect(res.json().articles).toHaveLength(0)
    expect(res.json().total).toBe(0)
    expect(res.json().total_all).toBe(2)
  })

  it('returns total_all scoped to category_id', async () => {
    const cat = createCategory('News')
    const f1 = seedFeed({ category_id: cat.id, url: 'https://a.com' })
    const f2 = seedFeed({ url: 'https://b.com' })
    const a1 = seedArticle(f1.id)
    seedArticle(f2.id) // different category — should not count
    markArticleSeen(a1, true)

    const res = await app.inject({
      method: 'GET',
      url: `/api/articles?unread=1&category_id=${cat.id}`,
    })
    expect(res.json().articles).toHaveLength(0)
    expect(res.json().total_all).toBe(1)
  })

  it('does not include total_all when there are unread articles', async () => {
    const feed = seedFeed()
    seedArticle(feed.id) // unread

    const res = await app.inject({ method: 'GET', url: '/api/articles?unread=1' })
    expect(res.json().articles).toHaveLength(1)
    expect(res.json().total_all).toBeUndefined()
  })

  it('does not include total_all when no articles at all', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/articles?unread=1' })
    expect(res.json().articles).toHaveLength(0)
    expect(res.json().total).toBe(0)
    // total_all is 0, so it should still be included (to confirm "truly empty")
    expect(res.json().total_all).toBe(0)
  })

  it('does not include total_all for non-unread queries', async () => {
    const feed = seedFeed()
    seedArticle(feed.id)

    const res = await app.inject({ method: 'GET', url: '/api/articles' })
    expect(res.json().total_all).toBeUndefined()
  })
})
