import { useEffect, useState, type FormEvent } from 'react'
import { Input } from '../components/ui/input'
import { FormField } from '../components/ui/form-field'

interface InvitationPreview {
  email: string
  role: string
  expires_at: string
}

export function InviteAcceptPage({ token, onLogin }: { token: string; onLogin?: (token: string) => void }) {
  const [preview, setPreview] = useState<InvitationPreview | null>(null)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetch(`/api/auth/invitations/${token}`)
      .then(async res => {
        if (!res.ok) throw new Error('Invitation not found')
        return res.json()
      })
      .then(setPreview)
      .catch(() => setError('Invitation is invalid or expired.'))
  }, [token])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/auth/invitations/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Failed to accept invitation.')
        return
      }
      if (onLogin && data.token) {
        onLogin(data.token)
      } else {
        window.location.href = '/'
      }
    } catch {
      setError('Network error.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full max-w-sm rounded-2xl border border-border bg-bg shadow-lg p-8">
      <h1 className="mb-1.5 text-xl font-bold text-text select-none">Join workspace</h1>
      <p className="mb-6 text-sm text-muted select-none">
        {preview ? `${preview.email} invited as ${preview.role}.` : 'Loading invitation...'}
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <FormField label="Password" htmlFor="invite-password">
          <Input
            id="invite-password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={e => setPassword(e.target.value)}
          />
        </FormField>

        <FormField label="Confirm password" htmlFor="invite-confirm-password">
          <Input
            id="invite-confirm-password"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
          />
        </FormField>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <button
          type="submit"
          disabled={loading || !preview}
          className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-accent-text transition-opacity hover:opacity-80 disabled:opacity-50"
        >
          {loading ? 'Activating...' : 'Activate account'}
        </button>
      </form>
    </div>
  )
}
