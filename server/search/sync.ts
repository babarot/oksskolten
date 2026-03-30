import { getSearchClient, ARTICLES_INDEX, ARTICLES_STAGING_INDEX, type MeiliArticleDoc } from './client.js'
import { getDb } from '../db/connection.js'
import { SCORED_ARTICLES_WHERE } from '../db/articles.js'
import { logger } from '../logger.js'

const log = logger.child('search')

// --- State ---

let searchReady = false
let rebuilding = false

export function isSearchReady(): boolean {
  return searchReady
}

/** @internal Test-only helper to control rebuilding flag */
export function _setRebuilding(value: boolean): void {
  rebuilding = value
}

// --- Change log for rebuild consistency ---

type ChangeEntry =
  | { action: 'upsert'; id: number; doc: MeiliArticleDoc }
  | { action: 'delete'; id: number }

let changeLog: ChangeEntry[] | null = null

// --- Index settings ---

const INDEX_SETTINGS = {
  searchableAttributes: ['title', 'full_text', 'full_text_translated'],
  filterableAttributes: ['user_id', 'feed_id', 'category_id', 'lang', 'published_at', 'is_unread', 'is_liked', 'is_bookmarked'],
  sortableAttributes: ['published_at', 'score'],
  rankingRules: ['words', 'typo', 'proximity', 'attribute', 'sort', 'exactness'],
}

// --- Rebuild ---

const BATCH_SIZE = 1000

export async function rebuildSearchIndex(): Promise<void> {
  if (rebuilding) {
    log.info('Rebuild already in progress, skipping')
    return
  }
  rebuilding = true
  changeLog = []

  try {
    const client = getSearchClient()
    const startedAt = Date.now()

    // Collect existing index UIDs to avoid 404 requests
    const { results: existingIndexes } = await client.getIndexes()
    const indexSet = new Set(existingIndexes.map((idx: { uid: string }) => idx.uid))

    // 1. Create or reset staging index
    if (indexSet.has(ARTICLES_STAGING_INDEX)) {
      await client.deleteIndex(ARTICLES_STAGING_INDEX).waitTask({ timeout: 60_000 })
    }
    await client.createIndex(ARTICLES_STAGING_INDEX, { primaryKey: 'id' }).waitTask({ timeout: 60_000 })

    // 2. Apply index settings to staging
    const stagingIndex = client.index(ARTICLES_STAGING_INDEX)
    await stagingIndex.updateSettings(INDEX_SETTINGS).waitTask({ timeout: 60_000 })

    // 3. Fetch all articles from SQLite and batch-insert into staging
    const rows = getDb().prepare(`
      SELECT id, user_id, feed_id, category_id, title,
             COALESCE(full_text, '') AS full_text,
             COALESCE(full_text_translated, '') AS full_text_translated,
             lang,
             COALESCE(CAST(strftime('%s', published_at) AS INTEGER), 0) AS published_at,
             COALESCE(score, 0) AS score,
             (seen_at IS NULL) AS is_unread,
             (liked_at IS NOT NULL) AS is_liked,
             (bookmarked_at IS NOT NULL) AS is_bookmarked
      FROM active_articles
    `).all() as MeiliArticleDoc[]

    // SQLite returns 0/1 for boolean expressions; Meilisearch needs true/false
    const docs = rows.map((row) => ({
      ...row,
      is_unread: Boolean(row.is_unread),
      is_liked: Boolean(row.is_liked),
      is_bookmarked: Boolean(row.is_bookmarked),
    }))

    for (let i = 0; i < docs.length; i += BATCH_SIZE) {
      const batch = docs.slice(i, i + BATCH_SIZE)
      await stagingIndex.addDocuments(batch).waitTask({ timeout: 60_000 })
    }

    // 4. Promote staging to production
    if (indexSet.has(ARTICLES_INDEX)) {
      // Swap articles <-> articles_staging, then clean up old data
      await client.swapIndexes([
        { indexes: [ARTICLES_INDEX, ARTICLES_STAGING_INDEX] } as any,
      ]).waitTask({ timeout: 60_000 })
      await client.deleteIndex(ARTICLES_STAGING_INDEX).waitTask({ timeout: 60_000 })
    } else {
      // First run: no existing articles index — create empty one for swap
      await client.createIndex(ARTICLES_INDEX, { primaryKey: 'id' }).waitTask({ timeout: 60_000 })
      await client.swapIndexes([
        { indexes: [ARTICLES_INDEX, ARTICLES_STAGING_INDEX] } as any,
      ]).waitTask({ timeout: 60_000 })
      await client.deleteIndex(ARTICLES_STAGING_INDEX).waitTask({ timeout: 60_000 })
    }

    // 5. Replay change log
    if (changeLog && changeLog.length > 0) {
      const prodIndex = client.index(ARTICLES_INDEX)
      const upserts = changeLog.filter((e): e is Extract<ChangeEntry, { action: 'upsert' }> => e.action === 'upsert')
      const deletes = changeLog.filter((e): e is Extract<ChangeEntry, { action: 'delete' }> => e.action === 'delete')

      if (upserts.length > 0) {
        await prodIndex.addDocuments(upserts.map((e) => e.doc)).waitTask({ timeout: 60_000 })
      }
      for (const del of deletes) {
        await prodIndex.deleteDocument(del.id)
      }
    }

    searchReady = true
    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1)
    log.info(`Index rebuild complete: ${docs.length} articles in ${elapsed}s`)
  } catch (err) {
    // On failure: keep searchReady as-is (true if previously built, false if first time)
    log.error('Index rebuild failed:', err)
  } finally {
    changeLog = null
    rebuilding = false
  }
}

// --- Fire-and-forget sync helpers ---

export function syncArticleToSearch(doc: MeiliArticleDoc): void {
  try {
    const client = getSearchClient()
    const index = client.index(ARTICLES_INDEX)
    index.addDocuments([doc]).catch((err) => {
      log.error('Failed to sync article:', err)
    })

    if (changeLog) {
      changeLog.push({ action: 'upsert', id: doc.id, doc })
    }
  } catch (err) {
    log.error('Failed to sync article:', err)
  }
}

export function deleteArticleFromSearch(id: number): void {
  try {
    const client = getSearchClient()
    const index = client.index(ARTICLES_INDEX)
    index.deleteDocument(id).catch((err) => {
      log.error('Failed to delete article from index:', err)
    })

    if (changeLog) {
      changeLog.push({ action: 'delete', id })
    }
  } catch (err) {
    log.error('Failed to delete article from index:', err)
  }
}

export function syncArticleScoreToSearch(id: number, score: number): void {
  try {
    const client = getSearchClient()
    const index = client.index(ARTICLES_INDEX)
    index.updateDocuments([{ id, score }]).catch((err) => {
      log.error('Failed to sync score:', err)
    })
  } catch (err) {
    log.error('Failed to sync score:', err)
  }
}

export function syncArticleFiltersToSearch(updates: { id: number; is_unread?: boolean; is_liked?: boolean; is_bookmarked?: boolean }[]): void {
  if (updates.length === 0) return
  try {
    const client = getSearchClient()
    const index = client.index(ARTICLES_INDEX)
    index.updateDocuments(updates).catch((err) => {
      log.error('Failed to sync article filters:', err)
    })
  } catch (err) {
    log.error('Failed to sync article filters:', err)
  }
}

export function deleteArticlesFromSearch(articleIds: number[]): void {
  if (articleIds.length === 0) return
  try {
    const client = getSearchClient()
    const index = client.index(ARTICLES_INDEX)
    index.deleteDocuments({ filter: `id IN [${articleIds.join(',')}]` }).catch((err) => {
      log.error('Failed to batch delete articles:', err)
    })

    if (changeLog) {
      for (const id of articleIds) {
        changeLog.push({ action: 'delete', id })
      }
    }
  } catch (err) {
    log.error('Failed to batch delete articles:', err)
  }
}

/**
 * Bulk-sync scores for all articles that have engagement or a non-zero score.
 * Uses the shared SCORED_ARTICLES_WHERE clause from server/db/articles.ts.
 * Called after the daily score recalculation batch to keep Meilisearch in sync.
 * Skips if an index rebuild is in progress (the rebuild will include fresh scores).
 */
export async function syncAllScoredArticlesToSearch(): Promise<number> {
  if (rebuilding) {
    log.info('Index rebuild in progress, skipping score sync')
    return 0
  }

  const rows = getDb().prepare(`
    SELECT id, score FROM active_articles
    WHERE ${SCORED_ARTICLES_WHERE}
  `).all() as { id: number; score: number }[]

  if (rows.length === 0) return 0

  const client = getSearchClient()
  const index = client.index(ARTICLES_INDEX)

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE)
    await index.updateDocuments(batch.map(({ id, score }) => ({ id, score }))).waitTask({ timeout: 60_000 })
  }

  return rows.length
}

export function syncArticlesByFeedToSearch(docs: MeiliArticleDoc[]): void {
  if (docs.length === 0) return
  try {
    const client = getSearchClient()
    const index = client.index(ARTICLES_INDEX)
    index.addDocuments(docs).catch((err) => {
      log.error('Failed to batch sync articles:', err)
    })

    if (changeLog) {
      for (const doc of docs) {
        changeLog.push({ action: 'upsert', id: doc.id, doc })
      }
    }
  } catch (err) {
    log.error('Failed to batch sync articles:', err)
  }
}
