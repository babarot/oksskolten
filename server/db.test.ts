import { describe, it, expect, beforeEach } from 'vitest'
import { setupTestDb } from './__tests__/helpers/testDb.js'
import {
  // Feeds
  getFeeds,
  getFeedById,
  getFeedByUrl,
  createFeed,
  updateFeed,
  deleteFeed,
  updateFeedError,
  updateFeedRssUrl,
  getEnabledFeeds,
  ensureClipFeed,
  getClipFeed,
  // Articles
  getArticles,
  getArticleById,
  getArticleByUrl,
  insertArticle,
  markArticleSeen,
  markArticlesSeen,
  markAllSeenByFeed,
  recordArticleRead,
  markArticleBookmarked,
  getBookmarkCount,
  markArticleLiked,
  getLikeCount,
  searchArticles,
  updateArticleContent,
  getExistingArticleUrls,
  getRetryArticles,
  markImagesArchived,
  clearImagesArchived,
  deleteArticle,
  // Categories
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  markAllSeenByCategory,
  // Settings
  getSetting,
  upsertSetting,
  deleteSetting,
} from './db.js'

beforeEach(() => {
  setupTestDb()
})

// --- Helper ---

function seedFeed(overrides: Partial<Parameters<typeof createFeed>[0]> = {}) {
  return createFeed({
    name: 'Test Feed',
    url: 'https://example.com',
    ...overrides,
  })
}

function seedArticle(feedId: number, overrides: Partial<Parameters<typeof insertArticle>[0]> = {}) {
  const id = insertArticle({
    feed_id: feedId,
    title: 'Test Article',
    url: `https://example.com/article/${Math.random()}`,
    published_at: '2025-01-01T00:00:00Z',
    ...overrides,
  })
  return id
}

// --- Feeds ---

describe('Feeds', () => {
  it('createFeed → getFeedById', () => {
    const feed = seedFeed()
    const found = getFeedById(feed.id)
    expect(found).toBeDefined()
    expect(found!.name).toBe('Test Feed')
    expect(found!.url).toBe('https://example.com')
    expect(found!.disabled).toBe(0)
    expect(found!.error_count).toBe(0)
  })

  it('getFeedByUrl returns feed by URL', () => {
    seedFeed({ url: 'https://unique.example.com' })
    const found = getFeedByUrl('https://unique.example.com')
    expect(found).toBeDefined()
    expect(found!.url).toBe('https://unique.example.com')
  })

  it('getFeedByUrl returns undefined for unknown URL', () => {
    const found = getFeedByUrl('https://nonexistent.example.com')
    expect(found).toBeUndefined()
  })

  it('getFeeds returns list with counts', () => {
    const feed = seedFeed()
    seedArticle(feed.id)
    seedArticle(feed.id)

    const feeds = getFeeds()
    expect(feeds).toHaveLength(1)
    expect(feeds[0].article_count).toBe(2)
    expect(feeds[0].unread_count).toBe(2)
  })

  it('getFeeds includes category_name', () => {
    const cat = createCategory('Tech')
    seedFeed({ category_id: cat.id })

    const feeds = getFeeds()
    expect(feeds[0].category_name).toBe('Tech')
  })

  it('updateFeed changes name', () => {
    const feed = seedFeed()
    const updated = updateFeed(feed.id, { name: 'New Name' })
    expect(updated).toBeDefined()
    expect(updated!.name).toBe('New Name')
  })

  it('updateFeed toggles disabled and resets error_count', () => {
    const feed = seedFeed()
    // Set some errors first
    updateFeedError(feed.id, 'error1')
    updateFeedError(feed.id, 'error2')

    // Disable
    const disabled = updateFeed(feed.id, { disabled: 1 })
    expect(disabled!.disabled).toBe(1)

    // Re-enable should reset error_count
    const reenabled = updateFeed(feed.id, { disabled: 0 })
    expect(reenabled!.disabled).toBe(0)
    expect(reenabled!.error_count).toBe(0)
    expect(reenabled!.last_error).toBeNull()
  })

  it('updateFeed returns undefined for non-existent feed', () => {
    const result = updateFeed(9999, { name: 'X' })
    expect(result).toBeUndefined()
  })

  it('deleteFeed cascade-deletes articles', () => {
    const feed = seedFeed()
    seedArticle(feed.id)
    seedArticle(feed.id)

    expect(deleteFeed(feed.id)).toBe(true)
    expect(getFeedById(feed.id)).toBeUndefined()

    const { articles } = getArticles({ limit: 100, offset: 0 })
    expect(articles).toHaveLength(0)
  })

  it('deleteFeed returns false for non-existent feed', () => {
    expect(deleteFeed(9999)).toBe(false)
  })

  it('updateFeedError increments error_count and uses exponential backoff (never disables)', () => {
    const feed = seedFeed()

    for (let i = 0; i < 5; i++) {
      updateFeedError(feed.id, `error ${i + 1}`)
    }
    const current = getFeedById(feed.id)!
    expect(current.error_count).toBe(5)
    expect(current.disabled).toBe(0) // never auto-disabled
    expect(current.next_check_at).not.toBeNull() // backoff scheduling applied (errorCount >= 3)
  })

  it('updateFeedError with null clears error state', () => {
    const feed = seedFeed()
    updateFeedError(feed.id, 'some error')
    updateFeedError(feed.id, null)

    const current = getFeedById(feed.id)!
    expect(current.last_error).toBeNull()
    expect(current.error_count).toBe(0)
  })

  it('updateFeedRssUrl updates rss_url', () => {
    const feed = seedFeed()
    updateFeedRssUrl(feed.id, 'https://example.com/rss')

    const updated = getFeedById(feed.id)!
    expect(updated.rss_url).toBe('https://example.com/rss')
  })

  it('getEnabledFeeds excludes disabled feeds', () => {
    seedFeed({ url: 'https://a.com' })
    const feed2 = seedFeed({ url: 'https://b.com' })
    updateFeed(feed2.id, { disabled: 1 })

    const enabled = getEnabledFeeds()
    expect(enabled).toHaveLength(1)
    expect(enabled[0].url).toBe('https://a.com')
  })
})

// --- Articles ---

describe('Articles', () => {
  it('insertArticle → getArticleById', () => {
    const feed = seedFeed()
    const articleId = seedArticle(feed.id, {
      title: 'My Article',
      url: 'https://example.com/article/1',
      published_at: '2025-06-01T00:00:00Z',
      lang: 'en',
      full_text: 'Full text here',
      summary: 'Summary here',
    })

    const article = getArticleById(articleId)
    expect(article).toBeDefined()
    expect(article!.title).toBe('My Article')
    expect(article!.feed_name).toBe('Test Feed')
    expect(article!.lang).toBe('en')
    expect(article!.full_text).toBe('Full text here')
    expect(article!.seen_at).toBeNull()
  })

  it('getArticleByUrl finds article by URL', () => {
    const feed = seedFeed()
    seedArticle(feed.id, { url: 'https://example.com/unique-article' })

    const article = getArticleByUrl('https://example.com/unique-article')
    expect(article).toBeDefined()
    expect(article!.url).toBe('https://example.com/unique-article')
  })

  it('getArticleByUrl returns undefined for unknown URL', () => {
    expect(getArticleByUrl('https://nonexistent.com')).toBeUndefined()
  })

  it('getArticleByUrl matches percent-encoded URL with raw Unicode lookup', () => {
    const feed = seedFeed()
    seedArticle(feed.id, { url: 'https://example.com/%E8%A8%98%E4%BA%8B' })

    // Raw Unicode lookup should find the percent-encoded stored URL
    const article = getArticleByUrl('https://example.com/記事')
    expect(article).toBeDefined()
    expect(article!.url).toBe('https://example.com/%E8%A8%98%E4%BA%8B')
  })


  describe('getArticles filtering', () => {
    it('filters by feedId', () => {
      const feed1 = seedFeed({ url: 'https://a.com' })
      const feed2 = seedFeed({ url: 'https://b.com' })
      seedArticle(feed1.id, { url: 'https://a.com/1' })
      seedArticle(feed2.id, { url: 'https://b.com/1' })

      const { articles, total } = getArticles({ feedId: feed1.id, limit: 100, offset: 0 })
      expect(articles).toHaveLength(1)
      expect(total).toBe(1)
      expect(articles[0].url).toBe('https://a.com/1')
    })

    it('filters by categoryId', () => {
      const cat = createCategory('News')
      const feed1 = seedFeed({ url: 'https://a.com', category_id: cat.id })
      const feed2 = seedFeed({ url: 'https://b.com' })
      seedArticle(feed1.id, { url: 'https://a.com/1' })
      seedArticle(feed2.id, { url: 'https://b.com/1' })

      const { articles, total } = getArticles({ categoryId: cat.id, limit: 100, offset: 0 })
      expect(articles).toHaveLength(1)
      expect(total).toBe(1)
    })

    it('filters unread only', () => {
      const feed = seedFeed()
      const id1 = seedArticle(feed.id, { url: 'https://example.com/1' })
      seedArticle(feed.id, { url: 'https://example.com/2' })

      markArticleSeen(id1, true)

      const { articles, total } = getArticles({ unread: true, limit: 100, offset: 0 })
      expect(articles).toHaveLength(1)
      expect(total).toBe(1)
    })
  })

  describe('getArticles pagination', () => {
    it('respects limit and offset', () => {
      const feed = seedFeed()
      for (let i = 0; i < 5; i++) {
        seedArticle(feed.id, {
          url: `https://example.com/${i}`,
          published_at: `2025-01-0${i + 1}T00:00:00Z`,
        })
      }

      const page1 = getArticles({ limit: 2, offset: 0 })
      expect(page1.articles).toHaveLength(2)
      expect(page1.total).toBe(5)

      const page2 = getArticles({ limit: 2, offset: 2 })
      expect(page2.articles).toHaveLength(2)
      expect(page2.total).toBe(5)

      const page3 = getArticles({ limit: 2, offset: 4 })
      expect(page3.articles).toHaveLength(1)
    })
  })

  it('markArticleSeen toggles seen_at', () => {
    const feed = seedFeed()
    const id = seedArticle(feed.id)

    const result1 = markArticleSeen(id, true)
    expect(result1).toBeDefined()
    expect(result1!.seen_at).not.toBeNull()

    const article = getArticleById(id)!
    expect(article.seen_at).not.toBeNull()

    const result2 = markArticleSeen(id, false)
    expect(result2!.seen_at).toBeNull()
    expect(result2!.read_at).toBeNull()
  })

  it('markArticleSeen returns undefined for non-existent article', () => {
    expect(markArticleSeen(9999, true)).toBeUndefined()
  })

  it('markArticlesSeen batch marks as seen', () => {
    const feed = seedFeed()
    const id1 = seedArticle(feed.id, { url: 'https://example.com/1' })
    const id2 = seedArticle(feed.id, { url: 'https://example.com/2' })
    const id3 = seedArticle(feed.id, { url: 'https://example.com/3' })

    const result = markArticlesSeen([id1, id2])
    expect(result.updated).toBe(2)

    expect(getArticleById(id1)!.seen_at).not.toBeNull()
    expect(getArticleById(id2)!.seen_at).not.toBeNull()
    expect(getArticleById(id3)!.seen_at).toBeNull()
  })

  it('markArticlesSeen with empty array', () => {
    expect(markArticlesSeen([]).updated).toBe(0)
  })

  it('markAllSeenByFeed marks all feed articles as seen', () => {
    const feed = seedFeed()
    seedArticle(feed.id, { url: 'https://example.com/1' })
    seedArticle(feed.id, { url: 'https://example.com/2' })

    const result = markAllSeenByFeed(feed.id)
    expect(result.updated).toBe(2)

    const { articles } = getArticles({ feedId: feed.id, limit: 100, offset: 0 })
    expect(articles.every(a => a.seen_at !== null)).toBe(true)
  })

  it('recordArticleRead sets read_at and seen_at', () => {
    const feed = seedFeed()
    const id = seedArticle(feed.id)

    const result = recordArticleRead(id)
    expect(result).toBeDefined()
    expect(result!.read_at).not.toBeNull()
    expect(result!.seen_at).not.toBeNull()
  })

  it('recordArticleRead overwrites read_at on second call', () => {
    const feed = seedFeed()
    const id = seedArticle(feed.id)

    const result1 = recordArticleRead(id)
    const result2 = recordArticleRead(id)
    expect(result2).toBeDefined()
    expect(result2!.read_at).not.toBeNull()
    // seen_at should stay the same (COALESCE)
    expect(result2!.seen_at).toBe(result1!.seen_at)
  })

  it('recordArticleRead returns undefined for non-existent article', () => {
    expect(recordArticleRead(9999)).toBeUndefined()
  })

  it('markArticleBookmarked toggles bookmarked_at', () => {
    const feed = seedFeed()
    const id = seedArticle(feed.id)

    const result1 = markArticleBookmarked(id, true)
    expect(result1!.bookmarked_at).not.toBeNull()

    const article = getArticleById(id)!
    expect(article.bookmarked_at).not.toBeNull()

    const result2 = markArticleBookmarked(id, false)
    expect(result2!.bookmarked_at).toBeNull()
  })

  it('markArticleBookmarked returns undefined for non-existent article', () => {
    expect(markArticleBookmarked(9999, true)).toBeUndefined()
  })

  it('getBookmarkCount returns count of bookmarked articles', () => {
    const feed = seedFeed()
    const id1 = seedArticle(feed.id, { url: 'https://example.com/1' })
    const id2 = seedArticle(feed.id, { url: 'https://example.com/2' })
    seedArticle(feed.id, { url: 'https://example.com/3' })

    expect(getBookmarkCount()).toBe(0)

    markArticleBookmarked(id1, true)
    markArticleBookmarked(id2, true)
    expect(getBookmarkCount()).toBe(2)

    markArticleBookmarked(id1, false)
    expect(getBookmarkCount()).toBe(1)
  })

  it('getArticles filters by bookmarked', () => {
    const feed = seedFeed()
    const id1 = seedArticle(feed.id, { url: 'https://example.com/1' })
    seedArticle(feed.id, { url: 'https://example.com/2' })

    markArticleBookmarked(id1, true)

    const { articles, total } = getArticles({ bookmarked: true, limit: 100, offset: 0 })
    expect(articles).toHaveLength(1)
    expect(total).toBe(1)
    expect(articles[0].bookmarked_at).not.toBeNull()
  })

  it('getArticleById includes bookmarked_at', () => {
    const feed = seedFeed()
    const id = seedArticle(feed.id)

    expect(getArticleById(id)!.bookmarked_at).toBeNull()

    markArticleBookmarked(id, true)
    expect(getArticleById(id)!.bookmarked_at).not.toBeNull()
  })

  it('markArticleLiked toggles liked_at', () => {
    const feed = seedFeed()
    const id = seedArticle(feed.id)

    const result1 = markArticleLiked(id, true)
    expect(result1).toBeDefined()
    expect(result1!.liked_at).not.toBeNull()

    const article = getArticleById(id)!
    expect(article.liked_at).not.toBeNull()

    const result2 = markArticleLiked(id, false)
    expect(result2!.liked_at).toBeNull()
  })

  it('markArticleLiked returns undefined for non-existent article', () => {
    expect(markArticleLiked(9999, true)).toBeUndefined()
  })

  it('getLikeCount returns count of liked articles', () => {
    const feed = seedFeed()
    const id1 = seedArticle(feed.id, { url: 'https://example.com/1' })
    const id2 = seedArticle(feed.id, { url: 'https://example.com/2' })
    seedArticle(feed.id, { url: 'https://example.com/3' })

    expect(getLikeCount()).toBe(0)

    markArticleLiked(id1, true)
    markArticleLiked(id2, true)
    expect(getLikeCount()).toBe(2)

    markArticleLiked(id1, false)
    expect(getLikeCount()).toBe(1)
  })

  it('getArticles filters by liked', () => {
    const feed = seedFeed()
    const id1 = seedArticle(feed.id, { url: 'https://example.com/1' })
    seedArticle(feed.id, { url: 'https://example.com/2' })

    markArticleLiked(id1, true)

    const { articles, total } = getArticles({ liked: true, limit: 100, offset: 0 })
    expect(articles).toHaveLength(1)
    expect(total).toBe(1)
    expect(articles[0].liked_at).not.toBeNull()
  })

  it('getArticleById includes liked_at', () => {
    const feed = seedFeed()
    const id = seedArticle(feed.id)

    expect(getArticleById(id)!.liked_at).toBeNull()

    markArticleLiked(id, true)
    expect(getArticleById(id)!.liked_at).not.toBeNull()
  })

  it('searchArticles filters by liked', () => {
    const feed = seedFeed()
    const id1 = seedArticle(feed.id, { url: 'https://example.com/1', full_text: 'text one' })
    seedArticle(feed.id, { url: 'https://example.com/2', full_text: 'text two' })

    markArticleLiked(id1, true)

    const results = searchArticles({ liked: true })
    expect(results).toHaveLength(1)
    expect(results[0].liked_at).not.toBeNull()
  })

  it('updateArticleContent updates fields', () => {
    const feed = seedFeed()
    const id = seedArticle(feed.id)

    updateArticleContent(id, {
      lang: 'ja',
      full_text: 'Updated text',
      summary: 'Updated summary',
      og_image: 'https://example.com/image.jpg',
    })

    const article = getArticleById(id)!
    expect(article.lang).toBe('ja')
    expect(article.full_text).toBe('Updated text')
    expect(article.summary).toBe('Updated summary')
    expect(article.og_image).toBe('https://example.com/image.jpg')
  })

  it('getExistingArticleUrls returns matching URLs', () => {
    const feed = seedFeed()
    seedArticle(feed.id, { url: 'https://example.com/a' })
    seedArticle(feed.id, { url: 'https://example.com/b' })

    const existing = getExistingArticleUrls([
      'https://example.com/a',
      'https://example.com/c',
    ])
    expect(existing.has('https://example.com/a')).toBe(true)
    expect(existing.has('https://example.com/c')).toBe(false)
  })

  it('getExistingArticleUrls matches percent-encoded URLs with raw Unicode lookup', () => {
    const feed = seedFeed()
    seedArticle(feed.id, { url: 'https://example.com/%E8%A8%98%E4%BA%8B' })

    const existing = getExistingArticleUrls(['https://example.com/記事'])
    expect(existing.has('https://example.com/%E8%A8%98%E4%BA%8B')).toBe(true)
  })

  it('getExistingArticleUrls with empty array', () => {
    const result = getExistingArticleUrls([])
    expect(result.size).toBe(0)
  })

  it('getRetryArticles returns articles with last_error', () => {
    const feed = seedFeed()
    seedArticle(feed.id, {
      url: 'https://example.com/ok',
      full_text: 'text',
      summary: 'summary',
    })
    seedArticle(feed.id, {
      url: 'https://example.com/retry',
      last_error: 'fetch failed',
      full_text: null,
    })

    const retries = getRetryArticles()
    expect(retries).toHaveLength(1)
    expect(retries[0].url).toBe('https://example.com/retry')
  })
})

// --- Categories ---

describe('Categories', () => {
  it('createCategory auto-increments sort_order', () => {
    const cat1 = createCategory('First')
    const cat2 = createCategory('Second')
    expect(cat1.sort_order).toBe(0)
    expect(cat2.sort_order).toBe(1)
  })

  it('getCategories returns sorted list', () => {
    createCategory('Bravo')
    createCategory('Alpha')

    const cats = getCategories()
    expect(cats).toHaveLength(2)
    // sort_order 0, 1 so Bravo first
    expect(cats[0].name).toBe('Bravo')
    expect(cats[1].name).toBe('Alpha')
  })

  it('updateCategory changes name', () => {
    const cat = createCategory('Old')
    const updated = updateCategory(cat.id, { name: 'New' })
    expect(updated).toBeDefined()
    expect(updated!.name).toBe('New')
  })

  it('updateCategory changes collapsed', () => {
    const cat = createCategory('Test')
    const updated = updateCategory(cat.id, { collapsed: 1 })
    expect(updated!.collapsed).toBe(1)
  })

  it('updateCategory returns undefined for non-existent', () => {
    expect(updateCategory(9999, { name: 'X' })).toBeUndefined()
  })

  it('deleteCategory sets feeds category_id to NULL', () => {
    const cat = createCategory('ToDelete')
    const feed = seedFeed({ category_id: cat.id })

    expect(deleteCategory(cat.id)).toBe(true)

    const updatedFeed = getFeedById(feed.id)!
    expect(updatedFeed.category_id).toBeNull()
  })

  it('deleteCategory returns false for non-existent', () => {
    expect(deleteCategory(9999)).toBe(false)
  })

  it('markAllSeenByCategory marks articles in category feeds', () => {
    const cat = createCategory('News')
    const feed1 = seedFeed({ url: 'https://a.com', category_id: cat.id })
    const feed2 = seedFeed({ url: 'https://b.com' }) // no category

    seedArticle(feed1.id, { url: 'https://a.com/1' })
    seedArticle(feed1.id, { url: 'https://a.com/2' })
    seedArticle(feed2.id, { url: 'https://b.com/1' })

    const result = markAllSeenByCategory(cat.id)
    expect(result.updated).toBe(2)

    // feed2's article should still be unseen
    const { articles } = getArticles({ feedId: feed2.id, limit: 100, offset: 0 })
    expect(articles[0].seen_at).toBeNull()
  })
})

// --- Settings ---

describe('Settings', () => {
  it('upsertSetting and getSetting', () => {
    upsertSetting('theme', 'dark')
    expect(getSetting('theme')).toBe('dark')
  })

  it('upsertSetting overwrites existing value', () => {
    upsertSetting('theme', 'dark')
    upsertSetting('theme', 'light')
    expect(getSetting('theme')).toBe('light')
  })

  it('getSetting returns undefined for missing key', () => {
    expect(getSetting('nonexistent')).toBeUndefined()
  })

  it('deleteSetting removes the key', () => {
    upsertSetting('theme', 'dark')
    deleteSetting('theme')
    expect(getSetting('theme')).toBeUndefined()
  })
})

// --- Clip Feeds ---

describe('Clip Feeds', () => {
  it('ensureClipFeed creates clip feed', () => {
    const feed = ensureClipFeed()
    expect(feed).toBeDefined()
    expect(feed.name).toBe('Clips')
    expect(feed.url).toBe('clip://saved')
  })

  it('ensureClipFeed returns existing on second call', () => {
    const first = ensureClipFeed()
    const second = ensureClipFeed()
    expect(second.id).toBe(first.id)
  })

  it('getClipFeed returns undefined when none exists', () => {
    expect(getClipFeed()).toBeUndefined()
  })

  it('getClipFeed returns feed after creation', () => {
    ensureClipFeed()
    const feed = getClipFeed()
    expect(feed).toBeDefined()
    expect(feed!.url).toBe('clip://saved')
  })

  it('getEnabledFeeds excludes clip feeds', () => {
    seedFeed({ url: 'https://rss.example.com' })
    ensureClipFeed()

    const enabled = getEnabledFeeds()
    expect(enabled).toHaveLength(1)
    expect(enabled[0].url).toBe('https://rss.example.com')
  })
})

// --- Article deletion and image archiving ---

describe('Article image archiving & deletion', () => {
  it('markImagesArchived sets timestamp', () => {
    const feed = seedFeed()
    const id = seedArticle(feed.id)

    markImagesArchived(id)
    const article = getArticleById(id)!
    expect(article.images_archived_at).not.toBeNull()
  })

  it('clearImagesArchived clears timestamp', () => {
    const feed = seedFeed()
    const id = seedArticle(feed.id)

    markImagesArchived(id)
    clearImagesArchived(id)
    const article = getArticleById(id)!
    expect(article.images_archived_at).toBeNull()
  })

  it('deleteArticle returns true for existing article', () => {
    const feed = seedFeed()
    const id = seedArticle(feed.id)

    expect(deleteArticle(id)).toBe(true)
    expect(getArticleById(id)).toBeUndefined()
  })

  it('deleteArticle returns false for non-existent article', () => {
    expect(deleteArticle(99999)).toBe(false)
  })
})
