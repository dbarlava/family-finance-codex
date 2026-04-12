'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

type Stage = 'loading' | 'set-password' | 'error'

export default function AcceptInvitePage() {
  const [stage, setStage] = useState<Stage>('loading')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [formError, setFormError] = useState('')
  const [pageError, setPageError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const router = useRouter()

  useEffect(() => {
    // Supabase appends the session tokens to the redirect URL as a hash fragment.
    // The client SDK detects this automatically via onAuthStateChange.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === 'SIGNED_IN' || event === 'USER_UPDATED') && session) {
        setStage('set-password')
      }
    })

    // Also handle the case where the session was already set before the listener fires
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) {
        setPageError('This invite link is invalid or has expired. Please ask for a new invite.')
        setStage('error')
        return
      }
      if (session) {
        setStage('set-password')
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')

    if (password !== confirmPassword) {
      setFormError('Passwords do not match.')
      return
    }
    if (password.length < 8) {
      setFormError('Password must be at least 8 characters.')
      return
    }

    setSubmitting(true)
    const { error } = await supabase.auth.updateUser({ password })

    if (error) {
      setFormError(error.message)
      setSubmitting(false)
    } else {
      router.push('/dashboard')
    }
  }

  if (stage === 'loading') {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl border border-gray-200 shadow-xl p-8 w-full max-w-md text-center">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-lg bg-gray-900 text-lg font-bold text-white mb-4">
            FF
          </div>
          <p className="text-gray-500 mt-2">Verifying your invite link…</p>
        </div>
      </div>
    )
  }

  if (stage === 'error') {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl border border-gray-200 shadow-xl p-8 w-full max-w-md text-center">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-lg bg-gray-900 text-lg font-bold text-white mb-4">
            FF
          </div>
          <h1 className="text-xl font-bold text-gray-900 mt-2">Link Expired</h1>
          <p className="text-gray-500 mt-2 text-sm">{pageError}</p>
          <a
            href="/login"
            className="mt-6 inline-block bg-gray-900 text-white rounded-lg px-5 py-2.5 text-sm font-medium hover:bg-gray-700 transition-colors"
          >
            Back to Login
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl border border-gray-200 shadow-xl p-8 w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-lg bg-gray-900 text-lg font-bold text-white mb-4">
            FF
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Welcome to Family Finance</h1>
          <p className="text-gray-500 mt-1 text-sm">
            Set a password to finish setting up your account.
          </p>
        </div>

        {formError && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 mb-4 text-sm">
            {formError}
          </div>
        )}

        <form onSubmit={handleSetPassword} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              New Password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={8}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              placeholder="At least 8 characters"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Confirm Password
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              placeholder="Re-enter your password"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-gray-900 text-white rounded-lg py-2.5 font-medium hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? 'Setting up your account…' : 'Complete Setup'}
          </button>
        </form>

        <p className="text-center text-xs text-gray-400 mt-6">
          Already have a password?{' '}
          <a href="/login" className="underline hover:text-gray-600">
            Sign in
          </a>
        </p>
      </div>
    </div>
  )
}
