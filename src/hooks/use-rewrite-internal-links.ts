import { useState, useEffect, useRef } from 'react'
import { apiPost } from '../lib/fetcher'
import { articleUrlToPath } from '../lib/url'

export function useRewriteInternalLinks(
  html: string,
  articleUrl: string,
  enabled: boolean,
): { rewrittenHtml: string; rewriting: boolean } {
  // Track which `html` input the rewritten result corresponds to.
  // Until the rewrite for the current input completes, return `html` directly
  // so the user sees content immediately (no blank frame).
  const [result, setResult] = useState<{ source: string; rewritten: string } | null>(null)
  const [rewriting, setRewriting] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const rewrittenHtml = result?.source === html ? result.rewritten : html

  useEffect(() => {
    if (!enabled || !html) {
      setResult({ source: html, rewritten: html })
      return
    }

    let articleHostname: string
    try {
      articleHostname = new URL(articleUrl).hostname
    } catch {
      setResult({ source: html, rewritten: html })
      return
    }

    // Parse HTML with <base> so relative links resolve against the article URL
    const parser = new DOMParser()
    const doc = parser.parseFromString(
      `<base href="${articleUrl}">${html}`,
      'text/html',
    )
    const anchors = doc.querySelectorAll('a[href]')

    // Collect same-domain links: canonical URL (origin+pathname) → elements
    const candidates = new Map<string, HTMLAnchorElement[]>()
    for (const a of anchors as NodeListOf<HTMLAnchorElement>) {
      try {
        const resolved = new URL(a.href) // already resolved by <base>
        if (
          resolved.hostname === articleHostname &&
          (resolved.protocol === 'http:' || resolved.protocol === 'https:')
        ) {
          const canonical = resolved.origin + resolved.pathname
          if (!candidates.has(canonical)) candidates.set(canonical, [])
          candidates.get(canonical)!.push(a as HTMLAnchorElement)
        }
      } catch {
        // malformed — skip
      }
    }

    if (candidates.size === 0) {
      setResult({ source: html, rewritten: html })
      return
    }

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setRewriting(true)

    // Send canonical URLs; DB stores https:// URLs
    const urls = [...candidates.keys()].map((u) =>
      u.replace(/^http:\/\//, 'https://'),
    )

    apiPost('/api/articles/check-urls', { urls })
      .then((data: { existing: string[] }) => {
        if (controller.signal.aborted) return

        const existingSet = new Set(data.existing)
        for (const [canonical, elements] of candidates) {
          const httpsCanonical = canonical.replace(/^http:\/\//, 'https://')
          if (existingSet.has(httpsCanonical)) {
            const internalPath = articleUrlToPath(httpsCanonical)
            for (const el of elements) {
              el.setAttribute('href', internalPath)
              el.setAttribute('data-internal-link', 'true')
            }
          }
        }

        // Extract body innerHTML (skip the <base> tag we added)
        setResult({ source: html, rewritten: doc.body.innerHTML })
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setResult({ source: html, rewritten: html })
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setRewriting(false)
        }
      })

    return () => {
      controller.abort()
    }
  }, [html, articleUrl, enabled])

  return { rewrittenHtml, rewriting }
}
