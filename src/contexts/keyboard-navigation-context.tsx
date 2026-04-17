import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

interface KeyboardNavigationValue {
  focusedItemId: string | null
  setFocusedItemId: (id: string | null) => void
  articleIds: string[]
  setArticleIds: (ids: string[]) => void
  articleUrls: Record<string, string>
  setArticleUrls: (urls: Record<string, string>) => void
  navigateToArticle: (id: string) => void
  setNavigateToArticle: (fn: (id: string) => void) => void
  lastListUrl: string | null
  setLastListUrl: (url: string | null) => void
}

const KeyboardNavigationContext = createContext<KeyboardNavigationValue | null>(null)

export function KeyboardNavigationProvider({ children }: { children: ReactNode }) {
  const [focusedItemId, setFocusedItemId] = useState<string | null>(null)
  const [lastListUrl, setLastListUrlState] = useState<string | null>(() => {
    return sessionStorage.getItem('kb_last_list_url')
  })
  const [articleIds, setArticleIds] = useState<string[]>(() => {
    try {
      const saved = sessionStorage.getItem('kb_article_ids')
      return saved ? JSON.parse(saved) : []
    } catch { return [] }
  })
  const [articleUrls, setArticleUrls] = useState<Record<string, string>>(() => {
    try {
      const saved = sessionStorage.getItem('kb_article_urls')
      return saved ? JSON.parse(saved) : {}
    } catch { return {} }
  })
  const [navigateToArticle, setNavigateToArticle] = useState<(id: string) => void>(() => () => {})

  const setLastListUrl = useCallback((url: string | null) => {
    setLastListUrlState(url)
    if (url) sessionStorage.setItem('kb_last_list_url', url)
    else sessionStorage.removeItem('kb_last_list_url')
  }, [])

  const updateArticleIds = useCallback((ids: string[]) => {
    setArticleIds(ids)
    sessionStorage.setItem('kb_article_ids', JSON.stringify(ids))
  }, [])

  const updateArticleUrls = useCallback((urls: Record<string, string>) => {
    setArticleUrls(urls)
    sessionStorage.setItem('kb_article_urls', JSON.stringify(urls))
  }, [])

  return (
    <KeyboardNavigationContext.Provider
      value={{
        focusedItemId,
        setFocusedItemId,
        articleIds,
        setArticleIds: updateArticleIds,
        articleUrls,
        setArticleUrls: updateArticleUrls,
        navigateToArticle,
        setNavigateToArticle,
        lastListUrl,
        setLastListUrl,
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
