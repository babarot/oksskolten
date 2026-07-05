import { useState, useCallback } from 'react'
import { useSWRConfig } from 'swr'
import { authHeaders } from '../lib/fetcher'

interface FeedProgress {
  fetched: number
  total: number
}

export interface FetchResult {
  totalNew: number
  error?: boolean
  name?: string
}

interface FetchProgressEvent {
  type: 'feed-articles-found' | 'article-done' | 'feed-complete'
  feed_id: number
  total?: number
  fetched?: number
}

async function readSSE(
  response: Response,
  onEvent: (event: FetchProgressEvent) => void,
) {
  if (!response.body) return
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop()!

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      try {
        const payload = JSON.parse(line.slice(6)) as FetchProgressEvent
        onEvent(payload)
      } catch {
        // ignore malformed lines
      }
    }
  }
}

export function useFetchProgress() {
  const [progress, setProgress] = useState<Map<number, FeedProgress>>(new Map())
  const { mutate: globalMutate, cache } = useSWRConfig()

  const revalidate = useCallback(() => {
    void globalMutate((key: unknown) =>
      typeof key === 'string' && key.includes('/api/feeds'))
    // globalMutate(filterFn) silently skips $inf$ keys from useSWRInfinite,
    // so walk the cache directly to invalidate article list pages too. Covers
    // the main list (/api/articles) and label article lists (/api/labels/:id/articles).
    for (const key of cache.keys()) {
      if (typeof key !== 'string') continue
      if (key.includes('/api/articles') || key.includes('/api/labels')) {
        void globalMutate(key)
      }
    }
  }, [globalMutate, cache])

  const startFeedFetch = useCallback(async (feedId: number): Promise<FetchResult> => {
    setProgress(prev => new Map(prev).set(feedId, { fetched: 0, total: 0 }))
    let totalNew = 0
    let hadError = false

    try {
      const res = await fetch(`/api/feeds/${feedId}/fetch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: '{}',
      })
      if (!res.ok) throw new Error(res.statusText)

      await readSSE(res, (event) => {
        if (event.type === 'feed-articles-found') {
          totalNew = event.total ?? 0
          setProgress(prev => {
            const next = new Map(prev)
            next.set(feedId, { fetched: 0, total: event.total ?? 0 })
            return next
          })
        } else if (event.type === 'article-done') {
          setProgress(prev => {
            const next = new Map(prev)
            next.set(feedId, { fetched: event.fetched ?? 0, total: event.total ?? 0 })
            return next
          })
        }
      })
    } catch (err) {
      hadError = true
    } finally {
      setProgress(prev => {
        const next = new Map(prev)
        next.delete(feedId)
        return next
      })
      revalidate()
    }

    return { totalNew, error: hadError || undefined }
  }, [revalidate])

  const subscribeFeedFetch = useCallback(async (feedId: number) => {
    setProgress(prev => new Map(prev).set(feedId, { fetched: 0, total: 0 }))

    try {
      const res = await fetch(`/api/feeds/${feedId}/fetch-progress`, {
        headers: authHeaders(),
      })
      if (!res.ok) throw new Error(res.statusText)

      await readSSE(res, (event) => {
        if (event.type === 'feed-articles-found') {
          setProgress(prev => {
            const next = new Map(prev)
            next.set(feedId, { fetched: 0, total: event.total ?? 0 })
            return next
          })
        } else if (event.type === 'article-done') {
          setProgress(prev => {
            const next = new Map(prev)
            next.set(feedId, { fetched: event.fetched ?? 0, total: event.total ?? 0 })
            return next
          })
        }
      })
    } catch (err) {
      void err
    } finally {
      setProgress(prev => {
        const next = new Map(prev)
        next.delete(feedId)
        return next
      })
      revalidate()
    }
  }, [revalidate])

  return { progress, startFeedFetch, subscribeFeedFetch }
}
