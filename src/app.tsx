import { BrowserRouter, Routes, Route, Navigate, Outlet, useParams, useLocation, useNavigate, useOutletContext } from 'react-router-dom'
import { useState, useMemo, useRef, useEffect, useLayoutEffect, useCallback, lazy, Suspense } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import useSWR, { SWRConfig } from 'swr'
import { useSettings, type Settings } from './hooks/use-settings'
import { fetcher } from './lib/fetcher'
import { LocaleContext, APP_NAME, type Locale, useI18n } from './lib/i18n'
import { MD_BREAKPOINT } from './lib/breakpoints'
import { useIsTouchDevice } from './hooks/use-is-touch-device'
import { saveScrollPosition, restoreScrollPosition } from './hooks/use-scroll-restoration'
import { useSwipeDrawer } from './hooks/use-swipe-drawer'
import { Header } from './components/layout/header'
import { ArticleList, type ArticleListHandle } from './components/article/article-list'
import { ArticleDetail } from './components/article/article-detail'
import { ArticleRawPage } from './components/article/article-raw-page'
import { PageLayout } from './components/layout/page-layout'
import { KeyboardNavigationProvider } from './contexts/keyboard-navigation-context'
const SettingsPage = lazy(() => import('./pages/settings-page').then(m => ({ default: m.SettingsPage })))
const ChatPage = lazy(() => import('./pages/chat-page').then(m => ({ default: m.ChatPage })))
const HomePage = lazy(() => import('./pages/home-page').then(m => ({ default: m.HomePage })))
import { AuthShell } from './lib/auth-shell'
import { ErrorBoundary } from './components/auth/error-boundary'
import { HintBanner } from './components/ui/hint-banner'
import { Toaster } from 'sonner'
import { FetchProgressProvider } from './contexts/fetch-progress-context'
import { TooltipProvider } from './components/ui/tooltip'

export interface AppLayoutContext {
  settings: Settings
  sidebarOpen: boolean
  setSidebarOpen: React.Dispatch<React.SetStateAction<boolean>>
}

function AppLayout() {
  const settings = useSettings()
  const [sidebarOpen, setSidebarOpen] = useState(() => window.matchMedia(`(min-width: ${MD_BREAKPOINT}px)`).matches)

  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${MD_BREAKPOINT}px)`)
    const handler = (e: MediaQueryListEvent) => setSidebarOpen(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  useSwipeDrawer(sidebarOpen, setSidebarOpen)

  const { data: profile } = useSWR<{ language: string | null }>('/api/settings/profile', fetcher)

  // Query parameter ?lang=ja|en takes highest priority (useful for demo sharing links)
  const langFromUrl = useMemo(() => {
    const p = new URLSearchParams(window.location.search).get('lang')
    return p === 'ja' || p === 'en' ? p : null
  }, [])

  const [locale, setLocaleState] = useState<Locale>(() => {
    if (langFromUrl) return langFromUrl
    const cached = localStorage.getItem('locale')
    if (cached === 'ja' || cached === 'en') return cached
    return navigator.language.startsWith('ja') ? 'ja' : 'en'
  })

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l)
    localStorage.setItem('locale', l)
  }, [])

  useEffect(() => {
    // When ?lang= is present, persist it and skip profile override
    if (langFromUrl) {
      localStorage.setItem('locale', langFromUrl)
      return
    }
    // Only apply profile language as initial fallback — if localStorage already
    // has a valid locale the user explicitly chose, respect it.
    const cached = localStorage.getItem('locale')
    if (cached === 'ja' || cached === 'en') return
    if (profile?.language === 'ja' || profile?.language === 'en') {
      setLocale(profile.language)
    }
  }, [profile, setLocale, langFromUrl])

  const localeCtx = useMemo(() => ({ locale, setLocale }), [locale, setLocale])

  useEffect(() => {
    document.title = APP_NAME
  }, [])

  return (
    <LocaleContext.Provider value={localeCtx}>
      <TooltipProvider delayDuration={300}>
        <div className="min-h-screen bg-bg text-text">
          <FetchProgressProvider>
            <KeyboardNavigationProvider>
              <Outlet context={{ settings, sidebarOpen, setSidebarOpen }} />
            </KeyboardNavigationProvider>
          </FetchProgressProvider>
          <Toaster
            theme="system"
            duration={5000}
            position="top-right"
            richColors
            offset={{
              top: 'calc(var(--safe-area-inset-top) + 24px)',
              right: '24px',
              bottom: 'calc(var(--safe-area-inset-bottom) + 24px)',
              left: '24px',
            }}
            mobileOffset={{
              top: 'calc(var(--safe-area-inset-top) + 16px)',
              right: '16px',
              bottom: 'calc(var(--safe-area-inset-bottom) + 16px)',
              left: '16px',
            }}
          />
        </div>
      </TooltipProvider>
    </LocaleContext.Provider>
  )
}

export function useAppLayout() {
  return useOutletContext<AppLayoutContext>()
}

function ArticleListPage() {
  const { feedId, categoryId } = useParams<{ feedId?: string; categoryId?: string }>()
  const location = useLocation()
  const { t } = useI18n()
  const isInbox = location.pathname === '/inbox'
  const isBookmarks = location.pathname === '/bookmarks'
  const isLikes = location.pathname === '/likes'
  const isHistory = location.pathname === '/history'
  const isClips = location.pathname === '/clips'
  const { data: feedsData } = useSWR<{ feeds: Array<{ id: number; name: string; type: string; category_id: number | null; category_name: string | null }>; clip_feed_id: number | null }>('/api/feeds', fetcher)
  const { data: categoriesData } = useSWR<{ categories: Array<{ id: number; name: string }> }>('/api/categories', fetcher)

  const headerName = isHistory
    ? t('feeds.history')
    : isLikes
      ? t('feeds.likes')
      : isBookmarks
        ? t('feeds.bookmarks')
        : isInbox
          ? t('feeds.inbox')
          : isClips
            ? t('feeds.clips')
            : feedId
          ? feedsData?.feeds.find(f => f.id === Number(feedId))?.name ?? null
          : categoryId
            ? categoriesData?.categories.find(c => c.id === Number(categoryId))?.name ?? null
            : null

  const articleListRef = useRef<ArticleListHandle>(null)
  const revalidateArticles = useCallback(() => articleListRef.current?.revalidate(), [])

  return (
    <PageLayout
      feedName={headerName}
      feedListProps={{ onMarkAllRead: revalidateArticles, onArticleMoved: revalidateArticles }}
    >
      {isInbox && <HintBanner storageKey="hint-dismissed-inbox">{t('hint.inbox')}</HintBanner>}
      {isBookmarks && <HintBanner storageKey="hint-dismissed-bookmarks">{t('hint.bookmarks')}</HintBanner>}
      {isLikes && <HintBanner storageKey="hint-dismissed-likes">{t('hint.likes')}</HintBanner>}
      {isHistory && <HintBanner storageKey="hint-dismissed-history">{t('hint.history')}</HintBanner>}
      {isClips && <HintBanner storageKey="hint-dismissed-clips">{t('hint.clips')}</HintBanner>}
      <ArticleList ref={articleListRef} />
    </PageLayout>
  )
}

function SettingsPageWrapper() {
  return (
    <PageLayout>
      <Suspense>
        <SettingsPage />
      </Suspense>
    </PageLayout>
  )
}

function ChatPageWrapper() {
  const { t } = useI18n()
  const { conversationId } = useParams<{ conversationId?: string }>()
  const navigate = useNavigate()

  const { data: convData } = useSWR<{ conversations: Array<{ id: string; title: string | null }> }>(
    conversationId ? '/api/chat/conversations' : null,
    fetcher,
    { revalidateOnFocus: false },
  )
  const conversationTitle = convData?.conversations?.find(c => c.id === conversationId)?.title ?? null

  return (
    <PageLayout
      mode={conversationId ? 'detail' : 'list'}
      feedName={conversationId ? undefined : t('chat.title')}
      detailTitle={conversationTitle}
      onBack={() => navigate('/chat')}
    >
      <Suspense>
        <ChatPage />
      </Suspense>
    </PageLayout>
  )
}

function HomePageWrapper() {
  return (
    <PageLayout>
      <Suspense>
        <HomePage />
      </Suspense>
    </PageLayout>
  )
}

function ArticleDetailPage() {
  const { '*': splat } = useParams()
  const navigate = useNavigate()

  if (!splat) return null

  let rawSplat = splat
  if (splat.endsWith('.md')) {
    rawSplat = splat.slice(0, -3)
  }

  let articleUrl = ''
  if (rawSplat.startsWith('http/')) {
    articleUrl = `http://${decodeURIComponent(rawSplat.slice(5))}`
  } else {
    articleUrl = `https://${decodeURIComponent(rawSplat)}`
  }

  if (splat.endsWith('.md')) {
    return <ArticleRawPage articleUrl={articleUrl} />
  }

  return (
    <>
      <Header mode="detail" onBack={() => navigate('/inbox')} />
      <ArticleDetail articleUrl={articleUrl} />
    </>
  )
}

// Determine the "page type" for animation decisions
function getPageType(pathname: string): 'detail' | 'list' {
  if (pathname === '/' || pathname === '/inbox' || pathname === '/bookmarks' || pathname === '/likes' || pathname === '/history' || pathname === '/clips' || pathname.startsWith('/feeds/') || pathname.startsWith('/categories/') || pathname.startsWith('/settings') || pathname.startsWith('/chat')) {
    return 'list'
  }
  return 'detail'
}

/**
 * Renders nothing. Lives inside the motion.div so it mounts/unmounts with it.
 * useLayoutEffect restores scroll synchronously before the browser paints,
 * meaning the fade-in animation already shows the page at the saved position.
 */
function ScrollRestore({ pathname, pageType }: { pathname: string; pageType: string }) {
  useLayoutEffect(() => {
    if (pageType === 'list') {
      restoreScrollPosition(pathname)
    }
  }, [pathname, pageType])
  return null
}

function AnimatedRoutes() {
  const location = useLocation()
  const isTouchDevice = useIsTouchDevice()
  const pageType = getPageType(location.pathname)

  // Track navigation direction to avoid double-animation on swipe-back.
  // Browser's native swipe-back already animates, so we only slide on PUSH.
  const navAction = useRef<'PUSH' | 'POP' | 'REPLACE'>('PUSH')
  useEffect(() => {
    const handler = () => { navAction.current = 'POP' }
    window.addEventListener('popstate', handler)
    return () => window.removeEventListener('popstate', handler)
  }, [])

  // Reset to PUSH after each render so link navigations get the slide
  const currentAction = navAction.current
  useEffect(() => { navAction.current = 'PUSH' })

  // Save scroll position when navigating away from a page
  const prevPathname = useRef(location.pathname)
  useEffect(() => {
    if (prevPathname.current !== location.pathname) {
      saveScrollPosition(prevPathname.current)
      prevPathname.current = location.pathname
    }
  }, [location.pathname])

  // Only slide-in on touch devices navigating forward to a detail page
  const isDetailSlide = isTouchDevice && pageType === 'detail' && currentAction === 'PUSH'
  // On POP (swipe-back), skip the exit slide to avoid doubling with the native animation
  const isExitSlide = isTouchDevice && pageType === 'detail' && currentAction === 'PUSH'
  const isPop = currentAction === 'POP'

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={pageType === 'detail' ? location.pathname : pageType}
        initial={isPop ? false : (isDetailSlide ? { x: '100%', opacity: 1 } : { opacity: 0 })}
        animate={isDetailSlide ? { x: 0, opacity: 1 } : { opacity: 1 }}
        exit={isPop ? { opacity: 1 } : (isExitSlide ? { x: '100%', opacity: 1 } : { opacity: 0 })}
        transition={isPop
          ? { duration: 0 }
          : isDetailSlide
            ? { type: 'tween', duration: 0.25, ease: [0.32, 0.72, 0, 1] }
            : { duration: 0.15 }
        }
        style={{ minHeight: '100vh' }}
      >
        <ScrollRestore pathname={location.pathname} pageType={pageType} />
        <Routes location={location}>
          <Route element={<AppLayout />}>
            <Route path="/" element={<HomePageWrapper />} />
            <Route path="/inbox" element={<ArticleListPage />} />
            <Route path="/bookmarks" element={<ArticleListPage />} />
            <Route path="/likes" element={<ArticleListPage />} />
            <Route path="/history" element={<ArticleListPage />} />
            <Route path="/clips" element={<ArticleListPage />} />
            <Route path="/feeds/:feedId" element={<ArticleListPage />} />
            <Route path="/categories/:categoryId" element={<ArticleListPage />} />
            <Route path="/settings" element={<Navigate to="/settings/general" replace />} />
            <Route path="/settings/:tab" element={<SettingsPageWrapper />} />
            <Route path="/chat" element={<ChatPageWrapper />} />
            <Route path="/chat/:conversationId" element={<ChatPageWrapper />} />
            <Route path="/*" element={<ArticleDetailPage />} />
          </Route>
        </Routes>
      </motion.div>
    </AnimatePresence>
  )
}

export default function App() {
  return (
    <SWRConfig value={{
      fetcher,
      dedupingInterval: 5000,
      revalidateOnFocus: false,
      revalidateIfStale: false,
      revalidateOnReconnect: false,
      errorRetryCount: 2,
    }}>
      <BrowserRouter>
        <ErrorBoundary>
          <AuthShell>
            <AnimatedRoutes />
          </AuthShell>
        </ErrorBoundary>
      </BrowserRouter>
    </SWRConfig>
  )
}
