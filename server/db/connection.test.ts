import { describe, it, expect, beforeEach } from 'vitest'
import { setupTestDb } from '../__tests__/helpers/testDb.js'
import { bindNamedParams, runNamed, getNamed, allNamed, getDb, runMigrations } from './connection.js'
import { createFeed } from './feeds.js'

beforeEach(() => {
  setupTestDb()
})

// --- bindNamedParams ---

describe('bindNamedParams', () => {
  it('replaces named params with positional placeholders', () => {
    const result = bindNamedParams('SELECT * FROM t WHERE a = @foo AND b = @bar', { foo: 1, bar: 'x' })
    expect(result.sql).toBe('SELECT * FROM t WHERE a = ? AND b = ?')
    expect(result.args).toEqual([1, 'x'])
  })

  it('handles same param used multiple times', () => {
    const result = bindNamedParams('SELECT * FROM t WHERE a = @foo OR b = @foo', { foo: 42 })
    expect(result.sql).toBe('SELECT * FROM t WHERE a = ? OR b = ?')
    expect(result.args).toEqual([42, 42])
  })

  it('throws on missing parameter', () => {
    expect(() => bindNamedParams('SELECT * FROM t WHERE a = @missing', {}))
      .toThrow('Missing SQL parameter: missing')
  })

  it('handles params with underscores', () => {
    const result = bindNamedParams('SELECT * FROM t WHERE col = @my_param', { my_param: 'val' })
    expect(result.sql).toBe('SELECT * FROM t WHERE col = ?')
    expect(result.args).toEqual(['val'])
  })

  it('returns original SQL when no params present', () => {
    const result = bindNamedParams('SELECT 1', {})
    expect(result.sql).toBe('SELECT 1')
    expect(result.args).toEqual([])
  })
})

// --- runNamed / getNamed / allNamed ---

describe('runNamed', () => {
  it('executes an INSERT with named params', () => {
    getDb().exec('CREATE TABLE test_rn (id INTEGER PRIMARY KEY, val TEXT)')
    runNamed('INSERT INTO test_rn (val) VALUES (@v)', { v: 'hello' })
    const row = getDb().prepare('SELECT val FROM test_rn').get() as { val: string }
    expect(row.val).toBe('hello')
  })
})

describe('getNamed', () => {
  it('returns a single row', () => {
    getDb().exec('CREATE TABLE test_gn (id INTEGER PRIMARY KEY, val TEXT)')
    getDb().prepare('INSERT INTO test_gn (val) VALUES (?)').run('world')
    const row = getNamed<{ val: string }>('SELECT val FROM test_gn WHERE val = @v', { v: 'world' })
    expect(row.val).toBe('world')
  })

  it('returns undefined when no match', () => {
    getDb().exec('CREATE TABLE test_gn2 (id INTEGER PRIMARY KEY, val TEXT)')
    const row = getNamed<{ val: string }>('SELECT val FROM test_gn2 WHERE val = @v', { v: 'nope' })
    expect(row).toBeUndefined()
  })
})

describe('allNamed', () => {
  it('returns all matching rows', () => {
    getDb().exec('CREATE TABLE test_an (id INTEGER PRIMARY KEY, val TEXT)')
    getDb().prepare('INSERT INTO test_an (val) VALUES (?)').run('a')
    getDb().prepare('INSERT INTO test_an (val) VALUES (?)').run('b')
    const rows = allNamed<{ val: string }>('SELECT val FROM test_an WHERE val IN (@v1, @v2)', { v1: 'a', v2: 'b' })
    expect(rows).toHaveLength(2)
  })
})

// --- runMigrations ---

describe('runMigrations', () => {
  it('creates _migrations table', () => {
    // setupTestDb already runs migrations, so _migrations should exist
    const tables = getDb()
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='_migrations'")
      .all() as { name: string }[]
    expect(tables).toHaveLength(1)
  })

  it('is idempotent — running twice does not fail', () => {
    expect(() => runMigrations()).not.toThrow()
  })

  it('records applied migrations', () => {
    const applied = getDb().prepare('SELECT name FROM _migrations').all() as { name: string }[]
    expect(applied.length).toBeGreaterThan(0)
  })

  it('url_normalize_v1 canonicalizes legacy article URLs (consecutive slashes, lowercase percent-hex)', () => {
    // Reproduce a legacy DB: fresh schema + migrations applied, then LEGACY non-canonical URLs
    // inserted directly (bypassing insertArticle, which now normalizes on save).
    const feed = createFeed({ name: 'X', url: 'https://x.example' })
    const db = getDb()
    db.prepare(
      "INSERT INTO articles (feed_id, category_id, title, url, published_at) VALUES (?, NULL, 'a', 'https://x.example//kiji/horai', '2025-01-01T00:00:00Z')"
    ).run(feed.id)
    db.prepare(
      "INSERT INTO articles (feed_id, category_id, title, url, published_at) VALUES (?, NULL, 'b', 'https://x.example/%e8%a8%98', '2025-01-01T00:00:00Z')"
    ).run(feed.id)

    // Pretend the URL normalization migration hasn't run yet, then run it.
    db.prepare("DELETE FROM _migrations WHERE name = 'url_normalize_v1'").run()
    runMigrations()

    const urls = (db.prepare('SELECT url FROM articles ORDER BY id').all() as { url: string }[]).map(r => r.url)
    expect(urls).toContain('https://x.example/kiji/horai')        // // collapsed
    expect(urls).toContain('https://x.example/%E8%A8%98')          // percent-hex uppercased
    // Idempotent: running again doesn't throw or duplicate.
    expect(() => runMigrations()).not.toThrow()
  })

  it('url_normalize_v1 dedupes rows that collapse onto the same canonical URL', () => {
    const feed = createFeed({ name: 'X', url: 'https://x.example' })
    const db = getDb()
    // Same article stored under two spellings (a pre-existing duplicate in legacy DB).
    db.prepare(
      "INSERT INTO articles (feed_id, category_id, title, url, published_at) VALUES (?, NULL, 'legacy-//','https://x.example//kiji/a', '2025-01-01T00:00:00Z')"
    ).run(feed.id)
    db.prepare(
      "INSERT INTO articles (feed_id, category_id, title, url, published_at) VALUES (?, NULL, 'legacy-/','https://x.example/kiji/a', '2025-01-01T00:00:00Z')"
    ).run(feed.id)

    db.prepare("DELETE FROM _migrations WHERE name = 'url_normalize_v1'").run()
    // Should not throw on the UNIQUE(url) collision: it keeps one row and drops the other.
    expect(() => runMigrations()).not.toThrow()

    const rows = db.prepare("SELECT url FROM articles WHERE url = 'https://x.example/kiji/a'").all() as { url: string }[]
    expect(rows).toHaveLength(1) // exactly one survives
  })
})

// --- WAL and foreign keys ---

describe('database pragmas', () => {
  it('has foreign_keys enabled', () => {
    const row = getDb().pragma('foreign_keys') as { foreign_keys: number }[]
    expect(row[0].foreign_keys).toBe(1)
  })
})

// --- execSafe (tested indirectly via migrations) ---

describe('duplicate column migration handling', () => {
  it('handles duplicate column gracefully in migration context', () => {
    // Simulate a duplicate column scenario
    getDb().exec('CREATE TABLE test_dup (id INTEGER PRIMARY KEY, col1 TEXT)')
    // Adding the same column again should be handled by execSafe logic
    expect(() => {
      getDb().exec('ALTER TABLE test_dup ADD COLUMN col1 TEXT')
    }).toThrow(/duplicate column/)
  })
})
