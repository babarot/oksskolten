import OpenAI from 'openai'
import { getSetting } from '../../db.js'
import type { LLMProvider, LLMMessageParams, LLMStreamResult } from './provider.js'

let cachedKey = ''
let cachedBaseUrl = ''
let cachedClient: OpenAI | null = null

function getConfiguredOpenAIBaseUrl(): string | undefined {
  const baseUrl = getSetting('openai.base_url')?.trim()
  return baseUrl ? baseUrl.replace(/\/+$/, '') : undefined
}

export function getOpenAIClient(): OpenAI {
  const key = getSetting('api_key.openai') || ''
  const baseURL = getConfiguredOpenAIBaseUrl() || ''
  if (cachedClient && key === cachedKey && baseURL === cachedBaseUrl) return cachedClient
  cachedKey = key
  cachedBaseUrl = baseURL
  cachedClient = new OpenAI({
    apiKey: key,
    ...(baseURL ? { baseURL } : {}),
  })
  return cachedClient
}

export const openaiProvider: LLMProvider = {
  name: 'openai',

  requireKey() {
    if (!getSetting('api_key.openai')) {
      throw new Error('OPENAI_KEY_NOT_SET')
    }
  },

  async createMessage(params: LLMMessageParams): Promise<LLMStreamResult> {
    const client = getOpenAIClient()
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
    const client = getOpenAIClient()
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
