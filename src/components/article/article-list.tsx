import { useState, useRef, useEffect, useCallback, useImperativeHandle, forwardRef, useMemo } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import useSWR from 'swr'
import useSWRInfinite from 'swr/infinite'
import { useSWRConfig } from 'swr'
import { fetcher } from '../../lib/fetcher'
import { markSeenOnServer } from '../../lib/markSeenWithQueue'
import { useI18n } from '../../lib/i18n'
import { trackRead } from '../../lib/readTracker'
import { useIsTouchDevice } from '../../hooks/use-is-touch-device'
import { useClipFeedId } from '../../hooks/use-clip-feed-id'
import { useAppLayout } from '../../app'
import { ArticleCard, type ArticleDisplayConfig } from './article-card'
import { FeedMetricsBar } from '../feed/feed-metrics-bar'
import { SwipeableArticleCard } from './swipeable-article-card'
import { articleUrlToPath } from '../../lib/url'
import { ArticleOverlay } from './article-overlay'
import { PullToRefresh } from '../layout/pull-to-refresh'
import { useFetchProgressContext } from '../../contexts/fetch-progress-context'
import { toast } from 'sonner'
import { Mascot } from '../ui/mascot'
import { FeedErrorBanner } from '../feed/feed-error-banner'
import { Skeleton } from '../ui/skeleton'
import { useKeyboardNavigationContext } from '../../contexts/keyboard-navigation-context'
import { useKeyboardNavigation } from '../../hooks/use-keyboard-navigation'
import { apiPatch } from '../../lib/fetcher'
import type { ArticleListItem, FeedWithCounts } from '../../../shared/types'
import type { LayoutName } from '../../data/layouts'

interface ArticlesResponse {
  articles: ArticleListItem[]
  total: number
  has_more: boolean
  total_without_floor?: number
  total_all?: number
}

const PAGE_SIZE = 20

/** How often (ms) to flush the batch of read article IDs to the server */
const BATCH_FLUSH_INTERVAL = 1500

export interface ArticleListHandle {
  revalidate: () => void
}

export const ArticleList = forwardRef<ArticleListHandle, object>(function ArticleList(_props, ref) {
  const location = useLocation()
  const navigate = useNavigate()
  const { feedId: feedIdParam, categoryId: categoryIdParam } = useParams<{ feedId?: string; categoryId?: string }>()
  const { settings } = useAppLayout()
  const clipFeedId = useClipFeedId()

  const isInbox = location.pathname === '/inbox'
  const isBookmarks = location.pathname === '/bookmarks'
  const isLikes = location.pathname === '/likes'
  const isHistory = location.pathname === '/history'
  const isClips = location.pathname === '/clips'
  const isCollectionView = isBookmarks || isLikes || isHistory || isClips

  const { data: feedsData } = useSWR<{ feeds: FeedWithCounts[] }>('/api/feeds', fetcher)
  const feedId = feedIdParam ? Number(feedIdParam) : (isClips && clipFeedId ? clipFeedId : undefined)
  const currentFeed = feedId && feedsData ? feedsData.feeds.find(f => f.id === feedId) : undefined
  const categoryId = categoryIdParam ? Number(categoryIdParam) : undefined
  const [showReadArticles, setShowReadArticles] = useState(false)
  const categoryUnreadOnly = !!categoryId && settings.categoryUnreadOnly === 'on'
  const unreadOnly = isInbox || (categoryUnreadOnly && !showReadArticles)
  const bookmarkedOnly = isBookmarks
  const likedOnly = isLikes
  const readOnly = isHistory
  const { autoMarkRead, dateMode, indicatorStyle, layout, articleOpenMode, keyboardNavigation, keybindings } = settings
  const [overlayUrl, setOverlayUrl] = useState<string | null>(null)
  const [noFloor, setNoFloor] = useState(false)
  const displayConfig: ArticleDisplayConfig = useMemo(() => ({
    dateMode,
    indicatorStyle,
    showUnreadIndicator: settings.showUnreadIndicator === 'on',
    showThumbnails: settings.showThumbnails === 'on',
  }), [dateMode, indicatorStyle, settings.showUnreadIndicator, settings.showThumbnails])
  const isGridLayout = layout === 'card' || layout === 'magazine'
  const { t } = useI18n()
  const { progress, startFeedFetch } = useFetchProgressContext()
  const { mutate: globalMutate } = useSWRConfig()
  const getKey = (pageIndex: number, previousPageData: ArticlesResponse | null) => {
    if (previousPageData && !previousPageData.has_more) return null
    const params = new URLSearchParams()
    if (feedId) params.set('feed_id', String(feedId))
    if (categoryId) params.set('category_id', String(categoryId))
    if (unreadOnly) params.set('unread', '1')
    if (bookmarkedOnly) params.set('bookmarked', '1')
    if (likedOnly) params.set('liked', '1')
    if (readOnly) params.set('read', '1')
    if (noFloor) params.set('no_floor', '1')
    params.set('limit', String(PAGE_SIZE))
    params.set('offset', String(pageIndex * PAGE_SIZE))
    return `/api/articles?${params.toString()}`
  }

  const { data, error, size, setSize, isLoading, isValidating, mutate } = useSWRInfinite<ArticlesResponse>(
    getKey,
    fetcher,
    {
      revalidateFirstPage: isCollectionView,
    },
  )

  useImperativeHandle(ref, () => ({
    revalidate: () => mutate(),
  }), [mutate])

  const articles = useMemo(() => data ? data.flatMap(page => page.articles) : [], [data])
  const hasMore = data ? data[data.length - 1]?.has_more ?? false : false
  const isEmpty = data?.[0]?.articles.length === 0
  const totalAll = data?.[0]?.total_all
  const allReadEmpty = isEmpty && categoryUnreadOnly && !showReadArticles && totalAll != null && totalAll > 0
  const hiddenByFloor = data?.[0]?.total_without_floor != null
    ? data[0].total_without_floor - (data[0].total ?? 0)
    : 0

  // ---------------------------------------------------------------------------
  // Keyboard navigation
  // ---------------------------------------------------------------------------
  const { focusedItemId, setFocusedItemId, setArticleIds, setArticleUrls, setNavigateToArticle, setLastListUrl } = useKeyboardNavigationContext()
  const isKeyboardNavEnabled = keyboardNavigation === 'on' && !isGridLayout

  const articleIds = useMemo(() => articles.map(a => String(a.id)), [articles])
  const articleUrls = useMemo(() => {
    const map: Record<string, string> = {}
    for (const a of articles) map[String(a.id)] = a.url
    return map
  }, [articles])

  useEffect(() => {
    setArticleIds(articleIds)
    setArticleUrls(articleUrls)
  }, [articleIds, articleUrls, setArticleIds, setArticleUrls])

  useEffect(() => {
    setLastListUrl(location.pathname)
  }, [location.pathname, setLastListUrl])

  const articleMap = useMemo(() => {
    const map = new Map<string, ArticleListItem>()
    for (const a of articles) map.set(String(a.id), a)
    return map
  }, [articles])

  const isOverlayMode = articleOpenMode === 'overlay'

  useEffect(() => {
    setNavigateToArticle(() => (id: string) => {
      const article = articleMap.get(id)
      if (!article) return
      if (isOverlayMode) {
        setOverlayUrl(article.url)
      } else {
        void navigate(articleUrlToPath(article.url))
      }
    })
  }, [articleMap, isOverlayMode, navigate, setNavigateToArticle])
  // Short debounce after overlay close to prevent Escape from immediately clearing focus
  const escapeDebounceRef = useRef(false)

  useKeyboardNavigation({
    items: articleIds,
    focusedItemId,
    onFocusChange: (id) => {
      setFocusedItemId(id)
      const el = document.querySelector(`[data-article-id="${id}"]`)
      el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      // Overlay mode: open article immediately on j/k
      if (isOverlayMode) {
        const article = articleMap.get(id)
        if (article) setOverlayUrl(article.url)
      }
    },
    onEnter: isOverlayMode ? undefined : (id) => {
      // Page mode: Enter to navigate
      const article = articleMap.get(id)
      if (article) {
        void navigate(articleUrlToPath(article.url))
      }
    },
    onEscape: () => {
      if (escapeDebounceRef.current) return
      setFocusedItemId(null)
    },
    onBookmarkToggle: (id) => {
      const article = articleMap.get(id)
      if (!article) return
      const next = !article.bookmarked_at
      // Optimistic update: flip bookmarked_at in local SWR cache immediately
      void mutate(
        (pages) => pages?.map(page => ({
          ...page,
          articles: page.articles.map(a =>
            String(a.id) === id
              ? { ...a, bookmarked_at: next ? new Date().toISOString() : null }
              : a
          ),
        })),
        { revalidate: false },
      )
      apiPatch(`/api/articles/${article.id}/bookmark`, { bookmarked: next })
        .then(() => {
          void globalMutate((key: string) => typeof key === 'string' && key.startsWith('/api/feeds'))
        })
        .catch(() => {
          // Roll back on failure
          void mutate()
        })
    },
    onOpenExternal: (id) => {
      const article = articleMap.get(id)
      if (article?.url) window.open(article.url, '_blank')
    },
    onNearEnd: () => loadMoreRef.current(),
    enabled: isKeyboardNavEnabled,
    keyBindings: keybindings,
  })

  // ---------------------------------------------------------------------------
  // Infinite scroll
  // ---------------------------------------------------------------------------
  const sentinelRef = useRef<HTMLDivElement>(null)

  // Keep loadMore in a stable ref so the IntersectionObserver callback
  // always sees the latest values without needing to recreate the observer.
  const loadMoreRef = useRef(() => {})
  loadMoreRef.current = () => {
    if (hasMore && !isValidating) {
      void setSize(size + 1)
    }
  }

  // Stable observer — created once via ref callback when sentinel mounts.
  const sentinelObserverRef = useRef<IntersectionObserver | null>(null)
  const sentinelCallbackRef = useCallback((node: HTMLDivElement | null) => {
    // Cleanup previous
    sentinelObserverRef.current?.disconnect()
    sentinelObserverRef.current = null
    sentinelRef.current = node

    if (!node) return
    const observer = new IntersectionObserver(
      entries => { if (entries[0].isIntersecting) loadMoreRef.current() },
      { rootMargin: '200px' },
    )
    observer.observe(node)
    sentinelObserverRef.current = observer
  }, [])

  // Re-trigger loading when a fetch completes while sentinel is still visible.
  // IntersectionObserver only fires on threshold crossings, so if the sentinel
  // stays within the viewport after new articles render, no event fires and
  // pagination stalls. This effect covers that gap.
  useEffect(() => {
    if (!isValidating && hasMore && sentinelRef.current) {
      const rect = sentinelRef.current.getBoundingClientRect()
      if (rect.top < window.innerHeight + 200) {
        void setSize(prev => prev + 1)
      }
    }
  }, [isValidating, hasMore, setSize])

  // ---------------------------------------------------------------------------
  // Auto-mark-as-read on scroll
  //
  // - IntersectionObserver fires when an article overlaps the header (48px)
  // - UI updates instantly via React state (autoReadIds)
  // - API calls are batched and flushed every ~1.5 s
  // ---------------------------------------------------------------------------
  const [autoReadIds, setAutoReadIds] = useState<Set<number>>(() => new Set())
  const observerRef = useRef<IntersectionObserver | null>(null)
  const batchQueue = useRef(new Set<number>())
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flushBatch = useCallback(() => {
    if (batchQueue.current.size === 0) return
    const ids = [...batchQueue.current]
    batchQueue.current.clear()
    markSeenOnServer(ids)
      .then(() => globalMutate(
        (key: string) => typeof key === 'string' && key.startsWith('/api/feeds'),
      ))
      .catch(() => {})
  }, [globalMutate])

  const scheduleFlush = useCallback(() => {
    if (flushTimerRef.current) return
    flushTimerRef.current = setTimeout(() => {
      flushTimerRef.current = null
      flushBatch()
    }, BATCH_FLUSH_INTERVAL)
  }, [flushBatch])

  // Mark an article as read: instant UI update + queue for server batch
  const markRead = useCallback((articleId: number) => {
    setAutoReadIds(prev => {
      if (prev.has(articleId)) return prev
      const next = new Set(prev)
      next.add(articleId)
      return next
    })
    trackRead(articleId)
    batchQueue.current.add(articleId)
    scheduleFlush()
  }, [scheduleFlush])

  // Stable ref so the observer callback always sees the latest markRead
  const markReadRef = useRef(markRead)
  markReadRef.current = markRead

  const isAutoMarkEnabled = autoMarkRead === 'on'
  const isTouchDevice = useIsTouchDevice()
  const listRef = useRef<HTMLElement>(null)

  // Create the IntersectionObserver once when auto-mark is enabled.
  // The observer instance is kept stable — new article nodes from infinite
  // scroll are added incrementally via a separate effect, avoiding the
  // disconnect/recreate race that caused missed or phantom read events.
  useEffect(() => {
    observerRef.current?.disconnect()
    observerRef.current = null
    if (!isAutoMarkEnabled) return

    // Measure actual header height in pixels — iOS Safari rejects rootMargin
    // values containing calc() or env() that getComputedStyle may return.
    const headerEl = document.querySelector('[data-header]') as HTMLElement | null
    const headerH = headerEl ? `${headerEl.offsetHeight}px` : '48px'

    const observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          const el = entry.target as HTMLElement
          const articleId = Number(el.dataset.articleId)
          if (!articleId) continue
          if (el.dataset.articleUnread !== '1') continue

          const rootTop = entry.rootBounds?.top ?? 0
          if (entry.boundingClientRect.top < rootTop) {
            markReadRef.current(articleId)
          }
        }
      },
      {
        rootMargin: `-${headerH} 0px 0px 0px`,
        threshold: [0, 1],
      },
    )

    observerRef.current = observer

    // Observe all article nodes already in the DOM
    if (listRef.current) {
      const nodes = listRef.current.querySelectorAll<HTMLElement>('[data-article-id]')
      nodes.forEach(node => observer.observe(node))
    }

    return () => observer.disconnect()
  }, [isAutoMarkEnabled]) // eslint-disable-line react-hooks/exhaustive-deps

  // Incrementally observe new article nodes added by infinite scroll.
  // Uses a MutationObserver to detect inserted DOM nodes so the
  // IntersectionObserver instance stays stable (no disconnect/recreate).
  useEffect(() => {
    const list = listRef.current
    const io = observerRef.current
    if (!list || !io || !isAutoMarkEnabled) return

    const mo = new MutationObserver(mutations => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (!(node instanceof HTMLElement)) continue
          // The node itself might be an article wrapper
          if (node.dataset.articleId) {
            io.observe(node)
          }
          // Or it might contain article wrappers (e.g. fragment insert)
          const children = node.querySelectorAll<HTMLElement>('[data-article-id]')
          children.forEach(child => io.observe(child))
        }
      }
    })

    mo.observe(list, { childList: true, subtree: true })
    return () => mo.disconnect()
  }, [isAutoMarkEnabled])

  // Flush remaining batch on unmount or feed/category change
  useEffect(() => {
    return () => {
      if (flushTimerRef.current) {
        clearTimeout(flushTimerRef.current)
        flushTimerRef.current = null
      }
      flushBatch()
    }
  }, [feedId, categoryId, flushBatch])

  // Reset autoReadIds, noFloor, showReadArticles, and keyboard focus when feed/category changes
  useEffect(() => {
    setAutoReadIds(new Set())
    setNoFloor(false)
    setShowReadArticles(false)
    setFocusedItemId(null)
  }, [feedId, categoryId, setFocusedItemId])

  return (
    <main ref={listRef} className="max-w-2xl mx-auto" role={!isGridLayout ? 'listbox' : undefined}>
      {isTouchDevice && <PullToRefresh onRefresh={async () => {
        if (feedId) {
          const result = await startFeedFetch(feedId)
          const name = currentFeed?.name ?? ''
          if (result.error) toast.error(t('toast.fetchError', { name }))
          else if (result.totalNew > 0) toast.success(t('toast.fetchedArticles', { count: String(result.totalNew), name }))
          else toast(t('toast.noNewArticles', { name }))
        } else {
          await mutate()
        }
      }} />}

      {currentFeed && currentFeed.type !== 'clip' && settings.showFeedActivity === 'on' && (
        <FeedMetricsBar feed={currentFeed} />
      )}

      {isLoading && <ArticleListSkeleton layout={layout} showThumbnails={displayConfig.showThumbnails} />}

      {error && (
        <div className="text-center py-12">
          <p className="text-muted mb-2">{t('articles.loadError')}</p>
          <button onClick={() => setSize(1)} className="text-accent text-sm">
            {t('articles.retry')}
          </button>
        </div>
      )}

      {allReadEmpty && !isLoading && (
        <div className="text-center py-12">
          <p className="text-muted mb-3">{t('articles.allRead')}</p>
          <button
            onClick={() => setShowReadArticles(true)}
            className="text-accent text-sm hover:underline"
          >
            {t('articles.showReadArticles')}
          </button>
        </div>
      )}

      {isEmpty && !allReadEmpty && !isLoading && currentFeed && feedId && progress.has(feedId) && (
        <FeedErrorBanner
          lastError={currentFeed.last_error ?? ''}
          feedId={currentFeed.id}
          overridePhase="processing"
        />
      )}

      {isEmpty && !allReadEmpty && !isLoading && !(feedId && progress.has(feedId)) && (
        currentFeed?.last_error ? (
          <FeedErrorBanner
            lastError={currentFeed.last_error}
            feedId={currentFeed.id}
            onMutate={async () => {
              await globalMutate((key: unknown) => typeof key === 'string' && key.startsWith('/api/feeds'))
            }}
            onFetch={currentFeed.type !== 'clip' ? async () => {
              const result = await startFeedFetch(currentFeed.id)
              const name = currentFeed.name
              if (result.error) toast.error(t('toast.fetchError', { name }))
              else if (result.totalNew > 0) { toast.success(t('toast.fetchedArticles', { count: String(result.totalNew), name })); void mutate() }
              else toast(t('toast.noNewArticles', { name }))
            } : undefined}
          />
        ) : (
          <p className="text-muted text-center py-12">{t('articles.empty')}</p>
        )
      )}

      <div className={isGridLayout ? 'grid grid-cols-1 md:grid-cols-2 gap-4 px-4 md:px-6' : ''}>
        {articles.map((article, index) => {
          const isAutoRead = autoReadIds.has(article.id)
          const effectiveArticle = isAutoRead
            ? { ...article, seen_at: article.seen_at ?? new Date().toISOString() }
            : article
          const handleOverlayOpen = articleOpenMode === 'overlay' ? (e: React.MouseEvent<HTMLAnchorElement>) => {
            if (e.metaKey || e.ctrlKey || e.button === 1) return
            e.preventDefault()
            setOverlayUrl(article.url)
          } : undefined
          const cardProps = {
            article: effectiveArticle,
            layout,
            isFeatured: layout === 'magazine' && index === 0,
            onClick: handleOverlayOpen,
            ...displayConfig,
          }
          const isKbFocused = focusedItemId === String(article.id)
          return (
            <div
              key={article.id}
              data-article-id={article.id}
              data-article-unread={article.seen_at == null && !isAutoRead ? '1' : '0'}
              aria-selected={isKbFocused || undefined}
              className={layout === 'magazine' && index === 0 ? 'col-span-full' : ''}
              style={isKbFocused ? {
                borderLeft: '2px solid var(--color-accent)',
                backgroundColor: 'color-mix(in srgb, var(--color-accent) 10%, transparent)',
              } : undefined}
              onClick={() => {
                if (!isGridLayout) {
                  setFocusedItemId(String(article.id))
                }
              }}
            >
              {isTouchDevice ? (
                <SwipeableArticleCard {...cardProps} />
              ) : (
                <ArticleCard {...cardProps} />
              )}
            </div>
          )
        })}
      </div>

      {hasMore && (
        <div ref={sentinelCallbackRef} className="py-4">
          {isValidating && <ArticleListSkeleton layout={layout} count={2} showThumbnails={displayConfig.showThumbnails} />}
        </div>
      )}

      {!hasMore && hiddenByFloor > 0 && (
        <div className="text-center py-6">
          <button
            onClick={() => setNoFloor(true)}
            className="text-accent text-sm hover:underline"
          >
            {t('articles.showOlder', { count: String(hiddenByFloor) })}
          </button>
        </div>
      )}

      {/* Scroll spacer: ensures the last article can scroll past the header for auto-mark-read */}
      {!hasMore && articles.length > 0 && isAutoMarkEnabled && !isCollectionView && (
        <div
          className="flex flex-col items-center justify-end select-none"
          style={{ minHeight: 'calc(100vh - var(--header-height))' }}
        >
          {settings.mascot !== 'off' && (
            <>
              <div>
                <Mascot choice={settings.mascot} />
              </div>
              <p className="text-muted/40 text-xs mt-4 pb-4">{t('articles.allCaughtUp')}</p>
            </>
          )}
        </div>
      )}

      <ArticleOverlay articleUrl={overlayUrl} onClose={() => {
        setOverlayUrl(null)
        escapeDebounceRef.current = true
        setTimeout(() => { escapeDebounceRef.current = false }, 100)
      }} />
    </main>
  )
})

function ArticleListSkeleton({ layout = 'list', count = 3, showThumbnails = true }: { layout?: LayoutName; count?: number; showThumbnails?: boolean }) {
  if (layout === 'compact') {
    return (
      <>
        {Array.from({ length: count * 2 }).map((_, i) => (
          <div key={i} className="border-b border-border py-1.5 px-4 md:px-6">
            <div className="flex items-center gap-2">
              <div className="w-2.5 shrink-0" />
              <Skeleton className="h-3.5 flex-1" />
              <Skeleton className="h-3 w-12 shrink-0" />
            </div>
          </div>
        ))}
      </>
    )
  }

  if (layout === 'card') {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 px-4 md:px-6">
        {Array.from({ length: count * 2 }).map((_, i) => (
          <div key={i} className="border border-border rounded-lg overflow-hidden">
            {showThumbnails && <Skeleton className="w-full aspect-video" />}
            <div className="p-3 space-y-1.5">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
              <div className="flex items-center gap-1 mt-1">
                <Skeleton className="w-3 h-3 shrink-0" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (layout === 'magazine') {
    return (
      <>
        {/* Hero skeleton */}
        <div className="border border-border rounded-lg overflow-hidden mb-4 mx-4 md:mx-6">
          {showThumbnails && <Skeleton className="w-full aspect-video" />}
          <div className="p-4 space-y-2">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-2/3" />
            <div className="flex items-center gap-1 mt-1">
              <Skeleton className="w-3.5 h-3.5 shrink-0" />
              <Skeleton className="h-3 w-28" />
            </div>
          </div>
        </div>
        {/* Small card skeletons */}
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="flex gap-3 border-b border-border py-2 px-4 md:px-6">
            {showThumbnails && <Skeleton className="w-12 h-12 shrink-0" />}
            <div className="flex-1 min-w-0 space-y-1.5">
              <Skeleton className="h-3.5 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
              <div className="flex items-center gap-1 mt-0.5">
                <Skeleton className="w-3 h-3 shrink-0" />
                <Skeleton className="h-3 w-20" />
              </div>
            </div>
          </div>
        ))}
      </>
    )
  }

  // Default: list layout
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="border-b border-border py-3 px-4 md:px-6">
          <div className="flex items-center gap-2">
            <div className="w-3 shrink-0" />
            <div className="flex-1 min-w-0 space-y-1.5">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
              <div className="flex items-center gap-1 mt-0.5">
                <Skeleton className="w-3.5 h-3.5 shrink-0" />
                <Skeleton className="h-3 w-28" />
              </div>
            </div>
            {showThumbnails && <Skeleton className="w-16 h-16 shrink-0" />}
          </div>
        </div>
      ))}
    </>
  )
}
