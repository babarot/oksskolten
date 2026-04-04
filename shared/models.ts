export interface ModelDef {
  value: string
  label: string
  pricing: [number, number] // [input $/M tokens, output $/M tokens]
}

export interface ModelGroup {
  group: string
  models: ModelDef[]
}

export const ANTHROPIC_MODELS: ModelGroup[] = [
  { group: 'Latest', models: [
    { value: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5', pricing: [1, 5] },
    { value: 'claude-sonnet-4-6', label: 'Sonnet 4.6', pricing: [3, 15] },
    { value: 'claude-opus-4-6', label: 'Opus 4.6', pricing: [5, 25] },
  ]},
  { group: 'Legacy', models: [
    { value: 'claude-sonnet-4-5-20250929', label: 'Sonnet 4.5', pricing: [3, 15] },
    { value: 'claude-opus-4-5-20251101', label: 'Opus 4.5', pricing: [5, 25] },
    { value: 'claude-sonnet-4-20250514', label: 'Sonnet 4', pricing: [3, 15] },
    { value: 'claude-opus-4-20250514', label: 'Opus 4', pricing: [15, 75] },
  ]},
]

export const GEMINI_MODELS: ModelGroup[] = [
  { group: 'Latest', models: [
    { value: 'gemini-3.1-flash-lite-preview', label: 'Gemini 3.1 Flash-Lite', pricing: [0.25, 1.50] },
  ]},
  { group: 'Standard', models: [
    { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', pricing: [0.15, 0.60] },
    { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', pricing: [1.25, 10] },
  ]},
  { group: 'Legacy', models: [
    { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', pricing: [0.10, 0.40] },
  ]},
]

export const OPENAI_MODELS: ModelGroup[] = [
  { group: 'Latest', models: [
    { value: 'gpt-5.4', label: 'GPT-5.4', pricing: [2.50, 15] },
    { value: 'gpt-5.3', label: 'GPT-5.3', pricing: [1.75, 14] },
    { value: 'gpt-5-mini', label: 'GPT-5 Mini', pricing: [0.25, 2] },
    { value: 'gpt-5-nano', label: 'GPT-5 Nano', pricing: [0.05, 0.40] },
  ]},
  { group: 'Standard', models: [
    { value: 'gpt-4.1', label: 'GPT-4.1', pricing: [2, 8] },
    { value: 'gpt-4.1-mini', label: 'GPT-4.1 Mini', pricing: [0.40, 1.60] },
    { value: 'gpt-4.1-nano', label: 'GPT-4.1 Nano', pricing: [0.10, 0.40] },
  ]},
  { group: 'Legacy', models: [
    { value: 'gpt-5.2', label: 'GPT-5.2', pricing: [1.75, 14] },
    { value: 'gpt-4o', label: 'GPT-4o', pricing: [2.50, 10] },
    { value: 'gpt-4o-mini', label: 'GPT-4o Mini', pricing: [0.15, 0.60] },
  ]},
]

export const MODELS_BY_PROVIDER: Record<string, ModelGroup[]> = {
  anthropic: ANTHROPIC_MODELS,
  gemini: GEMINI_MODELS,
  openai: OPENAI_MODELS,
}

export const DEFAULT_MODELS: Record<string, string> = {
  anthropic: 'claude-haiku-4-5-20251001',
  gemini: 'gemini-2.5-flash',
  openai: 'gpt-4.1-mini',
  'claude-code': 'claude-haiku-4-5-20251001',
  ollama: '',
  vllm: '',
  'google-translate': '',
  deepl: '',
}

export const TASK_DEFAULTS = {
  chat:      { provider: 'anthropic', model: 'claude-haiku-4-5-20251001' },
  summarize: { provider: 'anthropic', model: 'claude-haiku-4-5-20251001' },
  translate: { provider: 'anthropic', model: 'claude-sonnet-4-6' },
} as const

/** LLM providers that require an API key */
export const LLM_API_PROVIDERS = ['anthropic', 'gemini', 'openai'] as const

/** Translation service providers that require an API key */
export const TRANSLATE_SERVICE_PROVIDERS = ['google-translate', 'deepl'] as const

/** All LLM providers selectable for tasks (includes claude-code which uses auth, not API key) */
export const LLM_TASK_PROVIDERS = [...LLM_API_PROVIDERS, 'claude-code', 'ollama', 'vllm'] as const

export const PROVIDER_LABELS: Record<string, 'provider.anthropic' | 'provider.gemini' | 'provider.openai' | 'provider.claudeCode' | 'provider.ollama' | 'provider.vllm' | 'provider.googleTranslate' | 'provider.deepl'> = {
  anthropic: 'provider.anthropic',
  gemini: 'provider.gemini',
  openai: 'provider.openai',
  'claude-code': 'provider.claudeCode',
  ollama: 'provider.ollama',
  vllm: 'provider.vllm',
  'google-translate': 'provider.googleTranslate',
  deepl: 'provider.deepl',
}

/** Cheapest model per provider, used for lightweight sub-agent tasks (e.g. title generation) */
export const SUB_AGENT_MODELS: Record<string, string> = {
  anthropic: 'claude-haiku-4-5-20251001',
  gemini: 'gemini-2.5-flash',
  openai: 'gpt-5-nano',
  'claude-code': 'claude-haiku-4-5-20251001',
  ollama: '',
  vllm: '',
}

/** Get flat array of model value strings for a given provider */
export function getModelValues(provider: string): string[] {
  const groups = MODELS_BY_PROVIDER[provider]
  if (!groups) return []
  return groups.flatMap(g => g.models.map(m => m.value))
}

/** Get all model value strings across all providers */
export function getAllModelValues(): string[] {
  return Object.keys(MODELS_BY_PROVIDER).flatMap(getModelValues)
}

/** Get short display label for a model (e.g. "Haiku 4.5") */
export function getModelLabel(model: string): string | undefined {
  for (const groups of Object.values(MODELS_BY_PROVIDER)) {
    for (const group of groups) {
      for (const m of group.models) {
        if (m.value === model) return m.label
      }
    }
  }
  return undefined
}

/** Look up pricing for a model by its value string */
export function getModelPricing(model: string): [number, number] | undefined {
  for (const groups of Object.values(MODELS_BY_PROVIDER)) {
    for (const group of groups) {
      for (const m of group.models) {
        if (m.value === model) return m.pricing
      }
    }
  }
  return undefined
}
