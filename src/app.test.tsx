import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { LocaleContext } from './lib/i18n'
import type { Category, FeedWithCounts } from '../shared/types'

let feedsData: { feeds: FeedWithCounts[]; bookmark_count: number; like_count: number; clip_feed_id: number | null } | undefined
let categoriesData: { categories: Category[] } | undefined

vi.mock('swr', async () => {
  const actual = await vi.importActual<typeof import('swr')>('swr')
  return {
    ...actual,
    default: (key: string) => {
      if (key === '/api/feeds') return { data: feedsData, mutate: vi.fn() }
      if (key === '/api/categories') return { data: categoriesData, mutate: vi.fn() }
      return { data: undefined, mutate: vi.fn() }
    },
  }
})

vi.mock('./components/layout/page-layout', () => ({
  PageLayout: ({ feedName, headerAction, children }: { feedName?: string; headerAction?: ReactNode; children: ReactNode }) => (
    <div>
      {feedName ? <div>{feedName}</div> : null}
      {headerAction}
      {children}
    </div>
  ),
}))

vi.mock('./components/article/article-list', () => ({
  ArticleList: () => <div>Article list</div>,
}))

vi.mock('./contexts/fetch-progress-context', () => ({
  FetchProgressProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useFetchProgressContext: () => ({
    progress: new Map(),
    startFeedFetch: vi.fn(() => Promise.resolve({ totalNew: 0 })),
  }),
}))

import { ArticleListPage } from './app'

function makeFeed(overrides: Partial<FeedWithCounts> = {}): FeedWithCounts {
  return {
    id: 1,
    name: 'Test Feed',
    url: 'https://example.com',
    icon_url: null,
    rss_url: null,
    rss_bridge_url: null,
    view_type: null,
    category_id: null,
    last_error: null,
    error_count: 0,
    disabled: 0,
    requires_js_challenge: 0,
    type: 'rss',
    etag: null,
    last_modified: null,
    last_content_hash: null,
    next_check_at: null,
    check_interval: null,
    created_at: '2026-01-01T00:00:00Z',
    category_name: null,
    article_count: 10,
    unread_count: 3,
    articles_per_week: 2,
    latest_published_at: '2026-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('ArticleListPage', () => {
  beforeEach(() => {
    feedsData = {
      feeds: [makeFeed()],
      bookmark_count: 0,
      like_count: 0,
      clip_feed_id: null,
    }
    categoriesData = { categories: [] }
  })

  function renderPage(initialPath: string) {
    return render(
      <MemoryRouter initialEntries={[initialPath]}>
        <LocaleContext.Provider value={{ locale: 'en', setLocale: vi.fn() }}>
          <Routes>
            <Route path="/feeds/:feedId" element={<ArticleListPage />} />
            <Route path="/categories/:categoryId" element={<ArticleListPage />} />
            <Route path="/inbox" element={<ArticleListPage />} />
          </Routes>
        </LocaleContext.Provider>
      </MemoryRouter>,
    )
  }

  it('shows the gear menu on a single feed page', () => {
    renderPage('/feeds/1')
    expect(screen.getByRole('button', { name: 'Feed menu' })).toBeTruthy()
  })

  it('does not show the gear menu on inbox or category pages', () => {
    const inbox = renderPage('/inbox')
    expect(screen.queryByRole('button', { name: 'Feed menu' })).toBeNull()
    inbox.unmount()

    renderPage('/categories/1')
    expect(screen.queryByRole('button', { name: 'Feed menu' })).toBeNull()
  })
})
