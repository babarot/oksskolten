import { useNavigate } from 'react-router-dom'
import { ActionChip } from '../ui/action-chip'
import { ChatInlineTrigger } from '../chat/chat-inline'
import { Bookmark, ThumbsUp, CloudUpload, CloudCheck, Trash2, Languages, SquareM, Sparkles } from 'lucide-react'
import { useI18n } from '../../lib/i18n'
import type { ArticleDetail } from '../../../shared/types'

interface ArticleToolbarProps {
  article: ArticleDetail
  chatPosition: string
  chatOpen: boolean
  onChatToggle: () => void
  isUserLang: boolean
  hasTranslation: boolean
  translating: boolean
  onTranslate: () => void
  summary: string | null
  summarizing: boolean
  onSummarize: () => void
  isBookmarked: boolean
  isLiked: boolean
  archivingImages: boolean
  onToggleBookmark: () => void
  onToggleLike: () => void
  onArchiveImages: () => void
  onDelete: () => void
}

export function ArticleToolbar({
  article,
  chatPosition,
  chatOpen,
  onChatToggle,
  isUserLang,
  hasTranslation,
  translating,
  onTranslate,
  summary,
  summarizing,
  onSummarize,
  isBookmarked,
  isLiked,
  archivingImages,
  onToggleBookmark,
  onToggleLike,
  onArchiveImages,
  onDelete,
}: ArticleToolbarProps) {
  const navigate = useNavigate()
  const { t } = useI18n()

  return (
    <div className="flex items-stretch flex-wrap gap-2 mb-6 select-none">
      <ActionChip className="max-w-[200px]" tooltip={article.feed_name} onClick={() => navigate(`/feeds/${article.feed_id}`)}>
        <span className="truncate">{article.feed_name}</span>
      </ActionChip>
      <ActionChip
        as="a"
        href={article.url}
        target="_blank"
        rel="noopener noreferrer"
      >
        {t('article.sourceArticle')}
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M4 1h7v7M11 1L5 7" />
        </svg>
      </ActionChip>
      {summary === null && !summarizing && (
        <ActionChip onClick={onSummarize}>
          <Sparkles className="w-3.5 h-3.5" />
          {t('article.summarize')}
        </ActionChip>
      )}
      {chatPosition === 'inline' && (
        <ChatInlineTrigger active={chatOpen} onToggle={onChatToggle} />
      )}
      {!isUserLang && !hasTranslation && !translating && (
        <ActionChip onClick={onTranslate}>
          <Languages className="w-3.5 h-3.5" />
          {t('article.translate')}
        </ActionChip>
      )}
      <ActionChip active={!!isBookmarked} onClick={onToggleBookmark} aria-pressed={!!isBookmarked} tooltip={isBookmarked ? t('article.removeBookmark') : t('article.addBookmark')}>
        <Bookmark
          className="w-3.5 h-3.5"
          fill={isBookmarked ? 'currentColor' : 'none'}
        />
      </ActionChip>
      <ActionChip active={isLiked} onClick={onToggleLike} aria-pressed={isLiked} tooltip={isLiked ? t('article.removeLike') : t('article.addLike')}>
        <ThumbsUp
          className="w-3.5 h-3.5"
          fill={isLiked ? 'currentColor' : 'none'}
        />
      </ActionChip>
      {article.imageArchivingEnabled && article.full_text && /(<img\s|!\[)/.test(article.full_text) && !article.images_archived_at && !archivingImages && (
        <ActionChip onClick={onArchiveImages} tooltip={t('article.archiveImages')}>
          <CloudUpload className="w-3.5 h-3.5" />
        </ActionChip>
      )}
      {archivingImages && (
        <ActionChip>
          <CloudUpload className="w-3.5 h-3.5 animate-pulse" />
          <span className="text-muted">{t('article.archivingImages')}</span>
        </ActionChip>
      )}
      {article.images_archived_at && (
        <ActionChip active tooltip={t('article.imagesArchived')}>
          <CloudCheck className="w-3.5 h-3.5" />
        </ActionChip>
      )}
      {article.full_text && (
        <ActionChip onClick={() => navigate(`/${article.url.replace(/^https?:\/\//, '')}.md`)} tooltip={t('article.rawMarkdown')}>
          <SquareM className="w-3.5 h-3.5" />
        </ActionChip>
      )}
      {article.feed_type === 'clip' && (
        <ActionChip onClick={onDelete}>
          <Trash2 className="w-3.5 h-3.5" />
          {t('article.delete')}
        </ActionChip>
      )}
    </div>
  )
}
