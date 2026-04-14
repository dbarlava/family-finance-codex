'use client'
import { useState } from 'react'
import { AuthGuard } from '@/components/AuthGuard'
import { SiteRibbon } from '@/components/SiteRibbon'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/app/providers'

export default function AccountPage() {
  return (
    <AuthGuard>
      <AccountContent />
    </AuthGuard>
  )
}

function AccountContent() {
  const { user, activeHousehold, activeHouseholdId, refreshHouseholds } = useAuth()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [householdName, setHouseholdName] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteLink, setInviteLink] = useState('')
  const [saving, setSaving] = useState(false)
  const [savingHousehold, setSavingHousehold] = useState(false)
  const [inviting, setInviting] = useState(false)
  const [deletingHousehold, setDeletingHousehold] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const isHouseholdOwner = !!activeHousehold && activeHousehold.created_by === user?.id

  const getToken = async () => {
    const { data } = await supabase.auth.getSession()
    return data.session?.access_token
  }

  const handleChangePassword = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    setNotice('')

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }

    try {
      setSaving(true)
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error

      setPassword('')
      setConfirmPassword('')
      setNotice('Password updated. Use the new password the next time you sign in.')
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not update password')
    } finally {
      setSaving(false)
    }
  }

  const handleRenameHousehold = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    setNotice('')
    setInviteLink('')

    try {
      setSavingHousehold(true)
      const token = await getToken()
      if (!token) throw new Error('You must be signed in')
      if (!activeHouseholdId) throw new Error('Choose a household first')

      const response = await fetch('/api/households', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          householdId: activeHouseholdId,
          name: householdName || activeHousehold?.name,
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Could not rename household')

      await refreshHouseholds()
      setHouseholdName('')
      setNotice('Household renamed.')
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not rename household')
    } finally {
      setSavingHousehold(false)
    }
  }

  const handleInvite = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    setNotice('')
    setInviteLink('')

    try {
      setInviting(true)
      const token = await getToken()
      if (!token) throw new Error('You must be signed in')
      if (!activeHouseholdId) throw new Error('Choose a household first')

      const response = await fetch('/api/households', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          householdId: activeHouseholdId,
          email: inviteEmail,
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Could not send invite')

      setInviteEmail('')
      setInviteLink(data.inviteLink || '')
      setNotice(data.emailSent ? 'Invite email sent.' : 'Invite link created. Copy and send it manually.')
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not send invite')
    } finally {
      setInviting(false)
    }
  }

  const handleDeleteHousehold = async () => {
    setError('')
    setNotice('')
    setInviteLink('')

    if (!activeHouseholdId || !activeHousehold) {
      setError('Choose a household first.')
      return
    }

    const confirmed = window.confirm(
      `Delete ${activeHousehold.name}? This will delete its bills, transactions, balance, members, and invites.`
    )
    if (!confirmed) return

    try {
      setDeletingHousehold(true)
      const token = await getToken()
      if (!token) throw new Error('You must be signed in')

      const response = await fetch(`/api/households?householdId=${encodeURIComponent(activeHouseholdId)}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Could not delete household')

      await refreshHouseholds()
      setNotice('Household deleted.')
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not delete household')
    } finally {
      setDeletingHousehold(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <SiteRibbon />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-950">Account</h1>
          <p className="mt-1 text-gray-500">Manage your sign-in password and household settings.</p>
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
            <p className="font-semibold text-gray-950">Household Invite Link</p>
            <p className="mt-1 text-gray-500">
              Share this if the email does not arrive.
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

        <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-5">
            <h2 className="text-lg font-bold text-gray-950">Change Password</h2>
            <p className="mt-1 text-sm text-gray-500">
              Signed in as {user?.email || 'your account'}.
            </p>
          </div>

          <form onSubmit={handleChangePassword} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">New Password</label>
              <input
                type="password"
                value={password}
                onChange={event => setPassword(event.target.value)}
                required
                minLength={8}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-900"
                placeholder="At least 8 characters"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Confirm Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={event => setConfirmPassword(event.target.value)}
                required
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-900"
                placeholder="Re-enter your password"
              />
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-lg bg-gray-950 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? 'Updating...' : 'Update Password'}
            </button>
          </form>
        </section>

        {isHouseholdOwner && (
          <section className="mt-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="mb-5">
              <h2 className="text-lg font-bold text-gray-950">Household Settings</h2>
              <p className="mt-1 text-sm text-gray-500">
                Owner controls for {activeHousehold.name}.
              </p>
            </div>

            <form onSubmit={handleRenameHousehold} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Household Name</label>
                <input
                  type="text"
                  value={householdName}
                  onChange={event => setHouseholdName(event.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-900"
                  placeholder={activeHousehold.name}
                />
              </div>
              <button
                type="submit"
                disabled={savingHousehold}
                className="rounded-lg bg-gray-950 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {savingHousehold ? 'Renaming...' : 'Rename Household'}
              </button>
            </form>

            <form onSubmit={handleInvite} className="mt-6 space-y-4 border-t border-gray-100 pt-6">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Invite Email</label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={event => setInviteEmail(event.target.value)}
                  required
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-900"
                  placeholder="person@example.com"
                />
              </div>
              <button
                type="submit"
                disabled={inviting}
                className="rounded-lg bg-gray-950 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {inviting ? 'Sending...' : 'Send Invite'}
              </button>
            </form>

            <div className="mt-6 border-t border-red-100 pt-6">
              <h3 className="text-sm font-bold text-red-700">Delete Household</h3>
              <p className="mt-1 text-sm text-gray-500">
                This removes the household and all of its bills, transactions, balance, members, and invites.
              </p>
              <button
                type="button"
                onClick={handleDeleteHousehold}
                disabled={deletingHousehold}
                className="mt-4 rounded-lg border border-red-300 px-4 py-2.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {deletingHousehold ? 'Deleting...' : 'Delete Household'}
              </button>
            </div>
          </section>
        )}
      </main>
    </div>
  )
}
