import { createHash } from 'node:crypto'
import { JSDOM } from 'jsdom'
import type { Feed } from '../db.js'
import { normalizeDate } from './util.js'
import { fetchHtml, decodeResponse, USER_AGENT, DEFAULT_TIMEOUT, DISCOVERY_TIMEOUT, PROBE_TIMEOUT } from './http.js'
import { safeFetch } from './ssrf.js'
import { fetchViaFlareSolverr } from './flaresolverr.js'
import { parseHttpCacheInterval, parseRssTtl } from './schedule.js'
import { cleanUrl } from './url-cleaner.js'
import {
  isCssSelectorBridgeUrl,
  stripCustomBridgeParams,
  fetchCssSelectorViaFlareSolverr,
  assignCssBridgePseudoDates,
  fixGenericTitlesAndEnrichExcerpts,
} from './css-bridge.js'
import { detectArticleKindForFeed, type ArticleKind } from '../../shared/article-kind.js'

export interface RssItem {
  title: string
  url: string
  published_at: string | null
  article_kind?: ArticleKind | null
  excerpt?: string
}

export interface FetchRssResult {
  items: RssItem[]
  notModified: boolean
  etag: string | null
  lastModified: string | null
  contentHash: string | null
  httpCacheSeconds: number | null
  rssTtlSeconds: number | null
}

interface FeedMetadata {
  title: string | null
  iconUrl: string | null
}

type FeedSource = Pick<Feed, 'url' | 'rss_url' | 'rss_bridge_url'>

export class RateLimitError extends Error {
  readonly retryAfterSeconds: number | null
  constructor(status: number, retryAfter: string | null) {
    let seconds: number | null = null
    if (retryAfter) {
      const parsed = parseInt(retryAfter, 10)
      if (!isNaN(parsed)) {
        seconds = parsed
      } else {
        const date = new Date(retryAfter).getTime()
        if (!isNaN(date)) {
          seconds = Math.max(0, Math.floor((date - Date.now()) / 1000))
        }
      }
    }
    super(`HTTP ${status} (rate limited${seconds ? `, retry after ${seconds}s` : ''})`)
    this.retryAfterSeconds = seconds
  }
}

function throwIfRateLimited(res: Response): void {
  if (res.status === 429 || res.status === 503) {
    throw new RateLimitError(res.status, res.headers.get('retry-after'))
  }
}

const RSS_BRIDGE_URL = process.env.RSS_BRIDGE_URL

/**
 * Decode HTML entities in a string.
 */
function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
}

/**
 * Extract usable RSS/Atom XML from a FlareSolverr response body.
 * FlareSolverr returns Chromium-rendered content which may be:
 *   1. Raw XML (if extractXmlFromBrowserViewer succeeded in flaresolverr.ts)
 *   2. Chromium HTML with HTML-encoded XML entities (&lt;rss&gt; etc.)
 *   3. Chromium HTML wrapping raw XML in <pre> tags
 *   4. Unrelated HTML (e.g. a redirect to a non-feed page)
 */
function extractRssFromFlareSolverr(body: string): string {
  // Case 1: already raw XML
  if (/^\s*<(\?xml|rss|feed)\b/.test(body)) return body

  // Case 2: HTML-encoded XML — decode and extract just the RSS/Atom root element
  if (body.includes('&lt;rss') || body.includes('&lt;feed') || body.includes('&lt;?xml')) {
    const decoded = decodeHtmlEntities(body)
    return extractXmlRoot(decoded) || decoded
  }

  // Case 3: Chromium might wrap raw XML in <body><pre>...</pre>
  const preMatch = body.match(/<pre[^>]*>([\s\S]*?)<\/pre>/)
  if (preMatch) {
    const inner = decodeHtmlEntities(preMatch[1])
    if (/^\s*<(\?xml|rss|feed)\b/.test(inner)) {
      return extractXmlRoot(inner) || inner
    }
  }

  // Case 4: body contains raw <rss> or <feed> embedded in HTML
  const xmlRoot = extractXmlRoot(body)
  if (xmlRoot) return xmlRoot

  return body
}

/**
 * Extract the RSS/Atom root element from a string that may contain surrounding HTML.
 * Returns the matched XML string or null.
 */
function extractXmlRoot(s: string): string | null {
  // Try <?xml...?> preamble + RSS/Atom
  const xmlDeclMatch = s.match(/<\?xml[\s\S]*?<\/(?:rss|feed)>/)
  if (xmlDeclMatch) return xmlDeclMatch[0]

  // Try <rss ...>...</rss>
  const rssMatch = s.match(/<rss[\s>][\s\S]*<\/rss>/)
  if (rssMatch) return rssMatch[0]

  // Try <feed ...>...</feed> (Atom)
  const feedMatch = s.match(/<feed[\s>][\s\S]*<\/feed>/)
  if (feedMatch) return feedMatch[0]

  return null
}

function textOf(val: unknown): string {
  if (typeof val === 'string') return val
  if (val && typeof val === 'object' && '#text' in val) return String((val as Record<string, unknown>)['#text'])
  return ''
}

function firstNonEmpty(...values: (string | null | undefined)[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

function resolveFeedAssetUrl(rawUrl: string | null | undefined, baseUrl: string): string | null {
  if (!rawUrl) return null
  try {
    return new URL(rawUrl, baseUrl).toString()
  } catch {
    return null
  }
}

async function parseFeedMetadata(xml: string, feedUrl: string): Promise<FeedMetadata> {
  let title: string | null = null
  let iconUrl: string | null = null

  try {
    const { parseFeed } = await import('feedsmith')
    const parsed = parseFeed(xml) as Record<string, unknown>
    const feed = parsed.feed as Record<string, unknown> | undefined
    title = firstNonEmpty(
      typeof parsed.title === 'string' ? parsed.title : null,
      typeof feed?.title === 'string' ? feed.title : null,
    )

    const image = feed?.image as Record<string, unknown> | string | undefined
    const imageUrl = typeof image === 'string'
      ? image
      : typeof image?.url === 'string'
        ? image.url
        : null
    iconUrl = resolveFeedAssetUrl(imageUrl, feedUrl)
  } catch {
    // feedsmith failed, fall through to fast-xml-parser
  }

  const needsFallback = !title || !iconUrl
  if (!needsFallback) return { title, iconUrl }

  const { XMLParser } = await import('fast-xml-parser')
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' })
  const doc = parser.parse(xml)

  const rssChannel = doc?.rss?.channel
  const atomFeed = doc?.feed
  const fallbackTitle = firstNonEmpty(
    textOf(rssChannel?.title),
    textOf(atomFeed?.title),
  )
  const fallbackIcon = firstNonEmpty(
    textOf(rssChannel?.image?.url),
    textOf(atomFeed?.logo),
    textOf(atomFeed?.icon),
  )

  return {
    title: title || fallbackTitle,
    iconUrl: iconUrl || resolveFeedAssetUrl(fallbackIcon, feedUrl),
  }
}

export async function fetchAndParseRss(feed: Feed, opts?: { skipCache?: boolean }): Promise<FetchRssResult> {
  const skipCache = opts?.skipCache ?? false
  const rssUrl = feed.rss_url || feed.rss_bridge_url
  if (!rssUrl) throw new Error('No RSS URL')

  const isCssBridge = isCssSelectorBridgeUrl(rssUrl)

  let xml: string
  let responseEtag: string | null = null
  let responseLastModified: string | null = null
  let responseHeaders: Headers | null = null

  if (feed.requires_js_challenge) {
    // Site requires JS challenge — go straight to FlareSolverr (no conditional request support)
    const flare = await fetchViaFlareSolverr(rssUrl)
    if (!flare) throw new Error('FlareSolverr failed')
    xml = extractRssFromFlareSolverr(flare.body)
  } else {
    const isRssBridgeUrl = RSS_BRIDGE_URL && rssUrl.startsWith(RSS_BRIDGE_URL)
    if (isRssBridgeUrl) {
      // RSS Bridge internal URL: use plain fetch (no SSRF check needed)
      // Strip title_selector/content_selector — these are used by our own code,
      // not recognized by RSS-Bridge's CssSelectorBridge.
      const bridgeFetchUrl = isCssBridge ? stripCustomBridgeParams(rssUrl) : rssUrl
      const headers: Record<string, string> = { 'User-Agent': USER_AGENT }
      if (!skipCache && feed.etag) headers['If-None-Match'] = feed.etag
      if (!skipCache && feed.last_modified) headers['If-Modified-Since'] = feed.last_modified

      const res = await fetch(bridgeFetchUrl, {
        headers,
        signal: AbortSignal.timeout(DISCOVERY_TIMEOUT),
      })

      if (res.status === 304) {
        return { items: [], notModified: true, etag: feed.etag, lastModified: feed.last_modified, contentHash: feed.last_content_hash, httpCacheSeconds: null, rssTtlSeconds: null }
      }

      responseEtag = res.headers.get('etag')
      responseLastModified = res.headers.get('last-modified')
      responseHeaders = res.headers

      if (!res.ok) {
        throwIfRateLimited(res)
        if (isCssBridge) {
          const items = cleanItems(assignCssBridgePseudoDates(await fetchCssSelectorViaFlareSolverr(rssUrl), rssUrl))
          return { items, notModified: false, etag: responseEtag, lastModified: responseLastModified, contentHash: null, httpCacheSeconds: null, rssTtlSeconds: null }
        }
        const flare = await fetchViaFlareSolverr(rssUrl)
        if (!flare) throw new Error(`HTTP ${res.status}`)
        xml = extractRssFromFlareSolverr(flare.body)
      } else {
        xml = await decodeResponse(res)
      }
    } else {
      // External URL: use safeFetch with conditional headers
      const headers: Record<string, string> = { 'User-Agent': USER_AGENT }
      if (!skipCache && feed.etag) headers['If-None-Match'] = feed.etag
      if (!skipCache && feed.last_modified) headers['If-Modified-Since'] = feed.last_modified

      try {
        const res = await safeFetch(rssUrl, {
          headers,
          signal: AbortSignal.timeout(DEFAULT_TIMEOUT),
        })

        if (res.status === 304) {
          return { items: [], notModified: true, etag: feed.etag, lastModified: feed.last_modified, contentHash: feed.last_content_hash, httpCacheSeconds: null, rssTtlSeconds: null }
        }

        responseEtag = res.headers.get('etag')
        responseLastModified = res.headers.get('last-modified')
        responseHeaders = res.headers

        if (!res.ok) {
          throwIfRateLimited(res)
          // Non-200: try FlareSolverr fallback (no conditional request support)
          const flare = await fetchViaFlareSolverr(rssUrl)
          if (!flare) throw new Error(`HTTP ${res.status}`)
          xml = extractRssFromFlareSolverr(flare.body)
        } else {
          xml = await decodeResponse(res)
        }
      } catch (err) {
        if (isCssBridge) {
          const items = cleanItems(assignCssBridgePseudoDates(await fetchCssSelectorViaFlareSolverr(rssUrl), rssUrl))
          return { items, notModified: false, etag: null, lastModified: null, contentHash: null, httpCacheSeconds: null, rssTtlSeconds: null }
        }
        // Network-level failure (ECONNRESET, DNS, timeout, etc.) — try FlareSolverr
        const flare = await fetchViaFlareSolverr(rssUrl)
        if (!flare) throw err
        xml = extractRssFromFlareSolverr(flare.body)
      }
    }
  }

  // Content hash check: skip parsing if body is identical to last fetch
  const contentHash = createHash('sha256').update(xml).digest('hex')
  const httpCacheSeconds = responseHeaders ? parseHttpCacheInterval(responseHeaders) : null
  const rssTtlSeconds = parseRssTtl(xml)

  if (!skipCache && feed.last_content_hash && feed.last_content_hash === contentHash) {
    return { items: [], notModified: true, etag: responseEtag, lastModified: responseLastModified, contentHash, httpCacheSeconds, rssTtlSeconds }
  }

  const result = { notModified: false as const, etag: responseEtag, lastModified: responseLastModified, contentHash, httpCacheSeconds, rssTtlSeconds }

  // Parse XML and collect items — wrapped in try/catch for Fallback C
  let items: RssItem[]
  try {
    items = await parseRssXml(feed, xml)
  } catch (err) {
    // Fallback C: CssSelectorBridge parse failure → FlareSolverr direct scrape
    if (isCssBridge) {
      return { ...result, items: cleanItems(assignCssBridgePseudoDates(await fetchCssSelectorViaFlareSolverr(rssUrl), rssUrl)) }
    }
    throw err
  }

  // Fallback B: CssSelectorBridge returned 0 items → FlareSolverr direct scrape
  if (items.length === 0 && isCssBridge) {
    return { ...result, items: cleanItems(assignCssBridgePseudoDates(await fetchCssSelectorViaFlareSolverr(rssUrl), rssUrl)) }
  }

  if (!isCssBridge) return { ...result, items: cleanItems(items) }

  // CssSelectorBridge: fix generic titles + enrich excerpts, then assign pseudo dates
  items = await fixGenericTitlesAndEnrichExcerpts(items, rssUrl)
  return { ...result, items: cleanItems(assignCssBridgePseudoDates(items, rssUrl)) }
}

const RSS_BRIDGE_ERROR_RE = /^Bridge returned error/i

function cleanItems(items: RssItem[]): RssItem[] {
  return items
    .filter(item => !RSS_BRIDGE_ERROR_RE.test(item.title))
    .map(item => ({ ...item, url: cleanUrl(item.url) }))
}

function buildRssItem(
  feed: FeedSource,
  input: {
    title: string
    url: string
    published_at: string | null
    rawExcerpt?: string
  },
): RssItem {
  return {
    title: input.title,
    url: input.url,
    published_at: input.published_at,
    article_kind: detectArticleKindForFeed(feed, { title: input.title, rawExcerpt: input.rawExcerpt }),
    ...(input.rawExcerpt ? { excerpt: input.rawExcerpt } : {}),
  }
}

async function parseRssXml(feed: FeedSource, xml: string): Promise<RssItem[]> {
  // Try feedsmith first
  try {
    const { parseFeed } = await import('feedsmith')
    const parsed = parseFeed(xml) as Record<string, unknown>
    const parsedFeed = parsed.feed as Record<string, unknown> | undefined
    const items = (parsed.items ?? parsed.entries ?? parsedFeed?.items ?? parsedFeed?.entries) as Record<string, unknown>[] | undefined
    if (items && items.length > 0) {
      return items
        .filter((item: Record<string, unknown>) => {
          if (item.url || item.link) return true
          // feedsmith puts Atom <link> elements in a links[] array
          const links = item.links as { href?: string; rel?: string }[] | undefined
          if (links?.length) return true
          // Only use id as URL when it looks like an HTTP URL
          const id = item.id as string | undefined
          return id ? /^https?:\/\//i.test(id) : false
        })
        .map((item: Record<string, unknown>) => {
          let url = (item.url || item.link) as string | undefined
          if (!url) {
            // Extract URL from feedsmith links[] array (prefer rel=alternate)
            const links = item.links as { href?: string; rel?: string }[] | undefined
            if (links?.length) {
              const alt = links.find(l => l.rel === 'alternate')
              url = alt?.href || links[0]?.href
            }
          }
          const rawExcerpt = item.content_encoded || item['content:encoded'] || item.content || item.description || item.summary
          const excerpt = typeof rawExcerpt === 'string' ? rawExcerpt : (rawExcerpt && typeof rawExcerpt === 'object' && 'value' in rawExcerpt ? String((rawExcerpt as Record<string, unknown>).value) : undefined)
          return buildRssItem(feed, {
            title: (item.title as string) || 'Untitled',
            url: (url || item.id) as string,
            published_at: normalizeDate(
              (item.published || item.updated || item.date || item.pubDate || (item.dc as Record<string, unknown>)?.date) as string | undefined,
            ),
            rawExcerpt: excerpt,
          })
        })
    }
  } catch {
    // feedsmith failed, fall through to fast-xml-parser
  }

  // Fallback: fast-xml-parser
  const { XMLParser } = await import('fast-xml-parser')
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' })
  const doc = parser.parse(xml)

  // RSS 2.0
  const channel = doc?.rss?.channel
  if (channel?.item) {
    const items = Array.isArray(channel.item) ? channel.item : [channel.item]
    return items
      .map((item: Record<string, unknown>) => {
        const excerpt = textOf(item['content:encoded']) || textOf(item.description)
        return buildRssItem(feed, {
          title: textOf(item.title) || 'Untitled',
          url: (item.link || item.guid || '') as string,
          published_at: normalizeDate(item.pubDate as string | undefined),
          rawExcerpt: excerpt,
        })
      })
      .filter((item: RssItem) => item.url)
  }

  // Atom
  const atomFeed = doc?.feed
  if (atomFeed?.entry) {
    const entries = Array.isArray(atomFeed.entry) ? atomFeed.entry : [atomFeed.entry]
    return entries
      .map((entry: Record<string, unknown>) => {
        const link = Array.isArray(entry.link)
          ? (entry.link as Record<string, string>[]).find(l => l['@_rel'] === 'alternate')?.['@_href'] ||
            (entry.link as Record<string, string>[])[0]?.['@_href']
          : (entry.link as Record<string, string>)?.['@_href'] || (entry.link as string)
        const id = entry.id as string | undefined
        const effectiveUrl = link || (id && /^https?:\/\//i.test(id) ? id : '') || ''
        const excerpt = textOf(entry.content) || textOf(entry.summary)
        return buildRssItem(feed, {
          title: textOf(entry.title) || 'Untitled',
          url: effectiveUrl,
          published_at: normalizeDate(
            (entry.published || entry.updated) as string | undefined,
          ),
          rawExcerpt: excerpt,
        })
      })
      .filter((item: RssItem) => item.url)
  }

  // RSS 1.0 (RDF)
  const rdf = doc?.['rdf:RDF']
  const rdfItem = rdf?.item
  if (rdfItem) {
    const items = Array.isArray(rdfItem) ? rdfItem : [rdfItem]
    return items
      .map((item: Record<string, unknown>) => buildRssItem(feed, {
        title: textOf(item.title) || 'Untitled',
        url: (item.link || item['@_rdf:about'] || '') as string,
        published_at: normalizeDate((item['dc:date'] ?? item.pubDate) as string | undefined),
        rawExcerpt: textOf(item.description),
      }))
      .filter((item: RssItem) => item.url)
  }

  throw new Error('Could not parse RSS/Atom feed')
}

async function fetchFeedMetadata(rssUrl: string): Promise<FeedMetadata> {
  try {
    const { html: xml } = await fetchHtml(rssUrl, { timeout: DISCOVERY_TIMEOUT })
    return parseFeedMetadata(xml, rssUrl)
  } catch {
    return { title: null, iconUrl: null }
  }
}

export interface DiscoverCallbacks {
  onFlareSolverr?: (status: 'running' | 'done', found?: boolean) => void
}

export async function discoverRssUrl(blogUrl: string, callbacks?: DiscoverCallbacks): Promise<{ rssUrl: string | null; title: string | null; iconUrl: string | null; usedFlareSolverr: boolean }> {
  let rssUrl: string | null = null
  let pageTitle: string | null = null
  let usedFlareSolverr = false

  // Step 1: Fetch page, check if it's a direct feed, otherwise look for <link rel="alternate">
  try {
    const result = await fetchHtml(blogUrl, { timeout: DISCOVERY_TIMEOUT })
    usedFlareSolverr = result.usedFlareSolverr
    if (result.usedFlareSolverr) callbacks?.onFlareSolverr?.('running')

    // If the URL itself is an RSS/Atom feed, return it directly
    const ct = result.contentType
    if (ct.includes('xml') || ct.includes('atom') || ct.includes('rss')) {
      if (result.usedFlareSolverr) callbacks?.onFlareSolverr?.('done', true)
      const metadata = await fetchFeedMetadata(blogUrl)
      return { rssUrl: blogUrl, title: metadata.title, iconUrl: metadata.iconUrl, usedFlareSolverr }
    }

    // Otherwise treat as HTML and discover feed links
    const dom = new JSDOM(result.html, { url: blogUrl })
    const doc = dom.window.document

    pageTitle = doc.querySelector('title')?.textContent?.trim() || null

    const links = doc.querySelectorAll(
      'link[rel="alternate"][type="application/rss+xml"], link[rel="alternate"][type="application/atom+xml"]',
    )
    for (const link of links) {
      const href = link.getAttribute('href')
      if (href) {
        rssUrl = new URL(href, blogUrl).toString()
        break
      }
    }

    if (result.usedFlareSolverr) callbacks?.onFlareSolverr?.('done', !!rssUrl)
  } catch {
    // Page fetch failed, continue to path probing
  }

  // Step 2: Probe candidate paths (if Step 1 didn't find RSS)
  if (!rssUrl) {
    const rootCandidates = ['/feed', '/feed.xml', '/rss', '/rss.xml', '/atom.xml', '/index.xml']
    const base = new URL(blogUrl)

    // Build probe URLs: root-relative paths + page-relative paths (treating input URL as directory)
    const pageBase = base.pathname.endsWith('/') ? base.href : base.href + '/'
    const seen = new Set<string>()
    const probeUrls: string[] = []
    for (const p of rootCandidates) {
      const fromRoot = new URL(p, base).toString()
      const fromPage = new URL(p.replace(/^\//, ''), pageBase).toString()
      if (!seen.has(fromRoot)) { seen.add(fromRoot); probeUrls.push(fromRoot) }
      if (!seen.has(fromPage)) { seen.add(fromPage); probeUrls.push(fromPage) }
    }

    for (const candidateUrl of probeUrls) {
      try {
        let probeRes = await fetch(candidateUrl, {
          method: 'HEAD',
          headers: { 'User-Agent': USER_AGENT },
          signal: AbortSignal.timeout(PROBE_TIMEOUT),
        })
        if (!probeRes.ok && probeRes.status === 405) {
          probeRes = await fetch(candidateUrl, {
            method: 'GET',
            headers: { 'User-Agent': USER_AGENT },
            signal: AbortSignal.timeout(PROBE_TIMEOUT),
          })
        }
        if (probeRes.ok) {
          const ct = probeRes.headers.get('content-type') || ''
          if (ct.includes('xml') || ct.includes('atom') || ct.includes('rss')) {
            rssUrl = candidateUrl
            break
          }
        }
      } catch {
        // Probe failed, try next
      }
    }

    // Fallback: if all regular probes failed, try top candidates via FlareSolverr.
    // FlareSolverr returns Chromium-rendered content. We use multiple strategies:
    // 1. Redirect detection: if Chromium was redirected to a different host, skip
    // 2. Content-type / raw XML checks
    // 3. HTML-decoded body parsing (Chromium may HTML-encode XML tags)
    if (!rssUrl) {
      const topCandidates = ['rss.xml', 'feed.xml', 'atom.xml']
      for (const name of topCandidates) {
        const candidateUrl = new URL(name, pageBase).toString()
        try {
          const flare = await fetchViaFlareSolverr(candidateUrl)
          if (!flare) continue

          // Skip if Chromium was redirected to a different host (e.g. 404 → homepage)
          try {
            const reqHost = new URL(candidateUrl).host
            const resHost = new URL(flare.url).host
            if (reqHost !== resHost) continue
          } catch { /* ignore URL parse errors */ }

          // Check content-type from original response headers
          const ct = flare.contentType
          if (ct.includes('xml') || ct.includes('rss') || ct.includes('atom')) {
            rssUrl = candidateUrl
            break
          }
          // If extractXmlFromBrowserViewer succeeded, body is raw XML
          if (/^\s*<(\?xml|rss|feed)\b/.test(flare.body)) {
            rssUrl = candidateUrl
            break
          }
          // Search anywhere in body for RSS/Atom elements (raw or HTML-encoded)
          if (/<rss[\s>]/.test(flare.body) || /&lt;rss[\s>]/.test(flare.body)) {
            rssUrl = candidateUrl
            break
          }
          if (/<feed[\s>]/.test(flare.body) || /&lt;feed[\s>]/.test(flare.body)) {
            rssUrl = candidateUrl
            break
          }
          // Try parsing body as RSS (works if extractXmlFromBrowserViewer succeeded)
          const items = await parseRssXml({ url: blogUrl, rss_url: candidateUrl, rss_bridge_url: null }, flare.body)
          if (items.length > 0) {
            rssUrl = candidateUrl
            break
          }
          // Try HTML-decoding body and parsing (Chromium wraps XML in HTML with encoded entities)
          if (flare.body.includes('&lt;rss') || flare.body.includes('&lt;feed')) {
            const decoded = flare.body
              .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
            const decodedItems = await parseRssXml({ url: blogUrl, rss_url: candidateUrl, rss_bridge_url: null }, decoded)
            if (decodedItems.length > 0) {
              rssUrl = candidateUrl
              break
            }
          }
        } catch {
          // FlareSolverr probe failed, try next
        }
      }
    }
  }

  if (!rssUrl) return { rssUrl: null, title: pageTitle, iconUrl: null, usedFlareSolverr }

  // Step 3: Fetch the feed itself to get the canonical feed title
  const metadata = await fetchFeedMetadata(rssUrl)
  return { rssUrl, title: metadata.title || pageTitle, iconUrl: metadata.iconUrl, usedFlareSolverr }
}
