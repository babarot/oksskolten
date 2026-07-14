import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useCategoryDragDrop } from './use-category-drag-drop'
import type { Category } from '../../shared/types'

vi.mock('../lib/fetcher', () => ({
  apiPatch: vi.fn().mockResolvedValue(undefined),
}))

import { apiPatch } from '../lib/fetcher'

function makeCategory(overrides: Partial<Category> = {}): Category {
  return {
    id: 1,
    name: 'Category',
    sort_order: 0,
    collapsed: 0,
    created_at: '2024-01-01',
    ...overrides,
  }
}

function makeDragEvent(): React.DragEvent {
  const data = new Map<string, string>()
  return {
    preventDefault: vi.fn(),
    dataTransfer: {
      setData: (k: string, v: string) => data.set(k, v),
      getData: (k: string) => data.get(k) ?? '',
      get types() { return Array.from(data.keys()) },
      effectAllowed: 'uninitialized',
      dropEffect: 'none',
    },
  } as unknown as React.DragEvent
}

describe('useCategoryDragDrop', () => {
  const categories = [
    makeCategory({ id: 1, name: 'A', sort_order: 0 }),
    makeCategory({ id: 2, name: 'B', sort_order: 1 }),
    makeCategory({ id: 3, name: 'C', sort_order: 2 }),
  ]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mutateCategories: any

  beforeEach(() => {
    vi.clearAllMocks()
    mutateCategories = vi.fn()
  })

  it('initializes with no dragging category', () => {
    const { result } = renderHook(() => useCategoryDragDrop({ categories, mutateCategories }))
    expect(result.current.draggingCategoryId).toBeNull()
  })

  it('handleCategoryDragStart transfers the category id', () => {
    const { result } = renderHook(() => useCategoryDragDrop({ categories, mutateCategories }))
    const event = makeDragEvent()

    act(() => result.current.handleCategoryDragStart(event, categories[0]))

    expect(result.current.draggingCategoryId).toBe(1)
    expect(event.dataTransfer.effectAllowed).toBe('move')
    expect(event.dataTransfer.getData('application/x-category-id')).toBe('1')
  })

  it('isCategoryDrag distinguishes category drags from other drags', () => {
    const { result } = renderHook(() => useCategoryDragDrop({ categories, mutateCategories }))
    const categoryEvent = makeDragEvent()
    act(() => result.current.handleCategoryDragStart(categoryEvent, categories[0]))
    expect(result.current.isCategoryDrag(categoryEvent)).toBe(true)

    const otherEvent = makeDragEvent()
    otherEvent.dataTransfer.setData('application/x-feed-ids', '[1]')
    expect(result.current.isCategoryDrag(otherEvent)).toBe(false)
  })

  it('handleCategoryDrop moves the dragged category before the target and persists new order', async () => {
    const { result } = renderHook(() => useCategoryDragDrop({ categories, mutateCategories }))
    const event = makeDragEvent()
    event.dataTransfer.setData('application/x-category-id', '3') // drag C onto A

    await act(async () => {
      await result.current.handleCategoryDrop(event, categories[0])
    })

    expect(event.preventDefault).toHaveBeenCalled()
    expect(result.current.draggingCategoryId).toBeNull()
    expect(mutateCategories).toHaveBeenCalledWith(expect.any(Function), { revalidate: false })

    const updater = mutateCategories.mock.calls[0][0]
    const updated = updater({ categories })
    // New order: C, A, B → sort_order 0, 1, 2
    expect(updated.categories.find((c: Category) => c.id === 3).sort_order).toBe(0)
    expect(updated.categories.find((c: Category) => c.id === 1).sort_order).toBe(1)
    expect(updated.categories.find((c: Category) => c.id === 2).sort_order).toBe(2)
    // The array itself must be reordered too — render order comes from array order, not from re-sorting sort_order client-side
    expect(updated.categories.map((c: Category) => c.id)).toEqual([3, 1, 2])

    expect(apiPatch).toHaveBeenCalledWith('/api/categories/3', { sort_order: 0 })
    expect(apiPatch).toHaveBeenCalledWith('/api/categories/1', { sort_order: 1 })
    expect(apiPatch).toHaveBeenCalledWith('/api/categories/2', { sort_order: 2 })
  })

  it('handleCategoryDrop is a no-op when dropped on itself', async () => {
    const { result } = renderHook(() => useCategoryDragDrop({ categories, mutateCategories }))
    const event = makeDragEvent()
    event.dataTransfer.setData('application/x-category-id', '1')

    await act(async () => {
      await result.current.handleCategoryDrop(event, categories[0])
    })

    expect(mutateCategories).not.toHaveBeenCalled()
    expect(apiPatch).not.toHaveBeenCalled()
  })

  it('handleCategoryDrop skips if dragged id is invalid', async () => {
    const { result } = renderHook(() => useCategoryDragDrop({ categories, mutateCategories }))
    const event = makeDragEvent()

    await act(async () => {
      await result.current.handleCategoryDrop(event, categories[0])
    })

    expect(mutateCategories).not.toHaveBeenCalled()
  })

  it('handleCategoryDrop reverts on API failure', async () => {
    vi.mocked(apiPatch).mockRejectedValueOnce(new Error('Network error'))
    const { result } = renderHook(() => useCategoryDragDrop({ categories, mutateCategories }))
    const event = makeDragEvent()
    event.dataTransfer.setData('application/x-category-id', '3')

    await act(async () => {
      await result.current.handleCategoryDrop(event, categories[0])
    })

    // First call: optimistic update, second call: revalidate on error
    expect(mutateCategories).toHaveBeenCalledTimes(2)
    expect(mutateCategories).toHaveBeenLastCalledWith()
  })

  it('handleCategoryDragEnd resets dragging state', () => {
    const { result } = renderHook(() => useCategoryDragDrop({ categories, mutateCategories }))
    act(() => result.current.handleCategoryDragStart(makeDragEvent(), categories[0]))
    act(() => result.current.handleCategoryDragEnd())
    expect(result.current.draggingCategoryId).toBeNull()
  })
})
