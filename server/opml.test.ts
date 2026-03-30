import { describe, it, expect } from 'vitest'
import { parseOpml, generateOpml } from './opml.js'
import type { Feed, Category } from './db.js'

describe('parseOpml', () => {
  it('parses standard OPML with categories', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head><title>Test</title></head>
  <body>
    <outline text="Tech" title="Tech">
      <outline type="rss" text="HN" xmlUrl="https://news.ycombinator.com/rss" htmlUrl="https://news.ycombinator.com" />
      <outline type="rss" text="Lobsters" xmlUrl="https://lobste.rs/rss" htmlUrl="https://lobste.rs" />
    </outline>
    <outline type="rss" text="Overreacted" xmlUrl="https://overreacted.io/rss.xml" htmlUrl="https://overreacted.io" />
  </body>
</opml>`

    const feeds = parseOpml(xml)
    expect(feeds).toHaveLength(3)

    expect(feeds[0]).toEqual({
      name: 'HN',
      url: 'https://news.ycombinator.com',
      rssUrl: 'https://news.ycombinator.com/rss',
      categoryName: 'Tech',
    })

    expect(feeds[1]).toEqual({
      name: 'Lobsters',
      url: 'https://lobste.rs',
      rssUrl: 'https://lobste.rs/rss',
      categoryName: 'Tech',
    })

    expect(feeds[2]).toEqual({
      name: 'Overreacted',
      url: 'https://overreacted.io',
      rssUrl: 'https://overreacted.io/rss.xml',
      categoryName: null,
    })
  })

  it('uses origin as url when htmlUrl is missing', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head><title>Test</title></head>
  <body>
    <outline type="rss" text="Blog" xmlUrl="https://example.com/feed.xml" />
  </body>
</opml>`

    const feeds = parseOpml(xml)
    expect(feeds[0].url).toBe('https://example.com')
  })

  it('handles nested categories', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head><title>Test</title></head>
  <body>
    <outline text="Parent">
      <outline text="Child">
        <outline type="rss" text="Deep" xmlUrl="https://example.com/rss" />
      </outline>
    </outline>
  </body>
</opml>`

    const feeds = parseOpml(xml)
    expect(feeds).toHaveLength(1)
    // Nested category uses immediate parent name
    expect(feeds[0].categoryName).toBe('Child')
  })

  it('skips outlines without xmlUrl', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head><title>Test</title></head>
  <body>
    <outline text="Just a label" />
    <outline type="rss" text="Feed" xmlUrl="https://example.com/rss" />
  </body>
</opml>`

    const feeds = parseOpml(xml)
    expect(feeds).toHaveLength(1)
  })

  it('throws on invalid XML', () => {
    expect(() => parseOpml('not xml at all')).toThrow()
  })

  it('throws on OPML without body', () => {
    const xml = `<?xml version="1.0"?><opml version="2.0"><head><title>T</title></head></opml>`
    expect(() => parseOpml(xml)).toThrow('Invalid OPML: missing <body>')
  })

  it('handles single feed (non-array outline)', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head><title>Test</title></head>
  <body>
    <outline type="rss" text="Only" xmlUrl="https://only.example.com/rss" />
  </body>
</opml>`

    const feeds = parseOpml(xml)
    expect(feeds).toHaveLength(1)
    expect(feeds[0].name).toBe('Only')
  })
})

describe('generateOpml', () => {
  const makeFeed = (overrides: Partial<Feed>): Feed => ({
    id: 1,
    name: 'Test Feed',
    url: 'https://example.com',
    icon_url: null,
    rss_url: 'https://example.com/rss',
    rss_bridge_url: null,
    category_id: null,
    last_error: null,
    error_count: 0,
    disabled: 0,
    requires_js_challenge: 0,
    type: 'rss',
    etag: null,
    last_modified: null,
    last_content_hash: null,
    next_check_at: null,
    check_interval: null,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  })

  const makeCategory = (overrides: Partial<Category>): Category => ({
    id: 1,
    name: 'Tech',
    sort_order: 0,
    collapsed: 0,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  })

  it('generates valid OPML with categories', () => {
    const feeds = [
      makeFeed({ id: 1, name: 'HN', url: 'https://news.ycombinator.com', rss_url: 'https://news.ycombinator.com/rss', category_id: 1 }),
      makeFeed({ id: 2, name: 'Blog', url: 'https://blog.example.com', rss_url: 'https://blog.example.com/feed', category_id: null }),
    ]
    const categories = [makeCategory({ id: 1, name: 'Tech' })]

    const xml = generateOpml(feeds, categories)

    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>')
    expect(xml).toContain('<opml version="2.0">')
    expect(xml).toContain('<title>Oksskolten Feeds</title>')
    expect(xml).toContain('text="Tech"')
    expect(xml).toContain('xmlUrl="https://news.ycombinator.com/rss"')
    expect(xml).toContain('htmlUrl="https://news.ycombinator.com"')
    expect(xml).toContain('text="Blog"')
  })

  it('excludes clip feeds', () => {
    const feeds = [
      makeFeed({ id: 1, name: 'Clips', type: 'clip' }),
      makeFeed({ id: 2, name: 'Real Feed' }),
    ]

    const xml = generateOpml(feeds, [])

    expect(xml).not.toContain('Clips')
    expect(xml).toContain('Real Feed')
  })

  it('escapes XML special characters', () => {
    const feeds = [
      makeFeed({ name: 'Feed & <Friends>', url: 'https://example.com', rss_url: 'https://example.com/rss' }),
    ]

    const xml = generateOpml(feeds, [])

    expect(xml).toContain('Feed &amp; &lt;Friends&gt;')
    expect(xml).not.toContain('Feed & <Friends>')
  })

  it('uses rss_bridge_url when rss_url is null', () => {
    const feeds = [
      makeFeed({ rss_url: null, rss_bridge_url: 'https://bridge.example.com/feed' }),
    ]

    const xml = generateOpml(feeds, [])

    expect(xml).toContain('xmlUrl="https://bridge.example.com/feed"')
  })

  it('roundtrips: generate then parse produces same feeds', () => {
    const feeds = [
      makeFeed({ id: 1, name: 'Alpha', url: 'https://alpha.com', rss_url: 'https://alpha.com/rss', category_id: 1 }),
      makeFeed({ id: 2, name: 'Beta', url: 'https://beta.com', rss_url: 'https://beta.com/feed', category_id: null }),
    ]
    const categories = [makeCategory({ id: 1, name: 'Cat1' })]

    const xml = generateOpml(feeds, categories)
    const parsed = parseOpml(xml)

    expect(parsed).toHaveLength(2)
    expect(parsed[0].name).toBe('Alpha')
    expect(parsed[0].rssUrl).toBe('https://alpha.com/rss')
    expect(parsed[0].categoryName).toBe('Cat1')
    expect(parsed[1].name).toBe('Beta')
    expect(parsed[1].categoryName).toBeNull()
  })
})
