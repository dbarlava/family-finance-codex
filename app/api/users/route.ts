import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import nodemailer from 'nodemailer'

async function sendInviteEmail(to: string, inviteLink: string, appUrl: string) {
  const gmailUser = process.env.GMAIL_USER
  const gmailAppPassword = process.env.GMAIL_APP_PASSWORD

  if (!gmailUser || !gmailAppPassword) {
    console.warn('Gmail SMTP not configured — skipping invite email, use the link manually.')
    return false
  }

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
            <h2 style="margin:0 0 8px;font-size:18px;font-weight:600;color:#111827">You're invited!</h2>
            <p style="margin:0 0 24px;font-size:15px;color:#6b7280;line-height:1.6">
              You've been invited to join your family's Finance dashboard — a shared view of household bills, transactions, and balance.
            </p>
            <a href="${inviteLink}" style="display:block;background:#111827;color:#ffffff;text-align:center;padding:14px 24px;border-radius:8px;font-size:15px;font-weight:600;text-decoration:none;margin-bottom:24px">
              Accept Invite &amp; Set Up Account →
            </a>
            <p style="margin:0 0 8px;font-size:13px;color:#9ca3af">
              This link expires in 24 hours. If it stops working, ask the family admin to send a new invite.
            </p>
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
      subject: "You've been invited to Family Finance",
      html,
      text: `You've been invited to join your family's Finance dashboard.\n\nClick the link below to accept your invite and set up your account:\n\n${inviteLink}\n\nThis link expires in 24 hours.`,
    })
    return true
  } catch (err) {
    console.error('Invite email failed:', err)
    return false
  }
}

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

function getAcceptInviteLink(appUrl: string, tokenHash: string) {
  const inviteUrl = new URL('/accept-invite', appUrl)
  inviteUrl.searchParams.set('token_hash', tokenHash)
  inviteUrl.searchParams.set('type', 'invite')
  return inviteUrl.toString()
}

async function requireAdmin(request: Request) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const { data, error } = await getAnonClient().auth.getUser(token)
  if (error || !data.user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const adminEmail = process.env.ADMIN_EMAIL
  if (!adminEmail || data.user.email !== adminEmail) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }

  return { user: data.user }
}

export async function GET(request: Request) {
  const auth = await requireAdmin(request)
  if ('error' in auth) return auth.error

  try {
    const { data, error } = await getAdminClient().auth.admin.listUsers({
      page: 1,
      perPage: 100,
    })

    if (error) throw error

    return NextResponse.json({
      users: data.users.map(user => ({
        id: user.id,
        email: user.email,
        created_at: user.created_at,
        last_sign_in_at: user.last_sign_in_at,
        email_confirmed_at: user.email_confirmed_at,
      })),
    })
  } catch (error) {
    console.error('Could not list users:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not list users' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  const auth = await requireAdmin(request)
  if ('error' in auth) return auth.error

  try {
    const body = await request.json()
    const email = String(body.email || '').trim().toLowerCase()
    const mode = body.mode === 'create' ? 'create' : 'invite'
    const password = String(body.password || '')

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }

    const admin = getAdminClient()

    if (mode === 'create') {
      if (password.length < 8) {
        return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
      }

      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      })

      if (error) throw error

      return NextResponse.json({
        user: {
          id: data.user.id,
          email: data.user.email,
          created_at: data.user.created_at,
        },
      })
    }

    const appUrl = getAppUrl(request)

    const { data, error } = await admin.auth.admin.generateLink({
      type: 'invite',
      email,
      options: {
        redirectTo: `${appUrl}/accept-invite`,
      },
    })

    if (error) throw error

    const inviteLink = data.properties.action_link
      || (data.properties.hashed_token ? getAcceptInviteLink(appUrl, data.properties.hashed_token) : '')
    if (!inviteLink) {
      throw new Error('Supabase did not return an invite link')
    }

    const emailSent = await sendInviteEmail(email, inviteLink, appUrl)

    return NextResponse.json({
      inviteLink,
      emailSent,
      user: {
        id: data.user.id,
        email: data.user.email,
        created_at: data.user.created_at,
      },
    })
  } catch (error) {
    console.error('Could not save user:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not save user' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: Request) {
  const auth = await requireAdmin(request)
  if ('error' in auth) return auth.error

  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('id')

    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 })
    }

    if (userId === auth.user.id) {
      return NextResponse.json({ error: 'You cannot delete your own admin account' }, { status: 400 })
    }

    const { error } = await getAdminClient().auth.admin.deleteUser(userId)
    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Could not delete user:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not delete user' },
      { status: 500 }
    )
  }
}
