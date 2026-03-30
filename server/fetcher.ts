import {
  getEnabledFeeds,
  getExistingArticlesByUrls,
  getRetryArticles,
  getRetryStats,
  insertArticle,
  updateArticleContent,
  updateArticleKindIfMissing,
  updateFeedError,
  updateFeedRateLimit,
  updateFeedCacheHeaders,
  updateFeedSchedule,
  type Feed,
  type Article,
} from './db.js'

import { Semaphore, CONCURRENCY, errorMessage } from './fetcher/util.js'
import { detectAndStoreSimilarArticles } from './similarity.js'
import { type FetchProgressEvent, emitProgress, markFeedDone } from './fetcher/progress.js'
import { fetchFullText, isBotBlockPage, convertHtmlToMarkdown, markdownToExcerpt, extractFirstVideoPoster, MIN_EXTRACTED_LENGTH } from './fetcher/content.js'
import { type FetchRssResult, fetchAndParseRss, RateLimitError } from './fetcher/rss.js'
import { computeInterval, computeEmpiricalInterval, sqliteFuture, DEFAULT_INTERVAL } from './fetcher/schedule.js'
import { detectLanguage } from './fetcher/ai.js'
import { logger } from './logger.js'
import type { ArticleKind } from '../shared/article-kind.js'

const log = logger.child('fetcher')

// --- Re-exports (preserve existing import sites) ---
export { normalizeDate } from './fetcher/util.js'
export { type FetchProgressEvent, fetchProgress, getFeedState } from './fetcher/progress.js'
export { discoverRssUrl } from './fetcher/rss.js'
export { detectLanguage, summarizeArticle, streamSummarizeArticle, translateArticle, streamTranslateArticle } from './fetcher/ai.js'
export type { AiTextResult, AiBillingMode } from './fetcher/ai.js'

// --- Article content fetching (shared by feed pipeline & clip) ---

export interface FetchedContent {
  fullText: string | null
  ogImage: string | null
  excerpt: string | null
  lang: string | null
  lastError: string | null
  /** Title extracted by fetchFullText (from OGP etc.) */
  title: string | null
}

export async function fetchArticleContent(
  url: string,
  options?: {
    requiresJsChallenge?: boolean
    /** CSS Bridge listing-page excerpt, used as fullText fallback */
    listingExcerpt?: string
    /** Existing article data for retry (skips fetch if full_text present) */
    existingArticle?: { full_text: string | null; og_image: string | null; lang: string | null }
  },
): Promise<FetchedContent> {
  let fullText: string | null = null
  let ogImage: string | null = null
  let excerpt: string | null = null
  let lang: string | null = null
  let lastError: string | null = null
  let title: string | null = null

  const existing = options?.existingArticle

  // Step 1: Fetch full text (skip if retry article already has content)
  // For anchor-link articles (URL has # fragment), the page is shared across
  // multiple items, so page fetch would return irrelevant content. Use RSS
  // inline content (content:encoded) directly if available.
  const isAnchorLink = url.includes('#')

  if (existing?.full_text) {
    fullText = existing.full_text
    ogImage = existing.og_image
  } else if (isAnchorLink && options?.listingExcerpt) {
    fullText = convertHtmlToMarkdown(options.listingExcerpt, { baseUrl: url })
    excerpt = markdownToExcerpt(fullText)
  } else {
    try {
      const result = await fetchFullText(url, { requiresJsChallenge: options?.requiresJsChallenge })
      fullText = result.fullText
      ogImage = result.ogImage
      excerpt = result.excerpt
      title = result.title
    } catch (err) {
      lastError = `fetchFullText: ${errorMessage(err)}`
    }
  }

  // Fallback: use RSS inline content when page fetch failed, returned bot-block page,
  // or extracted text is too short (e.g. SPA sites where content is in display:none for SEO).
  // This is the last resort after fetchFullText and its internal FlareSolverr retry
  // (which also uses MIN_EXTRACTED_LENGTH) have both failed to produce enough content.
  if (options?.listingExcerpt) {
    const extractedLen = fullText?.replace(/\s+/g, ' ').trim().length ?? 0
    const shouldFallback = !fullText || isBotBlockPage(fullText) || extractedLen < MIN_EXTRACTED_LENGTH
    if (shouldFallback) {
      const md = convertHtmlToMarkdown(options.listingExcerpt, { baseUrl: url })
      const mdLen = md.replace(/\s+/g, ' ').trim().length
      // Only use RSS content if it's more substantial than what we extracted
      if (mdLen > extractedLen) {
        log.info({ url, extractedLen, rssLen: mdLen }, 'using RSS feed content as fallback')
        fullText = md
        excerpt = markdownToExcerpt(md)
        lastError = null
      }
    }
  }

  if (!ogImage && options?.listingExcerpt) {
    ogImage = extractFirstVideoPoster(options.listingExcerpt, url)
  }

  // Step 2: Detect language (local, no API call)
  if (fullText && !(existing?.lang)) {
    lang = detectLanguage(fullText)
  } else if (existing) {
    lang = existing.lang
  }

  return { fullText, ogImage, excerpt, lang, lastError, title }
}

// --- Article processing ---

interface NewArticle {
  kind: 'new'
  feed_id: number
  title: string
  url: string
  article_kind?: ArticleKind | null
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

/** Returns true if the retry article still has an error after processing. */
async function processArticle(task: ArticleTask): Promise<boolean> {
  const articleUrl = task.kind === 'new' ? task.url : task.article.url

  const content = await fetchArticleContent(articleUrl, {
    requiresJsChallenge: task.kind === 'new' ? task.requires_js_challenge : undefined,
    listingExcerpt: task.kind === 'new' ? task.excerpt : undefined,
    existingArticle: task.kind === 'retry' ? task.article : undefined,
  })

  const effectiveLang = content.lang || (task.kind === 'retry' ? task.article.lang : null)

  // Persist
  if (task.kind === 'new') {
    try {
      const articleId = insertArticle({
        feed_id: task.feed_id,
        title: task.title,
        url: task.url,
        article_kind: task.article_kind ?? null,
        published_at: task.published_at,
        lang: effectiveLang,
        full_text: content.fullText,
        full_text_translated: null,
        summary: null,
        excerpt: content.excerpt,
        og_image: content.ogImage,
        last_error: content.lastError,
      })
      // Fire-and-forget: detect similar articles asynchronously
      void detectAndStoreSimilarArticles(articleId, task.title, task.feed_id, task.published_at)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (!msg.includes('UNIQUE constraint failed')) {
        log.warn(`insertArticle failed for ${task.url}: ${msg}`)
      }
    }
  } else {
    updateArticleContent(task.article.id, {
      lang: effectiveLang,
      full_text: content.fullText,
      excerpt: content.excerpt,
      og_image: content.ogImage,
      last_error: content.lastError,
    })
  }
  return !!content.lastError
}

function backfillExistingArticleKinds(
  rssResult: FetchRssResult,
  existingArticles: Map<string, { id: number; article_kind: ArticleKind | null }>,
): void {
  for (const item of rssResult.items) {
    if (!item.article_kind) continue
    const existing = existingArticles.get(item.url)
    if (!existing || existing.article_kind) continue
    updateArticleKindIfMissing(existing.id, item.article_kind)
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
      log.warn(`Feed ${feed.name}: ${err.message}`)
      updateFeedRateLimit(feed.id, err.retryAfterSeconds)
      return
    }
    const msg = errorMessage(err)
    log.error(`Feed ${feed.name}: ${msg}`)
    updateFeedError(feed.id, msg)
    return
  }

  if (rssResult.notModified) {
    // Reschedule using stored interval (or default)
    const interval = feed.check_interval ?? DEFAULT_INTERVAL
    updateFeedSchedule(feed.id, sqliteFuture(interval), interval)
    log.info(`Feed ${feed.name}: not modified (304)`)
    return
  }

  // Compute and store adaptive interval
  {
    const empirical = computeEmpiricalInterval(rssResult.items)
    const interval = computeInterval(rssResult.httpCacheSeconds, rssResult.rssTtlSeconds, empirical)
    updateFeedSchedule(feed.id, sqliteFuture(interval), interval)
  }

  const urls = rssResult.items.map(i => i.url)
  const existing = getExistingArticlesByUrls(urls)
  backfillExistingArticleKinds(rssResult, existing)
  const tasks: ArticleTask[] = rssResult.items
    .filter(item => !existing.has(item.url))
    .map(item => ({
      kind: 'new' as const,
      feed_id: feed.id,
      title: item.title,
      url: item.url,
      article_kind: item.article_kind ?? null,
      published_at: item.published_at,
      requires_js_challenge: !!feed.requires_js_challenge,
      excerpt: item.excerpt,
    }))

  if (tasks.length === 0) {
    log.info(`Feed ${feed.name}: no new articles`)
    return
  }

  const total = tasks.length
  let fetched = 0

  const foundEvent: FetchProgressEvent = { type: 'feed-articles-found', feed_id: feed.id, total }
  emitProgress(foundEvent)
  onProgress?.(foundEvent)

  log.info(`Feed ${feed.name}: processing ${total} articles`)
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
          log.error('Article error:', err)
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

  log.info(`Feed ${feed.name}: done`)
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
            log.info(`Feed ${feed.name}: not modified (304)`)
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
          const existing = getExistingArticlesByUrls(urls)
          backfillExistingArticleKinds(rssResult, existing)

          const newItems: ArticleTask[] = rssResult.items
            .filter(item => !existing.has(item.url))
            .map(item => ({
              kind: 'new' as const,
              feed_id: feed.id,
              title: item.title,
              url: item.url,
              article_kind: item.article_kind ?? null,
              published_at: item.published_at,
              requires_js_challenge: !!feed.requires_js_challenge,
              excerpt: item.excerpt,
            }))

          allTasks.push(...newItems)
          feedNewCounts.set(feed.id, newItems.length)
        } catch (err) {
          if (err instanceof RateLimitError) {
            log.warn(`Feed ${feed.name}: ${err.message}`)
            updateFeedRateLimit(feed.id, err.retryAfterSeconds)
            return
          }
          const msg = errorMessage(err)
          log.error(`Feed ${feed.name}: ${msg}`)
          updateFeedError(feed.id, msg)
        }
      }),
    ),
  )

  // Phase B: Add retry candidates with backoff
  const retryStats = getRetryStats()
  if (retryStats.eligible > 0 || retryStats.backoff_waiting > 0 || retryStats.exceeded > 0) {
    log.info(`Retry: ${retryStats.eligible} eligible, ${retryStats.backoff_waiting} backoff-waiting, ${retryStats.exceeded} exceeded max attempts`)
  }
  const retryArticles = getRetryArticles()
  for (const article of retryArticles) {
    updateArticleContent(article.id, { last_retry_at: new Date().toISOString() })
    allTasks.push({ kind: 'retry', article })
  }

  if (allTasks.length === 0) {
    log.info('No articles to process')
    return
  }

  const newCount = allTasks.filter(t => t.kind === 'new').length
  const retryCount = allTasks.filter(t => t.kind === 'retry').length
  log.info(
    `Processing ${allTasks.length} articles (${newCount} new, ${retryCount} retry)`,
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
        let retryFailed = false
        try {
          retryFailed = await processArticle(task)
        } catch (err) {
          log.error('Article error:', err)
          retryFailed = true
          if (task.kind === 'retry') {
            const msg = err instanceof Error ? err.message : String(err)
            updateArticleContent(task.article.id, {
              last_error: msg,
            })
          }
        }
        // Single place where retry_count is incremented — covers both
        // the returned-error path and the thrown-exception path.
        if (task.kind === 'retry' && retryFailed) {
          updateArticleContent(task.article.id, {
            retry_count: (task.article.retry_count ?? 0) + 1,
          })
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

  log.info('Batch complete')
}
