import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useChat } from './use-chat'
import { buildArticleScope } from '../lib/chat-scope'

// Capture the onEvent callback from streamPostChat so we can simulate events
let capturedOnEvent: ((event: any) => void) | null = null
let streamResolve: (() => void) | null = null
let streamReject: ((err: Error) => void) | null = null

const mockFetcher = vi.fn()

vi.mock('../lib/fetcher', () => ({
  fetcher: (...args: unknown[]) => mockFetcher(...args),
  streamPostChat: vi.fn((_url: string, _body: any, onEvent: any) => {
    capturedOnEvent = onEvent
    return new Promise<void>((resolve, reject) => {
      streamResolve = resolve
      streamReject = reject
    })
  }),
}))

describe('useChat', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    capturedOnEvent = null
    streamResolve = null
    streamReject = null
    localStorage.clear()
  })

  it('starts with empty state', () => {
    const { result } = renderHook(() => useChat())
    expect(result.current.messages).toEqual([])
    expect(result.current.conversationId).toBeNull()
    expect(result.current.streaming).toBe(false)
    expect(result.current.thinking).toBe(false)
    expect(result.current.activeTool).toBeNull()
    expect(result.current.error).toBeNull()
  })

  it('adds user and placeholder assistant message on sendMessage', async () => {
    const { result } = renderHook(() => useChat(buildArticleScope(42)))

    await act(async () => {
      result.current.sendMessage('hello')
      // Let microtasks run so the streamPostChat mock is called
      await Promise.resolve()
    })

    expect(result.current.streaming).toBe(true)
    expect(result.current.messages).toHaveLength(2)
    expect(result.current.messages[0]).toEqual({ role: 'user', text: 'hello' })
    expect(result.current.messages[1]).toEqual({ role: 'assistant', text: '' })

    // Complete the stream
    await act(async () => {
      streamResolve!()
    })
  })

  it('ignores empty messages', async () => {
    const { result } = renderHook(() => useChat())
    await act(async () => {
      result.current.sendMessage('  ')
    })
    expect(result.current.messages).toEqual([])
  })

  it('handles conversation_id event', async () => {
    const { result } = renderHook(() => useChat())

    await act(async () => {
      result.current.sendMessage('hi')
      await Promise.resolve()
    })

    await act(async () => {
      capturedOnEvent!({ type: 'conversation_id', conversation_id: 'conv-123' })
    })

    expect(result.current.conversationId).toBe('conv-123')

    await act(async () => { streamResolve!() })
  })

  it('handles text_delta events', async () => {
    const { result } = renderHook(() => useChat())

    await act(async () => {
      result.current.sendMessage('hi')
      await Promise.resolve()
    })

    await act(async () => {
      capturedOnEvent!({ type: 'text_delta', text: 'Hello ' })
      capturedOnEvent!({ type: 'text_delta', text: 'world' })
    })

    expect(result.current.messages[1].text).toBe('Hello world')

    await act(async () => { streamResolve!() })
  })

  it('handles thinking start/end', async () => {
    const { result } = renderHook(() => useChat())

    await act(async () => {
      result.current.sendMessage('hi')
      await Promise.resolve()
    })

    await act(async () => {
      capturedOnEvent!({ type: 'thinking_start' })
    })
    expect(result.current.thinking).toBe(true)

    await act(async () => {
      capturedOnEvent!({ type: 'thinking_end' })
    })
    expect(result.current.thinking).toBe(false)

    await act(async () => { streamResolve!() })
  })

  it('handles tool_use start/end', async () => {
    const { result } = renderHook(() => useChat())

    await act(async () => {
      result.current.sendMessage('hi')
      await Promise.resolve()
    })

    await act(async () => {
      capturedOnEvent!({ type: 'tool_use_start', name: 'search', tool_use_id: 'tu-1' })
    })
    expect(result.current.activeTool).toEqual({ name: 'search', tool_use_id: 'tu-1' })

    await act(async () => {
      capturedOnEvent!({ type: 'tool_use_end' })
    })
    expect(result.current.activeTool).toBeNull()

    await act(async () => { streamResolve!() })
  })

  it('handles error event from stream', async () => {
    const { result } = renderHook(() => useChat())

    await act(async () => {
      result.current.sendMessage('hi')
      await Promise.resolve()
    })

    await act(async () => {
      capturedOnEvent!({ type: 'error', error: 'rate limited' })
    })
    expect(result.current.error).toBe('rate limited')

    await act(async () => { streamResolve!() })
  })

  it('handles stream rejection and removes empty assistant message', async () => {
    const { result } = renderHook(() => useChat())

    await act(async () => {
      result.current.sendMessage('hi')
      await Promise.resolve()
    })

    expect(result.current.messages).toHaveLength(2)

    await act(async () => {
      streamReject!(new Error('network error'))
    })

    expect(result.current.streaming).toBe(false)
    expect(result.current.error).toBe('network error')
    // Empty assistant message should be removed
    expect(result.current.messages).toHaveLength(1)
    expect(result.current.messages[0].role).toBe('user')
  })

  it('reset clears all state', async () => {
    const { result } = renderHook(() => useChat())

    await act(async () => {
      result.current.sendMessage('hi')
      await Promise.resolve()
    })

    await act(async () => {
      capturedOnEvent!({ type: 'conversation_id', conversation_id: 'conv-1' })
      streamResolve!()
    })

    await act(async () => {
      result.current.reset()
    })

    expect(result.current.messages).toEqual([])
    expect(result.current.conversationId).toBeNull()
    expect(result.current.streaming).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('loadConversation fetches and sets messages', async () => {
    const mockMessages = {
      messages: [
        { role: 'user', content: JSON.stringify([{ type: 'text', text: 'question' }]) },
        { role: 'assistant', content: JSON.stringify([{ type: 'text', text: 'answer' }]) },
      ],
    }
    mockFetcher.mockResolvedValue(mockMessages)

    const { result } = renderHook(() => useChat())

    await act(async () => {
      await result.current.loadConversation('conv-abc')
    })

    expect(result.current.conversationId).toBe('conv-abc')
    expect(result.current.messages).toEqual([
      { role: 'user', text: 'question' },
      { role: 'assistant', text: 'answer' },
    ])
  })

  it('loadConversation skips tool_result/tool_use blocks', async () => {
    const mockMessages = {
      messages: [
        { role: 'user', content: JSON.stringify([{ type: 'tool_result', tool_use_id: 'tu-1' }]) },
        { role: 'assistant', content: JSON.stringify([{ type: 'tool_use', name: 'search' }]) },
      ],
    }
    mockFetcher.mockResolvedValue(mockMessages)

    const { result } = renderHook(() => useChat())

    await act(async () => {
      await result.current.loadConversation('conv-xyz')
    })

    expect(result.current.messages).toEqual([])
  })
})
