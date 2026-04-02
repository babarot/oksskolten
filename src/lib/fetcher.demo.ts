import { demoFetcher, demoApiPost, demoApiPatch, demoApiDelete, demoStreamPost, demoStreamPostChat } from './demo/mock-api'
import { demoStore } from './demo/demo-store'

export { ApiError, authHeaders } from './api-base'
export type { ChatSSEEvent } from './api-base'

export const fetcher = demoFetcher

export const apiPost = demoApiPost
export const apiPatch = demoApiPatch as (url: string, body: unknown) => Promise<unknown>
export const apiDelete = demoApiDelete

export type { OpmlPreviewFeed, OpmlPreviewResponse } from './fetcher'

export async function previewOpml(file: File): Promise<ReturnType<typeof demoStore.previewOpml>> {
  const xml = await file.text()
  return demoStore.previewOpml(xml)
}

export async function importOpml(file: File, selectedUrls?: string[]): Promise<{ imported: number; skipped: number; errors: string[] }> {
  const xml = await file.text()
  return demoStore.importOpml(xml, selectedUrls)
}

export async function fetchOpmlBlob(): Promise<Blob> {
  const xml = demoStore.generateOpml()
  return new Blob([xml], { type: 'application/xml' })
}

export async function streamPost(
  url: string,
  onDelta: (text: string) => void,
): Promise<{ usage: { input_tokens: number; output_tokens: number; billing_mode?: 'anthropic' | 'gemini' | 'openai' | 'claude-code' | 'google-translate'; model?: string; monthly_chars?: number } }> {
  return demoStreamPost(url, onDelta)
}

export async function streamPostChat(
  url: string,
  body: { message: string; conversation_id?: string; article_id?: number; context?: 'home'; scope?: import('../../shared/types').ChatScope; suggestion_key?: string },
  onEvent: (event: { type: string; text?: string; conversation_id?: string; usage?: { input_tokens: number; output_tokens: number }; elapsed_ms?: number; model?: string }) => void,
): Promise<void> {
  return demoStreamPostChat(url, body, onEvent)
}
