import { useState, useEffect, useRef } from 'react'
import { apiPost } from '../../lib/fetcher'
import { useI18n } from '../../lib/i18n'
import { Button } from '../ui/button'
import { Input } from '../ui/input'

interface FolderStepProps {
  onClose: () => void
  onCategoryCreated?: () => void
}

export function FolderStep({ onClose, onCategoryCreated }: FolderStepProps) {
  const { t } = useI18n()
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setError('')
    setLoading(true)
    try {
      await apiPost('/api/categories', { name: name.trim() })
      onCategoryCreated?.()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('modal.genericError'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <Input
        ref={inputRef}
        type="text"
        placeholder={t('modal.folderNamePlaceholder')}
        value={name}
        onChange={e => setName(e.target.value)}
        required
      />
      {error && <p className="text-xs text-error">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose}>
          {t('modal.cancel')}
        </Button>
        <Button type="submit" disabled={loading}>
          {loading ? t('modal.creating') : t('modal.create')}
        </Button>
      </div>
    </form>
  )
}
