import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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

async function getInvite(token: string) {
  const { data, error } = await getAdminClient()
    .from('household_invites')
    .select('id,household_id,email,accepted_at,expires_at,households(id,name)')
    .eq('token', token)
    .maybeSingle()

  if (error) throw error
  if (!data) throw new Error('This invite link is invalid.')
  if (data.accepted_at) throw new Error('This invite has already been accepted.')
  if (new Date(data.expires_at).getTime() < Date.now()) throw new Error('This invite has expired.')

  return data
}

export async function GET(request: Request) {
  try {
    const token = new URL(request.url).searchParams.get('token') || ''
    if (!token) return NextResponse.json({ error: 'Invite token is required' }, { status: 400 })

    const invite = await getInvite(token)
    const household = Array.isArray(invite.households) ? invite.households[0] : invite.households

    return NextResponse.json({
      invite: {
        email: invite.email,
        household: {
          id: household?.id,
          name: household?.name,
        },
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not load invite' },
      { status: 400 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const token = String(body.token || '')
    const email = String(body.email || '').trim().toLowerCase()
    const password = String(body.password || '')

    if (!token) return NextResponse.json({ error: 'Invite token is required' }, { status: 400 })

    const invite = await getInvite(token)
    const invitedEmail = String(invite.email || '').trim().toLowerCase()
    const authHeader = request.headers.get('authorization')?.replace('Bearer ', '')
    const admin = getAdminClient()
    let userId = ''
    let userEmail = ''
    let createdUser = false

    if (authHeader) {
      const { data, error } = await getAnonClient().auth.getUser(authHeader)
      if (error || !data.user) {
        return NextResponse.json({ error: 'Sign in again before accepting this invite.' }, { status: 401 })
      }
      userId = data.user.id
      userEmail = String(data.user.email || '').trim().toLowerCase()
    } else {
      if (!email) return NextResponse.json({ error: 'Email is required' }, { status: 400 })
      if (email !== invitedEmail) {
        return NextResponse.json({ error: `This invite was sent to ${invite.email}.` }, { status: 400 })
      }
      if (password.length < 8) {
        return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
      }

      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      })

      if (error) throw error
      if (!data.user) throw new Error('Could not create user')
      userId = data.user.id
      userEmail = email
      createdUser = true
    }

    if (userEmail !== invitedEmail) {
      return NextResponse.json({ error: `This invite was sent to ${invite.email}.` }, { status: 400 })
    }

    const { error: memberError } = await admin.from('household_members').upsert({
      household_id: invite.household_id,
      user_id: userId,
      email: userEmail,
      role: 'member',
    })

    if (memberError) throw memberError

    const { error: inviteError } = await admin
      .from('household_invites')
      .update({ accepted_at: new Date().toISOString() })
      .eq('id', invite.id)

    if (inviteError) throw inviteError

    return NextResponse.json({ ok: true, createdUser })
  } catch (error) {
    console.error('Could not accept household invite:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not accept invite' },
      { status: 500 }
    )
  }
}
