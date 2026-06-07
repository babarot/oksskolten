import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import Database from 'libsql'
import { logger } from '../logger.js'
import { dataPath } from '../paths.js'
import { findProjectRoot } from '../paths.js'

const log = logger.child('db')

// --- DB instance ---

function isRemote(url: string): boolean {
  return url.startsWith('libsql://') || url.startsWith('https://')
}

function openDb(dbUrl: string) {
  const remote = isRemote(dbUrl)
  if (!remote && dbUrl !== ':memory:') {
    // For local file paths, ensure the parent directory exists
    const filePath = dbUrl.startsWith('file:') ? dbUrl.slice(5) : dbUrl
    const dbDir = path.dirname(filePath)
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true })
    }
  }
  const authToken = process.env.TURSO_AUTH_TOKEN
  // libsql types don't include authToken but it's supported at runtime for Turso connections
  const instance = authToken
    ? new Database(dbUrl, { authToken } as Database.Options & { authToken: string })
    : new Database(dbUrl)
  if (!remote) {
    instance.pragma('journal_mode = WAL')
  }
  instance.pragma('foreign_keys = ON')
  // Limit SQLite internal heap growth to prevent native memory accumulation.
  // Soft limit: SQLite tries to stay under this; exceeding it won't cause errors.
  instance.pragma('soft_heap_limit = 268435456')  // 256MB
  return instance
}

/**
 * Shrink SQLite memory and checkpoint WAL to release accumulated native heap.
 * Safe to call periodically (e.g. every 5 min) to prevent libsql RSS growth.
 * For remote (Turso) databases, only shrink_memory is attempted.
 */
export function shrinkMemory() {
  try {
    const remote = isRemote(process.env.DATABASE_URL || '')
    if (!remote) {
      db.pragma('wal_checkpoint(TRUNCATE)')
    }
    db.pragma('shrink_memory')
    log.info('[db] Memory shrunk' + (remote ? '' : ' + WAL checkpoint'))
  } catch (err) {
    log.error('[db] shrinkMemory error:', err)
  }
}

let db = openDb(process.env.DATABASE_URL || `file:${dataPath('rss.db')}`)

export function getDb() {
  return db
}

export function _resetDb(dbPath = ':memory:') {
  db.close()
  db = openDb(dbPath)
}

export function bindNamedParams(sql: string, params: Record<string, unknown>): { sql: string; args: unknown[] } {
  const args: unknown[] = []
  const boundSql = sql.replace(/@([A-Za-z_][A-Za-z0-9_]*)/g, (_match, key: string) => {
    if (!(key in params)) {
      throw new Error(`Missing SQL parameter: ${key}`)
    }
    args.push(params[key])
    return '?'
  })
  return { sql: boundSql, args }
}

export function runNamed(sql: string, params: Record<string, unknown>) {
  const bound = bindNamedParams(sql, params)
  return db.prepare(bound.sql).run(...bound.args)
}

export function getNamed<T>(sql: string, params: Record<string, unknown>) {
  const bound = bindNamedParams(sql, params)
  return db.prepare(bound.sql).get(...bound.args) as T
}

export function allNamed<T>(sql: string, params: Record<string, unknown>) {
  const bound = bindNamedParams(sql, params)
  return db.prepare(bound.sql).all(...bound.args) as T[]
}

// --- Migrations ---

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = findProjectRoot(__dirname)

/** Error messages from SQLite that indicate an already-applied schema change. */
const IDEMPOTENT_ERRORS = ['duplicate column name', 'no such column', 'already exists'] as const

function isIdempotentError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return IDEMPOTENT_ERRORS.some(e => msg.includes(e))
}

/**
 * Run SQL statements one-by-one, skipping ones that fail due to
 * already-applied schema changes (duplicate column, missing column, etc.).
 */
function execSafe(sql: string, file: string) {
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0)
  for (const stmt of statements) {
    try {
      db.exec(stmt)
    } catch (err: unknown) {
      if (isIdempotentError(err)) {
        log.warn(`Migration ${file}: skipping statement (${(err as Error).message})`)
      } else {
        throw err
      }
    }
  }
}

export function runMigrations() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  const migrationsDir = path.join(projectRoot, 'migrations')
  if (!fs.existsSync(migrationsDir)) return

  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort()

  const applied = new Set(
    (db.prepare('SELECT name FROM _migrations').all() as { name: string }[])
      .map(row => row.name)
  )

  const remote = isRemote(process.env.DATABASE_URL || '')
  for (const file of files) {
    if (applied.has(file)) continue
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8')
    if (!remote) db.pragma('foreign_keys = OFF')
    try {
      db.exec(sql)
    } catch (err: unknown) {
      if (isIdempotentError(err)) {
        // Partially-applied migration — run each statement individually,
        // skipping ones that conflict with existing schema.
        log.warn(`Migration ${file}: partial conflict (${(err as Error).message}), applying statement-by-statement`)
        execSafe(sql, file)
      } else {
        throw err
      }
    }
    if (!remote) db.pragma('foreign_keys = ON')
    db.prepare('INSERT INTO _migrations (name) VALUES (?)').run(file)
    log.info(`Migration applied: ${file}`)
  }
}
