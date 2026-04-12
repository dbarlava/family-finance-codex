'use client'
import { useState } from 'react'
import { DepositModal } from './DepositModal'

interface BalanceCardProps {
  balance: number
  onDeposit: (amount: number, description: string) => Promise<void>
}

export function BalanceCard({ balance, onDeposit }: BalanceCardProps) {
  const [showDeposit, setShowDeposit] = useState(false)

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)

  const isNegative = balance < 0

  return (
    <>
      <div className={`rounded-2xl p-6 text-white ${isNegative ? 'bg-red-600' : 'bg-gradient-to-br from-blue-600 to-blue-700'}`}>
        <p className="text-blue-100 text-sm font-medium mb-1">Current Balance</p>
        <p className="text-4xl font-bold mb-4">{formatCurrency(balance)}</p>
        <button
          onClick={() => setShowDeposit(true)}
          className="bg-white/20 hover:bg-white/30 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          + Add Deposit
        </button>
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
