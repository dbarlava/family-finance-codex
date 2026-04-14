'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [householdName, setHouseholdName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    
    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      router.push('/dashboard')
    }
  }

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      setLoading(false)
      return
    }

    const response = await fetch('/api/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
        householdName,
      }),
    })
    const data = await response.json()

    if (!response.ok) {
      setError(data.error || 'Could not create account')
      setLoading(false)
      return
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
    if (signInError) {
      setError(signInError.message)
      setLoading(false)
      return
    }

    router.push('/dashboard')
  }

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl border border-gray-200 shadow-xl p-8 w-full max-w-md">
        {/* Logo / Header */}
        <div className="text-center mb-8">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-lg bg-gray-900 text-lg font-bold text-white mb-4">
            FF
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Family Finance</h1>
          <p className="text-gray-500 mt-1">
            {mode === 'login' ? 'Sign in to manage household cash flow.' : 'Create your household and owner account.'}
          </p>
        </div>

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
            Sign In
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
            Create Household
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 mb-4 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={mode === 'login' ? handleLogin : handleSignup} className="space-y-4">
          {mode === 'signup' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Household Name</label>
              <input
                type="text"
                value={householdName}
                onChange={(e) => setHouseholdName(e.target.value)}
                required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                placeholder="Smith Household"
              />
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
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
              onChange={(e) => setPassword(e.target.value)}
              required
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
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                placeholder="Re-enter your password"
              />
            </div>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gray-900 text-white rounded-lg py-2.5 font-medium hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading
              ? mode === 'login' ? 'Signing in...' : 'Creating household...'
              : mode === 'login' ? 'Sign In' : 'Create Household'}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-6">
          {mode === 'login'
            ? 'Need your own space? Create a household to get started.'
            : 'Already have an account? Sign in to continue.'}
        </p>
      </div>
    </div>
  )
}
