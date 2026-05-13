import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import Fastify from 'fastify'
import fastifyStatic from '@fastify/static'
import jwt from '@fastify/jwt'
import rateLimit from '@fastify/rate-limit'
import multipart from '@fastify/multipart'
import cron, { type ScheduledTask } from 'node-cron'
import { runMigrations, getSetting, upsertSetting, getOrCreateJwtSecret, ensureClipFeed, recalculateScores, purgeExpiredArticles } from './db.js'
import { logger } from './logger.js'

const log = logger
import { getDb } from './db/connection.js'
import { registerApi } from './api.js'
import { registerChatApi } from './chatRoutes.js'
import { authRoutes } from './authRoutes.js'
import { passkeyRoutes } from './passkeyRoutes.js'
import { oauthRoutes } from './oauthRoutes.js'
import { fetchAllFeeds } from './fetcher.js'
import { rebuildSearchIndex, isSearchReady, syncAllScoredArticlesToSearch } from './search/sync.js'

// --- Startup guards ---
if (process.env.AUTH_DISABLED === '1' && process.env.NODE_ENV !== 'development') {
  log.error('FATAL: AUTH_DISABLED=1 requires NODE_ENV=development. Set NODE_ENV=development in your .env or environment.')
  process.exit(1)
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')

// --- Migrations ---
runMigrations()

// --- Ensure virtual feed for clipped articles exists ---
ensureClipFeed()

// --- Dev seed data ---
if (process.env.NODE_ENV === 'development') {
  const { seedDevData } = await import('./seed.js')
  seedDevData()
}

// Migrate JWT_SECRET from env var to DB so existing tokens remain valid
// even after removing the env var
const envSecret = process.env.JWT_SECRET
if (envSecret) {
  const dbSecret = getSetting('system.jwt_secret')
  if (!dbSecret) {
    upsertSetting('system.jwt_secret', envSecret)
    log.info('Migrated JWT_SECRET from env var to database')
  }
}

// Precedence: env var > DB value > auto-generated
const jwtSecret = process.env.JWT_SECRET || getOrCreateJwtSecret()

// --- Fastify ---
const isDev = process.env.NODE_ENV === 'development'

const app = Fastify({
  disableRequestLogging: true,
  trustProxy: !isDev,
  logger: {
    level: process.env.LOG_LEVEL || 'info',
    ...(isDev
      ? { transport: { target: 'pino-pretty', options: { translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname' } } }
      : {}),
  },
})

// Plugins
const JWT_EXPIRY = '30d'
const RATE_LIMIT_MAX = 300
const RATE_LIMIT_WINDOW = '1 minute'
const MULTIPART_MAX_FILE_SIZE = 5 * 1024 * 1024 // 5 MB

await app.register(jwt, {
  secret: jwtSecret,
  sign: { expiresIn: JWT_EXPIRY },
})
await app.register(rateLimit, {
  max: RATE_LIMIT_MAX,
  timeWindow: RATE_LIMIT_WINDOW,
  allowList: (req) => !req.url.startsWith('/api'),
})
await app.register(multipart, {
  limits: { fileSize: MULTIPART_MAX_FILE_SIZE },
})

// Structured request logging (replaces Fastify's default request logging)
// Healthcheck is excluded to reduce noise from liveness probes
app.addHook('onResponse', (req, reply, done) => {
  if (req.url !== '/api/health') {
    req.log.info({
      msg: 'request completed',
      method: req.method,
      url: req.url,
      statusCode: reply.statusCode,
      responseTime: Math.round(reply.elapsedTime),
      contentLength: reply.getHeader('content-length') || 0,
      remoteAddress: req.ip,
    })
  }
  done()
})

// Security headers
app.addHook('onRequest', (_req, reply, done) => {
  reply.header('X-Frame-Options', 'DENY')
  reply.header('X-Content-Type-Options', 'nosniff')
  reply.header('Referrer-Policy', 'strict-origin-when-cross-origin')
  reply.header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' https: http: data:; connect-src 'self'; frame-ancestors 'none'")
  done()
})

// Health check (no auth)
app.get('/api/health', async (_req, reply) => {
  reply.header('Cache-Control', 'no-store')
  return reply.send({
    ok: true,
    searchReady: isSearchReady(),
    gitCommit: process.env.GIT_COMMIT || 'dev',
    gitTag: process.env.GIT_TAG || 'dev',
    buildDate: process.env.BUILD_DATE || null,
  })
})

// Public auth routes (outside requireAuth)
app.register(authRoutes)
app.register(passkeyRoutes)
app.register(oauthRoutes)

// Protected API routes
registerApi(app)
registerChatApi(app)

// SPA static serving (production)
const distDir = path.join(projectRoot, 'dist')
if (fs.existsSync(distDir)) {
  await app.register(fastifyStatic, {
    root: distDir,
    wildcard: false,
  })

  // SPA fallback: serve index.html for non-API routes
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api')) {
      reply.status(404).send({ error: 'Not found' })
    } else {
      reply.sendFile('index.html')
    }
  })
}

// --- Cron ---
const cronTasks: ScheduledTask[] = []
let activeFetchPromise: Promise<void> | null = null

const CRON_SCHEDULE = process.env.CRON_SCHEDULE || '*/5 * * * *'
cronTasks.push(cron.schedule(CRON_SCHEDULE, async () => {
  log.info('[cron] Feed fetch triggered')
  const p = (async () => {
    try {
      await fetchAllFeeds()
    } catch (err) {
      log.error('[cron] Feed fetch error:', err)
    }
  })()
  activeFetchPromise = p
  await p
  activeFetchPromise = null
}))

// --- Score recalculation ---
// Decoupled from feed fetch so the schedule can be tuned independently.
// Default matches the original 5-minute interval; set SCORE_RECALC_SCHEDULE
// to e.g. '0 3 * * *' (daily at 3 AM) if the event-driven path covers all
// engagement actions and only time-decay refresh is needed.
const SCORE_RECALC_SCHEDULE = process.env.SCORE_RECALC_SCHEDULE || '*/5 * * * *'
cronTasks.push(cron.schedule(SCORE_RECALC_SCHEDULE, async () => {
  try {
    const { updated } = recalculateScores()
    log.info(`[cron] Scores recalculated: ${updated} articles`)
    if (updated > 0) {
      const synced = await syncAllScoredArticlesToSearch()
      log.info(`[cron] Score sync to search: ${synced} articles`)
    }
  } catch (err) {
    log.error('[cron] Score recalculation error:', err)
  }
}))

// --- Search index ---
// Non-blocking: rebuild runs in background, search returns 503 until ready
// Retry with backoff if initial rebuild fails (e.g. Meilisearch not yet ready)
void (async () => {
  const retries = [0, 5_000, 15_000, 30_000]
  for (const delay of retries) {
    if (delay) await new Promise((r) => setTimeout(r, delay))
    try {
      await rebuildSearchIndex()
      return
    } catch (err) {
      log.error(`[search] Index rebuild attempt failed (next retry in ${retries[retries.indexOf(delay) + 1] ?? 'none'}ms):`, err)
    }
  }
  log.error('[search] All initial rebuild attempts failed, will retry on next 6h cron')
})()

cronTasks.push(cron.schedule('0 */6 * * *', async () => {
  log.info('[cron] Search index rebuild triggered')
  try {
    await rebuildSearchIndex()
  } catch (err) {
    log.error('[cron] Search index rebuild error:', err)
  }
}))

// --- Retention policy ---
// Daily cleanup of old articles based on user-configured retention settings.
const RETENTION_SCHEDULE = process.env.RETENTION_SCHEDULE || '0 4 * * *'

cronTasks.push(cron.schedule(RETENTION_SCHEDULE, () => {
  const enabled = getSetting('retention.enabled')
  if (enabled !== 'on') return

  const readDays = Number(getSetting('retention.read_days'))
  const unreadDays = Number(getSetting('retention.unread_days'))
  if (isNaN(readDays) || isNaN(unreadDays) || readDays < 1 || unreadDays < 1) return

  try {
    const { purged } = purgeExpiredArticles(readDays, unreadDays)
    log.info(`[cron] Retention purge: ${purged} articles`)

    if (purged > 0) {
      // Checkpoint WAL to reclaim space
      try {
        getDb().exec('PRAGMA wal_checkpoint(TRUNCATE)')
      } catch {
        // non-critical
      }

      // Weekly VACUUM on Sundays when articles were purged
      if (new Date().getDay() === 0) {
        try {
          getDb().exec('VACUUM')
          log.info('[cron] Weekly VACUUM completed')
        } catch (err) {
          log.error('[cron] VACUUM error:', err)
        }
      }
    }
  } catch (err) {
    log.error('[cron] Retention purge error:', err)
  }
}))

// --- Graceful shutdown ---
const SHUTDOWN_TIMEOUT_MS = 8_000 // Docker sends SIGKILL after 10s by default

let isShuttingDown = false
async function shutdown(signal: string) {
  if (isShuttingDown) return
  isShuttingDown = true

  app.log.info(`${signal} received, shutting down gracefully…`)

  // 1. Stop cron — prevent new jobs from starting
  for (const task of cronTasks) task.stop()

  // 2. Close Fastify — stop accepting new requests, finish in-flight ones
  await app.close()

  // 3. Wait for active feed fetch to finish (with timeout)
  if (activeFetchPromise) {
    app.log.info('Waiting for active feed fetch to complete…')
    await Promise.race([
      activeFetchPromise,
      new Promise(resolve => setTimeout(resolve, SHUTDOWN_TIMEOUT_MS)),
    ])
  }

  // 4. Close DB — flushes WAL to main database file
  try {
    getDb().close()
  } catch (err) {
    app.log.warn({ err }, 'DB close failed (may already be closed)')
  }

  process.exit(0)
}
process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('SIGINT', () => void shutdown('SIGINT'))

process.on('unhandledRejection', (reason) => {
  app.log.error({ err: reason }, 'Unhandled promise rejection')
})

// --- Start ---
const PORT = Number(process.env.PORT) || 3000
app.listen({ host: '0.0.0.0', port: PORT }, (err) => {
  if (err) {
    app.log.error(err)
    process.exit(1)
  }
})
