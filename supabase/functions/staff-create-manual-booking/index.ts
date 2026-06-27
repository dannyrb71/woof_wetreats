// staff-create-manual-booking
// Lets staff record a booking for a client who has NO account yet (hasn't signed
// up, a self-booking failed, or they contacted staff directly) so the schedule
// stays accurate. Creates a lightweight "manual" client (auth_id NULL,
// is_manual = true) and attaches the reservation to it.
//
// Gated by the app_settings flag `manual_booking_enabled`. When that flag is
// off, this endpoint refuses the request (the UI also hides the entry point).
//
// PERMISSIONS NOTE (flag for later): for now ANY authenticated staff member may
// use this when the feature is enabled. Once role-based staff permissions exist,
// this MUST be restricted to manager/admin-only. Do not rely on this staying
// open to all staff.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY         = Deno.env.get('SUPABASE_ANON_KEY')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey',
}
function json(b: unknown, s = 200) { return new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } }) }

async function isStaff(admin: ReturnType<typeof createClient>, email: string | undefined): Promise<boolean> {
  if (!email) return false
  const { data } = await admin.from('staff_members').select('id').ilike('email', email).maybeSingle()
  return !!data
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'Missing Authorization header' }, 401)

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } })
  const { data: { user }, error: uErr } = await userClient.auth.getUser()
  if (uErr || !user) return json({ error: 'Unauthorized' }, 401)

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  if (!(await isStaff(admin, user.email))) return json({ error: 'Forbidden' }, 403)

  // Feature gate — must be enabled in Settings.
  const { data: setting } = await admin.from('app_settings').select('value').eq('key', 'manual_booking_enabled').maybeSingle()
  if (setting?.value !== 'true') return json({ error: 'Manual booking is currently disabled in Settings.' }, 403)

  let body: {
    client_name?: string; client_phone?: string
    service_type?: 'boarding' | 'daycare'
    dropoff_date?: string; dropoff_time?: string; pickup_date?: string; pickup_time?: string
    payment_method?: 'cash' | 'venmo'; total_price?: number; care_notes?: string
  } = {}
  try { body = await req.json() } catch { return json({ error: 'Invalid JSON body' }, 400) }

  const name = body.client_name?.trim()
  const { service_type, dropoff_date, dropoff_time, payment_method } = body
  const pickup_date = service_type === 'daycare' ? dropoff_date : body.pickup_date
  const pickup_time = body.pickup_time
  if (!name || !service_type || !dropoff_date || !dropoff_time || !pickup_date || !pickup_time || !payment_method)
    return json({ error: 'Missing required fields.' }, 400)
  if (service_type === 'boarding' && pickup_date <= dropoff_date)
    return json({ error: 'Pick-up must be after drop-off.' }, 422)
  const total = typeof body.total_price === 'number' && isFinite(body.total_price) && body.total_price >= 0 ? body.total_price : 0

  // Split the entered name into first/last for display consistency.
  const parts = name.split(/\s+/)
  const first_name = parts[0]
  const last_name  = parts.slice(1).join(' ') || ''

  // Create the lightweight manual client. Required NOT NULL text fields are set
  // to empty placeholders; email is synthetic-unique to satisfy any uniqueness.
  const placeholderEmail = `manual+${crypto.randomUUID()}@placeholder.local`
  // NOTE: full_name is a generated column (first_name + ' ' + last_name); never insert it.
  const { data: client, error: cErr } = await admin.from('clients').insert({
    auth_id: null, is_manual: true,
    first_name, last_name,
    phone: body.client_phone?.trim() || '', email: placeholderEmail,
    address: '', emergency_contact_name: '', emergency_contact_phone: '',
    vet_name: '', vet_phone: '', vet_address: '',
    blocked: false, meet_greet_status: 'completed',
  }).select('id').single()
  if (cErr || !client) return json({ error: 'Could not create manual client: ' + (cErr?.message ?? '') }, 500)

  // Derive status from dates (mirrors the normal create path).
  const today = new Date().toISOString().slice(0, 10)
  const status = service_type === 'daycare'
    ? (dropoff_date > today ? 'upcoming' : dropoff_date < today ? 'completed' : 'in_progress')
    : (today < dropoff_date ? 'upcoming' : today > pickup_date ? 'completed' : 'in_progress')

  const { data: reservation, error: rErr } = await admin.from('reservations').insert({
    client_id: client.id, service_type,
    dropoff_date, dropoff_time, pickup_date, pickup_time,
    payment_method, total_price: total, status,
    care_notes: body.care_notes?.trim() || null,
  }).select('id').single()
  if (rErr || !reservation) {
    // Roll back the orphan client if the reservation failed.
    await admin.from('clients').delete().eq('id', client.id)
    return json({ error: 'Could not create reservation: ' + (rErr?.message ?? '') }, 500)
  }

  return json({ ok: true, client_id: client.id, reservation_id: reservation.id })
})
