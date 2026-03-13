import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ChatSSEEvent } from './adapter.js'
import { setupTestDb } from '../__tests__/helpers/testDb.js'
import { upsertSetting } from '../db.js'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockExecuteTool = vi.fn()

vi.mock('./tools.js', () => ({
  toGeminiTools: () => [{ functionDeclarations: [{ name: 'search_articles', description: 'Search', parametersJsonSchema: { type: 'object', properties: {} } }] }],
  executeTool: (...args: unknown[]) => mockExecuteTool(...args),
}))

function createMockStream(chunks: Record<string, unknown>[]) {
  return {
    [Symbol.asyncIterator]: async function* () {
      for (const chunk of chunks) yield chunk
    },
  }
}

const mockGenerateContentStream = vi.fn()

vi.mock('../providers/llm/gemini.js', () => ({
  getGeminiClient: () => ({
    models: {
      generateContentStream: (...args: unknown[]) => mockGenerateContentStream(...args),
    },
  }),
  geminiProvider: {
    name: 'gemini',
    requireKey: () => {},
    createMessage: vi.fn(),
    streamMessage: vi.fn(),
  },
}))

vi.mock('../providers/llm/anthropic.js', () => ({
  anthropicProvider: { name: 'anthropic', requireKey: () => {}, createMessage: vi.fn(), streamMessage: vi.fn() },
  getAnthropicClient: vi.fn(),
}))
vi.mock('../providers/llm/openai.js', () => ({
  openaiProvider: { name: 'openai', requireKey: () => {}, createMessage: vi.fn(), streamMessage: vi.fn() },
  getOpenAIClient: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runGeminiTurn', () => {
  beforeEach(() => {
    setupTestDb()
    mockGenerateContentStream.mockReset()
    mockExecuteTool.mockReset()
  })

  async function loadModule() {
    return import('./adapter-gemini.js')
  }

  it('throws when Gemini API key is not set', async () => {
    const { runGeminiTurn } = await loadModule()
    await expect(runGeminiTurn({
      messages: [{ role: 'user', content: 'hi' }],
      system: 'You are helpful.',
      model: 'gemini-2.0-flash',
      onEvent: vi.fn(),
    })).rejects.toThrow('GEMINI_KEY_NOT_SET')
  })

  it('handles simple text response', async () => {
    upsertSetting('api_key.gemini', 'test-key')

    mockGenerateContentStream.mockResolvedValue(createMockStream([
      { text: 'Hello ', candidates: null, usageMetadata: null },
      { text: 'world!', candidates: null, usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 } },
    ]))

    const events: ChatSSEEvent[] = []
    const { runGeminiTurn } = await loadModule()
    const result = await runGeminiTurn({
      messages: [{ role: 'user', content: 'hi' }],
      system: 'You are helpful.',
      model: 'gemini-2.0-flash',
      onEvent: (e) => events.push(e),
    })

    expect(events.filter(e => e.type === 'text_delta')).toHaveLength(2)
    expect(events.find(e => e.type === 'text_delta')?.text).toBe('Hello ')
    expect(events.find(e => e.type === 'done')).toBeDefined()
    expect(result.usage.input_tokens).toBe(10)
    expect(result.usage.output_tokens).toBe(5)
  })

  it('handles tool use loop', async () => {
    upsertSetting('api_key.gemini', 'test-key')

    // Round 1: model calls a tool
    mockGenerateContentStream.mockResolvedValueOnce(createMockStream([
      {
        text: '',
        candidates: [{
          content: {
            parts: [{
              functionCall: { name: 'search_articles', args: { query: 'test' } },
            }],
          },
        }],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 3 },
      },
    ]))

    mockExecuteTool.mockResolvedValue(JSON.stringify([{ id: 1, title: 'Found Article' }]))

    // Round 2: model returns text
    mockGenerateContentStream.mockResolvedValueOnce(createMockStream([
      { text: 'I found an article.', candidates: null, usageMetadata: { promptTokenCount: 20, candidatesTokenCount: 8 } },
    ]))

    const events: ChatSSEEvent[] = []
    const { runGeminiTurn } = await loadModule()
    const result = await runGeminiTurn({
      messages: [{ role: 'user', content: 'search for test articles' }],
      system: 'You are helpful.',
      model: 'gemini-2.0-flash',
      onEvent: (e) => events.push(e),
    })

    expect(mockExecuteTool).toHaveBeenCalledWith('search_articles', { query: 'test' }, { timeZone: undefined })
    expect(events.some(e => e.type === 'tool_use_start')).toBe(true)
    expect(events.some(e => e.type === 'tool_use_end')).toBe(true)
    expect(events.filter(e => e.type === 'done')).toHaveLength(1)
    expect(result.allMessages.length).toBeGreaterThan(2)
  })

  it('handles tool execution error', async () => {
    upsertSetting('api_key.gemini', 'test-key')

    mockGenerateContentStream.mockResolvedValueOnce(createMockStream([
      {
        text: '',
        candidates: [{
          content: {
            parts: [{
              functionCall: { name: 'search_articles', args: {} },
            }],
          },
        }],
        usageMetadata: null,
      },
    ]))

    mockExecuteTool.mockRejectedValue(new Error('DB error'))

    // After tool error, model responds with text
    mockGenerateContentStream.mockResolvedValueOnce(createMockStream([
      { text: 'Sorry, I encountered an error.', candidates: null, usageMetadata: null },
    ]))

    const events: ChatSSEEvent[] = []
    const { runGeminiTurn } = await loadModule()
    const result = await runGeminiTurn({
      messages: [{ role: 'user', content: 'search' }],
      system: 'You are helpful.',
      model: 'gemini-2.0-flash',
      onEvent: (e) => events.push(e),
    })

    // Tool result should be marked as error
    const toolResultMsg = result.allMessages.find(
      m => m.role === 'user' && Array.isArray(m.content) && m.content.some(b => b.type === 'tool_result'),
    )
    expect(toolResultMsg).toBeDefined()
    const blocks = toolResultMsg!.content as import('./types.js').ContentBlock[]
    const toolResult = blocks.find(b => b.type === 'tool_result')
    expect(toolResult?.type === 'tool_result' && toolResult.is_error).toBe(true)
    expect(toolResult?.type === 'tool_result' && toolResult.content).toContain('DB error')
  })

  it('emits error on max rounds exceeded', async () => {
    upsertSetting('api_key.gemini', 'test-key')

    // Always return tool calls
    mockGenerateContentStream.mockResolvedValue(createMockStream([
      {
        text: '',
        candidates: [{
          content: {
            parts: [{
              functionCall: { name: 'search_articles', args: {} },
            }],
          },
        }],
        usageMetadata: null,
      },
    ]))

    mockExecuteTool.mockResolvedValue('{}')

    const events: ChatSSEEvent[] = []
    const { runGeminiTurn } = await loadModule()
    await runGeminiTurn({
      messages: [{ role: 'user', content: 'search' }],
      system: 'You are helpful.',
      model: 'gemini-2.0-flash',
      onEvent: (e) => events.push(e),
    })

    expect(events.some(e => e.type === 'error' && e.error.includes('Maximum'))).toBe(true)
    expect(events.filter(e => e.type === 'done')).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// Tests — convertMessagesToGemini (tested indirectly)
// ---------------------------------------------------------------------------

describe('Gemini message conversion (via runGeminiTurn)', () => {
  beforeEach(() => {
    setupTestDb()
    upsertSetting('api_key.gemini', 'test-key')
    mockGenerateContentStream.mockReset()
    mockExecuteTool.mockReset()
  })

  async function loadModule() {
    return import('./adapter-gemini.js')
  }

  it('converts user text messages', async () => {
    mockGenerateContentStream.mockResolvedValue(createMockStream([
      { text: 'ok', candidates: null, usageMetadata: null },
    ]))

    const { runGeminiTurn } = await loadModule()
    await runGeminiTurn({
      messages: [{ role: 'user', content: 'hello' }],
      system: 'sys',
      model: 'gemini-2.0-flash',
      onEvent: vi.fn(),
    })

    const call = mockGenerateContentStream.mock.calls[0][0]
    expect(call.contents).toHaveLength(1)
    expect(call.contents[0].role).toBe('user')
    expect(call.contents[0].parts[0].text).toBe('hello')
  })

  it('converts assistant messages with tool_use to model with functionCall', async () => {
    mockGenerateContentStream.mockResolvedValue(createMockStream([
      { text: 'done', candidates: null, usageMetadata: null },
    ]))

    const { runGeminiTurn } = await loadModule()
    await runGeminiTurn({
      messages: [
        { role: 'user', content: 'search' },
        {
          role: 'assistant',
          content: [
            { type: 'text', text: 'Let me search.' },
            { type: 'tool_use', id: 'tu_1', name: 'search_articles', input: { query: 'test' } },
          ],
        },
        {
          role: 'user',
          content: [
            { type: 'tool_result' as const, tool_use_id: 'tu_1', content: '[]', _tool_name: 'search_articles' } as import('./types.js').ToolResultBlock & { _tool_name: string },
          ],
        },
      ],
      system: 'sys',
      model: 'gemini-2.0-flash',
      onEvent: vi.fn(),
    })

    const call = mockGenerateContentStream.mock.calls[0][0]
    // Should have user, model (with functionCall), user (with functionResponse)
    expect(call.contents).toHaveLength(3)
    expect(call.contents[1].role).toBe('model')
    expect(call.contents[1].parts).toHaveLength(2) // text + functionCall
    expect(call.contents[2].role).toBe('user')
    expect(call.contents[2].parts[0].functionResponse).toBeDefined()
    expect(call.contents[2].parts[0].functionResponse.name).toBe('search_articles')
  })

  it('handles user content blocks (array format)', async () => {
    mockGenerateContentStream.mockResolvedValue(createMockStream([
      { text: 'ok', candidates: null, usageMetadata: null },
    ]))

    const { runGeminiTurn } = await loadModule()
    await runGeminiTurn({
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: 'Hello ' },
          { type: 'text', text: 'World' },
        ],
      }],
      system: 'sys',
      model: 'gemini-2.0-flash',
      onEvent: vi.fn(),
    })

    const call = mockGenerateContentStream.mock.calls[0][0]
    expect(call.contents[0].parts[0].text).toBe('Hello \nWorld')
  })
})
