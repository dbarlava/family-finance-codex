'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Bill, Transaction } from '@/lib/types'
import { AuthGuard } from '@/components/AuthGuard'
import { BalanceCard } from '@/components/BalanceCard'
import { PayBillModal } from '@/components/PayBillModal'
import { SiteRibbon } from '@/components/SiteRibbon'
import { useAuth } from '@/app/providers'
import { format } from 'date-fns'
import type { PaymentMethod } from '@/lib/types'
import {
  formatCurrency,
  formatDateOnly,
  getCategoryColor,
  isDueWithinDays,
  isOverdue,
  payBill,
  recordDeposit,
} from '@/lib/finance'

export default function DashboardPage() {
  return (
    <AuthGuard>
      <DashboardContent />
    </AuthGuard>
  )
}

function DashboardContent() {
  const { activeHouseholdId, householdsLoading } = useAuth()
  const [balance, setBalance] = useState<number>(0)
  const [upcomingBills, setUpcomingBills] = useState<Bill[]>([])
  const [recentTransactions, setRecentTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [payingBillId, setPayingBillId] = useState<string | null>(null)
  const [billToPay, setBillToPay] = useState<Bill | null>(null)

  useEffect(() => {
    if (activeHouseholdId) fetchData()
    if (!activeHouseholdId && !householdsLoading) setLoading(false)
  }, [activeHouseholdId, householdsLoading])

  const fetchData = async () => {
    if (!activeHouseholdId) return
    try {
      setLoading(true)
      setError('')

      const [balanceResult, billsResult, transactionsResult] = await Promise.all([
        supabase.from('balance').select('*').eq('household_id', activeHouseholdId).maybeSingle(),
        supabase.from('bills').select('*').eq('household_id', activeHouseholdId).order('due_date', { ascending: true }),
        supabase.from('transactions').select('*').eq('household_id', activeHouseholdId).order('created_at', { ascending: false }).limit(10),
      ])

      if (balanceResult.error) throw balanceResult.error
      if (billsResult.error) throw billsResult.error
      if (transactionsResult.error) throw transactionsResult.error

      setBalance(balanceResult.data?.amount || 0)

      const upcoming = (billsResult.data || []).filter(
        bill => !bill.is_paid && isDueWithinDays(bill.due_date, 30)
      )
      setUpcomingBills(upcoming)
      setRecentTransactions(transactionsResult.data || [])
    } catch (error) {
      console.error('Error fetching data:', error)
      setError('Could not load the latest finance data. Try refreshing the page.')
    } finally {
      setLoading(false)
    }
  }

  const handleDeposit = async (amount: number, description: string) => {
    if (!activeHouseholdId) return
    try {
      setError('')
      setBalance(await recordDeposit(amount, description, activeHouseholdId))
      await fetchData()
    } catch (error) {
      console.error('Error adding deposit:', error)
      setError('Deposit was not saved. Check that the database functions from the schema have been applied.')
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

  const dueNext30 = upcomingBills.reduce((sum, bill) => sum + bill.amount, 0)
  const projectedBalance = balance - dueNext30
  const overdueCount = upcomingBills.filter(bill => isOverdue(bill.due_date)).length

  if (loading || householdsLoading) {
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
        {!activeHouseholdId ? (
          <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800">
            Create a household to start tracking bills and transactions.
          </div>
        ) : (
        <div className="grid grid-cols-1 gap-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-950">Dashboard</h1>
            <p className="mt-1 text-gray-500">A quick view of balance, upcoming obligations, and recent activity.</p>
          </div>

          {/* Balance Card */}
          <BalanceCard balance={balance} onDeposit={handleDeposit} />

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
              <p className="text-sm text-gray-500 mb-1">Due next 30 days</p>
              <p className="text-2xl font-bold text-gray-950">{formatCurrency(dueNext30)}</p>
              <p className="text-sm text-gray-500 mt-1">{upcomingBills.length} unpaid bills</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
              <p className="text-sm text-gray-500 mb-1">Projected balance</p>
              <p className={`text-2xl font-bold ${projectedBalance < 0 ? 'text-red-600' : 'text-green-600'}`}>
                {formatCurrency(projectedBalance)}
              </p>
              <p className="text-sm text-gray-500 mt-1">After known bills due soon</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
              <p className="text-sm text-gray-500 mb-1">Needs attention</p>
              <p className={`text-2xl font-bold ${overdueCount > 0 ? 'text-red-600' : 'text-gray-950'}`}>
                {overdueCount}
              </p>
              <p className="text-sm text-gray-500 mt-1">Overdue bills</p>
            </div>
          </div>

          {/* Upcoming Bills */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-xl font-bold text-gray-950 mb-1">Bills Due Now and Next 30 Days</h2>
            <p className="mb-4 text-sm text-gray-500">Weekend due dates are moved to the Friday before.</p>
            {upcomingBills.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No bills due right now or in the next 30 days</p>
            ) : (
              <div className="space-y-3">
                {upcomingBills.map(bill => {
                  const overdue = isOverdue(bill.due_date)

                  return (
                  <div key={bill.id} className={`flex flex-col gap-4 p-4 rounded-lg border sm:flex-row sm:items-center sm:justify-between ${
                    overdue ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'
                  }`}>
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <div>
                          <p className="font-semibold text-gray-900">{bill.name}</p>
                          <p className={`text-sm ${overdue ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
                            Due: {formatDateOnly(bill.due_date)}
                          </p>
                        </div>
                        {overdue && (
                          <span className="px-3 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">
                            Overdue
                          </span>
                        )}
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${getCategoryColor(bill.category)}`}>
                          {bill.category}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-4 sm:ml-4">
                      <p className="font-bold text-gray-900">{formatCurrency(bill.amount)}</p>
                      <button
                        onClick={() => setBillToPay(bill)}
                        disabled={payingBillId === bill.id}
                        className="px-4 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50"
                      >
                        {payingBillId === bill.id ? 'Saving...' : 'Mark Paid'}
                      </button>
                    </div>
                  </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Recent Transactions */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-xl font-bold text-gray-950 mb-4">Recent Transactions</h2>
            {recentTransactions.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No transactions yet</p>
            ) : (
              <div className="space-y-3">
                {recentTransactions.map(tx => (
                  <div key={tx.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200">
                    <div className="flex items-center gap-3 flex-1">
                      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                        tx.type === 'deposit' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                      }`}>
                        {tx.type === 'deposit' ? '+' : '-'}
                      </span>
                      <div>
                        <p className="font-semibold text-gray-900">{tx.description}</p>
                        <p className="text-sm text-gray-500">
                          {format(new Date(tx.created_at), 'MMM d, yyyy')}
                        </p>
                        {(tx.payment_method || tx.memo) && (
                          <p className="text-xs text-gray-400">
                            {[tx.payment_method, tx.memo].filter(Boolean).join(' · ')}
                          </p>
                        )}
                      </div>
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${getCategoryColor(tx.category)}`}>
                        {tx.category}
                      </span>
                    </div>
                    <p className={`font-bold text-lg ${tx.type === 'deposit' ? 'text-green-600' : 'text-red-600'}`}>
                      {tx.type === 'deposit' ? '+' : '-'}{formatCurrency(tx.amount)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        )}
      </main>

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
