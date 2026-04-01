import { describe, it, expect, vi } from 'vitest'
import type { ReactNode } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LocaleContext } from '../../lib/i18n'
import { FeedContextMenu, FeedDropdownMenu } from './feed-context-menu'

function renderWithLocale(ui: ReactNode) {
  return render(
    <LocaleContext.Provider value={{ locale: 'en', setLocale: vi.fn() }}>
      {ui}
    </LocaleContext.Provider>,
  )
}

describe('Feed menus', () => {
  const props = {
    feedType: 'rss' as const,
    categories: [{ id: 1, name: 'AI' }],
    onRename: vi.fn(),
    onMarkAllRead: vi.fn(),
    onDelete: vi.fn(),
    onMoveToCategory: vi.fn(),
    currentViewType: null,
    onViewTypeChange: vi.fn(),
    onFetch: vi.fn(),
    onReDetect: vi.fn(),
    onConfigureNotifications: vi.fn(),
  }

  it('shows View as in the context menu', async () => {
    renderWithLocale(
      <FeedContextMenu {...props}>
        <button type="button">Trigger</button>
      </FeedContextMenu>,
    )

    fireEvent.contextMenu(screen.getByRole('button', { name: 'Trigger' }))

    expect(await screen.findByText('View as')).toBeTruthy()
  })

  it('shows View as with icon and radio options in the dropdown menu', async () => {
    renderWithLocale(
      <FeedDropdownMenu {...props}>
        <button type="button">Feed menu</button>
      </FeedDropdownMenu>,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Feed menu' }))

    const viewAs = await screen.findByText('View as')
    expect(viewAs.parentElement?.querySelector('svg')).toBeTruthy()

    await userEvent.click(viewAs)

    expect(await screen.findByText('Auto')).toBeTruthy()
    expect(screen.getByText('Article')).toBeTruthy()
    expect(screen.getByText('Social')).toBeTruthy()
  })
})
