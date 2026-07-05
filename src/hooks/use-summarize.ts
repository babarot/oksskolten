import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { renderMarkdown } from '../lib/markdown'
import { sanitizeHtml } from '../lib/sanitize'
import { useStreamingAI } from './use-streaming-ai'
import type { useMetrics } from './use-metrics'
import type { Article } from '../../shared/types'

export function useSummarize(
  article: Pick<Article, 'id' | 'summary'> | undefined,
  metrics: ReturnType<typeof useMetrics>,
) {
  const [summary, setSummary] = useState<string | null>(null)
  const forceRef = useRef(false)

  useEffect(() => {
    if (article) setSummary(article.summary)
  }, [article])

  const options = useMemo(() => ({
    endpoint: (id: number) => `/api/articles/${id}/summarize?stream=1${forceRef.current ? '&force=1' : ''}`,
    fixUnclosedBold: true,
    onComplete: (text: string) => { setSummary(text); forceRef.current = false },
  }), [])

  const { processing: summarizing, streamingText, streamingHtml, error, run } =
    useStreamingAI(article?.id, metrics, options)

  const handleSummarize = useCallback((force = false) => {
    forceRef.current = force
    void run()
  }, [run])

  const summaryHtml = useMemo(() => {
    if (!summary) return ''
    const html = renderMarkdown(summary)
    return sanitizeHtml(html)
  }, [summary])

  return { summary, summarizing, streamingText, handleSummarize, summaryHtml, streamingHtml, error }
}
