import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { LocaleContext } from '../../lib/i18n'

const mockMutate = vi.fn()
let swrData: any = { enabled: false, username: '', configured: false }

vi.mock('swr', () => ({
  default: () => ({
    data: swrData,
    error: undefined,
    isLoading: false,
    mutate: mockMutate,
  }),
}))

const mockApiPatch = vi.fn()

vi.mock('../../lib/fetcher', () => ({
  fetcher: vi.fn(),
  apiPatch: (...args: unknown[]) => mockApiPatch(...args),
}))

import { FeverSettings } from './fever-settings'

function renderComponent() {
  return render(
    <LocaleContext.Provider value={{ locale: 'en', setLocale: () => {} }}>
      <FeverSettings />
    </LocaleContext.Provider>,
  )
}

describe('FeverSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    swrData = { enabled: false, username: '', configured: false }
  })

  it('renders the Fever API settings state', () => {
    renderComponent()
    expect(screen.getByText('Fever API')).toBeTruthy()
    expect(screen.getAllByText('Disabled').length).toBeGreaterThan(0)
    expect(screen.getByText('Endpoint')).toBeTruthy()
    expect(screen.getByText('http://localhost/api/fever')).toBeTruthy()
  })

  it('saves credentials and enables the API', async () => {
    mockApiPatch.mockResolvedValue({ enabled: true, username: 'admin', configured: true })
    renderComponent()

    fireEvent.click(screen.getByRole('switch'))
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'admin' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret' } })
    fireEvent.click(screen.getByText('Save changes'))

    await waitFor(() => {
      expect(mockApiPatch).toHaveBeenCalledWith('/api/settings/fever', {
        enabled: true,
        username: 'admin',
        password: 'secret',
      })
    })
  })
})
