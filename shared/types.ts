// Shared type definitions for Feed, Category, Article and related types.
// Canonical source of truth — server/db.ts re-exports these.

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
  rss_url: string | null
  rss_bridge_url: string | null
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
  published_at: string | null
  lang: string | null
  full_text: string | null
  full_text_translated: string | null
  translated_lang: string | null
  summary: string | null
  og_image: string | null
  last_error: string | null
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
  title: string
  url: string
  published_at: string | null
  lang: string | null
  summary: string | null
  excerpt: string | null
  og_image: string | null
  seen_at: string | null
  read_at: string | null
  bookmarked_at: string | null
  liked_at: string | null
  score?: number
}

export interface ArticleDetail extends ArticleListItem {
  full_text: string | null
  full_text_translated: string | null
  translated_lang: string | null
  images_archived_at: string | null
  feed_type: 'rss' | 'clip'
  imageArchivingEnabled: boolean
}
