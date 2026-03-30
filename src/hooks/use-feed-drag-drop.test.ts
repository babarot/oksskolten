import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useFeedDragDrop } from './use-feed-drag-drop'
import type { FeedWithCounts } from '../../shared/types'

vi.mock('../lib/fetcher', () => ({
  apiPatch: vi.fn().mockResolvedValue(undefined),
  apiPost: vi.fn().mockResolvedValue(undefined),
}))

import { apiPatch } from '../lib/fetcher'

function makeFeed(overrides: Partial<FeedWithCounts> = {}): FeedWithCounts {
  return {
    id: 1,
    name: 'Test Feed',
    url: 'https://example.com',
    icon_url: null,
    rss_url: null,
    rss_bridge_url: null,
    category_id: null,
    last_error: null,
    error_count: 0,
    disabled: 0,
    requires_js_challenge: 0,
    type: 'rss',
    etag: null,
    last_modified: null,
    last_content_hash: null,
    next_check_at: null,
    check_interval: null,
    created_at: '2024-01-01',
    category_name: null,
    article_count: 10,
    unread_count: 5,
    articles_per_week: 2,
    latest_published_at: '2026-03-01T00:00:00Z',
    ...overrides,
  }
}

function makeDragEvent(overrides: Partial<Record<string, unknown>> = {}): React.DragEvent {
  const data = new Map<string, string>()
  return {
    preventDefault: vi.fn(),
    dataTransfer: {
      setData: (k: string, v: string) => data.set(k, v),
      getData: (k: string) => data.get(k) ?? '',
      effectAllowed: 'uninitialized',
      dropEffect: 'none',
    },
    currentTarget: document.createElement('div'),
    relatedTarget: null,
    ...overrides,
  } as unknown as React.DragEvent
}

describe('useFeedDragDrop', () => {
  const feeds = [makeFeed({ id: 1, category_id: null }), makeFeed({ id: 2, category_id: 3 })]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mutateFeeds: any

  beforeEach(() => {
    vi.clearAllMocks()
    mutateFeeds = vi.fn()
  })

  it('initializes with no drag state', () => {
    const { result } = renderHook(() => useFeedDragDrop({ feeds, mutateFeeds }))
    expect(result.current.dragOverTarget).toBeNull()
    expect(result.current.isDragging).toBe(false)
  })

  it('handleDragStart sets isDragging and transfers feed id', () => {
    const { result } = renderHook(() => useFeedDragDrop({ feeds, mutateFeeds }))
    const event = makeDragEvent()

    act(() => result.current.handleDragStart(event, feeds[0]))

    expect(result.current.isDragging).toBe(true)
    expect(event.dataTransfer.effectAllowed).toBe('move')
    expect(event.dataTransfer.getData('application/x-feed-ids')).toBe(JSON.stringify([1]))
  })

  it('handleDragOver sets dropEffect and dragOverTarget', () => {
    const { result } = renderHook(() => useFeedDragDrop({ feeds, mutateFeeds }))
    const event = makeDragEvent()

    act(() => result.current.handleDragOver(event, 5))

    expect(event.preventDefault).toHaveBeenCalled()
    expect(event.dataTransfer.dropEffect).toBe('move')
    expect(result.current.dragOverTarget).toBe(5)
  })

  it('handleDragOver supports "uncategorized" target', () => {
    const { result } = renderHook(() => useFeedDragDrop({ feeds, mutateFeeds }))
    const event = makeDragEvent()

    act(() => result.current.handleDragOver(event, 'uncategorized'))
    expect(result.current.dragOverTarget).toBe('uncategorized')
  })

  it('handleDragLeave clears target when leaving container', () => {
    const { result } = renderHook(() => useFeedDragDrop({ feeds, mutateFeeds }))
    const container = document.createElement('div')
    const event = makeDragEvent({
      currentTarget: container,
      relatedTarget: document.createElement('span'), // outside container
    })

    act(() => result.current.handleDragOver(makeDragEvent(), 5))
    act(() => result.current.handleDragLeave(event as unknown as React.DragEvent))

    expect(result.current.dragOverTarget).toBeNull()
  })

  it('handleDragLeave keeps target when entering child', () => {
    const { result } = renderHook(() => useFeedDragDrop({ feeds, mutateFeeds }))
    const container = document.createElement('div')
    const child = document.createElement('span')
    container.appendChild(child)
    const event = makeDragEvent({
      currentTarget: container,
      relatedTarget: child,
    })

    act(() => result.current.handleDragOver(makeDragEvent(), 5))
    act(() => result.current.handleDragLeave(event as unknown as React.DragEvent))

    expect(result.current.dragOverTarget).toBe(5)
  })

  it('handleDrop moves feed to new category via optimistic update', async () => {
    const { result } = renderHook(() => useFeedDragDrop({ feeds, mutateFeeds }))

    // Start drag with feed id 1
    const startEvent = makeDragEvent()
    act(() => result.current.handleDragStart(startEvent, feeds[0]))

    // Build drop event reusing the same dataTransfer
    const dropEvent = makeDragEvent()
    dropEvent.dataTransfer.setData('application/x-feed-ids', JSON.stringify([1]))

    await act(async () => {
      await result.current.handleDrop(dropEvent, 5)
    })

    expect(dropEvent.preventDefault).toHaveBeenCalled()
    expect(result.current.dragOverTarget).toBeNull()
    expect(result.current.isDragging).toBe(false)
    expect(mutateFeeds).toHaveBeenCalledWith(expect.any(Function), { revalidate: false })
    expect(apiPatch).toHaveBeenCalledWith('/api/feeds/1', { category_id: 5 })
  })

  it('handleDrop skips if feed already in same category', async () => {
    const { result } = renderHook(() => useFeedDragDrop({ feeds, mutateFeeds }))
    const dropEvent = makeDragEvent()
    dropEvent.dataTransfer.setData('application/x-feed-ids', JSON.stringify([2]))

    await act(async () => {
      await result.current.handleDrop(dropEvent, 3) // feed 2 already in category 3
    })

    expect(mutateFeeds).not.toHaveBeenCalled()
    expect(apiPatch).not.toHaveBeenCalled()
  })

  it('handleDrop skips if feedId is invalid', async () => {
    const { result } = renderHook(() => useFeedDragDrop({ feeds, mutateFeeds }))
    const dropEvent = makeDragEvent()
    // getData returns '' → Number('') === 0 which is falsy

    await act(async () => {
      await result.current.handleDrop(dropEvent, 5)
    })

    expect(mutateFeeds).not.toHaveBeenCalled()
  })

  it('handleDrop revalidates on API failure', async () => {
    vi.mocked(apiPatch).mockRejectedValueOnce(new Error('Network error'))
    const { result } = renderHook(() => useFeedDragDrop({ feeds, mutateFeeds }))
    const dropEvent = makeDragEvent()
    dropEvent.dataTransfer.setData('application/x-feed-ids', JSON.stringify([1]))

    await act(async () => {
      await result.current.handleDrop(dropEvent, 5)
    })

    // First call: optimistic update, second call: revalidate on error
    expect(mutateFeeds).toHaveBeenCalledTimes(2)
    expect(mutateFeeds).toHaveBeenLastCalledWith()
  })

  it('handleDragEnd resets all state', () => {
    const { result } = renderHook(() => useFeedDragDrop({ feeds, mutateFeeds }))

    act(() => result.current.handleDragStart(makeDragEvent(), feeds[0]))
    act(() => result.current.handleDragOver(makeDragEvent(), 5))
    act(() => result.current.handleDragEnd())

    expect(result.current.dragOverTarget).toBeNull()
    expect(result.current.isDragging).toBe(false)
  })

  it('optimistic updater correctly maps feed category', async () => {
    const { result } = renderHook(() => useFeedDragDrop({ feeds, mutateFeeds }))
    const dropEvent = makeDragEvent()
    dropEvent.dataTransfer.setData('application/x-feed-ids', JSON.stringify([1]))

    await act(async () => {
      await result.current.handleDrop(dropEvent, 7)
    })

    // Extract the optimistic updater function and test it
    const updater = mutateFeeds.mock.calls[0][0]
    const prev = { feeds, bookmark_count: 0, like_count: 0, clip_feed_id: null }
    const updated = updater(prev)
    expect(updated.feeds[0].category_id).toBe(7)
    expect(updated.feeds[1].category_id).toBe(3) // unchanged
  })
})
