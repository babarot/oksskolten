import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  markAllSeenByCategory,
} from '../db.js'
import { requireJson, getRequestUserId } from '../auth.js'
import { NumericIdParams, parseOrBadRequest } from '../lib/validation.js'

const CreateCategoryBody = z.object({
  name: z.string({ error: 'name is required' }).trim().min(1, 'name is required'),
})

const UpdateCategoryBody = z.object({
  name: z.string().optional(),
  sort_order: z.number().optional(),
  collapsed: z.number().optional(),
})

export async function categoryRoutes(api: FastifyInstance): Promise<void> {
  api.get('/api/categories', async (request, reply) => {
    const userId = getRequestUserId(request)
    const categories = getCategories(userId)
    reply.send({ categories })
  })

  api.post(
    '/api/categories',
    { preHandler: [requireJson] },
    async (request, reply) => {
      const body = parseOrBadRequest(CreateCategoryBody, request.body, reply)
      if (!body) return
      const userId = getRequestUserId(request)
      const category = createCategory(body.name.trim(), userId)
      reply.status(201).send(category)
    },
  )

  api.patch(
    '/api/categories/:id',
    { preHandler: [requireJson] },
    async (request, reply) => {
      const params = parseOrBadRequest(NumericIdParams, request.params, reply)
      if (!params) return
      const body = parseOrBadRequest(UpdateCategoryBody, request.body, reply)
      if (!body) return
      const userId = getRequestUserId(request)
      const category = updateCategory(params.id, body, userId)
      if (!category) {
        reply.status(404).send({ error: 'Category not found' })
        return
      }
      reply.send(category)
    },
  )

  api.delete(
    '/api/categories/:id',
    async (request, reply) => {
      const params = parseOrBadRequest(NumericIdParams, request.params, reply)
      if (!params) return
      const userId = getRequestUserId(request)
      const deleted = deleteCategory(params.id, userId)
      if (!deleted) {
        reply.status(404).send({ error: 'Category not found' })
        return
      }
      reply.status(204).send()
    },
  )

  api.post(
    '/api/categories/:id/mark-all-seen',
    async (request, reply) => {
      const params = parseOrBadRequest(NumericIdParams, request.params, reply)
      if (!params) return
      const userId = getRequestUserId(request)
      const result = markAllSeenByCategory(params.id, userId)
      reply.send(result)
    },
  )
}
