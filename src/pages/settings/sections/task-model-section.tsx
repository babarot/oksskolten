import { useEffect, useMemo, useRef, useState } from 'react'
import useSWR from 'swr'
import { fetcher } from '../../../lib/fetcher'
import {
  ANTHROPIC_MODELS,
  GEMINI_MODELS,
  OPENAI_MODELS,
  DEFAULT_MODELS,
  PROVIDER_LABELS,
  LLM_API_PROVIDERS,
  TRANSLATE_SERVICE_PROVIDERS,
  LLM_TASK_PROVIDERS,
} from '../../../data/aiModels'
import type { ModelGroup } from '../../../data/aiModels'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectGroup, SelectLabel, SelectItem } from '@/components/ui/select'
import type { Settings } from '../../../hooks/use-settings'
import type { TranslateFn } from '../../../lib/i18n'

type TFunc = TranslateFn
type MessageKey = Parameters<TFunc>[0]

interface TaskConfig {
  labelKey: MessageKey
  providerValue: string
  setProvider: (v: string) => void
  modelValue: string
  setModel: (v: string) => void
  defaultModel: string
  hasTranslateServices?: boolean
}

const SWR_KEY_OPTS = { revalidateOnFocus: false } as const

export function TaskModelSection({ settings, t }: { settings: Settings; t: TFunc }) {
  // Call useSWR at top level for each provider (hooks must not be called in loops)
  const anthropicKey = useSWR<{ configured: boolean }>(`/api/settings/api-keys/anthropic`, fetcher, SWR_KEY_OPTS)
  const geminiKey = useSWR<{ configured: boolean }>(`/api/settings/api-keys/gemini`, fetcher, SWR_KEY_OPTS)
  const openaiKey = useSWR<{ configured: boolean }>(`/api/settings/api-keys/openai`, fetcher, SWR_KEY_OPTS)
  const googleTranslateKey = useSWR<{ configured: boolean }>(`/api/settings/api-keys/google-translate`, fetcher, SWR_KEY_OPTS)
  const deeplKey = useSWR<{ configured: boolean }>(`/api/settings/api-keys/deepl`, fetcher, SWR_KEY_OPTS)
  const { data: claudeCodeStatus } = useSWR<{ loggedIn?: boolean; error?: string }>(
    '/api/chat/claude-code-status', fetcher, SWR_KEY_OPTS,
  )

  const llmKeyStatuses = [anthropicKey, geminiKey, openaiKey]
  const translateKeyStatuses = [googleTranslateKey, deeplKey]

  const claudeCodeReady = !!claudeCodeStatus?.loggedIn
  const configuredKeys = useMemo(() => {
    const map: Record<string, boolean> = {}
    LLM_API_PROVIDERS.forEach((p, i) => { map[p] = !!llmKeyStatuses[i].data?.configured })
    TRANSLATE_SERVICE_PROVIDERS.forEach((p, i) => { map[p] = !!translateKeyStatuses[i].data?.configured })
    map['claude-code'] = claudeCodeReady
    map['ollama'] = true  // Ollama requires no API key; always available
    map['vllm'] = true    // vLLM requires no API key by default; always available
    return map
    // Recompute only when any key's configured status changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    anthropicKey.data?.configured, geminiKey.data?.configured, openaiKey.data?.configured,
    googleTranslateKey.data?.configured, deeplKey.data?.configured, claudeCodeReady,
  ])
  // Ollama/vLLM requires no API key, so the task section is always enabled when they are available.
  const hasAnyLlmKey = LLM_API_PROVIDERS.some(p => configuredKeys[p]) || claudeCodeReady || configuredKeys['ollama'] || configuredKeys['vllm']
  const hasAnyTranslateKey = TRANSLATE_SERVICE_PROVIDERS.some(p => configuredKeys[p])
  const hasAnyKey = hasAnyLlmKey || hasAnyTranslateKey
  const keysLoading = llmKeyStatuses.some(s => !s.data) || translateKeyStatuses.some(s => !s.data)

  const tasks: TaskConfig[] = [
    {
      labelKey: 'integration.task.chat',
      providerValue: settings.chatProvider || '',
      setProvider: (v) => {
        settings.setChatProvider(v)
        // Ollama/vLLM models are dynamic; don't set a default (auto-selected by ModelSelect)
        if (v !== 'ollama' && v !== 'vllm') settings.setChatModel(DEFAULT_MODELS[v] || DEFAULT_MODELS.anthropic)
        else settings.setChatModel('')
      },
      modelValue: settings.chatModel || '',
      setModel: settings.setChatModel,
      defaultModel: 'claude-haiku-4-5-20251001',
    },
    {
      labelKey: 'integration.task.summary',
      providerValue: settings.summaryProvider || '',
      setProvider: (v) => {
        settings.setSummaryProvider(v)
        if (v !== 'ollama' && v !== 'vllm') settings.setSummaryModel(DEFAULT_MODELS[v] || DEFAULT_MODELS.anthropic)
        else settings.setSummaryModel('')
      },
      modelValue: settings.summaryModel || '',
      setModel: settings.setSummaryModel,
      defaultModel: 'claude-haiku-4-5-20251001',
    },
    {
      labelKey: 'integration.task.translate',
      providerValue: settings.translateProvider || '',
      setProvider: (v) => {
        settings.setTranslateProvider(v)
        if (v !== 'ollama' && v !== 'vllm') settings.setTranslateModel(DEFAULT_MODELS[v] || DEFAULT_MODELS.anthropic)
        else settings.setTranslateModel('')
      },
      modelValue: settings.translateModel || '',
      setModel: settings.setTranslateModel,
      defaultModel: 'claude-sonnet-4-6',
      hasTranslateServices: true,
    },
  ]

  // Show brief "Saved" feedback on any task provider/model change
  const [showSaved, setShowSaved] = useState(false)
  const prevValues = useRef(tasks.map(t => `${t.providerValue}:${t.modelValue}`).join('|'))
  const currentValues = tasks.map(t => `${t.providerValue}:${t.modelValue}`).join('|')
  useEffect(() => {
    if (prevValues.current !== currentValues) {
      prevValues.current = currentValues
      setShowSaved(true)
      const timer = setTimeout(() => setShowSaved(false), 1500)
      return () => clearTimeout(timer)
    }
  }, [currentValues])

  return (
    <section>
      <div className="flex items-center gap-2 mb-1">
        <h2 className="text-base font-semibold text-text">{t('integration.taskSettings')}</h2>
        <span
          className={`text-xs text-accent transition-opacity duration-300 ${
            showSaved ? 'opacity-100' : 'opacity-0'
          }`}
        >
          {t('settings.saved')}
        </span>
      </div>
      <p className="text-xs text-muted mb-4">{t('integration.taskSettingsDesc')}</p>
      <div className={`space-y-3 ${!keysLoading && !hasAnyKey ? 'opacity-50 pointer-events-none' : ''}`}>
        {tasks.map(task => (
          <TaskModelRow key={task.labelKey} task={task} t={t} configuredKeys={configuredKeys} hasAnyTranslateKey={hasAnyTranslateKey} />
        ))}
      </div>
      {!keysLoading && !hasAnyKey && (
        <p className="text-xs text-muted mt-2">{t('integration.taskSettingsNoKeys')}</p>
      )}

    </section>
  )
}

/* ── Helpers ── */

function getModelGroups(provider: string): ModelGroup[] {
  if (provider === 'gemini') return GEMINI_MODELS
  if (provider === 'openai') return OPENAI_MODELS
  return ANTHROPIC_MODELS
}

function isTranslateService(provider: string): boolean {
  return (TRANSLATE_SERVICE_PROVIDERS as readonly string[]).includes(provider)
}

/* ── Task Model Row ── */

function TaskModelRow({ task, t, configuredKeys, hasAnyTranslateKey }: { task: TaskConfig; t: TFunc; configuredKeys: Record<string, boolean>; hasAnyTranslateKey: boolean }) {
  const hasTranslateServices = !!task.hasTranslateServices
  const currentIsTranslateService = isTranslateService(task.providerValue)

  if (!hasTranslateServices) {
    return (
      <div className="p-3 rounded-lg bg-bg-card border border-border space-y-2">
        <span className="block text-xs font-medium text-text select-none">{t(task.labelKey)}</span>
        <ProviderButtons providers={LLM_TASK_PROVIDERS} selected={task.providerValue} onSelect={task.setProvider} t={t} configuredKeys={configuredKeys} />
        <ModelSelect provider={task.providerValue} modelValue={task.modelValue} setModel={task.setModel} t={t} />
      </div>
    )
  }

  return (
    <div className="p-3 rounded-lg bg-bg-card border border-border space-y-2">
      <span className="block text-xs font-medium text-text select-none">{t(task.labelKey)}</span>
      <div className="flex rounded-md bg-bg-subtle p-0.5">
        <button
          type="button"
          onClick={() => { if (!task.providerValue || currentIsTranslateService) task.setProvider('anthropic') }}
          className={`flex-1 px-1.5 py-1 text-[11px] rounded transition-colors select-none ${
            task.providerValue && !currentIsTranslateService
              ? 'bg-accent text-accent-text font-medium shadow-sm'
              : 'text-muted hover:text-text'
          }`}
        >
          {t('integration.modeLLM')}
        </button>
        <button
          type="button"
          onClick={() => { if (hasAnyTranslateKey && (!task.providerValue || !currentIsTranslateService)) task.setProvider(TRANSLATE_SERVICE_PROVIDERS[0]) }}
          disabled={!hasAnyTranslateKey}
          className={`flex-1 px-1.5 py-1 text-[11px] rounded transition-colors select-none ${
            task.providerValue && currentIsTranslateService
              ? 'bg-accent text-accent-text font-medium shadow-sm'
              : !hasAnyTranslateKey
                ? 'text-muted/40 cursor-not-allowed'
                : 'text-muted hover:text-text'
          }`}
        >
          {t('integration.modeTranslateService')}
        </button>
      </div>
      {currentIsTranslateService ? (
        <>
          <ProviderButtons providers={TRANSLATE_SERVICE_PROVIDERS} selected={task.providerValue} onSelect={task.setProvider} t={t} configuredKeys={configuredKeys} />
          {task.providerValue === 'google-translate' && <GoogleTranslateNote t={t} />}
          {task.providerValue === 'deepl' && <DeeplNote t={t} />}
        </>
      ) : (
        <>
          <ProviderButtons providers={LLM_TASK_PROVIDERS} selected={task.providerValue} onSelect={task.setProvider} t={t} configuredKeys={configuredKeys} />
          <ModelSelect provider={task.providerValue} modelValue={task.modelValue} setModel={task.setModel} t={t} />
        </>
      )}
    </div>
  )
}

/* ── Shared sub-components ── */

function ProviderButtons({ providers, selected, onSelect, t, configuredKeys }: { providers: readonly string[]; selected: string; onSelect: (v: string) => void; t: TFunc; configuredKeys: Record<string, boolean> }) {
  if (providers.length === 0) return null
  return (
    <div className="flex rounded-md bg-bg-subtle p-0.5">
      {providers.map(p => {
        const isConfigured = !!configuredKeys[p]
        return (
          <button
            key={p}
            type="button"
            onClick={() => { if (isConfigured) onSelect(p) }}
            disabled={!isConfigured}
            className={`flex-1 px-1.5 py-1 text-[11px] rounded transition-colors select-none ${
              selected === p
                ? 'bg-accent text-accent-text font-medium shadow-sm'
                : !isConfigured
                  ? 'text-muted/40 cursor-not-allowed'
                  : 'text-muted hover:text-text'
            }`}
          >
            {t(PROVIDER_LABELS[p])}
          </button>
        )
      })}
    </div>
  )
}

function ModelSelect({ provider, modelValue, setModel, t }: { provider: string; modelValue: string; setModel: (v: string) => void; t: TFunc }) {
  // Ollama: fetch dynamic model list
  const { data: ollamaModels } = useSWR<{ models: Array<{ name: string; size: number; parameter_size: string }> }>(
    provider === 'ollama' ? '/api/settings/ollama/models' : null,
    fetcher,
    { revalidateOnFocus: false },
  )

  // vLLM: fetch dynamic model list
  const { data: vllmModels } = useSWR<{ models: Array<{ name: string }> }>(
    provider === 'vllm' ? '/api/settings/vllm/models' : null,
    fetcher,
    { revalidateOnFocus: false },
  )

  // Auto-select first Ollama model when switching to ollama and no model is set
  useEffect(() => {
    if (provider === 'ollama' && ollamaModels?.models?.length && !modelValue) {
      setModel(ollamaModels.models[0].name)
    }
  }, [provider, ollamaModels, modelValue, setModel])

  // Auto-select first vLLM model when switching to vllm and no model is set
  useEffect(() => {
    if (provider === 'vllm' && vllmModels?.models?.length && !modelValue) {
      setModel(vllmModels.models[0].name)
    }
  }, [provider, vllmModels, modelValue, setModel])

  if (!provider) {
    return (
      <Select disabled>
        <SelectTrigger>
          <SelectValue placeholder={t('integration.selectProviderFirst')} />
        </SelectTrigger>
        <SelectContent />
      </Select>
    )
  }

  if (provider === 'ollama') {
    const models = ollamaModels?.models || []
    if (models.length === 0) {
      return (
        <Select disabled>
          <SelectTrigger>
            <SelectValue placeholder={t('ollama.noModels')} />
          </SelectTrigger>
          <SelectContent />
        </Select>
      )
    }
    return (
      <Select value={modelValue || undefined} onValueChange={setModel}>
        <SelectTrigger>
          <SelectValue placeholder={t('integration.selectModel')} />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {models.map(m => (
              <SelectItem key={m.name} value={m.name}>
                {m.name}{m.parameter_size ? ` (${m.parameter_size})` : ''}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    )
  }

  if (provider === 'vllm') {
    const models = vllmModels?.models || []
    if (models.length === 0) {
      return (
        <Select disabled>
          <SelectTrigger>
            <SelectValue placeholder={t('vllm.noModels')} />
          </SelectTrigger>
          <SelectContent />
        </Select>
      )
    }
    return (
      <Select value={modelValue || undefined} onValueChange={setModel}>
        <SelectTrigger>
          <SelectValue placeholder={t('integration.selectModel')} />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {models.map(m => (
              <SelectItem key={m.name} value={m.name}>
                {m.name}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    )
  }

  return (
    <Select value={modelValue || undefined} onValueChange={setModel}>
      <SelectTrigger>
        <SelectValue placeholder={t('integration.selectModel')} />
      </SelectTrigger>
      <SelectContent>
        {getModelGroups(provider).map(group => (
          <SelectGroup key={group.group}>
            <SelectLabel>{group.group}</SelectLabel>
            {group.models.map(m => (
              <SelectItem key={m.value} value={m.value}>{m.label} ({m.value})</SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  )
}

function GoogleTranslateNote({ t }: { t: TFunc }) {
  const { data } = useSWR<{ monthlyChars: number; freeTierRemaining: number }>(
    '/api/settings/google-translate/usage',
    fetcher,
    { revalidateOnFocus: false },
  )
  const monthlyK = data ? (data.monthlyChars / 1000).toFixed(0) : '—'
  return (
    <div className="rounded-md bg-bg-subtle px-3 py-2 text-xs text-muted select-none">
      <p>{t('integration.googleTranslateNote')}</p>
      <p className="mt-1.5 text-[11px] text-muted/70">{t('integration.googleTranslateFreeTier')}</p>
      <p className="mt-1 text-[11px] text-muted/70">{t('integration.googleTranslateUsage', { used: `${monthlyK}K`, limit: '500K' })}</p>
    </div>
  )
}

function DeeplNote({ t }: { t: TFunc }) {
  const { data } = useSWR<{ monthlyChars: number; freeTierRemaining: number }>(
    '/api/settings/deepl/usage',
    fetcher,
    { revalidateOnFocus: false },
  )
  const monthlyK = data ? (data.monthlyChars / 1000).toFixed(0) : '—'
  return (
    <div className="rounded-md bg-bg-subtle px-3 py-2 text-xs text-muted select-none">
      <p>{t('integration.deeplNote')}</p>
      <p className="mt-1.5 text-[11px] text-muted/70">{t('integration.deeplFreeTier')}</p>
      <p className="mt-1 text-[11px] text-muted/70">{t('integration.deeplUsage', { used: `${monthlyK}K`, limit: '500K' })}</p>
    </div>
  )
}
