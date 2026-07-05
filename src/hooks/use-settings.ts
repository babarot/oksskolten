import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import useSWR from 'swr'
import { useDarkMode } from './use-dark-mode'
import { useTheme } from './use-theme'
import { useDateMode } from './use-date-mode'
import { useAutoMarkRead } from './use-auto-mark-read'
import { useUnreadIndicator } from './use-unread-indicator'
import { useInternalLinks } from './use-internal-links'
import { useShowThumbnails } from './use-show-thumbnails'
import { useShowFeedActivity } from './use-show-feed-activity'
import { useChatPosition } from './use-chat-position'
import { useArticleOpenMode, type ArticleOpenMode } from './use-article-open-mode'
import { useCategoryUnreadOnly } from './use-category-unread-only'
import { useLabelUnreadOnly } from './use-label-unread-only'
import { useHighlightTheme } from './use-highlight-theme'
import { useArticleFont } from './use-article-font'
import { useLayout } from './use-layout'
import { useMascot, type MascotChoice } from './use-mascot'
import { useKeyboardNavSetting } from './use-keyboard-nav-setting'
import { useKeybindingsSetting } from './use-keybindings-setting'
import type { LayoutName } from '../data/layouts'
import type { Theme } from '../data/themes'
import { fetcher, apiPatch, authHeaders } from '../lib/fetcher'

/** Debounce delay (ms) before syncing settings to backend */
const SETTINGS_SYNC_DEBOUNCE_MS = 500

interface Prefs {
  'appearance.color_theme': string | null
  'reading.date_mode': string | null
  'reading.auto_mark_read': string | null
  'reading.unread_indicator': string | null
  'reading.internal_links': string | null
  'reading.show_thumbnails': string | null
  'reading.show_feed_activity': string | null
  'appearance.highlight_theme': string | null
  'appearance.font_family': string | null
  'reading.chat_position': string | null
  'reading.article_open_mode': string | null
  'reading.category_unread_only': string | null
  'reading.label_unread_only': string | null
  'appearance.list_layout': string | null
  'appearance.mascot': string | null
  'reading.keyboard_navigation': string | null
  'reading.keybindings': string | null
  'chat.provider': string | null
  'chat.model': string | null
  'summary.provider': string | null
  'summary.model': string | null
  'translate.provider': string | null
  'translate.model': string | null
  'translate.target_lang': string | null
  'custom_themes': string | null
}

export function useSettings() {
  const { isDark, colorMode, setColorMode } = useDarkMode()
  const [customThemes, setCustomThemesState] = useState<Theme[]>(() => {
    try {
      const stored = localStorage.getItem('custom-themes')
      return stored ? JSON.parse(stored) : []
    } catch { return [] }
  })
  const { themeName, setTheme, themes } = useTheme(isDark, customThemes)
  const { dateMode, setDateMode } = useDateMode()
  const { autoMarkRead, setAutoMarkRead } = useAutoMarkRead()
  const { showUnreadIndicator, setShowUnreadIndicator } = useUnreadIndicator()
  const { internalLinks, setInternalLinks } = useInternalLinks()
  const currentTheme = themes.find(t => t.name === themeName) ?? themes[0]
  const { highlightTheme, highlightThemeOverride, setHighlightTheme } = useHighlightTheme(currentTheme.highlight, isDark)
  const { articleFont, setArticleFont } = useArticleFont()
  const indicatorStyle = currentTheme.indicatorStyle ?? 'dot'
  const { showThumbnails, setShowThumbnails } = useShowThumbnails()
  const { showFeedActivity, setShowFeedActivity } = useShowFeedActivity()
  const { chatPosition, setChatPosition } = useChatPosition()
  const { articleOpenMode, setArticleOpenMode } = useArticleOpenMode()
  const { categoryUnreadOnly, setCategoryUnreadOnly } = useCategoryUnreadOnly()
  const { labelUnreadOnly, setLabelUnreadOnly } = useLabelUnreadOnly()
  const { layout, setLayout } = useLayout()
  const { mascot, setMascot } = useMascot()
  const { keyboardNavigation, setKeyboardNavigation } = useKeyboardNavSetting()
  const { keybindings, setKeybindings } = useKeybindingsSetting()
  const [chatProvider, setChatProviderState] = useState<string | null>(null)
  const [chatModel, setChatModelState] = useState<string | null>(null)
  const [summaryProvider, setSummaryProviderState] = useState<string | null>(null)
  const [summaryModel, setSummaryModelState] = useState<string | null>(null)
  const [translateProvider, setTranslateProviderState] = useState<string | null>(null)
  const [translateModel, setTranslateModelState] = useState<string | null>(null)
  const [translateTargetLang, setTranslateTargetLangState] = useState<string | null>(null)

  // --- DB sync ---
  const { data: prefs, mutate: mutatePrefs } = useSWR<Prefs>(
    '/api/settings/preferences',
    fetcher,
    { revalidateOnFocus: false, revalidateOnReconnect: false },
  )

  const dirtyKeysRef = useRef<Set<string>>(new Set())
  const pendingRef = useRef<Partial<Prefs>>({})
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const inFlightRef = useRef<Promise<unknown> | null>(null)
  const fireSaveRef = useRef<() => void>(() => {})

  // Stable refs for backfill values (only needed for keys that backfill to DB)
  const themeNameRef = useRef(themeName)
  themeNameRef.current = themeName
  const dateModeRef = useRef(dateMode)
  dateModeRef.current = dateMode
  const autoMarkReadRef = useRef(autoMarkRead)
  autoMarkReadRef.current = autoMarkRead
  const showUnreadIndicatorRef = useRef(showUnreadIndicator)
  showUnreadIndicatorRef.current = showUnreadIndicator
  const internalLinksRef = useRef(internalLinks)
  internalLinksRef.current = internalLinks
  const showThumbnailsRef = useRef(showThumbnails)
  showThumbnailsRef.current = showThumbnails
  const showFeedActivityRef = useRef(showFeedActivity)
  showFeedActivityRef.current = showFeedActivity
  const chatPositionRef = useRef(chatPosition)
  chatPositionRef.current = chatPosition
  const articleOpenModeRef = useRef(articleOpenMode)
  articleOpenModeRef.current = articleOpenMode
  const categoryUnreadOnlyRef = useRef(categoryUnreadOnly)
  categoryUnreadOnlyRef.current = categoryUnreadOnly
  const labelUnreadOnlyRef = useRef(labelUnreadOnly)
  labelUnreadOnlyRef.current = labelUnreadOnly
  const layoutRef = useRef(layout)
  layoutRef.current = layout
  const mascotRef = useRef(mascot)
  mascotRef.current = mascot
  const keyboardNavigationRef = useRef(keyboardNavigation)
  keyboardNavigationRef.current = keyboardNavigation

  // DB → local hydration (data-driven)
  useEffect(() => {
    if (!prefs) return
    const dirty = dirtyKeysRef.current
    const backfill: Partial<Prefs> = {}

    const hydrationMap: Array<{
      key: keyof Prefs
      setter: (v: any) => void
      backfillRef?: React.MutableRefObject<string>
      validate?: (v: string) => boolean
    }> = [
      { key: 'appearance.color_theme', setter: setTheme, backfillRef: themeNameRef },
      { key: 'reading.date_mode', setter: setDateMode, backfillRef: dateModeRef,
        validate: v => v === 'relative' || v === 'absolute' },
      { key: 'reading.auto_mark_read', setter: setAutoMarkRead, backfillRef: autoMarkReadRef,
        validate: v => v === 'on' || v === 'off' },
      { key: 'reading.unread_indicator', setter: setShowUnreadIndicator, backfillRef: showUnreadIndicatorRef,
        validate: v => v === 'on' || v === 'off' },
      { key: 'reading.internal_links', setter: setInternalLinks, backfillRef: internalLinksRef,
        validate: v => v === 'on' || v === 'off' },
      { key: 'reading.show_thumbnails', setter: setShowThumbnails, backfillRef: showThumbnailsRef,
        validate: v => v === 'on' || v === 'off' },
      { key: 'reading.show_feed_activity', setter: setShowFeedActivity, backfillRef: showFeedActivityRef,
        validate: v => v === 'on' || v === 'off' },
      { key: 'reading.chat_position', setter: setChatPosition, backfillRef: chatPositionRef,
        validate: v => v === 'fab' || v === 'inline' },
      { key: 'reading.article_open_mode', setter: setArticleOpenMode, backfillRef: articleOpenModeRef,
        validate: v => v === 'page' || v === 'overlay' },
      { key: 'reading.category_unread_only', setter: setCategoryUnreadOnly, backfillRef: categoryUnreadOnlyRef,
        validate: v => v === 'on' || v === 'off' },
      { key: 'reading.label_unread_only', setter: setLabelUnreadOnly, backfillRef: labelUnreadOnlyRef,
        validate: v => v === 'on' || v === 'off' },
      { key: 'appearance.list_layout', setter: setLayout, backfillRef: layoutRef,
        validate: v => v === 'list' || v === 'card' || v === 'magazine' || v === 'compact' },
      { key: 'appearance.mascot', setter: setMascot, backfillRef: mascotRef,
        validate: v => v === 'off' || v === 'dream-puff' || v === 'sleepy-giant' },
      { key: 'reading.keyboard_navigation', setter: setKeyboardNavigation, backfillRef: keyboardNavigationRef,
        validate: v => v === 'on' || v === 'off' },
      { key: 'reading.keybindings', setter: (v: string) => {
        try { const parsed = JSON.parse(v); setKeybindings(parsed) } catch { /* ignore invalid JSON */ }
      } },
      { key: 'appearance.highlight_theme', setter: setHighlightTheme },
      { key: 'appearance.font_family', setter: setArticleFont },
      { key: 'chat.provider', setter: setChatProviderState },
      { key: 'chat.model', setter: setChatModelState },
      { key: 'summary.provider', setter: setSummaryProviderState },
      { key: 'summary.model', setter: setSummaryModelState },
      { key: 'translate.provider', setter: setTranslateProviderState },
      { key: 'translate.model', setter: setTranslateModelState },
      { key: 'translate.target_lang', setter: setTranslateTargetLangState },
    ]

    for (const { key, setter, backfillRef, validate } of hydrationMap) {
      if (dirty.has(key)) continue
      const value = prefs[key]
      if (value) {
        if (!validate || validate(value)) setter(value)
        else if (backfillRef) backfill[key] = backfillRef.current
      } else if (backfillRef) {
        backfill[key] = backfillRef.current
      }
    }

    if (Object.keys(backfill).length > 0) {
      apiPatch('/api/settings/preferences', backfill).catch(() => {})
    }
  }, [prefs, setTheme, setDateMode, setAutoMarkRead, setShowUnreadIndicator, setInternalLinks, setShowThumbnails, setShowFeedActivity, setChatPosition, setArticleOpenMode, setCategoryUnreadOnly, setLabelUnreadOnly, setLayout, setMascot, setHighlightTheme, setArticleFont, setKeyboardNavigation, setKeybindings])

  // Hydrate custom themes from DB
  useEffect(() => {
    if (!prefs) return
    const raw = prefs['custom_themes']
    if (raw && !dirtyKeysRef.current.has('custom_themes')) {
      try {
        const parsed = JSON.parse(raw) as Theme[]
        setCustomThemesState(parsed)
        localStorage.setItem('custom-themes', raw)
      } catch { /* ignore malformed JSON from DB — keep existing localStorage themes */ }
    }
  }, [prefs])

  // Serialize PATCHes so client send order matches server apply order. A new
  // PATCH is fired only when no other PATCH is in flight; otherwise the new
  // changes accumulate in pendingRef and are picked up after the current
  // request settles. This avoids two PATCHes racing against each other.
  const fireSaveIfIdle = useCallback(() => {
    if (inFlightRef.current) return
    if (Object.keys(pendingRef.current).length === 0) return

    const patch = { ...pendingRef.current }
    pendingRef.current = {}
    const keys = Object.keys(patch) as Array<keyof Prefs>

    const promise = apiPatch('/api/settings/preferences', patch)
      .then(() => {
        for (const key of keys) {
          if (pendingRef.current[key] === undefined) {
            dirtyKeysRef.current.delete(key)
          }
        }
        void mutatePrefs((curr) => {
          if (!curr) return undefined
          const next = { ...curr }
          for (const key of keys) {
            if (pendingRef.current[key] === undefined) {
              const value = patch[key]
              if (value !== undefined) next[key] = value
            }
          }
          return next
        }, false)
      })
      .catch(() => {})
      .finally(() => {
        inFlightRef.current = null
        if (Object.keys(pendingRef.current).length > 0) {
          fireSaveRef.current()
        }
      })
    inFlightRef.current = promise
  }, [mutatePrefs])

  fireSaveRef.current = fireSaveIfIdle

  // Best-effort flush via fetch keepalive on page unload. Does not coordinate
  // with in-flight requests, so a "rapid edits + immediate reload" sequence
  // can still land out of order on the server. See PR #68 follow-up for full
  // beforeunload serialization (requires server-side revision tracking).
  const flushNow = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = undefined
    }
    const patch = { ...pendingRef.current }
    pendingRef.current = {}
    if (Object.keys(patch).length > 0) {
      fetch('/api/settings/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(patch),
        keepalive: true,
      }).catch(() => {})
    }
  }, [])

  // Debounced save: 500ms after last change
  const scheduleSave = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      timerRef.current = undefined
      fireSaveIfIdle()
    }, SETTINGS_SYNC_DEBOUNCE_MS)
  }, [fireSaveIfIdle])

  // Flush on beforeunload + unmount
  useEffect(() => {
    const onBeforeUnload = () => flushNow()
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
      flushNow()
    }
  }, [flushNow])

  // Stable ref for scheduleSave (avoids recreating factory setters when scheduleSave changes)
  const scheduleSaveRef = useRef(scheduleSave)
  scheduleSaveRef.current = scheduleSave

  // Factory-generated synced setters (all useState setters are referentially stable)
  const {
    syncedSetDateMode,
    syncedSetAutoMarkRead,
    syncedSetShowUnreadIndicator,
    syncedSetInternalLinks,
    syncedSetShowThumbnails,
    syncedSetShowFeedActivity,
    syncedSetChatPosition,
    syncedSetArticleOpenMode,
    syncedSetCategoryUnreadOnly,
    syncedSetLabelUnreadOnly,
    syncedSetLayout,
    syncedSetArticleFont,
    syncedSetMascot,
    syncedSetKeyboardNavigation,
    syncedSetKeybindings,
    syncedSetChatProvider,
    syncedSetChatModel,
    syncedSetSummaryProvider,
    syncedSetSummaryModel,
    syncedSetTranslateProvider,
    syncedSetTranslateModel,
    syncedSetTranslateTargetLang,
  } = useMemo(() => {
    const make = <T extends string>(key: keyof Prefs, setter: (v: T) => void) =>
      (value: T) => {
        dirtyKeysRef.current.add(key)
        setter(value)
        pendingRef.current[key] = value
        scheduleSaveRef.current()
      }
    return {
      syncedSetDateMode: make<'relative' | 'absolute'>('reading.date_mode', setDateMode),
      syncedSetAutoMarkRead: make<'on' | 'off'>('reading.auto_mark_read', setAutoMarkRead),
      syncedSetShowUnreadIndicator: make<'on' | 'off'>('reading.unread_indicator', setShowUnreadIndicator),
      syncedSetInternalLinks: make<'on' | 'off'>('reading.internal_links', setInternalLinks),
      syncedSetShowThumbnails: make<'on' | 'off'>('reading.show_thumbnails', setShowThumbnails),
      syncedSetShowFeedActivity: make<'on' | 'off'>('reading.show_feed_activity', setShowFeedActivity),
      syncedSetChatPosition: make<'fab' | 'inline'>('reading.chat_position', setChatPosition),
      syncedSetArticleOpenMode: make<ArticleOpenMode>('reading.article_open_mode', setArticleOpenMode),
      syncedSetCategoryUnreadOnly: make<'on' | 'off'>('reading.category_unread_only', setCategoryUnreadOnly),
      syncedSetLabelUnreadOnly: make<'on' | 'off'>('reading.label_unread_only', setLabelUnreadOnly),
      syncedSetLayout: make<LayoutName>('appearance.list_layout', setLayout),
      syncedSetArticleFont: make<string>('appearance.font_family', setArticleFont),
      syncedSetMascot: make<MascotChoice>('appearance.mascot', setMascot),
      syncedSetKeyboardNavigation: make<'on' | 'off'>('reading.keyboard_navigation', setKeyboardNavigation),
      syncedSetKeybindings: (value: import('./use-keyboard-navigation').KeyBindings) => {
        dirtyKeysRef.current.add('reading.keybindings')
        setKeybindings(value)
        pendingRef.current['reading.keybindings'] = JSON.stringify(value)
        scheduleSaveRef.current()
      },
      syncedSetChatProvider: make<string>('chat.provider', setChatProviderState),
      syncedSetChatModel: make<string>('chat.model', setChatModelState),
      syncedSetSummaryProvider: make<string>('summary.provider', setSummaryProviderState),
      syncedSetSummaryModel: make<string>('summary.model', setSummaryModelState),
      syncedSetTranslateProvider: make<string>('translate.provider', setTranslateProviderState),
      syncedSetTranslateModel: make<string>('translate.model', setTranslateModelState),
      syncedSetTranslateTargetLang: make<string>('translate.target_lang', setTranslateTargetLangState),
    }
    // scheduleSave and dirtyKeysRef are stable refs; remaining setters are useState/useCallback-stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setDateMode, setAutoMarkRead, setShowUnreadIndicator, setInternalLinks, setShowThumbnails, setShowFeedActivity, setChatPosition, setArticleOpenMode, setCategoryUnreadOnly, setLabelUnreadOnly, setLayout, setArticleFont, setMascot])

  // Special: theme setter updates 2 keys + resets highlight
  const syncedSetTheme = useCallback((name: string) => {
    dirtyKeysRef.current.add('appearance.color_theme')
    dirtyKeysRef.current.add('appearance.highlight_theme')
    setTheme(name)
    setHighlightTheme(null) // reset to auto on app theme change
    pendingRef.current['appearance.color_theme'] = name
    pendingRef.current['appearance.highlight_theme'] = '' // empty string = delete from DB
    scheduleSave()
  }, [setTheme, setHighlightTheme, scheduleSave])

  // Special: highlight setter converts null → '' for DB
  const syncedSetHighlightTheme = useCallback((value: string | null) => {
    dirtyKeysRef.current.add('appearance.highlight_theme')
    setHighlightTheme(value)
    pendingRef.current['appearance.highlight_theme'] = value || '' // empty string = delete from DB (auto)
    scheduleSave()
  }, [setHighlightTheme, scheduleSave])

  // Custom themes setter: updates local state + syncs JSON blob to DB
  const setCustomThemes = useCallback((updater: (prev: Theme[]) => Theme[]) => {
    setCustomThemesState(prev => {
      const next = updater(prev)
      const json = JSON.stringify(next)
      localStorage.setItem('custom-themes', json)
      dirtyKeysRef.current.add('custom_themes')
      pendingRef.current['custom_themes'] = json
      scheduleSave()
      return next
    })
  }, [scheduleSave])

  return {
    isDark,
    colorMode,
    setColorMode,
    themeName,
    setTheme: syncedSetTheme,
    themes,
    dateMode,
    setDateMode: syncedSetDateMode,
    autoMarkRead,
    setAutoMarkRead: syncedSetAutoMarkRead,
    showUnreadIndicator,
    setShowUnreadIndicator: syncedSetShowUnreadIndicator,
    internalLinks,
    setInternalLinks: syncedSetInternalLinks,
    showThumbnails,
    setShowThumbnails: syncedSetShowThumbnails,
    showFeedActivity,
    setShowFeedActivity: syncedSetShowFeedActivity,
    chatPosition,
    setChatPosition: syncedSetChatPosition,
    articleOpenMode,
    setArticleOpenMode: syncedSetArticleOpenMode,
    categoryUnreadOnly,
    setCategoryUnreadOnly: syncedSetCategoryUnreadOnly,
    labelUnreadOnly,
    setLabelUnreadOnly: syncedSetLabelUnreadOnly,
    layout,
    setLayout: syncedSetLayout,
    highlightTheme,
    highlightThemeOverride,
    setHighlightTheme: syncedSetHighlightTheme,
    articleFont,
    setArticleFont: syncedSetArticleFont,
    mascot,
    setMascot: syncedSetMascot,
    indicatorStyle,
    customThemes,
    setCustomThemes,
    chatProvider,
    setChatProvider: syncedSetChatProvider,
    chatModel,
    setChatModel: syncedSetChatModel,
    summaryProvider,
    setSummaryProvider: syncedSetSummaryProvider,
    summaryModel,
    setSummaryModel: syncedSetSummaryModel,
    translateProvider,
    setTranslateProvider: syncedSetTranslateProvider,
    translateModel,
    setTranslateModel: syncedSetTranslateModel,
    translateTargetLang,
    setTranslateTargetLang: syncedSetTranslateTargetLang,
    keyboardNavigation,
    setKeyboardNavigation: syncedSetKeyboardNavigation,
    keybindings,
    setKeybindings: syncedSetKeybindings,
  }
}

export type Settings = ReturnType<typeof useSettings>
