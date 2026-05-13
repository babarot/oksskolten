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
  return isHttp ? '/http/' + path : '/' + path
}
