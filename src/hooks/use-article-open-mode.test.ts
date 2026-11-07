import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useArticleOpenMode } from './use-article-open-mode'

describe('useArticleOpenMode', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('defaults to page', () => {
    const { result } = renderHook(() => useArticleOpenMode())
    expect(result.current.articleOpenMode).toBe('page')
  })

  it('reads stored value from localStorage', () => {
    localStorage.setItem('article-open-mode', 'split')
    const { result } = renderHook(() => useArticleOpenMode())
    expect(result.current.articleOpenMode).toBe('split')
  })

  it('ignores invalid localStorage value', () => {
    localStorage.setItem('article-open-mode', 'popup')
    const { result } = renderHook(() => useArticleOpenMode())
    expect(result.current.articleOpenMode).toBe('page')
  })

  it('persists overlay and split choices', () => {
    const { result } = renderHook(() => useArticleOpenMode())
    act(() => result.current.setArticleOpenMode('overlay'))
    expect(result.current.articleOpenMode).toBe('overlay')
    expect(localStorage.getItem('article-open-mode')).toBe('overlay')

    act(() => result.current.setArticleOpenMode('split'))
    expect(result.current.articleOpenMode).toBe('split')
    expect(localStorage.getItem('article-open-mode')).toBe('split')
  })
})
