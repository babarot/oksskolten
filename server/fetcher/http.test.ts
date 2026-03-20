import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const { mockSafeFetch, mockFetchViaFlareSolverr } = vi.hoisted(() => ({
  mockSafeFetch: vi.fn(),
  mockFetchViaFlareSolverr: vi.fn(),
}))

vi.mock('./ssrf.js', () => ({
  safeFetch: (...args: unknown[]) => mockSafeFetch(...args),
}))

vi.mock('./flaresolverr.js', () => ({
  fetchViaFlareSolverr: (...args: unknown[]) => mockFetchViaFlareSolverr(...args),
}))

import { fetchHtml, decodeResponse, USER_AGENT, DEFAULT_TIMEOUT, DISCOVERY_TIMEOUT, PROBE_TIMEOUT } from './http.js'

beforeEach(() => {
  vi.clearAllMocks()
})

// --- constants ---

describe('constants', () => {
  it('exports expected timeout values', () => {
    expect(DEFAULT_TIMEOUT).toBe(15_000)
    expect(DISCOVERY_TIMEOUT).toBe(10_000)
    expect(PROBE_TIMEOUT).toBe(5_000)
  })

  it('exports a user agent string', () => {
    expect(USER_AGENT).toContain('RSSReader')
  })
})

// --- fetchHtml ---

describe('fetchHtml', () => {
  it('returns HTML from successful safeFetch', async () => {
    mockSafeFetch.mockResolvedValue({
      ok: true,
      text: async () => '<html>ok</html>',
      arrayBuffer: async () => new TextEncoder().encode('<html>ok</html>').buffer,
      headers: new Headers({ 'content-type': 'text/html' }),
    })

    const result = await fetchHtml('https://example.com')
    expect(result.html).toBe('<html>ok</html>')
    expect(result.contentType).toBe('text/html')
    expect(result.usedFlareSolverr).toBe(false)
  })

  it('passes User-Agent header and timeout to safeFetch', async () => {
    mockSafeFetch.mockResolvedValue({
      ok: true,
      text: async () => '',
      arrayBuffer: async () => new TextEncoder().encode('').buffer,
      headers: new Headers(),
    })

    await fetchHtml('https://example.com', { timeout: 5000 })

    expect(mockSafeFetch).toHaveBeenCalledWith(
      'https://example.com',
      expect.objectContaining({
        headers: { 'User-Agent': USER_AGENT },
      }),
    )
  })

  it('falls back to FlareSolverr on HTTP error', async () => {
    mockSafeFetch.mockResolvedValue({ ok: false, status: 403 })
    mockFetchViaFlareSolverr.mockResolvedValue({
      body: '<html>flare</html>',
      contentType: 'text/html',
    })

    const result = await fetchHtml('https://example.com')
    expect(result.html).toBe('<html>flare</html>')
    expect(result.usedFlareSolverr).toBe(true)
  })

  it('throws when HTTP error and FlareSolverr returns null', async () => {
    mockSafeFetch.mockResolvedValue({ ok: false, status: 500 })
    mockFetchViaFlareSolverr.mockResolvedValue(null)

    await expect(fetchHtml('https://example.com')).rejects.toThrow('HTTP 500')
  })

  it('goes straight to FlareSolverr when useFlareSolverr option is set', async () => {
    mockFetchViaFlareSolverr.mockResolvedValue({
      body: '<html>direct</html>',
      contentType: 'text/html; charset=utf-8',
    })

    const result = await fetchHtml('https://example.com', { useFlareSolverr: true })
    expect(result.html).toBe('<html>direct</html>')
    expect(result.usedFlareSolverr).toBe(true)
    expect(mockSafeFetch).not.toHaveBeenCalled()
  })

  it('throws when useFlareSolverr is set but FlareSolverr returns null', async () => {
    mockFetchViaFlareSolverr.mockResolvedValue(null)

    await expect(fetchHtml('https://example.com', { useFlareSolverr: true }))
      .rejects.toThrow('FlareSolverr failed')
  })

  it('uses DEFAULT_TIMEOUT when no timeout specified', async () => {
    mockSafeFetch.mockResolvedValue({
      ok: true,
      text: async () => '',
      arrayBuffer: async () => new TextEncoder().encode('').buffer,
      headers: new Headers(),
    })

    await fetchHtml('https://example.com')

    const call = mockSafeFetch.mock.calls[0]
    expect(call[1].signal).toBeDefined()
  })

  it('returns empty content-type when header is missing', async () => {
    mockSafeFetch.mockResolvedValue({
      ok: true,
      text: async () => '',
      arrayBuffer: async () => new TextEncoder().encode('').buffer,
      headers: new Headers(), // no content-type
    })

    const result = await fetchHtml('https://example.com')
    expect(result.contentType).toBe('')
  })
})

// --- decodeResponse ---

function fakeResponse(body: Uint8Array, contentType?: string): Response {
  const headers = new Headers()
  if (contentType) headers.set('content-type', contentType)
  return {
    headers,
    text: async () => new TextDecoder('utf-8').decode(body),
    arrayBuffer: async () => body.buffer,
  } as Response
}

describe('decodeResponse', () => {
  it('uses fast path for explicit UTF-8 charset', async () => {
    const buf = new TextEncoder().encode('hello')
    const res = fakeResponse(buf, 'text/html; charset=utf-8')
    expect(await decodeResponse(res)).toBe('hello')
  })

  it('decodes Shift_JIS from Content-Type charset', async () => {
    // "テスト" in Shift_JIS
    const sjis = new Uint8Array([0x83, 0x65, 0x83, 0x58, 0x83, 0x67])
    const res = fakeResponse(sjis, 'text/html; charset=Shift_JIS')
    expect(await decodeResponse(res)).toBe('テスト')
  })

  it('detects charset from HTML meta tag when Content-Type has no charset', async () => {
    const html = '<html><head><meta charset="Shift_JIS"></head><body>'
    // Encode "テスト" with a Shift_JIS prefix
    const metaBytes = new TextEncoder().encode(html)
    const sjisBody = new Uint8Array([0x83, 0x65, 0x83, 0x58, 0x83, 0x67])
    const buf = new Uint8Array(metaBytes.length + sjisBody.length)
    buf.set(metaBytes, 0)
    buf.set(sjisBody, metaBytes.length)
    const res = fakeResponse(buf, 'text/html')
    const result = await decodeResponse(res)
    expect(result).toContain('テスト')
  })

  it('detects charset from XML encoding declaration', async () => {
    const xmlDecl = '<?xml version="1.0" encoding="Shift_JIS"?>'
    const declBytes = new TextEncoder().encode(xmlDecl)
    const sjisBody = new Uint8Array([0x83, 0x65, 0x83, 0x58, 0x83, 0x67])
    const buf = new Uint8Array(declBytes.length + sjisBody.length)
    buf.set(declBytes, 0)
    buf.set(sjisBody, declBytes.length)
    const res = fakeResponse(buf, 'application/xml')
    const result = await decodeResponse(res)
    expect(result).toContain('テスト')
  })

  it('detects charset from http-equiv with reversed attribute order', async () => {
    const html = '<html><head><meta content="text/html; charset=Shift_JIS" http-equiv="Content-Type"></head>'
    const metaBytes = new TextEncoder().encode(html)
    const sjisBody = new Uint8Array([0x83, 0x65, 0x83, 0x58, 0x83, 0x67])
    const buf = new Uint8Array(metaBytes.length + sjisBody.length)
    buf.set(metaBytes, 0)
    buf.set(sjisBody, metaBytes.length)
    const res = fakeResponse(buf, 'text/html')
    const result = await decodeResponse(res)
    expect(result).toContain('テスト')
  })

  it('falls back to UTF-8 for unknown charset label', async () => {
    const html = '<html><head><meta charset="x-fake-encoding"></head><body>hello</body>'
    const buf = new TextEncoder().encode(html)
    const res = fakeResponse(buf, 'text/html')
    const result = await decodeResponse(res)
    expect(result).toContain('hello')
  })

  it('falls back to UTF-8 when no charset info is available', async () => {
    const buf = new TextEncoder().encode('plain text')
    const res = fakeResponse(buf)
    expect(await decodeResponse(res)).toBe('plain text')
  })
})
