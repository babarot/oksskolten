import { randomBytes, createHash } from 'node:crypto'
import { getDb } from './connection.js'
import { getCurrentUserId, type UserRole, type UserStatus } from '../identity.js'

export interface ApiKey {
  id: number
  user_id: number | null
  name: string
  key_prefix: string
  scopes: string
  last_used_at: string | null
  created_at: string
}

export interface ApiKeyCreated extends ApiKey {
  /** Full key — shown only once at creation time */
  key: string
}

function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex')
}

function resolveUserId(userId?: number | null): number | null {
  return userId ?? getCurrentUserId()
}

export function createApiKey(name: string, scopes: string = 'read', userId?: number | null): ApiKeyCreated {
  const raw = `ok_${randomBytes(20).toString('hex')}`
  const keyHash = hashKey(raw)
  const keyPrefix = raw.slice(0, 11) // "ok_" + first 8 hex chars
  const scopedUserId = resolveUserId(userId)

  const result = getDb()
    .prepare(
      'INSERT INTO api_keys (user_id, name, key_hash, key_prefix, scopes) VALUES (?, ?, ?, ?, ?)',
    )
    .run(scopedUserId, name, keyHash, keyPrefix, scopes)

  return {
    id: result.lastInsertRowid as number,
    user_id: scopedUserId,
    name,
    key: raw,
    key_prefix: keyPrefix,
    scopes,
    last_used_at: null,
    created_at: new Date().toISOString(),
  }
}

export function listApiKeys(userId?: number | null): ApiKey[] {
  const scopedUserId = resolveUserId(userId)
  if (scopedUserId == null) {
    return getDb()
      .prepare('SELECT id, user_id, name, key_prefix, scopes, last_used_at, created_at FROM api_keys ORDER BY created_at DESC')
      .all() as ApiKey[]
  }

  return getDb()
    .prepare(`
      SELECT id, user_id, name, key_prefix, scopes, last_used_at, created_at
      FROM api_keys
      WHERE user_id = ?
      ORDER BY created_at DESC
    `)
    .all(scopedUserId) as ApiKey[]
}

export function deleteApiKey(id: number, userId?: number | null): boolean {
  const scopedUserId = resolveUserId(userId)
  const result = scopedUserId == null
    ? getDb().prepare('DELETE FROM api_keys WHERE id = ?').run(id)
    : getDb().prepare('DELETE FROM api_keys WHERE id = ? AND user_id = ?').run(id, scopedUserId)
  return result.changes > 0
}

export function validateApiKey(key: string): {
  id: number
  userId: number | null
  email: string | null
  role: UserRole | null
  status: UserStatus | null
  scopes: string
} | null {
  const keyHash = hashKey(key)
  const row = getDb()
    .prepare(`
      SELECT
        k.id,
        k.user_id,
        k.scopes,
        u.email,
        u.role,
        u.status
      FROM api_keys k
      LEFT JOIN users u ON u.id = k.user_id
      WHERE k.key_hash = ?
    `)
    .get(keyHash) as {
      id: number
      user_id: number | null
      scopes: string
      email: string | null
      role: UserRole | null
      status: UserStatus | null
    } | undefined

  if (!row) return null
  if (row.user_id != null && row.status !== 'active') return null

  // Update last_used_at (fire-and-forget)
  getDb()
    .prepare("UPDATE api_keys SET last_used_at = datetime('now') WHERE id = ?")
    .run(row.id)

  return {
    id: row.id,
    userId: row.user_id,
    email: row.email,
    role: row.role,
    status: row.status,
    scopes: row.scopes,
  }
}
