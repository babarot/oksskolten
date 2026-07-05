// Re-export shared types
export type { Category, Feed, FeedWithCounts, Article, ArticleListItem, ArticleDetail, Label, LabelWithCount } from '../../shared/types.js'

export interface Conversation {
  id: string
  title: string | null
  article_id: number | null
  created_at: string
  updated_at: string
}

export interface ChatMessage {
  id: number
  conversation_id: string
  role: 'user' | 'assistant'
  content: string
  created_at: string
}
