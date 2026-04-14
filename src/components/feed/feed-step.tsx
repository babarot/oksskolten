import { useState, useEffect, useRef } from 'react'
import { authHeaders } from '../../lib/fetcher'
import { logoutClient } from '../../lib/auth'
import { getAuthToken } from '../../lib/auth'
import { useI18n } from '../../lib/i18n'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../ui/select'
import { Loader2, Check, X, Minus } from 'lucide-react'
import type { Category } from '../../../shared/types'

type TranslateFn = ReturnType<typeof useI18n>['t']

/** Map raw server error messages to i18n keys so they render in the user's locale. */
function localizeServerError(raw: string, t: TranslateFn): string {
  if (raw.includes('RSS could not be detected')) return t('modal.errorRssNotDetected')
  if (raw.includes('Could not extract content')) return t('modal.errorPageExtract')
  if (raw.includes('already exists')) return t('modal.errorAlreadyExists')
  if (raw.includes('https://')) return t('modal.errorHttpsOnly')
  return raw || t('modal.genericError')
}

/** Debounce delay (ms) before auto-discovering feed metadata from URL */
const DISCOVER_DEBOUNCE_MS = 500

type StepName = 'rss-discovery' | 'flaresolverr' | 'rss-bridge' | 'css-selector'
type StepStatus = 'pending' | 'running' | 'done' | 'skipped'

interface StepState {
  status: StepStatus
  found?: boolean
}

function isValidUrl(s: string): boolean {
  try {
    new URL(s)
    return true
  } catch {
    return false
  }
}

function StepIndicator({ steps, done, t }: {
  steps: Record<StepName, StepState>
  done: boolean
  t: ReturnType<typeof useI18n>['t']
}) {
  const stepConfig: { key: StepName; label: string; conditional?: boolean; indent?: boolean }[] = [
    { key: 'rss-discovery', label: t('modal.step.rssDiscovery') },
    { key: 'flaresolverr', label: t('modal.step.flaresolverr'), conditional: true, indent: true },
    { key: 'rss-bridge', label: t('modal.step.rssBridge') },
    { key: 'css-selector', label: t('modal.step.cssSelector') },
  ]

  function renderIcon(state: StepState) {
    if (state.status === 'running') {
      return <Loader2 size={14} strokeWidth={1.5} className="text-muted animate-spin" />
    }
    if (state.status === 'done') {
      return state.found
        ? <Check size={14} strokeWidth={2} className="text-accent" />
        : <X size={14} strokeWidth={2} className="text-muted" />
    }
    if (state.status === 'skipped') {
      return <Minus size={14} strokeWidth={1.5} className="text-muted" />
    }
    // pending
    return <div className="w-3.5 h-3.5" />
  }

  function renderSuffix(stepKey: StepName, state: StepState) {
    if (state.status === 'done') {
      const doneLabel = stepKey === 'flaresolverr' ? t('modal.step.completed') : t('modal.step.found')
      return (
        <span className={`text-xs ${state.found ? 'text-accent' : 'text-muted'}`}>
          {state.found ? doneLabel : t('modal.step.notFound')}
        </span>
      )
    }
    if (state.status === 'skipped') {
      return <span className="text-xs text-muted">{t('modal.step.skipped')}</span>
    }
    return null
  }

  return (
    <div className="space-y-2 py-2">
      {stepConfig.map(({ key, label, conditional, indent }) => {
        const state = steps[key]
        if (conditional && state.status === 'pending') return null
        return (
          <div key={key} className={`flex items-center gap-2 text-sm ${indent ? 'ml-5' : ''}`}>
            {renderIcon(state)}
            <span className={state.status === 'running' ? 'text-text' : 'text-muted'}>{label}</span>
            {renderSuffix(key, state)}
          </div>
        )
      })}
      {done && (
        <div className="flex items-center gap-2 text-sm">
          <Check size={14} strokeWidth={2} className="text-accent" />
          <span className="text-accent">{t('modal.step.done')}</span>
        </div>
      )}
    </div>
  )
}

interface FeedStepProps {
  onClose: () => void
  onCreated: () => void
  onFetchStarted?: (feedId: number) => void
  categories: Category[]
}

export function FeedStep({ onClose, onCreated, onFetchStarted, categories }: FeedStepProps) {
  const { t } = useI18n()
  const [name, setName] = useState('')
  const [nameManuallySet, setNameManuallySet] = useState(false)
  const [url, setUrl] = useState('')
  const [categoryId, setCategoryId] = useState<number | ''>('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [discovering, setDiscovering] = useState(false)
  const lastFetchedUrl = useRef('')

  const [addingSteps, setAddingSteps] = useState<Record<StepName, StepState> | null>(null)
  const [addingDone, setAddingDone] = useState(false)
  const [choiceNeeded, setChoiceNeeded] = useState<{ rss_url: string; rss_title: string | null } | null>(null)

  useEffect(() => {
    const trimmed = url.trim()
    if (!trimmed || nameManuallySet || !isValidUrl(trimmed)) return
    if (trimmed === lastFetchedUrl.current) return

    const controller = new AbortController()
    const timer = setTimeout(async () => {
      lastFetchedUrl.current = trimmed
      setDiscovering(true)
      try {
        const token = getAuthToken()
        const res = await fetch(
          `/api/discover-title?url=${encodeURIComponent(trimmed)}`,
          {
            signal: controller.signal,
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          },
        )
        if (res.ok) {
          const data = await res.json()
          if (data.title) setName(data.title)
        }
      } catch {
        // aborted or network error — ignore
      } finally {
        setDiscovering(false)
      }
    }, DISCOVER_DEBOUNCE_MS)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [url, nameManuallySet])

  async function handleSubmit(e?: React.FormEvent, phase2?: Record<string, unknown>) {
    e?.preventDefault()
    if (!url.trim()) return
    setError('')
    setLoading(true)
    setChoiceNeeded(null)

    const initSteps: Record<StepName, StepState> = {
      'rss-discovery': { status: 'pending' },
      'flaresolverr': { status: 'pending' },
      'rss-bridge': { status: 'pending' },
      'css-selector': { status: 'pending' },
    }
    setAddingSteps(initSteps)
    setAddingDone(false)

    try {
      const res = await fetch('/api/feeds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          name: name.trim() || undefined,
          url: url.trim(),
          category_id: categoryId || null,
          ...phase2,
        }),
      })

      if (res.status === 401) {
        logoutClient()
        throw new Error('Unauthorized')
      }

      const contentType = res.headers.get('Content-Type') || ''

      // Non-SSE response (400/409 errors)
      if (!contentType.includes('text/event-stream')) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || res.statusText)
      }

      // SSE response — read step events
      if (!res.body) throw new Error('Response body is null')
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop()!

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          let payload: Record<string, unknown>
          try {
            payload = JSON.parse(line.slice(6))
          } catch {
            continue
          }

          if (payload.type === 'step') {
            const stepName = payload.step as StepName
            const status = payload.status as StepStatus
            const found = payload.found as boolean | undefined
            setAddingSteps(prev => prev ? {
              ...prev,
              [stepName]: { status, found },
            } : prev)
          } else if (payload.type === 'choice_needed') {
            setChoiceNeeded({
              rss_url: payload.rss_url as string,
              rss_title: (payload.rss_title as string | null) ?? null,
            })
            setAddingSteps(null)
            setLoading(false)
          } else if (payload.type === 'done') {
            setAddingDone(true)
            const feed = payload.feed as { id: number; rss_url: string | null; rss_bridge_url: string | null }
            onCreated()
            if (feed.rss_url || feed.rss_bridge_url) {
              onFetchStarted?.(feed.id)
            }
          } else if (payload.type === 'error') {
            throw new Error(payload.error as string || 'Unknown error')
          }
        }
      }
    } catch (err) {
      setAddingSteps(null)
      setAddingDone(false)
      const raw = err instanceof Error ? err.message : ''
      setError(localizeServerError(raw, t))
      setLoading(false)
    }
  }

  if (choiceNeeded) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-text">{t('modal.choiceTitle')}</p>
        {choiceNeeded.rss_title && (
          <p className="text-sm text-muted truncate">&ldquo;{choiceNeeded.rss_title}&rdquo;</p>
        )}
        <div className="flex gap-2">
          <Button
            className="flex-1"
            onClick={() => handleSubmit(undefined, {
              discovered_rss_url: choiceNeeded.rss_url,
              discovered_rss_title: choiceNeeded.rss_title ?? undefined,
            })}
          >
            {t('modal.choiceWholeSite')}
          </Button>
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => handleSubmit(undefined, { force_page_selector: true })}
          >
            {t('modal.choiceThisPage')}
          </Button>
        </div>
      </div>
    )
  }

  if (addingSteps) {
    return (
      <>
        <StepIndicator steps={addingSteps} done={addingDone} t={t} />
        {addingDone && (
          <div className="flex justify-end pt-1">
            <Button onClick={onClose}>
              OK
            </Button>
          </div>
        )}
      </>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <Input
        type="url"
        placeholder={t('modal.url')}
        value={url}
        onChange={e => setUrl(e.target.value)}
        autoFocus
        required
      />
      <div className="relative">
        <Input
          type="text"
          placeholder={discovering ? t('modal.discovering') : t('modal.namePlaceholder')}
          value={name}
          onChange={e => {
            setName(e.target.value)
            setNameManuallySet(true)
          }}
        />
      </div>
      {categories.length > 0 && (
        <Select value={categoryId === '' ? '__none__' : String(categoryId)} onValueChange={v => setCategoryId(v === '__none__' ? '' : Number(v))}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">{t('category.uncategorized')}</SelectItem>
            {categories.map(cat => (
              <SelectItem key={cat.id} value={String(cat.id)}>{cat.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {error && <p className="text-xs text-error">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          {t('modal.cancel')}
        </Button>
        <Button type="submit" disabled={loading}>
          {loading ? t('modal.adding') : t('modal.add')}
        </Button>
      </div>
    </form>
  )
}
