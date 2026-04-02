import { demoStore } from './demo-store'
import { dt, getLocale, streamText } from './i18n'

// ---------------------------------------------------------------------------
// Intercept global fetch for endpoints that use raw fetch (SSE streams, etc.)
// ---------------------------------------------------------------------------
const originalFetch = window.fetch.bind(window)

function sseResponse(events: Array<Record<string, unknown>>, delayMs = 200): Response {
  const encoder = new TextEncoder()
  let index = 0
  const stream = new ReadableStream({
    async pull(controller) {
      if (index < events.length) {
        await new Promise(r => setTimeout(r, delayMs))
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(events[index])}\n\n`))
        index++
      } else {
        controller.close()
      }
    },
  })
  return new Response(stream, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  })
}

window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  const parsed = new URL(url, location.origin)
  const path = parsed.pathname
  const method = (init?.method ?? 'GET').toUpperCase()

  // POST /api/feeds — SSE step-based feed addition
  if (method === 'POST' && path === '/api/feeds') {
    const body = JSON.parse((init?.body as string) || '{}')
    const result = demoStore.addFeed(body)
    const feed = result.feed as { id: number; rss_url: string | null; rss_bridge_url: string | null }
    return sseResponse([
      { type: 'step', step: 'rss-discovery', status: 'running' },
      { type: 'step', step: 'rss-discovery', status: 'done', found: true },
      { type: 'step', step: 'rss-bridge', status: 'skipped' },
      { type: 'step', step: 'css-selector', status: 'skipped' },
      { type: 'done', feed: { id: feed.id, rss_url: feed.rss_url, rss_bridge_url: feed.rss_bridge_url } },
    ], 300)
  }

  // GET /api/discover-title — return hostname as title
  if (method === 'GET' && path === '/api/discover-title') {
    const targetUrl = parsed.searchParams.get('url') || ''
    let title = 'Demo Feed'
    try { title = new URL(targetUrl).hostname } catch { /* */ }
    return new Response(JSON.stringify({ title }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  return originalFetch(input, init)
}

// Map suggestion keys to demo reply i18n keys.
const suggestionReplyMap: Record<string, 'demo.chatReply.recommend' | 'demo.chatReply.unread' | 'demo.chatReply.trending' | 'demo.chatReply.surprise' | 'demo.chatReply.digest'> = {
  recommend: 'demo.chatReply.recommend',
  unread: 'demo.chatReply.unread',
  trending: 'demo.chatReply.trending',
  surprise: 'demo.chatReply.surprise',
  digest: 'demo.chatReply.digest',
}

function matchSuggestionReply(suggestionKey: string | undefined): string | null {
  if (!suggestionKey) return null
  const replyKey = suggestionReplyMap[suggestionKey]
  return replyKey ? dt(replyKey) : null
}

let demoProfileCustomName: string | null = null
let demoProfileAvatarSeed: string | null = null

/** Narrow unknown body to a typed object. No runtime validation (demo-only). */
function asBody<T>(body: unknown): T {
  return (body ?? {}) as T
}

function parsePath(url: string) {
  const parsed = new URL(url, 'http://localhost')
  return { path: parsed.pathname, params: parsed.searchParams }
}

function extractId(path: string, pattern: RegExp): number | null {
  const m = path.match(pattern)
  return m ? Number(m[1]) : null
}

// --- GET (SWR fetcher signature) ---
export async function demoFetcher(url: string): Promise<unknown> {
  const { path, params } = parsePath(url)

  if (path === '/api/feeds') {
    return demoStore.getFeeds()
  }

  if (path === '/api/articles') {
    return demoStore.getArticles({
      feedId: params.get('feed_id') ? Number(params.get('feed_id')) : undefined,
      categoryId: params.get('category_id') ? Number(params.get('category_id')) : undefined,
      unread: params.get('unread') === '1',
      bookmarked: params.get('bookmarked') === '1',
      liked: params.get('liked') === '1',
      read: params.get('read') === '1',
      limit: Number(params.get('limit')) || 20,
      offset: Number(params.get('offset')) || 0,
    })
  }

  if (path === '/api/articles/by-url') {
    const article = demoStore.getArticleByUrl(params.get('url')!)
    if (!article) throw new Error('Article not found')
    return article
  }

  if (path === '/api/categories') {
    return demoStore.getCategories()
  }

  if (path === '/api/me') {
    return { email: 'demo@example.com' }
  }

  if (path === '/api/settings/profile') {
    return { language: getLocale(), account_name: demoProfileCustomName ?? dt('demo.defaultUser'), avatar_seed: demoProfileAvatarSeed }
  }

  if (path === '/api/settings/preferences') {
    return {
      'reading.auto_mark_read': 'on',
      'chat.provider': 'anthropic',
      'chat.model': 'claude-haiku-4-5-20251001',
      'summary.provider': 'anthropic',
      'summary.model': 'claude-haiku-4-5-20251001',
      'translate.provider': 'deepl',
      'translate.model': '',
      'translate.target_lang': null,
    }
  }

  if (path === '/api/chat/conversations') {
    const articleId = params.get('article_id') ? Number(params.get('article_id')) : undefined
    return demoStore.getConversations(articleId)
  }

  // /api/chat/:id/messages
  const convMsgMatch = path.match(/^\/api\/chat\/([^/]+)\/messages$/)
  if (convMsgMatch) {
    return demoStore.getConversationMessages(convMsgMatch[1])
  }

  // /api/feeds/:id/metrics
  const metricsId = extractId(path, /^\/api\/feeds\/(\d+)\/metrics$/)
  if (metricsId != null) {
    return { avg_content_length: demoStore.getFeedAvgContentLength(metricsId) }
  }

  if (path.startsWith('/api/search')) {
    return { results: [] }
  }

  if (path === '/api/settings/auth-methods') {
    return { password: true, passkey: false, github: false }
  }

  // API key status: Anthropic and DeepL are "configured" in demo
  const apiKeyMatch = path.match(/^\/api\/settings\/api-keys\/(.+)$/)
  if (apiKeyMatch) {
    const provider = apiKeyMatch[1]
    const configured = provider !== 'claude-code'
    return { configured }
  }

  // Claude Code status: not installed in demo
  if (path === '/api/chat/claude-code-status') {
    return { loggedIn: false, error: 'not found' }
  }

  // Translation service usage stats
  if (path === '/api/settings/deepl/usage') {
    return { monthlyChars: 128400, freeTierRemaining: 371600 }
  }
  if (path === '/api/settings/google-translate/usage') {
    return { monthlyChars: 0, freeTierRemaining: 500000 }
  }

  if (path.startsWith('/api/settings')) {
    return {}
  }

  // Fallback: return empty object for unknown GETs
  return {}
}

// --- POST ---
export async function demoApiPost(url: string, body?: unknown): Promise<unknown> {
  const { path } = parsePath(url)

  // POST /api/feeds is handled by the fetch interceptor (SSE response)

  // /api/articles/from-url (web clip)
  if (path === '/api/articles/from-url') {
    const { url: articleUrl, force } = asBody<{ url: string; force?: boolean }>(body)
    const result = demoStore.addArticleFromUrl({ url: articleUrl, force })
    if (result.status === 409) {
      const { ApiError } = await import('../api-base')
      throw new ApiError('Conflict', 409, result.data as Record<string, unknown>)
    }
    return result.data
  }

  // /api/feeds/:id/mark-all-seen
  const markAllSeenFeed = extractId(path, /^\/api\/feeds\/(\d+)\/mark-all-seen$/)
  if (markAllSeenFeed != null) {
    return demoStore.markAllSeenByFeed(markAllSeenFeed)
  }

  // /api/categories/:id/mark-all-seen
  const markAllSeenCat = extractId(path, /^\/api\/categories\/(\d+)\/mark-all-seen$/)
  if (markAllSeenCat != null) {
    return demoStore.markAllSeenByCategory(markAllSeenCat)
  }

  // /api/articles/:id/read
  const readId = extractId(path, /^\/api\/articles\/(\d+)\/read$/)
  if (readId != null) {
    return demoStore.markArticleRead(readId)
  }

  // /api/articles/batch-seen
  if (path === '/api/articles/batch-seen') {
    const { ids } = asBody<{ ids: number[] }>(body)
    return demoStore.batchSeen(ids)
  }

  // AI features — return demo message (actual streaming happens via streamPost/streamPostChat)
  if (path.match(/^\/api\/articles\/\d+\/summarize/)) {
    return { text: dt('demo.summaryReply'), cached: true }
  }
  if (path.match(/^\/api\/articles\/\d+\/translate/)) {
    return { text: dt('demo.translateReply'), cached: true }
  }

  // Chat — handled via streamPostChat
  if (path.startsWith('/api/chat')) {
    return {}
  }

  // Feed fetch — no-op in demo
  if (path.match(/^\/api\/feeds\/\d+\/fetch$/)) {
    return { success: true }
  }

  // API key save — no-op in demo
  if (path.match(/^\/api\/settings\/api-keys\//)) {
    return { success: true }
  }

  // GET /api/discover-title is handled by the fetch interceptor

  return {}
}

// --- PATCH ---
export async function demoApiPatch(url: string, body: unknown): Promise<unknown> {
  const { path } = parsePath(url)

  // /api/feeds/:id
  const feedId = extractId(path, /^\/api\/feeds\/(\d+)$/)
  if (feedId != null) {
    return demoStore.updateFeed(feedId, asBody<Record<string, unknown>>(body))
  }

  // /api/articles/:id/bookmark
  const bookmarkId = extractId(path, /^\/api\/articles\/(\d+)\/bookmark$/)
  if (bookmarkId != null) {
    const { bookmarked } = asBody<{ bookmarked: boolean }>(body)
    return demoStore.toggleBookmark(bookmarkId, bookmarked)
  }

  // /api/articles/:id/like
  const likeId = extractId(path, /^\/api\/articles\/(\d+)\/like$/)
  if (likeId != null) {
    const { liked } = asBody<{ liked: boolean }>(body)
    return demoStore.toggleLike(likeId, liked)
  }

  // /api/categories/:id
  const catId = extractId(path, /^\/api\/categories\/(\d+)$/)
  if (catId != null) {
    return demoStore.updateCategory(catId, asBody<Record<string, unknown>>(body))
  }

  // /api/settings/profile
  if (path === '/api/settings/profile') {
    const patch = asBody<Record<string, unknown>>(body)
    if (patch.account_name != null) demoProfileCustomName = patch.account_name as string
    if (patch.avatar_seed !== undefined) demoProfileAvatarSeed = patch.avatar_seed as string | null
    return { account_name: demoProfileCustomName ?? dt('demo.defaultUser'), avatar_seed: demoProfileAvatarSeed }
  }

  // /api/settings/preferences
  if (path === '/api/settings/preferences') {
    return {} // no-op, settings are localStorage-based
  }

  return {}
}

// --- DELETE ---
export async function demoApiDelete(url: string): Promise<unknown> {
  const { path } = parsePath(url)

  // /api/feeds/:id
  const feedId = extractId(path, /^\/api\/feeds\/(\d+)$/)
  if (feedId != null) {
    return demoStore.deleteFeed(feedId)
  }

  // /api/categories/:id
  const catId = extractId(path, /^\/api\/categories\/(\d+)$/)
  if (catId != null) {
    return demoStore.deleteCategory(catId)
  }

  return {}
}

// --- streamPost stub (summarize / translate) ---
export async function demoStreamPost(
  url: string,
  onDelta: (text: string) => void,
): Promise<{ usage: { input_tokens: number; output_tokens: number; billing_mode?: 'anthropic' | 'gemini' | 'openai' | 'claude-code' | 'google-translate'; model?: string } }> {
  let text: string
  let inputTokens: number
  if (url.includes('summarize')) {
    const id = extractId(url, /\/api\/articles\/(\d+)\/summarize/)
    text = (id != null ? demoStore.getArticleSummary(id) : null) ?? dt('demo.summaryReply')
    inputTokens = id != null ? demoStore.getArticleFullTextLength(id) : text.length
    if (id != null) demoStore.markSummarized(id)
  } else {
    const id = extractId(url, /\/api\/articles\/(\d+)\/translate/)
    text = (id != null ? demoStore.getArticleTranslation(id) : null) ?? dt('demo.translateReply')
    inputTokens = id != null ? demoStore.getArticleFullTextLength(id) : text.length
    if (id != null) demoStore.markTranslated(id)
    // Simulate translation API latency (0.5–1.5s) then return all at once
    await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 1000))
    onDelta(text)
    return { usage: { input_tokens: inputTokens, output_tokens: text.length, billing_mode: 'anthropic', model: 'demo' } }
  }
  await streamText(text, onDelta)
  return { usage: { input_tokens: inputTokens, output_tokens: text.length, billing_mode: 'anthropic', model: 'demo' } }
}

// --- streamPostChat stub ---
export async function demoStreamPostChat(
  _url: string,
  body: unknown,
  onEvent: (event: { type: string; text?: string; conversation_id?: string; usage?: { input_tokens: number; output_tokens: number }; elapsed_ms?: number; model?: string }) => void,
): Promise<void> {
  const { conversation_id, message, suggestion_key, scope } = (body ?? {}) as { conversation_id?: string; message?: string; suggestion_key?: string; scope?: import('../../../shared/types').ChatScope }
  const isNew = !conversation_id
  const resolvedId = conversation_id ?? crypto.randomUUID()
  onEvent({ type: 'conversation_id', conversation_id: resolvedId })

  // Persist user message to in-memory store
  if (message) {
    if (isNew) {
      demoStore.createConversation(resolvedId, message, scope)
    } else {
      demoStore.appendMessage(resolvedId, 'user', message)
    }
  }

  const replyText = matchSuggestionReply(suggestion_key) ?? dt('demo.chatReply')
  const start = Date.now()
  await streamText(replyText, (chunk) => {
    onEvent({ type: 'text_delta', text: chunk })
  })

  // Persist assistant reply to in-memory store
  demoStore.appendMessage(resolvedId, 'assistant', replyText)

  onEvent({ type: 'done', usage: { input_tokens: replyText.length, output_tokens: replyText.length }, elapsed_ms: Date.now() - start, model: 'demo' })
}
