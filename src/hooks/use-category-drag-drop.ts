import { useState } from 'react'
import { apiPatch } from '../lib/fetcher'
import type { Category } from '../../shared/types'
import type { KeyedMutator } from 'swr'

const CATEGORY_DND_TYPE = 'application/x-category-id'

interface UseCategoryDragDropOpts {
  categories: Category[]
  mutateCategories: KeyedMutator<{ categories: Category[] }>
}

export function useCategoryDragDrop({ categories, mutateCategories }: UseCategoryDragDropOpts) {
  const [draggingCategoryId, setDraggingCategoryId] = useState<number | null>(null)

  function handleCategoryDragStart(e: React.DragEvent, category: Category) {
    e.dataTransfer.setData(CATEGORY_DND_TYPE, String(category.id))
    e.dataTransfer.effectAllowed = 'move'
    setDraggingCategoryId(category.id)
  }

  function isCategoryDrag(e: React.DragEvent): boolean {
    return e.dataTransfer.types.includes(CATEGORY_DND_TYPE)
  }

  /** Moves the dragged category to `targetCategory`'s position and persists the new sort_order for every category whose position changed. */
  async function handleCategoryDrop(e: React.DragEvent, targetCategory: Category) {
    e.preventDefault()
    const draggedId = Number(e.dataTransfer.getData(CATEGORY_DND_TYPE))
    setDraggingCategoryId(null)
    if (!draggedId || draggedId === targetCategory.id) return

    const ordered = [...categories].sort((a, b) => a.sort_order - b.sort_order)
    const fromIndex = ordered.findIndex(c => c.id === draggedId)
    const toIndex = ordered.findIndex(c => c.id === targetCategory.id)
    if (fromIndex === -1 || toIndex === -1) return

    const reordered = [...ordered]
    const [dragged] = reordered.splice(fromIndex, 1)
    reordered.splice(toIndex, 0, dragged)
    const withSortOrder = reordered.map((c, i) => ({ ...c, sort_order: i }))

    const sortOrderById = new Map(withSortOrder.map(c => [c.id, c.sort_order]))

    void mutateCategories(
      prev => prev ? { categories: withSortOrder } : prev,
      { revalidate: false },
    )

    try {
      await Promise.all(
        ordered
          .filter(c => sortOrderById.get(c.id) !== c.sort_order)
          .map(c => apiPatch(`/api/categories/${c.id}`, { sort_order: sortOrderById.get(c.id) })),
      )
    } catch {
      void mutateCategories()
    }
  }

  function handleCategoryDragEnd() {
    setDraggingCategoryId(null)
  }

  return {
    draggingCategoryId,
    isCategoryDrag,
    handleCategoryDragStart,
    handleCategoryDrop,
    handleCategoryDragEnd,
  }
}
