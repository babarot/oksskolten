// Re-export shared types
export type {
  Category,
  Feed,
  FeedWithCounts,
  Article,
  ArticleListItem,
  ArticleDetail,
  ChatScope,
  ListChatScope,
  ListChatScopeFilters,
  ScopeSummary,
} from '../../shared/types.js'

export interface Conversation {
  id: string
  user_id: number | null
  title: string | null
  article_id: number | null
  scope_type: 'global' | 'article' | 'list' | null
  scope_payload_json: string | null
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
