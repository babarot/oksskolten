import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setupTestDb } from '../__tests__/helpers/testDb.js'
import { getDb } from '../db/connection.js'

// Mock Meilisearch client. Each method is exposed individually so individual
// tests can override the return value (e.g. simulate "no indexes yet").
const mockWaitTask = vi.fn().mockResolvedValue({})
const mockUpdateDocuments = vi.fn().mockReturnValue({ waitTask: mockWaitTask })
const mockAddDocuments = vi.fn().mockReturnValue({ waitTask: mockWaitTask })
const mockUpdateSettings = vi.fn().mockReturnValue({ waitTask: mockWaitTask })
const mockGetStats = vi.fn()
const mockGetIndexes = vi.fn()
const mockCreateIndex = vi.fn().mockReturnValue({ waitTask: mockWaitTask })
const mockDeleteIndex = vi.fn().mockReturnValue({ waitTask: mockWaitTask })
const mockSwapIndexes = vi.fn().mockReturnValue({ waitTask: mockWaitTask })
vi.mock('./client.js', () => ({
  getSearchClient: () => ({
    getIndexes: mockGetIndexes,
    index: () => ({
      updateDocuments: mockUpdateDocuments,
      addDocuments: mockAddDocuments,
      updateSettings: mockUpdateSettings,
      getStats: mockGetStats,
    }),
    createIndex: mockCreateIndex,
    deleteIndex: mockDeleteIndex,
    swapIndexes: mockSwapIndexes,
  }),
  ARTICLES_INDEX: 'articles',
  ARTICLES_STAGING_INDEX: 'articles_staging',
}))

import { ensureSearchIndex, isSearchReady, syncAllScoredArticlesToSearch, _setRebuilding, _setSearchReady } from './sync.js'

function seedFeed(): number {
  return getDb().prepare(
    "INSERT INTO feeds (name, url) VALUES ('Test', 'https://example.com/feed')"
  ).run().lastInsertRowid as number
}

function seedArticle(feedId: number, opts: { url: string; published_at?: string }): number {
  return getDb().prepare(
    'INSERT INTO articles (feed_id, title, url, published_at) VALUES (?, ?, ?, ?)'
  ).run(feedId, 'Test Article', opts.url, opts.published_at ?? new Date().toISOString()).lastInsertRowid as number
}

describe('syncAllScoredArticlesToSearch', () => {
  beforeEach(() => {
    setupTestDb()
    mockUpdateDocuments.mockClear()
    mockWaitTask.mockClear()
    _setRebuilding(false)
  })

  it('syncs articles with engagement to Meilisearch and returns count', async () => {
    const feedId = seedFeed()
    const id1 = seedArticle(feedId, { url: 'https://example.com/1' })
    seedArticle(feedId, { url: 'https://example.com/2' })

    getDb().prepare("UPDATE articles SET liked_at = datetime('now'), score = 10.0 WHERE id = ?").run(id1)

    const synced = await syncAllScoredArticlesToSearch()

    expect(synced).toBe(1)
    expect(mockUpdateDocuments).toHaveBeenCalledTimes(1)
    const docs = mockUpdateDocuments.mock.calls[0][0] as { id: number; score: number }[]
    expect(docs).toHaveLength(1)
    expect(docs[0].id).toBe(id1)
    expect(docs[0].score).toBeGreaterThan(0)
    expect(mockWaitTask).toHaveBeenCalledTimes(1)
  })

  it('returns 0 when no articles qualify', async () => {
    const feedId = seedFeed()
    seedArticle(feedId, { url: 'https://example.com/no-engagement' })

    const synced = await syncAllScoredArticlesToSearch()

    expect(synced).toBe(0)
    expect(mockUpdateDocuments).not.toHaveBeenCalled()
  })

  it('includes articles with score > 0 but no engagement flags', async () => {
    const feedId = seedFeed()
    const id1 = seedArticle(feedId, { url: 'https://example.com/residual' })

    getDb().prepare('UPDATE articles SET score = 5.0 WHERE id = ?').run(id1)

    await syncAllScoredArticlesToSearch()

    expect(mockUpdateDocuments).toHaveBeenCalledTimes(1)
    const docs = mockUpdateDocuments.mock.calls[0][0] as { id: number; score: number }[]
    expect(docs).toHaveLength(1)
    expect(docs[0].id).toBe(id1)
  })

  it('syncs multiple qualifying articles in one call', async () => {
    const feedId = seedFeed()
    const id1 = seedArticle(feedId, { url: 'https://example.com/a' })
    const id2 = seedArticle(feedId, { url: 'https://example.com/b' })
    const id3 = seedArticle(feedId, { url: 'https://example.com/c' })

    getDb().prepare("UPDATE articles SET liked_at = datetime('now'), score = 10.0 WHERE id = ?").run(id1)
    getDb().prepare("UPDATE articles SET bookmarked_at = datetime('now'), score = 5.0 WHERE id = ?").run(id2)
    getDb().prepare("UPDATE articles SET read_at = datetime('now'), score = 2.0 WHERE id = ?").run(id3)

    await syncAllScoredArticlesToSearch()

    expect(mockUpdateDocuments).toHaveBeenCalledTimes(1)
    const docs = mockUpdateDocuments.mock.calls[0][0] as { id: number; score: number }[]
    expect(docs).toHaveLength(3)
    const ids = docs.map(d => d.id).sort()
    expect(ids).toEqual([id1, id2, id3].sort())
  })

  it('returns 0 and skips sync when index rebuild is in progress', async () => {
    const feedId = seedFeed()
    const id1 = seedArticle(feedId, { url: 'https://example.com/rebuilding' })
    getDb().prepare("UPDATE articles SET liked_at = datetime('now'), score = 10.0 WHERE id = ?").run(id1)

    _setRebuilding(true)

    const synced = await syncAllScoredArticlesToSearch()

    expect(synced).toBe(0)
    expect(mockUpdateDocuments).not.toHaveBeenCalled()
  })

  it('sends only id and score fields to Meilisearch', async () => {
    const feedId = seedFeed()
    const id1 = seedArticle(feedId, { url: 'https://example.com/fields' })
    getDb().prepare("UPDATE articles SET liked_at = datetime('now'), score = 7.5 WHERE id = ?").run(id1)

    await syncAllScoredArticlesToSearch()

    const docs = mockUpdateDocuments.mock.calls[0][0] as Record<string, unknown>[]
    expect(Object.keys(docs[0]).sort()).toEqual(['id', 'score'])
  })
})

describe('ensureSearchIndex', () => {
  beforeEach(() => {
    setupTestDb()
    mockGetIndexes.mockReset()
    mockGetStats.mockReset()
    mockCreateIndex.mockClear()
    mockDeleteIndex.mockClear()
    mockAddDocuments.mockClear()
    mockSwapIndexes.mockClear()
    mockUpdateSettings.mockClear()
    mockUpdateDocuments.mockClear()
    mockWaitTask.mockClear()
    _setRebuilding(false)
    _setSearchReady(false)
  })

  it('skips rebuild when the articles index already has documents and reapplies settings idempotently', async () => {
    mockGetIndexes.mockResolvedValue({ results: [{ uid: 'articles' }] })
    mockGetStats.mockResolvedValue({ numberOfDocuments: 42 })

    await ensureSearchIndex()

    expect(isSearchReady()).toBe(true)
    // Skipping means we never touch the heavy create / swap operations.
    expect(mockCreateIndex).not.toHaveBeenCalled()
    expect(mockDeleteIndex).not.toHaveBeenCalled()
    expect(mockAddDocuments).not.toHaveBeenCalled()
    // Settings must still be reapplied so a redeploy that changed the
    // schema (new filterable attribute, etc.) picks it up without waiting
    // for the 6h cron rebuild.
    expect(mockUpdateSettings).toHaveBeenCalledTimes(1)
    const appliedSettings = mockUpdateSettings.mock.calls[0][0] as Record<string, unknown>
    expect(appliedSettings).toHaveProperty('filterableAttributes')
    expect(appliedSettings).toHaveProperty('searchableAttributes')
  })

  it('falls through to rebuild when the articles index is missing', async () => {
    mockGetIndexes.mockResolvedValue({ results: [] })

    await ensureSearchIndex()

    expect(mockCreateIndex).toHaveBeenCalled()
  })

  it('falls through to rebuild when the articles index is empty', async () => {
    mockGetIndexes.mockResolvedValue({ results: [{ uid: 'articles' }] })
    mockGetStats.mockResolvedValue({ numberOfDocuments: 0 })

    await ensureSearchIndex()

    expect(mockCreateIndex).toHaveBeenCalled()
  })

  it('falls through to rebuild when the existence check throws', async () => {
    // Meilisearch transient failure on the first existence check; the
    // function should still try a rebuild rather than declaring search
    // ready against an unknown state.
    mockGetIndexes.mockRejectedValueOnce(new Error('connection refused'))
    mockGetIndexes.mockResolvedValue({ results: [] })

    await ensureSearchIndex()

    expect(mockCreateIndex).toHaveBeenCalled()
  })

  it('throws when the fallthrough rebuild fails so the startup retry loop can back off', async () => {
    // No indexes exist, so ensureSearchIndex must fall through to rebuild.
    // Make rebuildSearchIndex hit a hard failure that its internal catch
    // will swallow without setting searchReady. ensureSearchIndex must
    // surface that as a thrown error to its caller.
    mockGetIndexes.mockResolvedValueOnce({ results: [] }) // ensure check: no articles
    mockGetIndexes.mockRejectedValueOnce(new Error('meili down')) // rebuild's own check

    await expect(ensureSearchIndex()).rejects.toThrow(/rebuild/i)
    expect(isSearchReady()).toBe(false)
  })
})
