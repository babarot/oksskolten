import { randomBytes } from 'node:crypto'
import { getDb } from './connection.js'
import { logger } from '../logger.js'
import { getCurrentUserId } from '../identity.js'

const log = logger.child('db')

const INSTANCE_PREFIXES = ['auth.', 'system.', 'images.'] as const

function isInstanceSetting(key: string): boolean {
  return INSTANCE_PREFIXES.some(prefix => key.startsWith(prefix))
}

function resolveUserId(userId?: number | null): number | null {
  return userId ?? getCurrentUserId()
}

export function getInstanceSetting(key: string): string | undefined {
  const row = getDb().prepare('SELECT value FROM instance_settings WHERE key = ?').get(key) as { value: string } | undefined
  return row?.value
}

export function upsertInstanceSetting(key: string, value: string): void {
  getDb().prepare(`
    INSERT INTO instance_settings (key, value)
    VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, value)
}

export function deleteInstanceSetting(key: string): void {
  getDb().prepare('DELETE FROM instance_settings WHERE key = ?').run(key)
}

export function getUserSetting(userId: number, key: string): string | undefined {
  const row = getDb().prepare(`
    SELECT value
    FROM user_settings
    WHERE user_id = ? AND key = ?
  `).get(userId, key) as { value: string } | undefined
  return row?.value
}

export function upsertUserSetting(userId: number, key: string, value: string): void {
  getDb().prepare(`
    INSERT INTO user_settings (user_id, key, value)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id, key) DO UPDATE
    SET value = excluded.value, updated_at = datetime('now')
  `).run(userId, key, value)
}

export function deleteUserSetting(userId: number, key: string): void {
  getDb().prepare('DELETE FROM user_settings WHERE user_id = ? AND key = ?').run(userId, key)
}

function getLegacySetting(key: string): string | undefined {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined
  return row?.value
}

export function getSetting(key: string, userId?: number | null): string | undefined {
  if (isInstanceSetting(key)) {
    return getInstanceSetting(key) ?? getLegacySetting(key)
  }

  const scopedUserId = resolveUserId(userId)
  if (scopedUserId != null) {
    return getUserSetting(scopedUserId, key)
  }

  return getLegacySetting(key)
}

export function upsertSetting(key: string, value: string, userId?: number | null): void {
  if (isInstanceSetting(key)) {
    upsertInstanceSetting(key, value)
    return
  }

  const scopedUserId = resolveUserId(userId)
  if (scopedUserId != null) {
    upsertUserSetting(scopedUserId, key, value)
    return
  }

  getDb().prepare(`
    INSERT INTO settings (key, value)
    VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, value)
}

export function deleteSetting(key: string, userId?: number | null): void {
  if (isInstanceSetting(key)) {
    deleteInstanceSetting(key)
    return
  }

  const scopedUserId = resolveUserId(userId)
  if (scopedUserId != null) {
    deleteUserSetting(scopedUserId, key)
    return
  }

  getDb().prepare('DELETE FROM settings WHERE key = ?').run(key)
}

export function getOrCreateJwtSecret(): string {
  const existing = getInstanceSetting('system.jwt_secret') ?? getSetting('system.jwt_secret')
  if (existing) return existing
  const secret = randomBytes(64).toString('base64url')
  upsertInstanceSetting('system.jwt_secret', secret)
  log.info('Generated new JWT secret and persisted to database')
  return secret
}
