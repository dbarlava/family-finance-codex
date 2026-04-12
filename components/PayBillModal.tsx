'use client'
import { useState } from 'react'
import type { Bill, PaymentMethod } from '@/lib/types'
import { PAYMENT_METHODS } from '@/lib/types'
import { formatCurrency, formatDateOnly } from '@/lib/finance'

interface PayBillModalProps {
  bill: Bill
  onClose: () => void
  onSubmit: (details: { paymentMethod?: PaymentMethod; memo?: string }) => Promise<void>
}

export function PayBillModal({ bill, onClose, onSubmit }: PayBillModalProps) {
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Bank Transfer')
  const [memo, setMemo] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    try {
      setLoading(true)
      await onSubmit({
        paymentMethod,
        memo: memo.trim() || undefined,
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-4">
      <div className="my-8 w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <h2 className="text-xl font-bold text-gray-950">Record Payment</h2>
        <p className="mt-1 text-sm text-gray-500">
          {bill.name} · {formatCurrency(bill.amount)} · due {formatDateOnly(bill.due_date)}
        </p>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Payment Method</label>
            <select
              value={paymentMethod}
              onChange={e => setPaymentMethod(e.target.value as PaymentMethod)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-900"
            >
              {PAYMENT_METHODS.map(method => (
                <option key={method} value={method}>{method}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Memo or Note</label>
            <textarea
              value={memo}
              onChange={e => setMemo(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-900"
              placeholder="Check number, confirmation code, account note..."
              rows={3}
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-gray-300 py-2.5 font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 rounded-lg bg-gray-900 py-2.5 font-medium text-white hover:bg-gray-700 disabled:opacity-50"
            >
              {loading ? 'Saving...' : 'Mark Paid'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
