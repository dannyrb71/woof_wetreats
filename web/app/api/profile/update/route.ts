import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// Personal (per-user) fields route to the co-owner's own columns when the
// signed-in user is the secondary owner. Shared fields update the household row.
const PERSONAL_FIELDS = ['first_name', 'last_name', 'phone'] as const
const SHARED_FIELDS = [
  'address', 'emergency_contact_name', 'emergency_contact_phone',
  'vet_name', 'vet_phone', 'vet_address', 'care_notes',
] as const

function makeSessionClient() {
  const cookieStore = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  )
}

export async function POST(req: NextRequest) {
  try {
    const supabase = makeSessionClient()

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: isAdmin } = await supabase.rpc('is_admin')
    if (isAdmin) return NextResponse.json({ error: 'Staff must use staff tools' }, { status: 403 })

    const { data: clientRow } = await supabase.from('clients_client_view').select('id, secondary_auth_id').single()
    if (!clientRow?.id) return NextResponse.json({ error: 'Client profile not found' }, { status: 403 })

    // Secondary owner edits their OWN name/phone (secondary_* columns).
    const isSecondary = clientRow.secondary_auth_id != null && session.user.id === clientRow.secondary_auth_id

    let body: Record<string, unknown>
    try { body = await req.json() } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    const clean = (v: unknown) => (typeof v === 'string' ? (v.trim() || null) : null)

    // Only update explicitly allowed fields — blocked, auth_id, id are never touched
    const update: Record<string, string | null> = {}
    for (const field of PERSONAL_FIELDS) {
      if (field in body) update[isSecondary ? `secondary_${field}` : field] = clean(body[field])
    }
    for (const field of SHARED_FIELDS) {
      if (field in body) update[field] = clean(body[field])
    }
    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    // Use the session client — RLS allows clients to update their own row.
    // The protect_blocked_column DB trigger ensures blocked can never be changed here.
    const { error } = await supabase
      .from('clients')
      .update(update)
      .eq('id', clientRow.id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[profile/update]', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
