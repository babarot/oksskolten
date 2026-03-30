import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { compareSync, hashSync } from 'bcryptjs'
import {
  createInitialOwner,
  consumeInvitation,
  ensureClipFeed,
  getDb,
  getInvitationPreview,
  getOwnerCount,
  getSetting,
  getUserByEmail,
  recordUserLogin,
  updateUserPassword,
} from './db.js'

const BCRYPT_ROUNDS = process.env.NODE_ENV === 'test' ? 4 : 12
import { getRequestIdentity, requireAuth, requireJson } from './auth.js'
import { isGitHubOAuthEnabled } from './oauthRoutes.js'
import { parseOrBadRequest } from './lib/validation.js'

const LoginBody = z.object({
  email: z.string().min(1, 'Email and password are required'),
  password: z.string().min(1, 'Email and password are required'),
})

const SetupBody = z.object({
  email: z.string().min(1, 'Email and password are required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
})

const ChangePasswordBody = z.object({
  currentPassword: z.string().optional(),
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
})

const ChangeEmailBody = z.object({
  newEmail: z.string().email('Valid email is required'),
  currentPassword: z.string().min(1, 'Current password is required'),
})

const InvitationAcceptBody = z.object({
  token: z.string().min(1, 'token is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
})

function signUserToken(app: FastifyInstance, user: { id: number; role: string; token_version: number }): string {
  return app.jwt.sign({
    sub: user.id,
    role: user.role,
    token_version: user.token_version,
  })
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store')
  })

  app.post('/api/login', {
    preHandler: [requireJson],
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    if (process.env.AUTH_DISABLED === '1') {
      return reply.send({ ok: true })
    }

    if (getSetting('auth.password_enabled') === '0') {
      return reply.status(403).send({ error: 'Password authentication is disabled' })
    }

    const body = parseOrBadRequest(LoginBody, request.body, reply)
    if (!body) return

    const user = getUserByEmail(body.email)
    if (!user || user.status !== 'active' || !compareSync(body.password, user.password_hash)) {
      return reply.status(401).send({ error: 'Invalid credentials' })
    }

    recordUserLogin(user.id)
    const token = signUserToken(app, user)
    reply.send({ ok: true, token })
  })

  app.post('/api/logout', async (_request, reply) => {
    reply.send({ ok: true })
  })

  app.get('/api/me', { preHandler: [requireAuth] }, async (request, reply) => {
    if (process.env.AUTH_DISABLED === '1') {
      return reply.send({ id: 0, email: 'local', role: 'owner', status: 'active' })
    }

    const identity = getRequestIdentity(request)
    if (!identity?.userId || !identity.email || !identity.role || !identity.status) {
      return reply.status(401).send({ error: 'Unauthorized' })
    }

    reply.send({
      id: identity.userId,
      email: identity.email,
      role: identity.role,
      status: identity.status,
    })
  })

  app.post('/api/auth/setup', {
    preHandler: [requireJson],
    config: { rateLimit: { max: 3, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const body = parseOrBadRequest(SetupBody, request.body, reply)
    if (!body) return

    const passwordHash = hashSync(body.password, BCRYPT_ROUNDS)
    const user = createInitialOwner(body.email, passwordHash)

    if (!user) {
      return reply.status(403).send({ error: 'Setup is not available' })
    }

    ensureClipFeed(user.id)
    const token = signUserToken(app, user)
    reply.send({ ok: true, token })
  })

  app.get('/api/auth/invitations/:token', async (request, reply) => {
    const params = z.object({ token: z.string().min(1) }).safeParse(request.params)
    if (!params.success) {
      return reply.status(400).send({ error: 'Invalid invitation token' })
    }
    const invitation = getInvitationPreview(params.data.token)
    if (!invitation) {
      return reply.status(404).send({ error: 'Invitation not found or expired' })
    }
    reply.send({
      email: invitation.email,
      role: invitation.role,
      status: invitation.status,
      expires_at: invitation.expires_at,
    })
  })

  app.post('/api/auth/invitations/accept', {
    preHandler: [requireJson],
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const body = parseOrBadRequest(InvitationAcceptBody, request.body, reply)
    if (!body) return

    const invitedUser = consumeInvitation(body.token)
    if (!invitedUser || invitedUser.status === 'disabled') {
      return reply.status(400).send({ error: 'Invitation is invalid or expired' })
    }

    const updated = updateUserPassword(invitedUser.id, hashSync(body.password, BCRYPT_ROUNDS), true)
    if (!updated) {
      return reply.status(400).send({ error: 'Invitation could not be accepted' })
    }

    ensureClipFeed(updated.id)
    recordUserLogin(updated.id)
    const token = signUserToken(app, updated)
    reply.send({ ok: true, token })
  })

  app.post('/api/auth/password/change', {
    preHandler: [requireAuth, requireJson],
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const body = parseOrBadRequest(ChangePasswordBody, request.body, reply)
    if (!body) return

    const identity = getRequestIdentity(request)
    if (!identity?.userId) {
      return reply.status(401).send({ error: 'Unauthorized' })
    }

    const user = getUserByEmail(identity.email ?? '')
    if (!user || user.status !== 'active') {
      return reply.status(401).send({ error: 'Unauthorized' })
    }

    if (body.currentPassword) {
      if (!compareSync(body.currentPassword, user.password_hash)) {
        return reply.status(401).send({ error: 'Current password is incorrect' })
      }
    } else {
      const db = getDb()
      const passkeyCount = (db.prepare(`
        SELECT COUNT(*) AS cnt
        FROM credentials
        WHERE user_id = ? OR user_id IS NULL
      `).get(user.id) as { cnt: number }).cnt
      const githubEnabled = isGitHubOAuthEnabled() && !!user.github_login
      if (passkeyCount === 0 && !githubEnabled) {
        return reply.status(400).send({ error: 'Current password is required' })
      }
    }

    const updated = updateUserPassword(user.id, hashSync(body.newPassword, BCRYPT_ROUNDS))
    if (!updated) {
      return reply.status(401).send({ error: 'Unauthorized' })
    }
    const token = signUserToken(app, updated)

    reply.send({ ok: true, token })
  })

  app.post('/api/auth/email/change', {
    preHandler: [requireAuth, requireJson],
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const body = parseOrBadRequest(ChangeEmailBody, request.body, reply)
    if (!body) return

    const identity = getRequestIdentity(request)
    if (!identity?.userId || !identity.email) {
      return reply.status(401).send({ error: 'Unauthorized' })
    }

    const user = getUserByEmail(identity.email)
    if (!user || user.status !== 'active') {
      return reply.status(401).send({ error: 'Unauthorized' })
    }

    if (!compareSync(body.currentPassword, user.password_hash)) {
      return reply.status(401).send({ error: 'Current password is incorrect' })
    }

    const trimmed = body.newEmail.trim()
    if (trimmed === user.email) {
      return reply.status(400).send({ error: 'New email is the same as current email' })
    }

    const existing = getUserByEmail(trimmed)
    if (existing) {
      return reply.status(409).send({ error: 'Email is already in use' })
    }

    getDb().prepare(`
      UPDATE users
      SET email = ?, token_version = token_version + 1, updated_at = datetime('now')
      WHERE id = ?
    `).run(trimmed, user.id)

    const updated = getUserByEmail(trimmed)
    if (!updated) {
      return reply.status(500).send({ error: 'Failed to update email' })
    }

    const token = signUserToken(app, updated)
    reply.send({ ok: true, token })
  })

  app.get('/api/auth/bootstrap', async (_request, reply) => {
    reply.send({ setup_required: getOwnerCount() === 0 })
  })
}
