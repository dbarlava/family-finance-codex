'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Bill, Category, Transaction } from '@/lib/types'
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
  markBillUnpaid,
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
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [balance, setBalance] = useState<number>(0)
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [showPaid, setShowPaid] = useState(false)
  const [error, setError] = useState('')
  const [payingBillId, setPayingBillId] = useState<string | null>(null)
  const [deletingBillId, setDeletingBillId] = useState<string | null>(null)
  const [markingUnpaidBillId, setMarkingUnpaidBillId] = useState<string | null>(null)
  const [billToPay, setBillToPay] = useState<Bill | null>(null)
  const [billToView, setBillToView] = useState<Bill | null>(null)

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
      setError('')
      const [balanceResult, billsResult, txResult] = await Promise.all([
        supabase.from('balance').select('*').order('updated_at', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('bills').select('*').order('due_date', { ascending: true }),
        supabase.from('transactions').select('*').eq('type', 'payment').order('created_at', { ascending: false }),
      ])

      if (balanceResult.error) throw balanceResult.error
      if (billsResult.error) throw billsResult.error
      if (txResult.error) throw txResult.error

      setBalance(balanceResult.data?.amount || 0)
      setBills(billsResult.data || [])
      setTransactions(txResult.data || [])
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
    const message = bill.is_paid
      ? `Delete paid bill "${bill.name}"? This will add ${formatCurrency(bill.amount)} back to the balance and remove its payment transaction. This cannot be undone.`
      : `Delete "${bill.name}"? This cannot be undone.`
    const confirmed = confirm(message)
    if (!confirmed) return

    try {
      setError('')
      setDeletingBillId(bill.id)
      await deleteBill(bill)
      await fetchData()
    } catch (error) {
      console.error('Error deleting bill:', error)
      setError('Bill was not deleted. Try again.')
    } finally {
      setDeletingBillId(null)
    }
  }

  const handleMarkUnpaid = async (bill: Bill) => {
    const confirmed = confirm(
      `Mark "${bill.name}" as unpaid? This will add ${formatCurrency(bill.amount)} back to the balance and remove its payment transaction.`
    )
    if (!confirmed) return

    try {
      setError('')
      setMarkingUnpaidBillId(bill.id)
      await markBillUnpaid(bill)
      await fetchData()
    } catch (error) {
      console.error('Error marking bill unpaid:', error)
      setError('Bill was not marked unpaid. Try again.')
    } finally {
      setMarkingUnpaidBillId(null)
    }
  }

  const unpaidBills = bills.filter(b => !b.is_paid)
  const paidBills = bills.filter(b => b.is_paid)
  const totalUnpaid = unpaidBills.reduce((sum, b) => sum + b.amount, 0)
  const paymentByBillId = new Map(
    transactions
      .filter(transaction => transaction.bill_id)
      .map(transaction => [transaction.bill_id, transaction])
  )

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
            <span className="text-sm font-medium text-gray-500">{showPaid ? 'Hide' : 'Show'}</span>
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
                        onClick={() => setBillToView(bill)}
                        className="px-3 py-1.5 bg-white text-gray-700 text-sm rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors"
                      >
                        View Details
                      </button>
                      <button
                        onClick={() => handleMarkUnpaid(bill)}
                        disabled={markingUnpaidBillId === bill.id}
                        className="px-3 py-1.5 bg-white text-gray-700 text-sm rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors disabled:opacity-50"
                      >
                        {markingUnpaidBillId === bill.id ? 'Saving...' : 'Mark Unpaid'}
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

      {billToView && (
        <PaidBillDetailsModal
          bill={billToView}
          transaction={paymentByBillId.get(billToView.id)}
          onClose={() => setBillToView(null)}
        />
      )}
    </div>
  )
}

function PaidBillDetailsModal({
  bill,
  transaction,
  onClose,
}: {
  bill: Bill
  transaction?: Transaction
  onClose: () => void
}) {
  const details = [
    { label: 'Amount', value: formatCurrency(bill.amount) },
    { label: 'Category', value: bill.category },
    { label: 'Due Date', value: formatDateOnly(bill.due_date) },
    {
      label: 'Paid Date',
      value: bill.paid_date ? format(new Date(bill.paid_date), 'MMM d, yyyy h:mm a') : 'Not recorded',
    },
    { label: 'Payment Method', value: transaction?.payment_method || 'Not recorded' },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-4">
      <div className="my-8 w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-gray-950">{bill.name}</h2>
            <p className="mt-1 text-sm text-gray-500">Paid bill details</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Close
          </button>
        </div>

        <dl className="mt-5 divide-y divide-gray-100 rounded-lg border border-gray-200">
          {details.map(detail => (
            <div key={detail.label} className="flex items-center justify-between gap-4 px-4 py-3">
              <dt className="text-sm text-gray-500">{detail.label}</dt>
              <dd className="text-right text-sm font-medium text-gray-950">{detail.value}</dd>
            </div>
          ))}
        </dl>

        {bill.notes && (
          <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Bill Notes</p>
            <p className="mt-1 text-sm text-gray-700">{bill.notes}</p>
          </div>
        )}

        {transaction?.memo && (
          <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Payment Memo</p>
            <p className="mt-1 text-sm text-gray-700">{transaction.memo}</p>
          </div>
        )}
      </div>
    </div>
  )
}
