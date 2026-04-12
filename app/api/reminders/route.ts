import { NextResponse } from 'next/server'
import { addDays, differenceInCalendarDays, format } from 'date-fns'
import { createClient } from '@supabase/supabase-js'
import nodemailer from 'nodemailer'
import { formatCurrency, formatDateOnly, parseDateOnly } from '@/lib/finance'
import type { Bill } from '@/lib/types'

const reminderWindowDays = 7

type ReminderLog = {
  bill_id: string
  due_date: string
  sent_to: string
}

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

function getAnonClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !anonKey) {
    throw new Error('Missing Supabase auth environment variables')
  }

  return createClient(supabaseUrl, anonKey, {
    auth: {
      persistSession: false,
    },
  })
}

async function isAdminRequest(request: Request) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    return true
  }

  const token = authHeader?.replace('Bearer ', '')
  if (!token) return false

  const { data, error } = await getAnonClient().auth.getUser(token)
  if (error || !data.user) return false

  const adminEmail = process.env.ADMIN_EMAIL
  return !!adminEmail && data.user.email === adminEmail
}

async function getReminderRecipients() {
  const fallbackEmail = process.env.REMINDER_TO_EMAIL
  const { data, error } = await getAdminClient().auth.admin.listUsers({
    page: 1,
    perPage: 100,
  })

  if (error) throw error

  const recipients = new Set(
    data.users
      .map(user => user.email?.trim().toLowerCase())
      .filter((email): email is string => !!email)
  )

  if (fallbackEmail) {
    recipients.add(fallbackEmail.trim().toLowerCase())
  }

  return Array.from(recipients)
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
  const total = bills.reduce((sum, bill) => sum + Number(bill.amount || 0), 0)
  const subject = getReminderSubject(bills.length, overdueCount, dueTodayCount)

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: gmailUser, pass: gmailAppPassword },
  })

  await transporter.sendMail({
    from: `"Family Finance" <${gmailUser}>`,
    to,
    subject,
    text: [
      `Bills overdue or due in the next ${reminderWindowDays} days:`,
      '',
      ...lines,
      '',
      `Total due: ${formatCurrency(total)}`,
      '',
      'Weekend due dates are moved to the Friday before.',
    ].join('\n'),
    html: getReminderHtml(bills, subject, total, today),
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

function getReminderHtml(bills: Bill[], subject: string, total: number, today: Date) {
  const rows = bills.map(bill => {
    const daysUntilDue = getDaysUntilDue(bill.due_date, today)
    const urgent = daysUntilDue <= 0
    const label = getDueLabel(daysUntilDue)

    return `
      <tr>
        <td style="padding:16px;border-bottom:1px solid #e5e7eb">
          <div style="font-size:15px;font-weight:700;color:#111827">${escapeHtml(bill.name)}</div>
          <div style="margin-top:4px;font-size:13px;color:#6b7280">Due ${formatDateOnly(bill.due_date)}</div>
        </td>
        <td style="padding:16px;border-bottom:1px solid #e5e7eb;text-align:right">
          <div style="font-size:15px;font-weight:700;color:#111827">${formatCurrency(Number(bill.amount || 0))}</div>
          <div style="display:inline-block;margin-top:6px;border-radius:999px;padding:4px 9px;background:${urgent ? '#fee2e2' : '#fef3c7'};color:${urgent ? '#b91c1c' : '#92400e'};font-size:12px;font-weight:700">${escapeHtml(label)}</div>
        </td>
      </tr>`
  }).join('')

  return `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111827">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden">
        <tr>
          <td style="background:#111827;padding:28px 32px">
            <div style="display:inline-block;width:48px;height:48px;line-height:48px;background:#374151;border-radius:8px;text-align:center;font-size:17px;font-weight:800;color:#ffffff">FF</div>
            <h1 style="margin:18px 0 0;font-size:22px;line-height:1.25;color:#ffffff">${escapeHtml(subject)}</h1>
            <p style="margin:8px 0 0;font-size:14px;line-height:1.5;color:#d1d5db">Here are the unpaid bills that need attention.</p>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 32px">
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
              ${rows}
              <tr>
                <td style="padding:16px;background:#f9fafb;font-size:14px;font-weight:700;color:#111827">Total due</td>
                <td style="padding:16px;background:#f9fafb;text-align:right;font-size:16px;font-weight:800;color:#111827">${formatCurrency(total)}</td>
              </tr>
            </table>
            <p style="margin:18px 0 0;font-size:13px;line-height:1.5;color:#6b7280">Weekend due dates are moved to the Friday before.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
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

function getBillsForRecipient(
  recipient: string,
  candidates: Bill[],
  existingLogs: ReminderLog[],
  force: boolean
) {
  if (force) return candidates

  const alreadySent = new Set(
    existingLogs
      .filter(log => log.sent_to === recipient)
      .map(log => `${log.bill_id}:${log.due_date}`)
  )

  return candidates.filter(bill => !alreadySent.has(`${bill.id}:${bill.due_date}`))
}

export async function GET(request: Request) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const url = new URL(request.url)
    const dryRun = url.searchParams.get('dryRun') === '1' || url.searchParams.get('dryRun') === 'true'
    const force = url.searchParams.get('force') === '1' || url.searchParams.get('force') === 'true'

    const supabase = getAdminClient()
    const recipients = await getReminderRecipients()
    if (recipients.length === 0) throw new Error('No reminder recipients found')

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
      return NextResponse.json({ sent: false, count: 0, recipientCount: recipients.length, recipients, bills: [] })
    }

    const billIds = candidates.map(bill => bill.id)
    const { data: existingLogs, error: logsError } = await supabase
      .from('reminder_log')
      .select('bill_id,due_date,sent_to')
      .in('sent_to', recipients)
      .in('bill_id', billIds)

    if (logsError) throw logsError

    const logs = (existingLogs || []) as ReminderLog[]
    const remindersByRecipient = recipients.map(recipient => ({
      recipient,
      bills: getBillsForRecipient(recipient, candidates, logs, force),
    })).filter(reminder => reminder.bills.length > 0)
    const previewBills = getBillPreview(candidates)

    if (remindersByRecipient.length === 0) {
      return NextResponse.json({ sent: false, count: 0, recipientCount: recipients.length, recipients, dryRun, bills: [] })
    }

    if (dryRun) {
      return NextResponse.json({
        sent: false,
        dryRun: true,
        count: candidates.length,
        recipientCount: remindersByRecipient.length,
        recipients: remindersByRecipient.map(reminder => reminder.recipient),
        bills: previewBills,
      })
    }

    await Promise.all(
      remindersByRecipient.map(reminder => sendReminderEmail(reminder.bills, reminder.recipient))
    )

    const { error: insertError } = await supabase.from('reminder_log').upsert(
      remindersByRecipient.flatMap(reminder => reminder.bills.map(bill => ({
        bill_id: bill.id,
        due_date: bill.due_date,
        sent_to: reminder.recipient,
      }))),
      {
        onConflict: 'bill_id,due_date,sent_to',
        ignoreDuplicates: true,
      }
    )

    if (insertError) throw insertError

    return NextResponse.json({
      sent: true,
      count: candidates.length,
      recipientCount: remindersByRecipient.length,
      recipients: remindersByRecipient.map(reminder => reminder.recipient),
      bills: previewBills,
    })
  } catch (error) {
    console.error('Reminder job failed:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Reminder job failed' },
      { status: 500 }
    )
  }
}
