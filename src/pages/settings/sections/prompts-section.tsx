import { useState, useEffect, useCallback, useRef } from 'react'
import useSWR from 'swr'
import { fetcher, apiPatch } from '../../../lib/fetcher'
import { useI18n } from '../../../lib/i18n'

interface PromptsPrefs {
  'prompt.summarize': string | null
  'prompt.translate': string | null
}

interface DefaultPrompts {
  summarize: string
  translate: string
}

function PromptEditor({
  label,
  prefKey,
  savedValue,
  defaultValue,
  onChange,
}: {
  label: string
  prefKey: 'prompt.summarize' | 'prompt.translate'
  savedValue: string | null
  defaultValue: string
  onChange: (key: 'prompt.summarize' | 'prompt.translate', val: string | null) => void
}) {
  const { t } = useI18n()
  const [saved, setSaved] = useState(false)
  const [dirty, setDirty] = useState(false)
  // Show saved custom prompt, or default as editable starting point
  const [local, setLocal] = useState(savedValue || defaultValue)
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
  }, [])

  useEffect(() => {
    setLocal(savedValue || defaultValue)
    setDirty(false)
  }, [savedValue, defaultValue])

  function flashSaved() {
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
    setSaved(true)
    savedTimerRef.current = setTimeout(() => setSaved(false), 2000)
  }

  function handleChange(val: string) {
    setLocal(val)
    setDirty(true)
    setSaved(false)
  }

  async function handleSave() {
    try {
      await apiPatch('/api/settings/preferences', { [prefKey]: local })
      onChange(prefKey, local)
      setDirty(false)
      flashSaved()
    } catch {
      // keep dirty state so user can retry
    }
  }

  async function handleReset() {
    try {
      await apiPatch('/api/settings/preferences', { [prefKey]: '' })
      onChange(prefKey, null)
      setLocal(defaultValue)
      setDirty(false)
      flashSaved()
    } catch {
      // keep state unchanged so user can retry
    }
  }

  const isCustomized = savedValue !== null && savedValue !== ''

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-text">{label}</label>
          {isCustomized && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/10 text-accent font-medium">
              {t('settings.promptCustomized')}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {saved && <span className="text-xs text-accent">{t('settings.promptSaved')}</span>}
          {isCustomized && (
            <button
              type="button"
              onClick={() => void handleReset()}
              className="text-xs text-muted hover:text-text transition-colors"
            >
              {t('settings.promptReset')}
            </button>
          )}
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={!dirty}
            className="px-3 py-1 text-xs rounded-md bg-accent text-white disabled:opacity-40 hover:opacity-90 transition-opacity"
          >
            {t('settings.save')}
          </button>
        </div>
      </div>
      <textarea
        value={local}
        onChange={e => handleChange(e.target.value)}
        rows={12}
        className="w-full text-xs font-mono rounded-md border border-border bg-bg-subtle text-text px-3 py-2 resize-y focus:outline-none focus:ring-1 focus:ring-accent"
      />
    </div>
  )
}

export function PromptsSection() {
  const { t } = useI18n()
  const { data: prefsData, mutate } = useSWR<PromptsPrefs>('/api/settings/preferences', fetcher, {
    revalidateOnFocus: false,
  })
  const { data: defaultsData } = useSWR<DefaultPrompts>('/api/settings/prompts/defaults', fetcher, {
    revalidateOnFocus: false,
  })

  const [prefs, setPrefs] = useState<PromptsPrefs>({ 'prompt.summarize': null, 'prompt.translate': null })

  useEffect(() => {
    if (prefsData) {
      setPrefs({
        'prompt.summarize': prefsData['prompt.summarize'] ?? null,
        'prompt.translate': prefsData['prompt.translate'] ?? null,
      })
    }
  }, [prefsData])

  const handleChange = useCallback((key: 'prompt.summarize' | 'prompt.translate', val: string | null) => {
    setPrefs(prev => ({ ...prev, [key]: val }))
    void mutate(prev => prev ? { ...prev, [key]: val } : prev, false)
  }, [mutate])

  if (!defaultsData?.summarize || !defaultsData?.translate) return null

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-text mb-1">{t('settings.aiPrompts')}</h2>
        <p className="text-xs text-muted">{t('settings.aiPromptsDesc')}</p>
      </div>

      <PromptEditor
        label={t('settings.summarizePrompt')}
        prefKey="prompt.summarize"
        savedValue={prefs['prompt.summarize']}
        defaultValue={defaultsData.summarize}
        onChange={handleChange}
      />

      <PromptEditor
        label={t('settings.translatePrompt')}
        prefKey="prompt.translate"
        savedValue={prefs['prompt.translate']}
        defaultValue={defaultsData.translate}
        onChange={handleChange}
      />
    </section>
  )
}
