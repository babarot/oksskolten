import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { Link as RouterLink } from 'react-router-dom'
import { Maximize2, Minimize2, X } from 'lucide-react'
import { IconButton } from '../ui/icon-button'
import useSWR from 'swr'
import { useChat, type ChatMessage } from '../../hooks/use-chat'
import { fetcher } from '../../lib/fetcher'
import { useI18n } from '../../lib/i18n'
import { articleUrlToPath } from '../../lib/url'
import { useEscapeKey } from '../../hooks/use-escape-key'
import { ChatInputArea } from './chat-input-area'
import { ChatMessages } from './chat-messages'
import { ChatPromptSuggestion } from './chat-prompt-suggestion'
import { ChatLinkedArticle } from './chat-linked-article'
import { ChatScopeBadge } from './chat-scope-badge'
import type { ChatScope, ScopeSummary } from '../../../shared/types'

interface ToolStatus {
  name: string
  tool_use_id: string
}

/** Subset of useChat return value that ChatPanel needs */
export interface ChatState {
  messages: ChatMessage[]
  conversationId: string | null
  streaming: boolean
  thinking: boolean
  activeTool: ToolStatus | null
  error: string | null
  sendMessage: (text: string) => void
  loadConversation: (id: string) => Promise<void>
  reset: () => void
}

interface ChatPanelProps {
  variant: 'full' | 'inline'
  chatState?: ChatState
  scope?: ChatScope
  scopeSummary?: ScopeSummary | null
  conversationId?: string
  onConversationCreated?: (id: string) => void
  onClose?: () => void
}

interface Conversation {
  id: string
  title: string | null
  article_id: number | null
  article_title?: string | null
  article_url?: string | null
  article_og_image?: string | null
}

export function ChatPanel({ variant, chatState: externalChatState, scope, scopeSummary, conversationId: initialConversationId, onConversationCreated, onClose }: ChatPanelProps) {
  const { t } = useI18n()
  const articleId = scope?.type === 'article' ? scope.article_id : undefined

  // Use external chat state if provided, otherwise create internal one
  const internalChatState = useChat(scope)
  const chat = externalChatState ?? internalChatState

  const {
    messages,
    conversationId: currentConversationId,
    streaming,
    thinking,
    activeTool,
    error,
    sendMessage,
    loadConversation,
  } = chat

  // Notify parent when a new conversation is created (for URL update etc.)
  // Wait until streaming completes so the assistant response is persisted
  // before any navigation unmounts this component.
  const notifiedRef = useRef<string | null>(initialConversationId ?? null)
  useEffect(() => {
    if (currentConversationId && currentConversationId !== notifiedRef.current && !streaming && onConversationCreated) {
      notifiedRef.current = currentConversationId
      onConversationCreated(currentConversationId)
    }
  }, [currentConversationId, streaming, onConversationCreated])

  const [input, setInput] = useState('')
  const [expanded, setExpanded] = useState(false)
  const [inlineHeight, setInlineHeight] = useState<number | null>(null) // null = default 400px

  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Resize handle drag for inline variant
  const handleResizePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    const startY = e.clientY
    const startHeight = messagesContainerRef.current?.offsetHeight ?? 400

    const onMove = (ev: PointerEvent) => {
      // Dragging down = positive delta = taller
      const delta = ev.clientY - startY
      const newHeight = Math.max(120, Math.min(startHeight + delta, window.innerHeight * 0.8))
      setInlineHeight(newHeight)
    }

    const onUp = () => {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
    }

    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
  }, [])

  // Esc to collapse (only when expanded)
  useEscapeKey(useCallback(() => {
    if (expanded) setExpanded(false)
  }, [expanded]))

  // Body scroll lock when expanded
  useEffect(() => {
    if (!expanded) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [expanded])

  // For inline variant with articleId, look up existing conversations
  const { data: convData } = useSWR<{ conversations: Conversation[] }>(
    articleId && !initialConversationId
      ? `/api/chat/conversations?article_id=${articleId}`
      : null,
    fetcher,
    { revalidateOnFocus: false },
  )

  // For full variant with conversationId, get article info from conversations list cache
  const { data: allConvData } = useSWR<{ conversations: Conversation[] }>(
    variant === 'full' && initialConversationId ? '/api/chat/conversations' : null,
    fetcher,
    { revalidateOnFocus: false },
  )
  const linkedArticle = useMemo(() => {
    const conv = allConvData?.conversations?.find(c => c.id === initialConversationId)
    if (!conv?.article_url || !conv?.article_title) return null
    return { title: conv.article_title, url: conv.article_url, ogImage: conv.article_og_image ?? null }
  }, [allConvData, initialConversationId])

  // Load existing conversation (explicit prop or auto-discovered from article)
  const resolvedConversationId = initialConversationId ?? convData?.conversations?.[0]?.id
  const loadedRef = useRef<string | null>(null)

  useEffect(() => {
    if (resolvedConversationId && loadedRef.current !== resolvedConversationId) {
      loadedRef.current = resolvedConversationId
      void loadConversation(resolvedConversationId)
    }
  }, [resolvedConversationId, loadConversation])

  // Auto-scroll
  useEffect(() => {
    const el = messagesContainerRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, activeTool, variant])

  const handleSend = () => {
    if (!input.trim() || streaming) return
    void sendMessage(input.trim())
    setInput('')
  }

  const isInline = variant === 'inline'

  const messagesContent = (
    <>
      {isInline && messages.length === 0 && !streaming && (
        <ChatPromptSuggestion
          context={scope?.type === 'global' ? 'home' : undefined}
          onSelect={(prompt, suggestionKey) => { void sendMessage(prompt, { suggestionKey }); setInput('') }}
        />
      )}
      <ChatMessages
        messages={messages}
        streaming={streaming}
        thinking={thinking}
        activeTool={activeTool}
        error={error}
        endRef={messagesEndRef}
        showEndMarker={!isInline}
      />
    </>
  )

  const inputArea = (
    <ChatInputArea
      variant={isInline ? 'inline' : 'full'}
      input={input}
      streaming={streaming}
      onInputChange={setInput}
      onSend={handleSend}
    />
  )

  // Expanded overlay (inline variant only) — rendered via portal
  if (isInline && expanded) {
    const overlay = (
      <div className="fixed inset-0 z-[90]">
        {/* backdrop */}
        <div className="absolute inset-0 bg-overlay" onClick={() => setExpanded(false)} />
        {/* panel */}
        <div className="absolute inset-0 flex items-center justify-center p-4 md:p-8 pointer-events-none">
          <div className="bg-bg-card rounded-xl border border-border w-full max-w-3xl h-full max-h-[90vh] flex flex-col animate-[fade-in_150ms_ease] pointer-events-auto">
            {/* header */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-border select-none" style={{ paddingTop: 'var(--safe-area-inset-top)' }}>
              <div className="min-w-0">
                <span className="text-sm font-medium text-text">{t('chat.title')}</span>
                <div className="mt-1">
                  <ChatScopeBadge summary={scopeSummary} />
                </div>
              </div>
              <IconButton
                onClick={() => setExpanded(false)}
                className="p-1 w-auto h-auto hover:bg-hover"
                aria-label={t('chat.collapse')}
              >
                <Minimize2 className="w-4 h-4" />
              </IconButton>
            </div>
            {/* messages */}
            <div ref={messagesContainerRef} className="flex-1 overflow-y-auto overscroll-contain px-4 py-3 space-y-3">
              {messagesContent}
            </div>
            {/* input */}
            {inputArea}
          </div>
        </div>
      </div>
    )

    return (
      <>
        {/* Keep inline container in DOM so React doesn't unmount useChat state */}
        <div className="flex flex-col border border-border rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b border-border select-none">
            <div className="min-w-0">
              <span className="text-sm font-medium text-text">{t('chat.title')}</span>
              <div className="mt-1">
                <ChatScopeBadge summary={scopeSummary} />
              </div>
            </div>
            <IconButton
              onClick={() => setExpanded(true)}
              className="p-1 w-auto h-auto hover:bg-hover"
              aria-label={t('chat.expand')}
            >
              <Maximize2 className="w-4 h-4" />
            </IconButton>
          </div>
        </div>
        {createPortal(overlay, document.body)}
      </>
    )
  }

  // Inline (non-expanded)
  if (isInline) {
    return (
      <div className="flex flex-col border border-border rounded-lg overflow-hidden">
        {/* header bar */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-border select-none">
          <div className="min-w-0">
            <span className="text-sm font-medium text-text">{t('chat.title')}</span>
            <div className="mt-1">
              <ChatScopeBadge summary={scopeSummary} />
            </div>
          </div>
          <div className="flex items-center gap-0.5">
            <IconButton
              onClick={() => setExpanded(true)}
              className="p-1 w-auto h-auto hover:bg-hover"
              aria-label={t('chat.expand')}
            >
              <Maximize2 className="w-4 h-4" />
            </IconButton>
            {onClose && (
              <button
                onClick={onClose}
                className="p-1 rounded hover:bg-hover text-muted transition-colors"
                aria-label={t('modal.cancel')}
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
        {/* messages */}
          <div
          ref={messagesContainerRef}
          className="overflow-y-auto overscroll-contain px-4 py-3 space-y-3"
          style={{ maxHeight: inlineHeight != null ? `${inlineHeight}px` : '400px' }}
        >
          {messagesContent}
        </div>
        {/* resize handle */}
        <div
          onPointerDown={handleResizePointerDown}
          className="h-1.5 cursor-ns-resize flex items-center justify-center hover:bg-hover transition-colors select-none touch-none"
        >
          <div className="w-8 h-0.5 rounded-full bg-border" />
        </div>
        {/* input */}
        {inputArea}
      </div>
    )
  }

  // Full variant (HomePage / ChatPage)
  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto overscroll-contain">
        <div className="max-w-2xl mx-auto px-4 py-4 space-y-3">
          <ChatScopeBadge summary={scopeSummary} />
          {linkedArticle && (
            <ChatLinkedArticle
              title={linkedArticle.title}
              url={linkedArticle.url}
              ogImage={linkedArticle.ogImage}
            />
          )}
          {messagesContent}
          {linkedArticle && (
            <RouterLink
              to={articleUrlToPath(linkedArticle.url)}
              className="text-xs text-muted hover:text-accent transition-colors no-underline truncate block"
            >
              {linkedArticle.title}
            </RouterLink>
          )}
        </div>
      </div>
      {/* Input */}
      {inputArea}
    </div>
  )
}
