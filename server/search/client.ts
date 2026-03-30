import { MeiliSearch } from 'meilisearch'
import { getCurrentUserId } from '../identity.js'

const MEILI_URL = process.env.MEILI_URL || 'http://localhost:7700'
const MEILI_MASTER_KEY = process.env.MEILI_MASTER_KEY || undefined

let client: MeiliSearch | null = null

export function getSearchClient(): MeiliSearch {
  if (!client) {
    client = new MeiliSearch({ host: MEILI_URL, apiKey: MEILI_MASTER_KEY })
  }
  return client
}

export const ARTICLES_INDEX = 'articles'
export const ARTICLES_STAGING_INDEX = 'articles_staging'

export interface MeiliArticleDoc {
  id: number
  user_id: number | null
  feed_id: number
  category_id: number | null
  title: string
  full_text: string
  full_text_translated: string
  lang: string | null
  published_at: number // Unix timestamp (seconds) for numeric filtering
  score: number
  is_unread: boolean
  is_liked: boolean
  is_bookmarked: boolean
}

/**
 * Build a Meilisearch filter string from optional filter params.
 */
export function buildMeiliFilter(opts: {
  user_id?: number | null
  feed_id?: number
  category_id?: number
  since?: string
  until?: string
  unread?: boolean
  liked?: boolean
  bookmarked?: boolean
}): string | undefined {
  const parts: string[] = []
  const userId = opts.user_id ?? getCurrentUserId()
  if (userId != null) parts.push(`user_id = ${userId}`)
  if (opts.feed_id) parts.push(`feed_id = ${opts.feed_id}`)
  if (opts.category_id) parts.push(`category_id = ${opts.category_id}`)
  if (opts.since) parts.push(`published_at >= ${Math.floor(new Date(opts.since).getTime() / 1000)}`)
  if (opts.until) parts.push(`published_at <= ${Math.floor(new Date(opts.until).getTime() / 1000)}`)
  if (opts.unread !== undefined) parts.push(`is_unread = ${opts.unread}`)
  if (opts.liked) parts.push('is_liked = true')
  if (opts.bookmarked) parts.push('is_bookmarked = true')
  return parts.length > 0 ? parts.join(' AND ') : undefined
}

/**
 * Simple Meilisearch search — returns hit IDs in ranked order.
 */
export async function meiliSearch(
  query: string,
  opts?: { limit?: number; offset?: number; filter?: string; sort?: string[] },
): Promise<{ hits: { id: number }[]; estimatedTotalHits: number }> {
  const index = getSearchClient().index(ARTICLES_INDEX)
  const result = await index.search(query, {
    limit: opts?.limit ?? 20,
    offset: opts?.offset ?? 0,
    filter: opts?.filter,
    sort: opts?.sort,
    attributesToRetrieve: ['id'],
  })
  return {
    hits: result.hits as { id: number }[],
    estimatedTotalHits: result.estimatedTotalHits ?? 0,
  }
}
