'use client'
import { useEffect, useState } from 'react'
import { AuthGuard } from '@/components/AuthGuard'
import { SiteRibbon } from '@/components/SiteRibbon'
import { supabase } from '@/lib/supabase'
import { format } from 'date-fns'

type ManagedUser = {
  id: string
  email?: string
  created_at: string
  last_sign_in_at?: string
  email_confirmed_at?: string
}

export default function UsersPage() {
  return (
    <AuthGuard>
      <UsersContent />
    </AuthGuard>
  )
}

function UsersContent() {
  const [users, setUsers] = useState<ManagedUser[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [mode, setMode] = useState<'invite' | 'create'>('invite')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [inviteLink, setInviteLink] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    fetchUsers()
  }, [])

  const getToken = async () => {
    const { data } = await supabase.auth.getSession()
    return data.session?.access_token
  }

  const fetchUsers = async () => {
    try {
      setLoading(true)
      setError('')
      const token = await getToken()
      if (!token) throw new Error('You must be signed in')

      const response = await fetch('/api/users', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
      const data = await response.json()

      if (!response.ok) throw new Error(data.error || 'Could not load users')

      setUsers(data.users || [])
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not load users')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()

    try {
      setSaving(true)
      setError('')
      setNotice('')
      setInviteLink('')
      const token = await getToken()
      if (!token) throw new Error('You must be signed in')

      const response = await fetch('/api/users', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          mode,
          email,
          password: mode === 'create' ? password : undefined,
        }),
      })
      const data = await response.json()

      if (!response.ok) throw new Error(data.error || 'Could not save user')

      if (mode === 'invite') {
        setNotice(`Invite link created for ${email}.`)
        setInviteLink(data.inviteLink || '')
      } else {
        setNotice(`User created for ${email}.`)
      }
      setEmail('')
      setPassword('')
      await fetchUsers()
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not save user')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <SiteRibbon />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-950">Users</h1>
          <p className="mt-1 text-gray-500">Invite family members or create a login directly.</p>
        </div>

        {error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}
        {notice && (
          <div className="mb-6 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-700">
            {notice}
          </div>
        )}
        {inviteLink && (
          <div className="mb-6 rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-700">
            <p className="font-semibold text-gray-950">Invite Link</p>
            <p className="mt-1 text-gray-500">
              Send this link directly if the Supabase email does not arrive.
            </p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <input
                readOnly
                value={inviteLink}
                className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={() => navigator.clipboard.writeText(inviteLink)}
                className="rounded-lg bg-gray-950 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
              >
                Copy
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,420px)_1fr]">
          <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold text-gray-950">Add User</h2>
            <div className="mt-4 grid grid-cols-2 gap-2 rounded-lg bg-gray-100 p-1">
              <button
                type="button"
                onClick={() => setMode('invite')}
                className={`rounded-md px-3 py-2 text-sm font-semibold ${
                  mode === 'invite' ? 'bg-gray-950 text-white' : 'text-gray-700 hover:bg-white'
                }`}
              >
                Invite
              </button>
              <button
                type="button"
                onClick={() => setMode('create')}
                className={`rounded-md px-3 py-2 text-sm font-semibold ${
                  mode === 'create' ? 'bg-gray-950 text-white' : 'text-gray-700 hover:bg-white'
                }`}
              >
                Create
              </button>
            </div>

            <form onSubmit={handleSubmit} className="mt-5 space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={event => setEmail(event.target.value)}
                  required
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-900"
                  placeholder="family@example.com"
                />
              </div>

              {mode === 'create' && (
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Temporary Password</label>
                  <input
                    type="text"
                    value={password}
                    onChange={event => setPassword(event.target.value)}
                    required
                    minLength={8}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-900"
                    placeholder="At least 8 characters"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Share this password privately and have them change it later in Supabase.
                  </p>
                </div>
              )}

              <button
                type="submit"
                disabled={saving}
                className="w-full rounded-lg bg-gray-950 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
              >
                {saving ? 'Saving...' : mode === 'invite' ? 'Create Invite Link' : 'Create User'}
              </button>
            </form>
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-4">
              <h2 className="text-lg font-bold text-gray-950">Current Users</h2>
              <button
                type="button"
                onClick={fetchUsers}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Refresh
              </button>
            </div>

            {loading ? (
              <p className="py-10 text-center text-gray-500">Loading users...</p>
            ) : users.length === 0 ? (
              <p className="py-10 text-center text-gray-500">No users found.</p>
            ) : (
              <div className="space-y-3">
                {users.map(user => (
                  <div key={user.id} className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-semibold text-gray-950">{user.email || 'No email'}</p>
                        <p className="text-sm text-gray-500">
                          Created {format(new Date(user.created_at), 'MMM d, yyyy')}
                        </p>
                      </div>
                      <span className={`w-fit rounded-full px-3 py-1 text-xs font-medium ${
                        user.email_confirmed_at
                          ? 'bg-green-100 text-green-700'
                          : 'bg-yellow-100 text-yellow-800'
                      }`}>
                        {user.email_confirmed_at ? 'Confirmed' : 'Pending'}
                      </span>
                    </div>
                    {user.last_sign_in_at && (
                      <p className="mt-2 text-xs text-gray-500">
                        Last sign in {format(new Date(user.last_sign_in_at), 'MMM d, yyyy h:mm a')}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  )
}
