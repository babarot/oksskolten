import { useState } from 'react'
import useSWR from 'swr'
import { apiPatch, apiPost, fetcher } from '../../lib/fetcher'
import { Input } from '../../components/ui/input'

interface MemberRecord {
  id: number
  email: string
  role: 'owner' | 'admin' | 'member'
  status: 'active' | 'invited' | 'disabled'
  last_login_at: string | null
}

export function MembersTab() {
  const { data, mutate } = useSWR<{ users: MemberRecord[] }>('/api/users', fetcher)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'admin' | 'member'>('member')
  const [inviteLink, setInviteLink] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function inviteMember() {
    setError(null)
    try {
      const result = await apiPost('/api/users', { email, role }) as { invite_url: string }
      setInviteLink(result.invite_url)
      setEmail('')
      await mutate()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to invite member')
    }
  }

  async function updateMember(id: number, patch: Record<string, unknown>) {
    setError(null)
    try {
      await apiPatch(`/api/users/${id}`, patch)
      await mutate()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update member')
    }
  }

  async function resetInvite(id: number) {
    setError(null)
    try {
      const result = await apiPost(`/api/users/${id}/invite/reset`) as { invite_url: string }
      setInviteLink(result.invite_url)
      await mutate()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset invite')
    }
  }

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-text">Members</h2>
        <p className="text-xs text-muted mt-1">Invite and manage workspace members.</p>
      </div>

      <div className="rounded-xl border border-border bg-bg-card p-4 space-y-3">
        <div className="grid gap-3 md:grid-cols-[1fr_140px_auto]">
          <Input
            type="email"
            placeholder="name@example.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
          />
          <select
            value={role}
            onChange={e => setRole(e.target.value as 'admin' | 'member')}
            className="rounded-lg border border-border bg-bg-input px-3 py-2 text-sm text-text"
          >
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </select>
          <button
            type="button"
            onClick={inviteMember}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-text"
          >
            Invite
          </button>
        </div>
        {inviteLink && (
          <div className="rounded-lg bg-bg-input px-3 py-2 text-xs text-text break-all">
            {inviteLink}
          </div>
        )}
        {error && <p className="text-sm text-red-500">{error}</p>}
      </div>

      <div className="rounded-xl border border-border bg-bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-bg-sidebar text-muted">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Email</th>
              <th className="px-4 py-3 text-left font-medium">Role</th>
              <th className="px-4 py-3 text-left font-medium">Status</th>
              <th className="px-4 py-3 text-left font-medium">Last login</th>
              <th className="px-4 py-3 text-left font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {data?.users?.map(user => (
              <tr key={user.id} className="border-t border-border">
                <td className="px-4 py-3">{user.email}</td>
                <td className="px-4 py-3">
                  <select
                    value={user.role}
                    disabled={user.role === 'owner'}
                    onChange={e => void updateMember(user.id, { role: e.target.value })}
                    className="rounded-md border border-border bg-bg-input px-2 py-1 text-sm text-text disabled:opacity-50"
                  >
                    <option value="owner">Owner</option>
                    <option value="admin">Admin</option>
                    <option value="member">Member</option>
                  </select>
                </td>
                <td className="px-4 py-3">
                  <select
                    value={user.status}
                    disabled={user.role === 'owner'}
                    onChange={e => void updateMember(user.id, { status: e.target.value })}
                    className="rounded-md border border-border bg-bg-input px-2 py-1 text-sm text-text disabled:opacity-50"
                  >
                    <option value="active">Active</option>
                    <option value="invited">Invited</option>
                    <option value="disabled">Disabled</option>
                  </select>
                </td>
                <td className="px-4 py-3 text-muted">{user.last_login_at ? new Date(user.last_login_at).toLocaleString() : 'Never'}</td>
                <td className="px-4 py-3 space-x-2">
                  {user.status === 'invited' && (
                    <button type="button" onClick={() => void resetInvite(user.id)} className="text-accent hover:underline">
                      Reset invite
                    </button>
                  )}
                  {user.role !== 'owner' && (
                    <button
                      type="button"
                      onClick={() => void apiPost(`/api/users/${user.id}/sessions/revoke`).then(() => mutate())}
                      className="text-accent hover:underline"
                    >
                      Revoke sessions
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
