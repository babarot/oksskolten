import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { FeedMetricsBar } from './feed-metrics-bar'
import type { FeedWithCounts } from '../../../shared/types'

let swrData: { avg_content_length: number | null } | undefined

vi.mock('swr', () => ({
  default: () => ({ data: swrData }),
}))

vi.mock('../../lib/fetcher', () => ({
  fetcher: vi.fn(),
}))

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
    article_count: 42,
    unread_count: 5,
    articles_per_week: 3.5,
    latest_published_at: new Date().toISOString(),
    ...overrides,
  }
}

describe('FeedMetricsBar', () => {
  beforeEach(() => {
    swrData = undefined
  })

  it('renders article count', () => {
    const { container } = render(<FeedMetricsBar feed={makeFeed()} />)
    expect(container.textContent).toContain('42')
  })

  it('renders articles per week', () => {
    const { container } = render(<FeedMetricsBar feed={makeFeed({ articles_per_week: 3.5 })} />)
    expect(container.textContent).toContain('3.5')
  })

  it('renders integer per-week without decimal', () => {
    const { container } = render(<FeedMetricsBar feed={makeFeed({ articles_per_week: 7 })} />)
    expect(container.textContent).toContain('7')
    expect(container.textContent).not.toContain('7.0')
  })

  it('does not render per-week when zero', () => {
    const { container } = render(<FeedMetricsBar feed={makeFeed({ articles_per_week: 0 })} />)
    // Should only show article count and last updated, no per-week
    expect(container.textContent).not.toContain('/w')
  })

  it('renders last updated date', () => {
    const { container } = render(<FeedMetricsBar feed={makeFeed()} />)
    expect(container.textContent).toContain('today')
  })

  it('shows inactive badge for old feeds', () => {
    const oldDate = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString()
    const { container } = render(<FeedMetricsBar feed={makeFeed({ latest_published_at: oldDate })} />)
    expect(container.textContent).toContain('inactive')
  })

  it('does not show inactive badge for recent feeds', () => {
    const { container } = render(<FeedMetricsBar feed={makeFeed()} />)
    expect(container.textContent).not.toContain('inactive')
  })

  it('shows avg content length from SWR data', () => {
    swrData = { avg_content_length: 2500 }
    const { container } = render(<FeedMetricsBar feed={makeFeed()} />)
    expect(container.textContent).toContain('2.5k')
  })

  it('formats small avg content length without k suffix', () => {
    swrData = { avg_content_length: 500 }
    const { container } = render(<FeedMetricsBar feed={makeFeed()} />)
    expect(container.textContent).toContain('500')
    expect(container.textContent).not.toContain('0.5k')
  })
})
