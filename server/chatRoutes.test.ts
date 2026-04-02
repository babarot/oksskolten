import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setupTestDb } from './__tests__/helpers/testDb.js'
import { buildApp } from './__tests__/helpers/buildApp.js'
import {
  createFeed,
  insertArticle,
  createConversation,
  upsertSetting,
  getDb,
  getConversationById,
  getChatMessages,
  insertChatMessage,
} from './db.js'
import { hashSync } from 'bcryptjs'
import { afterEach } from 'vitest'
import { MAX_SCOPE_ARTICLES, serializeChatScope } from './chat/scope.js'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const { mockRunChatTurn } = vi.hoisted(() => ({
  mockRunChatTurn: vi.fn(),
}))

vi.mock('./chat/adapter.js', () => ({
  runChatTurn: (...args: unknown[]) => mockRunChatTurn(...args),
}))

vi.mock('./fetcher.js', () => ({
  fetchAllFeeds: vi.fn(),
  fetchSingleFeed: vi.fn(),
  discoverRssUrl: vi.fn().mockResolvedValue({ rssUrl: null, title: null }),
  summarizeArticle: vi.fn(),
  streamSummarizeArticle: vi.fn(),
  translateArticle: vi.fn(),
  streamTranslateArticle: vi.fn(),
  fetchProgress: { on: vi.fn(), off: vi.fn(), emit: vi.fn() },
  getFeedState: vi.fn(),
}))

vi.mock('./anthropic.js', () => ({
  anthropic: { messages: { stream: vi.fn(), create: vi.fn() } },
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let app: Awaited<ReturnType<typeof buildApp>>
let savedAuthDisabled: string | undefined
const json = { 'content-type': 'application/json' }

function seedUser(): number {
  const db = getDb()
  const hash = hashSync('testpass', 4)
  db.prepare('INSERT OR REPLACE INTO users (email, password_hash) VALUES (?, ?)').run('test@example.com', hash)
  return (db.prepare('SELECT id FROM users WHERE email = ?').get('test@example.com') as { id: number }).id
}

function getToken(): string {
  return app.jwt.sign({ email: 'test@example.com', token_version: 0 })
}

function defaultChatMock() {
  mockRunChatTurn.mockImplementation(async (_backend: string, { messages, onEvent }: any) => {
    onEvent({ type: 'text_delta', text: 'Response' })
    onEvent({ type: 'done', usage: { input_tokens: 10, output_tokens: 5 } })
    return {
      allMessages: [
        ...messages,
        { role: 'assistant', content: [{ type: 'text', text: 'Response' }] },
      ],
      usage: { input_tokens: 10, output_tokens: 5 },
    }
  })
}

function parseSSEEvents(body: string) {
  return body
    .split('\n')
    .filter((l: string) => l.startsWith('data: '))
    .map((l: string) => JSON.parse(l.slice(6)))
}

beforeEach(async () => {
  setupTestDb()
  app = await buildApp()
  vi.clearAllMocks()
  defaultChatMock()
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

// ---------------------------------------------------------------------------
// Auth requirement
// ---------------------------------------------------------------------------
describe('auth requirement', () => {
  it('returns 401 for POST /api/chat without auth', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/chat', headers: json, payload: { message: 'hi' } })
    expect(res.statusCode).toBe(401)
  })

  it('returns 401 for GET /api/chat/conversations without auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/chat/conversations' })
    expect(res.statusCode).toBe(401)
  })

})

// ---------------------------------------------------------------------------
// POST /api/chat — article context
// ---------------------------------------------------------------------------
describe('POST /api/chat with article_id', () => {
  it('includes article context in system prompt', async () => {
    seedUser()
    const token = getToken()
    const feed = createFeed({ name: 'TestFeed', url: 'https://example.com' })
    const articleId = insertArticle({
      feed_id: feed.id,
      title: 'Test Article',
      url: 'https://example.com/article',
      published_at: null,
      full_text: 'This is the article body.',
    })

    const res = await app.inject({
      method: 'POST',
      url: '/api/chat',
      headers: { ...json, authorization: `Bearer ${token}` },
      payload: { message: 'Summarize this', article_id: articleId },
    })
    expect(res.statusCode).toBe(200)

    // Verify article context was passed to the adapter
    const callArgs = mockRunChatTurn.mock.calls[0][1]
    expect(callArgs.system).toContain('Test Article')
    expect(callArgs.system).toContain('This is the article body.')
  })

  it('truncates long article text', async () => {
    seedUser()
    const token = getToken()
    const feed = createFeed({ name: 'F', url: 'https://example.com' })
    const longText = 'x'.repeat(15000)
    const articleId = insertArticle({
      feed_id: feed.id,
      title: 'Long',
      url: 'https://example.com/long',
      published_at: null,
      full_text: longText,
    })

    await app.inject({
      method: 'POST',
      url: '/api/chat',
      headers: { ...json, authorization: `Bearer ${token}` },
      payload: { message: 'test', article_id: articleId },
    })

    const callArgs = mockRunChatTurn.mock.calls[0][1]
    expect(callArgs.system).toContain('(truncated)')
    // Should not contain the full 5000 chars
    expect(callArgs.system.length).toBeLessThan(longText.length)
  })

  it('persists legacy article_id requests as article scope', async () => {
    seedUser()
    const token = getToken()
    const feed = createFeed({ name: 'Scoped Feed', url: 'https://example.com' })
    const articleId = insertArticle({
      feed_id: feed.id,
      title: 'Scoped Article',
      url: 'https://example.com/scoped',
      published_at: null,
      full_text: 'Scoped body',
    })

    const res = await app.inject({
      method: 'POST',
      url: '/api/chat',
      headers: { ...json, authorization: `Bearer ${token}` },
      payload: { message: 'Use article scope', article_id: articleId },
    })

    const events = parseSSEEvents(res.body)
    const convId = events.find((e: any) => e.type === 'conversation_id')!.conversation_id
    const conv = getConversationById(convId)
    expect(conv?.scope_type).toBe('article')
    expect(conv?.scope_payload_json).toBe(JSON.stringify({ type: 'article', article_id: articleId }))
  })
})

describe('POST /api/chat scope persistence', () => {
  it('resolves filtered_list to a persisted capped snapshot', async () => {
    const userId = seedUser()
    const token = getToken()
    const feed = createFeed({ name: 'List Feed', url: 'https://example.com/list' }, userId)

    for (let i = 0; i < MAX_SCOPE_ARTICLES + 15; i++) {
      insertArticle({
        user_id: userId,
        feed_id: feed.id,
        title: `Article ${i}`,
        url: `https://example.com/list/${i}`,
        published_at: `2025-01-${String((i % 28) + 1).padStart(2, '0')}T00:00:00Z`,
      })
    }

    const res = await app.inject({
      method: 'POST',
      url: '/api/chat',
      headers: { ...json, authorization: `Bearer ${token}` },
      payload: {
        message: 'Talk about current filtered list',
        scope: {
          type: 'list',
          mode: 'filtered_list',
          label: 'Unread in feed',
          source_filters: { feed_id: feed.id, unread: true },
        },
      },
    })

    expect(res.statusCode).toBe(200)
    const events = parseSSEEvents(res.body)
    const convId = events.find((e: any) => e.type === 'conversation_id')!.conversation_id
    const conv = getConversationById(convId)
    const payload = JSON.parse(conv!.scope_payload_json!)

    expect(conv?.scope_type).toBe('list')
    expect(payload.type).toBe('list')
    expect(payload.mode).toBe('filtered_list')
    expect(payload.label).toBe('Unread in feed')
    expect(payload.count_total).toBe(MAX_SCOPE_ARTICLES + 15)
    expect(payload.count_scoped).toBe(MAX_SCOPE_ARTICLES)
    expect(payload.article_ids).toHaveLength(MAX_SCOPE_ARTICLES)
    expect(payload.source_filters).toEqual({ feed_id: feed.id, unread: true })
  })

  it('rejects scope drift on existing conversations', async () => {
    seedUser()
    const token = getToken()
    const serialized = serializeChatScope({ type: 'global' })
    createConversation({
      id: 'conv-scope-mismatch',
      article_id: serialized.article_id,
      scope_type: serialized.scope_type,
      scope_payload_json: serialized.scope_payload_json,
    })

    const res = await app.inject({
      method: 'POST',
      url: '/api/chat',
      headers: { ...json, authorization: `Bearer ${token}` },
      payload: {
        conversation_id: 'conv-scope-mismatch',
        message: 'switch scope',
        scope: { type: 'article', article_id: 123 },
      },
    })

    expect(res.statusCode).toBe(409)
    expect(res.json()).toEqual({ error: 'Conversation scope mismatch' })
  })

  it('restores persisted scope when continuing a conversation without resending scope', async () => {
    seedUser()
    const token = getToken()
    const feed = createFeed({ name: 'Persisted Scope Feed', url: 'https://example.com/persisted' })
    const inScopeId = insertArticle({
      feed_id: feed.id,
      title: 'In scope',
      url: 'https://example.com/persisted/in',
      published_at: '2025-01-01T00:00:00Z',
    })
    insertArticle({
      feed_id: feed.id,
      title: 'Out of scope',
      url: 'https://example.com/persisted/out',
      published_at: '2025-01-02T00:00:00Z',
    })
    const storedScope = {
      type: 'list' as const,
      mode: 'loaded_list' as const,
      label: 'Persisted list',
      count_total: 1,
      count_scoped: 1,
      article_ids: [inScopeId],
    }
    const serialized = serializeChatScope(storedScope)
    createConversation({
      id: 'conv-resume-scope',
      article_id: serialized.article_id,
      scope_type: serialized.scope_type,
      scope_payload_json: serialized.scope_payload_json,
    })

    const res = await app.inject({
      method: 'POST',
      url: '/api/chat',
      headers: { ...json, authorization: `Bearer ${token}` },
      payload: {
        conversation_id: 'conv-resume-scope',
        message: 'continue with stored scope',
      },
    })

    expect(res.statusCode).toBe(200)
    const callArgs = mockRunChatTurn.mock.calls[0][1]
    expect(callArgs.scope).toEqual(storedScope)
  })
})

// ---------------------------------------------------------------------------
// POST /api/chat — auto-title
// ---------------------------------------------------------------------------
describe('POST /api/chat — auto-title', () => {
  it('sets conversation title from first message', async () => {
    seedUser()
    const token = getToken()

    const res = await app.inject({
      method: 'POST',
      url: '/api/chat',
      headers: { ...json, authorization: `Bearer ${token}` },
      payload: { message: 'What is RSS?' },
    })
    expect(res.statusCode).toBe(200)

    const events = parseSSEEvents(res.body)
    const convId = events.find((e: any) => e.type === 'conversation_id')!.conversation_id
    const conv = getConversationById(convId)
    expect(conv!.title).toBe('What is RSS?')
  })

  it('truncates long messages for title', async () => {
    seedUser()
    const token = getToken()
    const longMessage = 'A'.repeat(60)

    const res = await app.inject({
      method: 'POST',
      url: '/api/chat',
      headers: { ...json, authorization: `Bearer ${token}` },
      payload: { message: longMessage },
    })

    const events = parseSSEEvents(res.body)
    const convId = events.find((e: any) => e.type === 'conversation_id')!.conversation_id
    const conv = getConversationById(convId)
    expect(conv!.title!.length).toBeLessThanOrEqual(51) // 50 + "…"
    expect(conv!.title).toContain('…')
  })

  it('does not overwrite existing title', async () => {
    seedUser()
    const token = getToken()
    createConversation({ id: 'titled-conv', title: 'Original Title' })

    await app.inject({
      method: 'POST',
      url: '/api/chat',
      headers: { ...json, authorization: `Bearer ${token}` },
      payload: { message: 'New message', conversation_id: 'titled-conv' },
    })

    const conv = getConversationById('titled-conv')
    expect(conv!.title).toBe('Original Title')
  })
})

// ---------------------------------------------------------------------------
// POST /api/chat — error handling
// ---------------------------------------------------------------------------
describe('POST /api/chat — error handling', () => {
  it('sends error event and removes user message on adapter failure', async () => {
    seedUser()
    const token = getToken()

    mockRunChatTurn.mockRejectedValue(new Error('LLM API failed'))

    const res = await app.inject({
      method: 'POST',
      url: '/api/chat',
      headers: { ...json, authorization: `Bearer ${token}` },
      payload: { message: 'fail please' },
    })

    expect(res.statusCode).toBe(200) // SSE always 200
    const events = parseSSEEvents(res.body)
    const errorEvent = events.find((e: any) => e.type === 'error')
    expect(errorEvent).toBeDefined()
    expect(errorEvent.error).toBe('LLM API failed')

    // User message should have been deleted
    const convId = events.find((e: any) => e.type === 'conversation_id')!.conversation_id
    const messages = getChatMessages(convId)
    expect(messages).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// POST /api/chat — provider/model settings
// ---------------------------------------------------------------------------
describe('POST /api/chat — settings', () => {
  it('uses custom chat provider from settings', async () => {
    seedUser()
    const token = getToken()
    upsertSetting('chat.provider', 'gemini')

    await app.inject({
      method: 'POST',
      url: '/api/chat',
      headers: { ...json, authorization: `Bearer ${token}` },
      payload: { message: 'test' },
    })

    expect(mockRunChatTurn).toHaveBeenCalledWith('gemini', expect.anything())
  })

  it('uses custom chat model from settings', async () => {
    seedUser()
    const token = getToken()
    upsertSetting('chat.model', 'gpt-4.1')

    await app.inject({
      method: 'POST',
      url: '/api/chat',
      headers: { ...json, authorization: `Bearer ${token}` },
      payload: { message: 'test' },
    })

    const callArgs = mockRunChatTurn.mock.calls[0][1]
    expect(callArgs.model).toBe('gpt-4.1')
  })
})

// ---------------------------------------------------------------------------
// GET /api/chat/conversations — message_count
// ---------------------------------------------------------------------------
describe('GET /api/chat/conversations — message_count', () => {
  it('counts only text messages, excluding tool_use and tool_result', async () => {
    seedUser()
    const token = getToken()

    // Create a conversation with mixed message types (simulating tool use flow)
    createConversation({ id: 'conv-tool' })
    // 1. user text
    insertChatMessage({ conversation_id: 'conv-tool', role: 'user', content: JSON.stringify([{ type: 'text', text: 'recommend an article' }]) })
    // 2. assistant tool_use (not visible)
    insertChatMessage({ conversation_id: 'conv-tool', role: 'assistant', content: JSON.stringify([{ type: 'tool_use', id: 'call_1', name: 'search_articles', input: {} }]) })
    // 3. user tool_result (not visible)
    insertChatMessage({ conversation_id: 'conv-tool', role: 'user', content: JSON.stringify([{ type: 'tool_result', tool_use_id: 'call_1', content: '[]' }]) })
    // 4. assistant text
    insertChatMessage({ conversation_id: 'conv-tool', role: 'assistant', content: JSON.stringify([{ type: 'text', text: 'Here is an article.' }]) })

    const res = await app.inject({
      method: 'GET',
      url: '/api/chat/conversations',
      headers: { authorization: `Bearer ${token}` },
    })

    expect(res.statusCode).toBe(200)
    const { conversations } = res.json()
    const conv = conversations.find((c: any) => c.id === 'conv-tool')
    expect(conv).toBeDefined()
    expect(conv.message_count).toBe(2)
  })

  it('returns scope_type and scope_summary for scoped conversations', async () => {
    const userId = seedUser()
    const token = getToken()
    const feed = createFeed({ name: 'Summary Feed', url: 'https://example.com/summary' }, userId)
    const articleId = insertArticle({
      user_id: userId,
      feed_id: feed.id,
      title: 'Summary Article',
      url: 'https://example.com/summary/article',
      published_at: '2025-01-01T00:00:00Z',
    })
    const serialized = serializeChatScope({ type: 'article', article_id: articleId })
    createConversation({
      id: 'conv-summary',
      article_id: serialized.article_id,
      scope_type: serialized.scope_type,
      scope_payload_json: serialized.scope_payload_json,
    })
    insertChatMessage({
      conversation_id: 'conv-summary',
      role: 'user',
      content: JSON.stringify([{ type: 'text', text: 'hello' }]),
    })

    const res = await app.inject({
      method: 'GET',
      url: '/api/chat/conversations',
      headers: { authorization: `Bearer ${token}` },
    })

    expect(res.statusCode).toBe(200)
    const { conversations } = res.json()
    const conv = conversations.find((c: any) => c.id === 'conv-summary')
    expect(conv.scope_type).toBe('article')
    expect(conv.scope_summary).toMatchObject({
      type: 'article',
      detail: 'Summary Article',
    })
  })
})
