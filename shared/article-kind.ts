export type ArticleKind = 'original' | 'repost' | 'quote'

const RSSHUB_X_ROUTE_RE = /\/(?:twitter|x)\//i
const RT_PREFIX_RE = /^RT\b/u

interface FeedSourceLike {
  url?: string | null
  rss_url?: string | null
  rss_bridge_url?: string | null
}

function matchesXHost(rawUrl: string | null | undefined): boolean {
  if (!rawUrl) return false
  try {
    const { hostname } = new URL(rawUrl)
    return hostname === 'x.com' || hostname === 'twitter.com' || hostname.endsWith('.x.com') || hostname.endsWith('.twitter.com')
  } catch {
    return false
  }
}

function matchesRssHubXRoute(rawUrl: string | null | undefined): boolean {
  if (!rawUrl) return false
  try {
    const parsed = new URL(rawUrl)
    return RSSHUB_X_ROUTE_RE.test(parsed.pathname)
  } catch {
    return RSSHUB_X_ROUTE_RE.test(rawUrl)
  }
}

export function isArticleKind(value: unknown): value is ArticleKind {
  return value === 'original' || value === 'repost' || value === 'quote'
}

export function isXFeedSource(feed: FeedSourceLike): boolean {
  return (
    matchesXHost(feed.url) ||
    matchesXHost(feed.rss_url) ||
    matchesXHost(feed.rss_bridge_url) ||
    matchesRssHubXRoute(feed.rss_url) ||
    matchesRssHubXRoute(feed.rss_bridge_url)
  )
}

export function classifyXItem(input: { title?: string | null; rawExcerpt?: string | null }): ArticleKind {
  const title = input.title?.trim() ?? ''
  const rawExcerpt = input.rawExcerpt?.trim() ?? ''
  if (RT_PREFIX_RE.test(title) || RT_PREFIX_RE.test(rawExcerpt)) return 'repost'
  if (rawExcerpt.includes('rsshub-quote')) return 'quote'
  return 'original'
}

export function detectArticleKindForFeed(
  feed: FeedSourceLike,
  item: { title?: string | null; rawExcerpt?: string | null },
): ArticleKind | null {
  return isXFeedSource(feed) ? classifyXItem(item) : null
}
