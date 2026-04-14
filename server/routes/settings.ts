import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import {
  getSetting,
  upsertSetting,
  deleteSetting,
  getRetentionStats,
  purgeExpiredArticles,
  getDb,
} from '../db.js'
import { requireJson, getAuthUser } from '../auth.js'
import { getAllModelValues, getModelValues } from '../../shared/models.js'
import { assertSafeUrl } from '../fetcher/ssrf.js'
import { extractByDotPath } from '../fetcher/article-images.js'
import { getMonthlyUsage } from '../providers/translate/google-translate.js'
import { getDeeplMonthlyUsage } from '../providers/translate/deepl.js'
import { parseOrBadRequest } from '../lib/validation.js'

const ProfileBody = z.object({
  account_name: z.string().optional(),
  avatar_seed: z.string().nullable().optional(),
  language: z.enum(['ja', 'en'], { error: 'language must be "ja" or "en"' }).optional(),
})

const ProviderParams = z.object({ provider: z.string() })
const ApiKeyBody = z.object({ apiKey: z.string().optional() })

const PREF_KEYS = [
  'appearance.color_theme',
  'reading.date_mode',
  'reading.auto_mark_read',
  'reading.unread_indicator',
  'reading.internal_links',
  'reading.show_thumbnails',
  'reading.show_feed_activity',
  'reading.chat_position',
  'reading.article_open_mode',
  'reading.category_unread_only',
  'reading.keyboard_navigation',
  'reading.keybindings',
  'appearance.mascot',
  'appearance.highlight_theme',
  'appearance.font_family',
  'appearance.list_layout',
  'chat.provider',
  'chat.model',
  'summary.provider',
  'summary.model',
  'translate.provider',
  'translate.model',
  'translate.target_lang',
  'ollama.base_url',
  'ollama.custom_headers',
  'vllm.base_url',
  'custom_themes',
  'retention.enabled',
  'retention.read_days',
  'retention.unread_days',
] as const
type PrefKey = typeof PREF_KEYS[number]

const PREF_ALLOWED: Record<PrefKey, string[] | null> = {
  'appearance.color_theme': null,
  'reading.date_mode': ['relative', 'absolute'],
  'reading.auto_mark_read': ['on', 'off'],
  'reading.unread_indicator': ['on', 'off'],
  'reading.internal_links': ['on', 'off'],
  'reading.show_thumbnails': ['on', 'off'],
  'reading.show_feed_activity': ['on', 'off'],
  'reading.chat_position': ['fab', 'inline'],
  'reading.article_open_mode': ['page', 'overlay'],
  'reading.category_unread_only': ['on', 'off'],
  'reading.keyboard_navigation': ['on', 'off'],
  'reading.keybindings': null,
  'appearance.mascot': ['off', 'dream-puff', 'sleepy-giant'],
  'appearance.highlight_theme': null,
  'appearance.font_family': null,
  'appearance.list_layout': ['list', 'card', 'magazine', 'compact'],
  'chat.provider': ['anthropic', 'gemini', 'openai', 'claude-code', 'ollama', 'vllm'],
  'chat.model': getAllModelValues(),
  'summary.provider': ['anthropic', 'gemini', 'openai', 'claude-code', 'ollama', 'vllm'],
  'summary.model': getAllModelValues(),
  'translate.provider': ['anthropic', 'gemini', 'openai', 'claude-code', 'ollama', 'vllm', 'google-translate', 'deepl'],
  'translate.model': getAllModelValues(),
  'translate.target_lang': ['ja', 'en'],
  'ollama.base_url': null,
  'ollama.custom_headers': null,
  'vllm.base_url': null,
  'custom_themes': null,
  'retention.enabled': ['on', 'off'],
  'retention.read_days': null,
  'retention.unread_days': null,
}

const PROVIDER_MODEL_PAIRS: Array<{ providerKey: PrefKey; modelKey: PrefKey }> = [
  { providerKey: 'chat.provider', modelKey: 'chat.model' },
  { providerKey: 'summary.provider', modelKey: 'summary.model' },
  { providerKey: 'translate.provider', modelKey: 'translate.model' },
]

function validateProviderModel(body: Record<string, unknown>): string | null {
  for (const { providerKey, modelKey } of PROVIDER_MODEL_PAIRS) {
    const model = body[modelKey] !== undefined ? String(body[modelKey]) : getSetting(modelKey)
    const provider = body[providerKey] !== undefined ? String(body[providerKey]) : getSetting(providerKey)
    if (!model || !provider) continue
    // google-translate, deepl, ollama, and vllm have no static model list
    if (provider === 'google-translate' || provider === 'deepl' || provider === 'ollama' || provider === 'vllm') continue
    // claude-code uses anthropic model IDs
    const effectiveProvider = provider === 'claude-code' ? 'anthropic' : provider
    const allowedModels = getModelValues(effectiveProvider)
    if (allowedModels.length > 0 && !allowedModels.includes(model)) {
      return `Model ${model} is not valid for provider ${provider}`
    }
  }
  return null
}

export async function settingsRoutes(api: FastifyInstance): Promise<void> {
  api.get('/api/settings/profile', async (request, reply) => {
    const authEmail = getAuthUser(request) ?? 'localhost'
    let accountName = getSetting('profile.account_name')
    if (!accountName) {
      accountName = authEmail
      upsertSetting('profile.account_name', accountName)
    }
    const avatarSeed = getSetting('profile.avatar_seed') || null
    const language = getSetting('general.language') ?? null
    reply.send({ account_name: accountName, avatar_seed: avatarSeed, language, email: authEmail })
  })

  api.patch(
    '/api/settings/profile',
    { preHandler: [requireJson] },
    async (request, reply) => {
      const body = parseOrBadRequest(ProfileBody, request.body, reply)
      if (!body) return
      if (body.account_name === undefined && body.avatar_seed === undefined && body.language === undefined) {
        reply.status(400).send({ error: 'No fields to update' })
        return
      }
      if (body.account_name !== undefined) {
        const name = body.account_name.trim()
        if (!name) {
          reply.status(400).send({ error: 'account_name must not be empty' })
          return
        }
        upsertSetting('profile.account_name', name)
      }
      if (body.avatar_seed !== undefined) {
        upsertSetting('profile.avatar_seed', body.avatar_seed || '')
      }
      if (body.language !== undefined) {
        upsertSetting('general.language', body.language)
      }
      const accountName = getSetting('profile.account_name')!
      const avatarSeed = getSetting('profile.avatar_seed') || null
      const language = getSetting('general.language') ?? null
      reply.send({ account_name: accountName, avatar_seed: avatarSeed, language })
    },
  )

  // --- Preferences endpoints ---

  api.get('/api/settings/preferences', async (_request, reply) => {
    const result: Record<string, string | null> = {}
    for (const key of PREF_KEYS) {
      result[key] = getSetting(key) ?? null
    }
    reply.send(result)
  })

  const handlePrefsUpdate = async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as Record<string, unknown> // dynamic keys, validated per-field below

    // Validate provider-model consistency before saving
    const validationError = validateProviderModel(body)
    if (validationError) {
      reply.status(400).send({ error: validationError })
      return
    }

    let updated = false
    for (const key of PREF_KEYS) {
      if (body[key] === undefined) continue
      const value = String(body[key])
      if (value === '') {
        deleteSetting(key)
        updated = true
        continue
      }
      // Custom validation for keybindings JSON
      if (key === 'reading.keybindings') {
        try {
          const parsed = JSON.parse(value)
          const validKeys = new Set(['next', 'prev', 'bookmark', 'openExternal'])
          const keys = Object.keys(parsed)
          if (keys.length !== 4 || !keys.every(k => validKeys.has(k))) {
            reply.status(400).send({ error: 'Invalid keybindings: keys must be next, prev, bookmark, openExternal' })
            return
          }
          const PRINTABLE_RE = /^[!-~]$/
          const vals = Object.values(parsed) as string[]
          if (!vals.every(v => typeof v === 'string' && PRINTABLE_RE.test(v))) {
            reply.status(400).send({ error: 'Invalid keybindings: values must be single printable ASCII characters' })
            return
          }
          if (new Set(vals).size !== vals.length) {
            reply.status(400).send({ error: 'Invalid keybindings: duplicate key assignments are not allowed' })
            return
          }
        } catch {
          reply.status(400).send({ error: 'Invalid keybindings: must be valid JSON' })
          return
        }
        upsertSetting(key, value)
        updated = true
        continue
      }
      const allowed = PREF_ALLOWED[key]
      if (allowed && !allowed.includes(value)) {
        // Skip static model list check when provider is ollama or vllm (dynamic models)
        const modelKeyPair = PROVIDER_MODEL_PAIRS.find(p => p.modelKey === key)
        if (modelKeyPair) {
          const provider = body[modelKeyPair.providerKey] !== undefined
            ? String(body[modelKeyPair.providerKey])
            : getSetting(modelKeyPair.providerKey)
          if (provider === 'ollama' || provider === 'vllm') {
            upsertSetting(key, value)
            updated = true
            continue
          }
        }

        reply.status(400).send({ error: `Invalid value for ${key}` })
        return
      }
      // Validate retention days: must be a positive integer
      if (key === 'retention.read_days' || key === 'retention.unread_days') {
        const parsed = z.coerce.number().int().min(1).max(9999).safeParse(value)
        if (!parsed.success) {
          reply.status(400).send({ error: `${key} must be a positive integer (1-9999)` })
          return
        }
      }
      upsertSetting(key, value)
      updated = true
    }
    if (!updated) {
      reply.status(400).send({ error: 'No valid fields to update' })
      return
    }
    const result: Record<string, string | null> = {}
    for (const key of PREF_KEYS) {
      result[key] = getSetting(key) ?? null
    }
    reply.send(result)
  }

  api.patch('/api/settings/preferences', { preHandler: [requireJson] }, handlePrefsUpdate)
  api.post('/api/settings/preferences', { preHandler: [requireJson] }, handlePrefsUpdate)

  // --- Image storage settings ---

  api.get('/api/settings/image-storage', async (_request, reply) => {
    const enabled = getSetting('images.enabled') ?? null
    const mode = getSetting('images.storage') ?? 'local'
    const storagePath = getSetting('images.storage_path') ?? null
    const maxSizeMb = getSetting('images.max_size_mb') ?? null
    const url = getSetting('images.upload_url') ?? ''
    const headersRaw = getSetting('images.upload_headers')
    const fieldName = getSetting('images.upload_field') ?? 'image'
    const respPath = getSetting('images.upload_resp_path') ?? ''
    const healthcheckUrl = getSetting('images.healthcheck_url') ?? ''
    reply.send({
      'images.enabled': enabled,
      mode,
      url,
      headersConfigured: !!headersRaw,
      fieldName,
      respPath,
      healthcheckUrl,
      'images.storage_path': storagePath,
      'images.max_size_mb': maxSizeMb,
    })
  })

  api.patch(
    '/api/settings/image-storage',
    { preHandler: [requireJson] },
    async (request, reply) => {
      const body = request.body as Record<string, unknown> // dynamic keys, validated per-field below

      // Simple keys
      if (body['images.enabled'] !== undefined) {
        const val = String(body['images.enabled'])
        if (val === '') deleteSetting('images.enabled')
        else upsertSetting('images.enabled', val)
      }
      if (body['images.storage_path'] !== undefined) {
        const val = String(body['images.storage_path']).trim()
        if (val === '') deleteSetting('images.storage_path')
        else upsertSetting('images.storage_path', val)
      }
      if (body['images.max_size_mb'] !== undefined) {
        const val = String(body['images.max_size_mb']).trim()
        if (val === '') {
          deleteSetting('images.max_size_mb')
        } else {
          const num = Number(val)
          if (isNaN(num) || num <= 0 || num > 100) {
            reply.status(400).send({ error: 'max_size_mb must be 1-100' })
            return
          }
          upsertSetting('images.max_size_mb', val)
        }
      }

      // Remote upload keys
      if (body.mode !== undefined) {
        const mode = String(body.mode)
        if (mode !== 'local' && mode !== 'remote') {
          reply.status(400).send({ error: 'mode must be "local" or "remote"' })
          return
        }
        upsertSetting('images.storage', mode)
      }
      if (body.url !== undefined) {
        const urlVal = String(body.url).trim()
        if (urlVal) {
          try {
            await assertSafeUrl(urlVal)
          } catch {
            reply.status(400).send({ error: 'Invalid or blocked URL' })
            return
          }
          upsertSetting('images.upload_url', urlVal)
        } else {
          deleteSetting('images.upload_url')
        }
      }
      if (body.headers !== undefined) {
        const headersVal = String(body.headers).trim()
        if (headersVal === '') {
          deleteSetting('images.upload_headers')
        } else {
          try {
            const parsed = JSON.parse(headersVal)
            if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
              throw new Error('not an object')
            }
            upsertSetting('images.upload_headers', headersVal)
          } catch {
            reply.status(400).send({ error: 'headers must be valid JSON object' })
            return
          }
        }
      }
      if (body.fieldName !== undefined) {
        const fieldVal = String(body.fieldName).trim()
        if (fieldVal) upsertSetting('images.upload_field', fieldVal)
        else deleteSetting('images.upload_field')
      }
      if (body.respPath !== undefined) {
        const pathVal = String(body.respPath).trim()
        if (pathVal) upsertSetting('images.upload_resp_path', pathVal)
        else deleteSetting('images.upload_resp_path')
      }
      if (body.healthcheckUrl !== undefined) {
        const hcVal = String(body.healthcheckUrl).trim()
        if (hcVal) {
          try {
            await assertSafeUrl(hcVal)
          } catch {
            reply.status(400).send({ error: 'Invalid or blocked healthcheck URL' })
            return
          }
          upsertSetting('images.healthcheck_url', hcVal)
        } else {
          deleteSetting('images.healthcheck_url')
        }
      }

      // Return current state
      const enabled = getSetting('images.enabled') ?? null
      const mode = getSetting('images.storage') ?? 'local'
      const storagePath = getSetting('images.storage_path') ?? null
      const maxSizeMb = getSetting('images.max_size_mb') ?? null
      const url = getSetting('images.upload_url') ?? ''
      const headersRaw = getSetting('images.upload_headers')
      const fieldName = getSetting('images.upload_field') ?? 'image'
      const respPath = getSetting('images.upload_resp_path') ?? ''
      const healthcheckUrl = getSetting('images.healthcheck_url') ?? ''
      reply.send({
        'images.enabled': enabled,
        mode,
        url,
        headersConfigured: !!headersRaw,
        fieldName,
        respPath,
        healthcheckUrl,
        'images.storage_path': storagePath,
        'images.max_size_mb': maxSizeMb,
      })
    },
  )

  // --- Image storage test upload ---

  api.post('/api/settings/image-storage/test', async (_request, reply) => {
    const mode = getSetting('images.storage')
    if (mode !== 'remote') {
      reply.status(400).send({ error: 'Image storage mode is not set to remote' })
      return
    }

    const uploadUrl = getSetting('images.upload_url')
    const headersRaw = getSetting('images.upload_headers')
    const fieldName = getSetting('images.upload_field') ?? 'image'
    const respPath = getSetting('images.upload_resp_path')

    if (!uploadUrl || !respPath) {
      reply.status(400).send({ error: 'Remote upload settings are incomplete' })
      return
    }

    try {
      await assertSafeUrl(uploadUrl)
    } catch {
      reply.status(400).send({ error: 'Upload URL is blocked by SSRF protection' })
      return
    }

    // Generate 1x1 transparent PNG
    const png1x1 = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQAB' +
      'Nl7BcQAAAABJRU5ErkJggg==',
      'base64',
    )

    let headers: Record<string, string> = {}
    if (headersRaw) {
      try {
        headers = JSON.parse(headersRaw)
      } catch {
        reply.status(400).send({ error: 'Stored headers are invalid JSON' })
        return
      }
    }

    try {
      const formData = new FormData()
      formData.append(fieldName, new Blob([png1x1], { type: 'image/png' }), 'test.png')

      const res = await fetch(uploadUrl, {
        method: 'POST',
        headers,
        body: formData,
        signal: AbortSignal.timeout(15_000),
      })

      if (!res.ok) {
        const text = await res.text().catch(() => '')
        reply.status(400).send({ error: `Upload failed: ${res.status} ${text.slice(0, 200)}` })
        return
      }

      const json = await res.json()
      const extractedUrl = extractByDotPath(json, respPath)
      if (!extractedUrl || typeof extractedUrl !== 'string') {
        reply.status(400).send({ error: `Could not extract URL from response at path "${respPath}"` })
        return
      }

      reply.send({ success: true, url: extractedUrl })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      reply.status(400).send({ error: `Test upload failed: ${message}` })
    }
  })

  // --- Image storage healthcheck ---

  api.post('/api/settings/image-storage/healthcheck', async (_request, reply) => {
    const healthcheckUrl = getSetting('images.healthcheck_url')
    if (!healthcheckUrl) {
      reply.status(400).send({ error: 'Healthcheck URL is not configured' })
      return
    }

    try {
      await assertSafeUrl(healthcheckUrl)
    } catch {
      reply.status(400).send({ error: 'Healthcheck URL is blocked by SSRF protection' })
      return
    }

    try {
      const res = await fetch(healthcheckUrl, {
        method: 'GET',
        signal: AbortSignal.timeout(10_000),
      })

      if (res.ok) {
        reply.send({ success: true, status: res.status })
      } else {
        reply.status(502).send({ error: `Unhealthy: ${res.status} ${res.statusText}` })
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      reply.status(502).send({ error: `Healthcheck failed: ${message}` })
    }
  })

  // --- Retention policy ---

  function getRetentionDays(): { readDays: number; unreadDays: number } | null {
    const readDays = Number(getSetting('retention.read_days'))
    const unreadDays = Number(getSetting('retention.unread_days'))
    if (isNaN(readDays) || isNaN(unreadDays) || readDays < 1 || unreadDays < 1) return null
    return { readDays, unreadDays }
  }

  api.get('/api/settings/retention/stats', async (_request, reply) => {
    const days = getRetentionDays()
    if (!days) {
      reply.send({ readDays: 0, unreadDays: 0, readEligible: 0, unreadEligible: 0 })
      return
    }
    const stats = getRetentionStats(days.readDays, days.unreadDays)
    reply.send({ readDays: days.readDays, unreadDays: days.unreadDays, ...stats })
  })

  api.post('/api/settings/retention/purge', async (_request, reply) => {
    if (getSetting('retention.enabled') !== 'on') {
      reply.status(400).send({ error: 'Retention policy is not enabled' })
      return
    }
    const days = getRetentionDays()
    if (!days) {
      reply.send({ purged: 0 })
      return
    }
    const result = purgeExpiredArticles(days.readDays, days.unreadDays)

    // Checkpoint WAL after purge
    try {
      getDb().exec('PRAGMA wal_checkpoint(TRUNCATE)')
    } catch {
      // non-critical
    }

    reply.send(result)
  })

  // --- Provider API key management ---

  const PROVIDER_KEY_MAP: Record<string, string> = {
    anthropic: 'api_key.anthropic',
    gemini: 'api_key.gemini',
    openai: 'api_key.openai',
    vllm: 'api_key.vllm',
    'google-translate': 'api_key.google_translate',
    deepl: 'api_key.deepl',
  }

  api.get('/api/settings/api-keys/:provider', async (request, reply) => {
    const { provider } = ProviderParams.parse(request.params)
    const settingKey = PROVIDER_KEY_MAP[provider]
    if (!settingKey) {
      reply.status(400).send({ error: `Unknown provider: ${provider}` })
      return
    }
    reply.send({ configured: !!getSetting(settingKey) })
  })

  api.post('/api/settings/api-keys/:provider', { preHandler: [requireJson] }, async (request, reply) => {
    const { provider } = ProviderParams.parse(request.params)
    const settingKey = PROVIDER_KEY_MAP[provider]
    if (!settingKey) {
      reply.status(400).send({ error: `Unknown provider: ${provider}` })
      return
    }
    const { apiKey } = ApiKeyBody.parse(request.body)
    if (!apiKey || apiKey.trim() === '') {
      deleteSetting(settingKey)
      reply.send({ ok: true, configured: false })
    } else {
      upsertSetting(settingKey, apiKey.trim())
      reply.send({ ok: true, configured: true })
    }
  })

  // --- Translation provider usage ---

  api.get('/api/settings/google-translate/usage', async (_request, reply) => {
    reply.send(getMonthlyUsage())
  })

  api.get('/api/settings/deepl/usage', async (_request, reply) => {
    reply.send(getDeeplMonthlyUsage())
  })

  // --- Ollama endpoints ---

  async function ollamaFetch(path: string): Promise<Response> {
    const { getOllamaBaseUrl, getOllamaCustomHeaders } = await import('../providers/llm/ollama.js')
    const baseUrl = getOllamaBaseUrl().replace(/\/+$/, '')
    const headers = getOllamaCustomHeaders()
    return fetch(`${baseUrl}${path}`, { headers, signal: AbortSignal.timeout(5_000) })
  }

  api.get('/api/settings/ollama/models', async (_request, reply) => {
    try {
      const res = await ollamaFetch('/api/tags')
      if (!res.ok) {
        reply.send({ models: [] })
        return
      }
      const data = await res.json() as { models?: Array<{ name: string; size: number; details?: { parameter_size?: string } }> }
      const models = (data.models || []).map(m => ({
        name: m.name,
        size: m.size,
        parameter_size: m.details?.parameter_size || '',
      }))
      reply.send({ models })
    } catch {
      reply.send({ models: [] })
    }
  })

  api.get('/api/settings/ollama/status', async (_request, reply) => {
    try {
      const [versionRes, tagsRes] = await Promise.all([
        ollamaFetch('/api/version'),
        ollamaFetch('/api/tags'),
      ])
      if (!versionRes.ok || !tagsRes.ok) {
        reply.send({ ok: false, error: `HTTP ${versionRes.status}` })
        return
      }
      const versionData = await versionRes.json() as { version?: string }
      const tagsData = await tagsRes.json() as { models?: unknown[] }
      reply.send({
        ok: true,
        version: versionData.version || 'unknown',
        model_count: tagsData.models?.length || 0,
      })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Connection failed'
      reply.send({ ok: false, error: message })
    }
  })

  // --- vLLM endpoints ---

  async function vllmFetch(path: string): Promise<Response> {
    const { getVllmBaseUrl, getVllmApiKey } = await import('../providers/llm/vllm.js')
    const baseUrl = getVllmBaseUrl().replace(/\/+$/, '')
    const apiKey = getVllmApiKey()
    const headers: Record<string, string> = {}
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`
    return fetch(`${baseUrl}${path}`, { headers, signal: AbortSignal.timeout(5_000) })
  }

  api.get('/api/settings/vllm/models', async (_request, reply) => {
    try {
      const res = await vllmFetch('/v1/models')
      if (!res.ok) {
        reply.send({ models: [] })
        return
      }
      const data = await res.json() as { data?: Array<{ id: string }> }
      const models = (data.data || []).map(m => ({
        name: m.id,
      }))
      reply.send({ models })
    } catch {
      reply.send({ models: [] })
    }
  })

  api.get('/api/settings/vllm/status', async (_request, reply) => {
    try {
      const res = await vllmFetch('/v1/models')
      if (!res.ok) {
        reply.send({ ok: false, error: `HTTP ${res.status}` })
        return
      }
      const data = await res.json() as { data?: unknown[] }
      reply.send({
        ok: true,
        model_count: data.data?.length || 0,
      })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Connection failed'
      reply.send({ ok: false, error: message })
    }
  })
}
