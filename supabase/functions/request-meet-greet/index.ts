import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY         = Deno.env.get('SUPABASE_ANON_KEY')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const PUSHOVER_API             = 'https://api.pushover.net/1/messages.json'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'Missing Authorization header' }, 401)

  // Identify the calling user from their session token
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user }, error: userErr } = await userClient.auth.getUser()
  if (userErr || !user) return json({ error: 'Unauthorized' }, 401)

  // The client must affirmatively accept the House Rules & Terms (checkbox)
  let body: { accepted?: boolean; terms_version?: string } = {}
  try { body = await req.json() } catch { /* empty body */ }
  if (body.accepted !== true) {
    return json({ error: 'You must agree to the House Rules and Terms of Service to request a Meet & Greet.' }, 400)
  }
  const termsVersion = typeof body.terms_version === 'string' ? body.terms_version : 'unknown'

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  // Resolve the client row owned by this auth user
  const { data: client, error: cErr } = await admin
    .from('clients')
    .select('id, full_name, meet_greet_status')
    .eq('auth_id', user.id)
    .single()
  if (cErr || !client) return json({ error: 'Client profile not found' }, 404)

  // Only a client in the 'needed' state may request
  if (client.meet_greet_status !== 'needed') {
    return json({ error: 'A Meet & Greet has already been requested or scheduled.', meet_greet_status: client.meet_greet_status }, 409)
  }

  const { error: upErr } = await admin
    .from('clients')
    .update({
      meet_greet_status: 'requested',
      // Record affirmative acceptance — server-stamped timestamp + the version shown
      meet_greet_terms_accepted_at: new Date().toISOString(),
      meet_greet_terms_version:     termsVersion,
    })
    .eq('id', client.id)
  if (upErr) return json({ error: upErr.message }, 500)

  // Fire Pushover notification to staff (non-fatal if it fails)
  try {
    const token = Deno.env.get('PUSHOVER_TOKEN')
    const userKey = Deno.env.get('PUSHOVER_USER_KEY')
    if (token && userKey) {
      const pushRes = await fetch(PUSHOVER_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          user: userKey,
          title: 'New Meet & Greet Request',
          message: `New Meet & Greet request from ${client.full_name ?? 'a client'}`,
          priority: 0,
        }),
      })
      console.log('Pushover response:', JSON.stringify(await pushRes.json()))
    } else {
      console.warn('Pushover env vars missing; skipping notification')
    }
  } catch (e) {
    console.error('Pushover send failed:', e)
  }

  return json({ ok: true, meet_greet_status: 'requested' })
})
