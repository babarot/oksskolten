import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useStreamingAI } from './use-streaming-ai'
import type { useMetrics } from './use-metrics'
import type { Article } from '../../shared/types'

type ViewMode = 'translated' | 'original'

const STREAMING_OPTIONS = {
  endpoint: (id: number) => `/api/articles/${id}/translate?stream=1`,
} as const

export function useTranslate(
  article: Pick<Article, 'id' | 'full_text_translated'> | undefined,
  metrics: ReturnType<typeof useMetrics>,
) {
  const [viewMode, setViewMode] = useState<ViewMode>('original')
  const [fullTextTranslated, setFullTextTranslated] = useState<string | null>(null)

  const initializedIdRef = useRef<number | null>(null)
  useEffect(() => {
    if (article) {
      setFullTextTranslated(article.full_text_translated)
      if (initializedIdRef.current !== article.id) {
        initializedIdRef.current = article.id
        setViewMode(article.full_text_translated ? 'translated' : 'original')
      }
    }
  }, [article])

  const options = useMemo(() => ({
    ...STREAMING_OPTIONS,
    onComplete: (text: string) => {
      setFullTextTranslated(text)
      setViewMode('translated')
    },
  }), [])

  const { processing: translating, streamingText: translatingText, streamingHtml: translatingHtml, error, run } =
    useStreamingAI(article?.id, metrics, options)

  const handleTranslate = useCallback(() => run(), [run])

  return { viewMode, setViewMode, translating, translatingText, fullTextTranslated, handleTranslate, translatingHtml, error }
}
