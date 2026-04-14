import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getSupabaseUrl() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!supabaseUrl) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL')
  return supabaseUrl
}

function getAdminClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRoleKey) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY')

  return createClient(getSupabaseUrl(), serviceRoleKey, {
    auth: { persistSession: false },
  })
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const email = String(body.email || '').trim().toLowerCase()
    const password = String(body.password || '')
    const householdName = String(body.householdName || '').trim()

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }

    if (password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
    }

    if (!householdName) {
      return NextResponse.json({ error: 'Household name is required' }, { status: 400 })
    }

    const admin = getAdminClient()
    const { data: userData, error: userError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })

    if (userError) throw userError
    if (!userData.user) throw new Error('Could not create user')

    const { data: household, error: householdError } = await admin
      .from('households')
      .insert({
        name: householdName,
        created_by: userData.user.id,
      })
      .select('id,name')
      .single()

    if (householdError) throw householdError

    const { error: memberError } = await admin.from('household_members').insert({
      household_id: household.id,
      user_id: userData.user.id,
      email,
      role: 'owner',
    })

    if (memberError) throw memberError

    const { error: balanceError } = await admin.from('balance').insert({
      household_id: household.id,
      amount: 0,
    })

    if (balanceError) throw balanceError

    return NextResponse.json({
      user: {
        id: userData.user.id,
        email: userData.user.email,
      },
      household,
    })
  } catch (error) {
    console.error('Could not create signup:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not create account' },
      { status: 500 }
    )
  }
}
