import { useEffect, useMemo, useState } from 'react'
import useSWR from 'swr'
import { Check, Copy, Rss } from 'lucide-react'
import { useI18n } from '../../lib/i18n'
import { apiPatch, fetcher } from '../../lib/fetcher'

interface FeverConfig {
  enabled: boolean
  username: string
  configured: boolean
}

export function FeverSettings() {
  const { t } = useI18n()
  const { data: config, mutate } = useSWR<FeverConfig>('/api/settings/fever', fetcher)
  const [enabled, setEnabled] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const endpoint = useMemo(() => {
    if (typeof window === 'undefined') return '/api/fever'
    return `${window.location.origin}/api/fever`
  }, [])

  useEffect(() => {
    if (!config) return
    setEnabled(config.enabled)
    setUsername(config.username)
  }, [config])

  if (!config) return null
  const currentConfig = config

  function showMessage(message: string, type: 'error' | 'success') {
    if (type === 'error') {
      setError(message)
      setSuccess(null)
    } else {
      setSuccess(message)
      setError(null)
    }
    setTimeout(() => { setError(null); setSuccess(null) }, 3000)
  }

  async function handleSave() {
    if (saving) return
    const trimmedUsername = username.trim()

    if (enabled && !currentConfig.configured && (!trimmedUsername || !password)) {
      showMessage(t('settings.feverCredentialsRequired'), 'error')
      return
    }
    if (trimmedUsername !== currentConfig.username && !password) {
      showMessage(t('settings.feverPasswordRequired'), 'error')
      return
    }
    if (password && !trimmedUsername) {
      showMessage(t('settings.feverCredentialsRequired'), 'error')
      return
    }

    const payload: { enabled: boolean; username?: string; password?: string } = { enabled }
    if (password) {
      payload.username = trimmedUsername
      payload.password = password
    }

    setSaving(true)
    try {
      const next = await apiPatch('/api/settings/fever', payload) as FeverConfig
      setPassword('')
      setEnabled(next.enabled)
      setUsername(next.username)
      void mutate(next, false)
      showMessage(t('settings.feverSaved'), 'success')
    } catch (err: unknown) {
      showMessage(err instanceof Error ? err.message : t('settings.feverSaveFailed'), 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleCopyEndpoint() {
    await navigator.clipboard.writeText(endpoint)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const canSave = !saving && (enabled !== currentConfig.enabled || username !== currentConfig.username || password.length > 0)

  return (
    <section>
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-text">{t('settings.feverApi')}</h2>
          <p className="text-xs text-muted mt-1">{t('settings.feverApiDesc')}</p>
        </div>
        <span className={`shrink-0 inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs ${
          enabled ? 'border-accent/40 text-accent bg-accent/5' : 'border-border text-muted bg-bg-card'
        }`}>
          <Rss size={13} />
          {enabled ? t('settings.enabled') : t('settings.disabled')}
        </span>
      </div>

      <div className="rounded-lg border border-border bg-bg-card p-4 space-y-4">
        <label className="flex items-center gap-3 cursor-pointer">
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            onClick={() => setEnabled(value => !value)}
            className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors ${
              enabled ? 'bg-accent' : 'bg-border'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                enabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
          <span className="text-sm text-text select-none">
            {enabled ? t('settings.enabled') : t('settings.disabled')}
          </span>
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="fever-username" className="block text-xs font-medium text-text mb-1">{t('settings.feverUsername')}</label>
            <input
              id="fever-username"
              type="text"
              value={username}
              onChange={event => setUsername(event.target.value)}
              placeholder="admin"
              className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
          <div>
            <label htmlFor="fever-password" className="block text-xs font-medium text-text mb-1">{t('settings.feverPassword')}</label>
            <input
              id="fever-password"
              type="password"
              value={password}
              onChange={event => setPassword(event.target.value)}
              placeholder={currentConfig.configured ? t('settings.feverPasswordPlaceholderConfigured') : t('settings.feverPasswordPlaceholder')}
              className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-text mb-1">{t('settings.feverEndpoint')}</label>
          <div className="flex items-center gap-2">
            <code className="flex-1 min-w-0 rounded-lg border border-border bg-bg px-3 py-2 text-xs text-text font-mono truncate">
              {endpoint}
            </code>
            <button
              type="button"
              onClick={() => void handleCopyEndpoint()}
              className="shrink-0 p-2 rounded-lg text-muted hover:text-text hover:bg-hover transition-colors select-none"
              aria-label={t('settings.copy')}
            >
              {copied ? <Check size={16} className="text-accent" /> : <Copy size={16} />}
            </button>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={!canSave}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-accent text-accent-text hover:opacity-90 transition-opacity disabled:opacity-50 select-none"
          >
            {saving ? '...' : t('settings.save')}
          </button>
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-error">{error}</p>}
      {success && <p className="mt-3 text-sm text-accent">{success}</p>}
    </section>
  )
}
