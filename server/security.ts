export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' https: data:",
  "media-src 'self' https: blob: data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
].join('; ')
