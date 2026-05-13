import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setupTestDb } from './__tests__/helpers/testDb.js'
import { buildApp } from './__tests__/helpers/buildApp.js'
import { createFeed, insertArticle, createCategory } from './db.js'
import type { FastifyInstance } from 'fastify'

vi.mock('./fetcher.js', async () => {
  const { EventEmitter } = await import('events')
  return {
    fetchAllFeeds: vi.fn().mockResolvedValue(undefined),
    fetchSingleFeed: vi.fn().mockResolvedValue(undefined),
    discoverRssUrl: vi.fn().mockResolvedValue({ rssUrl: 'https://example.com/rss', title: 'Example' }),
    summarizeArticle: vi.fn().mockResolvedValue({ summary: 'summary text', inputTokens: 10, outputTokens: 5 }),
    streamSummarizeArticle: vi.fn(),
    translateArticle: vi.fn().mockResolvedValue({ fullTextTranslated: '翻訳テキスト', inputTokens: 10, outputTokens: 5 }),
    streamTranslateArticle: vi.fn(),
    fetchProgress: new EventEmitter(),
    getFeedState: vi.fn().mockReturnValue(null),
  }
})

let app: FastifyInstance

beforeEach(async () => {
  setupTestDb()
  app = await buildApp()
})

// --- Helpers ---

function seedFeed(overrides: Partial<Parameters<typeof createFeed>[0]> = {}) {
  return createFeed({
    name: 'Test Feed',
    url: 'https://example.com',
    ...overrides,
  })
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

const json = { 'content-type': 'application/json' }

// ==========================================================================
// Feeds
// ==========================================================================

describe('GET /api/feeds', () => {
  it('returns empty list when no feeds', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/feeds' })
    expect(res.statusCode).toBe(200)
    expect(res.json().feeds).toEqual([])
  })

  it('returns feeds with counts', async () => {
    const feed = seedFeed()
    seedArticle(feed.id)
    seedArticle(feed.id)

    const res = await app.inject({ method: 'GET', url: '/api/feeds' })
    expect(res.statusCode).toBe(200)
    const feeds = res.json().feeds
    expect(feeds).toHaveLength(1)
    expect(feeds[0].name).toBe('Test Feed')
    expect(feeds[0].article_count).toBe(2)
    expect(feeds[0].unread_count).toBe(2)
  })
})

describe('POST /api/feeds', () => {
  it('creates a feed via SSE (Phase 2: discovered_rss_url)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/feeds',
      headers: json,
      payload: {
        url: 'https://blog.example.com',
        name: 'My Blog',
        discovered_rss_url: 'https://blog.example.com/rss',
        discovered_rss_title: 'My Blog',
      },
    })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toBe('text/event-stream')

    // Parse SSE events from the response body
    const lines = res.body.split('\n')
    const events: Record<string, unknown>[] = []
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      events.push(JSON.parse(line.slice(6)))
    }

    const doneEvent = events.find(e => e.type === 'done') as { type: string; feed: { name: string; url: string } }
    expect(doneEvent).toBeDefined()
    expect(doneEvent.feed.name).toBe('My Blog')
    expect(doneEvent.feed.url).toBe('https://blog.example.com')

    // Verify step events are present
    const stepEvents = events.filter(e => e.type === 'step')
    expect(stepEvents.length).toBeGreaterThanOrEqual(3)
  })

  it('returns 400 when url is missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/feeds',
      headers: json,
      payload: { name: 'No URL' },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/url/i)
  })

  it('returns 409 when feed URL already exists', async () => {
    seedFeed({ url: 'https://dup.example.com' })
    const res = await app.inject({
      method: 'POST',
      url: '/api/feeds',
      headers: json,
      payload: { url: 'https://dup.example.com' },
    })
    expect(res.statusCode).toBe(409)
  })
})

describe('PATCH /api/feeds/:id', () => {
  it('updates feed name', async () => {
    const feed = seedFeed()
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/feeds/${feed.id}`,
      headers: json,
      payload: { name: 'Updated Name' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().name).toBe('Updated Name')
  })

  it('returns 404 for non-existent feed', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/feeds/9999',
      headers: json,
      payload: { name: 'Ghost' },
    })
    expect(res.statusCode).toBe(404)
  })
})

describe('DELETE /api/feeds/:id', () => {
  it('deletes a feed', async () => {
    const feed = seedFeed()
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/feeds/${feed.id}`,
    })
    expect(res.statusCode).toBe(204)
  })

  it('returns 404 for non-existent feed', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/feeds/9999',
    })
    expect(res.statusCode).toBe(404)
  })
})

describe('POST /api/feeds/:id/mark-all-seen', () => {
  it('marks all articles in a feed as seen', async () => {
    const feed = seedFeed()
    seedArticle(feed.id)
    seedArticle(feed.id)

    const res = await app.inject({
      method: 'POST',
      url: `/api/feeds/${feed.id}/mark-all-seen`,
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().updated).toBe(2)
  })
})

// ==========================================================================
// Articles
// ==========================================================================

describe('GET /api/articles', () => {
  it('returns empty list when no articles', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/articles' })
    expect(res.statusCode).toBe(200)
    expect(res.json().articles).toEqual([])
    expect(res.json().total).toBe(0)
    expect(res.json().has_more).toBe(false)
  })

  it('filters by feed_id', async () => {
    const f1 = seedFeed({ url: 'https://a.com' })
    const f2 = seedFeed({ url: 'https://b.com' })
    seedArticle(f1.id)
    seedArticle(f2.id)

    const res = await app.inject({
      method: 'GET',
      url: `/api/articles?feed_id=${f1.id}`,
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().articles).toHaveLength(1)
    expect(res.json().total).toBe(1)
  })

  it('filters by unread', async () => {
    const feed = seedFeed()
    const artId = seedArticle(feed.id)
    seedArticle(feed.id)

    // Mark one as seen
    await app.inject({
      method: 'PATCH',
      url: `/api/articles/${artId}/seen`,
      headers: json,
      payload: { seen: true },
    })

    const res = await app.inject({
      method: 'GET',
      url: '/api/articles?unread=1',
    })
    expect(res.json().articles).toHaveLength(1)
  })

  it('respects limit and offset', async () => {
    const feed = seedFeed()
    for (let i = 0; i < 5; i++) seedArticle(feed.id)

    const res = await app.inject({
      method: 'GET',
      url: '/api/articles?limit=2&offset=0',
    })
    expect(res.json().articles).toHaveLength(2)
    expect(res.json().total).toBe(5)
    expect(res.json().has_more).toBe(true)
  })
})

describe('GET /api/articles/by-url', () => {
  it('returns article by URL', async () => {
    const feed = seedFeed()
    seedArticle(feed.id, { url: 'https://example.com/post-1' })

    const res = await app.inject({
      method: 'GET',
      url: '/api/articles/by-url?url=https://example.com/post-1',
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().url).toBe('https://example.com/post-1')
  })

  it('returns 400 when url is missing', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/articles/by-url',
    })
    expect(res.statusCode).toBe(400)
  })

  it('returns 404 when article not found', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/articles/by-url?url=https://nonexistent.example.com',
    })
    expect(res.statusCode).toBe(404)
  })

  it('handles protocol fallback (https -> http)', async () => {
    const feed = seedFeed()
    seedArticle(feed.id, { url: 'http://example.com/http-only' })

    const res = await app.inject({
      method: 'GET',
      url: '/api/articles/by-url?url=https://example.com/http-only',
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().url).toBe('http://example.com/http-only')
  })

  it('handles protocol fallback (http -> https)', async () => {
    const feed = seedFeed()
    seedArticle(feed.id, { url: 'https://example.com/https-only' })

    const res = await app.inject({
      method: 'GET',
      url: '/api/articles/by-url?url=http://example.com/https-only',
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().url).toBe('https://example.com/https-only')
  })
})

describe('POST /api/articles/check-urls', () => {
  it('returns existing URLs including protocol-agnostic matches', async () => {
    const feed = seedFeed()
    seedArticle(feed.id, { url: 'http://example.com/check-1' })
    seedArticle(feed.id, { url: 'https://example.com/check-2' })

    const res = await app.inject({
      method: 'POST',
      url: '/api/articles/check-urls',
      headers: json,
      payload: {
        urls: [
          'https://example.com/check-1', // input https, DB has http
          'http://example.com/check-2',  // input http, DB has https
          'https://example.com/check-3', // not in DB
        ],
      },
    })
    expect(res.statusCode).toBe(200)
    const { existing } = res.json()
    expect(existing).toContain('https://example.com/check-1')
    expect(existing).toContain('http://example.com/check-2')
    expect(existing).not.toContain('https://example.com/check-3')
  })

  it('returns 400 for empty array', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/articles/check-urls',
      headers: json,
      payload: { urls: [] },
    })
    expect(res.statusCode).toBe(400)
  })

  it('returns 400 for more than 200 urls', async () => {
    const urls = Array.from({ length: 201 }, (_, i) => `https://example.com/${i}`)
    const res = await app.inject({
      method: 'POST',
      url: '/api/articles/check-urls',
      headers: json,
      payload: { urls },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/200/)
  })
})

describe('PATCH /api/articles/:id/seen', () => {
  it('marks article as seen', async () => {
    const feed = seedFeed()
    const artId = seedArticle(feed.id)

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/articles/${artId}/seen`,
      headers: json,
      payload: { seen: true },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().seen_at).not.toBeNull()
  })

  it('marks article as unseen', async () => {
    const feed = seedFeed()
    const artId = seedArticle(feed.id)

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/articles/${artId}/seen`,
      headers: json,
      payload: { seen: false },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().seen_at).toBeNull()
  })

  it('returns 400 for invalid seen value', async () => {
    const feed = seedFeed()
    const artId = seedArticle(feed.id)

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/articles/${artId}/seen`,
      headers: json,
      payload: { seen: 2 },
    })
    expect(res.statusCode).toBe(400)
  })

  it('returns 404 for non-existent article', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/articles/9999/seen',
      headers: json,
      payload: { seen: true },
    })
    expect(res.statusCode).toBe(404)
  })
})

describe('POST /api/articles/:id/read', () => {
  it('records article read (sets read_at and seen_at)', async () => {
    const feed = seedFeed()
    const artId = seedArticle(feed.id)

    const res = await app.inject({
      method: 'POST',
      url: `/api/articles/${artId}/read`,
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().read_at).not.toBeNull()
    expect(res.json().seen_at).not.toBeNull()
  })

  it('returns 404 for non-existent article', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/articles/9999/read',
    })
    expect(res.statusCode).toBe(404)
  })
})

describe('PATCH /api/articles/:id/bookmark', () => {
  it('bookmarks an article', async () => {
    const feed = seedFeed()
    const artId = seedArticle(feed.id)

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/articles/${artId}/bookmark`,
      headers: json,
      payload: { bookmarked: true },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().bookmarked_at).not.toBeNull()
  })

  it('unbookmarks an article', async () => {
    const feed = seedFeed()
    const artId = seedArticle(feed.id)

    await app.inject({
      method: 'PATCH',
      url: `/api/articles/${artId}/bookmark`,
      headers: json,
      payload: { bookmarked: true },
    })

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/articles/${artId}/bookmark`,
      headers: json,
      payload: { bookmarked: false },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().bookmarked_at).toBeNull()
  })

  it('returns 400 for invalid bookmarked value', async () => {
    const feed = seedFeed()
    const artId = seedArticle(feed.id)

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/articles/${artId}/bookmark`,
      headers: json,
      payload: { bookmarked: 2 },
    })
    expect(res.statusCode).toBe(400)
  })

  it('returns 404 for non-existent article', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/articles/9999/bookmark',
      headers: json,
      payload: { bookmarked: true },
    })
    expect(res.statusCode).toBe(404)
  })
})

describe('GET /api/articles?bookmarked=1', () => {
  it('filters bookmarked articles', async () => {
    const feed = seedFeed()
    const artId = seedArticle(feed.id)
    seedArticle(feed.id)

    await app.inject({
      method: 'PATCH',
      url: `/api/articles/${artId}/bookmark`,
      headers: json,
      payload: { bookmarked: true },
    })

    const res = await app.inject({
      method: 'GET',
      url: '/api/articles?bookmarked=1',
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().articles).toHaveLength(1)
    expect(res.json().articles[0].bookmarked_at).not.toBeNull()
  })
})

describe('PATCH /api/articles/:id/like', () => {
  it('likes an article', async () => {
    const feed = seedFeed()
    const artId = seedArticle(feed.id)

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/articles/${artId}/like`,
      headers: json,
      payload: { liked: true },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().liked_at).not.toBeNull()
  })

  it('unlikes an article', async () => {
    const feed = seedFeed()
    const artId = seedArticle(feed.id)

    await app.inject({
      method: 'PATCH',
      url: `/api/articles/${artId}/like`,
      headers: json,
      payload: { liked: true },
    })

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/articles/${artId}/like`,
      headers: json,
      payload: { liked: false },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().liked_at).toBeNull()
  })

  it('returns 400 for invalid liked value', async () => {
    const feed = seedFeed()
    const artId = seedArticle(feed.id)

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/articles/${artId}/like`,
      headers: json,
      payload: { liked: 2 },
    })
    expect(res.statusCode).toBe(400)
  })

  it('returns 404 for non-existent article', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/articles/9999/like',
      headers: json,
      payload: { liked: true },
    })
    expect(res.statusCode).toBe(404)
  })
})

describe('GET /api/articles?liked=1', () => {
  it('filters liked articles', async () => {
    const feed = seedFeed()
    const artId = seedArticle(feed.id)
    seedArticle(feed.id)

    await app.inject({
      method: 'PATCH',
      url: `/api/articles/${artId}/like`,
      headers: json,
      payload: { liked: true },
    })

    const res = await app.inject({
      method: 'GET',
      url: '/api/articles?liked=1',
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().articles).toHaveLength(1)
    expect(res.json().articles[0].liked_at).not.toBeNull()
  })
})

describe('GET /api/feeds bookmark_count', () => {
  it('includes bookmark_count in response', async () => {
    const feed = seedFeed()
    const artId = seedArticle(feed.id)

    const res1 = await app.inject({ method: 'GET', url: '/api/feeds' })
    expect(res1.json().bookmark_count).toBe(0)

    await app.inject({
      method: 'PATCH',
      url: `/api/articles/${artId}/bookmark`,
      headers: json,
      payload: { bookmarked: true },
    })

    const res2 = await app.inject({ method: 'GET', url: '/api/feeds' })
    expect(res2.json().bookmark_count).toBe(1)
  })
})

describe('GET /api/feeds like_count', () => {
  it('includes like_count in response', async () => {
    const feed = seedFeed()
    const artId = seedArticle(feed.id)

    const res1 = await app.inject({ method: 'GET', url: '/api/feeds' })
    expect(res1.json().like_count).toBe(0)

    await app.inject({
      method: 'PATCH',
      url: `/api/articles/${artId}/like`,
      headers: json,
      payload: { liked: true },
    })

    const res2 = await app.inject({ method: 'GET', url: '/api/feeds' })
    expect(res2.json().like_count).toBe(1)
  })
})

describe('POST /api/articles/batch-seen', () => {
  it('marks multiple articles as seen', async () => {
    const feed = seedFeed()
    const id1 = seedArticle(feed.id)
    const id2 = seedArticle(feed.id)

    const res = await app.inject({
      method: 'POST',
      url: '/api/articles/batch-seen',
      headers: json,
      payload: { ids: [id1, id2] },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().updated).toBe(2)
  })

  it('returns 400 for empty array', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/articles/batch-seen',
      headers: json,
      payload: { ids: [] },
    })
    expect(res.statusCode).toBe(400)
  })

  it('returns 400 for more than 100 ids', async () => {
    const ids = Array.from({ length: 101 }, (_, i) => i + 1)
    const res = await app.inject({
      method: 'POST',
      url: '/api/articles/batch-seen',
      headers: json,
      payload: { ids },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/100/)
  })
})

describe('POST /api/articles/:id/summarize', () => {
  it('returns cached summary when available', async () => {
    const feed = seedFeed()
    const artId = seedArticle(feed.id, {
      full_text: 'Some article text',
      summary: 'Cached summary',
    })

    const res = await app.inject({
      method: 'POST',
      url: `/api/articles/${artId}/summarize`,
      headers: json,
      payload: {},
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().text).toBe('Cached summary')
    expect(res.json().cached).toBe(true)
  })

  it('returns 400 when no full_text', async () => {
    const feed = seedFeed()
    const artId = seedArticle(feed.id, { full_text: null })

    const res = await app.inject({
      method: 'POST',
      url: `/api/articles/${artId}/summarize`,
      headers: json,
      payload: {},
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/full text/i)
  })

  it('returns 404 for non-existent article', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/articles/9999/summarize',
      headers: json,
      payload: {},
    })
    expect(res.statusCode).toBe(404)
  })

  it('generates summary via AI when not cached', async () => {
    const feed = seedFeed()
    const artId = seedArticle(feed.id, { full_text: 'Long article content' })

    const res = await app.inject({
      method: 'POST',
      url: `/api/articles/${artId}/summarize`,
      headers: json,
      payload: {},
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().text).toBe('summary text')
  })
})

// ==========================================================================
// Categories
// ==========================================================================

describe('GET /api/categories', () => {
  it('returns empty list when no categories', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/categories' })
    expect(res.statusCode).toBe(200)
    expect(res.json().categories).toEqual([])
  })

  it('returns categories', async () => {
    createCategory('Tech')
    createCategory('News')

    const res = await app.inject({ method: 'GET', url: '/api/categories' })
    expect(res.statusCode).toBe(200)
    expect(res.json().categories).toHaveLength(2)
  })
})

describe('POST /api/categories', () => {
  it('creates a category', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/categories',
      headers: json,
      payload: { name: 'Technology' },
    })
    expect(res.statusCode).toBe(201)
    expect(res.json().name).toBe('Technology')
  })

  it('returns 400 when name is missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/categories',
      headers: json,
      payload: {},
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/name/i)
  })

  it('returns 400 when name is empty string', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/categories',
      headers: json,
      payload: { name: '   ' },
    })
    expect(res.statusCode).toBe(400)
  })
})

describe('PATCH /api/categories/:id', () => {
  it('updates category name', async () => {
    const cat = createCategory('Old Name')
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/categories/${cat.id}`,
      headers: json,
      payload: { name: 'New Name' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().name).toBe('New Name')
  })

  it('returns 404 for non-existent category', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/categories/9999',
      headers: json,
      payload: { name: 'Ghost' },
    })
    expect(res.statusCode).toBe(404)
  })
})

describe('DELETE /api/categories/:id', () => {
  it('deletes a category', async () => {
    const cat = createCategory('ToDelete')
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/categories/${cat.id}`,
    })
    expect(res.statusCode).toBe(204)
  })

  it('returns 404 for non-existent category', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/categories/9999',
    })
    expect(res.statusCode).toBe(404)
  })
})

describe('POST /api/categories/:id/mark-all-seen', () => {
  it('marks all articles in category as seen', async () => {
    const cat = createCategory('Tech')
    const feed = seedFeed({ category_id: cat.id })
    seedArticle(feed.id)
    seedArticle(feed.id)

    const res = await app.inject({
      method: 'POST',
      url: `/api/categories/${cat.id}/mark-all-seen`,
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().updated).toBe(2)
  })
})

// ==========================================================================
// Settings - Profile
// ==========================================================================

describe('GET /api/settings/profile', () => {
  it('returns default profile', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/settings/profile' })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.account_name).toBeDefined()
    expect(body).toHaveProperty('avatar_seed')
    expect(body).toHaveProperty('language')
    expect(body).toHaveProperty('email')
  })
})

describe('PATCH /api/settings/profile', () => {
  it('updates account name', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/settings/profile',
      headers: json,
      payload: { account_name: 'Alice' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().account_name).toBe('Alice')
  })

  it('updates language', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/settings/profile',
      headers: json,
      payload: { language: 'ja' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().language).toBe('ja')
  })

  it('returns 400 for empty account_name', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/settings/profile',
      headers: json,
      payload: { account_name: '   ' },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/account_name/i)
  })

  it('returns 400 for invalid language', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/settings/profile',
      headers: json,
      payload: { language: 'fr' },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/language/i)
  })

  it('returns 400 when no fields provided', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/settings/profile',
      headers: json,
      payload: {},
    })
    expect(res.statusCode).toBe(400)
  })
})

// ==========================================================================
// Settings - Preferences
// ==========================================================================

describe('GET /api/settings/preferences', () => {
  it('returns all preference keys', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/settings/preferences' })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body).toHaveProperty('appearance.color_theme')
    expect(body).toHaveProperty('reading.date_mode')
    expect(body).toHaveProperty('reading.auto_mark_read')
    expect(body).toHaveProperty('reading.unread_indicator')
    expect(body).toHaveProperty('reading.internal_links')
    expect(body).toHaveProperty('appearance.highlight_theme')
  })
})

describe('PATCH /api/settings/preferences', () => {
  it('updates a valid preference', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/settings/preferences',
      headers: json,
      payload: { 'reading.date_mode': 'absolute' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()['reading.date_mode']).toBe('absolute')
  })

  it('returns 400 for invalid enum value', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/settings/preferences',
      headers: json,
      payload: { 'reading.date_mode': 'invalid' },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/reading\.date_mode/i)
  })

  it('deletes preference when value is empty string', async () => {
    // First set a value
    await app.inject({
      method: 'PATCH',
      url: '/api/settings/preferences',
      headers: json,
      payload: { 'appearance.color_theme': 'dark' },
    })

    // Then delete it
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/settings/preferences',
      headers: json,
      payload: { 'appearance.color_theme': '' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()['appearance.color_theme']).toBeNull()
  })

  it('returns 400 when no valid fields provided', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/settings/preferences',
      headers: json,
      payload: { unknown_key: 'value' },
    })
    expect(res.statusCode).toBe(400)
  })

  it('accepts free-form string for appearance.color_theme', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/settings/preferences',
      headers: json,
      payload: { 'appearance.color_theme': 'solarized' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()['appearance.color_theme']).toBe('solarized')
  })
})

// ==========================================================================
// Admin
// ==========================================================================

describe('POST /api/admin/fetch-all', () => {
  it('returns 200 SSE stream', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/fetch-all',
      headers: json,
      payload: {},
    })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toBe('text/event-stream')
  })
})
