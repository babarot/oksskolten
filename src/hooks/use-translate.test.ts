import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// --- Mocks ---

const mockStreamPost = vi.fn()

vi.mock('../lib/fetcher', () => ({
  streamPost: (...args: unknown[]) => mockStreamPost(...args),
}))

vi.mock('marked', () => ({
  marked: {
    parse: (text: string) => `<p>${text}</p>`,
  },
}))

vi.mock('../lib/sanitize', () => ({
  sanitizeHtml: (html: string) => html,
}))

function mockMetrics() {
  return {
    metrics: null as { time: number; inputTokens: number; outputTokens: number } | null,
    report: vi.fn(),
    reset: vi.fn(),
    formatMetrics: vi.fn(() => null),
  }
}

import { useTranslate } from './use-translate'

describe('useTranslate', () => {
  beforeEach(() => {
    mockStreamPost.mockReset()
  })

  it('initializes fullTextTranslated from article.full_text_translated', () => {
    const metrics = mockMetrics()
    const { result } = renderHook(() =>
      useTranslate({ id: 1, full_text_translated: '翻訳済みテキスト' }, metrics),
    )
    expect(result.current.fullTextTranslated).toBe('翻訳済みテキスト')
  })

  it('sets viewMode to ja when translation exists', () => {
    const metrics = mockMetrics()
    const { result } = renderHook(() =>
      useTranslate({ id: 1, full_text_translated: '翻訳' }, metrics),
    )
    expect(result.current.viewMode).toBe('translated')
  })

  it('defaults viewMode to original when no translation', () => {
    const metrics = mockMetrics()
    const { result } = renderHook(() =>
      useTranslate({ id: 1, full_text_translated: null }, metrics),
    )
    expect(result.current.viewMode).toBe('original')
  })

  it('uses streamPost for streaming translation', async () => {
    mockStreamPost.mockImplementation((_url: string, onDelta: (text: string) => void) => {
      onDelta('翻訳テキスト')
      return Promise.resolve({ usage: { input_tokens: 200, output_tokens: 150 } })
    })

    const metrics = mockMetrics()
    const article = { id: 10, full_text_translated: null }
    const { result } = renderHook(() => useTranslate(article, metrics))

    await act(async () => {
      await result.current.handleTranslate()
    })

    expect(mockStreamPost).toHaveBeenCalledWith(
      '/api/articles/10/translate?stream=1',
      expect.any(Function),
    )
  })

  it('sets fullTextTranslated and viewMode=ja on completion', async () => {
    mockStreamPost.mockImplementation((_url: string, onDelta: (text: string) => void) => {
      onDelta('完成した翻訳')
      return Promise.resolve({ usage: { input_tokens: 100, output_tokens: 80 } })
    })

    const metrics = mockMetrics()
    const article = { id: 1, full_text_translated: null }
    const { result } = renderHook(() => useTranslate(article, metrics))

    await act(async () => {
      await result.current.handleTranslate()
    })

    expect(result.current.fullTextTranslated).toBe('完成した翻訳')
    expect(result.current.viewMode).toBe('translated')
  })

  it('reports metrics when input_tokens > 0', async () => {
    mockStreamPost.mockResolvedValue({ usage: { input_tokens: 300, output_tokens: 200 } })

    const metrics = mockMetrics()
    const article = { id: 1, full_text_translated: null }
    const { result } = renderHook(() => useTranslate(article, metrics))

    await act(async () => {
      await result.current.handleTranslate()
    })

    expect(metrics.report).toHaveBeenCalledWith(
      expect.objectContaining({
        inputTokens: 300,
        outputTokens: 200,
      }),
    )
  })

  it('skips metrics when input_tokens is 0', async () => {
    mockStreamPost.mockResolvedValue({ usage: { input_tokens: 0, output_tokens: 0 } })

    const metrics = mockMetrics()
    const article = { id: 1, full_text_translated: null }
    const { result } = renderHook(() => useTranslate(article, metrics))

    await act(async () => {
      await result.current.handleTranslate()
    })

    expect(metrics.report).not.toHaveBeenCalled()
  })

  it('handles error silently and sets translating=false', async () => {
    mockStreamPost.mockRejectedValue(new Error('Network error'))

    const metrics = mockMetrics()
    const article = { id: 1, full_text_translated: null }
    const { result } = renderHook(() => useTranslate(article, metrics))

    await act(async () => {
      await result.current.handleTranslate()
    })

    expect(result.current.translating).toBe(false)
  })
})
