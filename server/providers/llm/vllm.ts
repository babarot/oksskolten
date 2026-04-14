import OpenAI from 'openai'
import { getSetting } from '../../db.js'
import type { LLMProvider, LLMMessageParams, LLMStreamResult } from './provider.js'

let cachedBaseUrl = ''
let cachedApiKey = ''
let cachedClient: OpenAI | null = null

export function getVllmBaseUrl(): string {
  return getSetting('vllm.base_url') || process.env.VLLM_BASE_URL || 'http://localhost:8000'
}

export function getVllmApiKey(): string {
  return getSetting('api_key.vllm') || ''
}

export function getVllmClient(): OpenAI {
  const baseUrl = getVllmBaseUrl()
  const apiKey = getVllmApiKey()
  if (cachedClient && baseUrl === cachedBaseUrl && apiKey === cachedApiKey) return cachedClient
  cachedBaseUrl = baseUrl
  cachedApiKey = apiKey
  cachedClient = new OpenAI({
    baseURL: baseUrl.replace(/\/+$/, '') + '/v1',
    apiKey: apiKey || 'vllm', // Required by SDK even if not used by vLLM
  })
  return cachedClient
}

export const vllmProvider: LLMProvider = {
  name: 'vllm',

  requireKey() {
    // API key is optional for vLLM
  },

  async createMessage(params: LLMMessageParams): Promise<LLMStreamResult> {
    const client = getVllmClient()
    const messages: OpenAI.ChatCompletionMessageParam[] = []
    if (params.systemInstruction) {
      messages.push({ role: 'system', content: params.systemInstruction })
    }
    for (const m of params.messages) {
      messages.push({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
      })
    }

    const response = await client.chat.completions.create({
      model: params.model,
      max_completion_tokens: params.maxTokens,
      messages,
    })

    const text = response.choices[0]?.message?.content ?? ''
    return {
      text,
      inputTokens: response.usage?.prompt_tokens ?? 0,
      outputTokens: response.usage?.completion_tokens ?? 0,
    }
  },

  async streamMessage(params: LLMMessageParams, onText: (delta: string) => void): Promise<LLMStreamResult> {
    const client = getVllmClient()
    const messages: OpenAI.ChatCompletionMessageParam[] = []
    if (params.systemInstruction) {
      messages.push({ role: 'system', content: params.systemInstruction })
    }
    for (const m of params.messages) {
      messages.push({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
      })
    }

    const stream = await client.chat.completions.create({
      model: params.model,
      max_completion_tokens: params.maxTokens,
      messages,
      stream: true,
      stream_options: { include_usage: true },
    })

    let fullText = ''
    let inputTokens = 0
    let outputTokens = 0

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content ?? ''
      if (delta) {
        fullText += delta
        onText(delta)
      }
      if (chunk.usage) {
        inputTokens = chunk.usage.prompt_tokens ?? inputTokens
        outputTokens = chunk.usage.completion_tokens ?? outputTokens
      }
    }

    return { text: fullText, inputTokens, outputTokens }
  },
}
