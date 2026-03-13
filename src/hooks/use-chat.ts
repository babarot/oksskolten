import { useState, useCallback, useRef } from 'react'
import { fetcher, streamPostChat, type ChatSSEEvent } from '../lib/fetcher'

export interface ChatUsage {
  input_tokens: number
  output_tokens: number
  elapsed_ms: number
  model?: string
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  text: string
  usage?: ChatUsage
}

interface ToolStatus {
  name: string
  tool_use_id: string
}

export function useChat(articleId?: number, context?: 'home') {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [streaming, setStreaming] = useState(false)
  const [thinking, setThinking] = useState(false)
  const [activeTool, setActiveTool] = useState<ToolStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef(false)

  const sendMessage = useCallback(async (text: string, opts?: { suggestionKey?: string }) => {
    if (!text.trim() || streaming) return

    setError(null)
    setStreaming(true)
    setThinking(false)
    abortRef.current = false

    // Add user message
    setMessages(prev => [...prev, { role: 'user', text }])

    // Add placeholder assistant message
    setMessages(prev => [...prev, { role: 'assistant', text: '' }])

    try {
      await streamPostChat(
        '/api/chat',
        {
          message: text,
          conversation_id: conversationId ?? undefined,
          article_id: articleId,
          context,
          suggestion_key: opts?.suggestionKey,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
        (event: ChatSSEEvent) => {
          if (abortRef.current) return

          switch (event.type) {
            case 'conversation_id':
              setConversationId(event.conversation_id!)
              break
            case 'text_delta':
              setThinking(false)
              setMessages(prev => {
                const updated = [...prev]
                const last = updated[updated.length - 1]
                if (last?.role === 'assistant') {
                  updated[updated.length - 1] = { ...last, text: last.text + event.text }
                }
                return updated
              })
              break
            case 'thinking_start':
              setThinking(true)
              break
            case 'thinking_end':
              setThinking(false)
              break
            case 'tool_use_start':
              setThinking(false)
              setActiveTool({ name: event.name!, tool_use_id: event.tool_use_id! })
              break
            case 'tool_use_end':
              setActiveTool(null)
              break
            case 'error':
              setThinking(false)
              setError(event.error || 'Unknown error')
              break
            case 'done':
              setThinking(false)
              if (event.usage && event.elapsed_ms) {
                const usage: ChatUsage = {
                  input_tokens: event.usage.input_tokens,
                  output_tokens: event.usage.output_tokens,
                  elapsed_ms: event.elapsed_ms,
                  model: event.model,
                }
                setMessages(prev => {
                  const updated = [...prev]
                  const last = updated[updated.length - 1]
                  if (last?.role === 'assistant') {
                    updated[updated.length - 1] = { ...last, usage }
                  }
                  return updated
                })
              }
              break
          }
        },
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      // Remove empty assistant message on error
      setMessages(prev => {
        const last = prev[prev.length - 1]
        if (last?.role === 'assistant' && !last.text) {
          return prev.slice(0, -1)
        }
        return prev
      })
    } finally {
      setStreaming(false)
      setThinking(false)
      setActiveTool(null)
    }
  }, [conversationId, articleId, context, streaming])

  const loadConversation = useCallback(async (id: string) => {
    let data: { messages: Array<{ role: string; content: string }> }
    try {
      data = await fetcher(`/api/chat/${id}/messages`) as typeof data
    } catch {
      return
    }
    if (!data?.messages) return
    setConversationId(id)

    // Convert DB messages to display messages
    // Only show user text and assistant final text (skip tool_use / tool_result)
    const displayMessages: ChatMessage[] = []
    for (const msg of data.messages) {
      const content = JSON.parse(msg.content)
      if (msg.role === 'user') {
        // Find text content (skip tool_result)
        const textBlock = content.find((b: { type: string; text?: string }) => b.type === 'text')
        if (textBlock) {
          displayMessages.push({ role: 'user', text: textBlock.text })
        }
      } else if (msg.role === 'assistant') {
        const textBlock = content.find((b: { type: string; text?: string }) => b.type === 'text')
        if (textBlock) {
          displayMessages.push({ role: 'assistant', text: textBlock.text })
        }
      }
    }
    setMessages(displayMessages)
  }, [])

  const reset = useCallback(() => {
    setMessages([])
    setConversationId(null)
    setError(null)
    setStreaming(false)
    setThinking(false)
    setActiveTool(null)
  }, [])

  return {
    messages,
    conversationId,
    streaming,
    thinking,
    activeTool,
    error,
    sendMessage,
    loadConversation,
    reset,
  }
}
