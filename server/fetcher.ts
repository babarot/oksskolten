import {
  getEnabledFeeds,
  getExistingArticleUrls,
  getRetryArticles,
  insertArticle,
  updateArticleContent,
  updateFeedError,
  updateFeedRateLimit,
  updateFeedCacheHeaders,
  updateFeedSchedule,
  type Feed,
  type Article,
} from './db.js'

import { Semaphore, CONCURRENCY, errorMessage } from './fetcher/util.js'
import { type FetchProgressEvent, emitProgress, markFeedDone } from './fetcher/progress.js'
import { fetchFullText, isBotBlockPage } from './fetcher/content.js'
import { type FetchRssResult, fetchAndParseRss, RateLimitError } from './fetcher/rss.js'
import { computeInterval, computeEmpiricalInterval, sqliteFuture, DEFAULT_INTERVAL } from './fetcher/schedule.js'
import { detectLanguage } from './fetcher/ai.js'

// --- Re-exports (preserve existing import sites) ---
export { normalizeDate } from './fetcher/util.js'
export { type FetchProgressEvent, fetchProgress, getFeedState } from './fetcher/progress.js'
export { discoverRssUrl } from './fetcher/rss.js'
export { detectLanguage, summarizeArticle, streamSummarizeArticle, translateArticle, streamTranslateArticle } from './fetcher/ai.js'
export type { AiTextResult, AiBillingMode } from './fetcher/ai.js'

// --- Article processing ---

interface NewArticle {
  kind: 'new'
  feed_id: number
  title: string
  url: string
  published_at: string | null
  requires_js_challenge?: boolean
  /** Excerpt from listing page (CSS Bridge content_selector), used as fullText fallback */
  excerpt?: string
}

interface RetryArticle {
  kind: 'retry'
  article: Article
}

type ArticleTask = NewArticle | RetryArticle

async function processArticle(task: ArticleTask): Promise<void> {
  let fullText: string | null = null
  let ogImage: string | null = null
  let excerpt: string | null = null
  let lang: string | null = null
  let lastError: string | null = null

  const articleUrl = task.kind === 'new' ? task.url : task.article.url

  // Step 1: Fetch full text
  if (task.kind === 'retry' && task.article.full_text) {
    fullText = task.article.full_text
    ogImage = task.article.og_image
  } else {
    try {
      const requiresJsChallenge = task.kind === 'new' ? task.requires_js_challenge : undefined
      const result = await fetchFullText(articleUrl, { requiresJsChallenge })
      fullText = result.fullText
      ogImage = result.ogImage
      excerpt = result.excerpt
    } catch (err) {
      lastError = `fetchFullText: ${errorMessage(err)}`
    }
  }

  // Fallback: use listing-page excerpt from CSS Bridge content_selector
  if (task.kind === 'new' && task.excerpt) {
    const shouldFallback = !fullText || isBotBlockPage(fullText)
    if (shouldFallback) {
      fullText = task.excerpt
      excerpt = task.excerpt
      lastError = null // Clear fetch error — we have fallback content
    }
  }

  // Step 2: Detect language (local, no API call)
  if (fullText && !(task.kind === 'retry' && task.article.lang)) {
    lang = detectLanguage(fullText)
  } else if (task.kind === 'retry') {
    lang = task.article.lang
  }

  const effectiveLang = lang || (task.kind === 'retry' ? task.article.lang : null)

  // Step 3: Persist
  if (!lastError) lastError = null

  if (task.kind === 'new') {
    try {
      insertArticle({
        feed_id: task.feed_id,
        title: task.title,
        url: task.url,
        published_at: task.published_at,
        lang: effectiveLang,
        full_text: fullText,
        full_text_translated: null,
        summary: null,
        excerpt,
        og_image: ogImage,
        last_error: lastError,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (!msg.includes('UNIQUE constraint failed')) {
        console.warn(`[fetcher] insertArticle failed for ${task.url}: ${msg}`)
      }
    }
  } else {
    updateArticleContent(task.article.id, {
      lang: effectiveLang,
      full_text: fullText,
      excerpt,
      og_image: ogImage,
      last_error: lastError,
    })
  }
}

// --- Single feed fetch ---

export async function fetchSingleFeed(
  feed: Feed,
  onProgress?: (event: FetchProgressEvent) => void,
  opts?: { skipCache?: boolean },
): Promise<void> {
  const semaphore = new Semaphore(CONCURRENCY)

  let rssResult: FetchRssResult
  try {
    rssResult = await fetchAndParseRss(feed, opts)
    updateFeedError(feed.id, null)
    updateFeedCacheHeaders(feed.id, rssResult.etag, rssResult.lastModified, rssResult.contentHash)
  } catch (err) {
    if (err instanceof RateLimitError) {
      console.warn(`[fetcher] Feed ${feed.name}: ${err.message}`)
      updateFeedRateLimit(feed.id, err.retryAfterSeconds)
      return
    }
    const msg = errorMessage(err)
    console.error(`[fetcher] Feed ${feed.name}: ${msg}`)
    updateFeedError(feed.id, msg)
    return
  }

  if (rssResult.notModified) {
    // Reschedule using stored interval (or default)
    const interval = feed.check_interval ?? DEFAULT_INTERVAL
    updateFeedSchedule(feed.id, sqliteFuture(interval), interval)
    console.log(`[fetcher] Feed ${feed.name}: not modified (304)`)
    return
  }

  // Compute and store adaptive interval
  {
    const empirical = computeEmpiricalInterval(rssResult.items)
    const interval = computeInterval(rssResult.httpCacheSeconds, rssResult.rssTtlSeconds, empirical)
    updateFeedSchedule(feed.id, sqliteFuture(interval), interval)
  }

  const urls = rssResult.items.map(i => i.url)
  const existing = getExistingArticleUrls(urls)
  const tasks: ArticleTask[] = rssResult.items
    .filter(item => !existing.has(item.url))
    .map(item => ({
      kind: 'new' as const,
      feed_id: feed.id,
      title: item.title,
      url: item.url,
      published_at: item.published_at,
      requires_js_challenge: !!feed.requires_js_challenge,
      excerpt: item.excerpt,
    }))

  if (tasks.length === 0) {
    console.log(`[fetcher] Feed ${feed.name}: no new articles`)
    return
  }

  const total = tasks.length
  let fetched = 0

  const foundEvent: FetchProgressEvent = { type: 'feed-articles-found', feed_id: feed.id, total }
  emitProgress(foundEvent)
  onProgress?.(foundEvent)

  console.log(`[fetcher] Feed ${feed.name}: processing ${total} articles`)
  await Promise.all(
    tasks.map(task =>
      semaphore.run(async () => {
        try {
          await processArticle(task)
          if (task.kind === 'new') {
            fetched++
            const doneEvent: FetchProgressEvent = { type: 'article-done', feed_id: feed.id, fetched, total }
            emitProgress(doneEvent)
            onProgress?.(doneEvent)
          }
        } catch (err) {
          console.error('[fetcher] Article error:', err)
          if (task.kind === 'new') {
            fetched++
            const doneEvent: FetchProgressEvent = { type: 'article-done', feed_id: feed.id, fetched, total }
            emitProgress(doneEvent)
            onProgress?.(doneEvent)
          }
        }
      }),
    ),
  )

  const completeEvent: FetchProgressEvent = { type: 'feed-complete', feed_id: feed.id }
  markFeedDone(feed.id)
  emitProgress(completeEvent)
  onProgress?.(completeEvent)

  console.log(`[fetcher] Feed ${feed.name}: done`)
}

// --- Main entry point ---

export async function fetchAllFeeds(
  onProgress?: (event: FetchProgressEvent) => void,
): Promise<void> {
  const feeds = getEnabledFeeds()
  const semaphore = new Semaphore(CONCURRENCY)

  const allTasks: ArticleTask[] = []

  // Phase A: Fetch RSS for each feed and collect new articles (per-feed limit)
  // Track new article counts per feed for progress events
  const feedNewCounts = new Map<number, number>()

  await Promise.all(
    feeds.map(feed =>
      semaphore.run(async () => {
        try {
          const rssResult = await fetchAndParseRss(feed)
          updateFeedError(feed.id, null)
          updateFeedCacheHeaders(feed.id, rssResult.etag, rssResult.lastModified, rssResult.contentHash)

          if (rssResult.notModified) {
            const interval = feed.check_interval ?? DEFAULT_INTERVAL
            updateFeedSchedule(feed.id, sqliteFuture(interval), interval)
            console.log(`[fetcher] Feed ${feed.name}: not modified (304)`)
            feedNewCounts.set(feed.id, 0)
            return
          }

          // Compute and store adaptive interval
          {
            const empirical = computeEmpiricalInterval(rssResult.items)
            const interval = computeInterval(rssResult.httpCacheSeconds, rssResult.rssTtlSeconds, empirical)
            updateFeedSchedule(feed.id, sqliteFuture(interval), interval)
          }

          const urls = rssResult.items.map(i => i.url)
          const existing = getExistingArticleUrls(urls)

          const newItems: ArticleTask[] = rssResult.items
            .filter(item => !existing.has(item.url))
            .map(item => ({
              kind: 'new' as const,
              feed_id: feed.id,
              title: item.title,
              url: item.url,
              published_at: item.published_at,
              requires_js_challenge: !!feed.requires_js_challenge,
            }))

          allTasks.push(...newItems)
          feedNewCounts.set(feed.id, newItems.length)
        } catch (err) {
          if (err instanceof RateLimitError) {
            console.warn(`[fetcher] Feed ${feed.name}: ${err.message}`)
            updateFeedRateLimit(feed.id, err.retryAfterSeconds)
            return
          }
          const msg = errorMessage(err)
          console.error(`[fetcher] Feed ${feed.name}: ${msg}`)
          updateFeedError(feed.id, msg)
        }
      }),
    ),
  )

  // Phase B: Add retry candidates
  const retryArticles = getRetryArticles()
  for (const article of retryArticles) {
    allTasks.push({ kind: 'retry', article })
  }

  if (allTasks.length === 0) {
    console.log('[fetcher] No articles to process')
    return
  }

  const newCount = allTasks.filter(t => t.kind === 'new').length
  const retryCount = allTasks.filter(t => t.kind === 'retry').length
  console.log(
    `[fetcher] Processing ${allTasks.length} articles (${newCount} new, ${retryCount} retry)`,
  )

  // Emit feed-articles-found for each feed with new articles
  for (const [feedId, count] of feedNewCounts) {
    if (count > 0) {
      const event: FetchProgressEvent = { type: 'feed-articles-found', feed_id: feedId, total: count }
      emitProgress(event)
      onProgress?.(event)
    }
  }

  // Phase C: Process each article with semaphore
  // Per-feed counters for progress (only count 'new' articles)
  const feedFetchedCounts = new Map<number, number>()
  const processingSemaphore = new Semaphore(CONCURRENCY)
  await Promise.all(
    allTasks.map(task =>
      processingSemaphore.run(async () => {
        try {
          await processArticle(task)
        } catch (err) {
          console.error('[fetcher] Article error:', err)
        }
        if (task.kind === 'new') {
          const feedId = task.feed_id
          const prev = feedFetchedCounts.get(feedId) ?? 0
          const fetched = prev + 1
          feedFetchedCounts.set(feedId, fetched)
          const total = feedNewCounts.get(feedId) ?? 0
          const event: FetchProgressEvent = { type: 'article-done', feed_id: feedId, fetched, total }
          emitProgress(event)
          onProgress?.(event)
        }
      }),
    ),
  )

  // Emit feed-complete for each feed
  for (const [feedId, count] of feedNewCounts) {
    if (count > 0) {
      markFeedDone(feedId)
      const event: FetchProgressEvent = { type: 'feed-complete', feed_id: feedId }
      emitProgress(event)
      onProgress?.(event)
    }
  }

  console.log('[fetcher] Batch complete')
}
