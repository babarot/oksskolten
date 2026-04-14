import { describe, it, expect, vi, beforeEach } from 'vitest'
import { vllmProvider, getVllmBaseUrl, getVllmApiKey } from './vllm.js'
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

describe('vllmProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.VLLM_BASE_URL = ''
  })

  it('gets base URL from settings', () => {
    vi.mocked(db.getSetting).mockReturnValue('http://vllm-server:8000')
    expect(getVllmBaseUrl()).toBe('http://vllm-server:8000')
  })

  it('gets base URL from env if setting is empty', () => {
    vi.mocked(db.getSetting).mockReturnValue(undefined)
    process.env.VLLM_BASE_URL = 'http://vllm-env:8000'
    expect(getVllmBaseUrl()).toBe('http://vllm-env:8000')
  })

  it('gets default base URL if both are empty', () => {
    vi.mocked(db.getSetting).mockReturnValue(undefined)
    process.env.VLLM_BASE_URL = ''
    expect(getVllmBaseUrl()).toBe('http://localhost:8000')
  })

  it('gets API key from settings', () => {
    vi.mocked(db.getSetting).mockImplementation((key) => {
      if (key === 'api_key.vllm') return 'vllm-key'
      return undefined
    })
    expect(getVllmApiKey()).toBe('vllm-key')
  })

  it('createMessage calls OpenAI with correct parameters', async () => {
    vi.mocked(db.getSetting).mockImplementation((key) => {
      if (key === 'vllm.base_url') return 'http://vllm:8000'
      if (key === 'api_key.vllm') return 'key'
      return undefined
    })

    const result = await vllmProvider.createMessage({
      model: 'test-model',
      maxTokens: 100,
      messages: [{ role: 'user', content: 'hello' }],
      systemInstruction: 'you are a bot',
    })

    expect(result.text).toBe('test response')
    expect(result.inputTokens).toBe(10)
    expect(result.outputTokens).toBe(20)
  })
})
