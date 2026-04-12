'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Bill, Category } from '@/lib/types'
import { AuthGuard } from '@/components/AuthGuard'
import { AddBillModal } from '@/components/AddBillModal'
import { PayBillModal } from '@/components/PayBillModal'
import { SiteRibbon } from '@/components/SiteRibbon'
import { format } from 'date-fns'
import type { PaymentMethod, RecurrencePeriod } from '@/lib/types'
import {
  addBill,
  deleteBill,
  formatCurrency,
  formatDateOnly,
  getCategoryColor,
  isOverdue,
  payBill,
} from '@/lib/finance'

export default function BillsPage() {
  return (
    <AuthGuard>
      <BillsContent />
    </AuthGuard>
  )
}

function BillsContent() {
  const [bills, setBills] = useState<Bill[]>([])
  const [balance, setBalance] = useState<number>(0)
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [showPaid, setShowPaid] = useState(false)
  const [error, setError] = useState('')
  const [payingBillId, setPayingBillId] = useState<string | null>(null)
  const [deletingBillId, setDeletingBillId] = useState<string | null>(null)
  const [billToPay, setBillToPay] = useState<Bill | null>(null)

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
      setError('')
      const [balanceResult, billsResult] = await Promise.all([
        supabase.from('balance').select('*').order('updated_at', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('bills').select('*').order('due_date', { ascending: true }),
      ])

      if (balanceResult.error) throw balanceResult.error
      if (billsResult.error) throw billsResult.error

      setBalance(balanceResult.data?.amount || 0)
      setBills(billsResult.data || [])
    } catch (error) {
      console.error('Error fetching data:', error)
      setError('Could not load bills. Try refreshing the page.')
    } finally {
      setLoading(false)
    }
  }

  const handleAddBill = async (billData: {
    name: string
    amount: number
    due_date: string
    category: Category
    is_recurring: boolean
    recurrence_period?: RecurrencePeriod
    notes?: string
  }) => {
    try {
      setError('')
      await addBill(billData)
      setShowAddModal(false)
      await fetchData()
    } catch (error) {
      console.error('Error adding bill:', error)
      setError('Bill was not added. Check the details and try again.')
      throw error
    }
  }

  const handleMarkAsPaid = async (
    bill: Bill,
    details: { paymentMethod?: PaymentMethod; memo?: string }
  ) => {
    try {
      setError('')
      setPayingBillId(bill.id)
      setBalance(await payBill(bill, details))
      setBillToPay(null)
      await fetchData()
    } catch (error) {
      console.error('Error marking bill as paid:', error)
      setError('Bill was not marked paid. Check that the database functions from the schema have been applied.')
    } finally {
      setPayingBillId(null)
    }
  }

  const handleDeleteBill = async (bill: Bill) => {
    const confirmed = confirm(`Delete "${bill.name}"? This cannot be undone.`)
    if (!confirmed) return

    try {
      setError('')
      setDeletingBillId(bill.id)
      await deleteBill(bill.id)
      await fetchData()
    } catch (error) {
      console.error('Error deleting bill:', error)
      setError('Bill was not deleted. Try again.')
    } finally {
      setDeletingBillId(null)
    }
  }

  const unpaidBills = bills.filter(b => !b.is_paid)
  const paidBills = bills.filter(b => b.is_paid)
  const totalUnpaid = unpaidBills.reduce((sum, b) => sum + b.amount, 0)

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-gray-900"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <SiteRibbon />
      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex flex-col gap-4 mb-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-950">Bills</h1>
            <p className="text-gray-500 mt-0.5">
              {unpaidBills.length} unpaid · {formatCurrency(totalUnpaid)} total due
            </p>
            <p className="mt-1 text-sm text-gray-500">
              Weekend due dates are moved to the Friday before.
            </p>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="bg-gray-900 text-white px-4 py-2.5 rounded-lg font-medium hover:bg-gray-700 transition-colors"
          >
            Add Bill
          </button>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 mb-6">
            {error}
          </div>
        )}

        {/* Unpaid Bills */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-bold text-gray-950 mb-4">
            Unpaid Bills
            <span className="ml-2 text-sm font-normal text-gray-500">({unpaidBills.length})</span>
          </h2>
          {unpaidBills.length === 0 ? (
            <p className="text-gray-500 text-center py-10">
              All caught up. No unpaid bills.
            </p>
          ) : (
            <div className="space-y-3">
              {unpaidBills.map(bill => {
                const overdue = isOverdue(bill.due_date)
                return (
                  <div
                    key={bill.id}
                    className={`flex flex-col gap-4 p-4 rounded-lg border sm:flex-row sm:items-center sm:justify-between ${
                      overdue ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-gray-900">{bill.name}</p>
                        {overdue && (
                          <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs font-medium rounded-full">
                            Overdue
                          </span>
                        )}
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getCategoryColor(bill.category)}`}>
                          {bill.category}
                        </span>
                        {bill.is_recurring && (
                          <span className="px-2 py-0.5 bg-gray-100 text-gray-700 text-xs font-medium rounded-full capitalize">
                            {bill.recurrence_period}
                          </span>
                        )}
                      </div>
                      <p className={`text-sm mt-0.5 ${overdue ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
                        Due: {formatDateOnly(bill.due_date)}
                      </p>
                      {bill.notes && <p className="text-xs text-gray-400 mt-0.5">{bill.notes}</p>}
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-3 sm:ml-4 sm:shrink-0">
                      <p className="font-bold text-gray-900 text-lg">{formatCurrency(bill.amount)}</p>
                      <button
                        onClick={() => setBillToPay(bill)}
                        disabled={payingBillId === bill.id}
                        className="px-3 py-1.5 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50"
                      >
                        {payingBillId === bill.id ? 'Saving...' : 'Mark Paid'}
                      </button>
                      <button
                        onClick={() => handleDeleteBill(bill)}
                        disabled={deletingBillId === bill.id}
                        className="px-3 py-1.5 bg-gray-200 text-gray-600 text-sm rounded-lg hover:bg-red-100 hover:text-red-600 transition-colors disabled:opacity-50"
                      >
                        {deletingBillId === bill.id ? 'Deleting...' : 'Delete'}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Paid Bills (collapsible) */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <button
            onClick={() => setShowPaid(!showPaid)}
            className="flex items-center justify-between w-full text-left"
          >
            <h2 className="text-lg font-bold text-gray-950">
              Paid Bills
              <span className="ml-2 text-sm font-normal text-gray-500">({paidBills.length})</span>
            </h2>
            <span className="text-gray-400 text-xl">{showPaid ? 'Up' : 'Down'}</span>
          </button>

          {showPaid && (
            <div className="mt-4 space-y-3">
              {paidBills.length === 0 ? (
                <p className="text-gray-500 text-center py-6">No paid bills yet.</p>
              ) : (
                paidBills.map(bill => (
                  <div key={bill.id} className="flex flex-col gap-4 p-4 bg-gray-50 rounded-lg border border-gray-200 opacity-70 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-gray-700 line-through">{bill.name}</p>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getCategoryColor(bill.category)}`}>
                          {bill.category}
                        </span>
                      </div>
                      <p className="text-sm text-gray-400">
                        Paid: {bill.paid_date ? format(new Date(bill.paid_date), 'MMM d, yyyy') : '—'}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-3 sm:ml-4">
                      <p className="font-bold text-gray-500">{formatCurrency(bill.amount)}</p>
                      <span className="px-3 py-1.5 bg-green-100 text-green-700 text-sm rounded-lg font-medium">
                        Paid
                      </span>
                      <button
                        onClick={() => handleDeleteBill(bill)}
                        disabled={deletingBillId === bill.id}
                        className="px-3 py-1.5 bg-gray-200 text-gray-600 text-sm rounded-lg hover:bg-red-100 hover:text-red-600 transition-colors disabled:opacity-50"
                      >
                        {deletingBillId === bill.id ? 'Deleting...' : 'Delete'}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </main>

      {showAddModal && (
        <AddBillModal
          onClose={() => setShowAddModal(false)}
          onSubmit={handleAddBill}
        />
      )}

      {billToPay && (
        <PayBillModal
          bill={billToPay}
          onClose={() => setBillToPay(null)}
          onSubmit={details => handleMarkAsPaid(billToPay, details)}
        />
      )}
    </div>
  )
}
