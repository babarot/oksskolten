import seedFeeds from './seed/feeds.json'
import seedArticles from './seed/articles.json'
import seedConversationsEn from './seed/en/conversations.json'
import seedConversationsJa from './seed/ja/conversations.json'
import { getLocale, dt } from './i18n'
import type { FeedWithCounts, ArticleListItem, ArticleDetail, Category, ChatScope, ScopeSummary } from '../../../shared/types'
import { resolveFeedViewType, type ArticleKind, type FeedViewType } from '../../../shared/article-kind'

type Locale = 'ja' | 'en'

const conversationsByLocale = {
  en: seedConversationsEn,
  ja: seedConversationsJa,
}

/**
 * Resolve relative date strings (e.g. "-3d", "-2d23h") to ISO 8601.
 * Seed JSON stores dates as offsets from "now" so the demo never looks stale.
 */
function resolveRelativeDate(value: string | null): string | null {
  if (!value) return null
  const m = value.match(/^-(\d+)d(?:(\d+)h)?$/)
  if (!m) return value // already absolute or unrecognised — pass through
  const days = Number(m[1])
  const hours = m[2] ? Number(m[2]) : 0
  return new Date(Date.now() - (days * 86_400_000 + hours * 3_600_000)).toISOString()
}

const NULLABLE_DATE_KEYS = ['published_at', 'seen_at', 'read_at', 'bookmarked_at', 'liked_at'] as const satisfies readonly (keyof SeedArticle)[]
const REQUIRED_DATE_KEYS = ['fetched_at', 'created_at'] as const satisfies readonly (keyof SeedArticle)[]

function resolveSeedDates() {
  for (const a of articles) {
    for (const key of NULLABLE_DATE_KEYS) {
      a[key] = resolveRelativeDate(a[key])
    }
    for (const key of REQUIRED_DATE_KEYS) {
      a[key] = resolveRelativeDate(a[key]) ?? a[key]
    }
  }
  for (const f of feeds) {
    f.created_at = resolveRelativeDate(f.created_at) ?? f.created_at
  }
}

// structuredClone ensures reload resets to seed state
let feeds: SeedFeed[] = structuredClone(seedFeeds) as SeedFeed[]
let articles: SeedArticle[] = structuredClone(seedArticles) as SeedArticle[]
resolveSeedDates()
let currentConvLocale: Locale = getLocale()
let conversations: SeedConversation[] = structuredClone(conversationsByLocale[currentConvLocale]) as SeedConversation[]
let nextFeedId = Math.max(...feeds.map(f => f.id)) + 1
let nextArticleId = Math.max(...articles.map(a => a.id)) + 1
const translatedIds = new Set<number>()
const summarizedIds = new Set<number>()

/** Re-initialize conversations when locale changes. */
function ensureConversationLocale() {
  const locale = getLocale()
  if (locale === currentConvLocale) return
  currentConvLocale = locale
  conversations = structuredClone(conversationsByLocale[locale]) as SeedConversation[]
}

interface SeedFeed {
  id: number
  name: string
  url: string
  icon_url?: string | null
  rss_url: string | null
  rss_bridge_url: string | null
  view_type: FeedViewType | null
  category_id: number | null
  category_name: string | null
  lang: string
  type: 'rss' | 'clip'
  disabled: number
  error_count: number
  last_error: string | null
  requires_js_challenge: number
  etag: string | null
  last_modified: string | null
  last_content_hash: string | null
  next_check_at: string | null
  check_interval: number | null
  created_at: string
}

interface SeedArticle {
  id: number
  feed_id: number
  title: string
  url: string
  article_kind?: ArticleKind | null
  full_text: string | null
  full_text_translated: string | null
  summary: string | null
  summary_ja: string | null
  excerpt: string | null
  lang: string | null
  og_image: string | null
  published_at: string | null
  seen_at: string | null
  read_at: string | null
  bookmarked_at: string | null
  liked_at: string | null
  fetched_at: string
  created_at: string
}

interface SeedConversationMessage {
  role: 'user' | 'assistant'
  content: string
}

interface SeedConversation {
  id: string
  title: string | null
  article_id: number | null
  article_title: string | null
  article_url: string | null
  article_og_image: string | null
  first_user_message: string | null
  first_assistant_preview: string | null
  created_at: string
  updated_at: string
  message_count: number
  scope_type?: 'global' | 'article' | 'list' | null
  scope_summary?: ScopeSummary | null
  messages: SeedConversationMessage[]
}

function inferConversationScopeSummary(conv: SeedConversation): ScopeSummary | null {
  if (conv.scope_type === 'list') {
    return conv.scope_summary ?? {
      type: 'list',
      label: 'Current list',
      detail: null,
    }
  }
  if ((conv.scope_type ?? (conv.article_id != null ? 'article' : 'global')) === 'article') {
    return {
      type: 'article',
      label: 'Current article',
      detail: conv.article_title ?? null,
    }
  }
  return {
    type: 'global',
    label: 'Global archive',
    detail: null,
  }
}

function articleSummary(a: SeedArticle): string | null {
  return (getLocale() === 'ja' ? a.summary_ja : a.summary) ?? a.summary ?? null
}

function feedName(feedId: number): string {
  return feeds.find(f => f.id === feedId)?.name ?? 'Unknown'
}

function feedIconUrl(feedId: number): string | null {
  return feeds.find(f => f.id === feedId)?.icon_url ?? null
}

function createFeed(overrides: Partial<SeedFeed> & Pick<SeedFeed, 'name' | 'url'>): SeedFeed {
  return {
    id: nextFeedId++,
    icon_url: null,
    rss_url: overrides.url,
    rss_bridge_url: null,
    view_type: null,
    category_id: null,
    category_name: null,
    lang: getLocale(),
    type: 'rss',
    disabled: 0,
    error_count: 0,
    last_error: null,
    requires_js_challenge: 0,
    etag: null,
    last_modified: null,
    last_content_hash: null,
    next_check_at: null,
    check_interval: null,
    created_at: new Date().toISOString(),
    ...overrides,
  }
}

function createArticle(overrides: Partial<SeedArticle> & Pick<SeedArticle, 'feed_id' | 'title' | 'url'>): SeedArticle {
  const now = new Date().toISOString()
  return {
    id: nextArticleId++,
    full_text: null,
    full_text_translated: null,
    summary: null,
    summary_ja: null,
    excerpt: null,
    lang: null,
    og_image: null,
    published_at: now,
    seen_at: null,
    read_at: null,
    bookmarked_at: null,
    liked_at: null,
    fetched_at: now,
    created_at: now,
    ...overrides,
  }
}

function toArticleListItem(a: SeedArticle): ArticleListItem {
  const feed = feeds.find(f => f.id === a.feed_id)
  return {
    id: a.id,
    feed_id: a.feed_id,
    feed_name: feedName(a.feed_id),
    feed_icon_url: feedIconUrl(a.feed_id),
    feed_view_type: resolveFeedViewType(feed ?? {}),
    article_kind: a.article_kind ?? null,
    title: a.title,
    url: a.url,
    published_at: a.published_at,
    lang: a.lang,
    summary: summarizedIds.has(a.id) ? articleSummary(a) : null,
    excerpt: a.excerpt,
    og_image: a.og_image,
    has_video: /<video\b/i.test(a.full_text ?? ''),
    seen_at: a.seen_at,
    read_at: a.read_at,
    bookmarked_at: a.bookmarked_at,
    liked_at: a.liked_at,
  }
}

function toArticleDetail(a: SeedArticle): ArticleDetail {
  return {
    ...toArticleListItem(a),
    full_text: a.full_text,
    full_text_translated: translatedIds.has(a.id) ? (a.full_text_translated ?? null) : null,
    translated_lang: translatedIds.has(a.id) ? getLocale() : null,
    images_archived_at: null,
    feed_type: feeds.find(f => f.id === a.feed_id)?.type ?? 'rss',
    imageArchivingEnabled: false,
  }
}

function toFeedWithCounts(f: SeedFeed): FeedWithCounts {
  const feedArticles = articles.filter(a => a.feed_id === f.id)
  return {
    ...f,
    icon_url: f.icon_url ?? null,
    category_name: f.category_name,
    article_count: feedArticles.length,
    unread_count: feedArticles.filter(a => a.seen_at == null).length,
    articles_per_week: feedArticles.length > 0 ? Math.round(feedArticles.length / 4) : 0,
    latest_published_at: feedArticles.length > 0
      ? feedArticles.reduce((latest, a) =>
        (a.published_at && (!latest || a.published_at > latest)) ? a.published_at : latest
      , null as string | null)
      : null,
  }
}

export const demoStore = {
  // --- Read ---
  getFeeds() {
    return {
      feeds: feeds.map(f => toFeedWithCounts(f)),
      bookmark_count: articles.filter(a => a.bookmarked_at != null).length,
      like_count: articles.filter(a => a.liked_at != null).length,
      clip_feed_id: feeds.find(f => f.type === 'clip')?.id ?? null,
    }
  },

  getArticles(params: {
    feedId?: number
    categoryId?: number
    unread?: boolean
    bookmarked?: boolean
    liked?: boolean
    read?: boolean
    limit?: number
    offset?: number
  }) {
    let result = articles
      .map(toArticleListItem)
      .sort((a, b) => {
        const da = a.published_at ? new Date(a.published_at).getTime() : 0
        const db = b.published_at ? new Date(b.published_at).getTime() : 0
        return db - da
      })

    if (params.feedId) result = result.filter(a => a.feed_id === params.feedId)
    if (params.categoryId) {
      const feedIds = new Set(feeds.filter(f => f.category_id === params.categoryId).map(f => f.id))
      result = result.filter(a => feedIds.has(a.feed_id))
    }
    if (params.unread) result = result.filter(a => a.seen_at == null)
    if (params.bookmarked) result = result.filter(a => a.bookmarked_at != null)
    if (params.liked) result = result.filter(a => a.liked_at != null)
    if (params.read) result = result.filter(a => a.read_at != null)

    const total = result.length
    const limit = params.limit ?? 20
    const offset = params.offset ?? 0
    return {
      articles: result.slice(offset, offset + limit),
      total,
      has_more: offset + limit < total,
    }
  },

  getArticleByUrl(url: string): ArticleDetail | null {
    const found = articles.find(art => art.url === url)
    return found ? toArticleDetail(found) : null
  },

  getCategories(): { categories: Category[] } {
    const seen = new Map<number, Category>()
    for (const f of feeds) {
      if (f.category_id != null && f.category_name != null && !seen.has(f.category_id)) {
        seen.set(f.category_id, {
          id: f.category_id,
          name: f.category_name,
          sort_order: seen.size,
          collapsed: 0,
          created_at: f.created_at,
        })
      }
    }
    return { categories: [...seen.values()] }
  },

  // --- Write ---
  addFeed(body: { name: string; url: string; category_id?: number; category_name?: string }) {
    const feed = createFeed({
      name: body.name || body.url,
      url: body.url,
      category_id: body.category_id ?? null,
      category_name: body.category_name ?? null,
    })
    feeds.push(feed)
    // Generate a couple of sample articles for the new feed
    const sampleLabel = dt('demo.sampleArticle')
    const sampleBody = dt('demo.sampleArticleBody')
    const baseUrl = body.url.replace(/\/+$/, '')
    for (let i = 0; i < 3; i++) {
      const n = i + 1
      articles.push(createArticle({
        feed_id: feed.id,
        title: `${sampleLabel} ${n} — ${feed.name}`,
        url: `${baseUrl}/sample-${n}`,
        full_text: `# ${sampleLabel} ${n}\n\n${sampleBody}`,
        summary: sampleBody,
        excerpt: sampleBody,
        lang: feed.lang,
        published_at: new Date(Date.now() - i * 86400000).toISOString(),
      }))
    }
    return { feed: toFeedWithCounts(feed) }
  },

  getOrCreateClipFeed(): SeedFeed {
    let clip = feeds.find(f => f.type === 'clip')
    if (!clip) {
      clip = createFeed({ name: 'Clips', url: '', rss_url: null, type: 'clip' })
      feeds.push(clip)
    }
    return clip
  },

  addArticleFromUrl(body: { url: string; force?: boolean }) {
    // Check if article already exists
    const existing = articles.find(a => a.url === body.url)
    if (existing) {
      const feed = feeds.find(f => f.id === existing.feed_id)
      if (feed?.type === 'clip') {
        return { status: 409, data: { error: 'Article already exists', article: existing } }
      }
      if (!body.force) {
        return { status: 409, data: { error: 'Article exists in feed', article: { ...existing, feed_name: feed?.name }, can_force: true } }
      }
      // force: move to clip feed
      const clipFeed = this.getOrCreateClipFeed()
      existing.feed_id = clipFeed.id
      return { status: 200, data: { article: existing, moved: true } }
    }

    const clipFeed = this.getOrCreateClipFeed()
    let hostname = ''
    try { hostname = new URL(body.url).hostname } catch { /* */ }
    const article = createArticle({
      feed_id: clipFeed.id,
      title: hostname || body.url,
      url: body.url,
    })
    articles.push(article)
    return { status: 201, data: { article, created: true } }
  },

  updateFeed(id: number, patch: Record<string, unknown>) {
    const feed = feeds.find(f => f.id === id)
    if (!feed) return null
    Object.assign(feed, patch)
    return { feed: toFeedWithCounts(feed) }
  },

  deleteFeed(id: number) {
    feeds = feeds.filter(f => f.id !== id)
    articles = articles.filter(a => a.feed_id !== id)
    return { success: true }
  },

  markArticleRead(id: number) {
    const article = articles.find(a => a.id === id)
    if (!article) return null
    const now = new Date().toISOString()
    if (!article.seen_at) article.seen_at = now
    if (!article.read_at) article.read_at = now
    return { success: true }
  },

  markAllSeenByFeed(feedId: number) {
    const now = new Date().toISOString()
    articles.filter(a => a.feed_id === feedId).forEach(a => {
      if (!a.seen_at) a.seen_at = now
    })
    return { success: true }
  },

  markAllSeenByCategory(categoryId: number) {
    const now = new Date().toISOString()
    const feedIds = new Set(feeds.filter(f => f.category_id === categoryId).map(f => f.id))
    articles.filter(a => feedIds.has(a.feed_id)).forEach(a => {
      if (!a.seen_at) a.seen_at = now
    })
    return { success: true }
  },

  batchSeen(ids: number[]) {
    const now = new Date().toISOString()
    const idSet = new Set(ids)
    articles.filter(a => idSet.has(a.id)).forEach(a => {
      if (!a.seen_at) a.seen_at = now
    })
    return { success: true }
  },

  toggleBookmark(id: number, bookmarked: boolean) {
    const article = articles.find(a => a.id === id)
    if (!article) return null
    article.bookmarked_at = bookmarked ? new Date().toISOString() : null
    return toArticleDetail(article)
  },

  toggleLike(id: number, liked: boolean) {
    const article = articles.find(a => a.id === id)
    if (!article) return null
    article.liked_at = liked ? new Date().toISOString() : null
    return toArticleDetail(article)
  },

  updateCategory(id: number, patch: Record<string, unknown>) {
    // Categories are derived from feeds, update all feeds in the category
    if (patch.name != null) {
      feeds.filter(f => f.category_id === id).forEach(f => {
        f.category_name = patch.name as string
      })
    }
    if (patch.collapsed != null) {
      // No persistent storage for collapsed; ignored in demo
    }
    return { success: true }
  },

  deleteCategory(id: number) {
    feeds.filter(f => f.category_id === id).forEach(f => {
      f.category_id = null
      f.category_name = null
    })
    return { success: true }
  },

  searchArticles(params: {
    q: string
    bookmarked?: boolean
    liked?: boolean
    unread?: boolean
    since?: string
    limit?: number
  }) {
    const query = params.q.toLowerCase()
    let result = articles.filter(a => {
      const title = a.title.toLowerCase()
      const feed = feedName(a.feed_id).toLowerCase()
      const text = (a.full_text ?? '').toLowerCase()
      const textJa = translatedIds.has(a.id) ? (a.full_text_translated ?? '').toLowerCase() : ''
      return title.includes(query) || feed.includes(query) || text.includes(query) || textJa.includes(query)
    })

    if (params.bookmarked) result = result.filter(a => a.bookmarked_at != null)
    if (params.liked) result = result.filter(a => a.liked_at != null)
    if (params.unread) result = result.filter(a => a.seen_at == null)
    if (params.since) {
      const since = new Date(params.since).getTime()
      result = result.filter(a => a.published_at && new Date(a.published_at).getTime() >= since)
    }

    const limit = params.limit ?? 20
    return {
      articles: result.slice(0, limit).map(a => ({
        id: a.id,
        title: a.title,
        url: a.url,
        feed_name: feedName(a.feed_id),
        published_at: a.published_at,
      })),
    }
  },

  /** Get raw summary text for streaming (not exposed to UI via article fields). */
  getArticleSummary(id: number): string | null {
    const a = articles.find(a => a.id === id)
    if (!a) return null
    return articleSummary(a)
  },

  /** Mark an article as summarized so summary persists for the session. */
  markSummarized(id: number) {
    summarizedIds.add(id)
  },

  /** Get average full_text length for a feed's articles. */
  getFeedAvgContentLength(feedId: number): number | null {
    const feedArticles = articles.filter(a => a.feed_id === feedId && a.full_text)
    if (feedArticles.length === 0) return null
    const total = feedArticles.reduce((sum, a) => sum + (a.full_text?.length ?? 0), 0)
    return total / feedArticles.length
  },

  /** Get full_text length for realistic input_tokens metric. */
  getArticleFullTextLength(id: number): number {
    const a = articles.find(a => a.id === id)
    return a?.full_text?.length ?? 0
  },

  /** Get pre-prepared translation for streaming. */
  getArticleTranslation(id: number): string | null {
    const a = articles.find(a => a.id === id)
    return a?.full_text_translated ?? null
  },

  /** Mark an article as translated so full_text_translated becomes searchable. */
  markTranslated(id: number) {
    translatedIds.add(id)
  },

  // --- Conversations ---
  getConversations(articleId?: number) {
    ensureConversationLocale()
    let result = conversations
    if (articleId != null) {
      result = result.filter(c => c.article_id === articleId)
    }
    return {
      conversations: result.map(({ messages: _m, scope_type, scope_summary, ...rest }) => ({
        ...rest,
        scope_type: scope_type ?? (rest.article_id != null ? 'article' : 'global'),
        scope_summary: scope_summary ?? inferConversationScopeSummary({ ...rest, messages: [], scope_type, scope_summary }),
      }))
        .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()),
    }
  },

  getConversationMessages(conversationId: string) {
    ensureConversationLocale()
    const conv = conversations.find(c => c.id === conversationId)
    if (!conv) return { messages: [] }
    return { messages: conv.messages }
  },

  createConversation(id: string, firstMessage: string, scope?: ChatScope): void {
    ensureConversationLocale()
    const now = new Date().toISOString()
    const content = JSON.stringify([{ type: 'text', text: firstMessage }])
    const inferredScopeType = scope?.type ?? 'global'
    const scopeSummary: ScopeSummary | null = scope?.type === 'article'
      ? { type: 'article', label: 'Current article', detail: null }
      : scope?.type === 'list'
        ? {
            type: 'list',
            label: scope.label,
            detail: scope.count_total > scope.count_scoped
              ? `${scope.count_scoped} / ${scope.count_total}`
              : `${scope.count_scoped}`,
            count_total: scope.count_total,
            count_scoped: scope.count_scoped,
          }
        : { type: 'global', label: 'Global archive', detail: null }
    conversations.push({
      id,
      title: firstMessage.slice(0, 50),
      article_id: scope?.type === 'article' ? scope.article_id : null,
      article_title: null,
      article_url: null,
      article_og_image: null,
      first_user_message: content,
      first_assistant_preview: null,
      created_at: now,
      updated_at: now,
      message_count: 1,
      scope_type: inferredScopeType,
      scope_summary: scopeSummary,
      messages: [{ role: 'user', content }],
    })
  },

  /** Parse OPML and return preview with duplicate detection (no DB writes). */
  previewOpml(xml: string): {
    feeds: { name: string; url: string; rssUrl: string; categoryName: string | null; isDuplicate: boolean }[]
    totalCount: number
    duplicateCount: number
  } {
    const doc = new DOMParser().parseFromString(xml, 'application/xml')
    const existingUrls = new Set(feeds.map(f => f.url))
    const result: { name: string; url: string; rssUrl: string; categoryName: string | null; isDuplicate: boolean }[] = []

    const body = doc.querySelector('body')
    if (!body) return { feeds: result, totalCount: 0, duplicateCount: 0 }

    const collect = (el: Element, categoryName: string | null) => {
      const xmlUrl = el.getAttribute('xmlUrl') || ''
      const htmlUrl = el.getAttribute('htmlUrl') || ''
      const url = htmlUrl || xmlUrl
      if (!url) return
      const name = el.getAttribute('text') || el.getAttribute('title') || url
      result.push({ name, url, rssUrl: xmlUrl, categoryName, isDuplicate: existingUrls.has(url) })
    }

    for (const topOutline of body.children) {
      if (topOutline.tagName !== 'outline') continue
      if (topOutline.getAttribute('xmlUrl')) {
        collect(topOutline, null)
      } else {
        const catName = topOutline.getAttribute('text') || topOutline.getAttribute('title') || null
        for (const child of topOutline.children) {
          if (child.tagName !== 'outline') continue
          collect(child, catName)
        }
      }
    }

    return { feeds: result, totalCount: result.length, duplicateCount: result.filter(f => f.isDuplicate).length }
  },

  /** Import feeds from an OPML XML string, preserving category hierarchy. */
  importOpml(xml: string, selectedUrls?: string[]): { imported: number; skipped: number; errors: string[] } {
    const doc = new DOMParser().parseFromString(xml, 'application/xml')
    let imported = 0
    let skipped = 0
    const errors: string[] = []
    const existingUrls = new Set(feeds.map(f => f.url))
    const selectedUrlSet = selectedUrls ? new Set(selectedUrls) : null

    // Build category name → id map from existing feeds + assign new IDs
    const { categories } = this.getCategories()
    const categoryMap = new Map<string, number>()
    let nextCatId = 1
    for (const cat of categories) {
      categoryMap.set(cat.name, cat.id)
      if (cat.id >= nextCatId) nextCatId = cat.id + 1
    }

    const body = doc.querySelector('body')
    if (!body) return { imported, skipped, errors }

    const importFeed = (el: Element, categoryId: number | null, categoryName: string | null) => {
      const htmlUrl = el.getAttribute('htmlUrl') || ''
      const xmlUrl = el.getAttribute('xmlUrl') || ''
      const url = htmlUrl || xmlUrl
      if (!url) return
      if (selectedUrlSet && !selectedUrlSet.has(url)) return
      if (existingUrls.has(url)) {
        skipped++
        return
      }
      try {
        const name = el.getAttribute('text') || el.getAttribute('title') || new URL(url).hostname
        this.addFeed({
          name,
          url,
          ...(categoryId != null ? { category_id: categoryId, category_name: categoryName ?? undefined } : {}),
        })
        existingUrls.add(url)
        imported++
      } catch (err) {
        errors.push(err instanceof Error ? err.message : 'Unknown error')
      }
    }

    for (const topOutline of body.children) {
      if (topOutline.tagName !== 'outline') continue
      const xmlUrl = topOutline.getAttribute('xmlUrl')

      if (xmlUrl) {
        importFeed(topOutline, null, null)
      } else {
        const catName = topOutline.getAttribute('text') || topOutline.getAttribute('title') || ''
        let catId: number | undefined
        if (catName) {
          if (categoryMap.has(catName)) {
            catId = categoryMap.get(catName)!
          } else {
            catId = nextCatId++
            categoryMap.set(catName, catId)
          }
        }
        for (const child of topOutline.children) {
          if (child.tagName !== 'outline') continue
          importFeed(child, catId ?? null, catName || null)
        }
      }
    }

    return { imported, skipped, errors }
  },

  /** Generate OPML XML from seed feeds. */
  generateOpml(): string {
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    const grouped = new Map<string | null, SeedFeed[]>()
    for (const f of feeds) {
      if (f.type === 'clip') continue
      const cat = f.category_name ?? null
      if (!grouped.has(cat)) grouped.set(cat, [])
      grouped.get(cat)!.push(f)
    }
    const outline = (f: SeedFeed, indent: string) =>
      `${indent}<outline type="rss" text="${esc(f.name)}" title="${esc(f.name)}" xmlUrl="${esc(f.rss_url || f.rss_bridge_url || f.url)}" htmlUrl="${esc(f.url)}" />`
    const lines = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<opml version="2.0">',
      '  <head><title>Oksskolten Feeds</title></head>',
      '  <body>',
    ]
    for (const [cat, catFeeds] of grouped) {
      if (cat === null) continue
      lines.push(`    <outline text="${esc(cat)}" title="${esc(cat)}">`)
      for (const f of catFeeds) lines.push(outline(f, '      '))
      lines.push('    </outline>')
    }
    for (const f of grouped.get(null) ?? []) lines.push(outline(f, '    '))
    lines.push('  </body>', '</opml>')
    return lines.join('\n')
  },

  appendMessage(conversationId: string, role: 'user' | 'assistant', text: string) {
    ensureConversationLocale()
    const conv = conversations.find(c => c.id === conversationId)
    if (!conv) return
    const content = JSON.stringify([{ type: 'text', text }])
    conv.messages.push({ role, content })
    conv.message_count = conv.messages.length
    conv.updated_at = new Date().toISOString()
    // Update first_assistant_preview if this is the first assistant reply
    if (role === 'assistant' && !conv.first_assistant_preview) {
      conv.first_assistant_preview = content
    }
  },
}
