import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { hashSync } from 'bcryptjs'
import {
  createUser,
  getUserById,
  issueInvitation,
  listUsers,
  revokeUserSessions,
  updateUser,
} from '../db.js'
import { getOrigin, getRequestIdentity, requireJson, requireRoles } from '../auth.js'
import { roleCanManage, type UserRole, type UserStatus } from '../identity.js'
import { NumericIdParams, parseOrBadRequest } from '../lib/validation.js'

const BCRYPT_ROUNDS = process.env.NODE_ENV === 'test' ? 4 : 12

const CreateUserBody = z.object({
  email: z.string().email(),
  role: z.enum(['admin', 'member'] as const),
})

const UpdateUserBody = z.object({
  role: z.enum(['owner', 'admin', 'member'] as const).optional(),
  status: z.enum(['active', 'invited', 'disabled'] as const).optional(),
  github_login: z.string().nullable().optional(),
})

function assertCanManage(actorRole: UserRole, targetRole: UserRole): string | null {
  if (!roleCanManage(actorRole, targetRole)) {
    return 'Forbidden'
  }
  return null
}

function invitationPayload(requestUrlOrigin: string, token: string) {
  return {
    token,
    invite_url: `${requestUrlOrigin}/invite/${token}`,
  }
}

export async function userRoutes(api: FastifyInstance): Promise<void> {
  api.get('/api/users', { preHandler: [requireRoles(['owner', 'admin'])] }, async (_request, reply) => {
    reply.send({ users: listUsers() })
  })

  api.post('/api/users', {
    preHandler: [requireJson, requireRoles(['owner', 'admin'])],
  }, async (request, reply) => {
    const body = parseOrBadRequest(CreateUserBody, request.body, reply)
    if (!body) return

    const identity = getRequestIdentity(request)
    if (!identity?.role || !identity.userId) {
      return reply.status(403).send({ error: 'Forbidden' })
    }
    if (identity.role === 'admin' && body.role !== 'member') {
      return reply.status(403).send({ error: 'Forbidden' })
    }

    const user = createUser({
      email: body.email,
      passwordHash: hashSync(`${body.email}:${Date.now()}`, BCRYPT_ROUNDS),
      role: body.role,
      status: 'invited',
      invitedBy: identity.userId,
    })
    const invite = issueInvitation(user.id, identity.userId)
    reply.status(201).send({
      user,
      ...invitationPayload(getOrigin(request), invite.token),
    })
  })

  api.patch('/api/users/:id', {
    preHandler: [requireJson, requireRoles(['owner', 'admin'])],
  }, async (request, reply) => {
    const params = parseOrBadRequest(NumericIdParams, request.params, reply)
    if (!params) return
    const body = parseOrBadRequest(UpdateUserBody, request.body, reply)
    if (!body) return

    const identity = getRequestIdentity(request)
    const target = getUserById(params.id)
    if (!identity?.role || !target) {
      return reply.status(404).send({ error: 'User not found' })
    }

    const denied = assertCanManage(identity.role, target.role)
    if (denied) {
      return reply.status(403).send({ error: denied })
    }
    if (body.role && !roleCanManage(identity.role, body.role as UserRole)) {
      return reply.status(403).send({ error: 'Forbidden' })
    }
    if (body.role === 'owner' && target.role !== 'owner') {
      return reply.status(400).send({ error: 'Ownership transfer is not supported' })
    }
    if (target.role === 'owner' && body.role && body.role !== 'owner') {
      return reply.status(400).send({ error: 'Owner role cannot be changed' })
    }
    if (target.role === 'owner' && body.status === 'disabled') {
      return reply.status(400).send({ error: 'Owner cannot be disabled' })
    }

    const updated = updateUser(params.id, {
      role: body.role,
      status: body.status as UserStatus | undefined,
      github_login: body.github_login === undefined ? undefined : body.github_login,
    })
    if (!updated) {
      return reply.status(404).send({ error: 'User not found' })
    }
    if (body.status === 'disabled') {
      revokeUserSessions(updated.id)
    }
    reply.send({ user: updated })
  })

  api.post('/api/users/:id/invite/reset', {
    preHandler: [requireRoles(['owner', 'admin'])],
  }, async (request, reply) => {
    const params = parseOrBadRequest(NumericIdParams, request.params, reply)
    if (!params) return
    const identity = getRequestIdentity(request)
    const target = getUserById(params.id)
    if (!identity?.role || !identity.userId || !target) {
      return reply.status(404).send({ error: 'User not found' })
    }

    const denied = assertCanManage(identity.role, target.role)
    if (denied) {
      return reply.status(403).send({ error: denied })
    }

    const invite = issueInvitation(target.id, identity.userId)
    reply.send(invitationPayload(getOrigin(request), invite.token))
  })

  api.post('/api/users/:id/sessions/revoke', {
    preHandler: [requireRoles(['owner', 'admin'])],
  }, async (request, reply) => {
    const params = parseOrBadRequest(NumericIdParams, request.params, reply)
    if (!params) return
    const identity = getRequestIdentity(request)
    const target = getUserById(params.id)
    if (!identity?.role || !target) {
      return reply.status(404).send({ error: 'User not found' })
    }

    const denied = assertCanManage(identity.role, target.role)
    if (denied) {
      return reply.status(403).send({ error: denied })
    }

    revokeUserSessions(target.id)
    reply.send({ ok: true })
  })
}
