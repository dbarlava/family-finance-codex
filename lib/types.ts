export type Category =
  | 'Housing'
  | 'Utilities'
  | 'Insurance'
  | 'Subscriptions'
  | 'Groceries'
  | 'Transportation'
  | 'Healthcare'
  | 'Credit Card'
  | 'Entertainment'
  | 'Education'
  | 'Savings'
  | 'Other'

export const CATEGORIES: Category[] = [
  'Housing', 'Utilities', 'Insurance', 'Subscriptions',
  'Groceries', 'Transportation', 'Healthcare', 'Credit Card', 'Entertainment',
  'Education', 'Savings', 'Other'
]

export type RecurrencePeriod = 'weekly' | 'monthly' | 'quarterly' | 'yearly'

export type PaymentMethod =
  | 'Bank Transfer'
  | 'Debit Card'
  | 'Credit Card'
  | 'Check'
  | 'Cash'
  | 'Other'

export const PAYMENT_METHODS: PaymentMethod[] = [
  'Bank Transfer',
  'Debit Card',
  'Credit Card',
  'Check',
  'Cash',
  'Other',
]

export interface Bill {
  id: string
  name: string
  amount: number
  due_date: string
  category: Category
  is_recurring: boolean
  recurrence_period?: RecurrencePeriod
  is_paid: boolean
  paid_date?: string
  notes?: string
  created_at: string
}

export interface Transaction {
  id: string
  type: 'deposit' | 'payment'
  amount: number
  description: string
  category: Category
  bill_id?: string
  payment_method?: PaymentMethod
  memo?: string
  created_at: string
}

export interface Balance {
  id: string
  amount: number
  updated_at: string
}
