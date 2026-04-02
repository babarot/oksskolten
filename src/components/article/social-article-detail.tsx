import { useMemo, type RefObject } from 'react'
import { Link } from 'react-router-dom'
import { Callout } from '../ui/callout'
import { ArticleToolbar } from './article-toolbar'
import { ArticleSummarySection } from './article-summary-section'
import { ArticleTranslationBanner } from './article-translation-banner'
import { ArticleContentBody } from './article-content-body'
import { ArticleSimilarBanner } from './article-similar-banner'
import { ChatInlinePanel } from '../chat/chat-inline'
import { formatDetailDate } from '../../lib/dateFormat'
import { useI18n } from '../../lib/i18n'
import { extractXHandle } from '../../../shared/article-kind'
import type { ArticleDetail as ArticleDetailData, ScopeSummary } from '../../../shared/types'

interface SocialArticleDetailProps {
  articleRef: RefObject<HTMLElement | null>
  article: ArticleDetailData
  locale: string
  displayTitle: string
  displayContent: string
  viewMode: 'translated' | 'original'
  isUserLang: boolean
  hasTranslation: boolean
  translating: boolean
  translatingText: string
  translatingHtml: string
  summary: string | null
  summarizing: boolean
  streamingText: string
  summaryHtml: string
  streamingHtml: string
  summarizeError: string | null
  metricsText: string | null
  translateError: string | null
  chatPosition: string
  chatOpen: boolean
  onChatToggle: () => void
  onTranslate: () => void
  onToggleViewMode: () => void
  onSummarize: () => void
  isBookmarked: boolean
  isLiked: boolean
  archivingImages: boolean
  onToggleBookmark: () => void
  onToggleLike: () => void
  onArchiveImages: () => void
  onDelete: () => void
  onCloseChat: () => void
  scopeSummary?: ScopeSummary | null
}

function getSocialAvatar(article: ArticleDetailData): string | null {
  if (article.feed_icon_url) return article.feed_icon_url
  try {
    return `https://www.google.com/s2/favicons?sz=64&domain=${new URL(article.url).hostname}`
  } catch {
    return null
  }
}

function splitQuotedContent(html: string): { bodyHtml: string; quoteHtml: string | null } {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const quote = doc.querySelector('.rsshub-quote, blockquote')
  if (!quote) return { bodyHtml: html, quoteHtml: null }

  const quoteHtml = quote.outerHTML
  quote.remove()
  return { bodyHtml: doc.body.innerHTML, quoteHtml }
}

export function SocialArticleDetail({
  articleRef,
  article,
  locale,
  displayTitle,
  displayContent,
  viewMode,
  isUserLang,
  hasTranslation,
  translating,
  translatingText,
  translatingHtml,
  summary,
  summarizing,
  streamingText,
  summaryHtml,
  streamingHtml,
  summarizeError,
  metricsText,
  translateError,
  chatPosition,
  chatOpen,
  onChatToggle,
  onTranslate,
  onToggleViewMode,
  onSummarize,
  isBookmarked,
  isLiked,
  archivingImages,
  onToggleBookmark,
  onToggleLike,
  onArchiveImages,
  onDelete,
  onCloseChat,
  scopeSummary,
}: SocialArticleDetailProps) {
  const { t, tError, isKeyNotSetError } = useI18n()
  const handle = extractXHandle(article.url)
  const avatarSrc = getSocialAvatar(article)
  const { bodyHtml, quoteHtml } = useMemo(() => splitQuotedContent(displayContent), [displayContent])

  return (
    <article ref={articleRef} className="mx-auto max-w-2xl px-6 py-8 md:px-10">
      {article.article_kind === 'repost' && (
        <p className="mb-4 text-sm text-muted">
          {t('article.repostedBy')} {article.feed_name}
        </p>
      )}

      <div className="mb-5 flex items-start gap-4">
        {avatarSrc ? (
          <img src={avatarSrc} alt="" className="h-12 w-12 shrink-0 rounded-full object-cover" />
        ) : (
          <div className="h-12 w-12 shrink-0 rounded-full bg-border/40" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-lg font-semibold text-text">{article.feed_name}</span>
            {handle && <span className="text-sm text-muted">{handle}</span>}
            <a
              href={article.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-accent hover:underline"
            >
              {t('article.viewOnX')}
            </a>
          </div>
          <p className="mt-2 text-sm text-muted">{formatDetailDate(article.published_at, locale)}</p>
        </div>
      </div>

      <div className="mb-4 text-[17px] font-medium leading-8 text-text">
        {displayTitle}
      </div>

      <ArticleToolbar
        article={article}
        chatPosition={chatPosition}
        chatOpen={chatOpen}
        onChatToggle={onChatToggle}
        isUserLang={isUserLang}
        hasTranslation={hasTranslation}
        translating={translating}
        onTranslate={onTranslate}
        summary={summary}
        summarizing={summarizing}
        onSummarize={onSummarize}
        isBookmarked={isBookmarked}
        isLiked={isLiked}
        archivingImages={archivingImages}
        onToggleBookmark={onToggleBookmark}
        onToggleLike={onToggleLike}
        onArchiveImages={onArchiveImages}
        onDelete={onDelete}
      />

      {chatPosition === 'inline' && chatOpen && (
        <ChatInlinePanel articleId={article.id} onClose={onCloseChat} scopeSummary={scopeSummary} />
      )}

      <ArticleSummarySection
        summary={summary}
        summarizing={summarizing}
        streamingText={streamingText}
        summaryHtml={summaryHtml}
        streamingHtml={streamingHtml}
        summarizeError={summarizeError}
        metricsText={metricsText}
      />

      {article.similar_count != null && article.similar_count > 0 && (
        <ArticleSimilarBanner articleId={article.id} similarCount={article.similar_count} />
      )}

      {translateError && !translating && (
        <Callout variant="error">
          <p className="text-sm text-error">
            {tError(translateError)}
            {isKeyNotSetError(translateError) && (
              <>
                <Link to="/settings/integration" className="text-accent underline">{t('error.goToSettings')}</Link>
                {t('error.setApiKeyFromSettings')}
              </>
            )}
          </p>
        </Callout>
      )}

      {!isUserLang && hasTranslation && (
        <ArticleTranslationBanner
          viewMode={viewMode}
          onToggle={onToggleViewMode}
        />
      )}

      <ArticleContentBody
        translating={translating}
        translatingText={translatingText}
        translatingHtml={translatingHtml}
        displayContent={bodyHtml}
        className="social-content article-rendered-content transition-opacity duration-150"
      />

      {article.article_kind === 'quote' && quoteHtml && (
        <div className="mt-5 rounded-2xl border border-border bg-bg-subtle/70 p-4">
          <p className="mb-3 text-sm font-medium text-muted">{t('article.quotedPost')}</p>
          <div className="social-content article-rendered-content" dangerouslySetInnerHTML={{ __html: quoteHtml }} />
        </div>
      )}
    </article>
  )
}
