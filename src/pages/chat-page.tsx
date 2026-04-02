import { useState, useCallback, useMemo, useEffect } from 'react'
import { useNavigate, useParams, Link, useLocation } from 'react-router-dom'
import useSWR, { mutate as globalMutate } from 'swr'
import { fetcher } from '../lib/fetcher'
import { useI18n } from '../lib/i18n'
import { ChatPanel } from '../components/chat/chat-panel'
import { useDateMode } from '../hooks/use-date-mode'
import { formatDate, formatRelativeDate } from '../lib/dateFormat'
import { articleUrlToPath, extractDomain } from '../lib/url'
import { RadioGroup } from '../components/ui/radio-group'
import { buildGlobalScope, summarizeScope } from '../lib/chat-scope'
import type { ChatScope, ScopeSummary } from '../../shared/types'

interface Conversation {
  id: string
  article_id: number | null
  article_title: string | null
  article_url: string | null
  article_og_image: string | null
  created_at: string
  updated_at: string
  message_count: number
  first_user_message: string | null
  first_assistant_preview: string | null
  title: string | null
  scope_type: 'global' | 'article' | 'list'
  scope_summary?: ScopeSummary | null
}

interface ChatPageLocationState {
  initialScope?: ChatScope
  scopeOptions?: {
    loadedList: ChatScope
    filteredList: ChatScope
  }
}

/** Extract plain text from JSON content blocks stored in chat_messages */
function extractText(raw: string | null): string {
  if (!raw) return ''
  try {
    const blocks = JSON.parse(raw)
    if (Array.isArray(blocks)) {
      return blocks
        .filter((b: { type: string }) => b.type === 'text')
        .map((b: { text: string }) => b.text)
        .join('')
    }
    return String(raw)
  } catch {
    return String(raw)
  }
}

function Thumbnail({ src, articleUrl }: { src: string | null; articleUrl: string | null }) {
  const [failed, setFailed] = useState(false)

  if (src && !failed) {
    return (
      <img
        src={src}
        alt=""
        className="w-16 h-16 object-cover rounded shrink-0"
        onError={() => setFailed(true)}
      />
    )
  }

  const domain = articleUrl ? extractDomain(articleUrl) : null
  if (domain) {
    return (
      <div className="w-16 h-16 rounded shrink-0 border border-border bg-bg-subtle flex items-center justify-center">
        <img
          src={`https://www.google.com/s2/favicons?sz=32&domain=${domain}`}
          alt=""
          width={24}
          height={24}
        />
      </div>
    )
  }

  return null
}

export function ChatPage() {
  const { t, locale } = useI18n()
  const navigate = useNavigate()
  const location = useLocation()
  const { conversationId } = useParams<{ conversationId?: string }>()
  const { dateMode } = useDateMode()
  const locationState = (location.state as ChatPageLocationState | null) ?? null
  const globalScope = useMemo(() => buildGlobalScope(), [])
  const [scopeMode, setScopeMode] = useState<'loaded' | 'filtered' | 'global'>(
    locationState?.initialScope?.type === 'list' && locationState.initialScope.mode === 'filtered_list'
      ? 'filtered'
      : locationState?.initialScope
        ? 'loaded'
        : 'global',
  )

  const { data } = useSWR<{ conversations: Conversation[] }>(
    '/api/chat/conversations',
    fetcher,
  )
  const conversations = data?.conversations ?? []
  const activeConversation = conversationId
    ? conversations.find(conv => conv.id === conversationId) ?? null
    : null
  const activeConversationSummary = activeConversation
    ? activeConversation.scope_type === 'article'
      ? { type: 'article' as const, label: t('chat.scope.article'), detail: activeConversation.article_title ?? null }
      : activeConversation.scope_type === 'global'
        ? { type: 'global' as const, label: t('chat.scope.global'), detail: null }
        : activeConversation.scope_summary ?? null
    : null

  useEffect(() => {
    if (!locationState?.initialScope) return
    setScopeMode(locationState.initialScope.type === 'list' && locationState.initialScope.mode === 'filtered_list' ? 'filtered' : 'loaded')
  }, [locationState?.initialScope])

  const selectedScope = useMemo(() => {
    if (scopeMode === 'loaded') return locationState?.scopeOptions?.loadedList ?? locationState?.initialScope ?? globalScope
    if (scopeMode === 'filtered') return locationState?.scopeOptions?.filteredList ?? globalScope
    return globalScope
  }, [globalScope, locationState, scopeMode])

  const selectedScopeSummary = useMemo(
    () => summarizeScope(selectedScope, t),
    [selectedScope, t],
  )

  const handleConversationCreated = useCallback((id: string) => {
    void navigate(`/chat/${id}`, { replace: true })
    void globalMutate('/api/chat/conversations')
  }, [navigate])

  if (conversationId) {
    return (
      <div className="h-[calc(100dvh-var(--header-height))]">
        <ChatPanel
          key={conversationId}
          variant="full"
          conversationId={conversationId}
          scopeSummary={activeConversationSummary}
          onConversationCreated={handleConversationCreated}
        />
      </div>
    )
  }

  if (locationState?.initialScope) {
    const options = [
      { value: 'loaded' as const, label: t('chat.scope.loadedList') },
      { value: 'filtered' as const, label: t('chat.scope.filteredList') },
      { value: 'global' as const, label: t('chat.scope.global') },
    ]
    return (
      <div className="h-[calc(100dvh-var(--header-height))] flex flex-col">
        <div className="max-w-2xl mx-auto w-full px-4 py-4 space-y-3">
          <div className="rounded-xl border border-border bg-bg-card p-4">
            <p className="text-sm font-medium text-text mb-3">{t('chat.scope.choose')}</p>
            <RadioGroup name="chat-scope" options={options} value={scopeMode} onChange={setScopeMode} />
            {selectedScopeSummary?.detail && (
              <p className="text-xs text-muted mt-3">{selectedScopeSummary.detail}</p>
            )}
          </div>
        </div>
        <div className="flex-1 min-h-0">
          <ChatPanel
            key={JSON.stringify(selectedScope)}
            variant="full"
            scope={selectedScope}
            scopeSummary={selectedScopeSummary}
            onConversationCreated={handleConversationCreated}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-4">
      {conversations.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted select-none">
          <p className="text-sm">{t('chat.noConversations')}</p>
        </div>
      ) : (
        <div>
          {conversations.map(conv => {
            const dateText = dateMode === 'relative'
              ? formatRelativeDate(conv.updated_at, locale, { justNow: t('date.justNow') })
              : formatDate(conv.updated_at, locale)
            const hasArticle = !!conv.article_url
            const displaySummary = conv.scope_type === 'article'
              ? { label: t('chat.scope.article'), detail: conv.article_title ?? null }
              : conv.scope_type === 'global'
                ? { label: t('chat.scope.global'), detail: null }
                : conv.scope_summary ?? null

            return (
              <a
                key={conv.id}
                href={`/chat/${conv.id}`}
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey) return
                  e.preventDefault()
                  void navigate(`/chat/${conv.id}`)
                }}
                className="block w-full text-left border-b border-border py-3 px-4 md:px-6 transition-[background-color] duration-100 hover:bg-hover select-none no-underline text-inherit"
              >
                <div className="flex items-start gap-3">
                  <div className="min-w-0" style={{ width: 'calc(100% - 76px)' }}>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[15px] font-semibold text-text truncate">
                        {conv.title || extractText(conv.first_user_message) || t('chat.newChat')}
                      </span>
                      {conv.message_count > 0 && (
                        <span className="text-[11px] text-accent rounded-full px-1.5 leading-relaxed shrink-0" style={{ backgroundColor: 'color-mix(in srgb, var(--color-accent) 15%, transparent)' }}>
                          {conv.message_count}
                        </span>
                      )}
                    </div>

                    <p className="text-[13px] text-muted truncate mt-0.5">
                      {extractText(conv.first_assistant_preview) || <span className="italic">{t('chat.noResponse')}</span>}
                    </p>

                    <div className="flex items-center gap-1 text-[12px] text-muted mt-1">
                      <span className="whitespace-nowrap shrink-0">{dateText}</span>
                      {displaySummary?.label && (
                        <>
                          <span className="mx-0.5">·</span>
                          <span className="truncate">{displaySummary.label}</span>
                        </>
                      )}
                      {displaySummary?.detail && (
                        <>
                          <span className="mx-0.5">·</span>
                          <span className="truncate">{displaySummary.detail}</span>
                        </>
                      )}
                    </div>

                    {conv.article_title && conv.article_url && (
                      <div className="mt-1">
                        <Link
                          to={articleUrlToPath(conv.article_url)}
                          onClick={(e) => e.stopPropagation()}
                          className="text-[12px] text-muted hover:text-accent transition-colors truncate block"
                        >
                          {conv.article_title}
                        </Link>
                      </div>
                    )}
                  </div>

                  <div className="w-16 h-16 shrink-0 flex items-center justify-center">
                    {hasArticle ? (
                      <Thumbnail src={conv.article_og_image} articleUrl={conv.article_url} />
                    ) : (
                      <>
                        <img src="/icons/favicon-black.png" alt="" className="h-10 w-10 dark:hidden" />
                        <img src="/icons/favicon-white.png" alt="" className="h-10 w-10 hidden dark:block" />
                      </>
                    )}
                  </div>
                </div>
              </a>
            )
          })}
        </div>
      )}
    </div>
  )
}
