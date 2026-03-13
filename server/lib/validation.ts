import { z } from 'zod'
import type { FastifyReply } from 'fastify'

export const NumericIdParams = z.object({ id: z.coerce.number().int().positive() })
export const StringIdParams = z.object({ id: z.string() })

/**
 * Parse data against a Zod schema. Returns parsed data on success,
 * or sends a 400 response and returns null on failure.
 */
export function parseOrBadRequest<T>(
  schema: z.ZodType<T>,
  data: unknown,
  reply: FastifyReply,
): T | null {
  const result = schema.safeParse(data)
  if (!result.success) {
    reply.status(400).send({ error: result.error.issues[0].message })
    return null
  }
  return result.data
}
