import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setupTestDb } from '../__tests__/helpers/testDb.js'
import { buildApp } from '../__tests__/helpers/buildApp.js'
import { getDb, createFeed, insertArticle } from '../db.js'
import { hashSync } from 'bcryptjs'
import type { FastifyInstance } from 'fastify'

let app: FastifyInstance
let savedAuthDisabled: string | undefined

function seedUser(email = 'test@example.com', password = 'password123') {
  const hash = hashSync(password, 4) // low cost for tests
  getDb().prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)').run(email, hash)
}

async function clientLogin(email = 'test@example.com', password = 'password123') {
  const res = await app.inject({
    method: 'POST',
    url: '/accounts/ClientLogin',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    payload: `Email=${encodeURIComponent(email)}&Passwd=${encodeURIComponent(password)}`,
  })
  const auth = res.body.match(/Auth=(.+)/)?.[1]?.trim()
  return { res, auth: auth ?? null }
}

beforeEach(async () => {
  setupTestDb()
  app = await buildApp()
  // Remove AUTH_DISABLED so greader JWT auth is exercised properly
  savedAuthDisabled = process.env.AUTH_DISABLED
  delete process.env.AUTH_DISABLED
})

afterEach(() => {
  if (savedAuthDisabled !== undefined) {
    process.env.AUTH_DISABLED = savedAuthDisabled
  } else {
    delete process.env.AUTH_DISABLED
  }
})

// ── ClientLogin ──────────────────────────────────────────────────────────────

describe('POST /accounts/ClientLogin', () => {
  it('returns 403 for bad credentials', async () => {
    seedUser()
    const { res } = await clientLogin('test@example.com', 'wrongpassword')
    expect(res.statusCode).toBe(403)
    expect(res.body).toContain('Error=BadAuthentication')
  })

  it('returns token on valid credentials', async () => {
    seedUser()
    const { res, auth } = await clientLogin()
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toMatch(/text\/plain/)
    expect(auth).toBeTruthy()
    expect(res.body).toContain('SID=')
    expect(res.body).toContain('Auth=')
  })

  it('includes token_version in JWT payload', async () => {
    seedUser()
    const { auth } = await clientLogin()
    const decoded = app.jwt.decode(auth!) as { email: string; token_version: number }
    expect(decoded.email).toBe('test@example.com')
    expect(decoded.token_version).toBe(0)
  })
})

// ── Auth middleware ──────────────────────────────────────────────────────────

describe('/reader/api/0/* auth', () => {
  it('returns 401 with no auth header', async () => {
    const res = await app.inject({ method: 'GET', url: '/reader/api/0/user-info' })
    expect(res.statusCode).toBe(401)
    expect(res.body).toContain('Error=NeedsBrowser')
  })

  it('returns 401 with invalid token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/reader/api/0/user-info',
      headers: { authorization: 'GoogleLogin auth=not-a-valid-token' },
    })
    expect(res.statusCode).toBe(401)
    expect(res.body).toContain('Error=TokenExpired')
  })

  it('returns 401 when token_version is bumped', async () => {
    seedUser()
    const { auth } = await clientLogin()

    // Bump token_version to invalidate the issued token
    getDb().prepare('UPDATE users SET token_version = token_version + 1 WHERE email = ?').run('test@example.com')

    const res = await app.inject({
      method: 'GET',
      url: '/reader/api/0/user-info',
      headers: { authorization: `GoogleLogin auth=${auth}` },
    })
    expect(res.statusCode).toBe(401)
    expect(res.body).toContain('Error=TokenExpired')
  })
})

// ── Read endpoints ───────────────────────────────────────────────────────────

describe('GET /reader/api/0/subscription/list', () => {
  it('returns empty subscriptions when no feeds', async () => {
    seedUser()
    const { auth } = await clientLogin()
    const res = await app.inject({
      method: 'GET',
      url: '/reader/api/0/subscription/list',
      headers: { authorization: `GoogleLogin auth=${auth}` },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().subscriptions).toEqual([])
  })

  it('returns feeds as subscriptions', async () => {
    seedUser()
    createFeed({ name: 'My Feed', url: 'https://example.com', rss_url: 'https://example.com/rss' })
    const { auth } = await clientLogin()
    const res = await app.inject({
      method: 'GET',
      url: '/reader/api/0/subscription/list',
      headers: { authorization: `GoogleLogin auth=${auth}` },
    })
    expect(res.statusCode).toBe(200)
    const { subscriptions } = res.json()
    expect(subscriptions).toHaveLength(1)
    expect(subscriptions[0].id).toBe('feed/https://example.com/rss')
    expect(subscriptions[0].title).toBe('My Feed')
  })
})

describe('GET /reader/api/0/stream/items/ids', () => {
  it('returns item refs for existing articles', async () => {
    seedUser()
    const feed = createFeed({ name: 'Test Feed', url: 'https://example.com' })
    insertArticle({ feed_id: feed.id, title: 'Article 1', url: 'https://example.com/1', published_at: '2025-01-01T00:00:00Z' })
    const { auth } = await clientLogin()
    const res = await app.inject({
      method: 'GET',
      url: '/reader/api/0/stream/items/ids',
      headers: { authorization: `GoogleLogin auth=${auth}` },
    })
    expect(res.statusCode).toBe(200)
    const { itemRefs } = res.json()
    expect(itemRefs).toHaveLength(1)
    // IDs should be bare decimal strings
    expect(/^\d+$/.test(itemRefs[0].id)).toBe(true)
  })
})

// ── Write endpoints ──────────────────────────────────────────────────────────

describe('POST /reader/api/0/edit-tag', () => {
  it('marks article as read using decimal ID', async () => {
    seedUser()
    const feed = createFeed({ name: 'Test Feed', url: 'https://example.com' })
    const articleId = insertArticle({ feed_id: feed.id, title: 'Test', url: 'https://example.com/a', published_at: '2025-01-01T00:00:00Z' })
    const { auth } = await clientLogin()

    const res = await app.inject({
      method: 'POST',
      url: '/reader/api/0/edit-tag',
      headers: {
        authorization: `GoogleLogin auth=${auth}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      payload: `i=${articleId}&a=user/-/state/com.google/read`,
    })
    expect(res.statusCode).toBe(200)
    expect(res.body).toBe('OK')

    // Verify article is now marked seen in DB
    const row = getDb().prepare('SELECT seen_at FROM articles WHERE id = ?').get(articleId) as { seen_at: string | null }
    expect(row.seen_at).not.toBeNull()
  })

  it('marks article as starred using tag URI ID', async () => {
    seedUser()
    const feed = createFeed({ name: 'Test Feed', url: 'https://example.com' })
    const articleId = insertArticle({ feed_id: feed.id, title: 'Test', url: 'https://example.com/b', published_at: '2025-01-01T00:00:00Z' })
    const { auth } = await clientLogin()

    // Encode ID as tag URI with hex suffix
    const hexId = articleId.toString(16).padStart(16, '0')
    const tagUri = encodeURIComponent(`tag:google.com,2005:reader/item/${hexId}`)

    const res = await app.inject({
      method: 'POST',
      url: '/reader/api/0/edit-tag',
      headers: {
        authorization: `GoogleLogin auth=${auth}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      payload: `i=${tagUri}&a=user/-/state/com.google/starred`,
    })
    expect(res.statusCode).toBe(200)
    expect(res.body).toBe('OK')

    const row = getDb().prepare('SELECT liked_at FROM articles WHERE id = ?').get(articleId) as { liked_at: string | null }
    expect(row.liked_at).not.toBeNull()
  })
})
