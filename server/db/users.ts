import crypto from 'node:crypto'
import { getDb } from './connection.js'
import type { UserRole, UserStatus } from '../identity.js'

export interface UserRecord {
  id: number
  email: string
  password_hash: string
  token_version: number
  role: UserRole
  status: UserStatus
  github_login: string | null
  last_login_at: string | null
  invited_by: number | null
  invited_at: string | null
  created_at: string
  updated_at: string
}

export interface UserSummary {
  id: number
  email: string
  role: UserRole
  status: UserStatus
  github_login: string | null
  last_login_at: string | null
  invited_by: number | null
  invited_at: string | null
  has_pending_invite: number
}

export interface InvitationRecord {
  id: number
  user_id: number
  token: string
  created_by: number | null
  expires_at: string
  used_at: string | null
  created_at: string
}

const INVITE_TTL_DAYS = 7

function inviteExpiry(): string {
  return new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString()
}

export function getOwnerCount(): number {
  const row = getDb().prepare("SELECT COUNT(*) AS cnt FROM users WHERE role = 'owner'").get() as { cnt: number }
  return row.cnt
}

export function getUserById(id: number): UserRecord | undefined {
  return getDb().prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRecord | undefined
}

export function getUserByEmail(email: string): UserRecord | undefined {
  return getDb().prepare('SELECT * FROM users WHERE email = ?').get(email) as UserRecord | undefined
}

export function getUserByGithubLogin(login: string): UserRecord | undefined {
  return getDb().prepare('SELECT * FROM users WHERE lower(github_login) = lower(?)').get(login) as UserRecord | undefined
}

export function listUsers(): UserSummary[] {
  return getDb().prepare(`
    SELECT
      u.id,
      u.email,
      u.role,
      u.status,
      u.github_login,
      u.last_login_at,
      u.invited_by,
      u.invited_at,
      EXISTS(
        SELECT 1
        FROM invitations i
        WHERE i.user_id = u.id
          AND i.used_at IS NULL
          AND i.expires_at > datetime('now')
      ) AS has_pending_invite
    FROM users u
    ORDER BY
      CASE u.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,
      u.email COLLATE NOCASE
  `).all() as UserSummary[]
}

export function createUser(input: {
  email: string
  passwordHash: string
  role: UserRole
  status: UserStatus
  invitedBy?: number | null
  githubLogin?: string | null
}): UserRecord {
  const result = getDb().prepare(`
    INSERT INTO users (email, password_hash, role, status, github_login, invited_by, invited_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.email.trim(),
    input.passwordHash,
    input.role,
    input.status,
    input.githubLogin?.trim() || null,
    input.invitedBy ?? null,
    input.status === 'invited' ? new Date().toISOString() : null,
  )
  return getUserById(result.lastInsertRowid as number)!
}

export function createInitialOwner(email: string, passwordHash: string): UserRecord | null {
  const result = getDb().prepare(`
    INSERT INTO users (email, password_hash, role, status)
    SELECT ?, ?, 'owner', 'active'
    WHERE NOT EXISTS (SELECT 1 FROM users WHERE role = 'owner')
  `).run(email.trim(), passwordHash)
  if (result.changes === 0) return null
  return getUserById(result.lastInsertRowid as number)!
}

export function updateUser(
  id: number,
  patch: Partial<Pick<UserRecord, 'email' | 'role' | 'status' | 'github_login'>>,
): UserRecord | undefined {
  const fields: string[] = []
  const args: unknown[] = []

  if (patch.email !== undefined) {
    fields.push('email = ?')
    args.push(patch.email.trim())
  }
  if (patch.role !== undefined) {
    fields.push('role = ?')
    args.push(patch.role)
  }
  if (patch.status !== undefined) {
    fields.push('status = ?')
    args.push(patch.status)
  }
  if (patch.github_login !== undefined) {
    fields.push('github_login = ?')
    args.push(patch.github_login?.trim() || null)
  }

  if (fields.length === 0) return getUserById(id)

  fields.push("updated_at = datetime('now')")
  const result = getDb().prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).run(...args, id)
  if (result.changes === 0) return undefined
  return getUserById(id)
}

export function updateUserPassword(id: number, passwordHash: string, activate = false): UserRecord | undefined {
  const fields = [
    'password_hash = ?',
    "token_version = token_version + 1",
    "updated_at = datetime('now')",
  ]
  const args: unknown[] = [passwordHash]
  if (activate) {
    fields.push("status = 'active'")
  }
  const result = getDb().prepare(`
    UPDATE users
    SET ${fields.join(', ')}
    WHERE id = ?
  `).run(...args, id)
  if (result.changes === 0) return undefined
  return getUserById(id)
}

export function recordUserLogin(id: number): void {
  getDb().prepare(`
    UPDATE users
    SET last_login_at = datetime('now'), updated_at = datetime('now')
    WHERE id = ?
  `).run(id)
}

export function revokeUserSessions(id: number): void {
  getDb().transaction(() => {
    getDb().prepare(`
      UPDATE users
      SET token_version = token_version + 1, updated_at = datetime('now')
      WHERE id = ?
    `).run(id)
    getDb().prepare('DELETE FROM api_keys WHERE user_id = ?').run(id)
  })()
}

export function issueInvitation(userId: number, createdBy: number | null): InvitationRecord {
  const token = crypto.randomUUID()
  getDb().transaction(() => {
    getDb().prepare('DELETE FROM invitations WHERE user_id = ? AND used_at IS NULL').run(userId)
    getDb().prepare(`
      INSERT INTO invitations (user_id, token, created_by, expires_at)
      VALUES (?, ?, ?, ?)
    `).run(userId, token, createdBy, inviteExpiry())
  })()
  return getInvitationByToken(token)!
}

export function getInvitationByToken(token: string): InvitationRecord | undefined {
  return getDb().prepare('SELECT * FROM invitations WHERE token = ?').get(token) as InvitationRecord | undefined
}

export function getActiveInvitationByUserId(userId: number): InvitationRecord | undefined {
  return getDb().prepare(`
    SELECT *
    FROM invitations
    WHERE user_id = ?
      AND used_at IS NULL
      AND expires_at > datetime('now')
    ORDER BY id DESC
    LIMIT 1
  `).get(userId) as InvitationRecord | undefined
}

export function getInvitationPreview(token: string): (InvitationRecord & { email: string; role: UserRole; status: UserStatus }) | undefined {
  return getDb().prepare(`
    SELECT i.*, u.email, u.role, u.status
    FROM invitations i
    JOIN users u ON u.id = i.user_id
    WHERE i.token = ?
      AND i.used_at IS NULL
      AND i.expires_at > datetime('now')
  `).get(token) as (InvitationRecord & { email: string; role: UserRole; status: UserStatus }) | undefined
}

export function consumeInvitation(token: string): UserRecord | undefined {
  const row = getDb().prepare(`
    SELECT u.*
    FROM invitations i
    JOIN users u ON u.id = i.user_id
    WHERE i.token = ?
      AND i.used_at IS NULL
      AND i.expires_at > datetime('now')
  `).get(token) as UserRecord | undefined
  if (!row) return undefined
  getDb().prepare("UPDATE invitations SET used_at = datetime('now') WHERE token = ?").run(token)
  return row
}
