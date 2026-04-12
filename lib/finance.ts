import { addDays, addMonths, addYears, format } from 'date-fns'
import { supabase } from './supabase'
import type { Bill, Category, PaymentMethod, RecurrencePeriod } from './types'

export const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)

export const parseDateOnly = (date: string) => new Date(`${date}T12:00:00`)

export const formatDateOnly = (date: string, pattern = 'MMM d, yyyy') =>
  format(parseDateOnly(date), pattern)

export const getBusinessDueDate = (date: string) => {
  const due = parseDateOnly(date)
  const day = due.getDay()

  if (day === 6) return format(addDays(due, -1), 'yyyy-MM-dd')
  if (day === 0) return format(addDays(due, -2), 'yyyy-MM-dd')
  return format(due, 'yyyy-MM-dd')
}

export const wasMovedFromWeekend = (date: string) => getBusinessDueDate(date) !== date

export const isOverdue = (dueDate: string) => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = parseDateOnly(dueDate)
  due.setHours(0, 0, 0, 0)
  return due < today
}

export const isDueWithinDays = (dueDate: string, days: number) => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = parseDateOnly(dueDate)
  due.setHours(0, 0, 0, 0)
  return due <= addDays(today, days)
}

export const getNextDueDate = (dueDate: string, recurrencePeriod: RecurrencePeriod) => {
  const current = parseDateOnly(dueDate)

  if (recurrencePeriod === 'weekly') return getBusinessDueDate(format(addDays(current, 7), 'yyyy-MM-dd'))
  if (recurrencePeriod === 'monthly') return getBusinessDueDate(format(addMonths(current, 1), 'yyyy-MM-dd'))
  if (recurrencePeriod === 'quarterly') return getBusinessDueDate(format(addMonths(current, 3), 'yyyy-MM-dd'))
  return getBusinessDueDate(format(addYears(current, 1), 'yyyy-MM-dd'))
}

export const getCategoryColor = (category: string) => {
  const colors: Record<string, string> = {
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

export type NewBill = {
  name: string
  amount: number
  due_date: string
  category: Category
  is_recurring: boolean
  recurrence_period?: RecurrencePeriod
  notes?: string
}

export async function addBill(billData: NewBill) {
  const { error } = await supabase.from('bills').insert({
    ...billData,
    due_date: getBusinessDueDate(billData.due_date),
    is_paid: false,
  })

  if (error) throw error
}

async function restorePaidBillAmount(bill: Bill) {
  if (!bill.is_paid) return

  const { data: currentBalance, error: balanceError } = await supabase
    .from('balance')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (balanceError) throw balanceError

  if (!currentBalance) {
    const { error } = await supabase.from('balance').insert({ amount: bill.amount })
    if (error) throw error
  } else {
    const { error } = await supabase
      .from('balance')
      .update({
        amount: Number(currentBalance.amount) + Number(bill.amount),
        updated_at: new Date().toISOString(),
      })
      .eq('id', currentBalance.id)

    if (error) throw error
  }

  const { error: txError } = await supabase
    .from('transactions')
    .delete()
    .eq('bill_id', bill.id)
    .eq('type', 'payment')

  if (txError) throw txError
}

export async function deleteBill(bill: Bill) {
  await restorePaidBillAmount(bill)

  const { error } = await supabase.from('bills').delete().eq('id', bill.id)
  if (error) throw error
}

export async function markBillUnpaid(bill: Bill) {
  await restorePaidBillAmount(bill)

  const { error } = await supabase
    .from('bills')
    .update({
      is_paid: false,
      paid_date: null,
    })
    .eq('id', bill.id)

  if (error) throw error
}

export async function recordDeposit(amount: number, description: string) {
  const { data, error } = await supabase.rpc('record_deposit', {
    p_amount: amount,
    p_description: description,
  })

  if (error) throw error
  return Number(data)
}

export type PaymentDetails = {
  paymentMethod?: PaymentMethod
  memo?: string
}

export async function payBill(bill: Bill, details: PaymentDetails = {}) {
  const { data, error } = await supabase.rpc('pay_bill', {
    p_bill_id: bill.id,
    p_payment_method: details.paymentMethod,
    p_memo: details.memo,
  })

  if (error) throw error
  return Number(data)
}
