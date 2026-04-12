import { NextResponse } from 'next/server'
import { addDays, differenceInCalendarDays, format } from 'date-fns'
import { createClient } from '@supabase/supabase-js'
import nodemailer from 'nodemailer'
import { formatCurrency, formatDateOnly, parseDateOnly } from '@/lib/finance'
import type { Bill } from '@/lib/types'

const reminderWindowDays = 7

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
  const gmailUser = process.env.GMAIL_USER
  const gmailAppPassword = process.env.GMAIL_APP_PASSWORD

  if (!gmailUser || !gmailAppPassword) {
    throw new Error('Missing Gmail reminder environment variables')
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const overdueCount = bills.filter(bill => getDaysUntilDue(bill.due_date, today) < 0).length
  const dueTodayCount = bills.filter(bill => getDaysUntilDue(bill.due_date, today) === 0).length
  const lines = bills.map(bill => {
    const daysUntilDue = getDaysUntilDue(bill.due_date, today)
    return `${getDueLabel(daysUntilDue)} — ${bill.name}: ${formatCurrency(bill.amount)} due ${formatDateOnly(bill.due_date)}`
  })

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: gmailUser, pass: gmailAppPassword },
  })

  await transporter.sendMail({
    from: `"Family Finance" <${gmailUser}>`,
    to,
    subject: getReminderSubject(bills.length, overdueCount, dueTodayCount),
    text: [
      `Bills overdue or due in the next ${reminderWindowDays} days:`,
      '',
      ...lines,
      '',
      'Weekend due dates are moved to the Friday before.',
    ].join('\n'),
  })
}

function getDaysUntilDue(dueDate: string, today = new Date()) {
  return differenceInCalendarDays(parseDateOnly(dueDate), today)
}

function getDueLabel(daysUntilDue: number) {
  if (daysUntilDue < 0) return `${Math.abs(daysUntilDue)} day${Math.abs(daysUntilDue) === 1 ? '' : 's'} overdue`
  if (daysUntilDue === 0) return 'Due today'
  return `Due in ${daysUntilDue} day${daysUntilDue === 1 ? '' : 's'}`
}

function getReminderSubject(count: number, overdueCount: number, dueTodayCount: number) {
  if (overdueCount > 0) {
    return `Family Finance: ${overdueCount} overdue bill${overdueCount === 1 ? '' : 's'}`
  }

  if (dueTodayCount > 0) {
    return `Family Finance: ${dueTodayCount} bill${dueTodayCount === 1 ? '' : 's'} due today`
  }

  return `Family Finance: ${count} bill${count === 1 ? '' : 's'} due this week`
}

function getBillPreview(bills: Bill[]) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return bills.map(bill => ({
    id: bill.id,
    name: bill.name,
    amount: bill.amount,
    due_date: bill.due_date,
    status: getDueLabel(getDaysUntilDue(bill.due_date, today)),
  }))
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
    const url = new URL(request.url)
    const dryRun = url.searchParams.get('dryRun') === '1' || url.searchParams.get('dryRun') === 'true'
    const force = url.searchParams.get('force') === '1' || url.searchParams.get('force') === 'true'

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
    const billsToSend = force
      ? candidates
      : candidates.filter(bill => !alreadySent.has(`${bill.id}:${bill.due_date}`))

    if (billsToSend.length === 0) {
      return NextResponse.json({ sent: false, count: 0, dryRun, bills: [] })
    }

    if (dryRun) {
      return NextResponse.json({
        sent: false,
        dryRun: true,
        count: billsToSend.length,
        bills: getBillPreview(billsToSend),
      })
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

    return NextResponse.json({
      sent: true,
      count: billsToSend.length,
      bills: getBillPreview(billsToSend),
    })
  } catch (error) {
    console.error('Reminder job failed:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Reminder job failed' },
      { status: 500 }
    )
  }
}
