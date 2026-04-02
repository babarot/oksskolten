import type { ChatScope, ListChatScopeFilters, ScopeSummary } from '../../shared/types'
import type { TranslateFn } from './i18n'

export function buildGlobalScope(): ChatScope {
  return { type: 'global' }
}

export function buildArticleScope(articleId: number): ChatScope {
  return { type: 'article', article_id: articleId }
}

export function buildLoadedListScope(label: string, articleIds: number[], sourceFilters?: ListChatScopeFilters): ChatScope {
  return {
    type: 'list',
    mode: 'loaded_list',
    label,
    count_total: articleIds.length,
    count_scoped: articleIds.length,
    article_ids: articleIds,
    ...(sourceFilters ? { source_filters: sourceFilters } : {}),
  }
}

export function buildFilteredListScope(label: string, sourceFilters?: ListChatScopeFilters): ChatScope {
  return {
    type: 'list',
    mode: 'filtered_list',
    label,
    count_total: 0,
    count_scoped: 0,
    article_ids: [],
    ...(sourceFilters ? { source_filters: sourceFilters } : {}),
  }
}

export function summarizeScope(scope: ChatScope | null | undefined, t: TranslateFn, articleTitle?: string | null): ScopeSummary | null {
  if (!scope) return null
  if (scope.type === 'global') {
    return { type: 'global', label: t('chat.scope.global'), detail: null }
  }
  if (scope.type === 'article') {
    return {
      type: 'article',
      label: t('chat.scope.article'),
      detail: articleTitle ?? null,
    }
  }
  return {
    type: 'list',
    label: scope.label,
    detail: scope.count_total > scope.count_scoped
      ? t('chat.scope.countClipped', { scoped: String(scope.count_scoped), total: String(scope.count_total) })
      : t('chat.scope.countSingle', { count: String(scope.count_scoped) }),
    count_total: scope.count_total,
    count_scoped: scope.count_scoped,
  }
}

export function isListScope(scope: ChatScope | null | undefined): scope is Extract<ChatScope, { type: 'list' }> {
  return !!scope && scope.type === 'list'
}
