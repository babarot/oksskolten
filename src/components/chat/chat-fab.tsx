import { useState, useEffect } from 'react'
import { MessagesSquare } from 'lucide-react'
import useSWR from 'swr'
import { ChatPanel } from './chat-panel'
import { fetcher } from '../../lib/fetcher'
import { buildArticleScope } from '../../lib/chat-scope'
import type { ScopeSummary } from '../../../shared/types'

interface ChatFabProps {
  articleId: number
  scopeSummary?: ScopeSummary | null
}

export function ChatFab({ articleId, scopeSummary }: ChatFabProps) {
  const [panelOpen, setPanelOpen] = useState(false)
  // Track whether panel has ever been opened — mount ChatPanel only after first open,
  // then keep it alive (hidden) so useChat state is preserved.
  const [mounted, setMounted] = useState(false)

  // Check for existing conversations to show badge & auto-open
  const { data: existingConv } = useSWR<{ conversations: { id: string }[] }>(
    `/api/chat/conversations?article_id=${articleId}`,
    fetcher,
    { revalidateOnFocus: false },
  )

  const hasConversations = !!existingConv?.conversations?.length

  // Auto-open panel if article already has conversations (desktop only)
  useEffect(() => {
    if (hasConversations && window.matchMedia('(min-width: 768px)').matches) {
      setPanelOpen(true)
      setMounted(true)
    }
  }, [hasConversations])

  // Close panel when viewport shrinks below md breakpoint
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)')
    const handler = (e: MediaQueryListEvent) => {
      if (!e.matches) setPanelOpen(false)
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  const handleToggle = () => {
    setPanelOpen(prev => !prev)
    if (!mounted) setMounted(true)
  }

  return (
    <>
      {/* Floating chat panel — only mount after first open, then use hidden to preserve state */}
      {mounted && (
        <div className={`fixed bottom-[calc(5rem+var(--safe-area-inset-bottom))] left-4 right-4 md:left-auto md:right-6 md:w-[380px] z-50 max-h-[500px] flex flex-col bg-bg-card rounded-xl border border-border shadow-lg ${panelOpen ? '' : 'hidden'}`}>
          <ChatPanel variant="inline" scope={buildArticleScope(articleId)} scopeSummary={scopeSummary} onClose={() => setPanelOpen(false)} />
        </div>
      )}

      {/* FAB button */}
      <button
        onClick={handleToggle}
        className="fixed bottom-[calc(1.5rem+var(--safe-area-inset-bottom))] right-6 z-50 w-12 h-12 rounded-full bg-accent text-accent-text flex items-center justify-center shadow-lg hover:opacity-90 transition-opacity select-none"
        aria-label="Chat"
      >
        <MessagesSquare className="w-5 h-5" />
        {/* Dot badge for existing conversations */}
        {hasConversations && !panelOpen && (
          <span className="absolute top-0 right-0 w-3 h-3 bg-error rounded-full border-2 border-bg" />
        )}
      </button>
    </>
  )
}
