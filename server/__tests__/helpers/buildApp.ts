import Fastify from 'fastify'
import jwt from '@fastify/jwt'
import rateLimit from '@fastify/rate-limit'
import multipart from '@fastify/multipart'
import { registerApi } from '../../api.js'
import { registerChatApi } from '../../chatRoutes.js'
import { authRoutes } from '../../authRoutes.js'
import { passkeyRoutes } from '../../passkeyRoutes.js'

export async function buildApp() {
  const app = Fastify()
  await app.register(jwt, { secret: 'test-secret', sign: { expiresIn: '30d' } })
  await app.register(rateLimit, { max: 100, timeWindow: '1 minute' })
  await app.register(multipart, { limits: { fileSize: 5 * 1024 * 1024 } })
  await app.register(authRoutes)
  await app.register(passkeyRoutes)
  registerApi(app)
  registerChatApi(app)
  return app
}
