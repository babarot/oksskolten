import { describe, it, expect, beforeEach } from 'vitest'
import { setupTestDb } from '../__tests__/helpers/testDb.js'
import { createFeed, insertArticle } from '../db.js'
import {
  MAX_SCOPE_ARTICLES,
  CHAT_SCOPE_OUT_OF_SCOPE_ERROR,
  normalizeChatScope,
  assertArticleInScope,
  applyScopeToArticleSearch,
} from './scope.js'

beforeEach(() => {
  setupTestDb()
})

function seedFeed() {
  return createFeed({
    name: 'Test Feed',
    url: 'https://example.com',
  })
}

describe('normalizeChatScope', () => {
  it('maps legacy article_id requests to article scope', () => {
    const scope = normalizeChatScope({ article_id: 42 })
    expect(scope).toEqual({ type: 'article', article_id: 42 })
  })

  it('resolves filtered list scope to an immutable capped snapshot', () => {
    const feed = seedFeed()
    for (let i = 0; i < MAX_SCOPE_ARTICLES + 12; i++) {
      insertArticle({
        feed_id: feed.id,
        title: `Unread ${i}`,
        url: `https://example.com/${i}`,
        published_at: `2025-01-${String((i % 28) + 1).padStart(2, '0')}T00:00:00Z`,
      })
    }

    const scope = normalizeChatScope({
      scope: {
        type: 'list',
        mode: 'filtered_list',
        label: 'Unread in feed',
        source_filters: { feed_id: feed.id, unread: true },
      },
    })

    expect(scope.type).toBe('list')
    if (scope.type !== 'list') throw new Error('expected list scope')
    expect(scope.count_total).toBe(MAX_SCOPE_ARTICLES + 12)
    expect(scope.count_scoped).toBe(MAX_SCOPE_ARTICLES)
    expect(scope.article_ids).toHaveLength(MAX_SCOPE_ARTICLES)
    expect(scope.source_filters).toEqual({ feed_id: feed.id, unread: true })
  })
})

describe('scope guards', () => {
  it('assertArticleInScope only restricts list scope', () => {
    expect(() => assertArticleInScope(5, { type: 'global' })).not.toThrow()
    expect(() => assertArticleInScope(5, { type: 'article', article_id: 5 })).not.toThrow()
    expect(() => assertArticleInScope(5, {
      type: 'list',
      mode: 'loaded_list',
      label: 'List',
      count_total: 1,
      count_scoped: 1,
      article_ids: [5],
    })).not.toThrow()
    expect(() => assertArticleInScope(9, {
      type: 'list',
      mode: 'loaded_list',
      label: 'List',
      count_total: 1,
      count_scoped: 1,
      article_ids: [5],
    })).toThrow(CHAT_SCOPE_OUT_OF_SCOPE_ERROR)
  })

  it('applyScopeToArticleSearch injects hidden article_ids only for list scope', () => {
    expect(applyScopeToArticleSearch({ query: 'test' }, { type: 'global' })).toEqual({ query: 'test' })
    expect(applyScopeToArticleSearch({ unread: true }, {
      type: 'list',
      mode: 'loaded_list',
      label: 'List',
      count_total: 2,
      count_scoped: 2,
      article_ids: [1, 2],
    })).toEqual({
      unread: true,
      __scope_article_ids: [1, 2],
    })
  })
})
