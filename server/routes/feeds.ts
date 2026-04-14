import type { FastifyInstance } from 'fastify'
import type { Feed } from '../../shared/types.js'
import { z } from 'zod'
import { startSSE } from '../lib/sse.js'
import { logger } from '../logger.js'

const log = logger.child('api')
import {
  getFeeds,
  getFeedById,
  getFeedByUrl,
  createFeed,
  updateFeed,
  deleteFeed,
  bulkMoveFeedsToCategory,
  markAllSeenByFeed,
  getBookmarkCount,
  getLikeCount,
  getClipFeed,
  getFeedMetrics,
  getCategories,
  createCategory,
} from '../db.js'
import { requireJson } from '../auth.js'
import { fetchSingleFeed, discoverRssUrl } from '../fetcher.js'
import { queryRssBridge, inferCssSelectorBridge } from '../rss-bridge.js'
import { parseOpml, generateOpml } from '../opml.js'
import { NumericIdParams, parseOrBadRequest } from '../lib/validation.js'

const httpsUrl = z
  .string({ error: 'url is required' })
  .min(1, 'url is required')
  .url('must be a valid URL')
  .refine((u) => u.startsWith('https://'), { message: 'Only https:// URLs are allowed' })

const DiscoverTitleQuery = z.object({
  url: httpsUrl,
})

const CreateFeedBody = z
  .object({
    url: httpsUrl,
    name: z.string().optional(),
    category_id: z.number().nullable().optional(),
    // Phase 2: user chose "whole site" — use this exact RSS URL
    discovered_rss_url: httpsUrl.optional(),
    discovered_rss_title: z.string().optional(),
    // Phase 2: user chose "this page only" — skip to LLM inference
    force_page_selector: z.boolean().optional(),
  })
  .refine((data) => !(data.discovered_rss_url && data.force_page_selector), {
    message: 'discovered_rss_url and force_page_selector are mutually exclusive',
  })

const UpdateFeedBody = z.object({
  name: z.string().optional(),
  rss_bridge_url: z.string().nullable().optional(),
  disabled: z.number().optional(),
  category_id: z.number().nullable().optional(),
})

export async function feedRoutes(api: FastifyInstance): Promise<void> {
  api.get('/api/feeds', async (_request, reply) => {
    const feeds = getFeeds()
    const bookmark_count = getBookmarkCount()
    const like_count = getLikeCount()
    const clipFeed = getClipFeed()
    const clip_feed_id = clipFeed?.id ?? null
    reply.send({ feeds, bookmark_count, like_count, clip_feed_id })
  })

  api.get('/api/discover-title', async (request, reply) => {
    const query = parseOrBadRequest(DiscoverTitleQuery, request.query, reply)
    if (!query) return
    try {
      const { title } = await discoverRssUrl(query.url)
      reply.send({ title })
    } catch {
      reply.send({ title: null })
    }
  })

  api.post(
    '/api/feeds',
    { preHandler: [requireJson] },
    async (request, reply) => {
      const body = parseOrBadRequest(CreateFeedBody, request.body, reply)
      if (!body) return

      if (getFeedByUrl(body.url)) {
        reply.status(409).send({ error: 'Feed URL already exists' })
        return
      }

      // --- SSE starts here ---
      const sse = startSSE(reply)
      const send = sse.send

      try {
        let rssUrl: string | null = null
        let rssBridgeUrl: string | null = null
        let discoveredTitle: string | null = null
        let requiresJsChallenge = false

        if (body.discovered_rss_url) {
          // Phase 2: user chose "whole site" — use the provided RSS URL directly
          rssUrl = body.discovered_rss_url
          discoveredTitle = body.discovered_rss_title ?? null
          send({ type: 'step', step: 'rss-discovery', status: 'done', found: true })
          send({ type: 'step', step: 'rss-bridge', status: 'skipped' })
          send({ type: 'step', step: 'css-selector', status: 'skipped' })
        } else if (body.force_page_selector) {
          // Phase 2: user chose "this page only" — skip to LLM inference
          send({ type: 'step', step: 'rss-discovery', status: 'skipped' })
          send({ type: 'step', step: 'rss-bridge', status: 'skipped' })
          send({ type: 'step', step: 'css-selector', status: 'running' })
          rssBridgeUrl = await inferCssSelectorBridge(body.url)
          send({ type: 'step', step: 'css-selector', status: 'done', found: !!rssBridgeUrl })
        } else {
          // Phase 1: normal discovery flow
          send({ type: 'step', step: 'rss-discovery', status: 'running' })
          try {
            const result = await discoverRssUrl(body.url, {
              onFlareSolverr: (status, found) => {
                send({ type: 'step', step: 'flaresolverr', status: status === 'running' ? 'running' : 'done', found })
              },
            })
            rssUrl = result.rssUrl
            discoveredTitle = result.title
            if (result.usedFlareSolverr) requiresJsChallenge = true
            send({ type: 'step', step: 'rss-discovery', status: 'done', found: !!rssUrl })
          } catch {
            send({ type: 'step', step: 'rss-discovery', status: 'done', found: false })
          }

          // If RSS found, offer a choice instead of proceeding
          if (rssUrl) {
            send({ type: 'choice_needed', rss_url: rssUrl, rss_title: discoveredTitle })
            sse.end()
            return
          }

          // Step 2: RSS Bridge fallback
          send({ type: 'step', step: 'rss-bridge', status: 'running' })
          rssBridgeUrl = await queryRssBridge(body.url)
          send({ type: 'step', step: 'rss-bridge', status: 'done', found: !!rssBridgeUrl })

          // Step 3: CssSelectorBridge via LLM
          if (!rssBridgeUrl) {
            send({ type: 'step', step: 'css-selector', status: 'running' })
            rssBridgeUrl = await inferCssSelectorBridge(body.url)
            send({ type: 'step', step: 'css-selector', status: 'done', found: !!rssBridgeUrl })
          } else {
            send({ type: 'step', step: 'css-selector', status: 'skipped' })
          }
        }

        // If every strategy failed, do not create a feed.
        if (!rssUrl && !rssBridgeUrl) {
          const errorMsg = body.force_page_selector
            ? 'Could not extract content from this page'
            : 'RSS could not be detected for this URL'
          send({ type: 'error', error: errorMsg })
          sse.end()
          return
        }

        const feedName = body.name || discoveredTitle || new URL(body.url).hostname

        const feed = createFeed({
          name: feedName,
          url: body.url,
          rss_url: rssUrl,
          rss_bridge_url: rssBridgeUrl,
          category_id: body.category_id ?? null,
          requires_js_challenge: requiresJsChallenge ? 1 : 0,
        })

        // Fire-and-forget: fetch articles for the new feed
        if (feed.rss_url || feed.rss_bridge_url) {
          fetchSingleFeed(feed).catch(err => {
            log.error(`Initial fetch for ${feed.name} failed:`, err)
          })
        }

        send({ type: 'done', feed })
      } catch (err) {
        send({ type: 'error', error: err instanceof Error ? err.message : 'Unknown error' })
      }

      sse.end()
    },
  )

  api.patch(
    '/api/feeds/:id',
    { preHandler: [requireJson] },
    async (request, reply) => {
      const params = parseOrBadRequest(NumericIdParams, request.params, reply)
      if (!params) return
      const body = parseOrBadRequest(UpdateFeedBody, request.body, reply)
      if (!body) return

      const feed = updateFeed(params.id, body)
      if (!feed) {
        reply.status(404).send({ error: 'Feed not found' })
        return
      }

      const feeds = getFeeds()
      const withCounts = feeds.find(f => f.id === feed.id)
      reply.send(withCounts || feed)
    },
  )

  const BulkMoveBody = z.object({
    feed_ids: z.array(z.number()).min(1, 'feed_ids must not be empty'),
    category_id: z.number().nullable(),
  })

  api.post(
    '/api/feeds/bulk-move',
    { preHandler: [requireJson] },
    async (request, reply) => {
      const body = parseOrBadRequest(BulkMoveBody, request.body, reply)
      if (!body) return
      bulkMoveFeedsToCategory(body.feed_ids, body.category_id)
      reply.status(204).send()
    },
  )

  api.delete(
    '/api/feeds/:id',
    async (request, reply) => {
      const params = parseOrBadRequest(NumericIdParams, request.params, reply)
      if (!params) return
      const feed = getFeedById(params.id)
      if (!feed) {
        reply.status(404).send({ error: 'Feed not found' })
        return
      }
      if (feed.type === 'clip') {
        reply.status(403).send({ error: 'Cannot delete the clip feed' })
        return
      }
      const deleted = deleteFeed(params.id)
      if (!deleted) {
        reply.status(404).send({ error: 'Feed not found' })
        return
      }
      reply.status(204).send()
    },
  )

  // --- Single feed fetch (SSE) ---

  api.post(
    '/api/feeds/:id/fetch',
    async (request, reply) => {
      const params = parseOrBadRequest(NumericIdParams, request.params, reply)
      if (!params) return
      const feed = getFeedById(params.id)
      if (!feed || feed.disabled) {
        reply.status(404).send({ error: 'Feed not found or disabled' })
        return
      }

      const sse = startSSE(reply)

      await fetchSingleFeed(feed, (event) => {
        sse.send(event)
      }, { skipCache: true })

      sse.end()
    },
  )

  // --- RSS re-detection ---

  api.post(
    '/api/feeds/:id/re-detect',
    async (request, reply) => {
      const params = parseOrBadRequest(NumericIdParams, request.params, reply)
      if (!params) return
      const feed = getFeedById(params.id)
      if (!feed) {
        reply.status(404).send({ error: 'Feed not found' })
        return
      }

      const sse = startSSE(reply)

      let rssUrl: string | null = null
      let rssBridgeUrl: string | null = null

      // Step 1: RSS auto-discovery
      sse.send({ type: 'stage', stage: 'discovery' })
      try {
        const result = await discoverRssUrl(feed.url)
        rssUrl = result.rssUrl
      } catch {
        // Discovery failed
      }
      sse.send({ type: 'stage-done', stage: 'discovery', found: !!rssUrl })

      // Step 2: RSS Bridge fallback
      if (!rssUrl) {
        sse.send({ type: 'stage', stage: 'bridge' })
        rssBridgeUrl = await queryRssBridge(feed.url)
        sse.send({ type: 'stage-done', stage: 'bridge', found: !!rssBridgeUrl })
      }

      // Step 3: CssSelectorBridge via LLM
      if (!rssUrl && !rssBridgeUrl) {
        sse.send({ type: 'stage', stage: 'bridge-llm' })
        rssBridgeUrl = await inferCssSelectorBridge(feed.url)
        sse.send({ type: 'stage-done', stage: 'bridge-llm', found: !!rssBridgeUrl })
      }

      // Update feed with new URLs
      updateFeed(params.id, {
        rss_url: rssUrl,
        rss_bridge_url: rssBridgeUrl,
      })

      // Fire-and-forget: fetch articles with updated config
      const refreshedFeed = getFeedById(params.id)
      if (refreshedFeed && (rssUrl || rssBridgeUrl)) {
        fetchSingleFeed(refreshedFeed).catch(err => {
          log.error(`Re-detect fetch for ${refreshedFeed.name} failed:`, err)
        })
      }

      sse.send({ type: 'done', rss_url: rssUrl, rss_bridge_url: rssBridgeUrl })
      sse.end()
    },
  )

  api.get(
    '/api/feeds/:id/metrics',
    async (request, reply) => {
      const params = parseOrBadRequest(NumericIdParams, request.params, reply)
      if (!params) return
      const feed = getFeedById(params.id)
      if (!feed) {
        reply.status(404).send({ error: 'Feed not found' })
        return
      }
      const metrics = getFeedMetrics(params.id)
      reply.send(metrics ?? { avg_content_length: null })
    },
  )

  api.post(
    '/api/feeds/:id/mark-all-seen',
    async (request, reply) => {
      const params = parseOrBadRequest(NumericIdParams, request.params, reply)
      if (!params) return
      const result = markAllSeenByFeed(params.id)
      reply.send(result)
    },
  )

  // --- OPML export ---

  api.get('/api/opml', async (_request, reply) => {
    const feeds = getFeeds()
    const categories = getCategories()
    const xml = generateOpml(feeds, categories)
    reply
      .header('Content-Type', 'application/xml')
      .header('Content-Disposition', 'attachment; filename="oksskolten.opml"')
      .send(xml)
  })

  // --- OPML preview ---

  api.post('/api/opml/preview', async (request, reply) => {
    const file = await request.file()
    if (!file) {
      reply.status(400).send({ error: 'No file uploaded' })
      return
    }

    const buffer = await file.toBuffer()
    const xml = buffer.toString('utf-8')

    let parsed
    try {
      parsed = parseOpml(xml)
    } catch (err) {
      reply.status(400).send({ error: err instanceof Error ? err.message : 'Invalid OPML' })
      return
    }

    const feeds = parsed.map((entry) => {
      const existing = getFeedByUrl(entry.url)
      return {
        name: entry.name,
        url: entry.url,
        rssUrl: entry.rssUrl,
        categoryName: entry.categoryName,
        isDuplicate: !!existing,
      }
    })

    reply.send({
      feeds,
      totalCount: feeds.length,
      duplicateCount: feeds.filter((f) => f.isDuplicate).length,
    })
  })

  // --- OPML import ---

  api.post('/api/opml', async (request, reply) => {
    const file = await request.file()
    if (!file) {
      reply.status(400).send({ error: 'No file uploaded' })
      return
    }

    const buffer = await file.toBuffer()
    const xml = buffer.toString('utf-8')

    let parsed
    try {
      parsed = parseOpml(xml)
    } catch (err) {
      reply.status(400).send({ error: err instanceof Error ? err.message : 'Invalid OPML' })
      return
    }

    // Filter by selectedUrls if provided
    const selectedUrlsRaw = file.fields?.selectedUrls
    let selectedUrlSet: Set<string> | null = null
    if (selectedUrlsRaw && typeof selectedUrlsRaw === 'object' && 'value' in selectedUrlsRaw) {
      const urls: string[] = JSON.parse((selectedUrlsRaw as { value: string }).value)
      selectedUrlSet = new Set(urls)
    }

    const entries = selectedUrlSet
      ? parsed.filter((entry) => selectedUrlSet!.has(entry.url))
      : parsed

    let imported = 0
    let skipped = 0
    const errors: string[] = []
    const importedFeeds: Feed[] = []

    // Pre-fetch existing categories
    const existingCategories = getCategories()
    const categoryByName = new Map(existingCategories.map(c => [c.name.toLowerCase(), c]))

    for (const entry of entries) {
      try {
        // Check for duplicate by url or rss_url
        if (getFeedByUrl(entry.url)) {
          skipped++
          continue
        }

        // Resolve category
        let categoryId: number | null = null
        if (entry.categoryName) {
          const existing = categoryByName.get(entry.categoryName.toLowerCase())
          if (existing) {
            categoryId = existing.id
          } else {
            const created = createCategory(entry.categoryName)
            categoryByName.set(entry.categoryName.toLowerCase(), created)
            categoryId = created.id
          }
        }

        const feed = createFeed({
          name: entry.name,
          url: entry.url,
          rss_url: entry.rssUrl,
          category_id: categoryId,
        })
        importedFeeds.push(feed)
        imported++
      } catch (err) {
        errors.push(`${entry.name}: ${err instanceof Error ? err.message : 'Unknown error'}`)
      }
    }

    // Fire-and-forget: fetch articles for newly imported feeds
    for (const feed of importedFeeds) {
      if (feed.rss_url) {
        fetchSingleFeed(feed).catch(err => {
          log.error(`OPML: Initial fetch for ${feed.name} failed:`, err)
        })
      }
    }

    reply.send({ imported, skipped, errors })
  })
}
