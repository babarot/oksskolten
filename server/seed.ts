import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getDb } from './db/connection.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')

/**
 * Resolve relative date strings (e.g. "-3d", "-2d23h") to ISO 8601.
 * Mirrors the logic in src/lib/demo/demo-store.ts.
 */
function resolveRelativeDate(value: string | null): string | null {
  if (!value) return null
  const m = value.match(/^-(\d+)d(?:(\d+)h)?$/)
  if (!m) return value
  const days = Number(m[1])
  const hours = m[2] ? Number(m[2]) : 0
  return new Date(Date.now() - (days * 86_400_000 + hours * 3_600_000)).toISOString()
}

/**
 * Insert seed data from demo JSON files directly into the database.
 * Runs only when NODE_ENV=development, NO_SEED is not set,
 * and the database has no RSS feeds (fresh DB).
 * Idempotent: skips if RSS feeds already exist, uses INSERT OR IGNORE on url.
 *
 * Note: IDs are NOT specified — DB auto-assigns them to avoid collision
 * with the Clips feed (id=1) created by ensureClipFeed().
 * A seedId→dbId map is used to resolve feed_id references in articles.
 */
export function seedDevData() {
  if (process.env.NO_SEED === '1') return

  const db = getDb()
  const count = (db.prepare("SELECT COUNT(*) as c FROM feeds WHERE type = 'rss'").get() as { c: number }).c
  if (count > 0) return

  const feedsPath = path.join(projectRoot, 'src/lib/demo/seed/feeds.json')
  const articlesPath = path.join(projectRoot, 'src/lib/demo/seed/articles.json')
  if (!fs.existsSync(feedsPath) || !fs.existsSync(articlesPath)) {
    console.warn('[seed] Seed JSON not found, skipping')
    return
  }

  const feedsJson = JSON.parse(fs.readFileSync(feedsPath, 'utf-8'))
  const articlesJson = JSON.parse(fs.readFileSync(articlesPath, 'utf-8'))

  db.transaction(() => {
    // Categories (extracted from feeds)
    const categories = new Map<number, string>()
    for (const f of feedsJson) {
      if (f.category_id && f.category_name) {
        categories.set(f.category_id, f.category_name)
      }
    }
    const catIdMap = new Map<number, number>()
    const insertCat = db.prepare('INSERT INTO categories (name, sort_order) VALUES (?, ?)')
    for (const [seedId, name] of [...categories.entries()].sort((a, b) => a[0] - b[0])) {
      const result = insertCat.run(name, seedId - 1)
      catIdMap.set(seedId, Number(result.lastInsertRowid))
    }

    // Feeds — let DB auto-assign IDs, track seedId → dbId
    const feedIdMap = new Map<number, number>()
    const insertFeed = db.prepare(
      'INSERT OR IGNORE INTO feeds (name, url, rss_url, rss_bridge_url, type, category_id, disabled, error_count, requires_js_challenge, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )
    for (const f of feedsJson) {
      f.created_at = resolveRelativeDate(f.created_at) ?? f.created_at
      const dbCatId = f.category_id ? (catIdMap.get(f.category_id) ?? null) : null
      const result = insertFeed.run(
        f.name, f.url, f.rss_url ?? null, f.rss_bridge_url ?? null,
        f.type, dbCatId, f.disabled, f.error_count,
        f.requires_js_challenge, f.created_at
      )
      if (result.changes > 0) {
        feedIdMap.set(f.id, Number(result.lastInsertRowid))
      }
    }

    // Articles — use mapped feed IDs
    const dateKeys = ['published_at', 'seen_at', 'read_at', 'bookmarked_at', 'liked_at', 'fetched_at', 'created_at']
    const insertArticle = db.prepare(
      'INSERT OR IGNORE INTO articles (feed_id, category_id, title, url, published_at, lang, full_text, full_text_translated, summary, excerpt, og_image, seen_at, read_at, bookmarked_at, liked_at, fetched_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )
    for (const a of articlesJson) {
      const dbFeedId = feedIdMap.get(a.feed_id)
      if (!dbFeedId) continue // feed was not inserted (OR IGNORE)

      for (const k of dateKeys) {
        a[k] = resolveRelativeDate(a[k])
      }

      const feed = feedsJson.find((f: { id: number }) => f.id === a.feed_id)
      const dbCatId = feed?.category_id ? (catIdMap.get(feed.category_id) ?? null) : null

      insertArticle.run(
        dbFeedId, dbCatId, a.title, a.url,
        a.published_at, a.lang, a.full_text, a.full_text_translated,
        a.summary, a.excerpt, a.og_image ?? null,
        a.seen_at, a.read_at, a.bookmarked_at, a.liked_at,
        a.fetched_at, a.created_at
      )
    }
  })()

  const feedCount = feedsJson.length
  const articleCount = articlesJson.length
  console.log(`[seed] Dev seed data loaded (${feedCount} feeds, ${articleCount} articles)`)
}
