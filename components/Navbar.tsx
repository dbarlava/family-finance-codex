'use client'
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
        <div className="flex min-h-16 items-center justify-between gap-3 py-3">
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
        <div className="grid grid-cols-3 gap-2 border-t border-gray-100 py-2">
          {links.map(link => (
            <a
              key={link.href}
              href={link.href}
              className={`px-3 py-2 text-center rounded-lg text-sm font-medium transition-colors sm:px-4 ${
                pathname === link.href
                  ? 'bg-gray-900 text-white'
                  : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-100 hover:text-gray-950'
              }`}
            >
              {link.label}
            </a>
          ))}
        </div>
      </div>
    </nav>
  )
}
