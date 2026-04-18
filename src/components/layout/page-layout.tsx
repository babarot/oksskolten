import { useState, useRef, useEffect, type ReactNode } from 'react'
import { useAppLayout } from '../../app'
import { MD_BREAKPOINT } from '../../lib/breakpoints'
import { FeedList } from '../feed/feed-list'
import { Header } from './header'

interface PageLayoutProps {
  /** Header mode */
  mode?: 'list' | 'detail'
  /** Feed name shown in header center (list mode) */
  feedName?: string | null
  /** Back button handler (detail mode) */
  onBack?: () => void
  /** Title shown in detail mode header */
  detailTitle?: string | null
  /** Extra FeedList props */
  feedListProps?: {
    onMarkAllRead?: () => void
    onArticleMoved?: () => void
  }
  children: ReactNode
}

export function PageLayout({ mode = 'list', feedName, onBack, detailTitle, feedListProps, children }: PageLayoutProps) {
  const { sidebarOpen: drawerOpen, setSidebarOpen: setDrawerOpen } = useAppLayout()

  const [isScrolled, setIsScrolled] = useState(false)
  const sentinelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => setIsScrolled(!entry.isIntersecting),
      { threshold: 0 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <>
      <FeedList
        isOpen={drawerOpen}
        onClose={() => { if (window.innerWidth < MD_BREAKPOINT) setDrawerOpen(false) }}
        onBackdropClose={() => { if (window.innerWidth < MD_BREAKPOINT && history.state?.['drawer-open']) history.back(); else setDrawerOpen(false) }}
        onCollapse={() => setDrawerOpen(false)}
        {...feedListProps}
      />
      <div className={`transition-[margin] duration-200 ${drawerOpen ? 'md:ml-[var(--sidebar-width)]' : ''}`}>
        {mode === 'detail' ? (
          <Header mode="detail" onBack={onBack} detailTitle={detailTitle} isScrolled={isScrolled} sidebarOpen={drawerOpen} />
        ) : (
          <Header mode="list" onMenuClick={() => setDrawerOpen(true)} feedName={feedName} isScrolled={isScrolled} sidebarOpen={drawerOpen} />
        )}
        <div ref={sentinelRef} className="h-0" />
        {children}
      </div>
    </>
  )
}
