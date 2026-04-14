import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setupTestDb } from '../__tests__/helpers/testDb.js'
import { buildApp } from '../__tests__/helpers/buildApp.js'
import { upsertSetting, getSetting, createFeed, insertArticle, markArticleSeen, getDb } from '../db.js'
import type { FastifyInstance } from 'fastify'

// ---------------------------------------------------------------------------
// Mocks — same as api.test.ts (needed for buildApp imports)
// ---------------------------------------------------------------------------

vi.mock('../fetcher.js', async () => {
  const { EventEmitter } = await import('events')
  return {
    fetchAllFeeds: vi.fn(),
    fetchSingleFeed: vi.fn(),
    discoverRssUrl: vi.fn().mockResolvedValue({ rssUrl: null, title: null }),
    summarizeArticle: vi.fn(),
    streamSummarizeArticle: vi.fn(),
    translateArticle: vi.fn(),
    streamTranslateArticle: vi.fn(),
    fetchProgress: new EventEmitter(),
    getFeedState: vi.fn(),
  }
})

vi.mock('../anthropic.js', () => ({
  anthropic: { messages: { stream: vi.fn(), create: vi.fn() } },
}))

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let app: FastifyInstance
const json = { 'content-type': 'application/json' }

beforeEach(async () => {
  setupTestDb()
  app = await buildApp()
})

// =========================================================================
// Provider-model consistency validation
// =========================================================================

describe('PATCH /api/settings/preferences — provider-model validation', () => {
  it('accepts valid anthropic provider and model', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/settings/preferences',
      headers: json,
      payload: {
        'chat.provider': 'anthropic',
        'chat.model': 'claude-haiku-4-5-20251001',
      },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()['chat.provider']).toBe('anthropic')
    expect(res.json()['chat.model']).toBe('claude-haiku-4-5-20251001')
  })

  it('accepts valid gemini provider and model', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/settings/preferences',
      headers: json,
      payload: {
        'chat.provider': 'gemini',
        'chat.model': 'gemini-2.5-flash',
      },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()['chat.provider']).toBe('gemini')
  })

  it('accepts valid openai provider and model', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/settings/preferences',
      headers: json,
      payload: {
        'summary.provider': 'openai',
        'summary.model': 'gpt-4.1-mini',
      },
    })
    expect(res.statusCode).toBe(200)
  })

  it('rejects model that does not belong to provider', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/settings/preferences',
      headers: json,
      payload: {
        'chat.provider': 'anthropic',
        'chat.model': 'gpt-4o',  // OpenAI model, not valid for anthropic
      },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/not valid for provider/)
  })

  it('rejects gemini model with anthropic provider', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/settings/preferences',
      headers: json,
      payload: {
        'translate.provider': 'anthropic',
        'translate.model': 'gemini-2.5-flash',
      },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/not valid for provider/)
  })

  it('validates against existing provider when only model is sent', async () => {
    // Set up: anthropic provider already saved
    upsertSetting('chat.provider', 'anthropic')

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/settings/preferences',
      headers: json,
      payload: {
        'chat.model': 'gpt-4o',  // Doesn't match existing provider
      },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/not valid for provider/)
  })

  it('validates against existing model when only provider is sent', async () => {
    // Set up: openai model already saved
    upsertSetting('chat.model', 'gpt-4o')

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/settings/preferences',
      headers: json,
      payload: {
        'chat.provider': 'anthropic',  // Doesn't match existing model
      },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/not valid for provider/)
  })

  it('claude-code provider accepts anthropic model IDs', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/settings/preferences',
      headers: json,
      payload: {
        'chat.provider': 'claude-code',
        'chat.model': 'claude-haiku-4-5-20251001',
      },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()['chat.provider']).toBe('claude-code')
  })

  it('claude-code provider rejects non-anthropic model', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/settings/preferences',
      headers: json,
      payload: {
        'chat.provider': 'claude-code',
        'chat.model': 'gpt-4o',
      },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/not valid for provider/)
  })

  it('validates all three provider-model pairs independently', async () => {
    // Valid chat pair, invalid summary pair
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/settings/preferences',
      headers: json,
      payload: {
        'chat.provider': 'anthropic',
        'chat.model': 'claude-haiku-4-5-20251001',
        'summary.provider': 'gemini',
        'summary.model': 'gpt-4o',  // Wrong: openai model with gemini provider
      },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/not valid for provider/)
  })

  it('skips validation when provider or model is empty', async () => {
    // Only set provider without model — should pass (no model to validate against)
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/settings/preferences',
      headers: json,
      payload: {
        'chat.provider': 'gemini',
      },
    })
    expect(res.statusCode).toBe(200)
  })
})

// =========================================================================
// AI provider enum validation
// =========================================================================

describe('PATCH /api/settings/preferences — AI provider/model enums', () => {
  it('rejects invalid provider value', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/settings/preferences',
      headers: json,
      payload: { 'chat.provider': 'llama' },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/chat\.provider/)
  })

  it('rejects invalid model value when provider is set', async () => {
    upsertSetting('chat.provider', 'anthropic')
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/settings/preferences',
      headers: json,
      payload: { 'chat.model': 'nonexistent-model-9000' },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/not valid for provider/)
  })

  it('accepts all four valid provider values for chat', async () => {
    for (const provider of ['anthropic', 'gemini', 'openai', 'claude-code']) {
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/settings/preferences',
        headers: json,
        payload: { 'chat.provider': provider },
      })
      expect(res.statusCode).toBe(200)
    }
  })

  it('accepts translate-only providers (google-translate, deepl) for translate.provider', async () => {
    for (const provider of ['google-translate', 'deepl']) {
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/settings/preferences',
        headers: json,
        payload: { 'translate.provider': provider },
      })
      expect(res.statusCode).toBe(200)
      expect(res.json()['translate.provider']).toBe(provider)
    }
  })

  it('rejects translate-only providers for chat/summary', async () => {
    for (const provider of ['google-translate', 'deepl']) {
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/settings/preferences',
        headers: json,
        payload: { 'chat.provider': provider },
      })
      expect(res.statusCode).toBe(400)
    }
  })

  it('skips model validation for google-translate and deepl providers', async () => {
    // Set a model that would fail validation for LLM providers
    upsertSetting('translate.model', 'gpt-4o')

    for (const provider of ['google-translate', 'deepl']) {
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/settings/preferences',
        headers: json,
        payload: { 'translate.provider': provider },
      })
      // Should pass because model validation is skipped for these providers
      expect(res.statusCode).toBe(200)
    }
  })
})

// =========================================================================
// POST preferences endpoint (same handler as PATCH)
// =========================================================================

describe('POST /api/settings/preferences', () => {
  it('updates preferences via POST (same handler)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/settings/preferences',
      headers: json,
      payload: { 'reading.date_mode': 'absolute' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()['reading.date_mode']).toBe('absolute')
  })

  it('validates provider-model consistency via POST', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/settings/preferences',
      headers: json,
      payload: {
        'chat.provider': 'gemini',
        'chat.model': 'claude-haiku-4-5-20251001',  // Wrong provider
      },
    })
    expect(res.statusCode).toBe(400)
  })
})

// =========================================================================
// Boolean/on-off preferences
// =========================================================================

describe('PATCH /api/settings/preferences — on/off toggles', () => {
  it('accepts on/off for auto_mark_read', async () => {
    const resOn = await app.inject({
      method: 'PATCH',
      url: '/api/settings/preferences',
      headers: json,
      payload: { 'reading.auto_mark_read': 'on' },
    })
    expect(resOn.statusCode).toBe(200)
    expect(resOn.json()['reading.auto_mark_read']).toBe('on')

    const resOff = await app.inject({
      method: 'PATCH',
      url: '/api/settings/preferences',
      headers: json,
      payload: { 'reading.auto_mark_read': 'off' },
    })
    expect(resOff.statusCode).toBe(200)
    expect(resOff.json()['reading.auto_mark_read']).toBe('off')
  })

  it('rejects invalid on/off value', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/settings/preferences',
      headers: json,
      payload: { 'reading.auto_mark_read': 'yes' },
    })
    expect(res.statusCode).toBe(400)
  })

  it('rejects invalid unread_indicator value', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/settings/preferences',
      headers: json,
      payload: { 'reading.unread_indicator': 'true' },
    })
    expect(res.statusCode).toBe(400)
  })

  it('rejects invalid internal_links value', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/settings/preferences',
      headers: json,
      payload: { 'reading.internal_links': '1' },
    })
    expect(res.statusCode).toBe(400)
  })

  it('rejects invalid show_thumbnails value', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/settings/preferences',
      headers: json,
      payload: { 'reading.show_thumbnails': 'true' },
    })
    expect(res.statusCode).toBe(400)
  })

  it('accepts on/off for category_unread_only', async () => {
    const resOn = await app.inject({
      method: 'PATCH',
      url: '/api/settings/preferences',
      headers: json,
      payload: { 'reading.category_unread_only': 'on' },
    })
    expect(resOn.statusCode).toBe(200)
    expect(resOn.json()['reading.category_unread_only']).toBe('on')

    const resOff = await app.inject({
      method: 'PATCH',
      url: '/api/settings/preferences',
      headers: json,
      payload: { 'reading.category_unread_only': 'off' },
    })
    expect(resOff.statusCode).toBe(200)
    expect(resOff.json()['reading.category_unread_only']).toBe('off')
  })

  it('rejects invalid category_unread_only value', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/settings/preferences',
      headers: json,
      payload: { 'reading.category_unread_only': 'yes' },
    })
    expect(res.statusCode).toBe(400)
  })
})

// =========================================================================
// Profile — avatar_seed
// =========================================================================

describe('PATCH /api/settings/profile — avatar_seed', () => {
  it('updates avatar_seed', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/settings/profile',
      headers: json,
      payload: { avatar_seed: 'my-seed-123' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().avatar_seed).toBe('my-seed-123')
  })

  it('clears avatar_seed with null', async () => {
    // Set first
    await app.inject({
      method: 'PATCH',
      url: '/api/settings/profile',
      headers: json,
      payload: { avatar_seed: 'seed' },
    })

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/settings/profile',
      headers: json,
      payload: { avatar_seed: null },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().avatar_seed).toBeNull()
  })
})

// =========================================================================
// Profile — default account_name initialization
// =========================================================================

describe('GET /api/settings/profile — defaults', () => {
  it('initializes account_name from auth email on first access', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/settings/profile' })
    expect(res.statusCode).toBe(200)
    // Should auto-initialize
    expect(res.json().account_name).toBeDefined()
    expect(res.json().account_name.length).toBeGreaterThan(0)

    // Should persist after initialization
    const stored = getSetting('profile.account_name')
    expect(stored).toBe(res.json().account_name)
  })
})

// =========================================================================
// Provider API key management
// =========================================================================

describe('GET /api/settings/api-keys/:provider', () => {
  it('returns configured=false when no key set', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/settings/api-keys/anthropic',
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().configured).toBe(false)
  })

  it('returns configured=true when key is set', async () => {
    upsertSetting('api_key.anthropic', 'sk-test')

    const res = await app.inject({
      method: 'GET',
      url: '/api/settings/api-keys/anthropic',
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().configured).toBe(true)
  })

  it('returns 400 for unknown provider', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/settings/api-keys/unknown',
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toContain('Unknown provider')
  })

  it('works for all known providers', async () => {
    for (const provider of ['anthropic', 'gemini', 'openai']) {
      const res = await app.inject({
        method: 'GET',
        url: `/api/settings/api-keys/${provider}`,
      })
      expect(res.statusCode).toBe(200)
    }
  })
})

describe('POST /api/settings/api-keys/:provider', () => {
  it('saves API key', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/settings/api-keys/anthropic',
      headers: json,
      payload: { apiKey: 'sk-new-key' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().configured).toBe(true)
    expect(getSetting('api_key.anthropic')).toBe('sk-new-key')
  })

  it('deletes API key when empty', async () => {
    upsertSetting('api_key.anthropic', 'sk-old')

    const res = await app.inject({
      method: 'POST',
      url: '/api/settings/api-keys/anthropic',
      headers: json,
      payload: { apiKey: '' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().configured).toBe(false)
    expect(getSetting('api_key.anthropic')).toBeUndefined()
  })

  it('deletes API key when missing', async () => {
    upsertSetting('api_key.gemini', 'old-key')

    const res = await app.inject({
      method: 'POST',
      url: '/api/settings/api-keys/gemini',
      headers: json,
      payload: {},
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().configured).toBe(false)
  })

  it('trims whitespace from key', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/settings/api-keys/openai',
      headers: json,
      payload: { apiKey: '  sk-trimmed  ' },
    })
    expect(getSetting('api_key.openai')).toBe('sk-trimmed')
  })

  it('returns 400 for unknown provider', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/settings/api-keys/deepseek',
      headers: json,
      payload: { apiKey: 'key' },
    })
    expect(res.statusCode).toBe(400)
  })
})

// =========================================================================
// Retention policy endpoints
// =========================================================================

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
}

describe('GET /api/settings/retention/stats', () => {
  it('returns zeros when retention is not configured', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/settings/retention/stats' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ readDays: 0, unreadDays: 0, readEligible: 0, unreadEligible: 0 })
  })

  it('returns eligible counts when configured', async () => {
    const feed = createFeed({ name: 'F', url: 'https://f.com' })
    const id = insertArticle({ feed_id: feed.id, title: 'Old', url: 'https://f.com/1', published_at: '2025-01-01T00:00:00Z' })
    markArticleSeen(id, true)
    getDb().prepare('UPDATE articles SET seen_at = ? WHERE id = ?').run(daysAgo(100), id)

    upsertSetting('retention.enabled', 'on')
    upsertSetting('retention.read_days', '90')
    upsertSetting('retention.unread_days', '180')

    const res = await app.inject({ method: 'GET', url: '/api/settings/retention/stats' })
    expect(res.statusCode).toBe(200)
    expect(res.json().readEligible).toBe(1)
    expect(res.json().readDays).toBe(90)
  })
})

describe('POST /api/settings/retention/purge', () => {
  it('returns 400 when retention is not enabled', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/settings/retention/purge' })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/not enabled/)
  })

  it('returns purged: 0 when enabled but no days configured', async () => {
    upsertSetting('retention.enabled', 'on')

    const res = await app.inject({ method: 'POST', url: '/api/settings/retention/purge' })
    expect(res.statusCode).toBe(200)
    expect(res.json().purged).toBe(0)
  })

  it('purges eligible articles', async () => {
    const feed = createFeed({ name: 'F', url: 'https://f.com' })
    const id = insertArticle({ feed_id: feed.id, title: 'Old', url: 'https://f.com/1', published_at: '2025-01-01T00:00:00Z' })
    markArticleSeen(id, true)
    getDb().prepare('UPDATE articles SET seen_at = ? WHERE id = ?').run(daysAgo(100), id)

    upsertSetting('retention.enabled', 'on')
    upsertSetting('retention.read_days', '90')
    upsertSetting('retention.unread_days', '180')

    const res = await app.inject({ method: 'POST', url: '/api/settings/retention/purge' })
    expect(res.statusCode).toBe(200)
    expect(res.json().purged).toBe(1)
  })
})

describe('PATCH /api/settings/preferences — retention validation', () => {
  it('accepts valid retention day values', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/settings/preferences',
      headers: json,
      payload: { 'retention.read_days': '90', 'retention.unread_days': '180' },
    })
    expect(res.statusCode).toBe(200)
  })

  it('rejects non-integer retention days', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/settings/preferences',
      headers: json,
      payload: { 'retention.read_days': '3.5' },
    })
    expect(res.statusCode).toBe(400)
  })

  it('rejects zero retention days', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/settings/preferences',
      headers: json,
      payload: { 'retention.read_days': '0' },
    })
    expect(res.statusCode).toBe(400)
  })

  it('rejects negative retention days', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/settings/preferences',
      headers: json,
      payload: { 'retention.unread_days': '-10' },
    })
    expect(res.statusCode).toBe(400)
  })

  it('rejects retention days exceeding 9999', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/settings/preferences',
      headers: json,
      payload: { 'retention.read_days': '10000' },
    })
    expect(res.statusCode).toBe(400)
  })
})

describe('vLLM endpoints', () => {
  it('GET /api/settings/vllm/status returns connection failed when unreachable', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/settings/vllm/status',
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.ok).toBe(false)
    expect(body.error).toBeDefined()
  })

  it('PATCH /api/settings/preferences updates vllm.base_url', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/settings/preferences',
      headers: json,
      payload: { 'vllm.base_url': 'http://vllm:8000' },
    })
    expect(res.statusCode).toBe(200)
    const { getSetting } = await import('../db.js')
    expect(getSetting('vllm.base_url')).toBe('http://vllm:8000')
  })
})

