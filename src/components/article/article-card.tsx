import { useState, memo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useI18n } from '../../lib/i18n'
import { isReadInSession } from '../../lib/readTracker'
import { extractDomain, articleUrlToPath } from '../../lib/url'
import { formatDate, formatRelativeDate } from '../../lib/dateFormat'
import type { ArticleListItem } from '../../../shared/types'
import type { LayoutName } from '../../data/layouts'

export interface ArticleDisplayConfig {
  dateMode: 'relative' | 'absolute'
  indicatorStyle: 'dot' | 'line'
  showUnreadIndicator: boolean
  showThumbnails: boolean
}

interface ArticleCardProps extends ArticleDisplayConfig {
  article: ArticleListItem
  layout?: LayoutName
  isFeatured?: boolean
  onClick?: (e: React.MouseEvent<HTMLAnchorElement>) => void
}

function getArticleIconSrc(article: ArticleListItem, size: 16 | 32): string | null {
  if (article.feed_icon_url) return article.feed_icon_url
  const domain = extractDomain(article.url)
  return domain ? `https://www.google.com/s2/favicons?sz=${size}&domain=${domain}` : null
}

function Thumbnail({ src, article, className }: { src: string | null; article: ArticleListItem; className?: string }) {
  const [failed, setFailed] = useState(false)
  const sizeClass = className ?? 'w-16 h-16'

  if (src && !failed) {
    return (
      <img
        src={src}
        alt=""
        loading="lazy"
        className={`${sizeClass} object-cover rounded shrink-0`}
        onError={() => setFailed(true)}
      />
    )
  }

  // Fallback: favicon in a bordered box
  const iconSrc = getArticleIconSrc(article, 32)
  if (iconSrc) {
    return (
      <div className={`${sizeClass} rounded shrink-0 border border-border bg-bg-subtle flex items-center justify-center`}>
        <img
          src={iconSrc}
          alt=""
          loading="lazy"
          width={24}
          height={24}
        />
      </div>
    )
  }

  return (
    <div className={`${sizeClass} rounded shrink-0 bg-border/30 flex items-center justify-center`}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-muted/40">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <path d="m21 15-5-5L5 21" />
      </svg>
    </div>
  )
}

function LargeThumbnail({ src, article }: { src: string | null; article: ArticleListItem }) {
  const [failed, setFailed] = useState(false)

  if (src && !failed) {
    return (
      <img
        src={src}
        alt=""
        loading="lazy"
        className="w-full aspect-video object-cover rounded-t"
        onError={() => setFailed(true)}
      />
    )
  }

  // Fallback: favicon centered in placeholder
  const iconSrc = getArticleIconSrc(article, 32)
  return (
    <div className="w-full aspect-video rounded-t bg-bg-subtle border-b border-border flex items-center justify-center">
      {iconSrc ? (
        <img
          src={iconSrc}
          alt=""
          loading="lazy"
          width={32}
          height={32}
        />
      ) : (
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-muted/30">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <path d="m21 15-5-5L5 21" />
        </svg>
      )}
    </div>
  )
}

function useCardBase(article: ArticleListItem, dateMode: 'relative' | 'absolute', onClick?: (e: React.MouseEvent<HTMLAnchorElement>) => void) {
  const navigate = useNavigate()
  const { t, locale } = useI18n()
  const isUnread = article.seen_at == null && !isReadInSession(article.id)
  const displayTitle = article.has_video && !article.title.trim() ? t('article.videoPost') : article.title
  const domain = extractDomain(article.url)
  const dateText = dateMode === 'relative'
    ? formatRelativeDate(article.published_at, locale, { justNow: t('date.justNow') })
    : formatDate(article.published_at, locale)
  const href = articleUrlToPath(article.url)

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (onClick) { onClick(e); return }
    if (e.metaKey || e.ctrlKey || e.button === 1) return
    e.preventDefault()
    void navigate(href)
  }

  return { isUnread, displayTitle, domain, dateText, href, handleClick, originalUrl: article.url }
}

function ArticleKindBadge({ article }: { article: ArticleListItem }) {
  const { t } = useI18n()
  if (!article.article_kind) return null
  const labelKey = article.article_kind === 'original'
    ? 'articleKind.original'
    : article.article_kind === 'repost'
      ? 'articleKind.repost'
      : 'articleKind.quote'

  return (
    <span className="inline-flex shrink-0 rounded border border-border bg-bg-subtle px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted">
      {t(labelKey)}
    </span>
  )
}

/** List layout — classic single-column (current default) */
function ListCard({ article, dateMode, indicatorStyle, showUnreadIndicator, showThumbnails, onClick }: ArticleCardProps) {
  const { isUnread, displayTitle, domain, dateText, href, handleClick, originalUrl } = useCardBase(article, dateMode, onClick)
  const showIndicator = isUnread && showUnreadIndicator
  const metadataIconSrc = domain ? getArticleIconSrc(article, 16) : null

  return (
    <a
      href={href}
      data-original-url={originalUrl}
      onClick={handleClick}
      className={`article-card block w-full text-left border-b border-border py-3 px-4 md:px-6 transition-[background-color,transform,box-shadow,border-color] duration-100 hover:bg-hover hover:-translate-y-px hover:shadow-sm select-none no-underline text-inherit ${
        indicatorStyle === 'line'
          ? `border-l-2 transition-[border-color] duration-500 ${showIndicator ? 'border-l-accent' : 'border-l-transparent'}`
          : ''
      }`}
    >
      <div className="flex items-center gap-2">
        {indicatorStyle === 'dot' && (
          <div className="flex items-center w-3 shrink-0">
            <span className={`w-1.5 h-1.5 rounded-full bg-accent transition-opacity duration-500 ${showIndicator ? 'opacity-100' : 'opacity-0'}`} />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <ArticleKindBadge article={article} />
            <span
              className={`text-[15px] truncate transition-colors duration-500 block min-w-0 ${
                isUnread ? 'font-semibold text-text' : 'font-normal text-muted'
              }`}
            >
              {displayTitle}
            </span>
          </div>
          {article.excerpt && (
            <p className="text-[13px] text-muted truncate mt-0.5">
              {article.excerpt}
            </p>
          )}
          <div className="flex items-center gap-1 text-[12px] text-muted mt-1 whitespace-nowrap min-w-0">
            {domain && (
              <>
                <img
                  src={metadataIconSrc ?? `https://www.google.com/s2/favicons?sz=16&domain=${domain}`}
                  alt=""
                  width={14}
                  height={14}
                  className="shrink-0"
                />
                <span className="truncate">{domain}</span>
                <span className="mx-0.5 shrink-0">·</span>
              </>
            )}
            <span className="shrink-0">{dateText}</span>
          </div>
        </div>
        {showThumbnails && <Thumbnail src={article.og_image} article={article} />}
      </div>
    </a>
  )
}

/** Card layout — image-forward grid card */
function GridCard({ article, dateMode, showThumbnails, onClick }: ArticleCardProps) {
  const { isUnread, displayTitle, domain, dateText, href, handleClick, originalUrl } = useCardBase(article, dateMode, onClick)
  const metadataIconSrc = domain ? getArticleIconSrc(article, 16) : null

  return (
    <a
      href={href}
      data-original-url={originalUrl}
      onClick={handleClick}
      className="article-card block border border-border rounded-lg overflow-hidden transition-[background-color,transform,box-shadow] duration-100 hover:bg-hover hover:-translate-y-px hover:shadow-sm select-none no-underline text-inherit"
    >
      {showThumbnails && <LargeThumbnail src={article.og_image} article={article} />}
      <div className="p-3 overflow-hidden">
        <div className="flex items-start gap-2">
          <ArticleKindBadge article={article} />
          <span
            className={`text-[14px] line-clamp-2 break-words transition-colors duration-500 ${
              isUnread ? 'font-semibold text-text' : 'font-normal text-muted'
            }`}
          >
            {displayTitle}
          </span>
        </div>
        {article.excerpt && (
          <p className="text-[12px] text-muted line-clamp-2 mt-1">
            {article.excerpt}
          </p>
        )}
        <div className="flex items-center gap-1 text-[11px] text-muted mt-2">
          {domain && (
            <>
              <img
                src={metadataIconSrc ?? `https://www.google.com/s2/favicons?sz=16&domain=${domain}`}
                alt=""
                width={12}
                height={12}
                className="shrink-0"
              />
              <span className="truncate">{domain}</span>
              <span className="mx-0.5 shrink-0">·</span>
            </>
          )}
          <span className="shrink-0">{dateText}</span>
        </div>
      </div>
    </a>
  )
}

/** Magazine layout — hero card (large) */
function HeroCard({ article, dateMode, showThumbnails, onClick }: ArticleCardProps) {
  const { isUnread, displayTitle, domain, dateText, href, handleClick, originalUrl } = useCardBase(article, dateMode, onClick)
  const metadataIconSrc = domain ? getArticleIconSrc(article, 16) : null

  return (
    <a
      href={href}
      data-original-url={originalUrl}
      onClick={handleClick}
      className="article-card block border border-border rounded-lg overflow-hidden transition-[background-color,transform,box-shadow] duration-100 hover:bg-hover hover:-translate-y-px hover:shadow-sm select-none no-underline text-inherit mb-4"
    >
      {showThumbnails && <LargeThumbnail src={article.og_image} article={article} />}
      <div className="p-4">
        <div className="flex items-start gap-2">
          <ArticleKindBadge article={article} />
          <span
            className={`text-[18px] line-clamp-2 transition-colors duration-500 ${
              isUnread ? 'font-semibold text-text' : 'font-normal text-muted'
            }`}
          >
            {displayTitle}
          </span>
        </div>
        {article.excerpt && (
          <p className="text-[14px] text-muted line-clamp-3 mt-1.5">
            {article.excerpt}
          </p>
        )}
        <div className="flex items-center gap-1 text-[12px] text-muted mt-2">
          {domain && (
            <>
              <img
                src={metadataIconSrc ?? `https://www.google.com/s2/favicons?sz=16&domain=${domain}`}
                alt=""
                width={14}
                height={14}
                className="shrink-0"
              />
              <span>{domain}</span>
              <span className="mx-0.5">·</span>
            </>
          )}
          <span>{dateText}</span>
        </div>
      </div>
    </a>
  )
}

/** Magazine layout — small card (below hero) */
function SmallCard({ article, dateMode, showThumbnails, onClick }: ArticleCardProps) {
  const { isUnread, displayTitle, domain, dateText, href, handleClick, originalUrl } = useCardBase(article, dateMode, onClick)
  const metadataIconSrc = domain ? getArticleIconSrc(article, 16) : null

  return (
    <a
      href={href}
      data-original-url={originalUrl}
      onClick={handleClick}
      className="article-card flex gap-3 border-b border-border py-2 px-4 md:px-6 transition-[background-color,transform,box-shadow] duration-100 hover:bg-hover hover:-translate-y-px hover:shadow-sm select-none no-underline text-inherit"
    >
      {showThumbnails && <Thumbnail src={article.og_image} article={article} className="w-12 h-12" />}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <ArticleKindBadge article={article} />
          <span
            className={`text-[14px] truncate transition-colors duration-500 block min-w-0 ${
              isUnread ? 'font-semibold text-text' : 'font-normal text-muted'
            }`}
          >
            {displayTitle}
          </span>
        </div>
        {article.excerpt && (
          <p className="text-[12px] text-muted truncate mt-0.5">
            {article.excerpt}
          </p>
        )}
        <div className="flex items-center gap-1 text-[11px] text-muted mt-1 whitespace-nowrap min-w-0">
          {domain && (
            <>
              <img
                src={metadataIconSrc ?? `https://www.google.com/s2/favicons?sz=16&domain=${domain}`}
                alt=""
                width={12}
                height={12}
                className="shrink-0"
              />
              <span className="truncate">{domain}</span>
              <span className="mx-0.5 shrink-0">·</span>
            </>
          )}
          <span className="shrink-0">{dateText}</span>
        </div>
      </div>
    </a>
  )
}

/** Compact layout — title and date only */
function CompactCard({ article, dateMode, indicatorStyle, showUnreadIndicator, onClick }: ArticleCardProps) {
  const { isUnread, displayTitle, dateText, href, handleClick, originalUrl } = useCardBase(article, dateMode, onClick)
  const showIndicator = isUnread && showUnreadIndicator

  return (
    <a
      href={href}
      data-original-url={originalUrl}
      onClick={handleClick}
      className={`article-card block w-full text-left border-b border-border py-1.5 px-4 md:px-6 transition-[background-color,border-color] duration-100 hover:bg-hover select-none no-underline text-inherit ${
        indicatorStyle === 'line'
          ? `border-l-2 transition-[border-color] duration-500 ${showIndicator ? 'border-l-accent' : 'border-l-transparent'}`
          : ''
      }`}
    >
      <div className="flex items-center gap-2">
        {indicatorStyle === 'dot' && (
          <div className="flex items-center w-2.5 shrink-0">
            <span className={`w-1.5 h-1.5 rounded-full bg-accent transition-opacity duration-500 ${showIndicator ? 'opacity-100' : 'opacity-0'}`} />
          </div>
        )}
        <span
          className={`text-[14px] truncate flex-1 transition-colors duration-500 ${
            isUnread ? 'font-medium text-text' : 'font-normal text-muted'
          }`}
        >
          {displayTitle}
        </span>
        <span className="text-[11px] text-muted shrink-0 ml-2">{dateText}</span>
      </div>
    </a>
  )
}

export const ArticleCard = memo(function ArticleCard(props: ArticleCardProps) {
  const { layout = 'list', isFeatured } = props

  switch (layout) {
    case 'card':
      return <GridCard {...props} />
    case 'magazine':
      return isFeatured ? <HeroCard {...props} /> : <SmallCard {...props} />
    case 'compact':
      return <CompactCard {...props} />
    case 'list':
    default:
      return <ListCard {...props} />
  }
})
