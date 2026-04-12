'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/app/providers'

export function Navbar() {
  const pathname = usePathname()
  const { user, signOut } = useAuth()

  const links = [
    { href: '/dashboard', label: '🏠 Dashboard' },
    { href: '/bills', label: '📋 Bills' },
    { href: '/transactions', label: '💸 Transactions' },
  ]

  return (
    <nav className="bg-white shadow-sm border-b border-gray-200">
      <div className="max-w-6xl mx-auto px-4">
        <div className="flex min-h-16 flex-wrap items-center justify-between gap-3 py-3">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <span className="text-2xl">💰</span>
            <span className="font-bold text-gray-900 text-lg">Family Finance</span>
          </div>

          {/* Nav links */}
          <div className="order-3 flex w-full gap-1 overflow-x-auto sm:order-none sm:w-auto">
            {links.map(link => (
              <Link
                key={link.href}
                href={link.href}
                className={`shrink-0 px-3 py-2 rounded-lg text-sm font-medium transition-colors sm:px-4 ${
                  pathname === link.href
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-100'
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
              className="text-sm text-red-600 hover:text-red-700 font-medium"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    </nav>
  )
}
