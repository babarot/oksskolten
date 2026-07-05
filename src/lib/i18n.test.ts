import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { createElement } from 'react'
import { LocaleContext, useI18n } from './i18n'

function makeWrapper(locale: 'ja' | 'en' | 'de') {
  return ({ children }: { children: React.ReactNode }) =>
    createElement(LocaleContext.Provider, { value: { locale, setLocale: () => {} } }, children)
}

describe('useI18n', () => {
  it('returns Japanese text when locale is ja', () => {
    const { result } = renderHook(() => useI18n(), { wrapper: makeWrapper('ja') })
    expect(result.current.t('feeds.inbox')).toBe('Inbox')
    expect(result.current.t('feeds.title')).toBe('フィード')
  })

  it('returns English text when locale is en', () => {
    const { result } = renderHook(() => useI18n(), { wrapper: makeWrapper('en') })
    expect(result.current.t('feeds.title')).toBe('Feeds')
  })

  it('replaces parameters in text', () => {
    const { result } = renderHook(() => useI18n(), { wrapper: makeWrapper('en') })
    const text = result.current.t('feeds.deleteConfirm', { name: 'TestFeed' })
    expect(text).toContain('TestFeed')
    expect(text).not.toContain('${name}')
  })

  it('replaces parameters in Japanese text', () => {
    const { result } = renderHook(() => useI18n(), { wrapper: makeWrapper('ja') })
    const text = result.current.t('feeds.deleteConfirm', { name: 'テスト' })
    expect(text).toContain('テスト')
    expect(text).not.toContain('${name}')
  })

  it('returns German text when locale is de', () => {
    const { result } = renderHook(() => useI18n(), { wrapper: makeWrapper('de') })
    expect(result.current.t('feeds.title')).toBe('Feeds')
    expect(result.current.t('settings.title')).toBe('Einstellungen')
  })

  it('exposes locale value', () => {
    const { result } = renderHook(() => useI18n(), { wrapper: makeWrapper('ja') })
    expect(result.current.locale).toBe('ja')
  })
})
