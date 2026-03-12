import { MeiliSearch } from 'meilisearch'

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
  feed_id: number
  category_id: number | null
  title: string
  full_text: string
  full_text_translated: string
  lang: string | null
  published_at: number // Unix timestamp (seconds) for numeric filtering
  score: number
}

/**
 * Build a Meilisearch filter string from optional filter params.
 */
export function buildMeiliFilter(opts: {
  feed_id?: number
  category_id?: number
  since?: string
  until?: string
}): string | undefined {
  const parts: string[] = []
  if (opts.feed_id) parts.push(`feed_id = ${opts.feed_id}`)
  if (opts.category_id) parts.push(`category_id = ${opts.category_id}`)
  if (opts.since) parts.push(`published_at >= ${Math.floor(new Date(opts.since).getTime() / 1000)}`)
  if (opts.until) parts.push(`published_at <= ${Math.floor(new Date(opts.until).getTime() / 1000)}`)
  return parts.length > 0 ? parts.join(' AND ') : undefined
}

/**
 * Simple Meilisearch search — returns hit IDs in ranked order.
 */
export async function meiliSearch(
  query: string,
  opts?: { limit?: number; filter?: string; sort?: string[] },
): Promise<{ id: number }[]> {
  const index = getSearchClient().index(ARTICLES_INDEX)
  const result = await index.search(query, {
    limit: opts?.limit ?? 20,
    filter: opts?.filter,
    sort: opts?.sort,
    attributesToRetrieve: ['id'],
  })
  return result.hits as { id: number }[]
}

/**
 * Paginated Meilisearch search that fetches enough results to satisfy `targetLimit`
 * after post-filtering (unread/liked/bookmarked) is applied in SQLite.
 *
 * @param checkIds - callback that checks which IDs pass the SQLite post-filter,
 *                   returning the subset of IDs that match
 */
export async function meiliSearchWithPagination(
  query: string,
  opts: {
    targetLimit: number
    filter?: string
    sort?: string[]
    checkIds: (ids: number[]) => number[]
    maxPages?: number
  },
): Promise<number[]> {
  const { targetLimit, filter, sort, checkIds, maxPages = 5 } = opts
  const pageSize = targetLimit * 2
  const collected: number[] = []

  for (let page = 0; page < maxPages; page++) {
    const index = getSearchClient().index(ARTICLES_INDEX)
    const result = await index.search(query, {
      limit: pageSize,
      offset: page * pageSize,
      filter,
      sort,
      attributesToRetrieve: ['id'],
    })

    const hits = result.hits as { id: number }[]
    if (hits.length === 0) break

    const ids = hits.map((h) => h.id)
    const passing = checkIds(ids)
    collected.push(...passing)

    if (collected.length >= targetLimit) break
    if (hits.length < pageSize) break // no more results
  }

  return collected.slice(0, targetLimit)
}
