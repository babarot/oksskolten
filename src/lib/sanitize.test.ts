import { describe, it, expect } from 'vitest'
import { sanitizeHtml } from './sanitize'

describe('sanitizeHtml', () => {
  it('removes iframe tags', () => {
    const html = '<p>Hello</p><iframe src="https://evil.com"></iframe>'
    const result = sanitizeHtml(html)
    expect(result).not.toContain('iframe')
    expect(result).toContain('Hello')
  })

  it('removes script tags', () => {
    const html = '<p>Safe</p><script>alert("xss")</script>'
    const result = sanitizeHtml(html)
    expect(result).not.toContain('script')
    expect(result).toContain('Safe')
  })

  it('allows picture and source tags', () => {
    const html = '<picture><source srcset="img.webp" type="image/webp"><img src="img.jpg"></picture>'
    const result = sanitizeHtml(html)
    expect(result).toContain('<picture>')
    expect(result).toContain('<source')
    expect(result).toContain('srcset')
  })

  it('adds loading=lazy to img tags', () => {
    const html = '<img src="photo.jpg">'
    const result = sanitizeHtml(html)
    expect(result).toContain('loading="lazy"')
  })

  it('allows video tags and media attributes', () => {
    const html = '<video src="https://video.example.com/post.mp4" poster="https://img.example.com/post.jpg" controls playsinline preload="metadata"></video>'
    const result = sanitizeHtml(html)
    expect(result).toContain('<video')
    expect(result).toContain('poster="https://img.example.com/post.jpg"')
    expect(result).toContain('controls=""')
    expect(result).toContain('playsinline=""')
  })

  it('preserves nested video source urls', () => {
    const html = '<video controls><source src="https://video.example.com/post.mp4" type="video/mp4"></video>'
    const result = sanitizeHtml(html)
    expect(result).toContain('<source')
    expect(result).toContain('src="https://video.example.com/post.mp4"')
    expect(result).toContain('type="video/mp4"')
  })

  it('preserves normal HTML', () => {
    const html = '<h1>Title</h1><p>Paragraph with <a href="https://example.com">link</a></p>'
    const result = sanitizeHtml(html)
    expect(result).toContain('<h1>Title</h1>')
    expect(result).toContain('<a href="https://example.com">')
  })
})
