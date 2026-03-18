import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { compareSync, hashSync } from 'bcryptjs'
import { getDb, getSetting } from './db.js'

const BCRYPT_ROUNDS = process.env.NODE_ENV === 'test' ? 4 : 12
import { requireAuth, requireJson } from './auth.js'
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

    // Check if password auth is disabled (passkey-only mode)
    if (getSetting('auth.password_enabled') === '0') {
      return reply.status(403).send({ error: 'Password authentication is disabled' })
    }

    const body = parseOrBadRequest(LoginBody, request.body, reply)
    if (!body) return

    const db = getDb()
    const user = db.prepare('SELECT email, password_hash, token_version FROM users WHERE email = ?').get(body.email) as
      | { email: string; password_hash: string; token_version: number }
      | undefined

    if (!user || !compareSync(body.password, user.password_hash)) {
      return reply.status(401).send({ error: 'Invalid credentials' })
    }

    const token = app.jwt.sign({ email: user.email, token_version: user.token_version })
    reply.send({ ok: true, token })
  })

  app.post('/api/logout', async (_request, reply) => {
    reply.send({ ok: true })
  })

  app.get('/api/me', async (request, reply) => {
    if (process.env.AUTH_DISABLED === '1') {
      return reply.send({ email: 'local' })
    }

    try {
      await request.jwtVerify()
      const { email, token_version } = request.user as { email: string; token_version: number }

      const db = getDb()
      const user = db.prepare('SELECT token_version FROM users WHERE email = ?').get(email) as
        | { token_version: number }
        | undefined

      if (!user || user.token_version !== token_version) {
        return reply.status(401).send({ error: 'Unauthorized' })
      }

      reply.send({ email })
    } catch {
      reply.status(401).send({ error: 'Unauthorized' })
    }
  })

  app.post('/api/auth/setup', {
    preHandler: [requireJson],
    config: { rateLimit: { max: 3, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const body = parseOrBadRequest(SetupBody, request.body, reply)
    if (!body) return

    const db = getDb()
    const passwordHash = hashSync(body.password, BCRYPT_ROUNDS)
    const result = db.prepare(
      'INSERT INTO users (email, password_hash) SELECT ?, ? WHERE NOT EXISTS (SELECT 1 FROM users)'
    ).run(body.email, passwordHash)

    if (result.changes === 0) {
      return reply.status(403).send({ error: 'Setup is not available' })
    }

    const user = db.prepare('SELECT email, token_version FROM users WHERE email = ?').get(body.email) as
      | { email: string; token_version: number }
    const token = app.jwt.sign({ email: user.email, token_version: user.token_version })
    reply.send({ ok: true, token })
  })

  app.post('/api/auth/password/change', {
    preHandler: [requireAuth, requireJson],
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const body = parseOrBadRequest(ChangePasswordBody, request.body, reply)
    if (!body) return

    const db = getDb()
    const { email } = request.user as { email: string }
    const user = db.prepare('SELECT password_hash FROM users WHERE email = ?').get(email) as
      | { password_hash: string }
      | undefined

    if (!user) {
      return reply.status(401).send({ error: 'Unauthorized' })
    }

    if (body.currentPassword) {
      // Change mode: verify current password
      if (!compareSync(body.currentPassword, user.password_hash)) {
        return reply.status(401).send({ error: 'Current password is incorrect' })
      }
    } else {
      // Reset mode: require alternative auth method
      const passkeyCount = (db.prepare('SELECT COUNT(*) AS cnt FROM credentials').get() as { cnt: number }).cnt
      const githubEnabled = isGitHubOAuthEnabled()
      if (passkeyCount === 0 && !githubEnabled) {
        return reply.status(400).send({ error: 'Current password is required' })
      }
    }

    const newHash = hashSync(body.newPassword, BCRYPT_ROUNDS)
    db.prepare("UPDATE users SET password_hash = ?, token_version = token_version + 1, updated_at = datetime('now') WHERE email = ?").run(newHash, email)

    const updated = db.prepare('SELECT token_version FROM users WHERE email = ?').get(email) as { token_version: number }
    const token = app.jwt.sign({ email, token_version: updated.token_version })

    reply.send({ ok: true, token })
  })

  app.post('/api/auth/email/change', {
    preHandler: [requireAuth, requireJson],
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const body = parseOrBadRequest(ChangeEmailBody, request.body, reply)
    if (!body) return

    const db = getDb()
    const { email } = request.user as { email: string }
    const user = db.prepare('SELECT password_hash FROM users WHERE email = ?').get(email) as
      | { password_hash: string }
      | undefined

    if (!user) {
      return reply.status(401).send({ error: 'Unauthorized' })
    }

    if (!compareSync(body.currentPassword, user.password_hash)) {
      return reply.status(401).send({ error: 'Current password is incorrect' })
    }

    const trimmed = body.newEmail.trim()
    if (trimmed === email) {
      return reply.status(400).send({ error: 'New email is the same as current email' })
    }

    // Check if new email is already taken
    const existing = db.prepare('SELECT 1 FROM users WHERE email = ?').get(trimmed)
    if (existing) {
      return reply.status(409).send({ error: 'Email is already in use' })
    }

    db.prepare("UPDATE users SET email = ?, token_version = token_version + 1, updated_at = datetime('now') WHERE email = ?").run(trimmed, email)

    const updated = db.prepare('SELECT token_version FROM users WHERE email = ?').get(trimmed) as { token_version: number }
    const token = app.jwt.sign({ email: trimmed, token_version: updated.token_version })

    reply.send({ ok: true, token })
  })
}
