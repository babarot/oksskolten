import {
  getArticles,
  getArticlesByIds,
  getClipFeed,
  type ArticleDetail,
} from '../db.js'
import type {
  ArticleChatScope,
  ChatScope,
  GlobalChatScope,
  ListChatScope,
  ListChatScopeFilters,
  ScopeSummary,
} from '../../shared/types.js'
import type { ArticleKind } from '../../shared/article-kind.js'

export const MAX_SCOPE_ARTICLES = 500
export const CHAT_SCOPE_OUT_OF_SCOPE_ERROR = 'This action is limited to the current list scope.'

export type IncomingListChatScope =
  | {
      type: 'list'
      mode: 'loaded_list'
      label: string
      article_ids: number[]
      source_filters?: ListChatScopeFilters
    }
  | {
      type: 'list'
      mode: 'filtered_list'
      label: string
      source_filters?: ListChatScopeFilters
    }

export type IncomingChatScope = GlobalChatScope | ArticleChatScope | IncomingListChatScope

function normalizeArticleIds(ids: number[]): number[] {
  const deduped = new Set<number>()
  for (const raw of ids) {
    const id = Number(raw)
    if (Number.isInteger(id) && id > 0) deduped.add(id)
  }
  return [...deduped]
}

function buildLoadedListScope(scope: Extract<IncomingListChatScope, { mode: 'loaded_list' }>, userId?: number | null): ListChatScope {
  const requestedIds = normalizeArticleIds(scope.article_ids)
  const countTotal = requestedIds.length
  const cappedIds = requestedIds.slice(0, MAX_SCOPE_ARTICLES)
  const validIds = getArticlesByIds(cappedIds, undefined, userId).map(article => article.id)

  return {
    type: 'list',
    mode: 'loaded_list',
    label: scope.label,
    count_total: countTotal,
    count_scoped: validIds.length,
    article_ids: validIds,
    ...(scope.source_filters ? { source_filters: scope.source_filters } : {}),
  }
}

function buildFilteredListScope(scope: Extract<IncomingListChatScope, { mode: 'filtered_list' }>, userId?: number | null): ListChatScope {
  const filters = scope.source_filters ?? {}
  const feedId = filters.feed_id
  const categoryId = filters.category_id
  const articleKind = filters.article_kind as ArticleKind | undefined
  const unread = filters.unread === true
  const bookmarked = filters.bookmarked === true
  const liked = filters.liked === true
  const read = filters.read === true
  const isClipFeed = feedId != null && getClipFeed(userId)?.id === feedId
  const smartFloor = !filters.no_floor && !isClipFeed && !unread && !bookmarked && !liked && !read

  const { articles, total } = getArticles({
    feedId,
    categoryId,
    articleKind,
    unread,
    bookmarked,
    liked,
    read,
    limit: MAX_SCOPE_ARTICLES,
    offset: 0,
    smartFloor,
    userId,
  })

  return {
    type: 'list',
    mode: 'filtered_list',
    label: scope.label,
    count_total: total,
    count_scoped: articles.length,
    article_ids: articles.map(article => article.id),
    ...(scope.source_filters ? { source_filters: scope.source_filters } : {}),
  }
}

export function normalizeChatScope(input: {
  scope?: IncomingChatScope
  article_id?: number
  context?: 'home'
  userId?: number | null
}): ChatScope {
  const { scope, article_id, userId } = input
  if (scope) {
    if (scope.type === 'global' || scope.type === 'article') return scope
    return scope.mode === 'loaded_list'
      ? buildLoadedListScope(scope, userId)
      : buildFilteredListScope(scope, userId)
  }

  if (article_id) {
    return { type: 'article', article_id }
  }

  return { type: 'global' }
}

export function serializeChatScope(scope: ChatScope): {
  article_id: number | null
  scope_type: ChatScope['type']
  scope_payload_json: string
} {
  return {
    article_id: scope.type === 'article' ? scope.article_id : null,
    scope_type: scope.type,
    scope_payload_json: JSON.stringify(scope),
  }
}

export function parseStoredChatScope(record: {
  article_id: number | null
  scope_type?: string | null
  scope_payload_json?: string | null
}): ChatScope {
  if (record.scope_type && record.scope_payload_json) {
    try {
      const parsed = JSON.parse(record.scope_payload_json) as ChatScope
      if (parsed?.type === 'global') return parsed
      if (parsed?.type === 'article' && typeof parsed.article_id === 'number') return parsed
      if (parsed?.type === 'list' && Array.isArray(parsed.article_ids)) return parsed
    } catch {
      // fall through to legacy mapping
    }
  }

  if (record.article_id != null) {
    return { type: 'article', article_id: record.article_id }
  }

  return { type: 'global' }
}

export function getChatScopeSummary(scope: ChatScope, article?: Pick<ArticleDetail, 'title' | 'url' | 'og_image'> | null): ScopeSummary {
  if (scope.type === 'article') {
    return {
      type: 'article',
      label: 'Current article',
      detail: article?.title ?? null,
    }
  }

  if (scope.type === 'list') {
    const detail = scope.count_total > scope.count_scoped
      ? `${scope.count_scoped} / ${scope.count_total}`
      : `${scope.count_scoped}`
    return {
      type: 'list',
      label: scope.label,
      detail,
      count_total: scope.count_total,
      count_scoped: scope.count_scoped,
    }
  }

  return {
    type: 'global',
    label: 'Global archive',
    detail: null,
  }
}

export function scopesEqual(a: ChatScope, b: ChatScope): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

export function assertArticleInScope(articleId: number, scope?: ChatScope): void {
  if (!scope || scope.type !== 'list') return
  if (!scope.article_ids.includes(articleId)) {
    throw new Error(CHAT_SCOPE_OUT_OF_SCOPE_ERROR)
  }
}

export function applyScopeToArticleSearch<T extends Record<string, unknown>>(input: T, scope?: ChatScope): T & { __scope_article_ids?: number[] } {
  if (!scope || scope.type !== 'list') return input as T & { __scope_article_ids?: number[] }
  return {
    ...input,
    __scope_article_ids: scope.article_ids,
  }
}
