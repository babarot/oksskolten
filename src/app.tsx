import { BrowserRouter, Routes, Route, Navigate, Outlet, useParams, useLocation, useNavigate, useOutletContext } from 'react-router-dom'
import { useState, useMemo, useRef, useEffect, useLayoutEffect, useCallback } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Settings2 } from 'lucide-react'
import useSWR, { SWRConfig } from 'swr'
import { useSettings, type Settings } from './hooks/use-settings'
import { fetcher } from './lib/fetcher'
import { LocaleContext, APP_NAME, type Locale, useI18n, normalizeLocale, resolvePreferredLocale } from './lib/i18n'
import { MD_BREAKPOINT } from './lib/breakpoints'
import { useIsTouchDevice } from './hooks/use-is-touch-device'
import { saveScrollPosition, restoreScrollPosition } from './hooks/use-scroll-restoration'
import { useSwipeDrawer } from './hooks/use-swipe-drawer'
import { Header } from './components/layout/header'
import { ArticleList, type ArticleListHandle } from './components/article/article-list'
import { ArticleDetail } from './components/article/article-detail'
import { ArticleRawPage } from './components/article/article-raw-page'
import { PageLayout } from './components/layout/page-layout'
import { IconButton } from './components/ui/icon-button'
import { ConfirmDialog } from './components/ui/confirm-dialog'
import { FeedNotificationDialog } from './components/feed/feed-notification-dialog'
import { FeedDropdownMenu } from './components/feed/feed-context-menu'
import { FeedRenameDialog } from './components/feed/feed-rename-dialog'
import { SettingsPage } from './pages/settings-page'
import { ChatPage } from './pages/chat-page'
import { HomePage } from './pages/home-page'
import { AuthShell } from './lib/auth-shell'
import { ErrorBoundary } from './components/auth/error-boundary'
import { HintBanner } from './components/ui/hint-banner'
import { Toaster, toast } from 'sonner'
import { FetchProgressProvider, useFetchProgressContext } from './contexts/fetch-progress-context'
import { TooltipProvider } from './components/ui/tooltip'
import { useFeedActions } from './hooks/use-feed-actions'
import type { Category, FeedWithCounts } from '../shared/types'

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

  // Query parameter ?lang=ja|en|zh takes highest priority (useful for demo sharing links)
  const langFromUrl = useMemo(() => {
    return normalizeLocale(new URLSearchParams(window.location.search).get('lang'))
  }, [])

  const [locale, setLocaleState] = useState<Locale>(() => {
    return resolvePreferredLocale({
      urlLocale: langFromUrl,
      storedLocale: localStorage.getItem('locale'),
      navigatorLanguage: navigator.language,
    })
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
    const cached = normalizeLocale(localStorage.getItem('locale'))
    if (cached) return
    const profileLocale = normalizeLocale(profile?.language)
    if (profileLocale) setLocale(profileLocale)
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
            <Outlet context={{ settings, sidebarOpen, setSidebarOpen }} />
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

export function ArticleListPage() {
  const { feedId, categoryId } = useParams<{ feedId?: string; categoryId?: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const { t } = useI18n()
  const isInbox = location.pathname === '/inbox'
  const isBookmarks = location.pathname === '/bookmarks'
  const isLikes = location.pathname === '/likes'
  const isHistory = location.pathname === '/history'
  const isClips = location.pathname === '/clips'
  const { startFeedFetch } = useFetchProgressContext()
  const { data: feedsData, mutate: mutateFeeds } = useSWR<{ feeds: FeedWithCounts[]; bookmark_count: number; like_count: number; clip_feed_id: number | null }>('/api/feeds', fetcher)
  const { data: categoriesData, mutate: mutateCategories } = useSWR<{ categories: Category[] }>('/api/categories', fetcher)
  const feeds = useMemo(() => feedsData?.feeds ?? [], [feedsData])
  const categories = useMemo(() => categoriesData?.categories ?? [], [categoriesData])
  const currentFeed = feedId ? feeds.find(f => f.id === Number(feedId)) : undefined
  const [notificationFeed, setNotificationFeed] = useState<FeedWithCounts | null>(null)

  const categorized = useMemo(() => {
    const map = new Map<number, FeedWithCounts[]>()
    for (const feed of feeds) {
      if (!feed.category_id) continue
      const group = map.get(feed.category_id) ?? []
      group.push(feed)
      map.set(feed.category_id, group)
    }
    return map
  }, [feeds])

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
          ? currentFeed?.name ?? null
          : categoryId
            ? categories.find(c => c.id === Number(categoryId))?.name ?? null
            : null

  const articleListRef = useRef<ArticleListHandle>(null)
  const revalidateArticles = useCallback(() => articleListRef.current?.revalidate(), [])
  const handleFetchComplete = useCallback((result: { totalNew: number; error?: boolean; name?: string }) => {
    const name = result.name ?? ''
    if (result.error) toast.error(t('toast.fetchError', { name }))
    else if (result.totalNew > 0) toast.success(t('toast.fetchedArticles', { count: String(result.totalNew), name }))
    else toast(t('toast.noNewArticles', { name }))
  }, [t])

  const {
    renaming,
    setRenaming,
    confirm,
    setConfirm,
    handleStartRenameFeed,
    handleMarkAllReadFeed,
    handleDeleteFeed,
    handleMoveToCategory,
    handleUpdateViewType,
    handleFetchFeed,
    handleReDetectFeed,
    handleConfirm,
    handleRenameSubmit,
  } = useFeedActions({
    categorized,
    mutateFeeds,
    mutateCategories,
    startFeedFetch,
    onFetchComplete: handleFetchComplete,
    onMarkAllRead: revalidateArticles,
    onDeleted: () => {
      if (feedId) void navigate('/inbox')
    },
  })

  const showFeedMenu = !!feedId && !!currentFeed
  const headerAction = showFeedMenu && currentFeed ? (
    <FeedDropdownMenu
      feedType={currentFeed.type}
      categories={categories}
      onRename={() => handleStartRenameFeed(currentFeed)}
      onMarkAllRead={() => handleMarkAllReadFeed(currentFeed)}
      onDelete={() => handleDeleteFeed(currentFeed)}
      onMoveToCategory={(categoryId) => handleMoveToCategory(currentFeed, categoryId)}
      currentViewType={currentFeed.view_type}
      onViewTypeChange={(viewType) => handleUpdateViewType(currentFeed, viewType)}
      onFetch={() => handleFetchFeed(currentFeed)}
      onReDetect={() => handleReDetectFeed(currentFeed)}
      onConfigureNotifications={() => setNotificationFeed(currentFeed)}
    >
      <IconButton
        size="sm"
        className="shrink-0"
        aria-label={t('header.feedMenu')}
      >
        <Settings2 size={15} strokeWidth={1.5} />
      </IconButton>
    </FeedDropdownMenu>
  ) : undefined

  return (
    <PageLayout
      feedName={headerName}
      headerAction={headerAction}
      feedListProps={{ onMarkAllRead: revalidateArticles, onArticleMoved: revalidateArticles }}
    >
      {isInbox && <HintBanner storageKey="hint-dismissed-inbox">{t('hint.inbox')}</HintBanner>}
      {isBookmarks && <HintBanner storageKey="hint-dismissed-bookmarks">{t('hint.bookmarks')}</HintBanner>}
      {isLikes && <HintBanner storageKey="hint-dismissed-likes">{t('hint.likes')}</HintBanner>}
      {isHistory && <HintBanner storageKey="hint-dismissed-history">{t('hint.history')}</HintBanner>}
      {isClips && <HintBanner storageKey="hint-dismissed-clips">{t('hint.clips')}</HintBanner>}
      <ArticleList ref={articleListRef} listLabel={headerName ?? t('chat.scope.currentList')} />

      {notificationFeed && (
        <FeedNotificationDialog
          feed={notificationFeed}
          onClose={() => setNotificationFeed(null)}
        />
      )}

      {confirm && (
        <ConfirmDialog
          title={
            confirm.type === 'delete-feed' ? t('feeds.deleteFeed')
              : confirm.type === 'enable-feed' ? t('feeds.reEnableFeed')
                : t('category.delete')
          }
          message={
            confirm.type === 'delete-feed'
              ? t('feeds.deleteConfirm', { name: confirm.feed!.name })
              : confirm.type === 'enable-feed'
                ? t('feeds.reEnableConfirm')
                : t('category.deleteConfirm', { name: confirm.category!.name })
          }
          confirmLabel={
            confirm.type === 'delete-feed' ? t('feeds.delete')
              : confirm.type === 'enable-feed' ? t('feeds.enable')
                : t('category.delete')
          }
          danger={confirm.type !== 'enable-feed'}
          onConfirm={handleConfirm}
          onCancel={() => setConfirm(null)}
        />
      )}

      {renaming?.type === 'feed' && (
        <FeedRenameDialog
          value={renaming.name}
          onChange={(name) => setRenaming({ ...renaming, name })}
          onSubmit={handleRenameSubmit}
          onClose={() => setRenaming(null)}
        />
      )}
    </PageLayout>
  )
}

function SettingsPageWrapper() {
  return (
    <PageLayout>
      <SettingsPage />
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
      <ChatPage />
    </PageLayout>
  )
}

function HomePageWrapper() {
  return (
    <PageLayout>
      <HomePage />
    </PageLayout>
  )
}

function ArticleDetailPage() {
  const { '*': splat } = useParams()

  if (!splat) return null

  if (splat.endsWith('.md')) {
    const articleUrl = `https://${decodeURIComponent(splat.slice(0, -3))}`
    return <ArticleRawPage articleUrl={articleUrl} />
  }

  const articleUrl = `https://${decodeURIComponent(splat)}`

  return (
    <>
      <Header mode="detail" />
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
