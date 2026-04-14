import { getDb, runNamed, getNamed, allNamed } from './connection.js'
import type { Article, ArticleListItem, ArticleDetail } from './types.js'
import type { MeiliArticleDoc } from '../search/client.js'
import { syncArticleToSearch, deleteArticleFromSearch, deleteArticlesFromSearch, syncArticleScoreToSearch, syncArticleFiltersToSearch } from '../search/sync.js'
import { RETRY_MAX_ATTEMPTS, RETRY_BATCH_LIMIT } from '../fetcher/util.js'
import { deleteArticleImages } from '../fetcher/article-images.js'
import { logger } from '../logger.js'

const log = logger.child('retention')

/** Normalize a URL so that raw-Unicode and percent-encoded forms compare equal. */
function normalizeUrl(raw: string): string {
  try { return new URL(raw).href } catch { return raw }
}

function buildMeiliDoc(id: number): MeiliArticleDoc | null {
  const row = getDb().prepare(`
    SELECT id, feed_id, category_id, title,
           COALESCE(full_text, '') AS full_text,
           COALESCE(full_text_translated, '') AS full_text_translated,
           lang,
           COALESCE(CAST(strftime('%s', published_at) AS INTEGER), 0) AS published_at,
           COALESCE(score, 0) AS score,
           (seen_at IS NULL) AS is_unread,
           (liked_at IS NOT NULL) AS is_liked,
           (bookmarked_at IS NOT NULL) AS is_bookmarked
    FROM articles WHERE id = ?
  `).get(id) as MeiliArticleDoc | undefined
  return row ?? null
}

// --- Score computation ---

const SCORE_DECAY_FACTOR = 0.05
const SEARCH_BOOST_FACTOR = 5.0

/**
 * Build the engagement × decay score SQL expression.
 * @param prefix - table alias (e.g. 'a.') for JOIN queries, or '' for single-table UPDATE
 */
function scoreExpr(prefix: string, opts?: { searchBoost?: boolean }): string {
  const p = prefix
  const engagement = `(
    (CASE WHEN ${p}liked_at IS NOT NULL THEN 10 ELSE 0 END)
    + (CASE WHEN ${p}bookmarked_at IS NOT NULL THEN 5 ELSE 0 END)
    + (CASE WHEN ${p}full_text_translated IS NOT NULL THEN 3 ELSE 0 END)
    + (CASE WHEN ${p}read_at IS NOT NULL THEN 2 ELSE 0 END)
  )`
  const decay = `(1.0 / (1.0 + (julianday('now') - julianday(
    COALESCE(${p}read_at, ${p}published_at, ${p}fetched_at)
  )) * ${SCORE_DECAY_FACTOR}))`
  const boost = opts?.searchBoost ? ` * ${SEARCH_BOOST_FACTOR}` : ''
  return `(${engagement} * ${decay}${boost})`
}

/** WHERE clause for articles that have engagement or a non-zero score. Shared with search sync. */
export const SCORED_ARTICLES_WHERE = `(
  liked_at IS NOT NULL
  OR bookmarked_at IS NOT NULL
  OR read_at IS NOT NULL
  OR full_text_translated IS NOT NULL
  OR score > 0
)`

/** Update score in DB and sync to search. Call within a transaction for atomicity. */
function updateScoreDb(id: number): void {
  getDb().prepare(`UPDATE articles SET score = (${scoreExpr('')}) WHERE id = ?`).run(id)
}

function syncScoreToSearch(id: number): void {
  const row = getDb().prepare('SELECT score FROM articles WHERE id = ?').get(id) as { score: number } | undefined
  if (row) syncArticleScoreToSearch(id, row.score)
}

export function updateScore(id: number): void {
  updateScoreDb(id)
  syncScoreToSearch(id)
}

export function recalculateScores(): { updated: number } {
  const result = getDb().prepare(`
    UPDATE articles SET score = (${scoreExpr('')})
    WHERE id IN (SELECT id FROM active_articles) AND ${SCORED_ARTICLES_WHERE}
  `).run()
  return { updated: result.changes }
}

// --- Article list queries ---

export function getArticles(opts: {
  feedId?: number
  categoryId?: number
  unread?: boolean
  bookmarked?: boolean
  liked?: boolean
  read?: boolean
  sort?: 'score'
  limit: number
  offset: number
  smartFloor?: boolean
}): { articles: ArticleListItem[]; total: number; totalWithoutFloor?: number } {
  const conditions: string[] = []
  const params: Record<string, unknown> = {}

  if (opts.feedId) {
    conditions.push('a.feed_id = @feedId')
    params.feedId = opts.feedId
  }
  if (opts.categoryId) {
    conditions.push('a.category_id = @categoryId')
    params.categoryId = opts.categoryId
  }
  if (opts.unread) {
    conditions.push('a.seen_at IS NULL')
  }
  if (opts.bookmarked) {
    conditions.push('a.bookmarked_at IS NOT NULL')
  }
  if (opts.liked) {
    conditions.push('a.liked_at IS NOT NULL')
  }
  if (opts.read) {
    conditions.push('a.read_at IS NOT NULL')
  }

  // Smart floor: limit the displayed range to keep lists manageable.
  // Pick the floor that yields the MOST articles (= earliest date) among:
  //   1. SMART_FLOOR_DAYS ago
  //   2. SMART_FLOOR_MIN_ARTICLES-th newest article's date
  //   3. Oldest unread article's date (if any)
  const SMART_FLOOR_DAYS = 7
  const SMART_FLOOR_MIN_ARTICLES = 20

  let floorApplied = false

  if (opts.smartFloor) {
    const scopeWhere = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : ''

    // Candidate 1: SMART_FLOOR_DAYS ago
    const floorAgo = new Date(Date.now() - SMART_FLOOR_DAYS * 24 * 60 * 60 * 1000).toISOString()

    // Candidate 2: SMART_FLOOR_MIN_ARTICLES-th newest article's date
    const top20Row = getNamed<{ floor: string | null }>(`
      SELECT a.published_at AS floor FROM active_articles a
      ${scopeWhere}
      ORDER BY a.published_at DESC
      LIMIT 1 OFFSET ${SMART_FLOOR_MIN_ARTICLES - 1}
    `, params)

    // Candidate 3: oldest unread article's date
    const unreadRow = getNamed<{ floor: string | null }>(`
      SELECT MIN(a.published_at) AS floor FROM active_articles a
      ${scopeWhere ? scopeWhere + ' AND' : 'WHERE'} a.seen_at IS NULL AND a.published_at IS NOT NULL
    `, params)

    // If fewer than SMART_FLOOR_MIN_ARTICLES exist, skip the floor entirely — show all
    if (!top20Row?.floor) {
      // no-op: don't add a date condition
    } else {
      // Pick the earliest (= shows the most articles)
      const candidates: string[] = [floorAgo, top20Row.floor]
      if (unreadRow?.floor) candidates.push(unreadRow.floor)
      const smartFloorDate = candidates.sort()[0]

      conditions.push('(a.published_at IS NULL OR a.published_at >= @smartFloorDate)')
      params.smartFloorDate = smartFloorDate
      floorApplied = true
    }
  }

  // Count without floor for "show more" UI
  const baseWhere = floorApplied
    ? (() => {
        const baseConditions = conditions.filter(c => !c.includes('@smartFloorDate'))
        return baseConditions.length > 0 ? 'WHERE ' + baseConditions.join(' AND ') : ''
      })()
    : undefined

  const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : ''
  const orderBy = opts.sort === 'score'
    ? 'a.score DESC, a.published_at DESC'
    : opts.liked ? 'a.liked_at DESC' : opts.read ? 'a.read_at DESC' : 'a.published_at DESC'

  const totalRow = getNamed<{ cnt: number }>(`
    SELECT COUNT(*) AS cnt FROM active_articles a ${where}
  `, params)
  const total = totalRow.cnt

  const totalWithoutFloor = baseWhere != null
    ? getNamed<{ cnt: number }>(`SELECT COUNT(*) AS cnt FROM active_articles a ${baseWhere}`, params).cnt
    : undefined

  const articles = allNamed<ArticleListItem>(`
    SELECT a.id, a.feed_id, f.name AS feed_name,
           a.title, a.url, a.published_at, a.lang, a.summary, a.excerpt, a.og_image, a.seen_at, a.read_at, a.bookmarked_at, a.liked_at,
           a.score,
           (SELECT COUNT(*) FROM article_similarities WHERE article_id = a.id) AS similar_count
    FROM active_articles a
    JOIN feeds f ON a.feed_id = f.id
    ${where}
    ORDER BY ${orderBy}
    LIMIT @_limit OFFSET @_offset
  `, { ...params, _limit: Number(opts.limit), _offset: Number(opts.offset) })

  return { articles, total, ...(totalWithoutFloor != null && totalWithoutFloor > total ? { totalWithoutFloor } : {}) }
}

export function getArticleByUrl(url: string): ArticleDetail | undefined {
  return getDb().prepare(`
    SELECT a.id, a.feed_id, f.name AS feed_name, f.type AS feed_type,
           a.title, a.url, a.published_at, a.lang, a.summary, a.excerpt, a.og_image,
           a.full_text, a.full_text_translated, a.translated_lang, a.seen_at, a.read_at, a.bookmarked_at, a.liked_at,
           a.images_archived_at,
           (SELECT COUNT(*) FROM article_similarities WHERE article_id = a.id) AS similar_count
    FROM active_articles a
    JOIN feeds f ON a.feed_id = f.id
    WHERE a.url = ?
  `).get(normalizeUrl(url)) as ArticleDetail | undefined
}

export function getArticleById(id: number): ArticleDetail | undefined {
  return getDb().prepare(`
    SELECT a.id, a.feed_id, f.name AS feed_name, f.type AS feed_type,
           a.title, a.url, a.published_at, a.lang, a.summary, a.excerpt, a.og_image,
           a.full_text, a.full_text_translated, a.translated_lang, a.seen_at, a.read_at, a.bookmarked_at, a.liked_at,
           a.images_archived_at,
           (SELECT COUNT(*) FROM article_similarities WHERE article_id = a.id) AS similar_count
    FROM active_articles a
    JOIN feeds f ON a.feed_id = f.id
    WHERE a.id = ?
  `).get(id) as ArticleDetail | undefined
}

export function markArticleSeen(
  id: number,
  seen: boolean,
): { seen_at: string | null; read_at: string | null } | undefined {
  const row = getDb().transaction(() => {
    if (seen) {
      getDb().prepare("UPDATE articles SET seen_at = datetime('now') WHERE id = ? AND seen_at IS NULL").run(id)
    } else {
      getDb().prepare('UPDATE articles SET seen_at = NULL, read_at = NULL WHERE id = ?').run(id)
      updateScoreDb(id)
    }
    return getDb().prepare('SELECT seen_at, read_at FROM articles WHERE id = ?').get(id) as { seen_at: string | null; read_at: string | null } | undefined
  })()
  if (!seen) syncScoreToSearch(id)
  syncArticleFiltersToSearch([{ id, is_unread: !seen }])
  if (!row) return undefined
  return { seen_at: row.seen_at, read_at: row.read_at }
}

export function markArticlesSeen(ids: number[]): { updated: number } {
  if (ids.length === 0) return { updated: 0 }
  const placeholders = ids.map(() => '?').join(',')
  const result = getDb().prepare(
    `UPDATE articles SET seen_at = datetime('now') WHERE id IN (${placeholders}) AND seen_at IS NULL`,
  ).run(...ids)
  if (result.changes > 0) {
    syncArticleFiltersToSearch(ids.map(id => ({ id, is_unread: false })))
  }
  return { updated: result.changes }
}

export function markAllSeenByFeed(feedId: number): { updated: number } {
  // Collect affected IDs before update for search sync
  const affectedIds = (getDb().prepare(
    'SELECT id FROM active_articles WHERE feed_id = ? AND seen_at IS NULL',
  ).all(feedId) as { id: number }[]).map(r => r.id)
  const result = getDb().prepare("UPDATE articles SET seen_at = datetime('now') WHERE feed_id = ? AND seen_at IS NULL AND purged_at IS NULL").run(feedId)
  if (affectedIds.length > 0) {
    syncArticleFiltersToSearch(affectedIds.map(id => ({ id, is_unread: false })))
  }
  return { updated: result.changes }
}

export function markArticleLiked(
  id: number,
  liked: boolean,
): { liked_at: string | null } | undefined {
  const row = getDb().transaction(() => {
    if (liked) {
      getDb().prepare("UPDATE articles SET liked_at = datetime('now') WHERE id = ? AND liked_at IS NULL").run(id)
    } else {
      getDb().prepare('UPDATE articles SET liked_at = NULL WHERE id = ?').run(id)
    }
    updateScoreDb(id)
    return getDb().prepare('SELECT liked_at FROM articles WHERE id = ?').get(id) as { liked_at: string | null } | undefined
  })()
  syncScoreToSearch(id)
  syncArticleFiltersToSearch([{ id, is_liked: liked }])
  if (!row) return undefined
  return { liked_at: row.liked_at }
}

export function getLikeCount(): number {
  const row = getDb().prepare('SELECT COUNT(*) AS cnt FROM active_articles WHERE liked_at IS NOT NULL').get() as { cnt: number }
  return row.cnt
}

export function markArticleBookmarked(
  id: number,
  bookmarked: boolean,
): { bookmarked_at: string | null } | undefined {
  const row = getDb().transaction(() => {
    if (bookmarked) {
      getDb().prepare("UPDATE articles SET bookmarked_at = datetime('now') WHERE id = ? AND bookmarked_at IS NULL").run(id)
    } else {
      getDb().prepare('UPDATE articles SET bookmarked_at = NULL WHERE id = ?').run(id)
    }
    updateScoreDb(id)
    return getDb().prepare('SELECT bookmarked_at FROM articles WHERE id = ?').get(id) as { bookmarked_at: string | null } | undefined
  })()
  syncScoreToSearch(id)
  syncArticleFiltersToSearch([{ id, is_bookmarked: bookmarked }])
  if (!row) return undefined
  return { bookmarked_at: row.bookmarked_at }
}

export function getBookmarkCount(): number {
  const row = getDb().prepare('SELECT COUNT(*) AS cnt FROM active_articles WHERE bookmarked_at IS NOT NULL').get() as { cnt: number }
  return row.cnt
}

export function recordArticleRead(
  id: number,
): { seen_at: string | null; read_at: string | null } | undefined {
  const row = getDb().transaction(() => {
    getDb().prepare(
      "UPDATE articles SET read_at = datetime('now'), seen_at = COALESCE(seen_at, datetime('now')) WHERE id = ?",
    ).run(id)
    updateScoreDb(id)
    return getDb().prepare('SELECT seen_at, read_at FROM articles WHERE id = ?').get(id) as { seen_at: string | null; read_at: string | null } | undefined
  })()
  syncScoreToSearch(id)
  syncArticleFiltersToSearch([{ id, is_unread: false }])
  return row ? { seen_at: row.seen_at, read_at: row.read_at } : undefined
}

export function insertArticle(data: {
  feed_id: number
  title: string
  url: string
  published_at: string | null
  lang?: string | null
  full_text?: string | null
  full_text_translated?: string | null
  translated_lang?: string | null
  summary?: string | null
  excerpt?: string | null
  og_image?: string | null
  last_error?: string | null
}): number {
  const info = runNamed(`
    INSERT INTO articles (feed_id, category_id, title, url, published_at, lang, full_text, full_text_translated, translated_lang, summary, excerpt, og_image, last_error)
    VALUES (@feed_id, (SELECT category_id FROM feeds WHERE id = @feed_id), @title, @url, @published_at, @lang, @full_text, @full_text_translated, @translated_lang, @summary, @excerpt, @og_image, @last_error)
  `, {
    feed_id: data.feed_id,
    title: data.title,
    url: data.url,
    published_at: data.published_at,
    lang: data.lang ?? null,
    full_text: data.full_text ?? null,
    full_text_translated: data.full_text_translated ?? null,
    translated_lang: data.translated_lang ?? null,
    summary: data.summary ?? null,
    excerpt: data.excerpt ?? null,
    og_image: data.og_image ?? null,
    last_error: data.last_error ?? null,
  })
  const articleId = info.lastInsertRowid as number
  const doc = buildMeiliDoc(articleId)
  if (doc) syncArticleToSearch(doc)
  return articleId
}

export function updateArticleContent(
  articleId: number,
  data: {
    lang?: string | null
    full_text?: string | null
    full_text_translated?: string | null
    translated_lang?: string | null
    summary?: string | null
    excerpt?: string | null
    og_image?: string | null
    last_error?: string | null
    retry_count?: number
    last_retry_at?: string | null
  },
): void {
  const fields: string[] = []
  const params: Record<string, unknown> = { id: articleId }

  for (const [key, val] of Object.entries(data)) {
    if (val !== undefined) {
      fields.push(`${key} = @${key}`)
      params[key] = val
    }
  }
  if (fields.length === 0) return
  runNamed(`UPDATE articles SET ${fields.join(', ')} WHERE id = @id`, params)
  const doc = buildMeiliDoc(articleId)
  if (doc) syncArticleToSearch(doc)
}

export function getExistingArticleUrls(urls: string[]): Set<string> {
  if (urls.length === 0) return new Set()
  const normalized = urls.map(normalizeUrl)
  const placeholders = normalized.map(() => '?').join(',')
  const rows = getDb().prepare(
    `SELECT url FROM articles WHERE url IN (${placeholders})`,
  ).all(...normalized) as { url: string }[]
  return new Set(rows.map(r => r.url))
}

// Backoff deadline: datetime when the article becomes eligible for retry again.
// 30 * 2^retry_count minutes, clamped to 32 hours via MIN(retry_count, 6).
const BACKOFF_DEADLINE = `datetime(last_retry_at, '+' || (30 * (1 << MIN(retry_count, 6))) || ' minutes')`

export function getRetryArticles(
  maxAttempts = RETRY_MAX_ATTEMPTS,
  batchLimit = RETRY_BATCH_LIMIT,
): Article[] {
  return getDb().prepare(`
    SELECT * FROM active_articles
    WHERE last_error IS NOT NULL
      AND full_text IS NULL
      AND retry_count < :max_attempts
      AND (
        last_retry_at IS NULL
        OR ${BACKOFF_DEADLINE} <= datetime('now')
      )
    ORDER BY retry_count ASC, last_retry_at ASC
    LIMIT :batch_limit
  `).all({ max_attempts: maxAttempts, batch_limit: batchLimit }) as Article[]
}

export interface RetryStats {
  eligible: number
  backoff_waiting: number
  exceeded: number
}

export function getRetryStats(maxAttempts = RETRY_MAX_ATTEMPTS): RetryStats {
  const row = getDb().prepare(`
    SELECT
      SUM(CASE WHEN retry_count < :max_attempts AND (
        last_retry_at IS NULL
        OR ${BACKOFF_DEADLINE} <= datetime('now')
      ) THEN 1 ELSE 0 END) AS eligible,
      SUM(CASE WHEN retry_count < :max_attempts AND
        last_retry_at IS NOT NULL AND
        ${BACKOFF_DEADLINE} > datetime('now')
      THEN 1 ELSE 0 END) AS backoff_waiting,
      SUM(CASE WHEN retry_count >= :max_attempts THEN 1 ELSE 0 END) AS exceeded
    FROM active_articles
    WHERE last_error IS NOT NULL AND full_text IS NULL
  `).get({ max_attempts: maxAttempts }) as { eligible: number | null; backoff_waiting: number | null; exceeded: number | null }
  return {
    eligible: row.eligible ?? 0,
    backoff_waiting: row.backoff_waiting ?? 0,
    exceeded: row.exceeded ?? 0,
  }
}

// --- Search by IDs (Meilisearch integration) ---

export function getArticlesByIds(
  ids: number[],
  opts?: { unread?: boolean; liked?: boolean; bookmarked?: boolean },
): ArticleListItem[] {
  if (ids.length === 0) return []
  const placeholders = ids.map(() => '?').join(',')
  const orderCase = ids.map((id, i) => `WHEN ${id} THEN ${i}`).join(' ')

  const conditions: string[] = [`a.id IN (${placeholders})`]
  if (opts?.unread !== undefined) {
    conditions.push(opts.unread ? 'a.seen_at IS NULL' : 'a.seen_at IS NOT NULL')
  }
  if (opts?.liked) conditions.push('a.liked_at IS NOT NULL')
  if (opts?.bookmarked) conditions.push('a.bookmarked_at IS NOT NULL')

  const where = 'WHERE ' + conditions.join(' AND ')
  const score = scoreExpr('a.')

  return getDb().prepare(`
    SELECT a.id, a.feed_id, f.name AS feed_name,
           a.title, a.url, a.published_at, a.lang, a.summary, a.excerpt,
           a.og_image, a.seen_at, a.read_at, a.bookmarked_at, a.liked_at,
           ${score} AS score
    FROM active_articles a
    JOIN feeds f ON a.feed_id = f.id
    ${where}
    ORDER BY CASE a.id ${orderCase} END
  `).all(...ids) as ArticleListItem[]
}

// --- Search queries ---

export function searchArticles(opts: {
  query?: string
  feed_id?: number
  category_id?: number
  unread?: boolean
  bookmarked?: boolean
  liked?: boolean
  since?: string
  until?: string
  limit?: number
  sort?: 'published_at' | 'score'
}): ArticleListItem[] {
  const conditions: string[] = []
  const params: Record<string, unknown> = {}

  if (opts.feed_id) {
    conditions.push('a.feed_id = @feed_id')
    params.feed_id = opts.feed_id
  }
  if (opts.category_id) {
    conditions.push('a.category_id = @category_id')
    params.category_id = opts.category_id
  }
  if (opts.unread !== undefined) {
    conditions.push(opts.unread ? 'a.seen_at IS NULL' : 'a.seen_at IS NOT NULL')
  }
  if (opts.bookmarked) {
    conditions.push('a.bookmarked_at IS NOT NULL')
  }
  if (opts.liked) {
    conditions.push('a.liked_at IS NOT NULL')
  }
  if (opts.since) {
    conditions.push('a.published_at >= @since')
    params.since = opts.since
  }
  if (opts.until) {
    conditions.push('a.published_at <= @until')
    params.until = opts.until
  }

  const hasQuery = !!opts.query

  if (hasQuery) {
    const likePattern = `%${opts.query}%`
    conditions.push('(a.title LIKE @likeQuery OR a.full_text LIKE @likeQuery OR a.full_text_translated LIKE @likeQuery)')
    params.likeQuery = likePattern
  }

  const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : ''
  const limit = opts.limit ?? 20
  const score = scoreExpr('a.', { searchBoost: hasQuery })

  let orderBy: string
  if (opts.sort === 'score') {
    orderBy = `${score} DESC, a.published_at DESC`
  } else if (opts.sort === 'published_at') {
    orderBy = 'a.published_at DESC'
  } else {
    orderBy = hasQuery ? `${score} DESC` : 'a.published_at DESC'
  }

  return allNamed<ArticleListItem>(`
    SELECT a.id, a.feed_id, f.name AS feed_name,
           a.title, a.url, a.published_at, a.lang, a.summary, a.excerpt, a.og_image, a.seen_at, a.read_at, a.bookmarked_at, a.liked_at,
           ${score} AS score
    FROM active_articles a
    JOIN feeds f ON a.feed_id = f.id
    ${where}
    ORDER BY ${orderBy}
    LIMIT ${Number(limit)}
  `, params)
}

export function markImagesArchived(articleId: number): void {
  getDb().prepare("UPDATE articles SET images_archived_at = datetime('now') WHERE id = ?").run(articleId)
}

export function clearImagesArchived(articleId: number): void {
  getDb().prepare('UPDATE articles SET images_archived_at = NULL WHERE id = ?').run(articleId)
}

export function deleteArticle(id: number): boolean {
  const result = getDb().prepare('DELETE FROM articles WHERE id = ?').run(id)
  if (result.changes > 0) deleteArticleFromSearch(id)
  return result.changes > 0
}

export function getReadingStats(opts?: {
  since?: string
  until?: string
}): { total: number; read: number; unread: number; by_feed: { feed_id: number; feed_name: string; total: number; read: number; unread: number }[] } {
  const conditions: string[] = []
  const params: Record<string, unknown> = {}

  if (opts?.since) {
    conditions.push('a.published_at >= @since')
    params.since = opts.since
  }
  if (opts?.until) {
    conditions.push('a.published_at <= @until')
    params.until = opts.until
  }

  const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : ''

  const totals = getNamed<{ total: number; read: number; unread: number }>(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN a.seen_at IS NOT NULL THEN 1 ELSE 0 END) AS read,
      SUM(CASE WHEN a.seen_at IS NULL THEN 1 ELSE 0 END) AS unread
    FROM active_articles a
    ${where}
  `, params)

  const byFeed = allNamed<{ feed_id: number; feed_name: string; total: number; read: number; unread: number }>(`
    SELECT
      a.feed_id,
      f.name AS feed_name,
      COUNT(*) AS total,
      SUM(CASE WHEN a.seen_at IS NOT NULL THEN 1 ELSE 0 END) AS read,
      SUM(CASE WHEN a.seen_at IS NULL THEN 1 ELSE 0 END) AS unread
    FROM active_articles a
    JOIN feeds f ON a.feed_id = f.id
    ${where}
    GROUP BY a.feed_id
    ORDER BY total DESC
  `, params)

  return { ...totals, by_feed: byFeed }
}

// --- Retention policy ---

export function getRetentionStats(readDays: number, unreadDays: number): { readEligible: number; unreadEligible: number } {
  const readRow = getDb().prepare(`
    SELECT COUNT(*) AS cnt FROM articles
    WHERE purged_at IS NULL
      AND feed_id NOT IN (SELECT id FROM feeds WHERE type = 'clip')
      AND seen_at IS NOT NULL
      AND seen_at < datetime('now', '-' || ? || ' days')
      AND bookmarked_at IS NULL
      AND liked_at IS NULL
  `).get(readDays) as { cnt: number }

  const unreadRow = getDb().prepare(`
    SELECT COUNT(*) AS cnt FROM articles
    WHERE purged_at IS NULL
      AND feed_id NOT IN (SELECT id FROM feeds WHERE type = 'clip')
      AND seen_at IS NULL
      AND fetched_at < datetime('now', '-' || ? || ' days')
      AND bookmarked_at IS NULL
      AND liked_at IS NULL
  `).get(unreadDays) as { cnt: number }

  return { readEligible: readRow.cnt, unreadEligible: unreadRow.cnt }
}

export function purgeExpiredArticles(readDays: number, unreadDays: number): { purged: number } {
  const db = getDb()

  // Collect IDs to purge — use seen_at for read status (consistent with UI unread indicator)
  const readIds = db.prepare(`
    SELECT id FROM articles
    WHERE purged_at IS NULL
      AND feed_id NOT IN (SELECT id FROM feeds WHERE type = 'clip')
      AND seen_at IS NOT NULL
      AND seen_at < datetime('now', '-' || ? || ' days')
      AND bookmarked_at IS NULL
      AND liked_at IS NULL
  `).all(readDays) as { id: number }[]

  const unreadIds = db.prepare(`
    SELECT id FROM articles
    WHERE purged_at IS NULL
      AND feed_id NOT IN (SELECT id FROM feeds WHERE type = 'clip')
      AND seen_at IS NULL
      AND fetched_at < datetime('now', '-' || ? || ' days')
      AND bookmarked_at IS NULL
      AND liked_at IS NULL
  `).all(unreadDays) as { id: number }[]

  const allIds = [...readIds, ...unreadIds].map(r => r.id)
  if (allIds.length === 0) return { purged: 0 }

  // Process in batches to avoid overly large SQL
  const BATCH = 500
  let purged = 0

  for (let i = 0; i < allIds.length; i += BATCH) {
    const batch = allIds.slice(i, i + BATCH)
    const placeholders = batch.map(() => '?').join(',')

    // Clean up archived images before the transaction (external I/O)
    const articlesWithImages = db.prepare(
      `SELECT id FROM articles WHERE id IN (${placeholders}) AND images_archived_at IS NOT NULL`,
    ).all(...batch) as { id: number }[]

    for (const { id } of articlesWithImages) {
      try {
        deleteArticleImages(id)
      } catch (err) {
        log.warn(`Failed to delete images for article ${id}:`, err)
      }
    }

    // Soft delete + search index removal in a transaction to keep them consistent
    const result = db.transaction(() => {
      const res = db.prepare(`
        UPDATE articles
        SET full_text = NULL,
            full_text_translated = NULL,
            excerpt = NULL,
            summary = NULL,
            og_image = NULL,
            images_archived_at = NULL,
            last_error = NULL,
            retry_count = 0,
            purged_at = datetime('now')
        WHERE id IN (${placeholders})
      `).run(...batch)

      deleteArticlesFromSearch(batch)

      return res
    })()

    purged += result.changes
  }

  return { purged }
}
