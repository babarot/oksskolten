import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FeedModal } from './feed-modal'

// --- Mocks ---
const mockNavigate = vi.fn()
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}))

vi.mock('../../lib/fetcher', () => ({
  apiPost: vi.fn().mockResolvedValue(undefined),
  ApiError: class ApiError extends Error {
    status: number
    data: Record<string, unknown>
    constructor(message: string, status: number, data: Record<string, unknown> = {}) {
      super(message)
      this.status = status
      this.data = data
    }
  },
  authHeaders: () => ({}),
}))

vi.mock('../../lib/auth', () => ({
  getAuthToken: vi.fn(() => 'test-token'),
  logoutClient: vi.fn(),
}))

vi.mock('../../lib/url', () => ({
  articleUrlToPath: (url: string) => `/articles/${encodeURIComponent(url)}`,
}))

import { apiPost, ApiError } from '../../lib/fetcher'
import { logoutClient } from '../../lib/auth'

describe('FeedModal', () => {
  const defaultProps = {
    onClose: vi.fn(),
    onCreated: vi.fn(),
  }

  // Radix Dialog sets pointer-events:none on body in jsdom
  const user = userEvent.setup({ pointerEventsCheck: 0 })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders step selection screen', () => {
    render(<FeedModal {...defaultProps} />)
    expect(screen.getByText('Get Started')).toBeTruthy()
    expect(screen.getByText('Add an RSS feed from a URL')).toBeTruthy()
    expect(screen.getByText('Clip an article from a URL')).toBeTruthy()
    expect(screen.getByText('Create a folder to organize feeds')).toBeTruthy()
  })

  it('navigates to feed step on click', async () => {
    render(<FeedModal {...defaultProps} />)
    await user.click(screen.getByText('Add an RSS feed from a URL'))
    expect(screen.getByText('Add Feed')).toBeTruthy()
    expect(screen.getByPlaceholderText('URL')).toBeTruthy()
  })

  it('navigates to folder step on click', async () => {
    render(<FeedModal {...defaultProps} />)
    await user.click(screen.getByText('Create a folder to organize feeds'))
    expect(screen.getByText('Add Folder')).toBeTruthy()
  })

  it('navigates to article clip step on click', async () => {
    render(<FeedModal {...defaultProps} />)
    await user.click(screen.getByText('Clip an article from a URL'))
    expect(screen.getByText('Clip Article')).toBeTruthy()
  })

  it('back button returns to select step', async () => {
    render(<FeedModal {...defaultProps} />)
    await user.click(screen.getByText('Add an RSS feed from a URL'))
    // Back button is the sibling before h2 within the flex container
    const heading = screen.getByText('Add Feed')
    const backButton = heading.closest('.flex')!.querySelector('button') as HTMLElement
    await user.click(backButton)
    expect(screen.getByText('Get Started')).toBeTruthy()
  })

  it('calls onClose when X button is clicked on select step', async () => {
    const onClose = vi.fn()
    render(<FeedModal {...defaultProps} onClose={onClose} />)
    const headerRow = document.querySelector('.flex.items-center.justify-between')!
    const closeButton = headerRow.querySelector('button')!
    await user.click(closeButton)
    expect(onClose).toHaveBeenCalled()
  })

  it('submits folder creation', async () => {
    const onClose = vi.fn()
    const onCategoryCreated = vi.fn()
    render(<FeedModal {...defaultProps} onClose={onClose} onCategoryCreated={onCategoryCreated} />)

    await user.click(screen.getByText('Create a folder to organize feeds'))

    const input = screen.getByRole('textbox')
    await user.type(input, 'New Folder')
    await user.click(screen.getByText('Create'))

    await waitFor(() => {
      expect(apiPost).toHaveBeenCalledWith('/api/categories', { name: 'New Folder' })
    })
    expect(onCategoryCreated).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it('shows error on folder creation failure', async () => {
    vi.mocked(apiPost).mockRejectedValueOnce(new Error('Already exists'))
    render(<FeedModal {...defaultProps} />)

    await user.click(screen.getByText('Create a folder to organize feeds'))
    const input = screen.getByRole('textbox')
    await user.type(input, 'Dupe')
    await user.click(screen.getByText('Create'))

    await waitFor(() => {
      expect(screen.getByText('Already exists')).toBeTruthy()
    })
  })

  it('renders category select when categories provided', async () => {
    const categories = [
      { id: 1, name: 'Tech', sort_order: 0, collapsed: 0, created_at: '2024-01-01' },
      { id: 2, name: 'News', sort_order: 1, collapsed: 0, created_at: '2024-01-01' },
    ]
    render(<FeedModal {...defaultProps} categories={categories} />)

    await user.click(screen.getByText('Add an RSS feed from a URL'))
    expect(screen.getByText('Tech')).toBeTruthy()
    expect(screen.getByText('News')).toBeTruthy()
  })

  it('submits article clip', async () => {
    const onClose = vi.fn()
    const onCreated = vi.fn()
    const onArticleCreated = vi.fn()
    render(<FeedModal onClose={onClose} onCreated={onCreated} onArticleCreated={onArticleCreated} />)

    await user.click(screen.getByText('Clip an article from a URL'))
    const input = screen.getByRole('textbox')
    await user.type(input, 'https://example.com/article')
    await user.click(screen.getByText('Add'))

    await waitFor(() => {
      expect(apiPost).toHaveBeenCalledWith('/api/articles/from-url', { url: 'https://example.com/article', force: false })
    })
    expect(onArticleCreated).toHaveBeenCalled()
    expect(onCreated).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it('calls onClose when cancel button is clicked in feed step', async () => {
    const onClose = vi.fn()
    render(<FeedModal {...defaultProps} onClose={onClose} />)

    await user.click(screen.getByText('Add an RSS feed from a URL'))
    await user.click(screen.getByText('Cancel'))
    expect(onClose).toHaveBeenCalled()
  })

  // --- Helper for SSE tests ---
  function createSSEResponse(events: string[], status = 200) {
    const sseText = events.join('\n') + '\n'
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(sseText))
        controller.close()
      },
    })
    return new Response(stream, {
      status,
      headers: { 'Content-Type': 'text/event-stream' },
    })
  }

  it('SSE feed submission flow — step events and done', async () => {
    const onCreated = vi.fn()
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      createSSEResponse([
        'data: {"type":"step","step":"rss-discovery","status":"running"}',
        'data: {"type":"step","step":"rss-discovery","status":"done","found":true}',
        'data: {"type":"done","feed":{"id":1,"rss_url":"https://example.com/rss","rss_bridge_url":null}}',
      ]),
    )

    render(<FeedModal {...defaultProps} onCreated={onCreated} />)
    await user.click(screen.getByText('Add an RSS feed from a URL'))

    const input = screen.getByPlaceholderText('URL')
    await user.type(input, 'https://example.com')
    await user.click(screen.getByText('Add'))

    await waitFor(() => {
      expect(onCreated).toHaveBeenCalled()
    })

    // Step indicator should show "Feed created"
    expect(screen.getByText('Feed created')).toBeTruthy()
    // "RSS discovery" step label should appear
    expect(screen.getByText('RSS discovery')).toBeTruthy()

    fetchSpy.mockRestore()
  })

  it('SSE error event shows error message', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      createSSEResponse([
        'data: {"type":"step","step":"rss-discovery","status":"running"}',
        'data: {"type":"error","error":"Feed URL is unreachable"}',
      ]),
    )

    render(<FeedModal {...defaultProps} />)
    await user.click(screen.getByText('Add an RSS feed from a URL'))

    const input = screen.getByPlaceholderText('URL')
    await user.type(input, 'https://example.com')
    await user.click(screen.getByText('Add'))

    await waitFor(() => {
      expect(screen.getByText('Feed URL is unreachable')).toBeTruthy()
    })

    fetchSpy.mockRestore()
  })

  it('non-SSE error response (400) shows error', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Invalid URL' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    render(<FeedModal {...defaultProps} />)
    await user.click(screen.getByText('Add an RSS feed from a URL'))

    const input = screen.getByPlaceholderText('URL')
    await user.type(input, 'https://bad-url')
    await user.click(screen.getByText('Add'))

    await waitFor(() => {
      expect(screen.getByText('Invalid URL')).toBeTruthy()
    })

    fetchSpy.mockRestore()
  })

  it('non-JSON gateway error shows HTTP status', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response('Bad Gateway', {
        status: 502,
        headers: { 'Content-Type': 'text/plain' },
      }),
    )

    render(<FeedModal {...defaultProps} />)
    await user.click(screen.getByText('Add an RSS feed from a URL'))

    const input = screen.getByPlaceholderText('URL')
    await user.type(input, 'https://example.com')
    await user.click(screen.getByText('Add'))

    await waitFor(() => {
      expect(screen.getByText('HTTP 502')).toBeTruthy()
    })

    fetchSpy.mockRestore()
  })

  it('401 response triggers logoutClient', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(null, { status: 401 }),
    )

    render(<FeedModal {...defaultProps} />)
    await user.click(screen.getByText('Add an RSS feed from a URL'))

    const input = screen.getByPlaceholderText('URL')
    await user.type(input, 'https://example.com')
    await user.click(screen.getByText('Add'))

    await waitFor(() => {
      expect(logoutClient).toHaveBeenCalled()
    })

    fetchSpy.mockRestore()
  })

  it('article conflict (409 with can_force) shows conflict UI with feed name', async () => {
    const conflictError = new ApiError('Conflict', 409, {
      can_force: true,
      article: { id: 1, url: 'https://example.com/article', feed_id: 1, feed_name: 'My Feed' },
    })
    vi.mocked(apiPost).mockRejectedValueOnce(conflictError)

    render(<FeedModal {...defaultProps} />)
    await user.click(screen.getByText('Clip an article from a URL'))

    const input = screen.getByPlaceholderText('Enter article URL')
    await user.type(input, 'https://example.com/article')
    await user.click(screen.getByText('Add'))

    await waitFor(() => {
      expect(screen.getByText('My Feed')).toBeTruthy()
    })
    // The conflict UI should show the feed name as a link
    const feedLink = screen.getByText('My Feed')
    expect(feedLink.tagName).toBe('A')
    expect(feedLink.getAttribute('href')).toBe('/feeds/1')
  })

  it('article conflict (409 without can_force) shows info-style message', async () => {
    const conflictError = new ApiError('Conflict', 409, {
      can_force: false,
    })
    vi.mocked(apiPost).mockRejectedValueOnce(conflictError)

    render(<FeedModal {...defaultProps} />)
    await user.click(screen.getByText('Clip an article from a URL'))

    const input = screen.getByPlaceholderText('Enter article URL')
    await user.type(input, 'https://example.com/article')
    await user.click(screen.getByText('Add'))

    await waitFor(() => {
      expect(screen.getByText('This article is already saved in Clips')).toBeTruthy()
    })
    // Should be info-style (text-muted), not error-style
    const msg = screen.getByText('This article is already saved in Clips')
    expect(msg.className).toContain('text-muted')
  })

  it('loading state shows step indicator and hides form', async () => {
    // Use a fetch that never resolves to keep loading/adding state active
    const fetchSpy = vi.spyOn(global, 'fetch').mockReturnValueOnce(new Promise(() => {}))

    render(<FeedModal {...defaultProps} />)
    await user.click(screen.getByText('Add an RSS feed from a URL'))

    const input = screen.getByPlaceholderText('URL')
    await user.type(input, 'https://example.com')
    await user.click(screen.getByText('Add'))

    await waitFor(() => {
      // Step indicator should appear (form is replaced by step progress)
      expect(screen.getByText('RSS discovery')).toBeTruthy()
    })
    // The submit button should no longer be present since the form is replaced
    expect(screen.queryByText('Add')).toBeNull()

    fetchSpy.mockRestore()
  })

  it('empty URL does not submit', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch')

    render(<FeedModal {...defaultProps} />)
    await user.click(screen.getByText('Add an RSS feed from a URL'))

    // Do not type anything into the URL input
    // The input has required attribute, so form submission is blocked by browser validation.
    // In test env, we call handleFeedSubmit which checks `if (!url.trim()) return`
    const submitButton = screen.getByText('Add')
    await user.click(submitButton)

    // fetch should not have been called for feed submission
    // (it may have been called for title discovery, so check specifically for POST)
    const postCalls = fetchSpy.mock.calls.filter(
      (call) => call[1] && typeof call[1] === 'object' && (call[1] as RequestInit).method === 'POST',
    )
    expect(postCalls).toHaveLength(0)

    fetchSpy.mockRestore()
  })
})
