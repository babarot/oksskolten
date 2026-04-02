// Shared type definitions for Feed, Category, Article and related types.
// Canonical source of truth — server/db.ts re-exports these.

import type { ArticleKind, FeedViewType } from './article-kind.js'

export interface Category {
  id: number
  name: string
  sort_order: number
  collapsed: number
  created_at: string
}

export interface Feed {
  id: number
  name: string
  url: string
  icon_url: string | null
  rss_url: string | null
  rss_bridge_url: string | null
  view_type: FeedViewType | null
  category_id: number | null
  last_error: string | null
  error_count: number
  disabled: number
  requires_js_challenge: number
  type: 'rss' | 'clip'
  etag: string | null
  last_modified: string | null
  last_content_hash: string | null
  next_check_at: string | null
  check_interval: number | null
  created_at: string
}

export interface FeedWithCounts extends Feed {
  category_name: string | null
  article_count: number
  unread_count: number
  articles_per_week: number
  latest_published_at: string | null
}

export interface Article {
  id: number
  feed_id: number
  title: string
  url: string
  article_kind: ArticleKind | null
  published_at: string | null
  lang: string | null
  full_text: string | null
  full_text_translated: string | null
  translated_lang: string | null
  summary: string | null
  og_image: string | null
  notification_body_text: string | null
  notification_media_json: string | null
  notification_media_extracted_at: string | null
  last_error: string | null
  retry_count: number
  last_retry_at: string | null
  fetched_at: string
  seen_at: string | null
  read_at: string | null
  bookmarked_at: string | null
  liked_at: string | null
  created_at: string
}

export interface ArticleListItem {
  id: number
  feed_id: number
  feed_name: string
  feed_icon_url?: string | null
  feed_view_type: FeedViewType
  title: string
  url: string
  article_kind: ArticleKind | null
  published_at: string | null
  lang: string | null
  summary: string | null
  excerpt: string | null
  og_image: string | null
  has_video: boolean
  seen_at: string | null
  read_at: string | null
  bookmarked_at: string | null
  liked_at: string | null
  score?: number
  similar_count?: number
}

export interface ArticleDetail extends ArticleListItem {
  full_text: string | null
  full_text_translated: string | null
  translated_lang: string | null
  images_archived_at: string | null
  feed_type: 'rss' | 'clip'
  imageArchivingEnabled: boolean
}

export interface ListChatScopeFilters {
  feed_id?: number
  category_id?: number
  unread?: boolean
  bookmarked?: boolean
  liked?: boolean
  read?: boolean
  article_kind?: ArticleKind
  no_floor?: boolean
}

export interface GlobalChatScope {
  type: 'global'
}

export interface ArticleChatScope {
  type: 'article'
  article_id: number
}

export interface ListChatScope {
  type: 'list'
  mode: 'loaded_list' | 'filtered_list'
  label: string
  count_total: number
  count_scoped: number
  article_ids: number[]
  source_filters?: ListChatScopeFilters
}

export type ChatScope = GlobalChatScope | ArticleChatScope | ListChatScope

export interface ScopeSummary {
  type: ChatScope['type']
  label: string
  detail?: string | null
  count_total?: number
  count_scoped?: number
}

export interface NotificationChannel {
  id: number
  user_id: number | null
  type: 'feishu_webhook'
  name: string
  webhook_url: string
  secret: string | null
  enabled: number
  created_at: string
  updated_at: string
}

export interface FeedNotificationRule {
  id: number
  user_id: number | null
  feed_id: number
  enabled: number
  translate_enabled: number
  check_interval_minutes: number
  next_check_at: string | null
  last_checked_at: string | null
  created_at: string
  updated_at: string
}

export interface FeedNotificationRuleRecord extends FeedNotificationRule {
  channel_ids: number[]
}
