import type { LLMProvider } from './provider.js'
import { anthropicProvider } from './anthropic.js'
import { geminiProvider } from './gemini.js'
import { openaiProvider } from './openai.js'
import { claudeCodeProvider } from './claude-code.js'
import { ollamaProvider } from './ollama.js'
import { vllmProvider } from './vllm.js'

const providers = new Map<string, LLMProvider>()

providers.set('anthropic', anthropicProvider)
providers.set('gemini', geminiProvider)
providers.set('openai', openaiProvider)
providers.set('claude-code', claudeCodeProvider)
providers.set('ollama', ollamaProvider)
providers.set('vllm', vllmProvider)

export function getProvider(name: string): LLMProvider {
  const provider = providers.get(name)
  if (!provider) throw new Error(`Unknown LLM provider: ${name}`)
  return provider
}
