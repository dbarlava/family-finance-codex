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

async function requireUser(request: Request) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const { data, error } = await getAnonClient().auth.getUser(token)
  if (error || !data.user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  return { user: data.user }
}

export async function GET(request: Request) {
  const auth = await requireUser(request)
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
  const auth = await requireUser(request)
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

    const { data, error } = await admin.auth.admin.generateLink({
      type: 'invite',
      email,
      options: {
        redirectTo: `${new URL(request.url).origin}/login`,
      },
    })

    if (error) throw error

    return NextResponse.json({
      inviteLink: data.properties.action_link,
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
