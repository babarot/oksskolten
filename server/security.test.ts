import { describe, expect, it } from 'vitest'
import { CONTENT_SECURITY_POLICY } from './security.js'

describe('CONTENT_SECURITY_POLICY', () => {
  it('allows external https media sources for embedded videos', () => {
    expect(CONTENT_SECURITY_POLICY).toContain("media-src 'self' https: blob: data:")
  })

  it('keeps restrictive defaults for non-media content', () => {
    expect(CONTENT_SECURITY_POLICY).toContain("default-src 'self'")
    expect(CONTENT_SECURITY_POLICY).toContain("frame-ancestors 'none'")
  })
})
