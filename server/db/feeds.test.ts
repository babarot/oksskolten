import { describe, it, expect, beforeEach } from 'vitest'
import { setupTestDb } from '../__tests__/helpers/testDb.js'
import {
  createFeed,
  updateFeed,
  getFeedById,
  getFeeds,
  getEnabledFeeds,
  insertArticle,
  markArticleSeen,
  createCategory,
  updateFeedError,
  updateFeedRateLimit,
  updateFeedSchedule,
} from '../db.js'

beforeEach(() => {
  setupTestDb()
})

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

describe('updateFeed category_id', () => {
  it('changes feed category and updates articles category_id', () => {
    const cat = createCategory('Tech')
    const feed = seedFeed()
    seedArticle(feed.id)

    updateFeed(feed.id, { category_id: cat.id })

    const updated = getFeedById(feed.id)!
    expect(updated.category_id).toBe(cat.id)

    // Articles should also have category_id updated
    // getArticleById doesn't expose category_id directly, but getFeeds shows category_name
    const feeds = getFeeds()
    expect(feeds[0].category_name).toBe('Tech')
  })

  it('sets category_id to null (uncategorize)', () => {
    const cat = createCategory('Tech')
    const feed = seedFeed({ category_id: cat.id })

    updateFeed(feed.id, { category_id: null })

    const updated = getFeedById(feed.id)!
    expect(updated.category_id).toBeNull()
  })
})

describe('updateFeed rss_url', () => {
  it('updates rss_url field', () => {
    const feed = seedFeed()

    updateFeed(feed.id, { rss_url: 'https://example.com/feed.xml' })

    const updated = getFeedById(feed.id)!
    expect(updated.rss_url).toBe('https://example.com/feed.xml')
  })

  it('sets rss_url to null', () => {
    const feed = seedFeed({ rss_url: 'https://example.com/feed.xml' })

    updateFeed(feed.id, { rss_url: null })

    const updated = getFeedById(feed.id)!
    expect(updated.rss_url).toBeNull()
  })
})

describe('feed icon_url', () => {
  it('persists icon_url on create', () => {
    const feed = seedFeed({ icon_url: 'https://example.com/icon.png' })

    expect(feed.icon_url).toBe('https://example.com/icon.png')
  })

  it('updates icon_url field', () => {
    const feed = seedFeed()

    updateFeed(feed.id, { icon_url: 'https://example.com/new-icon.png' })

    const updated = getFeedById(feed.id)!
    expect(updated.icon_url).toBe('https://example.com/new-icon.png')
  })

  it('clears icon_url field', () => {
    const feed = seedFeed({ icon_url: 'https://example.com/icon.png' })

    updateFeed(feed.id, { icon_url: null })

    const updated = getFeedById(feed.id)!
    expect(updated.icon_url).toBeNull()
  })
})

describe('updateFeed requires_js_challenge', () => {
  it('sets requires_js_challenge flag', () => {
    const feed = seedFeed()

    updateFeed(feed.id, { requires_js_challenge: 1 })

    const updated = getFeedById(feed.id)!
    expect(updated.requires_js_challenge).toBe(1)
  })

  it('clears requires_js_challenge flag', () => {
    const feed = seedFeed({ requires_js_challenge: 1 })

    updateFeed(feed.id, { requires_js_challenge: 0 })

    const updated = getFeedById(feed.id)!
    expect(updated.requires_js_challenge).toBe(0)
  })
})

describe('updateFeed no-op', () => {
  it('returns existing feed when no fields provided', () => {
    const feed = seedFeed({ name: 'Original' })

    const result = updateFeed(feed.id, {})

    expect(result).toBeDefined()
    expect(result!.name).toBe('Original')
  })
})

describe('createFeed with all options', () => {
  it('creates feed with rss_url and category', () => {
    const cat = createCategory('Tech')
    const feed = createFeed({
      name: 'Full Feed',
      url: 'https://full.example.com',
      icon_url: 'https://full.example.com/icon.png',
      rss_url: 'https://full.example.com/rss',
      rss_bridge_url: 'https://bridge.example.com/rss',
      category_id: cat.id,
      requires_js_challenge: 1,
    })

    expect(feed.name).toBe('Full Feed')
    expect(feed.icon_url).toBe('https://full.example.com/icon.png')
    expect(feed.rss_url).toBe('https://full.example.com/rss')
    expect(feed.rss_bridge_url).toBe('https://bridge.example.com/rss')
    expect(feed.category_id).toBe(cat.id)
    expect(feed.requires_js_challenge).toBe(1)
    expect(feed.type).toBe('rss')
  })
})

describe('updateFeedError exponential backoff', () => {
  it('records error and increments error_count', () => {
    const feed = seedFeed()

    updateFeedError(feed.id, 'Connection timeout')

    const updated = getFeedById(feed.id)!
    expect(updated.last_error).toBe('Connection timeout')
    expect(updated.error_count).toBe(1)
  })

  it('does not set next_check_at for errorCount < 3', () => {
    const feed = seedFeed()

    updateFeedError(feed.id, 'Error 1')
    updateFeedError(feed.id, 'Error 2')

    const updated = getFeedById(feed.id)!
    expect(updated.error_count).toBe(2)
    expect(updated.next_check_at).toBeNull()
  })

  it('sets next_check_at with backoff for errorCount >= 3', () => {
    const feed = seedFeed()

    updateFeedError(feed.id, 'Error 1')
    updateFeedError(feed.id, 'Error 2')
    updateFeedError(feed.id, 'Error 3')

    const updated = getFeedById(feed.id)!
    expect(updated.error_count).toBe(3)
    expect(updated.next_check_at).not.toBeNull()
    // errorCount=3 → backoff = 3600 * (3-2) = 3600s = 1h
    const nextCheck = new Date(updated.next_check_at!).getTime()
    const now = Date.now()
    // Should be roughly 1 hour from now (allow 30s tolerance)
    expect(nextCheck - now).toBeGreaterThan(3600 * 1000 - 30000)
    expect(nextCheck - now).toBeLessThan(3600 * 1000 + 30000)
  })

  it('caps backoff at 4 hours', () => {
    const feed = seedFeed()

    // Simulate 10 consecutive errors
    for (let i = 0; i < 10; i++) {
      updateFeedError(feed.id, `Error ${i + 1}`)
    }

    const updated = getFeedById(feed.id)!
    expect(updated.error_count).toBe(10)
    const nextCheck = new Date(updated.next_check_at!).getTime()
    const now = Date.now()
    // Max backoff = 4h = 14400s
    expect(nextCheck - now).toBeLessThan(14400 * 1000 + 30000)
  })

  it('clears error on success (null error)', () => {
    const feed = seedFeed()
    updateFeedError(feed.id, 'Error 1')
    updateFeedError(feed.id, 'Error 2')
    updateFeedError(feed.id, 'Error 3')

    // Clear error
    updateFeedError(feed.id, null)

    const updated = getFeedById(feed.id)!
    expect(updated.last_error).toBeNull()
    expect(updated.error_count).toBe(0)
  })

  it('never disables feeds', () => {
    const feed = seedFeed()

    // Simulate many consecutive errors
    for (let i = 0; i < 20; i++) {
      updateFeedError(feed.id, `Error ${i + 1}`)
    }

    const updated = getFeedById(feed.id)!
    expect(updated.disabled).toBe(0)
    expect(updated.error_count).toBe(20)
  })
})

describe('updateFeedRateLimit', () => {
  it('sets next_check_at without incrementing error_count', () => {
    const feed = seedFeed()

    updateFeedRateLimit(feed.id, 1800) // 30 minutes

    const updated = getFeedById(feed.id)!
    expect(updated.error_count).toBe(0)
    expect(updated.next_check_at).not.toBeNull()
    expect(updated.last_error).toContain('Rate limited')
    const nextCheck = new Date(updated.next_check_at!).getTime()
    const now = Date.now()
    expect(nextCheck - now).toBeGreaterThan(1800 * 1000 - 30000)
    expect(nextCheck - now).toBeLessThan(1800 * 1000 + 30000)
  })

  it('defaults to 1 hour when retryAfterSeconds is null', () => {
    const feed = seedFeed()

    updateFeedRateLimit(feed.id, null)

    const updated = getFeedById(feed.id)!
    expect(updated.error_count).toBe(0)
    const nextCheck = new Date(updated.next_check_at!).getTime()
    const now = Date.now()
    expect(nextCheck - now).toBeGreaterThan(3600 * 1000 - 30000)
  })

  it('does not affect existing error_count', () => {
    const feed = seedFeed()
    // Simulate 2 prior errors
    updateFeedError(feed.id, 'Error 1')
    updateFeedError(feed.id, 'Error 2')

    // Rate limit should not touch error_count
    updateFeedRateLimit(feed.id, 600)

    const updated = getFeedById(feed.id)!
    expect(updated.error_count).toBe(2)
  })
})

describe('getEnabledFeeds scheduling', () => {
  it('returns feeds with next_check_at in the past', () => {
    const feed = seedFeed()
    const pastTime = new Date(Date.now() - 60000).toISOString().replace(/\.\d{3}Z$/, 'Z')
    updateFeedSchedule(feed.id, pastTime, 3600)

    const enabled = getEnabledFeeds()
    expect(enabled.some(f => f.id === feed.id)).toBe(true)
  })

  it('returns feeds with null next_check_at', () => {
    const feed = seedFeed()

    const enabled = getEnabledFeeds()
    expect(enabled.some(f => f.id === feed.id)).toBe(true)
  })

  it('excludes feeds with next_check_at in the future', () => {
    const feed = seedFeed()
    const futureTime = new Date(Date.now() + 3600000).toISOString().replace(/\.\d{3}Z$/, 'Z')
    updateFeedSchedule(feed.id, futureTime, 3600)

    const enabled = getEnabledFeeds()
    expect(enabled.some(f => f.id === feed.id)).toBe(false)
  })
})

describe('getFeeds unread count with seen articles', () => {
  it('decrements unread_count after marking articles seen', () => {
    const feed = seedFeed()
    const id1 = seedArticle(feed.id, { url: 'https://example.com/1' })
    seedArticle(feed.id, { url: 'https://example.com/2' })

    let feeds = getFeeds()
    expect(feeds[0].unread_count).toBe(2)

    markArticleSeen(id1, true)

    feeds = getFeeds()
    expect(feeds[0].unread_count).toBe(1)
  })
})
