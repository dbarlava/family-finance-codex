import { randomBytes } from 'crypto'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import nodemailer from 'nodemailer'

function getSupabaseUrl() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!supabaseUrl) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL')
  return supabaseUrl
}

function getAnonClient() {
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!anonKey) throw new Error('Missing NEXT_PUBLIC_SUPABASE_ANON_KEY')

  return createClient(getSupabaseUrl(), anonKey, {
    auth: { persistSession: false },
  })
}

function getAdminClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRoleKey) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY')

  return createClient(getSupabaseUrl(), serviceRoleKey, {
    auth: { persistSession: false },
  })
}

function getAppUrl(request: Request) {
  const configuredUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL
  if (configuredUrl) {
    return configuredUrl.startsWith('http') ? configuredUrl : `https://${configuredUrl}`
  }

  return new URL(request.url).origin
}

async function getOwner(request: Request, householdId: string) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const { data, error } = await getAnonClient().auth.getUser(token)
  if (error || !data.user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const { data: membership, error: membershipError } = await getAdminClient()
    .from('household_members')
    .select('role')
    .eq('household_id', householdId)
    .eq('user_id', data.user.id)
    .maybeSingle()

  if (membershipError) {
    return {
      error: NextResponse.json(
        { error: membershipError.message || 'Could not check household access' },
        { status: 500 }
      ),
    }
  }

  if (membership?.role !== 'owner') {
    return { error: NextResponse.json({ error: 'Only the household owner can do that' }, { status: 403 }) }
  }

  return { user: data.user }
}

async function sendHouseholdInvite(to: string, householdName: string, inviteLink: string, appUrl: string) {
  const gmailUser = process.env.GMAIL_USER
  const gmailAppPassword = process.env.GMAIL_APP_PASSWORD

  if (!gmailUser || !gmailAppPassword) return false

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: gmailUser, pass: gmailAppPassword },
  })

  const html = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden">
        <tr>
          <td style="background:#111827;padding:32px;text-align:center">
            <div style="display:inline-block;width:56px;height:56px;line-height:56px;background:#374151;border-radius:10px;font-size:20px;font-weight:700;color:#ffffff;text-align:center">FF</div>
            <h1 style="margin:16px 0 0;font-size:22px;font-weight:700;color:#ffffff">Family Finance</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:32px">
            <h2 style="margin:0 0 8px;font-size:18px;font-weight:600;color:#111827">Join ${householdName}</h2>
            <p style="margin:0 0 24px;font-size:15px;color:#6b7280;line-height:1.6">
              You have been invited to join this household. Use your existing account or create one from the invite page.
            </p>
            <a href="${inviteLink}" style="display:block;background:#111827;color:#ffffff;text-align:center;padding:14px 24px;border-radius:8px;font-size:15px;font-weight:600;text-decoration:none;margin-bottom:24px">
              Accept Household Invite
            </a>
            <p style="margin:0;font-size:13px;color:#9ca3af">
              Or paste this URL into your browser:<br>
              <span style="color:#6b7280;word-break:break-all">${inviteLink}</span>
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 32px;border-top:1px solid #f3f4f6;text-align:center">
            <p style="margin:0;font-size:12px;color:#9ca3af">Family Finance · ${new URL(appUrl).hostname}</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`

  try {
    await transporter.sendMail({
      from: `"Family Finance" <${gmailUser}>`,
      to,
      subject: `You're invited to join ${householdName}`,
      html,
      text: `You have been invited to join ${householdName} in Family Finance.\n\nOpen this link to accept:\n\n${inviteLink}`,
    })
    return true
  } catch (error) {
    console.error('Household invite email failed:', error)
    return false
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json()
    const householdId = String(body.householdId || '')
    const name = String(body.name || '').trim()

    if (!householdId) return NextResponse.json({ error: 'Household is required' }, { status: 400 })
    if (!name) return NextResponse.json({ error: 'Household name is required' }, { status: 400 })

    const auth = await getOwner(request, householdId)
    if ('error' in auth) return auth.error

    const { data, error } = await getAdminClient()
      .from('households')
      .update({ name })
      .eq('id', householdId)
      .select('id,name,created_by,created_at')
      .single()

    if (error) throw error
    return NextResponse.json({ household: data })
  } catch (error) {
    console.error('Could not rename household:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not rename household' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const householdId = String(body.householdId || '')
    const email = String(body.email || '').trim().toLowerCase()

    if (!householdId) return NextResponse.json({ error: 'Household is required' }, { status: 400 })
    if (!email) return NextResponse.json({ error: 'Email is required' }, { status: 400 })

    const auth = await getOwner(request, householdId)
    if ('error' in auth) return auth.error

    const admin = getAdminClient()
    const { data: household, error: householdError } = await admin
      .from('households')
      .select('id,name')
      .eq('id', householdId)
      .single()

    if (householdError) throw householdError

    const token = randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

    const { error: inviteError } = await admin.from('household_invites').insert({
      household_id: householdId,
      email,
      token,
      invited_by: auth.user.id,
      expires_at: expiresAt,
    })

    if (inviteError) throw inviteError

    const appUrl = getAppUrl(request)
    const inviteUrl = new URL('/join-household', appUrl)
    inviteUrl.searchParams.set('token', token)
    const inviteLink = inviteUrl.toString()
    const emailSent = await sendHouseholdInvite(email, household.name, inviteLink, appUrl)

    return NextResponse.json({ inviteLink, emailSent })
  } catch (error) {
    console.error('Could not invite household member:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not send invite' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: Request) {
  try {
    const householdId = new URL(request.url).searchParams.get('householdId')
    if (!householdId) return NextResponse.json({ error: 'Household is required' }, { status: 400 })

    const auth = await getOwner(request, householdId)
    if ('error' in auth) return auth.error

    const { error } = await getAdminClient()
      .from('households')
      .delete()
      .eq('id', householdId)

    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Could not delete household:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not delete household' },
      { status: 500 }
    )
  }
}
