import { useState, useCallback, useRef, useEffect } from 'react'
import useSWR, { useSWRConfig } from 'swr'
import {
  Pencil, Trash2, Check, X, RefreshCw, AlertTriangle,
  ChevronDown, ChevronRight, PowerOff, Power, Loader2, ExternalLink,
} from 'lucide-react'
import { useI18n } from '../../../lib/i18n'
import { fetcher, apiPatch, apiDelete, authHeaders } from '../../../lib/fetcher'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { FeedErrorBanner } from '@/components/feed/feed-error-banner'
import type { FeedWithCounts, Category } from '../../../../shared/types'

interface FeedsData {
  feeds: FeedWithCounts[]
}

interface CategoriesData {
  categories: Category[]
}

export function FeedsSection() {
  const { t } = useI18n()
  const { mutate: globalMutate } = useSWRConfig()

  const { data: feedsData, mutate: mutateFeeds } = useSWR<FeedsData>('/api/feeds', fetcher)
  const { data: catData, mutate: mutateCats } = useSWR<CategoriesData>('/api/categories', fetcher)

  const feeds = feedsData?.feeds ?? []
  const categories = catData?.categories ?? []

  const errorFeeds = feeds.filter(f => f.last_error && !f.disabled)

  const revalidate = useCallback(() => {
    void mutateFeeds()
    void mutateCats()
    void globalMutate((key: unknown) => typeof key === 'string' && key.startsWith('/api/feeds'))
    void globalMutate((key: unknown) => typeof key === 'string' && key.startsWith('/api/categories'))
  }, [mutateFeeds, mutateCats, globalMutate])

  const feedsByCategory = new Map<number | null, FeedWithCounts[]>()
  for (const f of feeds) {
    const key = f.category_id ?? null
    if (!feedsByCategory.has(key)) feedsByCategory.set(key, [])
    feedsByCategory.get(key)!.push(f)
  }

  return (
    <section className="space-y-8">
      <div>
        <h2 className="text-base font-semibold text-text mb-1">{t('settings.viewer')}</h2>
        <p className="text-xs text-muted">{t('settings.feedsDesc')}</p>
      </div>

      {errorFeeds.length > 0 && (
        <FeedIssuesPanel feeds={errorFeeds} categories={categories} onRevalidate={revalidate} />
      )}

      <div>
        <h3 className="text-sm font-medium text-text mb-3">{t('settings.feedAllFeeds')}</h3>
        {feeds.length === 0 ? (
          <p className="text-sm text-muted">{t('settings.feedsEmpty')}</p>
        ) : (
          <div className="space-y-2">
            {categories.map(cat => (
              <CategoryGroup
                key={cat.id}
                category={cat}
                feeds={feedsByCategory.get(cat.id) ?? []}
                categories={categories}
                onRevalidate={revalidate}
              />
            ))}
            {(feedsByCategory.get(null) ?? []).length > 0 && (
              <UncategorizedGroup
                feeds={feedsByCategory.get(null)!}
                categories={categories}
                onRevalidate={revalidate}
              />
            )}
          </div>
        )}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Feed Issues Panel — with edit (URL expand) and delete
// ---------------------------------------------------------------------------

function FeedIssuesPanel({
  feeds,
  categories,
  onRevalidate,
}: {
  feeds: FeedWithCounts[]
  categories: Category[]
  onRevalidate: () => void
}) {
  const { t } = useI18n()
  const [expanded, setExpanded] = useState<number | null>(null)

  const startFeedFetch = useCallback(async (feedId: number) => {
    const headers = { ...authHeaders(), 'Content-Type': 'application/json' }
    const res = await fetch(`/api/feeds/${feedId}/fetch`, { method: 'POST', headers, signal: AbortSignal.timeout(120_000) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    if (res.body) {
      const reader = res.body.getReader()
      for (;;) { const { done } = await reader.read(); if (done) break }
    }
  }, [])

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle size={14} className="text-error shrink-0" />
        <h3 className="text-sm font-medium text-error">{t('settings.feedIssues')}</h3>
        <span className="text-xs text-muted">({feeds.length})</span>
      </div>
      <div className="space-y-2">
        {feeds.map(feed => (
          <ErrorFeedRow
            key={feed.id}
            feed={feed}
            categories={categories}
            expanded={expanded === feed.id}
            onToggleExpand={() => setExpanded(prev => prev === feed.id ? null : feed.id)}
            onFetch={async () => {
              await startFeedFetch(feed.id)
              onRevalidate()
            }}
            onRevalidate={onRevalidate}
          />
        ))}
      </div>
    </div>
  )
}

function ErrorFeedRow({
  feed,
  categories,
  expanded,
  onToggleExpand,
  onFetch,
  onRevalidate,
}: {
  feed: FeedWithCounts
  categories: Category[]
  expanded: boolean
  onToggleExpand: () => void
  onFetch: () => Promise<void>
  onRevalidate: () => void
}) {
  const { t } = useI18n()
  const [editingName, setEditingName] = useState(false)
  const [nameValue, setNameValue] = useState(feed.name)
  const [showUrls, setShowUrls] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const nameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editingName) { nameInputRef.current?.focus(); nameInputRef.current?.select() }
  }, [editingName])

  async function handleSaveName() {
    const trimmed = nameValue.trim()
    if (!trimmed || trimmed === feed.name) { setEditingName(false); return }
    try { await apiPatch(`/api/feeds/${feed.id}`, { name: trimmed }); onRevalidate() }
    catch { setNameValue(feed.name) }
    setEditingName(false)
  }

  async function handleDelete() {
    await apiDelete(`/api/feeds/${feed.id}`)
    onRevalidate()
    setDeleteConfirm(false)
  }

  return (
    <>
      <div className="rounded-lg border border-error/30 bg-error/5 overflow-hidden">
        {/* Header row */}
        <div className="flex items-center gap-2 px-3 py-2.5">
          {editingName ? (
            <div className="flex items-center gap-1 flex-1 min-w-0">
              <input
                ref={nameInputRef}
                value={nameValue}
                onChange={e => setNameValue(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') void handleSaveName()
                  if (e.key === 'Escape') { setNameValue(feed.name); setEditingName(false) }
                }}
                className="flex-1 px-1.5 py-0.5 text-sm rounded border border-accent bg-bg text-text focus:outline-none"
              />
              <button type="button" onClick={() => void handleSaveName()} className="p-1 text-accent hover:opacity-80"><Check size={13} /></button>
              <button type="button" onClick={() => { setNameValue(feed.name); setEditingName(false) }} className="p-1 text-muted hover:text-text"><X size={13} /></button>
            </div>
          ) : (
            <button type="button" onClick={onToggleExpand} className="flex-1 min-w-0 text-left">
              <span className="text-sm font-medium text-text truncate block">{feed.name}</span>
              <span className="text-xs text-error/80 truncate block mt-0.5">{feed.last_error}</span>
            </button>
          )}

          {!editingName && (
            <div className="flex items-center gap-1 shrink-0">
              <button type="button" onClick={() => { setEditingName(true); setShowUrls(false) }} className="p-1 text-muted hover:text-text transition-colors" title={t('feeds.rename')}>
                <Pencil size={13} />
              </button>
              <button type="button" onClick={() => setShowUrls(v => !v)} className={`p-1 transition-colors ${showUrls ? 'text-accent' : 'text-muted hover:text-text'}`} title={t('settings.feedEditUrls')}>
                <ExternalLink size={13} />
              </button>
              <button type="button" onClick={() => setDeleteConfirm(true)} className="p-1 text-muted hover:text-error transition-colors" title={t('feeds.delete')}>
                <Trash2 size={13} />
              </button>
              <button type="button" onClick={onToggleExpand} className="p-1 text-muted hover:text-text transition-colors">
                {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              </button>
            </div>
          )}
        </div>

        {showUrls && !editingName && (
          <div className="border-t border-error/20">
            <UrlPanel feed={feed} categories={categories} onRevalidate={onRevalidate} />
          </div>
        )}

        {expanded && !showUrls && (
          <div className="border-t border-error/20">
            <FeedErrorBanner
              lastError={feed.last_error!}
              feedId={feed.id}
              onMutate={async () => { onRevalidate() }}
              onFetch={onFetch}
            />
          </div>
        )}
      </div>

      {deleteConfirm && (
        <ConfirmDialog
          title={t('feeds.deleteFeed')}
          message={t('feeds.deleteConfirm', { name: feed.name })}
          danger
          confirmLabel={t('feeds.delete')}
          onConfirm={() => void handleDelete()}
          onCancel={() => setDeleteConfirm(false)}
        />
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Category group (collapsible, default closed)
// ---------------------------------------------------------------------------

function CategoryGroup({
  category,
  feeds,
  categories,
  onRevalidate,
}: {
  category: Category
  feeds: FeedWithCounts[]
  categories: Category[]
  onRevalidate: () => void
}) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [nameValue, setNameValue] = useState(category.name)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const nameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editingName) { nameInputRef.current?.focus(); nameInputRef.current?.select() }
  }, [editingName])

  async function handleSaveName() {
    const trimmed = nameValue.trim()
    if (!trimmed || trimmed === category.name) { setEditingName(false); return }
    try { await apiPatch(`/api/categories/${category.id}`, { name: trimmed }); onRevalidate() }
    catch { setNameValue(category.name) }
    setEditingName(false)
  }

  async function handleDelete() {
    await apiDelete(`/api/categories/${category.id}`)
    onRevalidate()
    setDeleteConfirm(false)
  }

  return (
    <>
      <div className="rounded-lg border border-border overflow-hidden">
        {/* Category header */}
        <div className={`flex items-center gap-2 px-3 py-2 ${open ? 'bg-bg-card border-b border-border' : 'bg-bg-card'}`}>
          {editingName ? (
            <div className="flex items-center gap-1 flex-1 min-w-0">
              <input
                ref={nameInputRef}
                value={nameValue}
                onChange={e => setNameValue(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') void handleSaveName()
                  if (e.key === 'Escape') { setNameValue(category.name); setEditingName(false) }
                }}
                className="flex-1 px-1.5 py-0.5 text-sm font-medium rounded border border-accent bg-bg text-text focus:outline-none"
              />
              <button type="button" onClick={() => void handleSaveName()} className="p-1 text-accent hover:opacity-80"><Check size={13} /></button>
              <button type="button" onClick={() => { setNameValue(category.name); setEditingName(false) }} className="p-1 text-muted hover:text-text"><X size={13} /></button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setOpen(v => !v)}
              className="flex items-center gap-2 flex-1 min-w-0 text-left"
            >
              {open ? <ChevronDown size={14} className="text-muted shrink-0" /> : <ChevronRight size={14} className="text-muted shrink-0" />}
              <span className="text-sm font-medium text-text">{category.name}</span>
              <span className="text-xs text-muted">({feeds.length})</span>
            </button>
          )}

          {!editingName && (
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => setEditingName(true)}
                className="p-1 text-muted hover:text-text transition-colors"
                title={t('category.rename')}
              >
                <Pencil size={13} />
              </button>
              <button
                type="button"
                onClick={() => setDeleteConfirm(true)}
                className="p-1 text-muted hover:text-error transition-colors"
                title={t('category.delete')}
              >
                <Trash2 size={13} />
              </button>
            </div>
          )}
        </div>

        {/* Feeds */}
        {open && feeds.length > 0 && (
          <div className="divide-y divide-border">
            {feeds.map(feed => (
              <FeedRow
                key={feed.id}
                feed={feed}
                categories={categories}
                onRevalidate={onRevalidate}
              />
            ))}
          </div>
        )}

        {open && feeds.length === 0 && (
          <p className="px-4 py-3 text-xs text-muted">{t('settings.feedsEmpty')}</p>
        )}
      </div>

      {deleteConfirm && (
        <ConfirmDialog
          title={t('category.delete')}
          message={t('category.deleteConfirm', { name: category.name })}
          danger
          confirmLabel={t('feeds.delete')}
          onConfirm={() => void handleDelete()}
          onCancel={() => setDeleteConfirm(false)}
        />
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Uncategorized group
// ---------------------------------------------------------------------------

function UncategorizedGroup({
  feeds,
  categories,
  onRevalidate,
}: {
  feeds: FeedWithCounts[]
  categories: Category[]
  onRevalidate: () => void
}) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-bg-card text-left"
      >
        {open ? <ChevronDown size={14} className="text-muted shrink-0" /> : <ChevronRight size={14} className="text-muted shrink-0" />}
        <span className="text-sm font-medium text-muted">{t('settings.feedNoCategory')}</span>
        <span className="text-xs text-muted">({feeds.length})</span>
      </button>

      {open && (
        <div className="divide-y divide-border border-t border-border">
          {feeds.map(feed => (
            <FeedRow
              key={feed.id}
              feed={feed}
              categories={categories}
              onRevalidate={onRevalidate}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Single feed row (inside category group)
// ---------------------------------------------------------------------------

function FeedRow({
  feed,
  categories,
  onRevalidate,
}: {
  feed: FeedWithCounts
  categories: Category[]
  onRevalidate: () => void
}) {
  const { t } = useI18n()
  const [editingName, setEditingName] = useState(false)
  const [nameValue, setNameValue] = useState(feed.name)
  const [showUrls, setShowUrls] = useState(false)
  const [fetching, setFetching] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const nameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editingName) { nameInputRef.current?.focus(); nameInputRef.current?.select() }
  }, [editingName])

  async function handleSaveName() {
    const trimmed = nameValue.trim()
    if (!trimmed || trimmed === feed.name) { setEditingName(false); return }
    try { await apiPatch(`/api/feeds/${feed.id}`, { name: trimmed }); onRevalidate() }
    catch { setNameValue(feed.name) }
    setEditingName(false)
  }

  async function handleToggleDisabled() {
    await apiPatch(`/api/feeds/${feed.id}`, { disabled: feed.disabled ? 0 : 1 })
    onRevalidate()
  }

  async function handleDelete() {
    await apiDelete(`/api/feeds/${feed.id}`)
    onRevalidate()
    setDeleteConfirm(false)
  }

  async function handleFetch() {
    if (fetching) return
    setFetching(true)
    try {
      const headers = { ...authHeaders(), 'Content-Type': 'application/json' }
      const res = await fetch(`/api/feeds/${feed.id}/fetch`, { method: 'POST', headers, signal: AbortSignal.timeout(120_000) })
      if (res.body) {
        const reader = res.body.getReader()
        for (;;) { const { done } = await reader.read(); if (done) break }
      }
      onRevalidate()
    } catch {
      onRevalidate()
    } finally {
      setFetching(false)
    }
  }

  const hasError = !!feed.last_error && !feed.disabled

  return (
    <>
      <div className={`${feed.disabled ? 'opacity-50' : ''}`}>
        {/* Main row */}
        <div className={`flex items-center gap-2 px-3 py-2 ${hasError ? 'bg-error/5' : 'bg-bg-card'}`}>
          <div className="min-w-0 flex-1">
            {editingName ? (
              <div className="flex items-center gap-1">
                <input
                  ref={nameInputRef}
                  value={nameValue}
                  onChange={e => setNameValue(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') void handleSaveName()
                    if (e.key === 'Escape') { setNameValue(feed.name); setEditingName(false) }
                  }}
                  className="flex-1 px-1.5 py-0.5 text-sm rounded border border-accent bg-bg text-text focus:outline-none"
                />
                <button type="button" onClick={() => void handleSaveName()} className="p-1 text-accent hover:opacity-80"><Check size={13} /></button>
                <button type="button" onClick={() => { setNameValue(feed.name); setEditingName(false) }} className="p-1 text-muted hover:text-text"><X size={13} /></button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-sm text-text truncate">{feed.name}</span>
                {feed.disabled && (
                  <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-muted/20 text-muted">{t('settings.feedDisabled')}</span>
                )}
                {hasError && <AlertTriangle size={12} className="text-error shrink-0" />}
              </div>
            )}

            {!editingName && (
              <div className="flex items-center gap-2 mt-0.5 text-xs text-muted">
                <span>{feed.article_count} {t('settings.feedArticles')}</span>
                {feed.unread_count > 0 && (
                  <>
                    <span>·</span>
                    <span className="text-accent">{feed.unread_count} {t('settings.feedUnread')}</span>
                  </>
                )}
              </div>
            )}
          </div>

          {!editingName && (
            <div className="flex items-center gap-1 shrink-0">
              <button type="button" onClick={() => void handleFetch()} disabled={fetching || !!feed.disabled} className="p-1 text-muted hover:text-text transition-colors disabled:opacity-40" title={t('feeds.fetch')}>
                {fetching ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
              </button>
              <button type="button" onClick={() => { setNameValue(feed.name); setEditingName(true); setShowUrls(false) }} className="p-1 text-muted hover:text-text transition-colors" title={t('feeds.rename')}>
                <Pencil size={13} />
              </button>
              <button type="button" onClick={() => void handleToggleDisabled()} className="p-1 text-muted hover:text-text transition-colors" title={feed.disabled ? t('settings.feedEnable') : t('settings.feedDisable')}>
                {feed.disabled ? <Power size={13} /> : <PowerOff size={13} />}
              </button>
              <button type="button" onClick={() => setDeleteConfirm(true)} className="p-1 text-muted hover:text-error transition-colors" title={t('feeds.delete')}>
                <Trash2 size={13} />
              </button>
              <button type="button" onClick={() => setShowUrls(v => !v)} className={`p-1 transition-colors ${showUrls ? 'text-accent' : 'text-muted hover:text-text'}`} title={t('settings.feedEditUrls')}>
                {showUrls ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              </button>
            </div>
          )}
        </div>

        {showUrls && !editingName && (
          <div className="border-t border-border">
            <UrlPanel feed={feed} categories={categories} onRevalidate={onRevalidate} />
          </div>
        )}
      </div>

      {deleteConfirm && (
        <ConfirmDialog
          title={t('feeds.deleteFeed')}
          message={t('feeds.deleteConfirm', { name: feed.name })}
          danger
          confirmLabel={t('feeds.delete')}
          onConfirm={() => void handleDelete()}
          onCancel={() => setDeleteConfirm(false)}
        />
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// URL + category editing panel
// ---------------------------------------------------------------------------

function UrlPanel({
  feed,
  categories,
  onRevalidate,
}: {
  feed: FeedWithCounts
  categories: Category[]
  onRevalidate: () => void
}) {
  const { t } = useI18n()
  const [rssUrl, setRssUrl] = useState(feed.rss_url ?? '')
  const [bridgeUrl, setBridgeUrl] = useState(feed.rss_bridge_url ?? '')
  const [categoryId, setCategoryId] = useState<string>(feed.category_id?.toString() ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isDirty =
    rssUrl !== (feed.rss_url ?? '') ||
    bridgeUrl !== (feed.rss_bridge_url ?? '') ||
    categoryId !== (feed.category_id?.toString() ?? '')

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const newCategoryId = categoryId === '' ? null : parseInt(categoryId, 10)
      await apiPatch(`/api/feeds/${feed.id}`, {
        rss_url: rssUrl.trim() || null,
        rss_bridge_url: bridgeUrl.trim() || null,
        category_id: newCategoryId,
      })
      onRevalidate()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="px-3 py-3 space-y-2.5 bg-bg/50">
      {/* Category */}
      <div>
        <label className="block text-xs text-muted mb-1">{t('settings.feedCategory')}</label>
        <select
          value={categoryId}
          onChange={e => setCategoryId(e.target.value)}
          className="w-full text-xs px-2 py-1.5 rounded border border-border bg-bg text-text focus:outline-none focus:ring-1 focus:ring-accent"
        >
          <option value="">{t('settings.feedNoCategory')}</option>
          {categories.map(c => (
            <option key={c.id} value={c.id.toString()}>{c.name}</option>
          ))}
        </select>
      </div>

      {/* Source URL (read-only) */}
      <div>
        <label className="block text-xs text-muted mb-1">{t('settings.feedSourceUrl')}</label>
        <div className="flex items-center gap-1.5">
          <span className="flex-1 text-xs text-text font-mono bg-bg border border-border rounded px-2 py-1 truncate select-all">
            {feed.url}
          </span>
          <a href={feed.url} target="_blank" rel="noopener noreferrer" className="p-1 text-muted hover:text-text transition-colors shrink-0">
            <ExternalLink size={13} />
          </a>
        </div>
      </div>

      {/* RSS URL */}
      <div>
        <label className="block text-xs text-muted mb-1">{t('settings.feedRssUrl')}</label>
        <div className="flex items-center gap-1.5">
          <input
            type="url"
            value={rssUrl}
            onChange={e => setRssUrl(e.target.value)}
            placeholder={t('settings.feedRssUrlPlaceholder')}
            className="flex-1 text-xs font-mono px-2 py-1 rounded border border-border bg-bg text-text placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-accent"
          />
          {rssUrl && (
            <a href={rssUrl} target="_blank" rel="noopener noreferrer" className="p-1 text-muted hover:text-text transition-colors shrink-0">
              <ExternalLink size={13} />
            </a>
          )}
        </div>
      </div>

      {/* Bridge URL */}
      <div>
        <label className="block text-xs text-muted mb-1">{t('settings.feedBridgeUrl')}</label>
        <input
          type="url"
          value={bridgeUrl}
          onChange={e => setBridgeUrl(e.target.value)}
          placeholder={t('settings.feedBridgeUrlPlaceholder')}
          className="w-full text-xs font-mono px-2 py-1 rounded border border-border bg-bg text-text placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-accent"
        />
      </div>

      {error && <p className="text-xs text-error">{error}</p>}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={!isDirty || saving}
          className="inline-flex items-center gap-1.5 px-3 py-1 text-xs rounded-lg bg-accent text-accent-text hover:opacity-80 disabled:opacity-40 transition-opacity"
        >
          {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
          {t('settings.feedSave')}
        </button>
      </div>
    </div>
  )
}
