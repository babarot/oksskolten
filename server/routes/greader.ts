/**
 * Google Reader API (GReader) — compatible with NetNewsWire FreshRSS account type.
 *
 * Auth:   POST /accounts/ClientLogin  →  plain-text `Auth=<jwt>`
 * Header: Authorization: GoogleLogin auth=<jwt>
 *
 * Endpoints used by NetNewsWire:
 *   GET  /reader/api/0/user-info
 *   GET  /reader/api/0/token
 *   GET  /reader/api/0/subscription/list
 *   GET  /reader/api/0/tag/list
 *   GET  /reader/api/0/stream/items/ids
 *   POST /reader/api/0/stream/items/contents
 *   GET  /reader/api/0/stream/contents/:stream
 *   POST /reader/api/0/edit-tag
 *   POST /reader/api/0/mark-all-as-read
 */

import { compareSync } from 'bcryptjs'
import { marked } from 'marked'
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { getDb, getSetting } from '../db.js'
import { getFeeds } from '../db/feeds.js'
import { getCategories, markAllSeenByCategory } from '../db/categories.js'
import { getArticles, markArticleSeen, markArticleLiked, markAllSeenByFeed } from '../db/articles.js'

// --- ID helpers ---

/** Encode integer article id to 16-char hex GReader item id */
function encodeItemId(id: number): string {
  return id.toString(16).padStart(16, '0')
}

/** Full GReader item tag URI */
function itemTagId(id: number): string {
  return `tag:google.com,2005:reader/item/${encodeItemId(id)}`
}

/** Decode a GReader item id back to an integer */
function decodeItemId(raw: string): number | null {
  // Accept the canonical tag URI with a hex suffix
  if (raw.includes('/item/')) {
    const hex = raw.split('/item/')[1]
    if (!/^[0-9a-f]+$/i.test(hex)) return null
    const n = parseInt(hex, 16)
    return isNaN(n) ? null : n
  }

  // Accept bare decimal IDs (emitted by /stream/items/ids)
  if (/^\d+$/.test(raw)) {
    const n = parseInt(raw, 10)
    return isNaN(n) ? null : n
  }

  // Accept bare hex IDs that are unambiguously hex (contain a-f)
  if (/^[0-9a-f]+$/i.test(raw) && /[a-f]/i.test(raw)) {
    const n = parseInt(raw, 16)
    return isNaN(n) ? null : n
  }

  return null
}

// --- Auth helper ---

function extractGReaderToken(request: FastifyRequest): string | null {
  const auth = request.headers.authorization ?? ''
  const match = auth.match(/^GoogleLogin\s+auth=(.+)$/i)
  return match ? match[1] : null
}

async function verifyGReaderAuth(
  request: FastifyRequest,
  reply: FastifyReply,
  app: FastifyInstance,
): Promise<string | null> {
  const token = extractGReaderToken(request)
  if (!token) {
    reply.status(401).send('Error=NeedsBrowser\n')
    return null
  }
  try {
    const payload = app.jwt.verify<{ email: string; token_version: number }>(token)
    const user = getDb()
      .prepare('SELECT token_version FROM users WHERE email = ?')
      .get(payload.email) as { token_version: number } | undefined
    if (!user || user.token_version !== payload.token_version) {
      reply.status(401).send('Error=TokenExpired\n')
      return null
    }
    return payload.email
  } catch {
    reply.status(401).send('Error=TokenExpired\n')
    return null
  }
}

// --- Article → GReader item shape ---

interface ArticleRow {
  id: number
  feed_id: number
  feed_name: string
  title: string
  feed_url: string
  article_url: string
  created_at: string | null
  published_at: string | null
  lang: string | null
  summary: string | null
  excerpt: string | null
  og_image: string | null
  seen_at: string | null
  read_at: string | null
  bookmarked_at: string | null
  liked_at: string | null
  score?: number
  full_text?: string | null
  rss_url?: string | null
  category_name?: string | null
}

function markdownToHtml(text: string): string {
  if (!text) return ''
  // If content already looks like HTML, return as-is
  if (text.trimStart().startsWith('<')) return text
  return marked.parse(text, { async: false }) as string
}

function articleToGReaderItem(a: ArticleRow): Record<string, unknown> {
  const publishedSec = a.published_at ? Math.floor(new Date(a.published_at).getTime() / 1000) : 0
  const crawledSec = a.created_at
    ? Math.floor(new Date(a.created_at).getTime() / 1000)
    : publishedSec
  const crawlMsec = String(crawledSec * 1000)

  const categories: string[] = ['user/-/state/com.google/reading-list']
  if (a.seen_at || a.read_at) categories.push('user/-/state/com.google/read')
  if (a.liked_at) categories.push('user/-/state/com.google/starred')
  if (a.category_name) categories.push(`user/-/label/${a.category_name}`)

  const feedUrl = a.rss_url ?? a.feed_url
  return {
    id: itemTagId(a.id),
    crawlTimeMsec: crawlMsec,
    timestampUsec: String(publishedSec * 1_000_000),
    published: publishedSec,
    updated: publishedSec,
    title: a.title ?? '(no title)',
    canonical: [{ href: a.article_url }],
    alternate: [{ href: a.article_url, type: 'text/html' }],
    summary: { direction: 'ltr', content: markdownToHtml(a.full_text ?? a.summary ?? a.excerpt ?? '') },
    author: a.feed_name ?? '',
    origin: {
      streamId: `feed/${feedUrl}`,
      title: a.feed_name ?? '',
      htmlUrl: (() => { try { const u = new URL(feedUrl); return `${u.protocol}//${u.host}` } catch { return feedUrl } })(),
    },
    categories,
  }
}

/** Fetch articles enriched with feed rss_url and category_name for GReader responses */
function getEnrichedArticles(ids: number[]): ArticleRow[] {
  if (ids.length === 0) return []
  const maxSqlParams = 900
  const results: ArticleRow[] = []
  for (let i = 0; i < ids.length; i += maxSqlParams) {
    const batchIds = ids.slice(i, i + maxSqlParams)
    const placeholders = batchIds.map(() => '?').join(',')
    const orderCase = batchIds.map((id, j) => `WHEN ${id} THEN ${i + j}`).join(' ')
    const rows = getDb().prepare(`
      SELECT a.id, a.feed_id, f.name AS feed_name, f.rss_url, f.url AS feed_url,
             a.title, a.url AS article_url,
             a.created_at, a.published_at, a.lang, a.summary, a.excerpt, a.og_image, a.full_text,
             a.seen_at, a.read_at, a.bookmarked_at, a.liked_at,
             c.name AS category_name
      FROM active_articles a
      JOIN feeds f ON a.feed_id = f.id
      LEFT JOIN categories c ON f.category_id = c.id
      WHERE a.id IN (${placeholders})
      ORDER BY CASE a.id ${orderCase} END
    `).all(...batchIds) as ArticleRow[]
    results.push(...rows)
  }
  return results
}

// --- Route registration ---

export function greaderRoutes(app: FastifyInstance) {
  // Parse application/x-www-form-urlencoded bodies (scoped to this plugin)
  app.addContentTypeParser(
    'application/x-www-form-urlencoded',
    { parseAs: 'string' },
    (_req: FastifyRequest, body: string, done: (err: Error | null, body?: unknown) => void) => {
      const params = new URLSearchParams(body)
      const parsed: Record<string, string | string[]> = {}
      for (const [k, v] of params.entries()) {
        if (k in parsed) {
          const existing = parsed[k]
          parsed[k] = Array.isArray(existing) ? [...existing, v] : [existing, v]
        } else {
          parsed[k] = v
        }
      }
      done(null, parsed)
    },
  )
  // ── Authentication ──────────────────────────────────────────────────────────

  app.post('/accounts/ClientLogin', {
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    if (getSetting('auth.password_enabled') === '0') {
      reply.header('Content-Type', 'text/plain')
      return reply.status(403).send('Error=PasswordAuthDisabled\n')
    }

    const rawBody = (request.body ?? {}) as Record<string, string | string[]>
    const emailRaw = Array.isArray(rawBody.Email) ? rawBody.Email[0] : (rawBody.Email ?? '')
    const passwdRaw = Array.isArray(rawBody.Passwd) ? rawBody.Passwd[0] : (rawBody.Passwd ?? '')
    const email = emailRaw.trim().toLowerCase()
    const passwd = passwdRaw

    const user = getDb()
      .prepare('SELECT email, password_hash, token_version FROM users WHERE LOWER(email) = ?')
      .get(email) as { email: string; password_hash: string; token_version: number } | undefined

    if (!user || !compareSync(passwd, user.password_hash)) {
      reply.status(403)
      reply.header('Content-Type', 'text/plain')
      return reply.send('Error=BadAuthentication\n')
    }

    const token = app.jwt.sign({ email: user.email, token_version: user.token_version })
    reply.header('Content-Type', 'text/plain')
    return reply.send(`SID=${token}\nLSID=${token}\nAuth=${token}\n`)
  })

  // ── All /reader/api/0/* routes require GReader auth ─────────────────────────

  app.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.url.startsWith('/reader/api/')) return
    const email = await verifyGReaderAuth(request, reply, app)
    if (!email) return // reply already sent
    ;(request as FastifyRequest & { greaderEmail: string }).greaderEmail = email
  })

  // ── User info ────────────────────────────────────────────────────────────────

  app.get('/reader/api/0/user-info', async (request, reply) => {
    const email = (request as FastifyRequest & { greaderEmail: string }).greaderEmail
    reply.header('Content-Type', 'application/json')
    return reply.send({
      userId: email,
      userName: email.split('@')[0],
      userEmail: email,
      userProfileId: email,
      userInfoUrl: `${request.protocol}://${request.hostname}/reader/api/0/user-info`,
    })
  })

  // ── Edit token (required by some clients before write ops) ──────────────────

  app.get('/reader/api/0/token', async (request, reply) => {
    const token = extractGReaderToken(request) ?? 'token'
    reply.header('Content-Type', 'text/plain')
    return reply.send(token)
  })

  // ── Subscription list ────────────────────────────────────────────────────────

  app.get('/reader/api/0/subscription/list', async (_request, reply) => {
    const feeds = getFeeds().filter((f) => f.type !== 'clip')
    const subscriptions = feeds.map((f) => {
      const feedUrl = f.rss_url ?? f.url
      const sub: Record<string, unknown> = {
        id: `feed/${feedUrl}`,
        title: f.name,
        htmlUrl: (() => { try { const u = new URL(feedUrl); return `${u.protocol}//${u.host}` } catch { return feedUrl } })(),
        iconUrl: '',
        firstitemmsec: '0',
        categories: [] as { id: string; label: string }[],
      }
      if (f.category_id && f.category_name) {
        (sub.categories as { id: string; label: string }[]).push({
          id: `user/-/label/${f.category_name}`,
          label: f.category_name,
        })
      }
      return sub
    })
    reply.header('Content-Type', 'application/json')
    return reply.send({ subscriptions })
  })

  // ── Tag / label list ─────────────────────────────────────────────────────────

  app.get('/reader/api/0/tag/list', async (_request, reply) => {
    const cats = getCategories()
    const tags = [
      { id: 'user/-/state/com.google/starred', type: 'tag' },
      ...cats.map((c) => ({ id: `user/-/label/${c.name}`, type: 'folder' })),
    ]
    reply.header('Content-Type', 'application/json')
    return reply.send({ tags })
  })

  // ── Stream item IDs ──────────────────────────────────────────────────────────

  app.get('/reader/api/0/stream/items/ids', async (request, reply) => {
    const q = request.query as Record<string, string | string[]>
    const stream = Array.isArray(q.s) ? q.s[0] : (q.s ?? 'user/-/state/com.google/reading-list')
    const exclude = Array.isArray(q.xt) ? q.xt[0] : (q.xt ?? '')
    const limit = (() => {
      const n = Number(q.n ?? 10000)
      return Number.isFinite(n) && n >= 1 ? Math.min(n, 10000) : 10000
    })()
    const otSec = q.ot ? Number(Array.isArray(q.ot) ? q.ot[0] : q.ot) : null

    const opts = buildArticleOpts(stream, exclude)
    const { articles } = getArticles({ ...opts, limit, offset: 0 })

    // Fetch created_at for each article (used for ot filter and timestampUsec)
    const ids = articles.map((a) => a.id)
    const createdAtMap = new Map<number, string>()
    if (ids.length > 0) {
      const maxSqlParams = 900
      for (let i = 0; i < ids.length; i += maxSqlParams) {
        const batchIds = ids.slice(i, i + maxSqlParams)
        const placeholders = batchIds.map(() => '?').join(',')
        const rows = getDb()
          .prepare(`SELECT id, created_at FROM articles WHERE id IN (${placeholders})`)
          .all(...batchIds) as { id: number; created_at: string }[]
        for (const r of rows) createdAtMap.set(r.id, r.created_at)
      }
    }

    const filtered = otSec
      ? articles.filter((a) => {
          const crawled = createdAtMap.get(a.id)
          const sec = crawled ? Math.floor(new Date(crawled).getTime() / 1000) : 0
          return sec >= otSec
        })
      : articles

    const itemRefs = filtered.map((a) => {
      const crawled = createdAtMap.get(a.id)
      const tsUsec = crawled ? String(Math.floor(new Date(crawled).getTime() / 1000) * 1_000_000) : '0'
      return {
        id: String(a.id),   // bare decimal — NNW expects this for FreshRSS variant
        directStreamIds: [],
        timestampUsec: tsUsec,
      }
    })
    reply.header('Content-Type', 'application/json')
    return reply.send({ itemRefs })
  })

  // ── Fetch specific items ─────────────────────────────────────────────────────

  app.post('/reader/api/0/stream/items/contents', async (request, reply) => {
    const body = (request.body ?? {}) as Record<string, string | string[]>
    const rawIds: string[] = Array.isArray(body.i) ? body.i : (body.i ? [body.i] : [])

    const ids = rawIds.slice(0, 100).map(decodeItemId).filter((id): id is number => id !== null)
    const rows = getEnrichedArticles(ids)
    const items = rows.map((row) => articleToGReaderItem(row))

    reply.header('Content-Type', 'application/json')
    return reply.send({ id: 'user/-/state/com.google/reading-list', updated: Math.floor(Date.now() / 1000), items })
  })

  // ── Stream contents ──────────────────────────────────────────────────────────

  app.get('/reader/api/0/stream/contents/*', async (request, reply) => {
    const q = request.query as Record<string, string>
    const stream = decodeURIComponent((request.params as Record<string, string>)['*'] ?? '')
    const exclude = q.xt ?? ''
    const limit = (() => {
      const n = Number(q.n ?? 20)
      return Number.isFinite(n) && n >= 1 ? Math.min(n, 100) : 20
    })()
    const offset = (() => {
      if (!q.c) return 0
      const decoded = Number(Buffer.from(q.c, 'base64').toString())
      return Number.isFinite(decoded) && decoded >= 0 ? decoded : 0
    })()

    const opts = buildArticleOpts(stream, exclude)
    const { articles, total } = getArticles({ ...opts, limit, offset })
    const ids = articles.map((a) => a.id)
    const rows = getEnrichedArticles(ids)

    const items = rows.map((row) => articleToGReaderItem(row))
    const nextOffset = offset + limit
    const continuation = nextOffset < total ? Buffer.from(String(nextOffset)).toString('base64') : undefined

    reply.header('Content-Type', 'application/json')
    return reply.send({
      id: stream,
      updated: Math.floor(Date.now() / 1000),
      items,
      ...(continuation ? { continuation } : {}),
    })
  })

  // ── Edit tag (mark read/unread/starred) ──────────────────────────────────────

  app.post('/reader/api/0/edit-tag', async (request, reply) => {
    const body = (request.body ?? {}) as Record<string, string | string[]>
    const rawIds: string[] = Array.isArray(body.i) ? body.i : (body.i ? [body.i] : [])
    const addTag = Array.isArray(body.a) ? body.a[0] : (body.a ?? '')
    const removeTag = Array.isArray(body.r) ? body.r[0] : (body.r ?? '')

    const ids = rawIds.map(decodeItemId).filter((id): id is number => id !== null)

    for (const id of ids) {
      if (addTag.includes('com.google/read') || removeTag.includes('com.google/kept-unread')) {
        markArticleSeen(id, true)
      } else if (removeTag.includes('com.google/read') || addTag.includes('com.google/kept-unread')) {
        markArticleSeen(id, false)
      }
      if (addTag.includes('com.google/starred')) {
        markArticleLiked(id, true)
      } else if (removeTag.includes('com.google/starred')) {
        markArticleLiked(id, false)
      }
    }

    reply.header('Content-Type', 'text/plain')
    return reply.send('OK')
  })

  // ── Mark all as read ─────────────────────────────────────────────────────────

  app.post('/reader/api/0/mark-all-as-read', async (request, reply) => {
    const body = (request.body ?? {}) as Record<string, string>
    const stream = body.s ?? ''

    if (stream.startsWith('feed/')) {
      const feedUrl = stream.slice('feed/'.length)
      const feeds = getFeeds()
      const feed = feeds.find((f) => (f.rss_url ?? f.url) === feedUrl)
      if (feed) markAllSeenByFeed(feed.id)
    } else if (stream.startsWith('user/-/label/')) {
      const labelName = stream.slice('user/-/label/'.length)
      const cats = getCategories()
      const cat = cats.find((c) => c.name === labelName)
      if (cat) markAllSeenByCategory(cat.id)
    } else if (stream === 'user/-/state/com.google/reading-list') {
      // Mark all articles as seen (uses seen_at to match existing semantics)
      getDb().prepare("UPDATE articles SET seen_at = datetime('now') WHERE seen_at IS NULL").run()
    }

    reply.header('Content-Type', 'text/plain')
    return reply.send('OK')
  })
}

// --- Helper: map GReader stream → getArticles opts ---

function buildArticleOpts(stream: string, exclude: string): {
  feedId?: number
  categoryId?: number
  unread?: boolean
  bookmarked?: boolean
  liked?: boolean
} {
  const opts: { feedId?: number; categoryId?: number; unread?: boolean; bookmarked?: boolean; liked?: boolean } = {}

  // Exclude read = only unread
  if (exclude.includes('com.google/read')) {
    opts.unread = true
  }

  if (stream === 'user/-/state/com.google/starred') {
    opts.liked = true
    return opts
  }

  if (stream.startsWith('feed/')) {
    const feedUrl = stream.slice('feed/'.length)
    const feeds = getFeeds()
    const feed = feeds.find((f) => (f.rss_url ?? f.url) === feedUrl)
    if (feed) opts.feedId = feed.id
    return opts
  }

  if (stream.startsWith('user/-/label/')) {
    const labelName = stream.slice('user/-/label/'.length)
    const cats = getCategories()
    const cat = cats.find((c) => c.name === labelName)
    if (cat) opts.categoryId = cat.id
    return opts
  }

  // Default: reading-list (all articles, no extra filter)
  return opts
}
