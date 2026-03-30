import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { createApiKey, listApiKeys, deleteApiKey } from '../db/apiKeys.js'
import { requireJson, getRequestUserId } from '../auth.js'
import { parseOrBadRequest, NumericIdParams } from '../lib/validation.js'

const CreateBody = z.object({
  name: z.string().min(1, 'name is required').max(100),
  scopes: z
    .enum(['read', 'read,write'], { error: 'scopes must be "read" or "read,write"' })
    .default('read'),
})

export async function apiKeyRoutes(api: FastifyInstance): Promise<void> {
  // List all API keys (never returns the full key)
  api.get('/api/settings/tokens', async (request, reply) => {
    const userId = getRequestUserId(request)
    reply.send(listApiKeys(userId))
  })

  // Create a new API key — returns the full key once
  api.post(
    '/api/settings/tokens',
    { preHandler: [requireJson] },
    async (request, reply) => {
      const body = parseOrBadRequest(CreateBody, request.body, reply)
      if (!body) return
      const userId = getRequestUserId(request)
      const created = createApiKey(body.name, body.scopes, userId)
      reply.status(201).send(created)
    },
  )

  // Delete an API key
  api.delete('/api/settings/tokens/:id', async (request, reply) => {
    const params = parseOrBadRequest(NumericIdParams, request.params, reply)
    if (!params) return
    const userId = getRequestUserId(request)
    const deleted = deleteApiKey(params.id, userId)
    if (!deleted) {
      reply.status(404).send({ error: 'API key not found' })
      return
    }
    reply.send({ ok: true })
  })
}
