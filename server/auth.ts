import type { FastifyRequest, FastifyReply } from 'fastify'
import { getDb } from './db.js'
import { validateApiKey } from './db/apiKeys.js'
import { type AuthIdentity, type UserRole, getCurrentIdentity, setCurrentIdentity } from './identity.js'

declare module 'fastify' {
  interface FastifyRequest {
    authUser?: string
    apiKeyScopes?: string
    identity?: AuthIdentity
  }
}

export async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (process.env.AUTH_DISABLED === '1') {
    request.authUser = 'local'
    request.identity = {
      kind: 'local',
      userId: null,
      email: 'local',
      role: 'owner',
      status: 'active',
    }
    setCurrentIdentity(request.identity)
    return
  }

  // Check for API key authentication (Bearer ok_...)
  const authHeader = request.headers.authorization
  if (authHeader?.startsWith('Bearer ok_')) {
    const key = authHeader.slice(7) // strip "Bearer "
    const result = validateApiKey(key)
    if (!result) {
      return reply.status(401).send({ error: 'Invalid API key' })
    }
    request.authUser = `apikey:${result.id}`
    request.apiKeyScopes = result.scopes
    request.identity = {
      kind: 'apiKey',
      userId: result.userId,
      email: result.email,
      role: result.role,
      status: result.status,
      apiKeyId: result.id,
      apiKeyScopes: result.scopes,
    }
    setCurrentIdentity(request.identity)
    return
  }

  try {
    await request.jwtVerify()
    const payload = request.user as { sub?: number | string; email?: string; role?: UserRole; token_version: number }

    const db = getDb()
    const user = (payload.sub != null
      ? db.prepare(`
        SELECT id, email, role, status, token_version
        FROM users
        WHERE id = ?
      `).get(Number(payload.sub))
      : db.prepare(`
        SELECT id, email, role, status, token_version
        FROM users
        WHERE email = ?
      `).get(payload.email)
    ) as { id: number; email: string; role: UserRole; status: 'active' | 'invited' | 'disabled'; token_version: number } | undefined

    if (!user || user.status !== 'active' || user.token_version !== payload.token_version) {
      return reply.status(401).send({ error: 'Unauthorized' })
    }

    request.authUser = user.email
    request.identity = {
      kind: 'user',
      userId: user.id,
      email: user.email,
      role: user.role,
      status: user.status,
    }
    setCurrentIdentity(request.identity)
  } catch {
    reply.status(401).send({ error: 'Unauthorized' })
  }
}

export function getAuthUser(request: FastifyRequest): string | null {
  return request.identity?.email ?? request.authUser ?? null
}

export function getRequestIdentity(request: FastifyRequest): AuthIdentity | null {
  return request.identity ?? getCurrentIdentity()
}

export function getRequestUserId(request: FastifyRequest): number | null {
  return getRequestIdentity(request)?.userId ?? null
}

export function requireRoles(roles: UserRole[]) {
  return function checkRoles(request: FastifyRequest, reply: FastifyReply, done: () => void): void {
    const role = getRequestIdentity(request)?.role
    if (!role || !roles.includes(role)) {
      reply.status(403).send({ error: 'Forbidden' })
      return
    }
    done()
  }
}

/**
 * Pre-handler that blocks API key requests without write scope on mutation methods.
 * JWT users (no apiKeyScopes) pass through unrestricted.
 */
export function requireWriteScope(
  request: FastifyRequest,
  reply: FastifyReply,
  done: () => void,
): void {
  if (
    request.apiKeyScopes &&
    request.method !== 'GET' &&
    !request.apiKeyScopes.includes('write')
  ) {
    reply.status(403).send({ error: 'API key does not have write scope' })
    return
  }
  done()
}

// --- Request origin helpers ---

type HeadersLike = { headers: Record<string, string | string[] | undefined> }

export function getOrigin(request: HeadersLike): string {
  const origin = request.headers['origin'] as string | undefined
  if (origin) return origin
  const referer = request.headers['referer'] as string | undefined
  if (referer) {
    try { return new URL(referer).origin } catch { /* fall through */ }
  }
  const proto = (request.headers['x-forwarded-proto'] as string) || 'http'
  const host = (request.headers['host'] as string) || 'localhost'
  return `${proto}://${host}`
}

export function getRpID(request: HeadersLike): string {
  const origin = request.headers['origin'] as string | undefined
  if (origin) {
    try { return new URL(origin).hostname } catch { /* fall through */ }
  }
  const referer = request.headers['referer'] as string | undefined
  if (referer) {
    try { return new URL(referer).hostname } catch { /* fall through */ }
  }
  const host = (request.headers['host'] as string) || 'localhost'
  return host.split(':')[0]
}

export function getCredentialCount(): number {
  const db = getDb()
  const row = db.prepare('SELECT COUNT(*) AS cnt FROM credentials').get() as { cnt: number }
  return row.cnt
}

export function requireJson(
  request: FastifyRequest,
  reply: FastifyReply,
  done: () => void,
): void {
  const ct = request.headers['content-type'] || ''
  if (!ct.startsWith('application/json')) {
    reply.status(415).send({ error: 'Unsupported Media Type' })
    return
  }
  done()
}
