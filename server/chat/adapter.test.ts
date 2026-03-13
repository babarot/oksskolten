import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setupTestDb } from '../__tests__/helpers/testDb.js'
import { upsertSetting } from '../db.js'

// Mock the anthropic module
vi.mock('../providers/llm/anthropic.js', () => {
  const createMockStream = (content: any[], stopReason: string, usage = { input_tokens: 10, output_tokens: 5 }) => {
    const handlers: Record<string, Function[]> = {}
    return {
      on: (event: string, fn: Function) => {
        handlers[event] = handlers[event] || []
        handlers[event].push(fn)
        return { on: (e: string, f: Function) => { handlers[e] = handlers[e] || []; handlers[e].push(f); return { on: () => ({}) } } }
      },
      finalMessage: async () => {
        // Emit events for text blocks
        for (const block of content) {
          handlers['contentBlock']?.forEach(fn => fn(block))
          if (block.type === 'text') {
            handlers['text']?.forEach(fn => fn(block.text))
          }
        }
        return { content, stop_reason: stopReason, usage }
      },
    }
  }

  let callCount = 0
  return {
    anthropic: {
      messages: {
        stream: vi.fn().mockImplementation(() => {
          callCount++
          // Default: simple text response
          return createMockStream(
            [{ type: 'text', text: 'Hello!' }],
            'end_turn',
          )
        }),
      },
    },
    // Stub for LLMProvider (needed by llm/index.ts import)
    anthropicProvider: {
      name: 'anthropic',
      requireKey: () => {},
      createMessage: vi.fn(),
      streamMessage: vi.fn(),
    },
    getAnthropicClient: vi.fn(),
    // Expose helpers for test customization
    _createMockStream: createMockStream,
    _getCallCount: () => callCount,
    _resetCallCount: () => { callCount = 0 },
  }
})

// Mock gemini module (imported by llm/index.ts)
vi.mock('../providers/llm/gemini.js', () => ({
  geminiProvider: {
    name: 'gemini',
    requireKey: () => {},
    createMessage: vi.fn(),
    streamMessage: vi.fn(),
  },
  getGeminiClient: vi.fn(),
}))

// Mock openai module (imported by llm/index.ts)
vi.mock('../providers/llm/openai.js', () => ({
  openaiProvider: {
    name: 'openai',
    requireKey: () => {},
    createMessage: vi.fn(),
    streamMessage: vi.fn(),
  },
  getOpenAIClient: vi.fn(),
}))

// Mock tools
vi.mock('./tools.js', async () => {
  const actual = await vi.importActual('./tools.js') as any
  return {
    ...actual,
    executeTool: vi.fn().mockResolvedValue(JSON.stringify({ results: [] })),
  }
})

import { type ChatSSEEvent } from './adapter.js'
import { runAnthropicTurn } from './adapter-anthropic.js'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { anthropic, _createMockStream, _resetCallCount } = await import('../providers/llm/anthropic.js') as any
import { executeTool } from './tools.js'

beforeEach(() => {
  setupTestDb()
  upsertSetting('api_key.anthropic', 'test-key')
  vi.clearAllMocks()
  _resetCallCount()
})

describe('runChatTurn', () => {
  it('streams text response', async () => {
    const events: ChatSSEEvent[] = []

    const result = await runAnthropicTurn({
      messages: [{ role: 'user', content: 'Hello' }],
      system: 'You are a helpful assistant.',
      model: 'claude-haiku-4-5-20251001',
      onEvent: (e) => events.push(e),
    })

    expect(events.some(e => e.type === 'text_delta')).toBe(true)
    expect(events.some(e => e.type === 'done')).toBe(true)
    expect(result.usage.input_tokens).toBeGreaterThan(0)
  })

  it('handles tool_use loop', async () => {
    let callIdx = 0
    vi.mocked(anthropic.messages.stream).mockImplementation(() => {
      callIdx++
      if (callIdx === 1) {
        // First call: tool_use
        return _createMockStream(
          [
            { type: 'text', text: 'Let me search...' },
            { type: 'tool_use', id: 'toolu_1', name: 'search_articles', input: { query: 'test' } },
          ],
          'tool_use',
        )
      }
      // Second call: final text
      return _createMockStream(
        [{ type: 'text', text: 'Here are the results.' }],
        'end_turn',
      )
    })

    const events: ChatSSEEvent[] = []
    const result = await runAnthropicTurn({
      messages: [{ role: 'user', content: 'Search for articles' }],
      system: 'You are a helpful assistant.',
      model: 'claude-haiku-4-5-20251001',
      onEvent: (e) => events.push(e),
    })

    // Should have tool_use events
    expect(events.some(e => e.type === 'tool_use_start')).toBe(true)
    expect(events.some(e => e.type === 'tool_use_end')).toBe(true)

    // executeTool should have been called
    expect(executeTool).toHaveBeenCalledWith('search_articles', { query: 'test' }, { timeZone: undefined })

    // Should have 2 API calls
    expect(anthropic.messages.stream).toHaveBeenCalledTimes(2)

    // Result messages should include tool round
    expect(result.allMessages.length).toBeGreaterThan(1)
  })

  it('handles tool execution error gracefully', async () => {
    let callIdx = 0
    vi.mocked(anthropic.messages.stream).mockImplementation(() => {
      callIdx++
      if (callIdx === 1) {
        return _createMockStream(
          [{ type: 'tool_use', id: 'toolu_err', name: 'search_articles', input: {} }],
          'tool_use',
        )
      }
      return _createMockStream(
        [{ type: 'text', text: 'Sorry, search failed.' }],
        'end_turn',
      )
    })

    vi.mocked(executeTool).mockRejectedValueOnce(new Error('DB connection failed'))

    const events: ChatSSEEvent[] = []
    await runAnthropicTurn({
      messages: [{ role: 'user', content: 'test' }],
      system: 'test',
      model: 'claude-haiku-4-5-20251001',
      onEvent: (e) => events.push(e),
    })

    // Should still complete
    expect(events.some(e => e.type === 'done')).toBe(true)
  })

  it('respects max tool rounds', async () => {
    // Always return tool_use to trigger max rounds
    vi.mocked(anthropic.messages.stream).mockImplementation(() => {
      return _createMockStream(
        [{ type: 'tool_use', id: `toolu_${Math.random()}`, name: 'get_feeds', input: {} }],
        'tool_use',
      )
    })

    const events: ChatSSEEvent[] = []
    await runAnthropicTurn({
      messages: [{ role: 'user', content: 'test' }],
      system: 'test',
      model: 'claude-haiku-4-5-20251001',
      onEvent: (e) => events.push(e),
    })

    // Should have error event about max rounds
    expect(events.some(e => e.type === 'error')).toBe(true)
    expect(events.some(e => e.type === 'done')).toBe(true)
    // Should not exceed 10 API calls
    expect(anthropic.messages.stream).toHaveBeenCalledTimes(10)
  })

  it('accumulates usage across rounds', async () => {
    let callIdx = 0
    vi.mocked(anthropic.messages.stream).mockImplementation(() => {
      callIdx++
      if (callIdx === 1) {
        return _createMockStream(
          [{ type: 'tool_use', id: 'toolu_1', name: 'get_feeds', input: {} }],
          'tool_use',
          { input_tokens: 100, output_tokens: 50 },
        )
      }
      return _createMockStream(
        [{ type: 'text', text: 'Done.' }],
        'end_turn',
        { input_tokens: 200, output_tokens: 100 },
      )
    })

    const events: ChatSSEEvent[] = []
    const result = await runAnthropicTurn({
      messages: [{ role: 'user', content: 'test' }],
      system: 'test',
      model: 'claude-haiku-4-5-20251001',
      onEvent: (e) => events.push(e),
    })

    expect(result.usage.input_tokens).toBe(300)
    expect(result.usage.output_tokens).toBe(150)
  })
})
