import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useFeedActions } from './use-feed-actions'
import type { FeedWithCounts, Category } from '../../shared/types'

vi.mock('../lib/fetcher', () => ({
  apiPost: vi.fn().mockResolvedValue(undefined),
  apiPatch: vi.fn().mockResolvedValue(undefined),
  apiDelete: vi.fn().mockResolvedValue(undefined),
}))

import { apiPost, apiPatch, apiDelete } from '../lib/fetcher'

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

function makeCategory(overrides: Partial<Category> = {}): Category {
  return {
    id: 1,
    name: 'Tech',
    sort_order: 0,
    collapsed: 0,
    created_at: '2024-01-01',
    ...overrides,
  }
}

function makeMouseEvent(overrides: Partial<React.MouseEvent> = {}): React.MouseEvent {
  return {
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    clientX: 100,
    clientY: 200,
    ...overrides,
  } as unknown as React.MouseEvent
}

function defaultOpts(overrides: any = {}) {
  return {
    categorized: new Map(),
    mutateFeeds: vi.fn(),
    mutateCategories: vi.fn(),
    startFeedFetch: vi.fn(() => Promise.resolve({ totalNew: 0 })),
    onMarkAllRead: vi.fn(),
    ...overrides,
  }
}

describe('useFeedActions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('starts with null renaming/confirm', () => {
    const { result } = renderHook(() => useFeedActions(defaultOpts()))
    expect(result.current.renaming).toBeNull()
    expect(result.current.confirm).toBeNull()
  })

  describe('rename', () => {
    it('starts rename for feed', () => {
      const { result } = renderHook(() => useFeedActions(defaultOpts()))
      const feed = makeFeed({ name: 'My Feed' })

      act(() => result.current.handleStartRenameFeed(feed))

      expect(result.current.renaming).toEqual({ type: 'feed', feed, name: 'My Feed' })
    })

    it('starts rename for category', () => {
      const { result } = renderHook(() => useFeedActions(defaultOpts()))
      const category = makeCategory({ name: 'Tech' })

      act(() => result.current.handleStartRenameCategory(category))

      expect(result.current.renaming).toEqual({ type: 'category', category, name: 'Tech' })
    })

    it('submits feed rename', async () => {
      const opts = defaultOpts()
      const { result } = renderHook(() => useFeedActions(opts))
      const feed = makeFeed({ id: 5 })

      act(() => result.current.handleStartRenameFeed(feed))
      act(() => result.current.setRenaming({ type: 'feed', feed, name: 'New Name' }))

      await act(async () => result.current.handleRenameSubmit())

      expect(apiPatch).toHaveBeenCalledWith('/api/feeds/5', { name: 'New Name' })
      expect(opts.mutateFeeds).toHaveBeenCalled()
      expect(result.current.renaming).toBeNull()
    })

    it('submits category rename', async () => {
      const opts = defaultOpts()
      const { result } = renderHook(() => useFeedActions(opts))
      const category = makeCategory({ id: 3 })

      act(() => result.current.handleStartRenameCategory(category))
      act(() => result.current.setRenaming({ type: 'category', category, name: 'New Cat' }))

      await act(async () => result.current.handleRenameSubmit())

      expect(apiPatch).toHaveBeenCalledWith('/api/categories/3', { name: 'New Cat' })
      expect(opts.mutateCategories).toHaveBeenCalled()
    })

    it('does not submit empty name', async () => {
      const { result } = renderHook(() => useFeedActions(defaultOpts()))
      const feed = makeFeed()

      act(() => result.current.handleStartRenameFeed(feed))
      act(() => result.current.setRenaming({ type: 'feed', feed, name: '  ' }))

      await act(async () => result.current.handleRenameSubmit())
      expect(apiPatch).not.toHaveBeenCalled()
    })
  })

  describe('mark all read', () => {
    it('marks feed as read', async () => {
      const opts = defaultOpts()
      const { result } = renderHook(() => useFeedActions(opts))
      const feed = makeFeed({ id: 7 })

      await act(async () => result.current.handleMarkAllReadFeed(feed))

      expect(apiPost).toHaveBeenCalledWith('/api/feeds/7/mark-all-seen')
      expect(opts.mutateFeeds).toHaveBeenCalled()
      expect(opts.onMarkAllRead).toHaveBeenCalled()
    })

    it('marks category as read', async () => {
      const opts = defaultOpts()
      const { result } = renderHook(() => useFeedActions(opts))
      const category = makeCategory({ id: 2 })

      await act(async () => result.current.handleMarkAllReadCategory(category))

      expect(apiPost).toHaveBeenCalledWith('/api/categories/2/mark-all-seen')
    })
  })

  describe('delete', () => {
    it('sets confirm state for feed delete', () => {
      const { result } = renderHook(() => useFeedActions(defaultOpts()))
      const feed = makeFeed()

      act(() => result.current.handleDeleteFeed(feed))

      expect(result.current.confirm).toEqual({ type: 'delete-feed', feed })
    })

    it('confirms feed delete with optimistic update', async () => {
      const opts = defaultOpts()
      const { result } = renderHook(() => useFeedActions(opts))
      const feed = makeFeed({ id: 3 })

      act(() => result.current.handleDeleteFeed(feed))

      await act(async () => result.current.handleConfirm())

      expect(opts.mutateFeeds).toHaveBeenCalledWith(expect.any(Function), { revalidate: false })
      expect(apiDelete).toHaveBeenCalledWith('/api/feeds/3')
    })

    it('confirms category delete', async () => {
      const opts = defaultOpts()
      const { result } = renderHook(() => useFeedActions(opts))
      const category = makeCategory({ id: 2 })

      act(() => result.current.handleDeleteCategory(category))

      await act(async () => result.current.handleConfirm())

      expect(opts.mutateCategories).toHaveBeenCalledWith(expect.any(Function), { revalidate: false })
      expect(apiDelete).toHaveBeenCalledWith('/api/categories/2')
    })
  })

  describe('move to category', () => {
    it('moves feed to category with optimistic update', async () => {
      const opts = defaultOpts()
      const { result } = renderHook(() => useFeedActions(opts))
      const feed = makeFeed({ id: 4 })

      await act(async () => result.current.handleMoveToCategory(feed, 2))

      expect(opts.mutateFeeds).toHaveBeenCalledWith(expect.any(Function), { revalidate: false })
      expect(apiPatch).toHaveBeenCalledWith('/api/feeds/4', { category_id: 2 })
    })
  })

  describe('fetch', () => {
    it('fetches a single feed', async () => {
      const opts = defaultOpts()
      const { result } = renderHook(() => useFeedActions(opts))
      const feed = makeFeed({ id: 8 })

      await act(async () => result.current.handleFetchFeed(feed))

      expect(opts.startFeedFetch).toHaveBeenCalledWith(8)
    })

    it('fetches all feeds in a category', async () => {
      const feed1 = makeFeed({ id: 10, disabled: 0 })
      const feed2 = makeFeed({ id: 11, disabled: 1 })
      const feed3 = makeFeed({ id: 12, disabled: 0 })
      const categorized = new Map([[1, [feed1, feed2, feed3]]])
      const opts = defaultOpts({ categorized })
      const { result } = renderHook(() => useFeedActions(opts))
      const category = makeCategory({ id: 1 })

      await act(async () => result.current.handleFetchCategory(category))

      // Only non-disabled feeds should be fetched
      expect(opts.startFeedFetch).toHaveBeenCalledWith(10)
      expect(opts.startFeedFetch).not.toHaveBeenCalledWith(11)
      expect(opts.startFeedFetch).toHaveBeenCalledWith(12)
    })
  })

  describe('re-detect', () => {
    it('calls re-detect for feed and triggers fetch', async () => {
      const opts = defaultOpts()
      const { result } = renderHook(() => useFeedActions(opts))
      const feed = makeFeed({ id: 6 })

      await act(async () => result.current.handleReDetectFeed(feed))

      expect(apiPost).toHaveBeenCalledWith('/api/feeds/6/re-detect')
      expect(opts.mutateFeeds).toHaveBeenCalled()
      expect(opts.startFeedFetch).toHaveBeenCalledWith(6)
    })
  })

  describe('toggle collapse', () => {
    it('toggles category collapsed state', async () => {
      const opts = defaultOpts()
      const { result } = renderHook(() => useFeedActions(opts))
      const category = makeCategory({ id: 5, collapsed: 0 })
      const event = makeMouseEvent()

      await act(async () => result.current.handleToggleCollapse(category, event))

      expect(event.stopPropagation).toHaveBeenCalled()
      expect(opts.mutateCategories).toHaveBeenCalledWith(expect.any(Function), { revalidate: false })
      expect(apiPatch).toHaveBeenCalledWith('/api/categories/5', { collapsed: 1 })
    })

    it('uncollapse already collapsed category', async () => {
      const opts = defaultOpts()
      const { result } = renderHook(() => useFeedActions(opts))
      const category = makeCategory({ id: 5, collapsed: 1 })

      await act(async () => result.current.handleToggleCollapse(category, makeMouseEvent()))

      expect(apiPatch).toHaveBeenCalledWith('/api/categories/5', { collapsed: 0 })
    })
  })
})
