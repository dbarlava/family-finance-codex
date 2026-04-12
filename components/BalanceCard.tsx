'use client'
import { useState } from 'react'
import { DepositModal } from './DepositModal'
import { formatCurrency } from '@/lib/finance'

interface BalanceCardProps {
  balance: number
  onDeposit: (amount: number, description: string) => Promise<void>
}

export function BalanceCard({ balance, onDeposit }: BalanceCardProps) {
  const [showDeposit, setShowDeposit] = useState(false)

  const isNegative = balance < 0

  return (
    <>
      <div className={`rounded-xl border p-6 shadow-sm ${isNegative ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-white'}`}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-medium text-gray-500">Current Balance</p>
            <p className={`mt-2 text-4xl font-bold tracking-tight ${isNegative ? 'text-red-700' : 'text-gray-950'}`}>
              {formatCurrency(balance)}
            </p>
            <p className="mt-2 text-sm text-gray-500">Updated when deposits and bill payments are recorded.</p>
          </div>
          <button
            onClick={() => setShowDeposit(true)}
            className="rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-gray-700"
          >
            Add Deposit
          </button>
        </div>
      </div>

      {showDeposit && (
        <DepositModal
          onClose={() => setShowDeposit(false)}
          onSubmit={async (amount, description) => {
            await onDeposit(amount, description)
            setShowDeposit(false)
          }}
        />
      )}
    </>
  )
}
