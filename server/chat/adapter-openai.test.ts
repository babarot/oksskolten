import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ChatSSEEvent } from './adapter.js'
import type { ContentBlock, ToolResultBlock } from './types.js'
import { setupTestDb } from '../__tests__/helpers/testDb.js'
import { upsertSetting } from '../db.js'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockExecuteTool = vi.fn()

vi.mock('./tools.js', () => ({
  toOpenAITools: () => [{ type: 'function', function: { name: 'search_articles', description: 'Search', parameters: { type: 'object', properties: {} } } }],
  executeTool: (...args: unknown[]) => mockExecuteTool(...args),
}))

function createMockStream(chunks: Record<string, unknown>[]) {
  return {
    [Symbol.asyncIterator]: async function* () {
      for (const chunk of chunks) yield chunk
    },
  }
}

const mockCreate = vi.fn()

vi.mock('../providers/llm/openai.js', () => ({
  getOpenAIClient: () => ({
    chat: {
      completions: {
        create: (...args: unknown[]) => mockCreate(...args),
      },
    },
  }),
  openaiProvider: {
    name: 'openai',
    requireKey: () => {},
    createMessage: vi.fn(),
    streamMessage: vi.fn(),
  },
}))

vi.mock('../providers/llm/anthropic.js', () => ({
  anthropicProvider: { name: 'anthropic', requireKey: () => {}, createMessage: vi.fn(), streamMessage: vi.fn() },
  getAnthropicClient: vi.fn(),
}))
vi.mock('../providers/llm/gemini.js', () => ({
  geminiProvider: { name: 'gemini', requireKey: () => {}, createMessage: vi.fn(), streamMessage: vi.fn() },
  getGeminiClient: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runOpenAITurn', () => {
  beforeEach(() => {
    setupTestDb()
    mockCreate.mockReset()
    mockExecuteTool.mockReset()
  })

  async function loadModule() {
    return import('./adapter-openai.js')
  }

  it('throws when OpenAI API key is not set', async () => {
    const { runOpenAITurn } = await loadModule()
    await expect(runOpenAITurn({
      messages: [{ role: 'user', content: 'hi' }],
      system: 'You are helpful.',
      model: 'gpt-4o',
      onEvent: vi.fn(),
    })).rejects.toThrow('OPENAI_KEY_NOT_SET')
  })

  it('handles simple text response', async () => {
    upsertSetting('api_key.openai', 'test-key')

    mockCreate.mockResolvedValue(createMockStream([
      { choices: [{ delta: { content: 'Hello ' }, finish_reason: null }], usage: null },
      { choices: [{ delta: { content: 'world!' }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 5 } },
    ]))

    const events: ChatSSEEvent[] = []
    const { runOpenAITurn } = await loadModule()
    const result = await runOpenAITurn({
      messages: [{ role: 'user', content: 'hi' }],
      system: 'You are helpful.',
      model: 'gpt-4o',
      onEvent: (e) => events.push(e),
    })

    expect(events.filter(e => e.type === 'text_delta')).toHaveLength(2)
    expect(events.find(e => e.type === 'done')).toBeDefined()
    expect(result.usage.input_tokens).toBe(10)
    expect(result.usage.output_tokens).toBe(5)
  })

  it('handles tool use loop with streaming tool call deltas', async () => {
    upsertSetting('api_key.openai', 'test-key')

    // Round 1: model calls a tool via streaming deltas
    mockCreate.mockResolvedValueOnce(createMockStream([
      {
        choices: [{
          delta: {
            tool_calls: [{
              index: 0,
              id: 'call_1',
              function: { name: 'search_articles', arguments: '{"qu' },
            }],
          },
          finish_reason: null,
        }],
        usage: null,
      },
      {
        choices: [{
          delta: {
            tool_calls: [{
              index: 0,
              function: { arguments: 'ery":"test"}' },
            }],
          },
          finish_reason: null,
        }],
        usage: null,
      },
      {
        choices: [{ delta: {}, finish_reason: 'tool_calls' }],
        usage: { prompt_tokens: 15, completion_tokens: 8 },
      },
    ]))

    mockExecuteTool.mockResolvedValue(JSON.stringify([{ id: 1, title: 'Found' }]))

    // Round 2: text response
    mockCreate.mockResolvedValueOnce(createMockStream([
      { choices: [{ delta: { content: 'Found an article.' }, finish_reason: 'stop' }], usage: { prompt_tokens: 25, completion_tokens: 10 } },
    ]))

    const events: ChatSSEEvent[] = []
    const { runOpenAITurn } = await loadModule()
    const result = await runOpenAITurn({
      messages: [{ role: 'user', content: 'search for test' }],
      system: 'You are helpful.',
      model: 'gpt-4o',
      onEvent: (e) => events.push(e),
    })

    expect(mockExecuteTool).toHaveBeenCalledWith('search_articles', { query: 'test' }, { timeZone: undefined })
    expect(events.some(e => e.type === 'tool_use_start' && e.name === 'search_articles')).toBe(true)
    expect(events.some(e => e.type === 'tool_use_end')).toBe(true)
    expect(events.filter(e => e.type === 'done')).toHaveLength(1)
    // Usage accumulates across rounds
    expect(result.usage.input_tokens).toBe(40)
  })

  it('handles tool execution error', async () => {
    upsertSetting('api_key.openai', 'test-key')

    mockCreate.mockResolvedValueOnce(createMockStream([
      {
        choices: [{
          delta: {
            tool_calls: [{
              index: 0,
              id: 'call_err',
              function: { name: 'search_articles', arguments: '{}' },
            }],
          },
          finish_reason: null,
        }],
        usage: null,
      },
      { choices: [{ delta: {}, finish_reason: 'tool_calls' }], usage: null },
    ]))

    mockExecuteTool.mockRejectedValue(new Error('Database connection lost'))

    // Model responds after error
    mockCreate.mockResolvedValueOnce(createMockStream([
      { choices: [{ delta: { content: 'Error occurred.' }, finish_reason: 'stop' }], usage: null },
    ]))

    const events: ChatSSEEvent[] = []
    const { runOpenAITurn } = await loadModule()
    const result = await runOpenAITurn({
      messages: [{ role: 'user', content: 'search' }],
      system: 'sys',
      model: 'gpt-4o',
      onEvent: (e) => events.push(e),
    })

    // Check tool result in messages contains error
    const toolResultMsg = result.allMessages.find(
      m => m.role === 'user' && Array.isArray(m.content) && m.content.some(b => b.type === 'tool_result'),
    )
    const blocks = toolResultMsg!.content as ContentBlock[]
    const toolResult = blocks.find((b): b is ToolResultBlock => b.type === 'tool_result')
    expect(toolResult!.is_error).toBe(true)
    expect(toolResult!.content).toContain('Database connection lost')
  })

  it('emits error on max rounds exceeded', async () => {
    upsertSetting('api_key.openai', 'test-key')

    // Always return tool calls
    mockCreate.mockResolvedValue(createMockStream([
      {
        choices: [{
          delta: {
            tool_calls: [{
              index: 0,
              id: 'call_loop',
              function: { name: 'search_articles', arguments: '{}' },
            }],
          },
          finish_reason: null,
        }],
        usage: null,
      },
      { choices: [{ delta: {}, finish_reason: 'tool_calls' }], usage: null },
    ]))

    mockExecuteTool.mockResolvedValue('{}')

    const events: ChatSSEEvent[] = []
    const { runOpenAITurn } = await loadModule()
    await runOpenAITurn({
      messages: [{ role: 'user', content: 'loop' }],
      system: 'sys',
      model: 'gpt-4o',
      onEvent: (e) => events.push(e),
    })

    expect(events.some(e => e.type === 'error' && e.error.includes('Maximum'))).toBe(true)
    expect(events.filter(e => e.type === 'done')).toHaveLength(1)
  })

  it('accumulates tool call arguments across multiple deltas', async () => {
    upsertSetting('api_key.openai', 'test-key')

    // Arguments split across 3 chunks
    mockCreate.mockResolvedValueOnce(createMockStream([
      {
        choices: [{
          delta: { tool_calls: [{ index: 0, id: 'tc1', function: { name: 'search_articles', arguments: '{"q' } }] },
          finish_reason: null,
        }],
        usage: null,
      },
      {
        choices: [{
          delta: { tool_calls: [{ index: 0, function: { arguments: 'uery' } }] },
          finish_reason: null,
        }],
        usage: null,
      },
      {
        choices: [{
          delta: { tool_calls: [{ index: 0, function: { arguments: '":"hello"}' } }] },
          finish_reason: null,
        }],
        usage: null,
      },
      { choices: [{ delta: {}, finish_reason: 'tool_calls' }], usage: null },
    ]))

    mockExecuteTool.mockResolvedValue('[]')

    // Final text response
    mockCreate.mockResolvedValueOnce(createMockStream([
      { choices: [{ delta: { content: 'done' }, finish_reason: 'stop' }], usage: null },
    ]))

    const { runOpenAITurn } = await loadModule()
    await runOpenAITurn({
      messages: [{ role: 'user', content: 'search hello' }],
      system: 'sys',
      model: 'gpt-4o',
      onEvent: vi.fn(),
    })

    expect(mockExecuteTool).toHaveBeenCalledWith('search_articles', { query: 'hello' }, { timeZone: undefined })
  })

  it('handles multiple concurrent tool calls', async () => {
    upsertSetting('api_key.openai', 'test-key')

    mockCreate.mockResolvedValueOnce(createMockStream([
      {
        choices: [{
          delta: {
            tool_calls: [
              { index: 0, id: 'tc1', function: { name: 'search_articles', arguments: '{"query":"a"}' } },
              { index: 1, id: 'tc2', function: { name: 'search_articles', arguments: '{"query":"b"}' } },
            ],
          },
          finish_reason: null,
        }],
        usage: null,
      },
      { choices: [{ delta: {}, finish_reason: 'tool_calls' }], usage: null },
    ]))

    mockExecuteTool.mockResolvedValue('[]')

    // Final
    mockCreate.mockResolvedValueOnce(createMockStream([
      { choices: [{ delta: { content: 'done' }, finish_reason: 'stop' }], usage: null },
    ]))

    const events: ChatSSEEvent[] = []
    const { runOpenAITurn } = await loadModule()
    await runOpenAITurn({
      messages: [{ role: 'user', content: 'search' }],
      system: 'sys',
      model: 'gpt-4o',
      onEvent: (e) => events.push(e),
    })

    expect(mockExecuteTool).toHaveBeenCalledTimes(2)
    expect(events.filter(e => e.type === 'tool_use_start')).toHaveLength(2)
    expect(events.filter(e => e.type === 'tool_use_end')).toHaveLength(2)
  })
})

// ---------------------------------------------------------------------------
// Tests — convertMessagesToOpenAI (tested indirectly)
// ---------------------------------------------------------------------------

describe('OpenAI message conversion (via runOpenAITurn)', () => {
  beforeEach(() => {
    setupTestDb()
    upsertSetting('api_key.openai', 'test-key')
    mockCreate.mockReset()
    mockExecuteTool.mockReset()
  })

  async function loadModule() {
    return import('./adapter-openai.js')
  }

  it('prepends system message', async () => {
    mockCreate.mockResolvedValue(createMockStream([
      { choices: [{ delta: { content: 'ok' }, finish_reason: 'stop' }], usage: null },
    ]))

    const { runOpenAITurn } = await loadModule()
    await runOpenAITurn({
      messages: [{ role: 'user', content: 'hi' }],
      system: 'You are a test assistant.',
      model: 'gpt-4o',
      onEvent: vi.fn(),
    })

    const call = mockCreate.mock.calls[0][0]
    expect(call.messages[0]).toEqual({ role: 'system', content: 'You are a test assistant.' })
    expect(call.messages[1]).toEqual({ role: 'user', content: 'hi' })
  })

  it('converts tool_result messages to tool role', async () => {
    mockCreate.mockResolvedValue(createMockStream([
      { choices: [{ delta: { content: 'ok' }, finish_reason: 'stop' }], usage: null },
    ]))

    const { runOpenAITurn } = await loadModule()
    await runOpenAITurn({
      messages: [
        { role: 'user', content: 'search' },
        {
          role: 'assistant',
          content: [
            { type: 'text', text: 'Searching...' },
            { type: 'tool_use', id: 'tu_1', name: 'search_articles', input: { query: 'test' } },
          ],
        },
        {
          role: 'user',
          content: [
            { type: 'tool_result' as const, tool_use_id: 'tu_1', content: '[]' } as ToolResultBlock,
          ],
        },
      ],
      system: 'sys',
      model: 'gpt-4o',
      onEvent: vi.fn(),
    })

    const call = mockCreate.mock.calls[0][0]
    // system, user, assistant (with tool_calls), tool
    expect(call.messages).toHaveLength(4)
    expect(call.messages[2].role).toBe('assistant')
    expect(call.messages[2].tool_calls).toHaveLength(1)
    expect(call.messages[2].tool_calls[0].function.name).toBe('search_articles')
    expect(call.messages[2].tool_calls[0].function.arguments).toBe('{"query":"test"}')
    expect(call.messages[3].role).toBe('tool')
    expect(call.messages[3].tool_call_id).toBe('tu_1')
    expect(call.messages[3].content).toBe('[]')
  })

  it('sets assistant content to null when only tool_use blocks', async () => {
    mockCreate.mockResolvedValue(createMockStream([
      { choices: [{ delta: { content: 'ok' }, finish_reason: 'stop' }], usage: null },
    ]))

    const { runOpenAITurn } = await loadModule()
    await runOpenAITurn({
      messages: [
        { role: 'user', content: 'search' },
        {
          role: 'assistant',
          content: [
            { type: 'tool_use', id: 'tu_1', name: 'search_articles', input: {} },
          ],
        },
        {
          role: 'user',
          content: [
            { type: 'tool_result' as const, tool_use_id: 'tu_1', content: '[]' } as ToolResultBlock,
          ],
        },
      ],
      system: 'sys',
      model: 'gpt-4o',
      onEvent: vi.fn(),
    })

    const call = mockCreate.mock.calls[0][0]
    const assistantMsg = call.messages[2]
    expect(assistantMsg.content).toBeNull()
    expect(assistantMsg.tool_calls).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// Tests — convertResponseToAnthropic (tested indirectly)
// ---------------------------------------------------------------------------

describe('OpenAI response to Anthropic format', () => {
  beforeEach(() => {
    setupTestDb()
    upsertSetting('api_key.openai', 'test-key')
    mockCreate.mockReset()
    mockExecuteTool.mockReset()
  })

  async function loadModule() {
    return import('./adapter-openai.js')
  }

  it('converts text response to Anthropic text block', async () => {
    mockCreate.mockResolvedValue(createMockStream([
      { choices: [{ delta: { content: 'Hello!' }, finish_reason: 'stop' }], usage: null },
    ]))

    const { runOpenAITurn } = await loadModule()
    const result = await runOpenAITurn({
      messages: [{ role: 'user', content: 'hi' }],
      system: 'sys',
      model: 'gpt-4o',
      onEvent: vi.fn(),
    })

    const lastAssistant = result.allMessages.find(m => m.role === 'assistant')
    expect(lastAssistant).toBeDefined()
    const content = lastAssistant!.content as ContentBlock[]
    expect(content[0].type).toBe('text')
    expect(content[0].type === 'text' && content[0].text).toBe('Hello!')
  })

  it('handles invalid JSON in tool call arguments gracefully', async () => {
    mockCreate.mockResolvedValueOnce(createMockStream([
      {
        choices: [{
          delta: {
            tool_calls: [{
              index: 0,
              id: 'tc_bad',
              function: { name: 'search_articles', arguments: '{invalid json}' },
            }],
          },
          finish_reason: null,
        }],
        usage: null,
      },
      { choices: [{ delta: {}, finish_reason: 'tool_calls' }], usage: null },
    ]))

    // executeTool will be called with empty input due to JSON parse failure
    mockExecuteTool.mockResolvedValue('[]')

    mockCreate.mockResolvedValueOnce(createMockStream([
      { choices: [{ delta: { content: 'ok' }, finish_reason: 'stop' }], usage: null },
    ]))

    const { runOpenAITurn } = await loadModule()
    const result = await runOpenAITurn({
      messages: [{ role: 'user', content: 'search' }],
      system: 'sys',
      model: 'gpt-4o',
      onEvent: vi.fn(),
    })

    // Should still proceed without crashing
    expect(mockExecuteTool).toHaveBeenCalledWith('search_articles', {}, { timeZone: undefined })
    expect(result.allMessages.length).toBeGreaterThan(2)
  })
})
