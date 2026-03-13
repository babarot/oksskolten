import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ChatSSEEvent } from './adapter.js'
import type { ContentBlock, ToolResultBlock } from './types.js'
import type { ProviderCallFn } from './tool-loop.js'

// Mock executeTool
vi.mock('./tools.js', () => ({
  executeTool: vi.fn(),
}))

import { runToolLoop } from './tool-loop.js'
import { executeTool } from './tools.js'

function makeProvider(rounds: Array<{ content: ContentBlock[]; usage?: { input_tokens: number; output_tokens: number } }>): ProviderCallFn {
  let callIdx = 0
  return async () => {
    const round = rounds[callIdx++] ?? rounds[rounds.length - 1]
    return {
      content: round.content,
      usage: round.usage ?? { input_tokens: 10, output_tokens: 5 },
    }
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('runToolLoop', () => {
  it('returns immediately when no tool_use blocks', async () => {
    const events: ChatSSEEvent[] = []
    const provider = makeProvider([
      { content: [{ type: 'text', text: 'Hello' }] },
    ])

    const result = await runToolLoop(
      { messages: [{ role: 'user', content: 'hi' }], system: '', model: '', onEvent: (e) => events.push(e) },
      provider,
    )

    expect(result.allMessages).toHaveLength(2) // user + assistant
    expect(events.some(e => e.type === 'done')).toBe(true)
    expect(executeTool).not.toHaveBeenCalled()
  })

  it('executes multiple tools in parallel', async () => {
    const executionOrder: string[] = []

    vi.mocked(executeTool).mockImplementation(async (name) => {
      // Simulate async work with different delays to verify parallelism
      const delay = name === 'get_feeds' ? 50 : 10
      await new Promise(resolve => setTimeout(resolve, delay))
      executionOrder.push(name)
      return JSON.stringify({ tool: name })
    })

    const events: ChatSSEEvent[] = []
    const provider = makeProvider([
      {
        content: [
          { type: 'tool_use', id: 'tool_1', name: 'get_feeds', input: {} },
          { type: 'tool_use', id: 'tool_2', name: 'get_categories', input: {} },
        ],
      },
      { content: [{ type: 'text', text: 'Done' }] },
    ])

    await runToolLoop(
      { messages: [{ role: 'user', content: 'test' }], system: '', model: '', onEvent: (e) => events.push(e) },
      provider,
    )

    // Both tools should have been called
    expect(executeTool).toHaveBeenCalledTimes(2)
    expect(executeTool).toHaveBeenCalledWith('get_feeds', {}, { timeZone: undefined })
    expect(executeTool).toHaveBeenCalledWith('get_categories', {}, { timeZone: undefined })

    // If parallel, get_categories (10ms) should finish before get_feeds (50ms)
    expect(executionOrder).toEqual(['get_categories', 'get_feeds'])

    // Both tool_use_end events should be emitted
    const endEvents = events.filter(e => e.type === 'tool_use_end')
    expect(endEvents).toHaveLength(2)
  })

  it('one tool failure does not affect other tools', async () => {
    vi.mocked(executeTool).mockImplementation(async (name) => {
      if (name === 'search_articles') throw new Error('DB error')
      return JSON.stringify({ ok: true })
    })

    const events: ChatSSEEvent[] = []
    const provider = makeProvider([
      {
        content: [
          { type: 'tool_use', id: 'tool_1', name: 'search_articles', input: {} },
          { type: 'tool_use', id: 'tool_2', name: 'get_feeds', input: {} },
        ],
      },
      { content: [{ type: 'text', text: 'Done' }] },
    ])

    const result = await runToolLoop(
      { messages: [{ role: 'user', content: 'test' }], system: '', model: '', onEvent: (e) => events.push(e) },
      provider,
    )

    // Both tools were called
    expect(executeTool).toHaveBeenCalledTimes(2)

    // Check tool results in messages
    const toolResultMsg = result.allMessages.find(
      m => m.role === 'user' && Array.isArray(m.content) && m.content.some(c => c.type === 'tool_result'),
    )
    expect(toolResultMsg).toBeDefined()
    const blocks = toolResultMsg!.content as ContentBlock[]
    const toolResults = blocks.filter((c): c is ToolResultBlock => c.type === 'tool_result')

    // search_articles should have error
    const errorResult = toolResults.find(r => r.tool_use_id === 'tool_1')
    expect(errorResult!.is_error).toBe(true)
    expect(JSON.parse(errorResult!.content).error).toBe('DB error')

    // get_feeds should succeed
    const successResult = toolResults.find(r => r.tool_use_id === 'tool_2')
    expect(successResult!.is_error).toBeUndefined()

    // Should complete normally
    expect(events.some(e => e.type === 'done')).toBe(true)
  })

  it('preserves tool result order matching tool_use order', async () => {
    vi.mocked(executeTool).mockImplementation(async (name) => {
      // Second tool finishes first
      const delay = name === 'tool_a' ? 30 : 5
      await new Promise(resolve => setTimeout(resolve, delay))
      return JSON.stringify({ name })
    })

    const provider = makeProvider([
      {
        content: [
          { type: 'tool_use', id: 'id_a', name: 'tool_a', input: {} },
          { type: 'tool_use', id: 'id_b', name: 'tool_b', input: {} },
        ],
      },
      { content: [{ type: 'text', text: 'Done' }] },
    ])

    const result = await runToolLoop(
      { messages: [{ role: 'user', content: 'test' }], system: '', model: '', onEvent: () => {} },
      provider,
    )

    const toolResultMsg = result.allMessages.find(
      m => m.role === 'user' && Array.isArray(m.content) && m.content.some(c => c.type === 'tool_result'),
    )
    const blocks2 = toolResultMsg!.content as ContentBlock[]
    const toolResults = blocks2.filter((c): c is ToolResultBlock => c.type === 'tool_result')

    // Order should match original tool_use order, not completion order
    expect(toolResults[0].tool_use_id).toBe('id_a')
    expect(toolResults[1].tool_use_id).toBe('id_b')
  })
})
