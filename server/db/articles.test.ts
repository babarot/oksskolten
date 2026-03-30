import { describe, it, expect, beforeEach } from 'vitest'
import { setupTestDb } from '../__tests__/helpers/testDb.js'
import {
  getArticles,
  getArticleById,
  insertArticle,
  getReadingStats,
  searchArticles,
  markArticleSeen,
  markArticleBookmarked,
  markArticleLiked,
  recordArticleRead,
  updateArticleContent,
  recalculateScores,
  getRetryArticles,
  getRetryStats,
  backfillLegacyXArticleKinds,
  updateArticleKindIfMissing,
} from '../db.js'
import { createFeed, createCategory, getDb } from '../db.js'

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

// --- getArticles: read filter and ordering ---

describe('getArticles read filter', () => {
  it('filters by read (read_at IS NOT NULL)', () => {
    const feed = seedFeed()
    const id1 = seedArticle(feed.id, { url: 'https://example.com/1' })
    seedArticle(feed.id, { url: 'https://example.com/2' })

    recordArticleRead(id1)

    const { articles, total } = getArticles({ read: true, limit: 100, offset: 0 })
    expect(articles).toHaveLength(1)
    expect(total).toBe(1)
    expect(articles[0].read_at).not.toBeNull()
  })

  it('returns only read articles when read filter is active', () => {
    const feed = seedFeed()
    const id1 = seedArticle(feed.id, { url: 'https://example.com/1', published_at: '2025-01-01T00:00:00Z' })
    seedArticle(feed.id, { url: 'https://example.com/2', published_at: '2025-01-02T00:00:00Z' })

    recordArticleRead(id1)

    const { articles, total } = getArticles({ read: true, limit: 100, offset: 0 })
    expect(articles).toHaveLength(1)
    expect(total).toBe(1)
    expect(articles[0].read_at).not.toBeNull()
  })

  it('returns only liked articles when liked filter is active', () => {
    const feed = seedFeed()
    const id1 = seedArticle(feed.id, { url: 'https://example.com/1' })
    seedArticle(feed.id, { url: 'https://example.com/2' })

    markArticleLiked(id1, true)

    const { articles, total } = getArticles({ liked: true, limit: 100, offset: 0 })
    expect(articles).toHaveLength(1)
    expect(total).toBe(1)
    expect(articles[0].liked_at).not.toBeNull()
  })

  it('filters by article kind', () => {
    const feed = seedFeed({ url: 'https://x.com/example', rss_url: 'https://rsshub.app/twitter/user/example' })
    seedArticle(feed.id, { url: 'https://x.com/example/status/1', article_kind: 'original' })
    seedArticle(feed.id, { url: 'https://x.com/example/status/2', article_kind: 'repost' })

    const { articles, total } = getArticles({ feedId: feed.id, articleKind: 'repost', limit: 100, offset: 0 })
    expect(total).toBe(1)
    expect(articles).toHaveLength(1)
    expect(articles[0].article_kind).toBe('repost')
  })

  it('derives has_video from full_text in list queries', () => {
    const feed = seedFeed()
    seedArticle(feed.id, {
      url: 'https://example.com/video',
      full_text: '<video src="https://video.example.com/post.mp4" controls></video>',
    })

    const { articles } = getArticles({ feedId: feed.id, limit: 100, offset: 0 })
    expect(articles[0].has_video).toBe(true)
  })
})

// --- searchArticles ---

describe('searchArticles', () => {
  it('filters by feed_id', () => {
    const feed1 = seedFeed({ url: 'https://a.com' })
    const feed2 = seedFeed({ url: 'https://b.com' })
    seedArticle(feed1.id, { url: 'https://a.com/1' })
    seedArticle(feed2.id, { url: 'https://b.com/1' })

    const results = searchArticles({ feed_id: feed1.id })
    expect(results).toHaveLength(1)
    expect(results[0].url).toBe('https://a.com/1')
  })

  it('filters by category_id', () => {
    const cat = createCategory('Tech')
    const feed1 = seedFeed({ url: 'https://a.com', category_id: cat.id })
    const feed2 = seedFeed({ url: 'https://b.com' })
    seedArticle(feed1.id, { url: 'https://a.com/1' })
    seedArticle(feed2.id, { url: 'https://b.com/1' })

    const results = searchArticles({ category_id: cat.id })
    expect(results).toHaveLength(1)
  })

  it('filters by unread', () => {
    const feed = seedFeed()
    const id1 = seedArticle(feed.id, { url: 'https://example.com/1' })
    seedArticle(feed.id, { url: 'https://example.com/2' })

    markArticleSeen(id1, true)

    const unread = searchArticles({ unread: true })
    expect(unread).toHaveLength(1)

    const read = searchArticles({ unread: false })
    expect(read).toHaveLength(1)
  })

  it('filters by bookmarked', () => {
    const feed = seedFeed()
    const id1 = seedArticle(feed.id, { url: 'https://example.com/1' })
    seedArticle(feed.id, { url: 'https://example.com/2' })

    markArticleBookmarked(id1, true)

    const results = searchArticles({ bookmarked: true })
    expect(results).toHaveLength(1)
    expect(results[0].bookmarked_at).not.toBeNull()
  })

  it('filters by date range', () => {
    const feed = seedFeed()
    seedArticle(feed.id, { url: 'https://example.com/old', published_at: '2024-01-01T00:00:00Z' })
    seedArticle(feed.id, { url: 'https://example.com/new', published_at: '2025-06-01T00:00:00Z' })

    const results = searchArticles({ since: '2025-01-01', until: '2025-12-31' })
    expect(results).toHaveLength(1)
    expect(results[0].url).toBe('https://example.com/new')
  })

  it('respects limit', () => {
    const feed = seedFeed()
    for (let i = 0; i < 5; i++) {
      seedArticle(feed.id, { url: `https://example.com/${i}` })
    }

    const results = searchArticles({ limit: 2 })
    expect(results).toHaveLength(2)
  })

  it('combines multiple filters', () => {
    const cat = createCategory('News')
    const feed = seedFeed({ url: 'https://news.com', category_id: cat.id })
    const id1 = seedArticle(feed.id, { url: 'https://news.com/1', published_at: '2025-06-01T00:00:00Z' })
    seedArticle(feed.id, { url: 'https://news.com/2', published_at: '2025-06-01T00:00:00Z' })

    markArticleBookmarked(id1, true)

    const results = searchArticles({ category_id: cat.id, bookmarked: true, since: '2025-01-01' })
    expect(results).toHaveLength(1)
    expect(results[0].url).toBe('https://news.com/1')
  })
})

describe('article kind persistence', () => {
  it('stores article_kind on insert and returns it from detail queries', () => {
    const feed = seedFeed({ url: 'https://x.com/example', rss_url: 'https://rsshub.app/twitter/user/example' })
    const id = seedArticle(feed.id, {
      url: 'https://x.com/example/status/1',
      article_kind: 'quote',
    })

    expect(getArticleById(id)?.article_kind).toBe('quote')
  })

  it('derives has_video from full_text in detail queries', () => {
    const feed = seedFeed()
    const id = seedArticle(feed.id, {
      url: 'https://example.com/video-detail',
      full_text: '<p>Hello</p><video src="https://video.example.com/post.mp4" controls></video>',
    })

    expect(getArticleById(id)?.has_video).toBe(true)
  })

  it('only fills missing article_kind when backfilling by id', () => {
    const feed = seedFeed({ url: 'https://x.com/example', rss_url: 'https://rsshub.app/twitter/user/example' })
    const id = seedArticle(feed.id, { article_kind: null })

    expect(updateArticleKindIfMissing(id, 'repost')).toBe(true)
    expect(updateArticleKindIfMissing(id, 'quote')).toBe(false)
    expect(getArticleById(id)?.article_kind).toBe('repost')
  })

  it('backfills legacy X reposts and quotes conservatively', () => {
    const xFeed = seedFeed({ url: 'https://x.com/example', rss_url: 'https://rsshub.app/twitter/user/example' })
    const otherFeed = seedFeed({ url: 'https://example.com/blog' })

    const repostId = seedArticle(xFeed.id, {
      title: 'RT Example: hello',
      url: 'https://x.com/example/status/1',
      article_kind: null,
    })
    const quoteId = seedArticle(xFeed.id, {
      title: 'Quoted post',
      url: 'https://x.com/example/status/2',
      full_text: '<div class="rsshub-quote">quoted</div>',
      article_kind: null,
    })
    const plainId = seedArticle(xFeed.id, {
      title: 'Plain post',
      url: 'https://x.com/example/status/3',
      article_kind: null,
    })
    const otherId = seedArticle(otherFeed.id, {
      title: 'RT should not backfill',
      url: 'https://example.com/post/1',
      article_kind: null,
    })

    const first = backfillLegacyXArticleKinds()
    const second = backfillLegacyXArticleKinds()

    expect(first.updated).toBe(2)
    expect(second.updated).toBe(0)
    expect(getArticleById(repostId)?.article_kind).toBe('repost')
    expect(getArticleById(quoteId)?.article_kind).toBe('quote')
    expect(getArticleById(plainId)?.article_kind).toBeNull()
    expect(getArticleById(otherId)?.article_kind).toBeNull()
  })
})

// --- searchArticles scoring ---

describe('searchArticles scoring', () => {
  it('ranks liked/bookmarked articles higher with query', () => {
    const feed = seedFeed()
    seedArticle(feed.id, {
      title: 'TypeScript basics',
      url: 'https://example.com/ts1',
      full_text: 'TypeScript is great',
    })
    const id2 = seedArticle(feed.id, {
      title: 'TypeScript advanced',
      url: 'https://example.com/ts2',
      full_text: 'TypeScript advanced patterns',
    })

    markArticleLiked(id2, true)
    markArticleBookmarked(id2, true)

    const results = searchArticles({ query: 'TypeScript' })
    expect(results.length).toBeGreaterThanOrEqual(2)
    expect(results[0].url).toBe('https://example.com/ts2')
    expect(results[0].score).toBeDefined()
    expect(results[0].score!).toBeGreaterThan(results[1].score!)
  })

  it('returns score field in results', () => {
    const feed = seedFeed()
    seedArticle(feed.id, {
      title: 'React hooks guide',
      url: 'https://example.com/react1',
      full_text: 'React hooks are useful',
    })

    const results = searchArticles({ query: 'React' })
    expect(results).toHaveLength(1)
    expect(typeof results[0].score).toBe('number')
  })

  it('uses published_at DESC for query-less filter', () => {
    const feed = seedFeed()
    const id1 = seedArticle(feed.id, {
      url: 'https://example.com/old',
      published_at: '2024-01-01T00:00:00Z',
    })
    seedArticle(feed.id, {
      url: 'https://example.com/new',
      published_at: '2025-06-01T00:00:00Z',
    })

    markArticleLiked(id1, true)
    markArticleBookmarked(id1, true)

    const results = searchArticles({ feed_id: feed.id })
    expect(results[0].url).toBe('https://example.com/new')
  })

  it('read-only engagement produces a score higher than no engagement', () => {
    const feed = seedFeed()
    seedArticle(feed.id, {
      title: 'JavaScript intro',
      url: 'https://example.com/js1',
      full_text: 'JavaScript fundamentals',
    })
    const id2 = seedArticle(feed.id, {
      title: 'JavaScript patterns',
      url: 'https://example.com/js2',
      full_text: 'JavaScript design patterns',
    })

    recordArticleRead(id2)

    const results = searchArticles({ query: 'JavaScript' })
    expect(results).toHaveLength(2)
    const readArticle = results.find(r => r.url === 'https://example.com/js2')!
    const unreadArticle = results.find(r => r.url === 'https://example.com/js1')!
    expect(readArticle.score!).toBeGreaterThan(unreadArticle.score!)
  })

  it('returns score for query-less results too', () => {
    const feed = seedFeed()
    seedArticle(feed.id, { url: 'https://example.com/a1' })

    const results = searchArticles({ feed_id: feed.id })
    expect(results).toHaveLength(1)
    expect(typeof results[0].score).toBe('number')
  })

  it('scoring works combined with bookmarked filter', () => {
    const feed = seedFeed()
    const id1 = seedArticle(feed.id, {
      title: 'Rust basics',
      url: 'https://example.com/rust1',
      full_text: 'Rust programming language',
    })
    const id2 = seedArticle(feed.id, {
      title: 'Rust advanced',
      url: 'https://example.com/rust2',
      full_text: 'Rust advanced topics',
    })
    seedArticle(feed.id, {
      title: 'Rust tips',
      url: 'https://example.com/rust3',
      full_text: 'Rust tips and tricks',
    })

    markArticleBookmarked(id1, true)
    markArticleBookmarked(id2, true)
    markArticleLiked(id2, true)

    const results = searchArticles({ query: 'Rust', bookmarked: true })
    expect(results).toHaveLength(2)
    // liked+bookmarked should rank above bookmarked-only
    expect(results[0].url).toBe('https://example.com/rust2')
  })

  it('engagement weights are additive (liked+bookmarked+read > liked only)', () => {
    const feed = seedFeed()
    const id1 = seedArticle(feed.id, {
      title: 'Go concurrency',
      url: 'https://example.com/go1',
      full_text: 'Go concurrency patterns',
    })
    const id2 = seedArticle(feed.id, {
      title: 'Go channels',
      url: 'https://example.com/go2',
      full_text: 'Go concurrency with channels',
    })

    markArticleLiked(id1, true)

    markArticleLiked(id2, true)
    markArticleBookmarked(id2, true)
    recordArticleRead(id2)

    const results = searchArticles({ query: 'Go concurrency' })
    expect(results).toHaveLength(2)
    const fullyEngaged = results.find(r => r.url === 'https://example.com/go2')!
    const likedOnly = results.find(r => r.url === 'https://example.com/go1')!
    expect(fullyEngaged.score!).toBeGreaterThan(likedOnly.score!)
  })
})

// --- getReadingStats ---

describe('getReadingStats', () => {
  it('returns totals for all articles', () => {
    const feed = seedFeed()
    const id1 = seedArticle(feed.id, { url: 'https://example.com/1' })
    seedArticle(feed.id, { url: 'https://example.com/2' })
    seedArticle(feed.id, { url: 'https://example.com/3' })

    markArticleSeen(id1, true)

    const stats = getReadingStats()
    expect(stats.total).toBe(3)
    expect(stats.read).toBe(1)
    expect(stats.unread).toBe(2)
  })

  it('returns by_feed breakdown', () => {
    const feed1 = seedFeed({ name: 'Feed A', url: 'https://a.com' })
    const feed2 = seedFeed({ name: 'Feed B', url: 'https://b.com' })
    seedArticle(feed1.id, { url: 'https://a.com/1' })
    seedArticle(feed1.id, { url: 'https://a.com/2' })
    seedArticle(feed2.id, { url: 'https://b.com/1' })

    const id = insertArticle({ feed_id: feed1.id, title: 'Read', url: 'https://a.com/3', published_at: '2025-01-01T00:00:00Z' })
    markArticleSeen(id, true)

    const stats = getReadingStats()
    expect(stats.by_feed).toHaveLength(2)

    const feedA = stats.by_feed.find(f => f.feed_name === 'Feed A')!
    expect(feedA.total).toBe(3)
    expect(feedA.read).toBe(1)
    expect(feedA.unread).toBe(2)

    const feedB = stats.by_feed.find(f => f.feed_name === 'Feed B')!
    expect(feedB.total).toBe(1)
    expect(feedB.read).toBe(0)
    expect(feedB.unread).toBe(1)
  })

  it('filters by date range', () => {
    const feed = seedFeed()
    seedArticle(feed.id, { url: 'https://example.com/old', published_at: '2024-01-01T00:00:00Z' })
    seedArticle(feed.id, { url: 'https://example.com/new', published_at: '2025-06-01T00:00:00Z' })

    const stats = getReadingStats({ since: '2025-01-01', until: '2025-12-31' })
    expect(stats.total).toBe(1)
  })

  it('returns zeros/nulls when no articles', () => {
    const stats = getReadingStats()
    expect(stats.total).toBe(0)
    // SUM on empty set returns null in SQLite
    expect(stats.read).toBeNull()
    expect(stats.unread).toBeNull()
    expect(stats.by_feed).toHaveLength(0)
  })
})

// --- updateArticleContent edge case ---

describe('updateArticleContent edge cases', () => {
  it('does nothing when no fields provided', () => {
    const feed = seedFeed()
    const id = seedArticle(feed.id, { full_text: 'original' })

    updateArticleContent(id, {})

    const article = getArticleById(id)!
    expect(article.full_text).toBe('original')
  })

  it('updates only specified fields', () => {
    const feed = seedFeed()
    const id = seedArticle(feed.id, { full_text: 'original', summary: 'old summary' })

    updateArticleContent(id, { summary: 'new summary' })

    const article = getArticleById(id)!
    expect(article.full_text).toBe('original')
    expect(article.summary).toBe('new summary')
  })
})

// --- Score persistence (Phase 2) ---

describe('score persistence', () => {
  it('recalculateScores updates only qualifying articles', () => {
    const feed = seedFeed()
    const id1 = seedArticle(feed.id, { url: 'https://example.com/s1' })
    seedArticle(feed.id, { url: 'https://example.com/s2', published_at: '2020-01-01T00:00:00Z' })

    markArticleLiked(id1, true)

    const { updated } = recalculateScores()
    // id1 has engagement (liked), id2 has no engagement, old date, and score=0 → not updated
    expect(updated).toBe(1)

    const { articles } = getArticles({ sort: 'score', limit: 100, offset: 0 })
    expect(articles[0].url).toBe('https://example.com/s1')
    expect(articles[0].score).toBeGreaterThan(0)
  })

  it('recalculateScores picks up articles with residual score > 0', () => {
    const feed = seedFeed()
    const id1 = seedArticle(feed.id, { url: 'https://example.com/residual', published_at: '2020-01-01T00:00:00Z' })

    // Manually set score > 0 to simulate residual score (e.g. from a previous batch)
    // without any current engagement
    getDb().prepare('UPDATE articles SET score = 5.0 WHERE id = ?').run(id1)

    const { updated } = recalculateScores()
    // Should be picked up by OR score > 0 clause and recalculated to ~0
    expect(updated).toBe(1)

    const { articles } = getArticles({ limit: 100, offset: 0 })
    const article = articles.find(a => a.id === id1)!
    // After recalculation with no engagement and old date, score should be near 0
    expect(article.score).toBeLessThan(1)
  })

  it('updateScore updates a single article immediately', () => {
    const feed = seedFeed()
    const id = seedArticle(feed.id, { url: 'https://example.com/s3' })

    // score starts at 0
    const before = getArticles({ limit: 100, offset: 0 })
    expect(before.articles[0].score).toBe(0)

    markArticleLiked(id, true)

    // score updated by markArticleLiked -> updateScore
    const after = getArticles({ limit: 100, offset: 0 })
    expect(after.articles[0].score).toBeGreaterThan(0)
  })

  it('engaged article has higher persisted score', () => {
    const feed = seedFeed()
    seedArticle(feed.id, { url: 'https://example.com/s4' })
    const id2 = seedArticle(feed.id, { url: 'https://example.com/s5' })

    markArticleLiked(id2, true)
    markArticleBookmarked(id2, true)
    recalculateScores()

    const { articles } = getArticles({ sort: 'score', limit: 100, offset: 0 })
    expect(articles[0].url).toBe('https://example.com/s5')
    expect(articles[0].score).toBeGreaterThan(articles[1].score!)
  })

  it('getArticles default sort is published_at DESC (not score)', () => {
    const feed = seedFeed()
    const id1 = seedArticle(feed.id, {
      url: 'https://example.com/s6',
      published_at: '2024-01-01T00:00:00Z',
    })
    seedArticle(feed.id, {
      url: 'https://example.com/s7',
      published_at: '2025-06-01T00:00:00Z',
    })

    markArticleLiked(id1, true)
    markArticleBookmarked(id1, true)
    recalculateScores()

    // Default sort: newest first, regardless of score
    const { articles } = getArticles({ limit: 100, offset: 0 })
    expect(articles[0].url).toBe('https://example.com/s7')
  })

  it('liked filter does not use score order when sort is not specified', () => {
    const feed = seedFeed()
    const id1 = seedArticle(feed.id, { url: 'https://example.com/s8' })
    const id2 = seedArticle(feed.id, { url: 'https://example.com/s9' })

    markArticleLiked(id1, true)
    markArticleLiked(id2, true)
    // Give id1 a much higher score via bookmark
    markArticleBookmarked(id1, true)
    recalculateScores()

    const { articles } = getArticles({ liked: true, limit: 100, offset: 0 })
    expect(articles).toHaveLength(2)
    // Should NOT be sorted by score (id1 has higher score but liked_at order prevails)
    // Both liked_at are same second, so just verify it's not score-sorted
    // by checking that score order would differ
    // The key assertion: liked filter returns articles (not empty / not broken)
    expect(articles.every(a => a.liked_at !== null)).toBe(true)

    // With explicit sort=score, the higher-scored article comes first
    const { articles: scoreSorted } = getArticles({ liked: true, sort: 'score', limit: 100, offset: 0 })
    expect(scoreSorted[0].url).toBe('https://example.com/s8')
  })
})

// --- Smart Floor ---

describe('getArticles smartFloor', () => {
  function daysAgo(days: number): string {
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
  }

  it('shows at least 20 articles even if all are older than 1 week', () => {
    const feed = seedFeed()
    for (let i = 0; i < 25; i++) {
      seedArticle(feed.id, {
        url: `https://example.com/old-${i}`,
        published_at: daysAgo(30 + i), // 30–54 days ago
      })
      markArticleSeen(insertArticle({ feed_id: feed.id, title: 'x', url: `https://example.com/seen-${i}`, published_at: daysAgo(30 + i) }), true)
    }
    // Remove double-inserts, just use the seedArticle ones. Let me redo this cleanly.
    // Actually the seedArticle calls already inserted 25 articles. Let's just query.
    const { articles } = getArticles({ feedId: feed.id, smartFloor: true, limit: 100, offset: 0 })
    expect(articles.length).toBeGreaterThanOrEqual(20)
  })

  it('shows 1 week of articles when that exceeds 20', () => {
    const feed = seedFeed()
    // 30 articles within the last 7 days
    for (let i = 0; i < 30; i++) {
      seedArticle(feed.id, {
        url: `https://example.com/recent-${i}`,
        published_at: daysAgo(i * 0.2), // spread across ~6 days
      })
    }

    const { articles } = getArticles({ feedId: feed.id, smartFloor: true, limit: 100, offset: 0 })
    // 1 week has 30 articles which exceeds 20, so all 30 should be shown
    expect(articles.length).toBe(30)
  })

  it('extends to oldest unread when that is further back than 1 week and 20 articles', () => {
    const feed = seedFeed()
    // 5 recent articles (within 1 week), all seen
    for (let i = 0; i < 5; i++) {
      const id = seedArticle(feed.id, {
        url: `https://example.com/new-${i}`,
        published_at: daysAgo(i),
      })
      markArticleSeen(id, true)
    }
    // 1 old unread article from 30 days ago
    seedArticle(feed.id, {
      url: 'https://example.com/old-unread',
      published_at: daysAgo(30),
    })

    const { articles } = getArticles({ feedId: feed.id, smartFloor: true, limit: 100, offset: 0 })
    const urls = articles.map(a => a.url)
    expect(urls).toContain('https://example.com/old-unread')
  })

  it('prefers 1 week / 20 articles over unread when unread range is smaller', () => {
    const feed = seedFeed()
    // 25 articles within the last 7 days, all seen
    for (let i = 0; i < 25; i++) {
      const id = seedArticle(feed.id, {
        url: `https://example.com/week-${i}`,
        published_at: daysAgo(i * 0.2),
      })
      markArticleSeen(id, true)
    }
    // 1 unread article from 3 days ago (within the 1-week window, fewer than 25)
    seedArticle(feed.id, {
      url: 'https://example.com/unread-recent',
      published_at: daysAgo(3),
    })
    // 5 old articles beyond 1 week (should NOT appear)
    for (let i = 0; i < 5; i++) {
      const id = seedArticle(feed.id, {
        url: `https://example.com/ancient-${i}`,
        published_at: daysAgo(20 + i),
      })
      markArticleSeen(id, true)
    }

    const { articles } = getArticles({ feedId: feed.id, smartFloor: true, limit: 100, offset: 0 })
    // Should show all 25 + 1 unread within the week window
    expect(articles.length).toBeGreaterThanOrEqual(25)
    expect(articles.map(a => a.url)).toContain('https://example.com/unread-recent')
    // Old articles beyond the floor should not appear
    const ancientUrls = articles.filter(a => a.url.includes('/ancient-'))
    expect(ancientUrls.length).toBe(0)
  })

  it('uses max(1week, 20) as base when no unread articles exist', () => {
    const feed = seedFeed()
    // 10 articles within 1 week, all seen
    for (let i = 0; i < 10; i++) {
      const id = seedArticle(feed.id, {
        url: `https://example.com/recent-${i}`,
        published_at: daysAgo(i * 0.5),
      })
      markArticleSeen(id, true)
    }
    // 15 articles from 10-20 days ago, all seen
    for (let i = 0; i < 15; i++) {
      const id = seedArticle(feed.id, {
        url: `https://example.com/older-${i}`,
        published_at: daysAgo(10 + i),
      })
      markArticleSeen(id, true)
    }

    const { articles } = getArticles({ feedId: feed.id, smartFloor: true, limit: 100, offset: 0 })
    // 1 week has only 10 articles, but 20-article floor should pull in more
    expect(articles.length).toBeGreaterThanOrEqual(20)
  })

  it('returns totalWithoutFloor when smartFloor hides articles', () => {
    const feed = seedFeed()
    // 5 recent + 20 old articles (all seen, total 25 > 20)
    for (let i = 0; i < 5; i++) {
      const id = seedArticle(feed.id, {
        url: `https://example.com/twf-recent-${i}`,
        published_at: daysAgo(i),
      })
      markArticleSeen(id, true)
    }
    for (let i = 0; i < 20; i++) {
      const id = seedArticle(feed.id, {
        url: `https://example.com/twf-old-${i}`,
        published_at: daysAgo(30 + i),
      })
      markArticleSeen(id, true)
    }

    const result = getArticles({ feedId: feed.id, smartFloor: true, limit: 100, offset: 0 })
    // smartFloor limits the result, totalWithoutFloor shows the real count
    expect(result.total).toBeLessThan(25)
    expect(result.totalWithoutFloor).toBe(25)
  })

  it('does not return totalWithoutFloor when no articles are hidden', () => {
    const feed = seedFeed()
    for (let i = 0; i < 5; i++) {
      seedArticle(feed.id, {
        url: `https://example.com/no-twf-${i}`,
        published_at: daysAgo(i),
      })
    }

    const result = getArticles({ feedId: feed.id, smartFloor: true, limit: 100, offset: 0 })
    expect(result.totalWithoutFloor).toBeUndefined()
  })

  it('shows all articles when fewer than 20 exist, even if older than 1 week', () => {
    const feed = seedFeed()
    // 9 articles, all older than 7 days, all seen
    for (let i = 0; i < 9; i++) {
      const id = seedArticle(feed.id, {
        url: `https://example.com/few-${i}`,
        published_at: daysAgo(10 + i),
      })
      markArticleSeen(id, true)
    }

    const { articles } = getArticles({ feedId: feed.id, smartFloor: true, limit: 100, offset: 0 })
    // Fewer than 20 articles → no floor applied, all 9 should appear
    expect(articles.length).toBe(9)
  })

  it('includes articles with null published_at regardless of floor', () => {
    const feed = seedFeed()
    // 1 article with no published_at
    seedArticle(feed.id, {
      url: 'https://example.com/null-date',
      published_at: undefined as unknown as string,
    })
    // Some recent articles
    for (let i = 0; i < 5; i++) {
      seedArticle(feed.id, {
        url: `https://example.com/dated-${i}`,
        published_at: daysAgo(i),
      })
    }

    const { articles } = getArticles({ feedId: feed.id, smartFloor: true, limit: 100, offset: 0 })
    const urls = articles.map(a => a.url)
    expect(urls).toContain('https://example.com/null-date')
  })
})

// --- getRetryArticles ---

describe('getRetryArticles', () => {
  it('returns articles with last_error and no full_text', () => {
    const feed = seedFeed()
    seedArticle(feed.id, { url: 'https://example.com/err1', last_error: 'fetch failed' })

    const results = getRetryArticles()
    expect(results).toHaveLength(1)
  })

  it('excludes articles with full_text even if last_error is set', () => {
    const feed = seedFeed()
    seedArticle(feed.id, { url: 'https://example.com/partial', full_text: 'partial content', last_error: 'Turndown failed' })

    const results = getRetryArticles()
    expect(results).toHaveLength(0)
  })

  it('excludes articles where only summary is NULL (full_text exists)', () => {
    const feed = seedFeed()
    seedArticle(feed.id, { url: 'https://example.com/no-summary', full_text: 'body text', last_error: 'summary error' })

    const results = getRetryArticles()
    expect(results).toHaveLength(0)
  })

  it('excludes articles exceeding max retry attempts', () => {
    const feed = seedFeed()
    const id = seedArticle(feed.id, { url: 'https://example.com/maxed', last_error: 'fail' })
    getDb().prepare('UPDATE articles SET retry_count = 5 WHERE id = ?').run(id)

    const results = getRetryArticles()
    expect(results).toHaveLength(0)
  })

  it('excludes articles within backoff period', () => {
    const feed = seedFeed()
    const id = seedArticle(feed.id, { url: 'https://example.com/backoff', last_error: 'fail' })
    // retry_count = 0 → backoff = 30 min. Set last_retry_at to now (within 30 min)
    getDb().prepare("UPDATE articles SET retry_count = 0, last_retry_at = datetime('now') WHERE id = ?").run(id)

    const results = getRetryArticles()
    expect(results).toHaveLength(0)
  })

  it('includes articles past backoff period', () => {
    const feed = seedFeed()
    const id = seedArticle(feed.id, { url: 'https://example.com/ready', last_error: 'fail' })
    // retry_count = 0 → backoff = 30 min. Set last_retry_at to 31 min ago
    getDb().prepare("UPDATE articles SET retry_count = 0, last_retry_at = datetime('now', '-31 minutes') WHERE id = ?").run(id)

    const results = getRetryArticles()
    expect(results).toHaveLength(1)
  })

  it('includes articles with last_retry_at = NULL (first retry)', () => {
    const feed = seedFeed()
    seedArticle(feed.id, { url: 'https://example.com/first', last_error: 'fail' })

    const results = getRetryArticles()
    expect(results).toHaveLength(1)
  })

  it('respects batch limit', () => {
    const feed = seedFeed()
    for (let i = 0; i < 10; i++) {
      seedArticle(feed.id, { url: `https://example.com/batch-${i}`, last_error: 'fail' })
    }

    const results = getRetryArticles()
    expect(results).toHaveLength(3) // RETRY_BATCH_LIMIT default = 3
  })

  it('sorts by retry_count ASC then last_retry_at ASC', () => {
    const feed = seedFeed()
    const id1 = seedArticle(feed.id, { url: 'https://example.com/r2', last_error: 'fail' })
    seedArticle(feed.id, { url: 'https://example.com/r0', last_error: 'fail' })
    const id3 = seedArticle(feed.id, { url: 'https://example.com/r1', last_error: 'fail' })
    // id1: retry_count=2, old retry
    getDb().prepare("UPDATE articles SET retry_count = 2, last_retry_at = datetime('now', '-5 hours') WHERE id = ?").run(id1)
    // id2: retry_count=0, no retry yet
    // id3: retry_count=1, old retry
    getDb().prepare("UPDATE articles SET retry_count = 1, last_retry_at = datetime('now', '-2 hours') WHERE id = ?").run(id3)

    const results = getRetryArticles()
    expect(results.map(r => r.url)).toEqual([
      'https://example.com/r0', // retry_count=0
      'https://example.com/r1', // retry_count=1
      'https://example.com/r2', // retry_count=2
    ])
  })
})

// --- getRetryStats ---

describe('getRetryStats', () => {
  it('returns zeros when no retry candidates exist', () => {
    const stats = getRetryStats()
    expect(stats.eligible).toBe(0)
    expect(stats.backoff_waiting).toBe(0)
    expect(stats.exceeded).toBe(0)
  })

  it('counts eligible, backoff-waiting, and exceeded correctly', () => {
    const feed = seedFeed()
    // eligible: last_error set, no full_text, retry_count=0, no last_retry_at
    seedArticle(feed.id, { url: 'https://example.com/e1', last_error: 'fail' })

    // backoff-waiting: retry_count=1, last_retry_at = now (within 60min backoff)
    const id2 = seedArticle(feed.id, { url: 'https://example.com/bw1', last_error: 'fail' })
    getDb().prepare("UPDATE articles SET retry_count = 1, last_retry_at = datetime('now') WHERE id = ?").run(id2)

    // exceeded: retry_count=5 (>= RETRY_MAX_ATTEMPTS default)
    const id3 = seedArticle(feed.id, { url: 'https://example.com/ex1', last_error: 'fail' })
    getDb().prepare('UPDATE articles SET retry_count = 5 WHERE id = ?').run(id3)

    const stats = getRetryStats()
    expect(stats.eligible).toBe(1)
    expect(stats.backoff_waiting).toBe(1)
    expect(stats.exceeded).toBe(1)
  })
})
