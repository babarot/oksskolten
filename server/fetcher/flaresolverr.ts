import { Semaphore } from './util.js'

const FLARESOLVERR_URL = process.env.FLARESOLVERR_URL
// Default 1 to prevent multiple simultaneous Chromium sessions during batch refresh
const FLARESOLVERR_CONCURRENCY = Number(process.env.FLARESOLVERR_CONCURRENCY) || 1
const FLARESOLVERR_MAX_TIMEOUT = Number(process.env.FLARESOLVERR_MAX_TIMEOUT) || 30_000
const flaresolverrSemaphore = new Semaphore(FLARESOLVERR_CONCURRENCY)

export type FlareSolverrResult = { body: string; contentType: string; url: string }

interface FlareSolverrResponse {
  status: string
  solution: {
    url: string
    status: number
    response: string
    headers: Record<string, string> | undefined
  }
}

function extractXmlFromBrowserViewer(html: string): string | null {
  // Chromium wraps the source XML inside:
  //   <div id="webkit-xml-viewer-source-xml">...raw XML...</div>
  // The XML itself may contain <div> tags (Chromium's fold wrappers),
  // so we extract the RSS/Atom root element directly.
  // Using regex instead of JSDOM because JSDOM's innerHTML serializer
  // corrupts self-closing XML tags (e.g. <link .../> → <link ...>)
  const marker = 'id="webkit-xml-viewer-source-xml"'
  const markerIndex = html.indexOf(marker)
  if (markerIndex === -1) return null

  // Limit regex search to the viewer area to avoid matching unrelated page markup.
  const viewerChunk = html.slice(markerIndex)

  // Try Atom <feed>...</feed>
  const atomMatch = viewerChunk.match(/<feed[\s>][\s\S]*<\/feed>/)
  if (atomMatch) return atomMatch[0]

  // Try RSS 2.0 <rss>...</rss>
  const rssMatch = viewerChunk.match(/<rss[\s>][\s\S]*<\/rss>/)
  if (rssMatch) return rssMatch[0]

  return null
}

function getHeaderValue(
  headers: Record<string, string> | undefined,
  name: string,
): string {
  if (!headers) return ''
  const key = Object.keys(headers).find(k => k.toLowerCase() === name.toLowerCase())
  return key ? headers[key] : ''
}

// --- Inflight cache: deduplicates concurrent requests to the same URL ---
const CACHE_TTL = 5 * 60_000 // 5 minutes

interface CacheEntry {
  promise: Promise<FlareSolverrResult | null>
  expires: number
}

const cache = new Map<string, CacheEntry>()

function evictExpired() {
  const now = Date.now()
  for (const [key, entry] of cache) {
    if (entry.expires < now) cache.delete(key)
  }
}

export interface FlareSolverrOptions {
  /** CSS selector to wait for before returning the page HTML. */
  waitForSelector?: string
}

export async function fetchViaFlareSolverr(url: string, options?: FlareSolverrOptions): Promise<FlareSolverrResult | null> {
  if (!FLARESOLVERR_URL) return null

  evictExpired()

  const cacheKey = options?.waitForSelector ? `${url}#wait=${options.waitForSelector}` : url
  const cached = cache.get(cacheKey)
  if (cached && cached.expires > Date.now()) return cached.promise

  const promise = flaresolverrSemaphore.run(() => doFetch(url, options))
  cache.set(cacheKey, { promise, expires: Date.now() + CACHE_TTL })
  return promise
}

async function doFetch(url: string, options?: FlareSolverrOptions): Promise<FlareSolverrResult | null> {
  try {
    const payload: Record<string, unknown> = { cmd: 'request.get', url, maxTimeout: FLARESOLVERR_MAX_TIMEOUT }
    if (options?.waitForSelector) {
      payload.waitForSelector = options.waitForSelector
    }
    const res = await fetch(`${FLARESOLVERR_URL}/v1`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(65_000),
    })
    if (!res.ok) return null
    const data = await res.json() as FlareSolverrResponse
    if (data.solution?.status === 200 && data.solution.response) {
      let body = data.solution.response
      // Chromium renders XML feeds as HTML with an XML viewer —
      // extract the raw XML from the embedded source element
      const rawXml = extractXmlFromBrowserViewer(body)
      if (rawXml) body = rawXml
      return {
        body,
        contentType: getHeaderValue(data.solution.headers, 'content-type'),
        url: data.solution.url,
      }
    }
    return null
  } catch {
    return null
  }
}
