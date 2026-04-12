'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Bill, Category } from '@/lib/types'
import { AuthGuard } from '@/components/AuthGuard'
import { Navbar } from '@/components/Navbar'
import { AddBillModal } from '@/components/AddBillModal'
import { format, addDays, addMonths, addYears } from 'date-fns'
import type { RecurrencePeriod } from '@/lib/types'

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

  const isOverdue = (dueDate: string) => new Date(dueDate) < new Date()

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
      const { data: balanceData } = await supabase.from('balance').select('*').single()
      setBalance(balanceData?.amount || 0)

      const { data: billsData } = await supabase
        .from('bills')
        .select('*')
        .order('due_date', { ascending: true })
      setBills(billsData || [])
    } catch (error) {
      console.error('Error fetching data:', error)
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
    const { error } = await supabase.from('bills').insert({
      ...billData,
      is_paid: false,
    })
    if (!error) {
      setShowAddModal(false)
      await fetchData()
    }
  }

  const handleMarkAsPaid = async (bill: Bill) => {
    const confirmed = confirm(`Mark "${bill.name}" (${formatCurrency(bill.amount)}) as paid?\n\nThis will deduct ${formatCurrency(bill.amount)} from your balance.`)
    if (!confirmed) return

    try {
      const newBalance = balance - bill.amount

      // Get balance row id
      const { data: balanceRow } = await supabase.from('balance').select('id').single()

      // Update balance
      await supabase
        .from('balance')
        .update({ amount: newBalance, updated_at: new Date().toISOString() })
        .eq('id', balanceRow.id)

      // Mark bill as paid
      await supabase
        .from('bills')
        .update({ is_paid: true, paid_date: new Date().toISOString() })
        .eq('id', bill.id)

      // Create transaction record
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
        if (bill.recurrence_period === 'weekly') nextDueDate = addDays(nextDueDate, 7)
        else if (bill.recurrence_period === 'monthly') nextDueDate = addMonths(nextDueDate, 1)
        else if (bill.recurrence_period === 'yearly') nextDueDate = addYears(nextDueDate, 1)

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

  const handleDeleteBill = async (bill: Bill) => {
    const confirmed = confirm(`Delete "${bill.name}"? This cannot be undone.`)
    if (!confirmed) return

    await supabase.from('bills').delete().eq('id', bill.id)
    await fetchData()
  }

  const unpaidBills = bills.filter(b => !b.is_paid)
  const paidBills = bills.filter(b => b.is_paid)
  const totalUnpaid = unpaidBills.reduce((sum, b) => sum + b.amount, 0)

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
            <h1 className="text-2xl font-bold text-gray-900">Bills</h1>
            <p className="text-gray-500 mt-0.5">
              {unpaidBills.length} unpaid · {formatCurrency(totalUnpaid)} total due
            </p>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="bg-blue-600 text-white px-4 py-2.5 rounded-lg font-medium hover:bg-blue-700 transition-colors"
          >
            + Add Bill
          </button>
        </div>

        {/* Unpaid Bills */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4">
            Unpaid Bills
            <span className="ml-2 text-sm font-normal text-gray-500">({unpaidBills.length})</span>
          </h2>
          {unpaidBills.length === 0 ? (
            <p className="text-gray-500 text-center py-10">
              🎉 All caught up! No unpaid bills.
            </p>
          ) : (
            <div className="space-y-3">
              {unpaidBills.map(bill => {
                const overdue = isOverdue(bill.due_date)
                return (
                  <div
                    key={bill.id}
                    className={`flex items-center justify-between p-4 rounded-lg border ${
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
                          <span className="px-2 py-0.5 bg-blue-50 text-blue-600 text-xs font-medium rounded-full">
                            🔄 {bill.recurrence_period}
                          </span>
                        )}
                      </div>
                      <p className={`text-sm mt-0.5 ${overdue ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
                        Due: {format(new Date(bill.due_date + 'T12:00:00'), 'MMM d, yyyy')}
                      </p>
                      {bill.notes && <p className="text-xs text-gray-400 mt-0.5">{bill.notes}</p>}
                    </div>
                    <div className="flex items-center gap-3 ml-4 shrink-0">
                      <p className="font-bold text-gray-900 text-lg">{formatCurrency(bill.amount)}</p>
                      <button
                        onClick={() => handleMarkAsPaid(bill)}
                        className="px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition-colors"
                      >
                        Mark Paid
                      </button>
                      <button
                        onClick={() => handleDeleteBill(bill)}
                        className="px-3 py-1.5 bg-gray-200 text-gray-600 text-sm rounded-lg hover:bg-red-100 hover:text-red-600 transition-colors"
                      >
                        Delete
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
            <h2 className="text-lg font-bold text-gray-900">
              Paid Bills
              <span className="ml-2 text-sm font-normal text-gray-500">({paidBills.length})</span>
            </h2>
            <span className="text-gray-400 text-xl">{showPaid ? '▲' : '▼'}</span>
          </button>

          {showPaid && (
            <div className="mt-4 space-y-3">
              {paidBills.length === 0 ? (
                <p className="text-gray-500 text-center py-6">No paid bills yet.</p>
              ) : (
                paidBills.map(bill => (
                  <div key={bill.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200 opacity-70">
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
                    <div className="flex items-center gap-3 ml-4">
                      <p className="font-bold text-gray-500">{formatCurrency(bill.amount)}</p>
                      <span className="px-3 py-1.5 bg-green-100 text-green-700 text-sm rounded-lg font-medium">
                        ✓ Paid
                      </span>
                      <button
                        onClick={() => handleDeleteBill(bill)}
                        className="px-3 py-1.5 bg-gray-200 text-gray-600 text-sm rounded-lg hover:bg-red-100 hover:text-red-600 transition-colors"
                      >
                        Delete
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
    </div>
  )
}
