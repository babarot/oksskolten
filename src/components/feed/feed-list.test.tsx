import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Route, Routes, Outlet } from 'react-router-dom'
import { SWRConfig } from 'swr'
import { LocaleContext } from '../../lib/i18n'
import { TooltipProvider } from '../ui/tooltip'
import type { FeedWithCounts, Category } from '../../../shared/types'

// --- Mocks ---
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

vi.mock('../../lib/fetcher', () => ({
  fetcher: vi.fn(),
  apiPost: vi.fn(() => Promise.resolve()),
  apiPatch: vi.fn(() => Promise.resolve()),
  apiDelete: vi.fn(() => Promise.resolve()),
}))

vi.mock('../../contexts/fetch-progress-context', () => ({
  useFetchProgressContext: () => ({
    progress: new Map(),
    startFeedFetch: vi.fn(() => Promise.resolve({ totalNew: 0 })),
    subscribeFeedFetch: vi.fn(),
  }),
}))


vi.mock('./feed-modal', () => ({
  FeedModal: () => null,
}))

vi.mock('../ui/ConfirmDialog', () => ({
  ConfirmDialog: ({ title }: any) => (
    <div data-testid="confirm-dialog">{title}</div>
  ),
}))

vi.mock('../ui/ContextMenu', () => ({
  ContextMenu: () => <div data-testid="context-menu" />,
}))

vi.mock('../layout/sidebar-menu', () => ({
  SidebarMenu: () => <div data-testid="sidebar-menu" />,
}))

import { FeedList } from './feed-list'

function makeFeed(overrides: Partial<FeedWithCounts> = {}): FeedWithCounts {
  return {
    id: 1,
    name: 'Test Feed',
    url: 'https://example.com',
    icon_url: null,
    rss_url: null,
    rss_bridge_url: null,
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
    created_at: '2024-01-01',
    category_name: null,
    article_count: 10,
    unread_count: 3,
    articles_per_week: 2,
    latest_published_at: '2026-03-01T00:00:00Z',
    ...overrides,
  }
}

function makeCategory(overrides: Partial<Category> = {}): Category {
  return {
    id: 1,
    name: 'Tech',
    sort_order: 0,
    collapsed: 0,
    created_at: '2024-01-01',
    ...overrides,
  }
}

const mockSettings = {
  colorMode: 'system' as const,
  setColorMode: vi.fn(),
  themeName: 'default',
  setTheme: vi.fn(),
  themes: [{ name: 'default', label: 'Default' }],
  dateMode: 'relative' as const,
  setDateMode: vi.fn(),
  autoMarkRead: 'off' as const,
  setAutoMarkRead: vi.fn(),
  showUnreadIndicator: 'on' as const,
  setShowUnreadIndicator: vi.fn(),
  indicatorStyle: 'dot' as const,
  internalLinks: 'on' as const,
  setInternalLinks: vi.fn(),
  showThumbnails: 'on' as const,
  setShowThumbnails: vi.fn(),
  showFeedActivity: 'on' as 'on' | 'off',
  setShowFeedActivity: vi.fn(),
  highlightTheme: 'github-dark' as const,
  setHighlightTheme: vi.fn(),
  articleFont: 'sans' as const,
  setArticleFont: vi.fn(),
  save: vi.fn(),
}

const defaultProps = {
  isOpen: true,
  onClose: vi.fn(),
  onCollapse: vi.fn(),
}

// Wrap FeedList with OutletContext to provide useAppLayout
function OutletWrapper() {
  return <Outlet context={{ settings: mockSettings, sidebarOpen: true, setSidebarOpen: vi.fn() }} />
}

function renderFeedList(
  props: Partial<typeof defaultProps> = {},
  feedsData?: { feeds: FeedWithCounts[]; bookmark_count: number; like_count: number; clip_feed_id: number | null },
  categoriesData?: { categories: Category[] },
  initialPath = '/inbox',
) {
  const swrFallback: Record<string, unknown> = {}
  if (feedsData) swrFallback['/api/feeds'] = feedsData
  if (categoriesData) swrFallback['/api/categories'] = categoriesData

  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <LocaleContext.Provider value={{ locale: 'en', setLocale: vi.fn() }}>
        <TooltipProvider>
          <SWRConfig value={{ provider: () => new Map(), fallback: swrFallback }}>
            <Routes>
              <Route element={<OutletWrapper />}>
                <Route path="/feeds/:feedId" element={<FeedList {...defaultProps} {...props} />} />
                <Route path="/categories/:categoryId" element={<FeedList {...defaultProps} {...props} />} />
                <Route path="*" element={<FeedList {...defaultProps} {...props} />} />
              </Route>
            </Routes>
          </SWRConfig>
        </TooltipProvider>
      </LocaleContext.Provider>
    </MemoryRouter>,
  )
}

describe('FeedList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders nav items: Inbox, Read Later, Liked, Read', () => {
    renderFeedList(
      {},
      { feeds: [], bookmark_count: 0, like_count: 0, clip_feed_id: null },
      { categories: [] },
    )
    expect(screen.getByText('Inbox')).toBeTruthy()
    expect(screen.getByText('Read Later')).toBeTruthy()
    expect(screen.getByText('Liked')).toBeTruthy()
    expect(screen.getByText('Read')).toBeTruthy()
  })

  it('shows total unread badge on Inbox', () => {
    const feeds = [
      makeFeed({ id: 1, unread_count: 5 }),
      makeFeed({ id: 2, unread_count: 3 }),
    ]
    renderFeedList(
      {},
      { feeds, bookmark_count: 0, like_count: 0, clip_feed_id: null },
      { categories: [] },
    )
    // Total unread = 8
    expect(screen.getByText('8')).toBeTruthy()
  })

  it('renders uncategorized feeds', () => {
    const feeds = [
      makeFeed({ id: 1, name: 'My Blog', category_id: null }),
      makeFeed({ id: 2, name: 'News Site', category_id: null }),
    ]
    renderFeedList(
      {},
      { feeds, bookmark_count: 0, like_count: 0, clip_feed_id: null },
      { categories: [] },
    )
    expect(screen.getByText('My Blog')).toBeTruthy()
    expect(screen.getByText('News Site')).toBeTruthy()
  })

  it('renders feeds grouped under categories', () => {
    const cat = makeCategory({ id: 10, name: 'Tech' })
    const feeds = [
      makeFeed({ id: 1, name: 'Go Blog', category_id: 10 }),
      makeFeed({ id: 2, name: 'Rust Blog', category_id: 10 }),
      makeFeed({ id: 3, name: 'Uncategorized Feed', category_id: null }),
    ]
    renderFeedList(
      {},
      { feeds, bookmark_count: 0, like_count: 0, clip_feed_id: null },
      { categories: [cat] },
    )
    expect(screen.getByText('Tech')).toBeTruthy()
    expect(screen.getByText('Go Blog')).toBeTruthy()
    expect(screen.getByText('Rust Blog')).toBeTruthy()
    expect(screen.getByText('Uncategorized Feed')).toBeTruthy()
  })

  it('hides category feeds when collapsed', () => {
    const cat = makeCategory({ id: 10, name: 'Collapsed Cat', collapsed: 1 })
    const feeds = [
      makeFeed({ id: 1, name: 'Hidden Feed', category_id: 10 }),
    ]
    renderFeedList(
      {},
      { feeds, bookmark_count: 0, like_count: 0, clip_feed_id: null },
      { categories: [cat] },
    )
    expect(screen.getByText('Collapsed Cat')).toBeTruthy()
    expect(screen.queryByText('Hidden Feed')).toBeNull()
  })

  it('shows unread badge on individual feeds', () => {
    const feeds = [makeFeed({ id: 1, name: 'Feed A', unread_count: 7, category_id: null })]
    renderFeedList(
      {},
      { feeds, bookmark_count: 0, like_count: 0, clip_feed_id: null },
      { categories: [] },
    )
    // 7 appears twice: once on Inbox (total), once on Feed A
    const badges = screen.getAllByText('7')
    expect(badges.length).toBe(2)
  })

  it('shows disabled feed with warning prefix and muted style', () => {
    const feeds = [makeFeed({ id: 1, name: 'Broken Feed', disabled: 1, unread_count: 0, category_id: null })]
    renderFeedList(
      {},
      { feeds, bookmark_count: 0, like_count: 0, clip_feed_id: null },
      { categories: [] },
    )
    // The ⚠ prefix and name are rendered in the same <span>, so use a text matcher
    const feedBtn = screen.getByText((_content, element) =>
      element?.tagName === 'BUTTON' && !!element.textContent?.includes('Broken Feed'),
    )
    expect(feedBtn.textContent).toContain('⚠')
    expect(feedBtn.className).toContain('text-muted')
  })

  it('highlights selected feed', () => {
    const feeds = [makeFeed({ id: 5, name: 'Selected Feed', category_id: null })]
    renderFeedList(
      {},
      { feeds, bookmark_count: 0, like_count: 0, clip_feed_id: null },
      { categories: [] },
      '/feeds/5',
    )
    const feedBtn = screen.getByText('Selected Feed').closest('button')!
    expect(feedBtn.className).toContain('text-accent')
  })

  it('navigates to inbox on Inbox click', () => {
    renderFeedList(
      {},
      { feeds: [], bookmark_count: 0, like_count: 0, clip_feed_id: null },
      { categories: [] },
    )
    const inboxButtons = screen.getAllByText('Inbox')
    // Click the nav button (not the header title)
    fireEvent.click(inboxButtons[0])
    expect(mockNavigate).toHaveBeenCalledWith('/inbox')
  })

  it('navigates to feed on feed click', () => {
    const feeds = [makeFeed({ id: 42, name: 'Clickable Feed', category_id: null })]
    renderFeedList(
      {},
      { feeds, bookmark_count: 0, like_count: 0, clip_feed_id: null },
      { categories: [] },
    )
    fireEvent.click(screen.getByText('Clickable Feed'))
    expect(mockNavigate).toHaveBeenCalledWith('/feeds/42')
  })

  it('prefers feed icon_url over favicon fallback', () => {
    const feeds = [makeFeed({ id: 42, name: 'Custom Icon Feed', icon_url: 'https://cdn.example.com/icon.png', category_id: null })]
    const { container } = renderFeedList(
      {},
      { feeds, bookmark_count: 0, like_count: 0, clip_feed_id: null },
      { categories: [] },
    )

    const icon = container.querySelector('img[src="https://cdn.example.com/icon.png"]')
    expect(icon).toBeTruthy()
  })

  it('falls back to Google favicon when icon_url is absent', () => {
    const feeds = [makeFeed({ id: 43, name: 'Fallback Icon Feed', icon_url: null, url: 'https://example.com/blog', category_id: null })]
    const { container } = renderFeedList(
      {},
      { feeds, bookmark_count: 0, like_count: 0, clip_feed_id: null },
      { categories: [] },
    )

    const icon = container.querySelector('img[src*="google.com/s2/favicons"]')
    expect(icon).toBeTruthy()
    expect(icon?.getAttribute('src')).toContain('domain=example.com')
  })

  it('shows bookmark count badge', () => {
    renderFeedList(
      {},
      { feeds: [], bookmark_count: 12, like_count: 0, clip_feed_id: null },
      { categories: [] },
    )
    expect(screen.getByText('12')).toBeTruthy()
  })

  it('shows like count badge', () => {
    renderFeedList(
      {},
      { feeds: [], bookmark_count: 0, like_count: 4, clip_feed_id: null },
      { categories: [] },
    )
    expect(screen.getByText('4')).toBeTruthy()
  })

  it('shows clips entry when clip_feed_id is set', () => {
    renderFeedList(
      {},
      { feeds: [makeFeed({ id: 99, type: 'clip' })], bookmark_count: 0, like_count: 0, clip_feed_id: 99 },
      { categories: [] },
    )
    expect(screen.getByText('Clips')).toBeTruthy()
  })

  it('does not show clips nav entry when clip_feed_id is null', () => {
    renderFeedList(
      {},
      { feeds: [], bookmark_count: 0, like_count: 0, clip_feed_id: null },
      { categories: [] },
    )
    // "Clips" only appears as a nav item when clip_feed_id is set
    // Note: the i18n key 'feeds.clips' translates to 'Clips' in English
    expect(screen.queryByText('Clips')).toBeNull()
  })

  it('shows category unread badge (sum of child feeds)', () => {
    const cat = makeCategory({ id: 10, name: 'Dev' })
    const feeds = [
      makeFeed({ id: 1, unread_count: 2, category_id: 10 }),
      makeFeed({ id: 2, unread_count: 3, category_id: 10 }),
    ]
    renderFeedList(
      {},
      { feeds, bookmark_count: 0, like_count: 0, clip_feed_id: null },
      { categories: [cat] },
    )
    // Category badge shows sum = 5, Inbox badge also shows 5
    const fives = screen.getAllByText('5')
    expect(fives.length).toBeGreaterThanOrEqual(2)
  })

  it('navigates to category on category name click', () => {
    const cat = makeCategory({ id: 10, name: 'Tech' })
    const feeds = [makeFeed({ id: 1, name: 'Go Blog', category_id: 10 })]
    renderFeedList(
      {},
      { feeds, bookmark_count: 0, like_count: 0, clip_feed_id: null },
      { categories: [cat] },
    )
    fireEvent.click(screen.getByText('Tech'))
    expect(mockNavigate).toHaveBeenCalledWith('/categories/10')
  })

  it('shows inactive badge when feed latest_published_at is > 90 days ago and showFeedActivity is on', () => {
    const feeds = [
      makeFeed({ id: 1, name: 'Old Feed', latest_published_at: '2024-01-01T00:00:00Z', article_count: 10, category_id: null }),
    ]
    renderFeedList(
      {},
      { feeds, bookmark_count: 0, like_count: 0, clip_feed_id: null },
      { categories: [] },
    )
    expect(screen.getByText('inactive')).toBeTruthy()
  })

  it('hides inactive badge when showFeedActivity setting is off', () => {
    const originalValue = mockSettings.showFeedActivity
    mockSettings.showFeedActivity = 'off'
    const feeds = [
      makeFeed({ id: 1, name: 'Old Feed', latest_published_at: '2024-01-01T00:00:00Z', article_count: 10, category_id: null }),
    ]
    renderFeedList(
      {},
      { feeds, bookmark_count: 0, like_count: 0, clip_feed_id: null },
      { categories: [] },
    )
    expect(screen.queryByText('inactive')).toBeNull()
    mockSettings.showFeedActivity = originalValue
  })

  it('excludes disabled feeds from total unread count', () => {
    const feeds = [
      makeFeed({ id: 1, name: 'Disabled Feed', disabled: 1, unread_count: 10, category_id: null }),
      makeFeed({ id: 2, name: 'Normal Feed', disabled: 0, unread_count: 5, category_id: null }),
    ]
    renderFeedList(
      {},
      { feeds, bookmark_count: 0, like_count: 0, clip_feed_id: null },
      { categories: [] },
    )
    // Inbox badge should show 5 (only the normal feed), not 15
    const inboxButton = screen.getByText('Inbox').closest('button')!
    expect(inboxButton.textContent).toContain('5')
    expect(inboxButton.textContent).not.toContain('15')
  })

  it('navigates to history on Read click', () => {
    renderFeedList(
      {},
      { feeds: [], bookmark_count: 0, like_count: 0, clip_feed_id: null },
      { categories: [] },
    )
    fireEvent.click(screen.getByText('Read'))
    expect(mockNavigate).toHaveBeenCalledWith('/history')
  })

  it('navigates to bookmarks on Read Later click', () => {
    renderFeedList(
      {},
      { feeds: [], bookmark_count: 0, like_count: 0, clip_feed_id: null },
      { categories: [] },
    )
    fireEvent.click(screen.getByText('Read Later'))
    expect(mockNavigate).toHaveBeenCalledWith('/bookmarks')
  })

  it('navigates to likes on Liked click', () => {
    renderFeedList(
      {},
      { feeds: [], bookmark_count: 0, like_count: 0, clip_feed_id: null },
      { categories: [] },
    )
    fireEvent.click(screen.getByText('Liked'))
    expect(mockNavigate).toHaveBeenCalledWith('/likes')
  })

  it('highlights selected category with text-accent class', () => {
    const cat = makeCategory({ id: 10, name: 'Selected Cat' })
    const feeds = [makeFeed({ id: 1, name: 'Cat Feed', category_id: 10 })]
    renderFeedList(
      {},
      { feeds, bookmark_count: 0, like_count: 0, clip_feed_id: null },
      { categories: [cat] },
      '/categories/10',
    )
    const catButton = screen.getByText('Selected Cat').closest('button')!
    expect(catButton.className).toContain('text-accent')
  })

  it('shows unread badge on clip feed nav entry', () => {
    const feeds = [makeFeed({ id: 99, name: 'Clip Feed', type: 'clip', unread_count: 3 })]
    renderFeedList(
      {},
      { feeds, bookmark_count: 0, like_count: 0, clip_feed_id: 99 },
      { categories: [] },
    )
    expect(screen.getByText('Clips')).toBeTruthy()
    // The clip feed unread badge should show 3
    const clipsButton = screen.getByText('Clips').closest('button')!
    expect(clipsButton.textContent).toContain('3')
  })
})
