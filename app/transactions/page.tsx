'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Transaction, CATEGORIES, Category } from '@/lib/types'
import { AuthGuard } from '@/components/AuthGuard'
import { Navbar } from '@/components/Navbar'
import { DepositModal } from '@/components/DepositModal'
import { format } from 'date-fns'

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

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)

  const getCategoryColor = (category: string) => {
    const colors: { [key: string]: string } = {
      Housing: 'bg-purple-100 text-purple-800',
      Utilities: 'bg-yellow-100 text-yellow-800',
      Insurance: 'bg-green-100 text-green-800',
      Subscriptions: 'bg-pink-100 text-pink-800',
      Groceries: 'bg-orange-100 text-orange-800',
      Transportation: 'bg-blue-100 text-blue-800',
      Healthcare: 'bg-red-100 text-red-800',
      Entertainment: 'bg-indigo-100 text-indigo-800',
      Education: 'bg-cyan-100 text-cyan-800',
      Savings: 'bg-emerald-100 text-emerald-800',
      Other: 'bg-gray-100 text-gray-800',
    }
    return colors[category] || colors.Other
  }

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
      const { data: balanceData } = await supabase.from('balance').select('*').single()
      setBalance(balanceData?.amount || 0)

      const { data: txData } = await supabase
        .from('transactions')
        .select('*')
        .order('created_at', { ascending: false })
      setTransactions(txData || [])
    } catch (error) {
      console.error('Error fetching transactions:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleDeposit = async (amount: number, description: string) => {
    try {
      const { data: balanceRow } = await supabase.from('balance').select('id').single()
      if (!balanceRow) {
        throw new Error('Balance record not found')
      }

      await supabase
        .from('balance')
        .update({ amount: balance + amount, updated_at: new Date().toISOString() })
        .eq('id', balanceRow!.id)

      await supabase.from('transactions').insert({
        type: 'deposit',
        amount,
        description,
        category: 'Other',
      })

      setBalance(balance + amount)
      setShowDeposit(false)
      await fetchData()
    } catch (error) {
      console.error('Error adding deposit:', error)
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
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Transactions</h1>
            <p className="text-gray-500 mt-0.5">{transactions.length} total transactions</p>
          </div>
          <button
            onClick={() => setShowDeposit(true)}
            className="bg-green-600 text-white px-4 py-2.5 rounded-lg font-medium hover:bg-green-700 transition-colors"
          >
            + Add Deposit
          </button>
        </div>

        {/* This Month Summary */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <p className="text-sm text-gray-500 mb-1">Current Balance</p>
            <p className={`text-2xl font-bold ${balance < 0 ? 'text-red-600' : 'text-blue-600'}`}>
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
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-bold text-gray-900">History</h2>
            <select
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value as Category | 'All')}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="All">All Categories</option>
              {CATEGORIES.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          {filtered.length === 0 ? (
            <p className="text-gray-500 text-center py-12">No transactions yet. Add a deposit to get started!</p>
          ) : (
            <div className="space-y-2">
              {filtered.map(tx => (
                <div
                  key={tx.id}
                  className="flex items-center justify-between p-4 rounded-lg hover:bg-gray-50 border border-transparent hover:border-gray-100 transition-colors"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                      tx.type === 'deposit' ? 'bg-green-100' : 'bg-red-100'
                    }`}>
                      <span className="text-lg">{tx.type === 'deposit' ? '📥' : '📤'}</span>
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900 truncate">{tx.description}</p>
                      <p className="text-sm text-gray-400">
                        {format(new Date(tx.created_at), 'MMM d, yyyy · h:mm a')}
                      </p>
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
