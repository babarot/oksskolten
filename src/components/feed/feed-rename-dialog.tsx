import { useI18n } from '../../lib/i18n'
import { Input } from '../ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog'

interface FeedRenameDialogProps {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void | Promise<void>
  onClose: () => void
}

export function FeedRenameDialog({
  value,
  onChange,
  onSubmit,
  onClose,
}: FeedRenameDialogProps) {
  const { t } = useI18n()

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-sm" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="text-base">{t('feeds.rename')}</DialogTitle>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            void onSubmit()
          }}
        >
          <Input
            autoFocus
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={t('modal.namePlaceholder')}
          />

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs rounded-lg border border-border text-muted hover:text-text hover:bg-hover transition-colors"
            >
              {t('settings.cancel')}
            </button>
            <button
              type="submit"
              disabled={!value.trim()}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-accent text-accent-text hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {t('settings.save')}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
