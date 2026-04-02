import { useState, useMemo, useEffect, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import useSWR from 'swr'
import { renderMarkdown } from '../../lib/markdown'
import { sanitizeHtml } from '../../lib/sanitize'
import { fetcher, apiPost } from '../../lib/fetcher'
import { queueSeenIds } from '../../lib/offlineQueue'
import { useSWRConfig } from 'swr'
import { trackRead } from '../../lib/readTracker'
import { useArticleActions } from '../../hooks/use-article-actions'
import { useI18n } from '../../lib/i18n'
import { useRewriteInternalLinks } from '../../hooks/use-rewrite-internal-links'
import { ImageLightbox } from '../ui/image-lightbox'
import { ChatFab } from '../chat/chat-fab'
import { ConfirmDialog } from '../ui/confirm-dialog'
import { useChatInline, ChatInlinePanel } from '../chat/chat-inline'
import { useMetrics } from '../../hooks/use-metrics'
import { useSummarize } from '../../hooks/use-summarize'
import { useTranslate } from '../../hooks/use-translate'
import { formatDetailDate } from '../../lib/dateFormat'
import { useAppLayout } from '../../app'
import { Skeleton } from '../ui/skeleton'
import { Callout } from '../ui/callout'
import { rewriteBlockedXVideos } from '../../lib/x-video-fallback'
import { buildArticleScope, summarizeScope } from '../../lib/chat-scope'
import { ArticleToolbar } from './article-toolbar'
import { ArticleSummarySection } from './article-summary-section'
import { ArticleTranslationBanner } from './article-translation-banner'
import { ArticleContentBody } from './article-content-body'
import { ArticleSimilarBanner } from './article-similar-banner'
import { SocialArticleDetail } from './social-article-detail'
import type { ArticleDetail as ArticleDetailData } from '../../../shared/types'

interface ArticleDetailProps {
  articleUrl: string
}

export function ArticleDetail({ articleUrl }: ArticleDetailProps) {
  const { settings: { internalLinks, chatPosition, translateTargetLang } } = useAppLayout()
  const navigate = useNavigate()
  const { t, tError, isKeyNotSetError, locale } = useI18n()
  const articleKey = `/api/articles/by-url?url=${encodeURIComponent(articleUrl)}`
  const { data: article, error, mutate } = useSWR<ArticleDetailData>(articleKey, fetcher)
  const { mutate: globalMutate } = useSWRConfig()

  const effectiveTargetLang = translateTargetLang || locale
  const isUserLang = article?.lang === effectiveTargetLang
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null)

  const articleRef = useRef<HTMLElement>(null)

  const metrics = useMetrics()
  const { summary, summarizing, streamingText, handleSummarize, summaryHtml, streamingHtml, error: summarizeError } = useSummarize(article, metrics)
  // Only pass translation to the hook if it matches the current locale; stale translations are treated as absent
  const isTranslationCurrent = article?.translated_lang === effectiveTargetLang
  const translateInput = useMemo(() =>
    article ? { id: article.id, full_text_translated: isTranslationCurrent ? article.full_text_translated : null } : undefined,
    [article, isTranslationCurrent],
  )
  const { viewMode, setViewMode, translating, translatingText, fullTextTranslated, handleTranslate, translatingHtml, error: translateError } = useTranslate(translateInput, metrics)
  const {
    isBookmarked, isLiked, archivingImages, deleteConfirmOpen, setDeleteConfirmOpen,
    toggleBookmark, toggleLike, handleArchiveImages, handleDelete,
  } = useArticleActions(article, articleKey)
  const chat = useChatInline(article?.id ?? 0)

  // Sync translation/summary back into SWR cache so it persists across navigations
  useEffect(() => {
    if (fullTextTranslated && article && article.full_text_translated !== fullTextTranslated) {
      void mutate({ ...article, full_text_translated: fullTextTranslated, translated_lang: effectiveTargetLang }, false)
    }
  }, [fullTextTranslated, effectiveTargetLang]) // eslint-disable-line react-hooks/exhaustive-deps -- only sync when translated text changes; article/mutate are refs to current data

  useEffect(() => {
    if (summary && article && article.summary !== summary) {
      void mutate({ ...article, summary }, false)
    }
  }, [summary]) // eslint-disable-line react-hooks/exhaustive-deps -- only sync when summary changes; article/mutate are refs to current data

  // Record article read on mount
  const viewedRef = useRef<number | null>(null)
  useEffect(() => {
    if (article && viewedRef.current !== article.id) {
      viewedRef.current = article.id
      const isFirstSeen = article.seen_at == null
      if (isFirstSeen) {
        trackRead(article.id)
      }
      apiPost(`/api/articles/${article.id}/read`)
        .then(() => globalMutate((key: string) => typeof key === 'string' && key.startsWith('/api/feeds')))
        .catch(async () => {
          if (isFirstSeen) {
            await queueSeenIds([article.id])
          }
        })
    }
  }, [article, globalMutate])

  const content = useMemo(() => {
    if (!article) return ''
    let md = ''
    if (viewMode === 'translated' && !isUserLang) {
      md = fullTextTranslated || ''
    } else {
      md = article.full_text || ''
    }
    if (!md) return `<p class="text-muted">${t('article.noContent')}</p>`
    const rendered = renderMarkdown(md)
    const withXVideoFallbacks = rewriteBlockedXVideos(rendered, {
      articleUrl,
      ogImage: article.og_image ?? null,
    })
    return sanitizeHtml(withXVideoFallbacks)
  }, [article, articleUrl, viewMode, isUserLang, fullTextTranslated, t])

  const { rewrittenHtml: displayContent } = useRewriteInternalLinks(
    content,
    articleUrl,
    internalLinks === 'on',
  )

  // Event delegation: single listener on <article> handles all image clicks & errors
  const hasArticle = !!article
  useEffect(() => {
    const container = articleRef.current
    if (!container) return

    const handleClick = (e: MouseEvent) => {
      const fallbackLink = (e.target as HTMLElement).closest('.video-fallback-link') as HTMLAnchorElement | null
      if (fallbackLink) {
        e.preventDefault()
        const href = fallbackLink.getAttribute('href')
        if (href) window.open(href, '_blank', 'noopener,noreferrer')
        return
      }

      const img = (e.target as HTMLElement).closest('.article-rendered-content img') as HTMLImageElement | null
      if (img) {
        setLightboxSrc(img.currentSrc || img.src)
        return
      }

      const anchor = (e.target as HTMLElement).closest('.article-rendered-content a') as HTMLAnchorElement | null
      if (anchor) {
        e.preventDefault()
        if (anchor.hasAttribute('data-internal-link')) {
          const path = anchor.getAttribute('href')
          if (path) void navigate(path)
        } else {
          const href = anchor.getAttribute('href')
          if (href) window.open(href, '_blank', 'noopener,noreferrer')
        }
      }
    }

    const handleError = (e: Event) => {
      const el = e.target as HTMLElement
      if (el.tagName === 'IMG' && el.closest('.article-rendered-content')) {
        el.classList.add('error')
      }
    }

    container.addEventListener('click', handleClick)
    container.addEventListener('error', handleError, true)

    return () => {
      container.removeEventListener('click', handleClick)
      container.removeEventListener('error', handleError, true)
    }
  }, [hasArticle, navigate])

  if (error) {
    return (
      <div className="max-w-2xl mx-auto px-6 md:px-10 py-12 text-center">
        <p className="text-muted">{t('article.notFound')}</p>
      </div>
    )
  }

  if (!article) {
    return (
      <div className="max-w-2xl mx-auto px-6 md:px-10 py-8 space-y-4">
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-4 w-1/4" />
        <Skeleton className="h-4 w-1/6 mt-4" />
        <Skeleton className="h-8 w-1/2 mt-6" />
        <div className="space-y-3 mt-8">
          <Skeleton className="h-4" />
          <Skeleton className="h-4" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </div>
    )
  }

  const hasTranslation = !!fullTextTranslated
  const displayTitle = article.has_video && !article.title.trim() ? t('article.videoPost') : article.title
  const metricsText = metrics.metrics && !translating ? metrics.formatMetrics() : null
  const articleScopeSummary = summarizeScope(buildArticleScope(article.id), t, displayTitle)

  const detailContent = article.feed_view_type === 'social' ? (
    <SocialArticleDetail
      articleRef={articleRef}
      article={article}
      locale={locale}
      displayTitle={displayTitle}
      displayContent={displayContent}
      viewMode={viewMode}
      isUserLang={isUserLang}
      hasTranslation={hasTranslation}
      translating={translating}
      translatingText={translatingText}
      translatingHtml={translatingHtml}
      summary={summary}
      summarizing={summarizing}
      streamingText={streamingText}
      summaryHtml={summaryHtml}
      streamingHtml={streamingHtml}
      summarizeError={summarizeError}
      metricsText={metricsText}
      translateError={translateError}
      chatPosition={chatPosition}
      chatOpen={chat.open}
      onChatToggle={chat.toggle}
      onTranslate={handleTranslate}
      onToggleViewMode={() => setViewMode(viewMode === 'translated' ? 'original' : 'translated')}
      onSummarize={handleSummarize}
      isBookmarked={!!isBookmarked}
      isLiked={isLiked}
      archivingImages={archivingImages}
      onToggleBookmark={toggleBookmark}
      onToggleLike={toggleLike}
      onArchiveImages={handleArchiveImages}
      onDelete={() => setDeleteConfirmOpen(true)}
      onCloseChat={chat.close}
      scopeSummary={articleScopeSummary}
    />
  ) : (
    <article ref={articleRef} className="article-card max-w-2xl mx-auto px-6 md:px-10 py-8">
      {/* Title */}
      <h1 className="mb-1.5 text-[28px] font-bold leading-[1.3] break-words [overflow-wrap:anywhere]">
        {displayTitle}
      </h1>

      {/* Date */}
      <p className="text-sm text-muted mb-3">{formatDetailDate(article.published_at, locale)}</p>

      {/* Toolbar */}
      <ArticleToolbar
        article={article}
        chatPosition={chatPosition}
        chatOpen={chat.open}
        onChatToggle={chat.toggle}
        isUserLang={isUserLang}
        hasTranslation={hasTranslation}
        translating={translating}
        onTranslate={handleTranslate}
        summary={summary}
        summarizing={summarizing}
        onSummarize={handleSummarize}
        isBookmarked={!!isBookmarked}
        isLiked={isLiked}
        archivingImages={archivingImages}
        onToggleBookmark={toggleBookmark}
        onToggleLike={toggleLike}
        onArchiveImages={handleArchiveImages}
        onDelete={() => setDeleteConfirmOpen(true)}
      />

      {/* Inline Chat Panel */}
      {chatPosition === 'inline' && chat.open && (
        <ChatInlinePanel articleId={article.id} onClose={chat.close} scopeSummary={articleScopeSummary} />
      )}

      {/* Summary */}
      <ArticleSummarySection
        summary={summary}
        summarizing={summarizing}
        streamingText={streamingText}
        summaryHtml={summaryHtml}
        streamingHtml={streamingHtml}
        summarizeError={summarizeError}
        metricsText={metricsText}
      />

      {/* Similar articles */}
      {article.similar_count != null && article.similar_count > 0 && (
        <ArticleSimilarBanner articleId={article.id} similarCount={article.similar_count} />
      )}

      {/* Translate error */}
      {translateError && !translating && (
        <Callout variant="error">
          <p className="text-sm text-error">
            {tError(translateError)}
            {isKeyNotSetError(translateError) && (
              <>
                <Link to="/settings/integration" className="underline text-accent">{t('error.goToSettings')}</Link>
                {t('error.setApiKeyFromSettings')}
              </>
            )}
          </p>
        </Callout>
      )}

      {/* Translation metrics */}
      {metrics.metrics && !summarizing && !translating && hasTranslation && (
        <p className="text-xs text-muted mb-4">
          {metrics.formatMetrics()}
        </p>
      )}

      {/* Language banner */}
      {!isUserLang && hasTranslation && (
        <ArticleTranslationBanner
          viewMode={viewMode}
          onToggle={() => setViewMode(viewMode === 'translated' ? 'original' : 'translated')}
        />
      )}

      {/* Content */}
      <ArticleContentBody
        translating={translating}
        translatingText={translatingText}
        translatingHtml={translatingHtml}
        displayContent={displayContent}
      />
    </article>
  )

  return (
    <>
    {detailContent}
    <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
    {chatPosition === 'fab' && article && <ChatFab key={article.id} articleId={article.id} scopeSummary={articleScopeSummary} />}
    {deleteConfirmOpen && (
      <ConfirmDialog
        title={t('article.delete')}
        message={t('article.deleteConfirm')}
        confirmLabel={t('article.delete')}
        danger
        onConfirm={() => { setDeleteConfirmOpen(false); handleDelete() }}
        onCancel={() => setDeleteConfirmOpen(false)}
      />
    )}
    </>
  )
}
