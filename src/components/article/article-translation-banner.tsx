import { Globe } from 'lucide-react'
import { useI18n } from '../../lib/i18n'

type ViewMode = 'translated' | 'original'

interface ArticleTranslationBannerProps {
  viewMode: ViewMode
  onToggle: () => void
}

export function ArticleTranslationBanner({ viewMode, onToggle }: ArticleTranslationBannerProps) {
  const { t } = useI18n()

  return (
    <div className="flex items-center gap-2 text-sm text-muted mb-6 select-none">
      <Globe className="w-4 h-4 shrink-0" />
      <span>
        {viewMode === 'translated' ? t('article.viewingTranslation') : t('article.viewingOriginal')}
      </span>
      <button
        onClick={onToggle}
        className="text-accent hover:underline underline-offset-2"
      >
        {viewMode === 'translated' ? t('article.switchToOriginal') : t('article.switchToTranslation')}
      </button>
    </div>
  )
}
