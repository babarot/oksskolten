import { GoogleGenAI } from '@google/genai'
import { getSetting } from '../../db.js'
import type { LLMProvider, LLMMessageParams, LLMStreamResult } from './provider.js'

let cachedKey = ''
let cachedClient: GoogleGenAI | null = null

export function getGeminiClient(): GoogleGenAI {
  const key = getSetting('api_key.gemini') || ''
  if (cachedClient && key === cachedKey) return cachedClient
  cachedKey = key
  cachedClient = new GoogleGenAI({ apiKey: key })
  return cachedClient
}

export const geminiProvider: LLMProvider = {
  name: 'gemini',

  requireKey() {
    if (!getSetting('api_key.gemini')) {
      throw new Error('GEMINI_KEY_NOT_SET')
    }
  },

  async createMessage(params: LLMMessageParams): Promise<LLMStreamResult> {
    const ai = getGeminiClient()
    const response = await ai.models.generateContent({
      model: params.model,
      contents: params.messages.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      })),
      config: {
        maxOutputTokens: params.maxTokens,
        ...(params.systemInstruction ? { systemInstruction: params.systemInstruction } : {}),
      },
    })
    const finishReason = response.candidates?.[0]?.finishReason
    if (finishReason && finishReason !== 'STOP') {
      throw new Error(`AI_TRUNCATED`)
    }
    const text = response.text ?? ''
    return {
      text,
      inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
    }
  },

  async streamMessage(params: LLMMessageParams, onText: (delta: string) => void): Promise<LLMStreamResult> {
    const ai = getGeminiClient()
    const stream = await ai.models.generateContentStream({
      model: params.model,
      contents: params.messages.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      })),
      config: {
        maxOutputTokens: params.maxTokens,
        ...(params.systemInstruction ? { systemInstruction: params.systemInstruction } : {}),
      },
    })

    let fullText = ''
    let inputTokens = 0
    let outputTokens = 0
    let finishReason = ''

    for await (const chunk of stream) {
      const delta = chunk.text ?? ''
      if (delta) {
        fullText += delta
        onText(delta)
      }
      const chunkFinishReason = chunk.candidates?.[0]?.finishReason
      if (chunkFinishReason) finishReason = chunkFinishReason
      if (chunk.usageMetadata) {
        inputTokens = chunk.usageMetadata.promptTokenCount ?? inputTokens
        outputTokens = chunk.usageMetadata.candidatesTokenCount ?? outputTokens
      }
    }

    if (finishReason && finishReason !== 'STOP') {
      throw new Error(`AI_TRUNCATED`)
    }

    return { text: fullText, inputTokens, outputTokens }
  },
}
