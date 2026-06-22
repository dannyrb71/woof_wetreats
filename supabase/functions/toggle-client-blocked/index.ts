import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ADMIN_EMAIL = Deno.env.get('ADMIN_EMAIL')!

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: CORS_HEADERS })
  }

  // 1. Verify the caller is the admin by checking their JWT email
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return new Response('Missing Authorization header', { status: 401, headers: CORS_HEADERS })
  }

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user }, error: userError } = await userClient.auth.getUser()

  if (userError || !user) {
    return new Response('Unauthorized', { status: 401, headers: CORS_HEADERS })
  }

  if (user.email !== ADMIN_EMAIL) {
    return new Response('Forbidden', { status: 403, headers: CORS_HEADERS })
  }

  // 2. Parse and validate body
  let body: { client_id: string; blocked: boolean }
  try {
    body = await req.json()
  } catch {
    return new Response('Invalid JSON body', { status: 400, headers: CORS_HEADERS })
  }

  const { client_id, blocked } = body
  if (typeof client_id !== 'string' || typeof blocked !== 'boolean') {
    return new Response('client_id (string) and blocked (boolean) are required', { status: 400, headers: CORS_HEADERS })
  }

  // 3. Perform the update using service_role — server-side only, never in browser
  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  const { error } = await adminClient
    .from('clients')
    .update({ blocked })
    .eq('id', client_id)

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    })
  }

  return new Response(JSON.stringify({ ok: true, client_id, blocked }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  })
})
