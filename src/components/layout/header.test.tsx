import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Header } from './header'

describe('Header', () => {
  it('renders menu button in list mode', () => {
    render(<Header mode="list" />)
    expect(screen.getByLabelText('Menu')).toBeTruthy()
  })

  it('renders back button in detail mode', () => {
    render(<Header mode="detail" />)
    expect(screen.getByLabelText('Back')).toBeTruthy()
  })

  it('shows feed name in list mode', () => {
    render(<Header mode="list" feedName="Tech News" />)
    expect(screen.getByText('Tech News')).toBeTruthy()
  })

  it('renders header action next to feed name in list mode', () => {
    render(<Header mode="list" feedName="Tech News" headerAction={<button type="button">Feed menu</button>} />)
    expect(screen.getByText('Tech News')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Feed menu' })).toBeTruthy()
  })

  it('does not show feed name when not provided', () => {
    render(<Header mode="list" />)
    expect(screen.queryByText('Tech News')).toBeNull()
  })

  it('calls onMenuClick when menu button is clicked', async () => {
    const onMenuClick = vi.fn()
    render(<Header mode="list" onMenuClick={onMenuClick} />)
    await userEvent.click(screen.getByLabelText('Menu'))
    expect(onMenuClick).toHaveBeenCalledOnce()
  })

  it('calls onBack when back button is clicked', async () => {
    const onBack = vi.fn()
    render(<Header mode="detail" onBack={onBack} />)
    await userEvent.click(screen.getByLabelText('Back'))
    expect(onBack).toHaveBeenCalledOnce()
  })

  it('applies scrolled border style', () => {
    render(<Header mode="list" isScrolled />)
    const header = document.querySelector('[data-header]')!
    expect(header.className).toContain('border-border')
  })

  it('applies transparent border when not scrolled', () => {
    render(<Header mode="list" isScrolled={false} />)
    const header = document.querySelector('[data-header]')!
    expect(header.className).toContain('border-transparent')
  })
})
