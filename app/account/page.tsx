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
  const { user } = useAuth()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

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

  return (
    <div className="min-h-screen bg-gray-50">
      <SiteRibbon />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-950">Account</h1>
          <p className="mt-1 text-gray-500">Manage your sign-in password.</p>
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
      </main>
    </div>
  )
}
