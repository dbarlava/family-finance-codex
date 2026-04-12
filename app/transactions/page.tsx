'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Transaction, CATEGORIES, Category } from '@/lib/types'
import { AuthGuard } from '@/components/AuthGuard'
import { DepositModal } from '@/components/DepositModal'
import { SiteRibbon } from '@/components/SiteRibbon'
import { format } from 'date-fns'
import { formatCurrency, getCategoryColor, recordDeposit } from '@/lib/finance'

export default function TransactionsPage() {
  return (
    <AuthGuard>
      <TransactionsContent />
    </AuthGuard>
  )
}

function TransactionsContent() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [balance, setBalance] = useState<number>(0)
  const [loading, setLoading] = useState(true)
  const [showDeposit, setShowDeposit] = useState(false)
  const [categoryFilter, setCategoryFilter] = useState<Category | 'All'>('All')
  const [error, setError] = useState('')

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
      setError('')
      const [balanceResult, txResult] = await Promise.all([
        supabase.from('balance').select('*').order('updated_at', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('transactions').select('*').order('created_at', { ascending: false }),
      ])

      if (balanceResult.error) throw balanceResult.error
      if (txResult.error) throw txResult.error

      setBalance(balanceResult.data?.amount || 0)
      setTransactions(txResult.data || [])
    } catch (error) {
      console.error('Error fetching transactions:', error)
      setError('Could not load transactions. Try refreshing the page.')
    } finally {
      setLoading(false)
    }
  }

  const handleDeposit = async (amount: number, description: string) => {
    try {
      setError('')
      setBalance(await recordDeposit(amount, description))
      setShowDeposit(false)
      await fetchData()
    } catch (error) {
      console.error('Error adding deposit:', error)
      setError('Deposit was not saved. Check that the database functions from the schema have been applied.')
      throw error
    }
  }

  // Current month stats
  const now = new Date()
  const thisMonthTx = transactions.filter(tx => {
    const d = new Date(tx.created_at)
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  })
  const monthDeposits = thisMonthTx.filter(tx => tx.type === 'deposit').reduce((s, tx) => s + tx.amount, 0)
  const monthPayments = thisMonthTx.filter(tx => tx.type === 'payment').reduce((s, tx) => s + tx.amount, 0)

  const filtered = categoryFilter === 'All'
    ? transactions
    : transactions.filter(tx => tx.category === categoryFilter)

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
            <h1 className="text-2xl font-bold text-gray-950">Transactions</h1>
            <p className="text-gray-500 mt-0.5">{transactions.length} total transactions recorded.</p>
          </div>
          <button
            onClick={() => setShowDeposit(true)}
            className="bg-gray-900 text-white px-4 py-2.5 rounded-lg font-medium hover:bg-gray-700 transition-colors"
          >
            Add Deposit
          </button>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 mb-6">
            {error}
          </div>
        )}

        {/* This Month Summary */}
        <div className="grid grid-cols-1 gap-4 mb-6 sm:grid-cols-3">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <p className="text-sm text-gray-500 mb-1">Current Balance</p>
            <p className={`text-2xl font-bold ${balance < 0 ? 'text-red-600' : 'text-gray-950'}`}>
              {formatCurrency(balance)}
            </p>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <p className="text-sm text-gray-500 mb-1">Deposited This Month</p>
            <p className="text-2xl font-bold text-green-600">+{formatCurrency(monthDeposits)}</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <p className="text-sm text-gray-500 mb-1">Paid Out This Month</p>
            <p className="text-2xl font-bold text-red-600">-{formatCurrency(monthPayments)}</p>
          </div>
        </div>

        {/* Transaction List */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          {/* Filter */}
          <div className="flex flex-col gap-3 mb-5 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg font-bold text-gray-950">History</h2>
            <select
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value as Category | 'All')}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            >
              <option value="All">All Categories</option>
              {CATEGORIES.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          {filtered.length === 0 ? (
            <p className="text-gray-500 text-center py-12">No transactions yet. Add a deposit to get started.</p>
          ) : (
            <div className="space-y-2">
              {filtered.map(tx => (
                <div
                  key={tx.id}
                  className="flex items-center justify-between p-4 rounded-lg hover:bg-gray-50 border border-transparent hover:border-gray-100 transition-colors"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-sm font-bold ${
                      tx.type === 'deposit' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                    }`}>
                      <span>{tx.type === 'deposit' ? '+' : '-'}</span>
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900 truncate">{tx.description}</p>
                      <p className="text-sm text-gray-400">
                        {format(new Date(tx.created_at), 'MMM d, yyyy · h:mm a')}
                      </p>
                      {(tx.payment_method || tx.memo) && (
                        <p className="text-xs text-gray-400">
                          {[tx.payment_method, tx.memo].filter(Boolean).join(' · ')}
                        </p>
                      )}
                    </div>
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium shrink-0 ${getCategoryColor(tx.category)}`}>
                      {tx.category}
                    </span>
                  </div>
                  <p className={`font-bold text-lg ml-4 shrink-0 ${
                    tx.type === 'deposit' ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {tx.type === 'deposit' ? '+' : '-'}{formatCurrency(tx.amount)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {showDeposit && (
        <DepositModal
          onClose={() => setShowDeposit(false)}
          onSubmit={handleDeposit}
        />
      )}
    </div>
  )
}
