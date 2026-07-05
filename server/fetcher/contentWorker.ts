import { JSDOM, VirtualConsole } from 'jsdom'
import { Readability } from '@mozilla/readability'
import TurndownService from 'turndown'
import pino from 'pino'
import { preClean, postClean } from '../lib/cleaner/index.js'
import { findBestContentBlock } from '../lib/cleaner/content-scorer.js'
import type { CleanerConfig } from '../lib/cleaner/selectors.js'
import { markdownToExcerpt } from './markdown-utils.js'

const isDev = process.env.NODE_ENV === 'development'
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  ...(isDev
    ? { transport: { target: 'pino-pretty', options: { translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname' } } }
    : {}),
}).child({ worker: 'contentWorker' })

function createVirtualConsole(articleUrl: string): VirtualConsole {
  const vc = new VirtualConsole()
  vc.on('error', (msg: string) => {
    logger.debug({ articleUrl }, msg)
  })
  return vc
}

const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' })
turndown.keep(['table', 'thead', 'tbody', 'tr', 'th', 'td'])

// Handle bare <pre> elements (without <code> child) as fenced code blocks.
// Many blogs (e.g. Hatena Blog) use <pre class="code lang-sh"> with syntax
// highlighting <span> elements but no wrapping <code> tag.
turndown.addRule('barePreBlock', {
  filter(node) {
    return (
      node.nodeName === 'PRE' &&
      !node.querySelector('code')
    )
  },
  replacement(_content, node) {
    const el = node as HTMLElement
    const lang = el.getAttribute('data-lang') || ''
    const text = el.textContent || ''
    return `\n\n\`\`\`${lang}\n${text.replace(/\n+$/, '')}\n\`\`\`\n\n`
  },
})

export interface ParseHtmlInput {
  html: string
  articleUrl: string
  cleanerConfig?: CleanerConfig
}

export interface ParseHtmlResult {
  fullText: string
  ogImage: string | null
  excerpt: string | null
  title: string | null
}

/**
 * Extract `articleBody` from JSON-LD structured data.
 * News sites often embed their full article text here for SEO, even when the
 * visible page is gated behind a paywall or bot challenge overlay.
 * Uses the pre-mutation metaDoc (scripts are removed during preClean).
 */
function extractJsonLdArticleBody(doc: Document): string | null {
  const scripts = doc.querySelectorAll('script[type="application/ld+json"]')
  for (const script of scripts) {
    try {
      const raw = JSON.parse(script.textContent || '')
      const items: unknown[] = Array.isArray(raw) ? raw : [raw]
      for (const item of items) {
        if (!item || typeof item !== 'object') continue
        const obj = item as Record<string, unknown>
        const type = obj['@type']
        const types: unknown[] = Array.isArray(type) ? type : [type]
        const isArticle = types.some(
          t => typeof t === 'string' && /^(NewsArticle|Article|BlogPosting|ReportageNewsArticle)$/i.test(t),
        )
        if (isArticle && typeof obj.articleBody === 'string' && obj.articleBody.trim().length > 300) {
          return obj.articleBody.trim()
        }
      }
    } catch {
      // Invalid JSON — skip
    }
  }
  return null
}

export function parseHtml(input: ParseHtmlInput): ParseHtmlResult {
  const { html, articleUrl, cleanerConfig } = input

  // Extract og:image and og:title before any DOM mutation
  const vc = createVirtualConsole(articleUrl)
  const metaDom = new JSDOM(html, { url: articleUrl, virtualConsole: vc })
  const metaDoc = metaDom.window.document
  const ogImageRaw = metaDoc
    .querySelector('meta[property="og:image"]')
    ?.getAttribute('content') || null
  const ogImage = ogImageRaw ? new URL(ogImageRaw, articleUrl).toString() : null
  const ogTitle = metaDoc
    .querySelector('meta[property="og:title"]')
    ?.getAttribute('content')?.trim() || null
  const htmlTitle = metaDoc.querySelector('title')?.textContent?.trim() || null

  // Try JSON-LD first — news sites embed full articleBody here even when paywalled.
  // Must run before preClean (which removes <script> tags).
  const jsonLdBody = extractJsonLdArticleBody(metaDoc)

  // Phase 1: pre-clean (safe element removal before Readability)
  const domForCleaning = new JSDOM(html, { url: articleUrl, virtualConsole: vc })
  try {
    preClean(domForCleaning.window.document, cleanerConfig)
  } catch {
    // Fail-open: continue with original HTML if pre-clean fails
  }

  // Phase 2: Readability extraction (uses pre-cleaned HTML)
  const domForReadability = new JSDOM(domForCleaning.serialize(), { url: articleUrl, virtualConsole: vc })
  let article = new Readability(domForReadability.window.document).parse()

  let contentHtml = article?.content || null
  let readabilityTextLen = (article?.textContent || '').replace(/\s+/g, ' ').trim().length

  // Validate Readability result against enhanced content-block scoring.
  const bestBlock = findBestContentBlock(domForCleaning.window.document)
  if (bestBlock && bestBlock.pRatio > 0.3) {
    const bestTextLen = bestBlock.el.textContent?.replace(/\s+/g, ' ').trim().length || 0
    if (bestTextLen > readabilityTextLen * 2) {
      contentHtml = bestBlock.el.innerHTML
      readabilityTextLen = bestTextLen
    }
  }

  // If JSON-LD has substantially more text than Readability/content-scorer, use it.
  // This helps paywalled news sites where the visual HTML only shows a teaser.
  if (jsonLdBody) {
    const jsonLdLen = jsonLdBody.replace(/\s+/g, ' ').trim().length
    if (jsonLdLen > readabilityTextLen * 1.5) {
      // Convert plain text paragraphs to minimal HTML for the post-clean / Turndown pipeline.
      // jsonLdBody is plain text from an untrusted feed, so escape HTML metacharacters
      // before wrapping — otherwise stray </> would be parsed as markup downstream.
      const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      contentHtml = jsonLdBody
        .split(/\n{2,}/)
        .map(p => `<p>${escapeHtml(p.trim().replace(/\n/g, ' '))}</p>`)
        .filter(p => p.length > 7)
        .join('\n')
    }
  }

  if (!contentHtml) throw new Error('Readability: could not extract article')

  // Phase 3: post-clean (selector removal + scoring + HTML normalization)
  const contentDom = new JSDOM(contentHtml, { url: articleUrl, virtualConsole: vc })
  const contentDoc = contentDom.window.document
  try {
    postClean(contentDoc, cleanerConfig)
  } catch {
    // Fail-open: continue with Readability output if post-clean fails
  }

  // Simplify <picture> elements to plain <img> before Turndown conversion.
  for (const pic of contentDoc.querySelectorAll('picture')) {
    const img = pic.querySelector('img')
    if (img) {
      let src = img.getAttribute('src')
      if (!src) {
        const srcset = img.getAttribute('srcset')
        if (srcset) src = srcset.split(',')[0].trim().split(/\s+/)[0]
      }
      if (src) img.setAttribute('src', new URL(src, articleUrl).toString())
      img.removeAttribute('srcset')
      pic.replaceWith(img)
    } else {
      const source = pic.querySelector('source')
      const srcset = source?.getAttribute('srcset')
      if (srcset) {
        const firstUrl = srcset.split(',')[0].trim().split(/\s+/)[0]
        const newImg = contentDoc.createElement('img')
        newImg.setAttribute('src', new URL(firstUrl, articleUrl).toString())
        pic.replaceWith(newImg)
      } else {
        pic.remove()
      }
    }
  }

  let fullText = turndown.turndown(contentDoc.body.innerHTML)
  fullText = fullText.replace(
    /\[\s*\n+\s*(!\[[^\]]*\]\([^)]*\))\s*\n+\s*\]\s*\(([^)]*)\)/g,
    (_m, img, url) => `[${img}](${url})`,
  )
  fullText = fullText.replace(
    /\[([^\]]*(?:\n[^\]]*)+)\]\(([^)]+)\)/g,
    (_m, text, url) => `[${text.replace(/\s*\n\s*/g, ' ').trim()}](${url})`,
  )
  const excerpt = markdownToExcerpt(fullText)

  const title = article?.title || ogTitle || htmlTitle
  return { fullText, ogImage, excerpt, title }
}

// piscina default export: receives serializable input, returns serializable output
export default function (input: ParseHtmlInput): ParseHtmlResult {
  return parseHtml(input)
}
