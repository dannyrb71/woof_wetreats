import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY         = Deno.env.get('SUPABASE_ANON_KEY')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } })
}

async function staffRow(admin: ReturnType<typeof createClient>, email: string | undefined) {
  if (!email) return null
  const { data } = await admin.from('staff_members').select('id, first_name, last_name').ilike('email', email).maybeSingle()
  return data
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'Missing Authorization header' }, 401)

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } })
  const { data: { user }, error: userErr } = await userClient.auth.getUser()
  if (userErr || !user) return json({ error: 'Unauthorized' }, 401)

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  // Only existing staff can invite new staff
  const adder = await staffRow(admin, user.email)
  if (!adder) return json({ error: 'Forbidden' }, 403)

  let body: { email?: string; first_name?: string; last_name?: string; redirect_to?: string } = {}
  try { body = await req.json() } catch { return json({ error: 'Invalid JSON body' }, 400) }

  const email      = (body.email ?? '').trim().toLowerCase()
  const firstName  = (body.first_name ?? '').trim()
  const lastName   = (body.last_name ?? '').trim()
  if (!EMAIL_RE.test(email)) return json({ error: 'Please enter a valid email address.' }, 400)
  if (!firstName || !lastName) return json({ error: 'First and last name are both required.' }, 400)

  const adderName = [adder.first_name, adder.last_name].filter(Boolean).join(' ') || user.email

  // 1. Add to staff_members (idempotent on email)
  const { data: existing } = await admin.from('staff_members').select('id').ilike('email', email).maybeSingle()
  let member
  if (!existing) {
    const { data: inserted, error: insErr } = await admin
      .from('staff_members')
      .insert({ email, first_name: firstName, last_name: lastName, added_by: adderName })
      .select('id, email, first_name, last_name, added_at, added_by')
      .single()
    if (insErr) return json({ error: 'Could not add staff member: ' + insErr.message }, 500)
    member = inserted
  } else {
    const { data: updated } = await admin
      .from('staff_members')
      .update({ first_name: firstName, last_name: lastName })
      .eq('id', existing.id)
      .select('id, email, first_name, last_name, added_at, added_by')
      .single()
    member = updated
  }

  // 2. Send the Supabase Auth invite email (sets password via the link).
  let invited = false
  let inviteNote = ''
  const redirectTo = typeof body.redirect_to === 'string' ? body.redirect_to : undefined
  const { error: invErr } = await admin.auth.admin.inviteUserByEmail(email, redirectTo ? { redirectTo } : undefined)
  if (invErr) {
    const msg = invErr.message.toLowerCase()
    if (msg.includes('already') || msg.includes('registered') || msg.includes('exists')) {
      inviteNote = 'This person already has an account; they can log in directly (or use Forgot password).'
    } else {
      inviteNote = 'Added to staff, but the invite email could not be sent: ' + invErr.message
    }
  } else {
    invited = true
  }

  return json({ ok: true, member, invited, note: inviteNote })
})
