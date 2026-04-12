'use client'
import { usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/app/providers'

const ADMIN_EMAIL = process.env.NEXT_PUBLIC_ADMIN_EMAIL

export function SiteRibbon() {
  const pathname = usePathname()
  const { user } = useAuth()
  const isAdmin = !!ADMIN_EMAIL && user?.email === ADMIN_EMAIL

  const links = [
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/bills', label: 'Bills' },
    { href: '/transactions', label: 'Transactions' },
    ...(isAdmin ? [{ href: '/users', label: 'Users' }] : []),
  ]

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  return (
    <header className="w-full border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-4">
        <div className="flex items-center justify-between gap-4">
          <a href="/dashboard" className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-950 text-sm font-bold text-white">
              FF
            </span>
            <span>
              <span className="block text-base font-bold leading-tight text-gray-950">Family Finance</span>
              <span className="block text-xs text-gray-500">Household cash flow</span>
            </span>
          </a>
          <button
            type="button"
            onClick={handleSignOut}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Sign Out
          </button>
        </div>

        <nav className={`grid gap-2 rounded-lg bg-gray-100 p-1 ${isAdmin ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3'}`}>
          {links.map(link => {
            const active = pathname === link.href
            return (
              <a
                key={link.href}
                href={link.href}
                className={`rounded-md px-3 py-2 text-center text-sm font-semibold ${
                  active
                    ? 'bg-gray-950 text-white shadow-sm'
                    : 'text-gray-700 hover:bg-white hover:text-gray-950'
                }`}
              >
                {link.label}
              </a>
            )
          })}
        </nav>
      </div>
    </header>
  )
}
