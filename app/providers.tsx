'use client'
import { createContext, useContext, useEffect, useState } from 'react'
import { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useRouter, usePathname } from 'next/navigation'
import type { Household } from '@/lib/types'

interface AuthContext {
  user: User | null
  loading: boolean
  households: Household[]
  householdsLoading: boolean
  activeHousehold: Household | null
  activeHouseholdId: string | null
  refreshHouseholds: () => Promise<void>
  setActiveHouseholdId: (householdId: string) => void
  createHousehold: (name: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContext>({
  user: null,
  loading: true,
  households: [],
  householdsLoading: true,
  activeHousehold: null,
  activeHouseholdId: null,
  refreshHouseholds: async () => {},
  setActiveHouseholdId: () => {},
  createHousehold: async () => {},
  signOut: async () => {},
})

export function useAuth() {
  return useContext(AuthContext)
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [households, setHouseholds] = useState<Household[]>([])
  const [householdsLoading, setHouseholdsLoading] = useState(true)
  const [activeHouseholdId, setActiveHouseholdIdState] = useState<string | null>(null)
  const router = useRouter()
  const pathname = usePathname()
  const activeHousehold = households.find(household => household.id === activeHouseholdId) || null

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      const currentUser = session?.user ?? null
      setUser(currentUser)
      setLoading(false)
      if (currentUser) {
        refreshHouseholds(currentUser.id)
      } else {
        setHouseholds([])
        setActiveHouseholdIdState(null)
        setHouseholdsLoading(false)
      }
      const isPublic = pathname === '/login' || pathname === '/accept-invite' || pathname === '/join-household'
      if (!session && !isPublic) {
        router.push('/login')
      }
      if (session && pathname === '/login') {
        router.push('/dashboard')
      }
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const currentUser = session?.user ?? null
      setUser(currentUser)
      if (currentUser) {
        refreshHouseholds(currentUser.id)
      } else {
        setHouseholds([])
        setActiveHouseholdIdState(null)
        setHouseholdsLoading(false)
      }
      const isPublic = pathname === '/login' || pathname === '/accept-invite' || pathname === '/join-household'
      if (!session && !isPublic) {
        router.push('/login')
      }
    })

    return () => subscription.unsubscribe()
  }, [pathname, router])

  const refreshHouseholds = async (userId = user?.id) => {
    if (!userId) return

    setHouseholdsLoading(true)
    const { data, error } = await supabase
      .from('household_members')
      .select('household_id, households(id,name,created_by,created_at)')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })

    if (error) {
      console.error('Could not load households:', error)
      setHouseholds([])
      setActiveHouseholdIdState(null)
      setHouseholdsLoading(false)
      return
    }

    const loaded = (data || [])
      .map(row => Array.isArray(row.households) ? row.households[0] : row.households)
      .filter((household): household is Household => !!household)
    setHouseholds(loaded)

    const saved = window.localStorage.getItem('active_household_id')
    const nextActive = loaded.find(household => household.id === saved)?.id || loaded[0]?.id || null
    setActiveHouseholdIdState(nextActive)
    if (nextActive) window.localStorage.setItem('active_household_id', nextActive)
    setHouseholdsLoading(false)
  }

  const setActiveHouseholdId = (householdId: string) => {
    setActiveHouseholdIdState(householdId)
    window.localStorage.setItem('active_household_id', householdId)
  }

  const createHousehold = async (name: string) => {
    if (!user) throw new Error('You must be signed in')
    const trimmedName = name.trim()
    if (!trimmedName) throw new Error('Household name is required')

    const { data: household, error: householdError } = await supabase
      .from('households')
      .insert({
        name: trimmedName,
        created_by: user.id,
      })
      .select('*')
      .single()

    if (householdError) throw householdError

    const { error: memberError } = await supabase.from('household_members').insert({
      household_id: household.id,
      user_id: user.id,
      email: user.email || '',
      role: 'owner',
    })

    if (memberError) throw memberError

    setHouseholds(current => [...current, household])
    setActiveHouseholdId(household.id)

    const { error: balanceError } = await supabase.from('balance').insert({
      household_id: household.id,
      amount: 0,
    })

    if (balanceError) throw balanceError
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setHouseholds([])
    setActiveHouseholdIdState(null)
    router.replace('/login')
    router.refresh()
  }

  return (
    <AuthContext.Provider value={{
      user,
      loading,
      households,
      householdsLoading,
      activeHousehold,
      activeHouseholdId,
      refreshHouseholds,
      setActiveHouseholdId,
      createHousehold,
      signOut,
    }}>
      {children}
    </AuthContext.Provider>
  )
}
