/**
 * Fetch real full_text for demo seed articles.
 *
 * Reads seed/en/articles.json (shared base), fetches each URL via the
 * project's own fetchFullText() pipeline (Readability → Markdown), and
 * writes back the enriched JSON.
 *
 * Usage:
 *   npm exec -- tsx scripts/fetch-demo-seed.ts
 *
 * Options:
 *   --dry-run   Print what would be fetched without writing
 *   --force     Re-fetch even if full_text already looks real (>1500 chars)
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fetchFullText } from '../server/fetcher/content.js'

const CONCURRENCY = 3
const SEED_PATH = resolve(import.meta.dirname!, '../src/lib/demo/seed/articles.json')

// A "template" full_text is short and shares the same boilerplate tail
const REAL_THRESHOLD = 1500

interface SeedArticle {
  id: number
  feed_id: number
  title: string
  url: string
  full_text: string | null
  full_text_translated: string | null
  summary: string | null
  summary_ja: string | null
  excerpt: string | null
  lang: string | null
  og_image: string | null
  published_at: string | null
  seen_at: string | null
  read_at: string | null
  bookmarked_at: string | null
  liked_at: string | null
  fetched_at: string
  created_at: string
}

function isTemplateText(text: string | null): boolean {
  if (!text) return true
  if (text.length < REAL_THRESHOLD) return true
  // The generated template has this exact suffix pattern
  if (text.includes('share your feedback on the issue tracker.')) return true
  return false
}

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const force = process.argv.includes('--force')

  const articles: SeedArticle[] = JSON.parse(readFileSync(SEED_PATH, 'utf-8'))

  const targets = articles.filter(a => force || isTemplateText(a.full_text))
  console.log(`[seed] ${targets.length}/${articles.length} articles to fetch${dryRun ? ' (dry run)' : ''}`)

  if (dryRun) {
    for (const a of targets) {
      console.log(`  #${a.id} ${a.title} → ${a.url}`)
    }
    return
  }

  let done = 0
  let updated = 0
  let failed = 0

  // Simple semaphore
  let active = 0
  const queue: (() => void)[] = []
  async function withLimit<T>(fn: () => Promise<T>): Promise<T> {
    if (active >= CONCURRENCY) {
      await new Promise<void>(resolve => queue.push(resolve))
    }
    active++
    try {
      return await fn()
    } finally {
      active--
      queue.shift()?.()
    }
  }

  await Promise.all(
    targets.map(article =>
      withLimit(async () => {
        try {
          const result = await fetchFullText(article.url)

          if (result.fullText && result.fullText.length > 200) {
            article.full_text = result.fullText
            if (result.ogImage) article.og_image = result.ogImage
            if (result.excerpt) article.excerpt = result.excerpt
            updated++
            console.log(`  ✓ #${article.id} ${article.title} (${result.fullText.length} chars)`)
          } else {
            console.log(`  ⚠ #${article.id} ${article.title} — extraction too short (${result.fullText?.length ?? 0} chars)`)
            failed++
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          console.log(`  ✗ #${article.id} ${article.title} — ${msg}`)
          failed++
        }
        done++
        if (done % 10 === 0 || done === targets.length) {
          console.log(`[seed] progress: ${done}/${targets.length}`)
        }
      }),
    ),
  )

  // Write back
  writeFileSync(SEED_PATH, JSON.stringify(articles, null, 2) + '\n')
  console.log(`[seed] Done. updated: ${updated}, failed: ${failed}, skipped: ${articles.length - targets.length}`)
  console.log(`[seed] Written to ${SEED_PATH}`)

  // Allow worker pool to drain
  setTimeout(() => process.exit(0), 1000)
}

main()
