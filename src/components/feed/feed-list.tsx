import { useState, useMemo, useEffect } from 'react'
import { useNavigate, useLocation, useParams } from 'react-router-dom'
import useSWR from 'swr'
import { fetcher } from '../../lib/fetcher'
import { useI18n } from '../../lib/i18n'
import { MD_BREAKPOINT } from '../../lib/breakpoints'
import { Inbox, Plus, ChevronRight, Bookmark, ThumbsUp, Clock, Paperclip, Search, Command, ArrowBigUp, AlertTriangle, MessagesSquare } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { useFetchProgressContext } from '../../contexts/fetch-progress-context'
import { toast } from 'sonner'
import { useFeedActions } from '../../hooks/use-feed-actions'
import { useFeedDragDrop } from '../../hooks/use-feed-drag-drop'
import { useFeedSelection } from '../../hooks/use-feed-selection'
import { useFeedBulkActions } from '../../hooks/use-feed-bulk-actions'
import { useClipFeedId } from '../../hooks/use-clip-feed-id'
import { FeedModal } from './feed-modal'
import { ConfirmDialog } from '../ui/confirm-dialog'
import { FeedContextMenu, MultiSelectContextMenu, CategoryContextMenu } from './feed-context-menu'
import { SidebarMenu } from '../layout/sidebar-menu'
import { SidebarNavItem } from '../layout/sidebar-nav-item'
import { FeedListHeader } from './feed-list-header'
import { SearchDialog } from '../ui/search-dialog'
import { CommandPalette } from '../command-palette'
import { useGlobalShortcuts } from '../../hooks/use-global-shortcuts'
import { useAppLayout } from '../../app'
import { extractDomain } from '../../lib/url'
import type { FeedWithCounts, Category } from '../../../shared/types'

function isFeedInactive(feed: FeedWithCounts): boolean {
  if (feed.article_count === 0) return false
  if (!feed.latest_published_at) return true
  const daysSince = (Date.now() - new Date(feed.latest_published_at).getTime()) / (1000 * 60 * 60 * 24)
  return daysSince >= 90
}

interface FeedListProps {
  isOpen: boolean
  onClose: () => void
  onBackdropClose?: () => void
  onCollapse: () => void
  onMarkAllRead?: () => void
  onArticleMoved?: () => void
}

function UnreadBadge({ count }: { count: number }) {
  if (count <= 0) return null
  return (
    <span className="text-[11px] text-accent rounded-full px-1.5 leading-relaxed ml-2 shrink-0" style={{ backgroundColor: 'color-mix(in srgb, var(--color-accent) 15%, transparent)' }}>
      {count}
    </span>
  )
}

function FetchBadge({ fetched, total }: { fetched: number; total: number }) {
  return (
    <span className="text-[11px] text-muted rounded-full px-1.5 leading-relaxed ml-2 shrink-0 tabular-nums">
      {fetched}/{total}
    </span>
  )
}

export function FeedList({ isOpen, onClose, onBackdropClose, onCollapse, onMarkAllRead, onArticleMoved }: FeedListProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const { feedId, categoryId } = useParams<{ feedId?: string; categoryId?: string }>()
  const { t } = useI18n()
  const isInbox = location.pathname === '/inbox'
  const isBookmarks = location.pathname === '/bookmarks'
  const isLikes = location.pathname === '/likes'
  const isHistory = location.pathname === '/history'
  const isClips = location.pathname === '/clips'
  const isChat = location.pathname.startsWith('/chat')
  const selectedFeedId = feedId ? Number(feedId) : null
  const selectedCategoryId = categoryId ? Number(categoryId) : null
  const { progress, startFeedFetch, subscribeFeedFetch } = useFetchProgressContext()
  const { data: feedsData, mutate: mutateFeeds } = useSWR<{ feeds: FeedWithCounts[]; bookmark_count: number; like_count: number; clip_feed_id: number | null }>('/api/feeds', fetcher)
  const { data: categoriesData, mutate: mutateCategories } = useSWR<{ categories: Category[] }>('/api/categories', fetcher)
  const feeds = useMemo(() => feedsData?.feeds ?? [], [feedsData])
  const categories = useMemo(() => categoriesData?.categories ?? [], [categoriesData])

  const [feedModalOpen, setFeedModalOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [commandOpen, setCommandOpen] = useState(false)

  useGlobalShortcuts({
    onCommandPalette: () => setCommandOpen(true),
    onSearch: () => setSearchOpen(true),
    onAddFeed: () => setFeedModalOpen(true),
  })

  // Lock body scroll when sidebar is open on mobile
  useEffect(() => {
    const mql = window.matchMedia(`(min-width: ${MD_BREAKPOINT}px)`)
    function update() {
      if (isOpen && !mql.matches) {
        document.body.style.overflow = 'hidden'
      } else {
        document.body.style.overflow = ''
      }
    }
    update()
    mql.addEventListener('change', update)
    return () => {
      mql.removeEventListener('change', update)
      document.body.style.overflow = ''
    }
  }, [isOpen])

  const clipFeedId = useClipFeedId()

  // Group feeds by category (exclude clip feed from regular list)
  const { categorized, uncategorized, clipFeedData } = useMemo(() => {
    const catMap = new Map<number, FeedWithCounts[]>()
    const uncat: FeedWithCounts[] = []
    let clip: FeedWithCounts | undefined
    for (const feed of feeds) {
      if (feed.type === 'clip') {
        clip = feed
        continue
      }
      if (feed.category_id) {
        const arr = catMap.get(feed.category_id) ?? []
        arr.push(feed)
        catMap.set(feed.category_id, arr)
      } else {
        uncat.push(feed)
      }
    }
    return { categorized: catMap, uncategorized: uncat, clipFeedData: clip }
  }, [feeds])

  // Flat ordered list of feed IDs matching render order (for shift-click range selection)
  const orderedFeedIds = useMemo(() => {
    const ids: number[] = []
    for (const cat of categories) {
      const catFeeds = categorized.get(cat.id) ?? []
      for (const f of catFeeds) ids.push(f.id)
    }
    for (const f of uncategorized) ids.push(f.id)
    return ids
  }, [categories, categorized, uncategorized])

  const {
    selectedFeedIds: multiSelectedIds,
    selectedCount: multiSelectedCount,
    toggleSelect,
    clearSelection,
    isSelected: isMultiSelected,
    selectionGroupPos,
  } = useFeedSelection({ orderedFeedIds })

  // Escape key clears multi-selection
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && multiSelectedCount > 0) {
        clearSelection()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [multiSelectedCount, clearSelection])

  function handleFetchComplete(result: { totalNew: number; error?: boolean | undefined; name?: string }) {
    const name = result.name ?? ''
    if (result.error) toast.error(t('toast.fetchError', { name }))
    else if (result.totalNew > 0) toast.success(t('toast.fetchedArticles', { count: String(result.totalNew), name }))
    else toast(t('toast.noNewArticles', { name }))
  }

  const {
    renaming, setRenaming,
    confirm, setConfirm,
    renameInputRef, suppressClick,
    handleStartRenameFeed, handleStartRenameCategory,
    handleMarkAllReadFeed, handleMarkAllReadCategory,
    handleDeleteFeed, handleDeleteCategory,
    handleMoveToCategory,
    handleFetchFeed, handleFetchCategory,
    handleReDetectFeed,
    handleConfirm, handleRenameSubmit, handleToggleCollapse,
  } = useFeedActions({
    categorized, mutateFeeds, mutateCategories, startFeedFetch, onMarkAllRead,
    onFetchComplete: handleFetchComplete,
    onDeleted: () => {
      if (feedId || categoryId) void navigate('/inbox')
    },
  })

  const {
    dragOverTarget, isDragging,
    handleDragStart, handleDragOver, handleDragLeave, handleDrop, handleDragEnd,
  } = useFeedDragDrop({ feeds, mutateFeeds, onDropComplete: clearSelection })

  const {
    bulkDeleteConfirm, setBulkDeleteConfirm,
    handleBulkMoveToCategory, handleBulkMarkAllRead,
    handleBulkFetch, handleBulkDelete, handleBulkDeleteConfirm,
  } = useFeedBulkActions({
    feeds,
    selectedFeedIds: multiSelectedIds,
    mutateFeeds,
    clearSelection,
    startFeedFetch,
    onMarkAllRead,
    onFetchComplete: handleFetchComplete,
    onDeleted: (ids) => {
      if (feedId && ids.includes(Number(feedId))) void navigate('/inbox')
    },
  })

  const { settings } = useAppLayout()
  const showFeedActivity = settings.showFeedActivity

  const totalUnread = feeds.reduce((sum, f) => sum + (f.disabled || f.type === 'clip' ? 0 : f.unread_count), 0)

  function selectFeed(id: number | null) {
    if (id) {
      void navigate(`/feeds/${id}`)
    } else {
      void navigate('/inbox')
    }
    onClose()
  }

  function selectCategory(id: number) {
    void navigate(`/categories/${id}`)
    onClose()
  }

  function handleFeedClick(e: React.MouseEvent, feed: FeedWithCounts) {
    if (suppressClick.current) {
      suppressClick.current = false
      return
    }
    if (feed.disabled) {
      setConfirm({ type: 'enable-feed', feed })
      return
    }
    // Multi-select with Cmd/Ctrl or Shift
    if (e.metaKey || e.ctrlKey || e.shiftKey) {
      e.preventDefault()
      toggleSelect(feed.id, e.metaKey || e.ctrlKey, e.shiftKey)
      return
    }
    // Normal click — navigate and clear selection
    clearSelection()
    selectFeed(feed.id)
  }

  function renderFeedItem(feed: FeedWithCounts, indent = false) {
    const isRenaming = renaming?.type === 'feed' && renaming.feed.id === feed.id
    if (isRenaming && renaming?.type === 'feed') {
      return (
        <form
          key={feed.id}
          className={indent ? 'pl-6 px-2 py-1.5' : 'px-2 py-1.5'}
          onSubmit={e => { e.preventDefault(); void handleRenameSubmit() }}
        >
          <Input
            ref={renameInputRef}
            type="text"
            value={renaming.name}
            onChange={e => setRenaming({ ...renaming, name: e.target.value })}
            onKeyDown={e => { if (e.key === 'Escape') setRenaming(null) }}
            onBlur={() => void handleRenameSubmit()}
            className="px-2 py-1 rounded"
          />
        </form>
      )
    }

    const useMultiMenu = isMultiSelected(feed.id) && multiSelectedCount > 1

    const button = (
      <button
        draggable={!isRenaming}
        onDragStart={e => handleDragStart(e, feed, multiSelectedIds)}
        onDragEnd={handleDragEnd}
        onClick={e => handleFeedClick(e, feed)}
        className={`w-full text-left ${indent ? 'pl-7' : 'pl-2'} pr-2 py-1.5 text-sm flex items-center justify-between outline-none transition-colors hover:bg-hover-sidebar ${
          isMultiSelected(feed.id)
            ? ''
            : 'rounded-lg'
        } ${
          feed.disabled
            ? 'text-muted'
            : selectedFeedId === feed.id && multiSelectedCount === 0
              ? 'font-medium text-accent'
              : 'text-text'
        }`}
        style={isMultiSelected(feed.id) ? (() => {
          const { isFirst, isLast } = selectionGroupPos(feed.id)
          return {
            backgroundColor: 'color-mix(in srgb, var(--color-accent) 10%, transparent)',
            borderLeft: '1px solid color-mix(in srgb, var(--color-accent) 30%, transparent)',
            borderRight: '1px solid color-mix(in srgb, var(--color-accent) 30%, transparent)',
            borderTop: isFirst ? '1px solid color-mix(in srgb, var(--color-accent) 30%, transparent)' : 'none',
            borderBottom: isLast ? '1px solid color-mix(in srgb, var(--color-accent) 30%, transparent)' : 'none',
            borderRadius: `${isFirst ? '8px' : '0'} ${isFirst ? '8px' : '0'} ${isLast ? '8px' : '0'} ${isLast ? '8px' : '0'}`,
          }
        })() : undefined}
      >
        <div className="flex items-center gap-2 min-w-0">
          {(() => {
            const fallbackDomain = extractDomain(feed.url)
            const iconSrc = feed.icon_url || (fallbackDomain ? `https://www.google.com/s2/favicons?sz=16&domain=${fallbackDomain}` : null)
            if (!iconSrc) return null
            return (
              <img
                src={iconSrc}
                alt=""
                width={16}
                height={16}
                className="shrink-0 opacity-70"
              />
            )
          })()}
          <span className="truncate">
            {feed.disabled ? '⚠ ' : null}
            {feed.name}
          </span>
          {!feed.disabled && feed.last_error && feed.article_count === 0 && (
            <AlertTriangle size={13} className="text-warning shrink-0" />
          )}
          {showFeedActivity === 'on' && !feed.disabled && isFeedInactive(feed) && (
            <span className="text-[10px] text-muted ml-1 shrink-0">inactive</span>
          )}
        </div>
        {(() => {
          const fp = progress.get(feed.id)
          if (fp && fp.total > 0) return <FetchBadge fetched={fp.fetched} total={fp.total} />
          if (feed.unread_count > 0 && !feed.disabled) return <UnreadBadge count={feed.unread_count} />
          return null
        })()}
      </button>
    )

    if (useMultiMenu) {
      return (
        <MultiSelectContextMenu
          key={feed.id}
          selectedCount={multiSelectedCount}
          categories={categories}
          onMoveToCategory={handleBulkMoveToCategory}
          onMarkAllRead={handleBulkMarkAllRead}
          onFetch={handleBulkFetch}
          onDelete={handleBulkDelete}
        >
          {button}
        </MultiSelectContextMenu>
      )
    }

    return (
      <FeedContextMenu
        key={feed.id}
        feedType={feed.type}
        categories={categories}
        onRename={() => handleStartRenameFeed(feed)}
        onMarkAllRead={() => handleMarkAllReadFeed(feed)}
        onDelete={() => handleDeleteFeed(feed)}
        onMoveToCategory={(catId) => handleMoveToCategory(feed, catId)}
        onFetch={() => handleFetchFeed(feed)}
        onReDetect={() => handleReDetectFeed(feed)}
      >
        {button}
      </FeedContextMenu>
    )
  }

  function renderCategoryItem(category: Category) {
    const categoryFeeds = categorized.get(category.id) ?? []
    const unreadCount = categoryFeeds.reduce((sum, f) => sum + (f.disabled ? 0 : f.unread_count), 0)
    const isCollapsed = category.collapsed === 1
    const isSelected = selectedCategoryId === category.id

    const isRenaming = renaming?.type === 'category' && renaming.category.id === category.id
    if (isRenaming && renaming?.type === 'category') {
      return (
        <div key={category.id}>
          <form
            className="px-2 py-1.5"
            onSubmit={e => { e.preventDefault(); void handleRenameSubmit() }}
          >
            <Input
              ref={renameInputRef}
              type="text"
              value={renaming.name}
              onChange={e => setRenaming({ ...renaming, name: e.target.value })}
              onKeyDown={e => { if (e.key === 'Escape') setRenaming(null) }}
              onBlur={() => void handleRenameSubmit()}
              className="px-2 py-1 rounded"
            />
          </form>
        </div>
      )
    }

    return (
      <div
        key={category.id}
        onDragOver={e => handleDragOver(e, category.id)}
        onDragLeave={handleDragLeave}
        onDrop={e => handleDrop(e, category.id)}
        className={`rounded-lg transition-colors ${dragOverTarget === category.id ? 'bg-hover-sidebar' : ''}`}
      >
        <CategoryContextMenu
          onRename={() => handleStartRenameCategory(category)}
          onMarkAllRead={() => handleMarkAllReadCategory(category)}
          onDelete={() => handleDeleteCategory(category)}
          onFetch={() => handleFetchCategory(category)}
        >
          <button
            onClick={() => selectCategory(category.id)}
            className={`w-full text-left px-2 py-1.5 rounded-lg text-sm flex items-center justify-between outline-none transition-colors hover:bg-hover-sidebar ${
              isSelected ? 'font-medium text-accent' : 'text-text'
            }`}
          >
            <div className="flex items-center gap-1 min-w-0">
              <span
                className="shrink-0 w-5 h-5 flex items-center justify-center rounded hover:bg-hover transition-colors"
                onClick={e => handleToggleCollapse(category, e)}
              >
                <ChevronRight
                  size={14}
                  strokeWidth={1.5}
                  className={`text-muted transition-transform duration-150 ${isCollapsed ? '' : 'rotate-90'}`}
                />
              </span>
              <span className="truncate">{category.name}</span>
            </div>
            {(() => {
              const feedsWithProgress = categoryFeeds.filter(f => progress.has(f.id))
              if (feedsWithProgress.length > 0) {
                const agg = feedsWithProgress.reduce(
                  (acc, f) => {
                    const fp = progress.get(f.id)!
                    return { fetched: acc.fetched + fp.fetched, total: acc.total + fp.total }
                  },
                  { fetched: 0, total: 0 },
                )
                return <FetchBadge fetched={agg.fetched} total={agg.total} />
              }
              if (unreadCount > 0) return <UnreadBadge count={unreadCount} />
              return null
            })()}
          </button>
        </CategoryContextMenu>
        {!isCollapsed && categoryFeeds.map(feed => renderFeedItem(feed, true))}
      </div>
    )
  }

  return (
    <>
      {/* Backdrop (mobile only) */}
      <div
        className={`fixed inset-0 bg-overlay z-40 transition-opacity duration-200 md:hidden ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onBackdropClose ?? onClose}
      />

      {/* Sidebar: permanent on md+, overlay drawer on mobile */}
      <div
        className={`fixed top-0 left-0 bottom-0 w-[var(--sidebar-width)] z-50 md:z-20 border-r border-border flex flex-col transition-transform duration-200 ease-out select-none ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{ backgroundColor: 'var(--color-bg-sidebar)' }}
      >
        <FeedListHeader onClose={onClose} onCollapse={onCollapse} />

        <nav className="flex-1 overflow-y-auto overscroll-contain py-2 px-2">
          <SidebarNavItem icon={Inbox} label={t('feeds.inbox')} selected={isInbox && selectedFeedId === null} onClick={() => { void navigate('/inbox'); onClose() }} badge={totalUnread > 0 ? <UnreadBadge count={totalUnread} /> : undefined} />

          <SidebarNavItem icon={Search} label={t('search.title')} onClick={() => setSearchOpen(true)} className="group/search">
            <kbd className="hidden md:inline-flex text-[11px] text-muted bg-hover px-1.5 py-1 rounded opacity-0 group-hover/search:opacity-100 transition-opacity items-center gap-0"><span className="w-2.5 h-3 inline-flex items-center justify-center"><Command className="w-2.5 h-2.5" /></span><span className="w-3 h-3 inline-flex items-center justify-center"><ArrowBigUp className="w-2.5 h-2.5" /></span><span className="w-3 h-3 inline-flex items-center justify-center leading-none">K</span></kbd>
          </SidebarNavItem>

          <SidebarNavItem icon={Bookmark} label={t('feeds.bookmarks')} selected={isBookmarks} onClick={() => { void navigate('/bookmarks'); onClose() }} badge={(feedsData?.bookmark_count ?? 0) > 0 ? <UnreadBadge count={feedsData!.bookmark_count} /> : undefined} />

          <SidebarNavItem icon={ThumbsUp} label={t('feeds.likes')} selected={isLikes} onClick={() => { void navigate('/likes'); onClose() }} badge={(feedsData?.like_count ?? 0) > 0 ? <UnreadBadge count={feedsData!.like_count} /> : undefined} />

          {clipFeedId && (
            <SidebarNavItem icon={Paperclip} label={t('feeds.clips')} selected={isClips} onClick={() => { void navigate('/clips'); onClose() }} badge={clipFeedData && clipFeedData.unread_count > 0 ? <UnreadBadge count={clipFeedData.unread_count} /> : undefined} />
          )}

          <SidebarNavItem icon={Clock} label={t('feeds.history')} selected={isHistory} onClick={() => { void navigate('/history'); onClose() }} />

          <SidebarNavItem icon={MessagesSquare} label={t('chat.title')} selected={isChat} onClick={() => { void navigate('/chat'); onClose() }} />

          <SidebarNavItem icon={Plus} label={t('modal.addNew')} onClick={() => setFeedModalOpen(true)} className="text-muted hover:text-text" />

          <div className="px-2 pt-4 pb-1">
            <h2 className="text-[11px] font-medium uppercase tracking-wider text-muted">{t('feeds.title')}</h2>
          </div>

          {/* Categories with their feeds */}
          {!feedsData && (
            <div className="space-y-1">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-2 px-2 py-1.5">
                  <Skeleton className="w-4 h-4 shrink-0 rounded" />
                  <Skeleton className="h-3.5 flex-1" style={{ width: `${55 + (i % 3) * 15}%` }} />
                </div>
              ))}
            </div>
          )}
          {feedsData && categories.map(cat => renderCategoryItem(cat))}

          {/* Uncategorized feeds */}
          <div
            onDragOver={e => handleDragOver(e, 'uncategorized')}
            onDragLeave={handleDragLeave}
            onDrop={e => handleDrop(e, null)}
            className={`rounded-lg transition-colors ${dragOverTarget === 'uncategorized' ? 'bg-hover-sidebar' : ''}`}
          >
            {feedsData && uncategorized.length > 0
              ? uncategorized.map(feed => renderFeedItem(feed))
              : isDragging && (
                <div className="px-2 py-2 text-xs text-muted text-center border border-dashed border-border rounded-lg mx-2 my-1">
                  {t('category.uncategorized')}
                </div>
              )
            }
          </div>
        </nav>

        <div style={{ paddingBottom: 'var(--safe-area-inset-bottom)' }}>
          <SidebarMenu onClose={onClose} />
        </div>
      </div>

      {feedModalOpen && (
        <FeedModal
          onClose={() => setFeedModalOpen(false)}
          onCreated={() => mutateFeeds()}
          onCategoryCreated={() => mutateCategories()}
          onFetchStarted={(feedId) => void subscribeFeedFetch(feedId)}
          onArticleCreated={() => { void mutateFeeds(); onArticleMoved?.() }}
          categories={categories}
        />
      )}

      {searchOpen && <SearchDialog onClose={() => setSearchOpen(false)} />}

      <CommandPalette
        open={commandOpen}
        onOpenChange={setCommandOpen}
        onOpenSearch={() => setSearchOpen(true)}
        onOpenAddFeed={() => setFeedModalOpen(true)}
      />

      {bulkDeleteConfirm && (
        <ConfirmDialog
          title={t('feeds.bulkDelete', { count: String(multiSelectedCount) })}
          message={t('feeds.bulkDeleteConfirm', { count: String(multiSelectedCount) })}
          confirmLabel={t('feeds.delete')}
          danger
          onConfirm={handleBulkDeleteConfirm}
          onCancel={() => setBulkDeleteConfirm(false)}
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
    </>
  )
}
