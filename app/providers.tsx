'use client'
import { createContext, useContext, useEffect, useState } from 'react'
import { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useRouter, usePathname } from 'next/navigation'
import { Navbar } from '@/components/Navbar'

interface AuthContext {
  user: User | null
  loading: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContext>({ user: null, loading: true, signOut: async () => {} })

export function useAuth() {
  return useContext(AuthContext)
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
      if (!session && pathname !== '/login') {
        router.push('/login')
      }
      if (session && pathname === '/login') {
        router.push('/dashboard')
      }
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (!session && pathname !== '/login') {
        router.push('/login')
      }
    })

    return () => subscription.unsubscribe()
  }, [pathname, router])

  const signOut = async () => {
    await supabase.auth.signOut()
    setUser(null)
    router.replace('/login')
    router.refresh()
  }

  const showNavbar = Boolean(user) && pathname !== '/login'

  return (
    <AuthContext.Provider value={{ user, loading, signOut }}>
      {showNavbar && <Navbar userEmail={user?.email} onSignOut={signOut} />}
      {children}
    </AuthContext.Provider>
  )
}
