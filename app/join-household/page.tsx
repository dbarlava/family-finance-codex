'use client'
import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type InviteDetails = {
  email: string
  household: {
    id: string
    name: string
  }
}

export default function JoinHouseholdPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl border border-gray-200 shadow-xl p-8 w-full max-w-md text-center">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-lg bg-gray-900 text-lg font-bold text-white mb-4">
            FF
          </div>
          <p className="text-gray-500">Loading your invite.</p>
        </div>
      </div>
    }>
      <JoinHouseholdContent />
    </Suspense>
  )
}

function JoinHouseholdContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const token = searchParams.get('token') || ''
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [invite, setInvite] = useState<InviteDetails | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const loadInvite = async () => {
      try {
        setLoading(true)
        setError('')
        const response = await fetch(`/api/household-invites?token=${encodeURIComponent(token)}`)
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'Could not load invite')

        setInvite(data.invite)
        setEmail(data.invite.email || '')
      } catch (error) {
        setError(error instanceof Error ? error.message : 'Could not load invite')
      } finally {
        setLoading(false)
      }
    }

    if (token) {
      loadInvite()
    } else {
      setError('Invite token is required.')
      setLoading(false)
    }
  }, [token])

  const acceptWithCurrentSession = async () => {
    const { data } = await supabase.auth.getSession()
    const sessionToken = data.session?.access_token
    if (!sessionToken) throw new Error('You must be signed in to accept this invite.')

    const response = await fetch('/api/household-invites', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${sessionToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token }),
    })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || 'Could not accept invite')
  }

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault()
    try {
      setSubmitting(true)
      setError('')

      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
      if (signInError) throw signInError

      await acceptWithCurrentSession()
      router.push('/dashboard')
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not join household')
      setSubmitting(false)
    }
  }

  const handleSignup = async (event: React.FormEvent) => {
    event.preventDefault()
    try {
      setSubmitting(true)
      setError('')

      if (password !== confirmPassword) {
        throw new Error('Passwords do not match.')
      }

      const response = await fetch('/api/household-invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, email, password }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Could not accept invite')

      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
      if (signInError) throw signInError

      router.push('/dashboard')
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not join household')
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl border border-gray-200 shadow-xl p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-lg bg-gray-900 text-lg font-bold text-white mb-4">
            FF
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Join Household</h1>
          <p className="text-gray-500 mt-1">
            {invite ? `Join ${invite.household.name}.` : 'Loading your invite.'}
          </p>
        </div>

        {loading && (
          <div className="flex justify-center py-6">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-gray-900"></div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 mb-4 text-sm">
            {error}
          </div>
        )}

        {!loading && invite && (
          <>
            <div className="mb-6 grid grid-cols-2 gap-2 rounded-lg bg-gray-100 p-1">
              <button
                type="button"
                onClick={() => {
                  setMode('login')
                  setError('')
                }}
                className={`rounded-md px-3 py-2 text-sm font-semibold ${
                  mode === 'login'
                    ? 'bg-white text-gray-950 shadow-sm'
                    : 'text-gray-600 hover:text-gray-950'
                }`}
              >
                I Have an Account
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('signup')
                  setError('')
                }}
                className={`rounded-md px-3 py-2 text-sm font-semibold ${
                  mode === 'signup'
                    ? 'bg-white text-gray-950 shadow-sm'
                    : 'text-gray-600 hover:text-gray-950'
                }`}
              >
                Create Account
              </button>
            </div>

            <form onSubmit={mode === 'login' ? handleLogin : handleSignup} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={event => setEmail(event.target.value)}
                  required
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                  placeholder="you@example.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={event => setPassword(event.target.value)}
                  required
                  minLength={8}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                  placeholder="Password"
                />
              </div>

              {mode === 'signup' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={event => setConfirmPassword(event.target.value)}
                    required
                    minLength={8}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                    placeholder="Re-enter your password"
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-gray-900 text-white rounded-lg py-2.5 font-medium hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {submitting
                  ? 'Joining...'
                  : mode === 'login' ? 'Sign In and Join' : 'Create Account and Join'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
