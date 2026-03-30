import { createHash } from 'node:crypto'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchAndParseRss, discoverRssUrl, RateLimitError } from './rss.js'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockSafeFetch = vi.fn()
vi.mock('./ssrf.js', () => ({
  safeFetch: (...args: unknown[]) => mockSafeFetch(...args),
}))

// Controllable feedsmith mock — set feedsmithShouldFail = true to force fast-xml-parser fallback
let feedsmithShouldFail = false
vi.mock('feedsmith', async (importOriginal) => {
  const real = await importOriginal<typeof import('feedsmith')>()
  return {
    ...real,
    parseFeed: (...args: Parameters<typeof real.parseFeed>) => {
      if (feedsmithShouldFail) throw new Error('feedsmith failed')
      return real.parseFeed(...args)
    },
  }
})

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const RSS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Test Blog</title>
    <item>
      <title>First Post</title>
      <link>https://example.com/post-1</link>
      <pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>
    </item>
    <item>
      <title>Second Post</title>
      <link>https://example.com/post-2</link>
      <pubDate>Tue, 02 Jan 2024 00:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`

const RSS_XML_WITH_IMAGE = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Image Blog</title>
    <image>
      <url>https://example.com/icon.png</url>
    </image>
    <item>
      <title>First Post</title>
      <link>https://example.com/post-1</link>
    </item>
  </channel>
</rss>`

const RSS_XML_WITH_RELATIVE_IMAGE = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Relative Image Blog</title>
    <image>
      <url>/assets/icon.png</url>
    </image>
    <item>
      <title>First Post</title>
      <link>https://example.com/post-1</link>
    </item>
  </channel>
</rss>`

const ATOM_XML = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom Blog</title>
  <entry>
    <title>Atom Post</title>
    <link rel="alternate" href="https://example.com/atom-1"/>
    <published>2024-01-01T00:00:00Z</published>
  </entry>
  <entry>
    <title>Atom Post 2</title>
    <link rel="alternate" href="https://example.com/atom-2"/>
    <link rel="self" href="https://example.com/atom-2.xml"/>
    <updated>2024-01-02T00:00:00Z</updated>
  </entry>
</feed>`

const ATOM_XML_WITH_LOGO = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom Blog</title>
  <logo>https://example.com/logo.png</logo>
  <entry>
    <title>Atom Post</title>
    <link rel="alternate" href="https://example.com/atom-1"/>
  </entry>
</feed>`

const ATOM_XML_WITH_ICON = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom Icon Blog</title>
  <icon>/icon.svg</icon>
  <entry>
    <title>Atom Post</title>
    <link rel="alternate" href="https://example.com/atom-1"/>
  </entry>
</feed>`

const ATOM_SINGLE_LINK_XML = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Single Link Atom</title>
  <entry>
    <title>Post</title>
    <link href="https://example.com/single"/>
    <id>tag:example.com,2024:1</id>
    <updated>2024-01-01T00:00:00Z</updated>
  </entry>
</feed>`

const RSS_SINGLE_ITEM_XML = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Single</title>
    <item>
      <title>Only Item</title>
      <link>https://example.com/only</link>
    </item>
  </channel>
</rss>`

const RSS_GUID_FALLBACK_XML = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Guid Blog</title>
    <item>
      <title>Guid Post</title>
      <guid>https://example.com/guid-1</guid>
    </item>
  </channel>
</rss>`

const RSSHUB_X_XML = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Twitter</title>
    <item>
      <title>RT Example User: reposted text</title>
      <link>https://x.com/example/status/1</link>
      <description>RT Example User&lt;br&gt;reposted text</description>
    </item>
    <item>
      <title>Quoted post</title>
      <link>https://x.com/example/status/2</link>
      <description>Own text&lt;div class="rsshub-quote"&gt;quoted text&lt;/div&gt;</description>
    </item>
    <item>
      <title>Original post</title>
      <link>https://x.com/example/status/3</link>
      <description>Original text</description>
    </item>
  </channel>
</rss>`

const ATOM_ID_FALLBACK_XML = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>ID Atom</title>
  <entry>
    <title>No Link</title>
    <id>https://example.com/id-entry</id>
    <updated>2024-01-01T00:00:00Z</updated>
  </entry>
</feed>`

const HTML_WITH_RSS_LINK = `<!DOCTYPE html>
<html>
<head>
  <title>My Blog</title>
  <link rel="alternate" type="application/rss+xml" href="/feed.xml"/>
</head>
<body></body>
</html>`

const HTML_WITH_ATOM_LINK = `<!DOCTYPE html>
<html>
<head>
  <title>My Atom Blog</title>
  <link rel="alternate" type="application/atom+xml" href="https://example.com/atom.xml"/>
</head>
<body></body>
</html>`

const HTML_NO_FEED = `<!DOCTYPE html>
<html><head><title>No Feed</title></head><body></body></html>`

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockResponse(body: string, ok = true, status = 200, contentType = 'application/xml') {
  return {
    ok,
    status,
    text: async () => body,
    arrayBuffer: async () => new TextEncoder().encode(body).buffer,
    headers: new Headers({ 'content-type': contentType }),
  }
}

// ---------------------------------------------------------------------------
// Tests — fetchAndParseRss
// ---------------------------------------------------------------------------

describe('fetchAndParseRss', () => {
  beforeEach(() => {
    mockSafeFetch.mockReset()
    feedsmithShouldFail = false
  })

  it('throws when no RSS URL is configured', async () => {
    await expect(fetchAndParseRss({ id: 1, name: 'x', url: 'https://x.com' } as any))
      .rejects.toThrow('No RSS URL')
  })

  it('throws on HTTP error', async () => {
    mockSafeFetch.mockResolvedValue(mockResponse('', false, 404))
    await expect(fetchAndParseRss({ id: 1, name: 'x', url: 'https://x.com', rss_url: 'https://x.com/feed' } as any))
      .rejects.toThrow('HTTP 404')
  })

  it('parses RSS 2.0 feed via feedsmith', async () => {
    mockSafeFetch.mockResolvedValue(mockResponse(RSS_XML))

    const { items } = await fetchAndParseRss({
      id: 1, name: 'test', url: 'https://example.com',
      rss_url: 'https://example.com/rss',
    } as any)

    expect(items).toHaveLength(2)
    expect(items[0].title).toBe('First Post')
    expect(items[0].url).toBe('https://example.com/post-1')
    expect(items[0].published_at).toMatch(/2024-01-01/)
    expect(items[1].title).toBe('Second Post')
  })

  it('parses Atom feed', async () => {
    mockSafeFetch.mockResolvedValue(mockResponse(ATOM_XML))

    const { items } = await fetchAndParseRss({
      id: 1, name: 'test', url: 'https://example.com',
      rss_url: 'https://example.com/atom',
    } as any)

    expect(items.length).toBeGreaterThanOrEqual(2)
    expect(items[0].url).toBe('https://example.com/atom-1')
  })

  it('falls back to fast-xml-parser when feedsmith fails', async () => {
    const rssXml = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <title>Fallback</title>
    <item>
      <title>FXP Item</title>
      <link>https://example.com/fxp</link>
      <pubDate>2024-01-01T00:00:00Z</pubDate>
    </item>
  </channel>
</rss>`

    feedsmithShouldFail = true
    mockSafeFetch.mockResolvedValue(mockResponse(rssXml))

    const { items } = await fetchAndParseRss({
      id: 1, name: 'test', url: 'https://example.com',
      rss_url: 'https://example.com/rss',
    } as any)

    expect(items).toHaveLength(1)
    expect(items[0].title).toBe('FXP Item')
    expect(items[0].url).toBe('https://example.com/fxp')
  })

  it('classifies RSSHub X items as repost, quote, and original', async () => {
    mockSafeFetch.mockResolvedValue(mockResponse(RSSHUB_X_XML))

    const { items } = await fetchAndParseRss({
      id: 1,
      name: 'x-feed',
      url: 'https://x.com/example',
      rss_url: 'https://rsshub.app/twitter/user/example',
    } as any)

    expect(items).toHaveLength(3)
    expect(items[0].article_kind).toBe('repost')
    expect(items[1].article_kind).toBe('quote')
    expect(items[2].article_kind).toBe('original')
  })

  it('does not classify non-X feeds', async () => {
    mockSafeFetch.mockResolvedValue(mockResponse(RSS_XML))

    const { items } = await fetchAndParseRss({
      id: 1,
      name: 'test',
      url: 'https://example.com',
      rss_url: 'https://example.com/rss',
    } as any)

    expect(items[0].article_kind).toBeNull()
  })

  it('handles single RSS item (not array)', async () => {
    feedsmithShouldFail = true
    mockSafeFetch.mockResolvedValue(mockResponse(RSS_SINGLE_ITEM_XML))

    const { items } = await fetchAndParseRss({
      id: 1, name: 'test', url: 'https://example.com',
      rss_url: 'https://example.com/rss',
    } as any)

    expect(items).toHaveLength(1)
    expect(items[0].title).toBe('Only Item')
  })

  it('uses guid as URL fallback in RSS', async () => {
    feedsmithShouldFail = true
    mockSafeFetch.mockResolvedValue(mockResponse(RSS_GUID_FALLBACK_XML))

    const { items } = await fetchAndParseRss({
      id: 1, name: 'test', url: 'https://example.com',
      rss_url: 'https://example.com/rss',
    } as any)

    expect(items).toHaveLength(1)
    expect(items[0].url).toBe('https://example.com/guid-1')
  })

  it('parses Atom with single link (no rel=alternate)', async () => {
    feedsmithShouldFail = true
    mockSafeFetch.mockResolvedValue(mockResponse(ATOM_SINGLE_LINK_XML))

    const { items } = await fetchAndParseRss({
      id: 1, name: 'test', url: 'https://example.com',
      rss_url: 'https://example.com/atom',
    } as any)

    expect(items).toHaveLength(1)
    expect(items[0].url).toBe('https://example.com/single')
  })

  it('uses id as URL fallback in Atom', async () => {
    feedsmithShouldFail = true
    mockSafeFetch.mockResolvedValue(mockResponse(ATOM_ID_FALLBACK_XML))

    const { items } = await fetchAndParseRss({
      id: 1, name: 'test', url: 'https://example.com',
      rss_url: 'https://example.com/atom',
    } as any)

    expect(items).toHaveLength(1)
    expect(items[0].url).toBe('https://example.com/id-entry')
  })

  it('prefers Atom alternate link over other rels', async () => {
    feedsmithShouldFail = true
    mockSafeFetch.mockResolvedValue(mockResponse(ATOM_XML))

    const { items } = await fetchAndParseRss({
      id: 1, name: 'test', url: 'https://example.com',
      rss_url: 'https://example.com/atom',
    } as any)

    // Second entry has both alternate and self links
    const post2 = items.find(i => i.title === 'Atom Post 2')
    expect(post2?.url).toBe('https://example.com/atom-2')
  })

  it('normalizes dates to ISO format', async () => {
    mockSafeFetch.mockResolvedValue(mockResponse(RSS_XML))

    const { items } = await fetchAndParseRss({
      id: 1, name: 'test', url: 'https://example.com',
      rss_url: 'https://example.com/rss',
    } as any)

    expect(items[0].published_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('returns null for invalid dates', async () => {
    const xml = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <item>
      <title>Bad Date</title>
      <link>https://example.com/bad</link>
      <pubDate>not-a-date</pubDate>
    </item>
  </channel>
</rss>`
    feedsmithShouldFail = true
    mockSafeFetch.mockResolvedValue(mockResponse(xml))

    const { items } = await fetchAndParseRss({
      id: 1, name: 'test', url: 'https://example.com',
      rss_url: 'https://example.com/rss',
    } as any)

    expect(items[0].published_at).toBeNull()
  })

  it('throws for unparseable content', async () => {
    feedsmithShouldFail = true
    mockSafeFetch.mockResolvedValue(mockResponse('<html><body>Not a feed</body></html>'))

    await expect(fetchAndParseRss({
      id: 1, name: 'test', url: 'https://example.com',
      rss_url: 'https://example.com/rss',
    } as any)).rejects.toThrow('Could not parse RSS/Atom feed')
  })

  it('uses rss_bridge_url when rss_url is absent', async () => {
    mockSafeFetch.mockResolvedValue(mockResponse(RSS_XML))

    const { items } = await fetchAndParseRss({
      id: 1, name: 'test', url: 'https://example.com',
      rss_bridge_url: 'https://bridge.example.com/rss',
    } as any)

    expect(items).toHaveLength(2)
    expect(mockSafeFetch).toHaveBeenCalledWith(
      'https://bridge.example.com/rss',
      expect.any(Object),
    )
  })

  // -------------------------------------------------------------------------
  // Content hash tests
  // -------------------------------------------------------------------------

  it('returns contentHash in result', async () => {
    mockSafeFetch.mockResolvedValue(mockResponse(RSS_XML))

    const result = await fetchAndParseRss({
      id: 1, name: 'test', url: 'https://example.com',
      rss_url: 'https://example.com/rss',
    } as any)

    const expectedHash = createHash('sha256').update(RSS_XML).digest('hex')
    expect(result.contentHash).toBe(expectedHash)
    expect(result.notModified).toBe(false)
    expect(result.items).toHaveLength(2)
  })

  it('skips parsing when content hash matches last_content_hash', async () => {
    const hash = createHash('sha256').update(RSS_XML).digest('hex')
    mockSafeFetch.mockResolvedValue(mockResponse(RSS_XML))

    const result = await fetchAndParseRss({
      id: 1, name: 'test', url: 'https://example.com',
      rss_url: 'https://example.com/rss',
      last_content_hash: hash,
    } as any)

    expect(result.notModified).toBe(true)
    expect(result.items).toHaveLength(0)
    expect(result.contentHash).toBe(hash)
  })

  it('parses normally when content hash differs from last_content_hash', async () => {
    mockSafeFetch.mockResolvedValue(mockResponse(RSS_XML))

    const result = await fetchAndParseRss({
      id: 1, name: 'test', url: 'https://example.com',
      rss_url: 'https://example.com/rss',
      last_content_hash: 'stale-hash-from-previous-fetch',
    } as any)

    expect(result.notModified).toBe(false)
    expect(result.items).toHaveLength(2)
    const expectedHash = createHash('sha256').update(RSS_XML).digest('hex')
    expect(result.contentHash).toBe(expectedHash)
  })

  it('skips hash check when last_content_hash is null (first fetch)', async () => {
    mockSafeFetch.mockResolvedValue(mockResponse(RSS_XML))

    const result = await fetchAndParseRss({
      id: 1, name: 'test', url: 'https://example.com',
      rss_url: 'https://example.com/rss',
      last_content_hash: null,
    } as any)

    expect(result.notModified).toBe(false)
    expect(result.items).toHaveLength(2)
  })

  it('returns existing last_content_hash on 304 response', async () => {
    mockSafeFetch.mockResolvedValue(mockResponse('', true, 304))

    const result = await fetchAndParseRss({
      id: 1, name: 'test', url: 'https://example.com',
      rss_url: 'https://example.com/rss',
      etag: '"abc"',
      last_modified: 'Mon, 01 Jan 2024 00:00:00 GMT',
      last_content_hash: 'previous-hash-value',
    } as any)

    expect(result.notModified).toBe(true)
    expect(result.contentHash).toBe('previous-hash-value')
    expect(result.items).toHaveLength(0)
  })

  it('sends conditional headers (ETag/Last-Modified) with request', async () => {
    mockSafeFetch.mockResolvedValue(mockResponse(RSS_XML))

    await fetchAndParseRss({
      id: 1, name: 'test', url: 'https://example.com',
      rss_url: 'https://example.com/rss',
      etag: '"my-etag"',
      last_modified: 'Mon, 01 Jan 2024 00:00:00 GMT',
    } as any)

    expect(mockSafeFetch).toHaveBeenCalledWith(
      'https://example.com/rss',
      expect.objectContaining({
        headers: expect.objectContaining({
          'If-None-Match': '"my-etag"',
          'If-Modified-Since': 'Mon, 01 Jan 2024 00:00:00 GMT',
        }),
      }),
    )
  })

  // -------------------------------------------------------------------------
  // Rate limit tests
  // -------------------------------------------------------------------------

  it('throws RateLimitError on 429 response', async () => {
    const res = mockResponse('', false, 429)
    res.headers.set('retry-after', '120')
    mockSafeFetch.mockResolvedValue(res)

    try {
      await fetchAndParseRss({
        id: 1, name: 'test', url: 'https://example.com',
        rss_url: 'https://example.com/rss',
      } as any)
      expect.fail('Should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(RateLimitError)
      expect((err as InstanceType<typeof RateLimitError>).retryAfterSeconds).toBe(120)
    }
  })

  it('throws RateLimitError on 503 response', async () => {
    const res = mockResponse('', false, 503)
    mockSafeFetch.mockResolvedValue(res)

    try {
      await fetchAndParseRss({
        id: 1, name: 'test', url: 'https://example.com',
        rss_url: 'https://example.com/rss',
      } as any)
      expect.fail('Should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(RateLimitError)
      expect((err as InstanceType<typeof RateLimitError>).retryAfterSeconds).toBeNull()
    }
  })

  it('parses date-based Retry-After header', async () => {
    const futureDate = new Date(Date.now() + 300_000).toUTCString() // 5 minutes from now
    const res = mockResponse('', false, 429)
    res.headers.set('retry-after', futureDate)
    mockSafeFetch.mockResolvedValue(res)

    try {
      await fetchAndParseRss({
        id: 1, name: 'test', url: 'https://example.com',
        rss_url: 'https://example.com/rss',
      } as any)
      expect.fail('Should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(RateLimitError)
      const seconds = (err as InstanceType<typeof RateLimitError>).retryAfterSeconds!
      expect(seconds).toBeGreaterThan(200)
      expect(seconds).toBeLessThan(400)
    }
  })

  // -------------------------------------------------------------------------
  // URL cleaning integration tests
  // -------------------------------------------------------------------------

  it('strips tracking parameters from parsed URLs', async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Tracked</title>
    <item>
      <title>Post</title>
      <link>https://example.com/post?utm_source=rss&amp;utm_medium=feed&amp;id=42</link>
    </item>
  </channel>
</rss>`
    mockSafeFetch.mockResolvedValue(mockResponse(xml))

    const { items } = await fetchAndParseRss({
      id: 1, name: 'test', url: 'https://example.com',
      rss_url: 'https://example.com/rss',
    } as any)

    expect(items).toHaveLength(1)
    expect(items[0].url).toBe('https://example.com/post?id=42')
    expect(items[0].url).not.toContain('utm_')
  })

  it('filters out items without a URL', async () => {
    const xml = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <item><title>No URL</title></item>
    <item><title>Has URL</title><link>https://example.com/ok</link></item>
  </channel>
</rss>`

    feedsmithShouldFail = true
    mockSafeFetch.mockResolvedValue(mockResponse(xml))

    const { items } = await fetchAndParseRss({
      id: 1, name: 'test', url: 'https://example.com',
      rss_url: 'https://example.com/rss',
    } as any)

    expect(items).toHaveLength(1)
    expect(items[0].title).toBe('Has URL')
  })
})

// ---------------------------------------------------------------------------
// Tests — discoverRssUrl
// ---------------------------------------------------------------------------

describe('discoverRssUrl', () => {
  beforeEach(() => {
    mockSafeFetch.mockReset()
    vi.stubGlobal('fetch', vi.fn())
  })

  it('discovers RSS link from HTML page', async () => {
    mockSafeFetch
      .mockResolvedValueOnce(mockResponse(HTML_WITH_RSS_LINK, true, 200, 'text/html'))  // page fetch
      .mockResolvedValueOnce(mockResponse(RSS_XML))  // feed title fetch

    const result = await discoverRssUrl('https://example.com')

    expect(result.rssUrl).toBe('https://example.com/feed.xml')
    expect(result.title).toBe('Test Blog')
  })

  it('discovers Atom link from HTML page', async () => {
    mockSafeFetch
      .mockResolvedValueOnce(mockResponse(HTML_WITH_ATOM_LINK, true, 200, 'text/html'))
      .mockResolvedValueOnce(mockResponse(ATOM_XML))

    const result = await discoverRssUrl('https://example.com')

    expect(result.rssUrl).toBe('https://example.com/atom.xml')
  })

  it('falls back to path probing when no link tag found', async () => {
    // Page has no feed link
    mockSafeFetch.mockResolvedValueOnce(mockResponse(HTML_NO_FEED, true, 200, 'text/html'))

    const globalFetch = vi.fn()
    // Probe /feed → 404, /feed.xml → 200 with xml content-type
    globalFetch
      .mockResolvedValueOnce(mockResponse('', false, 404))  // HEAD /feed
      .mockResolvedValueOnce(mockResponse('', true, 200, 'application/xml'))  // HEAD /feed.xml

    vi.stubGlobal('fetch', globalFetch)

    // Feed title fetch
    mockSafeFetch.mockResolvedValueOnce(mockResponse(RSS_XML))

    const result = await discoverRssUrl('https://example.com')

    expect(result.rssUrl).toBe('https://example.com/feed.xml')
  })

  it('retries with GET on 405 during path probing', async () => {
    mockSafeFetch.mockResolvedValueOnce(mockResponse(HTML_NO_FEED, true, 200, 'text/html'))

    const globalFetch = vi.fn()
    // HEAD /feed → 405, GET /feed → 200 xml
    globalFetch
      .mockResolvedValueOnce(mockResponse('', false, 405))  // HEAD
      .mockResolvedValueOnce(mockResponse('', true, 200, 'application/xml'))  // GET fallback

    vi.stubGlobal('fetch', globalFetch)

    mockSafeFetch.mockResolvedValueOnce(mockResponse(RSS_XML))

    const result = await discoverRssUrl('https://example.com')

    expect(result.rssUrl).toBe('https://example.com/feed')
    expect(globalFetch).toHaveBeenCalledTimes(2)
    expect(globalFetch.mock.calls[0][1].method).toBe('HEAD')
    expect(globalFetch.mock.calls[1][1].method).toBe('GET')
  })

  it('returns null rssUrl when nothing found', async () => {
    mockSafeFetch.mockResolvedValueOnce(mockResponse(HTML_NO_FEED, true, 200, 'text/html'))

    const globalFetch = vi.fn().mockResolvedValue(mockResponse('', false, 404))
    vi.stubGlobal('fetch', globalFetch)

    const result = await discoverRssUrl('https://example.com')

    expect(result.rssUrl).toBeNull()
    expect(result.title).toBe('No Feed')  // page <title>
  })

  it('returns page title even when feed discovery fails', async () => {
    mockSafeFetch.mockResolvedValueOnce(mockResponse(HTML_NO_FEED, true, 200, 'text/html'))
    const globalFetch = vi.fn().mockResolvedValue(mockResponse('', false, 404))
    vi.stubGlobal('fetch', globalFetch)

    const result = await discoverRssUrl('https://example.com')

    expect(result.title).toBe('No Feed')
  })

  it('handles page fetch failure gracefully', async () => {
    mockSafeFetch.mockRejectedValueOnce(new Error('network error'))

    const globalFetch = vi.fn().mockResolvedValue(mockResponse('', false, 404))
    vi.stubGlobal('fetch', globalFetch)

    const result = await discoverRssUrl('https://example.com')

    // Falls through to path probing
    expect(result.rssUrl).toBeNull()
  })

  it('ignores non-xml content-types during path probing', async () => {
    mockSafeFetch.mockResolvedValueOnce(mockResponse(HTML_NO_FEED, true, 200, 'text/html'))

    const globalFetch = vi.fn()
    // All probes return 200 but with text/html content-type
    globalFetch.mockResolvedValue(mockResponse('', true, 200, 'text/html'))
    vi.stubGlobal('fetch', globalFetch)

    const result = await discoverRssUrl('https://example.com')

    expect(result.rssUrl).toBeNull()
  })

  it('prefers feed title over page title', async () => {
    mockSafeFetch
      .mockResolvedValueOnce(mockResponse(HTML_WITH_RSS_LINK, true, 200, 'text/html'))
      .mockResolvedValueOnce(mockResponse(RSS_XML))

    const result = await discoverRssUrl('https://example.com')

    expect(result.title).toBe('Test Blog')  // feed title, not "My Blog" from HTML
  })

  it('extracts RSS channel image url as iconUrl', async () => {
    mockSafeFetch
      .mockResolvedValueOnce(mockResponse(HTML_WITH_RSS_LINK, true, 200, 'text/html'))
      .mockResolvedValueOnce(mockResponse(RSS_XML_WITH_IMAGE))

    const result = await discoverRssUrl('https://example.com')

    expect(result.iconUrl).toBe('https://example.com/icon.png')
  })

  it('extracts Atom logo or icon as iconUrl', async () => {
    mockSafeFetch
      .mockResolvedValueOnce(mockResponse(HTML_WITH_ATOM_LINK, true, 200, 'text/html'))
      .mockResolvedValueOnce(mockResponse(ATOM_XML_WITH_LOGO))

    const logoResult = await discoverRssUrl('https://example.com')
    expect(logoResult.iconUrl).toBe('https://example.com/logo.png')

    mockSafeFetch
      .mockResolvedValueOnce(mockResponse(HTML_WITH_ATOM_LINK, true, 200, 'text/html'))
      .mockResolvedValueOnce(mockResponse(ATOM_XML_WITH_ICON))

    const iconResult = await discoverRssUrl('https://example.com')
    expect(iconResult.iconUrl).toBe('https://example.com/icon.svg')
  })

  it('resolves relative iconUrl against the feed xml url', async () => {
    mockSafeFetch
      .mockResolvedValueOnce(mockResponse(HTML_WITH_RSS_LINK, true, 200, 'text/html'))
      .mockResolvedValueOnce(mockResponse(RSS_XML_WITH_RELATIVE_IMAGE))

    const result = await discoverRssUrl('https://example.com')

    expect(result.iconUrl).toBe('https://example.com/assets/icon.png')
  })
})
