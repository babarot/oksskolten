import TurndownService from 'turndown'
import { JSDOM } from 'jsdom'

// Lightweight Turndown instance for converting RSS HTML excerpts to Markdown.
// Unlike the worker-thread instance in contentWorker.ts, this skips custom rules
// (barePreBlock, table keep) because RSS descriptions are simple HTML fragments.
const fallbackTurndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' })
fallbackTurndown.keep(['video'])

/** Check if a string contains HTML tags (not just plain text or Markdown). */
const HTML_TAG_RE = /<[a-zA-Z][^>]*>/
const VIDEO_BOOLEAN_ATTRS = new Set(['controls', 'playsinline', 'muted', 'loop'])
const VIDEO_STRING_ATTRS = new Set(['src', 'poster', 'preload'])
const SOURCE_ALLOWED_ATTRS = new Set(['src', 'type'])

function absolutizeUrl(rawUrl: string | null, baseUrl?: string): string | null {
  if (!rawUrl) return null
  if (!baseUrl) return rawUrl
  try {
    return new URL(rawUrl, baseUrl).toString()
  } catch {
    return rawUrl
  }
}

function normalizeVideoHtml(content: string, baseUrl?: string): string {
  const dom = new JSDOM(`<body>${content}</body>`)
  const { document } = dom.window

  for (const video of document.querySelectorAll('video')) {
    for (const { name } of [...video.attributes]) {
      const lower = name.toLowerCase()
      if (VIDEO_BOOLEAN_ATTRS.has(lower)) {
        video.setAttribute(lower, lower)
        continue
      }
      if (VIDEO_STRING_ATTRS.has(lower)) {
        if (lower === 'src' || lower === 'poster') {
          const resolved = absolutizeUrl(video.getAttribute(lower), baseUrl)
          if (resolved) video.setAttribute(lower, resolved)
          else video.removeAttribute(lower)
        }
        continue
      }
      video.removeAttribute(name)
    }

    for (const source of video.querySelectorAll('source')) {
      for (const { name } of [...source.attributes]) {
        const lower = name.toLowerCase()
        if (!SOURCE_ALLOWED_ATTRS.has(lower)) {
          source.removeAttribute(name)
          continue
        }
        if (lower === 'src') {
          const resolved = absolutizeUrl(source.getAttribute('src'), baseUrl)
          if (resolved) source.setAttribute('src', resolved)
          else source.removeAttribute('src')
        }
      }
    }
  }

  return document.body.innerHTML
}

export function extractFirstVideoPoster(content: string, baseUrl?: string): string | null {
  if (!HTML_TAG_RE.test(content)) return null
  const normalized = normalizeVideoHtml(content, baseUrl)
  const dom = new JSDOM(`<body>${normalized}</body>`)
  const poster = dom.window.document.querySelector('video')?.getAttribute('poster')
  return poster?.trim() || null
}

/**
 * Convert RSS feed content to Markdown for use as article full_text.
 * Detects whether the input is HTML, Markdown/plain text, and only applies
 * Turndown conversion for HTML. Plain text and Markdown are returned as-is
 * because Turndown would mangle them (escaping Markdown syntax, collapsing newlines).
 */
export function convertHtmlToMarkdown(content: string, opts?: { baseUrl?: string }): string {
  if (!HTML_TAG_RE.test(content)) return content
  return fallbackTurndown.turndown(normalizeVideoHtml(content, opts?.baseUrl))
}

/**
 * Generate a plain-text excerpt from Markdown by stripping images and links.
 * Used by both contentWorker (page extraction) and fetcher (RSS fallback).
 */
export function markdownToExcerpt(md: string, maxLen = 200): string | null {
  return md
    .replace(/<video\b[\s\S]*?<\/video>/gi, ' ')
    .replace(/<picture\b[\s\S]*?<\/picture>/gi, ' ')
    .replace(/<source\b[^>]*\/?>/gi, ' ')
    .replace(/<img\b[^>]*\/?>/gi, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')        // strip ![alt](url)
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')     // [text](url) → text
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen)
    .trim() || null
}
