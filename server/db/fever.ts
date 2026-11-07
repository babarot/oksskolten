import { getDb } from './connection.js'

export const FEVER_ITEMS_LIMIT = 50

export interface FeverItemRow {
  id: number
  feed_id: number
  title: string
  full_text: string | null
  excerpt: string | null
  url: string
  is_saved: number
  is_read: number
  created_on_time: number
}

export interface FeverFeed {
  id: number
  favicon_id: number
  title: string
  url: string
  site_url: string
  is_spark: number
  last_updated_on_time: number
}

const ITEM_EPOCH = "CAST(COALESCE(strftime('%s', published_at), strftime('%s', created_at), 0) AS INTEGER)"

const ITEM_SELECT = `
  SELECT
    id, feed_id, title, full_text, excerpt, url,
    (bookmarked_at IS NOT NULL) AS is_saved,
    (seen_at IS NOT NULL) AS is_read,
    ${ITEM_EPOCH} AS created_on_time
  FROM active_articles
`

export function getFeverGroups(): Array<{ id: number; title: string }> {
  return getDb().prepare('SELECT id, name AS title FROM categories ORDER BY id').all() as Array<{ id: number; title: string }>
}

export function getFeverFeedsGroups(): Array<{ group_id: number; feed_ids: string }> {
  return getDb().prepare(`
    SELECT category_id AS group_id, GROUP_CONCAT(id) AS feed_ids
    FROM feeds
    WHERE category_id IS NOT NULL
    GROUP BY category_id
    ORDER BY category_id
  `).all() as Array<{ group_id: number; feed_ids: string }>
}

export function getFeverFeeds(): FeverFeed[] {
  return getDb().prepare(`
    SELECT
      f.id,
      0 AS favicon_id,
      f.name AS title,
      COALESCE(f.rss_url, f.url) AS url,
      f.url AS site_url,
      0 AS is_spark,
      CAST(COALESCE(strftime('%s', MAX(a.fetched_at)), strftime('%s', f.created_at), 0) AS INTEGER) AS last_updated_on_time
    FROM feeds f
    LEFT JOIN active_articles a ON a.feed_id = f.id
    GROUP BY f.id
    ORDER BY f.id
  `).all() as FeverFeed[]
}

export function getFeverItems(opts: { sinceId?: number; maxId?: number; withIds?: number[] }): FeverItemRow[] {
  const db = getDb()
  if (opts.withIds !== undefined) {
    const ids = opts.withIds.slice(0, FEVER_ITEMS_LIMIT)
    if (ids.length === 0) return []
    const placeholders = ids.map(() => '?').join(',')
    return db.prepare(`${ITEM_SELECT} WHERE id IN (${placeholders}) ORDER BY id`).all(...ids) as FeverItemRow[]
  }
  if (opts.sinceId !== undefined) {
    return db.prepare(`${ITEM_SELECT} WHERE id > ? ORDER BY id ASC LIMIT ${FEVER_ITEMS_LIMIT}`).all(opts.sinceId) as FeverItemRow[]
  }
  if (opts.maxId !== undefined) {
    return db.prepare(`${ITEM_SELECT} WHERE id < ? ORDER BY id DESC LIMIT ${FEVER_ITEMS_LIMIT}`).all(opts.maxId) as FeverItemRow[]
  }
  return db.prepare(`${ITEM_SELECT} ORDER BY id DESC LIMIT ${FEVER_ITEMS_LIMIT}`).all() as FeverItemRow[]
}

export function getFeverTotalItems(): number {
  const row = getDb().prepare('SELECT COUNT(*) AS count FROM active_articles').get() as { count: number }
  return row.count
}

export function getFeverUnreadItemIds(): number[] {
  const rows = getDb().prepare('SELECT id FROM active_articles WHERE seen_at IS NULL ORDER BY id').all() as Array<{ id: number }>
  return rows.map(row => row.id)
}

export function getFeverSavedItemIds(): number[] {
  const rows = getDb().prepare('SELECT id FROM active_articles WHERE bookmarked_at IS NOT NULL ORDER BY id').all() as Array<{ id: number }>
  return rows.map(row => row.id)
}

export function getFeverLastRefreshedOnTime(): number {
  const row = getDb().prepare("SELECT CAST(strftime('%s', MAX(fetched_at)) AS INTEGER) AS ts FROM active_articles").get() as { ts: number | null }
  return row.ts ?? 0
}

export function getFeverUnseenIdsBefore(scope: { feedId?: number; categoryId?: number }, before: number): number[] {
  const conditions = ['seen_at IS NULL', `${ITEM_EPOCH} <= ?`]
  const params: number[] = [before]
  if (scope.feedId !== undefined) {
    conditions.push('feed_id = ?')
    params.push(scope.feedId)
  }
  if (scope.categoryId !== undefined) {
    conditions.push('feed_id IN (SELECT id FROM feeds WHERE category_id = ?)')
    params.push(scope.categoryId)
  }

  const rows = getDb().prepare(
    `SELECT id FROM active_articles WHERE ${conditions.join(' AND ')} ORDER BY id`,
  ).all(...params) as Array<{ id: number }>
  return rows.map(row => row.id)
}

export function getFeverRecentlySeenIds(): number[] {
  const rows = getDb().prepare(
    "SELECT id FROM active_articles WHERE seen_at >= datetime('now', '-1 hour') ORDER BY id",
  ).all() as Array<{ id: number }>
  return rows.map(row => row.id)
}
