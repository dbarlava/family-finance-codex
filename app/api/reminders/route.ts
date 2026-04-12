import { NextResponse } from 'next/server'
import { addDays, format } from 'date-fns'
import { createClient } from '@supabase/supabase-js'
import { formatCurrency, formatDateOnly } from '@/lib/finance'
import type { Bill } from '@/lib/types'

const reminderWindowDays = 3

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing Supabase reminder environment variables')
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
    },
  })
}

async function sendReminderEmail(bills: Bill[], to: string) {
  const resendApiKey = process.env.RESEND_API_KEY
  const from = process.env.REMINDER_FROM_EMAIL

  if (!resendApiKey || !from) {
    throw new Error('Missing Resend reminder environment variables')
  }

  const lines = bills.map(bill =>
    `${bill.name}: ${formatCurrency(bill.amount)} due ${formatDateOnly(bill.due_date)}`
  )

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to,
      subject: `Family Finance: ${bills.length} bill${bills.length === 1 ? '' : 's'} due soon`,
      text: [
        'Bills due soon:',
        '',
        ...lines,
        '',
        'Weekend due dates are moved to the Friday before.',
      ].join('\n'),
    }),
  })

  if (!response.ok) {
    throw new Error(`Resend failed with ${response.status}: ${await response.text()}`)
  }
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const reminderTo = process.env.REMINDER_TO_EMAIL
    if (!reminderTo) throw new Error('Missing REMINDER_TO_EMAIL')

    const supabase = getAdminClient()
    const today = new Date()
    const dueThrough = format(addDays(today, reminderWindowDays), 'yyyy-MM-dd')

    const { data: bills, error: billsError } = await supabase
      .from('bills')
      .select('*')
      .eq('is_paid', false)
      .lte('due_date', dueThrough)
      .order('due_date', { ascending: true })

    if (billsError) throw billsError

    const candidates = (bills || []) as Bill[]
    if (candidates.length === 0) {
      return NextResponse.json({ sent: false, count: 0 })
    }

    const billIds = candidates.map(bill => bill.id)
    const { data: existingLogs, error: logsError } = await supabase
      .from('reminder_log')
      .select('bill_id,due_date')
      .eq('sent_to', reminderTo)
      .in('bill_id', billIds)

    if (logsError) throw logsError

    const alreadySent = new Set(
      (existingLogs || []).map(log => `${log.bill_id}:${log.due_date}`)
    )
    const billsToSend = candidates.filter(
      bill => !alreadySent.has(`${bill.id}:${bill.due_date}`)
    )

    if (billsToSend.length === 0) {
      return NextResponse.json({ sent: false, count: 0 })
    }

    await sendReminderEmail(billsToSend, reminderTo)

    const { error: insertError } = await supabase.from('reminder_log').insert(
      billsToSend.map(bill => ({
        bill_id: bill.id,
        due_date: bill.due_date,
        sent_to: reminderTo,
      }))
    )

    if (insertError) throw insertError

    return NextResponse.json({ sent: true, count: billsToSend.length })
  } catch (error) {
    console.error('Reminder job failed:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Reminder job failed' },
      { status: 500 }
    )
  }
}
