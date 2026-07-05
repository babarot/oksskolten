import { describe, it, expect, vi, beforeEach } from 'vitest'
import { openrouterProvider, getOpenRouterBaseUrl, getOpenRouterApiKey } from './openrouter.js'
import * as db from '../../db.js'

vi.mock('../../db.js', () => ({
  getSetting: vi.fn(),
}))

vi.mock('openai', () => {
  return {
    default: class {
      chat = {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [{ message: { content: 'test response' } }],
            usage: { prompt_tokens: 10, completion_tokens: 20 },
          }),
        },
      }
    },
  }
})

describe('openrouterProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.OPENROUTER_BASE_URL = ''
  })

  it('gets base URL from settings', () => {
    vi.mocked(db.getSetting).mockReturnValue('https://proxy.example/api/v1')
    expect(getOpenRouterBaseUrl()).toBe('https://proxy.example/api/v1')
  })

  it('gets base URL from env if setting is empty', () => {
    vi.mocked(db.getSetting).mockReturnValue(undefined)
    process.env.OPENROUTER_BASE_URL = 'https://env.example/api/v1'
    expect(getOpenRouterBaseUrl()).toBe('https://env.example/api/v1')
  })

  it('gets default base URL if both are empty', () => {
    vi.mocked(db.getSetting).mockReturnValue(undefined)
    process.env.OPENROUTER_BASE_URL = ''
    expect(getOpenRouterBaseUrl()).toBe('https://openrouter.ai/api/v1')
  })

  it('gets API key from settings', () => {
    vi.mocked(db.getSetting).mockImplementation((key) => {
      if (key === 'api_key.openrouter') return 'sk-or-key'
      return undefined
    })
    expect(getOpenRouterApiKey()).toBe('sk-or-key')
  })

  it('requireKey throws when no key is configured', () => {
    vi.mocked(db.getSetting).mockReturnValue(undefined)
    expect(() => openrouterProvider.requireKey()).toThrow('OPENROUTER_KEY_NOT_SET')
  })

  it('requireKey passes when a key is configured', () => {
    vi.mocked(db.getSetting).mockImplementation((key) => (key === 'api_key.openrouter' ? 'sk-or-key' : undefined))
    expect(() => openrouterProvider.requireKey()).not.toThrow()
  })

  it('createMessage calls OpenAI with correct parameters', async () => {
    vi.mocked(db.getSetting).mockImplementation((key) => {
      if (key === 'api_key.openrouter') return 'sk-or-key'
      return undefined
    })

    const result = await openrouterProvider.createMessage({
      model: 'openai/gpt-4o-mini',
      maxTokens: 100,
      messages: [{ role: 'user', content: 'hello' }],
      systemInstruction: 'you are a bot',
    })

    expect(result.text).toBe('test response')
    expect(result.inputTokens).toBe(10)
    expect(result.outputTokens).toBe(20)
  })
})
