import { createContext, useContext, useState, type ReactNode } from 'react'

interface KeyboardNavigationValue {
  focusedItemId: string | null
  setFocusedItemId: (id: string | null) => void
  articleIds: string[]
  setArticleIds: (ids: string[]) => void
  navigateToArticle: (id: string) => void
  setNavigateToArticle: (fn: (id: string) => void) => void
}

const KeyboardNavigationContext = createContext<KeyboardNavigationValue | null>(null)

export function KeyboardNavigationProvider({ children }: { children: ReactNode }) {
  const [focusedItemId, setFocusedItemId] = useState<string | null>(null)
  const [articleIds, setArticleIds] = useState<string[]>([])
  const [navigateToArticle, setNavigateToArticle] = useState<(id: string) => void>(() => {})

  return (
    <KeyboardNavigationContext.Provider
      value={{
        focusedItemId,
        setFocusedItemId,
        articleIds,
        setArticleIds,
        navigateToArticle,
        setNavigateToArticle,
      }}
    >
      {children}
    </KeyboardNavigationContext.Provider>
  )
}

export function useKeyboardNavigationContext() {
  const ctx = useContext(KeyboardNavigationContext)
  if (!ctx) throw new Error('useKeyboardNavigationContext must be used within KeyboardNavigationProvider')
  return ctx
}
