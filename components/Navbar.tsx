'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/app/providers'

export function Navbar() {
  const pathname = usePathname()
  const { user, signOut } = useAuth()

  const links = [
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/bills', label: 'Bills' },
    { href: '/transactions', label: 'Transactions' },
  ]

  return (
    <nav className="sticky top-0 z-40 border-b border-gray-200 bg-white/95 shadow-sm backdrop-blur">
      <div className="max-w-6xl mx-auto px-4">
        <div className="flex min-h-16 flex-wrap items-center justify-between gap-3 py-3">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-900 text-sm font-bold text-white">
              FF
            </span>
            <div>
              <span className="block font-bold leading-tight text-gray-950">Family Finance</span>
              <span className="hidden text-xs text-gray-500 sm:block">Household cash flow</span>
            </div>
          </div>

          {/* Nav links */}
          <div className="order-3 flex w-full gap-1 overflow-x-auto sm:order-none sm:w-auto">
            {links.map(link => (
              <Link
                key={link.href}
                href={link.href}
                className={`shrink-0 px-3 py-2 rounded-lg text-sm font-medium transition-colors sm:px-4 ${
                  pathname === link.href
                    ? 'bg-gray-900 text-white'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-950'
                }`}
              >
                {link.label}
              </Link>
            ))}
          </div>

          {/* User + sign out */}
          <div className="flex items-center gap-3">
            <span className="hidden max-w-48 truncate text-sm text-gray-500 md:block">{user?.email}</span>
            <button
              onClick={signOut}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:border-gray-300 hover:bg-gray-50"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    </nav>
  )
}
