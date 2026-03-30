import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const { mockGetSetting, mockCreate } = vi.hoisted(() => ({
  mockGetSetting: vi.fn(),
  mockCreate: vi.fn(),
}))

vi.mock('../../db.js', () => ({
  getSetting: (...args: unknown[]) => mockGetSetting(...args),
}))

vi.mock('openai', () => ({
  default: class MockOpenAI {
    chat = {
      completions: {
        create: (...args: unknown[]) => mockCreate(...args),
      },
    }
    constructor(public opts: any) {}
  },
}))

import { openaiProvider, getOpenAIClient } from './openai.js'

beforeEach(() => {
  vi.clearAllMocks()
  mockGetSetting.mockImplementation((key: string) => {
    if (key === 'api_key.openai') return 'sk-test'
    return undefined
  })
})

// --- requireKey ---

describe('openaiProvider.requireKey', () => {
  it('throws when api key is not set', () => {
    mockGetSetting.mockReturnValue(undefined)
    expect(() => openaiProvider.requireKey()).toThrow('OPENAI_KEY_NOT_SET')
  })

  it('does not throw when api key is set', () => {
    mockGetSetting.mockReturnValue('sk-test')
    expect(() => openaiProvider.requireKey()).not.toThrow()
  })
})

// --- getOpenAIClient ---

describe('getOpenAIClient', () => {
  it('returns a client', () => {
    const client = getOpenAIClient()
    expect(client).toBeDefined()
  })

  it('caches client for same key', () => {
    const c1 = getOpenAIClient()
    const c2 = getOpenAIClient()
    expect(c1).toBe(c2)
  })

  it('creates new client when key changes', () => {
    mockGetSetting.mockImplementation((key: string) => {
      if (key === 'api_key.openai') return 'sk-key-1'
      return undefined
    })
    const c1 = getOpenAIClient()
    mockGetSetting.mockImplementation((key: string) => {
      if (key === 'api_key.openai') return 'sk-key-2'
      return undefined
    })
    const c2 = getOpenAIClient()
    expect(c1).not.toBe(c2)
  })

  it('creates new client when base URL changes', () => {
    mockGetSetting.mockImplementation((key: string) => {
      if (key === 'api_key.openai') return 'sk-test'
      if (key === 'openai.base_url') return 'https://api.openai.com/v1'
      return undefined
    })
    const c1 = getOpenAIClient()
    mockGetSetting.mockImplementation((key: string) => {
      if (key === 'api_key.openai') return 'sk-test'
      if (key === 'openai.base_url') return 'https://openrouter.ai/api/v1'
      return undefined
    })
    const c2 = getOpenAIClient()
    expect(c1).not.toBe(c2)
  })

  it('passes configured base URL to the OpenAI client', () => {
    mockGetSetting.mockImplementation((key: string) => {
      if (key === 'api_key.openai') return 'sk-test'
      if (key === 'openai.base_url') return 'https://openrouter.ai/api/v1/'
      return undefined
    })

    const client = getOpenAIClient() as { opts?: { apiKey: string; baseURL?: string } }
    expect(client.opts).toEqual({
      apiKey: 'sk-test',
      baseURL: 'https://openrouter.ai/api/v1',
    })
  })
})

// --- createMessage ---

describe('openaiProvider.createMessage', () => {
  it('returns text and token counts', async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: 'Hello world' } }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    })

    const result = await openaiProvider.createMessage({
      model: 'gpt-4',
      maxTokens: 1024,
      messages: [{ role: 'user', content: 'Hi' }],
    })

    expect(result.text).toBe('Hello world')
    expect(result.inputTokens).toBe(10)
    expect(result.outputTokens).toBe(5)
  })

  it('includes system instruction as system message', async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: 'ok' } }],
      usage: { prompt_tokens: 5, completion_tokens: 2 },
    })

    await openaiProvider.createMessage({
      model: 'gpt-4',
      maxTokens: 1024,
      messages: [{ role: 'user', content: 'Hi' }],
      systemInstruction: 'You are a helper',
    })

    const call = mockCreate.mock.calls[0][0]
    expect(call.messages[0]).toEqual({ role: 'system', content: 'You are a helper' })
  })

  it('maps assistant role correctly', async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: 'ok' } }],
      usage: {},
    })

    await openaiProvider.createMessage({
      model: 'gpt-4',
      maxTokens: 1024,
      messages: [
        { role: 'user', content: 'Hi' },
        { role: 'assistant', content: 'Hello' },
      ],
    })

    const call = mockCreate.mock.calls[0][0]
    expect(call.messages[0].role).toBe('user')
    expect(call.messages[1].role).toBe('assistant')
  })

  it('handles empty response', async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: null } }],
      usage: {},
    })

    const result = await openaiProvider.createMessage({
      model: 'gpt-4',
      maxTokens: 1024,
      messages: [{ role: 'user', content: 'Hi' }],
    })

    expect(result.text).toBe('')
  })
})

// --- streamMessage ---

describe('openaiProvider.streamMessage', () => {
  it('streams text deltas and calls onText', async () => {
    const chunks = [
      { choices: [{ delta: { content: 'Hello' } }], usage: null },
      { choices: [{ delta: { content: ' world' } }], usage: null },
      { choices: [{ delta: { content: '' } }], usage: { prompt_tokens: 10, completion_tokens: 5 } },
    ]

    mockCreate.mockResolvedValue({
      [Symbol.asyncIterator]: async function* () {
        for (const chunk of chunks) yield chunk
      },
    })

    const onText = vi.fn()
    const result = await openaiProvider.streamMessage(
      { model: 'gpt-4', maxTokens: 1024, messages: [{ role: 'user', content: 'Hi' }] },
      onText,
    )

    expect(onText).toHaveBeenCalledWith('Hello')
    expect(onText).toHaveBeenCalledWith(' world')
    expect(result.text).toBe('Hello world')
    expect(result.inputTokens).toBe(10)
    expect(result.outputTokens).toBe(5)
  })

  it('requests stream with usage included', async () => {
    mockCreate.mockResolvedValue({
      [Symbol.asyncIterator]: async function* () {},
    })

    await openaiProvider.streamMessage(
      { model: 'gpt-4', maxTokens: 1024, messages: [{ role: 'user', content: 'Hi' }] },
      vi.fn(),
    )

    const call = mockCreate.mock.calls[0][0]
    expect(call.stream).toBe(true)
    expect(call.stream_options).toEqual({ include_usage: true })
  })
})
