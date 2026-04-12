'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Bill, Transaction } from '@/lib/types'
import { AuthGuard } from '@/components/AuthGuard'
import { Navbar } from '@/components/Navbar'
import { BalanceCard } from '@/components/BalanceCard'
import { format, addDays, addMonths, addYears } from 'date-fns'

export default function DashboardPage() {
  return (
    <AuthGuard>
      <DashboardContent />
    </AuthGuard>
  )
}

function DashboardContent() {
  const [balance, setBalance] = useState<number>(0)
  const [upcomingBills, setUpcomingBills] = useState<Bill[]>([])
  const [recentTransactions, setRecentTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)

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

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      setLoading(true)

      // Fetch balance
      const { data: balanceData } = await supabase
        .from('balance')
        .select('*')
        .single()

      setBalance(balanceData?.amount || 0)

      // Fetch all bills
      const { data: billsData } = await supabase
        .from('bills')
        .select('*')
        .order('due_date', { ascending: true })

      // Filter unpaid bills due in next 30 days
      const now = new Date()
      const thirtyDaysFromNow = addDays(now, 30)
      const upcoming = (billsData || []).filter(
        bill =>
          !bill.is_paid &&
          new Date(bill.due_date) <= thirtyDaysFromNow &&
          new Date(bill.due_date) >= now
      )
      setUpcomingBills(upcoming)

      // Fetch recent transactions
      const { data: transactionsData } = await supabase
        .from('transactions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10)

      setRecentTransactions(transactionsData || [])
    } catch (error) {
      console.error('Error fetching data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleDeposit = async (amount: number, description: string) => {
    try {
      // Update balance
      await supabase
        .from('balance')
        .update({ amount: balance + amount, updated_at: new Date().toISOString() })
        .eq('id', (await supabase.from('balance').select('id').single()).data?.id)

      // Insert transaction
      await supabase.from('transactions').insert({
        type: 'deposit',
        amount,
        description,
        category: 'Other',
      })

      setBalance(balance + amount)
      await fetchData()
    } catch (error) {
      console.error('Error adding deposit:', error)
    }
  }

  const handleMarkAsPaid = async (bill: Bill) => {
    const confirmed = confirm(`Mark "${bill.name}" as paid?`)
    if (!confirmed) return

    try {
      const newBalance = balance - bill.amount

      // Update balance
      const { data: balanceData } = await supabase
        .from('balance')
        .select('id')
        .single()

      if (!balanceData) {
        throw new Error('Balance record not found')
      }

      await supabase
        .from('balance')
        .update({ amount: newBalance, updated_at: new Date().toISOString() })
        .eq('id', balanceData.id)

      // Mark bill as paid
      await supabase
        .from('bills')
        .update({
          is_paid: true,
          paid_date: new Date().toISOString(),
        })
        .eq('id', bill.id)

      // Insert transaction
      await supabase.from('transactions').insert({
        type: 'payment',
        amount: bill.amount,
        description: bill.name,
        category: bill.category,
        bill_id: bill.id,
      })

      // If recurring, create next occurrence
      if (bill.is_recurring && bill.recurrence_period) {
        let nextDueDate = new Date(bill.due_date)
        if (bill.recurrence_period === 'weekly') {
          nextDueDate = addDays(nextDueDate, 7)
        } else if (bill.recurrence_period === 'monthly') {
          nextDueDate = addMonths(nextDueDate, 1)
        } else if (bill.recurrence_period === 'yearly') {
          nextDueDate = addYears(nextDueDate, 1)
        }

        await supabase.from('bills').insert({
          name: bill.name,
          amount: bill.amount,
          due_date: format(nextDueDate, 'yyyy-MM-dd'),
          category: bill.category,
          is_recurring: true,
          recurrence_period: bill.recurrence_period,
          is_paid: false,
          notes: bill.notes,
        })
      }

      setBalance(newBalance)
      await fetchData()
    } catch (error) {
      console.error('Error marking bill as paid:', error)
    }
  }

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
        <div className="grid grid-cols-1 gap-6">
          {/* Balance Card */}
          <BalanceCard balance={balance} onDeposit={handleDeposit} />

          {/* Upcoming Bills */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Upcoming Bills (Next 30 Days)</h2>
            {upcomingBills.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No bills due in the next 30 days</p>
            ) : (
              <div className="space-y-3">
                {upcomingBills.map(bill => (
                  <div key={bill.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <div>
                          <p className="font-semibold text-gray-900">{bill.name}</p>
                          <p className="text-sm text-gray-500">
                            Due: {format(new Date(bill.due_date), 'MMM d, yyyy')}
                          </p>
                        </div>
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${getCategoryColor(bill.category)}`}>
                          {bill.category}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 ml-4">
                      <p className="font-bold text-gray-900">{formatCurrency(bill.amount)}</p>
                      <button
                        onClick={() => handleMarkAsPaid(bill)}
                        className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition-colors"
                      >
                        Mark Paid
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent Transactions */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Recent Transactions</h2>
            {recentTransactions.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No transactions yet</p>
            ) : (
              <div className="space-y-3">
                {recentTransactions.map(tx => (
                  <div key={tx.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200">
                    <div className="flex items-center gap-3 flex-1">
                      <span className="text-2xl">
                        {tx.type === 'deposit' ? '📥' : '📤'}
                      </span>
                      <div>
                        <p className="font-semibold text-gray-900">{tx.description}</p>
                        <p className="text-sm text-gray-500">
                          {format(new Date(tx.created_at), 'MMM d, yyyy')}
                        </p>
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
      </main>
    </div>
  )
}
