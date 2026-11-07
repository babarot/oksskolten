/**
 * Normalize a URL so that representations of the same resource compare equal.
 * Beyond what `new URL().href` does (raw-Unicode vs percent-encoded), this also:
 *  - collapses consecutive slashes in the path (#102), and
 *  - uppercases percent-encoded hex triplets (#116).
 * Shared by the server (insert + lookup + migration) and the frontend so every
 * layer produces/compares the same canonical form.
 */
export function normalizeUrl(raw: string): string {
  try {
    const u = new URL(raw)
    // #102: collapse consecutive slashes in the path (keeps the "//" scheme separator)
    u.pathname = u.pathname.replace(/\/{2,}/g, '/')
    // #116: normalize percent-encoded hex to uppercase (raw Unicode is already uppercased
    // by `new URL().href`'s re-encoding; lowercase triplets now become uppercase too)
    return u.href.replace(/%[0-9a-f]{2}/g, (m) => m.toUpperCase())
  } catch { return raw }
}

/**
 * Convert an article's external URL to an in-app path.
 * Query-string characters (?, &, =) are percent-encoded so they stay
 * inside the path segment and are not interpreted as the app's own
 * query parameters by the browser / React Router.
 */
export function articleUrlToPath(url: string): string {
  const isHttp = url.startsWith('http://')
  const raw = url.replace(/^https?:\/\//, '')
  const path = raw.replace(/\?/g, '%3F').replace(/&/g, '%26').replace(/=/g, '%3D').replace(/#/g, '%23')
  // http:// articles get a /http/ prefix so the detail page can reconstruct
  // the original protocol without hardcoding https://.
  return isHttp ? '/http/' + path : '/' + path
}
