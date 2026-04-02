import { authHeaders, handleResponseError, parseSSEStream, ApiError } from './api-base'
export { ApiError, authHeaders } from './api-base'
export type { ChatSSEEvent } from './api-base'
import type { ChatScope } from '../../shared/types'

const DEFAULT_TIMEOUT_MS = 30_000

export const fetcher = async (url: string) => {
  const r = await fetch(url, { headers: authHeaders(), signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS) })
  if (!r.ok) return handleResponseError(r, url)
  return r.json()
}

async function request(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: body !== undefined ? JSON.stringify(body) : '{}',
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
  })
  if (!res.ok) return handleResponseError(res, url)
  if (res.status === 204) return undefined
  return res.json()
}

export const apiPost = (url: string, body?: unknown) => request(url, 'POST', body)
export const apiPut = (url: string, body: unknown) => request(url, 'PUT', body)
export const apiPatch = (url: string, body: unknown) => request(url, 'PATCH', body)
export const apiDelete = (url: string) => request(url, 'DELETE')

export async function streamPost(
  url: string,
  onDelta: (text: string) => void,
): Promise<{ usage: { input_tokens: number; output_tokens: number; billing_mode?: 'anthropic' | 'gemini' | 'openai' | 'claude-code' | 'google-translate'; model?: string; monthly_chars?: number } }> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: '{}',
  })
  if (!res.ok) return handleResponseError(res, url)

  const contentType = res.headers.get('Content-Type') || ''

  // Cached response: plain JSON
  if (!contentType.includes('text/event-stream')) {
    const data = await res.json()
    onDelta(data.text)
    return { usage: { input_tokens: 0, output_tokens: 0 } }
  }

  // SSE streaming response
  type StreamPayload = { type: string; text?: string; error?: string; usage?: typeof usage }
  let usage: { input_tokens: number; output_tokens: number; billing_mode?: 'anthropic' | 'gemini' | 'openai' | 'claude-code' | 'google-translate'; model?: string; monthly_chars?: number } = { input_tokens: 0, output_tokens: 0 }

  await parseSSEStream<StreamPayload>(res, (payload) => {
    if (payload.type === 'delta') {
      onDelta(payload.text as string)
    } else if (payload.type === 'error') {
      throw new ApiError((payload.error as string) || 'Unknown error', 0, {})
    } else if (payload.type === 'done') {
      usage = payload.usage as typeof usage
    }
  })

  return { usage }
}

export interface OpmlPreviewFeed {
  name: string
  url: string
  rssUrl: string
  categoryName: string | null
  isDuplicate: boolean
}

export interface OpmlPreviewResponse {
  feeds: OpmlPreviewFeed[]
  totalCount: number
  duplicateCount: number
}

export async function previewOpml(file: File): Promise<OpmlPreviewResponse> {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch('/api/opml/preview', {
    method: 'POST',
    headers: authHeaders(),
    body: form,
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
  })
  if (!res.ok) return handleResponseError(res, '/api/opml/preview')
  return res.json()
}

export async function importOpml(
  file: File,
  selectedUrls?: string[],
): Promise<{ imported: number; skipped: number; errors: string[] }> {
  const formData = new FormData()
  formData.append('file', file)
  if (selectedUrls) {
    formData.append('selectedUrls', JSON.stringify(selectedUrls))
  }
  const res = await fetch('/api/opml', {
    method: 'POST',
    headers: authHeaders(),
    body: formData,
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
  })
  if (!res.ok) return handleResponseError(res, '/api/opml')
  return res.json()
}

export async function fetchOpmlBlob(): Promise<Blob> {
  const res = await fetch('/api/opml', { headers: authHeaders(), signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS) })
  if (!res.ok) return handleResponseError(res, '/api/opml')
  return res.blob()
}

export async function streamPostChat(
  url: string,
  body: { message: string; conversation_id?: string; article_id?: number; context?: 'home'; scope?: ChatScope; suggestion_key?: string; timeZone?: string },
  onEvent: (event: import('./api-base').ChatSSEEvent) => void,
): Promise<void> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body),
  })
  if (!res.ok) return handleResponseError(res, url)

  await parseSSEStream<import('./api-base').ChatSSEEvent>(res, onEvent)
}
