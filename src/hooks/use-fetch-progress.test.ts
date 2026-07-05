import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// Mock SWR config
const mockGlobalMutate = vi.fn()
const mockCache = { keys: () => [][Symbol.iterator]() }
vi.mock('swr', () => ({
  useSWRConfig: () => ({ mutate: mockGlobalMutate, cache: mockCache }),
}))

vi.mock('../lib/fetcher', () => ({
  authHeaders: vi.fn(() => ({ Authorization: 'Bearer test' })),
}))

import { useFetchProgress } from './use-fetch-progress'

function mockSSEFetch(events: Array<{ type: string; feed_id: number; total?: number; fetched?: number }>) {
  const lines = events.map(e => `data: ${JSON.stringify(e)}`).join('\n') + '\n'
  const encoder = new TextEncoder()
  const chunks = [encoder.encode(lines)]
  let readIndex = 0

  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    statusText: 'OK',
    body: {
      getReader: () => ({
        read: () => {
          if (readIndex < chunks.length) {
            return Promise.resolve({ done: false, value: chunks[readIndex++] })
          }
          return Promise.resolve({ done: true, value: undefined })
        },
      }),
    },
  })
}

describe('useFetchProgress', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('starts with default state', () => {
    const { result } = renderHook(() => useFetchProgress())
    expect(result.current.progress.size).toBe(0)
  })

  describe('startFeedFetch', () => {
    it('fetches single feed and cleans up', async () => {
      vi.stubGlobal('fetch', mockSSEFetch([
        { type: 'feed-articles-found', feed_id: 42, total: 3 },
        { type: 'article-done', feed_id: 42, fetched: 3, total: 3 },
      ]))

      const { result } = renderHook(() => useFetchProgress())

      await act(async () => {
        await result.current.startFeedFetch(42)
      })

      // After completion, feed progress should be cleaned up
      expect(result.current.progress.has(42)).toBe(false)
      expect(mockGlobalMutate).toHaveBeenCalled()
    })

    it('sends POST to /api/feeds/:id/fetch', async () => {
      vi.stubGlobal('fetch', mockSSEFetch([]))

      const { result } = renderHook(() => useFetchProgress())

      await act(async () => {
        await result.current.startFeedFetch(99)
      })

      expect(fetch).toHaveBeenCalledWith('/api/feeds/99/fetch', expect.objectContaining({
        method: 'POST',
      }))
    })

    it('handles fetch error gracefully', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        statusText: 'Internal Server Error',
        body: null,
      }))

      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
      const { result } = renderHook(() => useFetchProgress())

      await act(async () => {
        await result.current.startFeedFetch(1)
      })

      // Should clean up progress even on error
      expect(result.current.progress.has(1)).toBe(false)
      expect(mockGlobalMutate).toHaveBeenCalled()
      consoleError.mockRestore()
    })
  })

  describe('subscribeFeedFetch', () => {
    it('subscribes to feed progress via GET', async () => {
      vi.stubGlobal('fetch', mockSSEFetch([
        { type: 'feed-articles-found', feed_id: 10, total: 2 },
        { type: 'article-done', feed_id: 10, fetched: 2, total: 2 },
      ]))

      const { result } = renderHook(() => useFetchProgress())

      await act(async () => {
        await result.current.subscribeFeedFetch(10)
      })

      expect(fetch).toHaveBeenCalledWith('/api/feeds/10/fetch-progress', expect.objectContaining({
        headers: { Authorization: 'Bearer test' },
      }))
      // No method specified means GET
      expect(fetch).toHaveBeenCalledWith('/api/feeds/10/fetch-progress', expect.not.objectContaining({
        method: 'POST',
      }))
      expect(result.current.progress.has(10)).toBe(false)
    })
  })
})
