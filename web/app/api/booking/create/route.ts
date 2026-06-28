import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { calculatePrice } from '@/lib/pricing-engine'
import type { PaymentMethod, ServiceType, RateTable } from '@/lib/pricing-engine'
import { TERMS_VERSION } from '@/lib/terms'

// ── Server-side client (uses caller's session cookie) ──────────
function makeClient() {
  const cookieStore = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {},   // read-only in route handlers
      },
    }
  )
}

// ── POST /api/booking/create ───────────────────────────────────
export async function POST(req: NextRequest) {
  const supabase = makeClient()

  // 1. Auth: must be a logged-in, non-blocked, complete-profile client
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Staff cannot create client reservations via this endpoint
  const { data: isAdmin } = await supabase.rpc('is_admin')
  if (isAdmin) {
    return NextResponse.json({ error: 'Staff must use the staff dashboard' }, { status: 403 })
  }

  // Resolve client_id + meet_greet_status from the owner-scoped view (no service role needed)
  const { data: clientRow } = await supabase
    .from('clients_client_view')
    .select('id, meet_greet_status')
    .single()
  if (!clientRow?.id) {
    return NextResponse.json({ error: 'Client profile not found' }, { status: 403 })
  }
  const clientId = clientRow.id

  // Blocked check — the view excludes `blocked`, so read it via service role.
  // Guarded so a missing key never silently changes behaviour.
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const adminSb = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { cookies: { getAll: () => [], setAll: () => {} } }
    )
    const { data: clientBlocked } = await adminSb
      .from('clients').select('blocked').eq('id', clientId).single()
    if (clientBlocked?.blocked) {
      return NextResponse.json(
        { error: 'Your account is not currently accepting new reservations. Please contact us directly.' },
        { status: 403 }
      )
    }
  }

  // Meet & Greet gate — a completed Meet & Greet is required before any booking
  if (clientRow.meet_greet_status !== 'completed') {
    const status = clientRow.meet_greet_status ?? 'needed'
    let message: string
    if (status === 'scheduled') {
      // Surface the scheduled date so the client knows when it is (owner-read RLS)
      const { data: mg } = await supabase
        .from('meet_greets')
        .select('scheduled_date, scheduled_time')
        .eq('client_id', clientId)
        .eq('status', 'scheduled')
        .order('scheduled_date', { ascending: true })
        .limit(1)
        .maybeSingle()
      if (mg?.scheduled_date) {
        const d = new Date(mg.scheduled_date + 'T00:00:00')
        const dateStr = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
        message = `Your Meet & Greet is scheduled for ${dateStr}. You'll be able to book once it's complete.`
      } else {
        message = "Your Meet & Greet is scheduled. You'll be able to book once it's complete."
      }
    } else {
      // 'needed' or 'requested'
      message = status === 'requested'
        ? "Your Meet & Greet request has been received. We'll reach out to schedule it — booking opens once it's complete."
        : 'A Meet & Greet is required before your first stay. Please request one from your dashboard.'
    }
    return NextResponse.json({ error: message }, { status: 403 })
  }

  // 2. Parse and basic-validate request body
  let body: {
    service_type:   ServiceType
    dropoff_date:   string
    dropoff_time:   string
    pickup_date:    string
    pickup_time:    string
    payment_method: PaymentMethod
    dog_ids:        string[]
    care_notes?:    string
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { service_type, dropoff_date, dropoff_time,
          pickup_date, pickup_time, payment_method,
          dog_ids, care_notes } = body

  // Required fields
  if (!service_type || !dropoff_date || !dropoff_time ||
      !pickup_date  || !pickup_time  || !payment_method ||
      !dog_ids?.length) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // 3. Server-side date validation
  const todayStr = new Date().toISOString().slice(0, 10)
  if (dropoff_date < todayStr) {
    return NextResponse.json({ error: 'Drop-off date cannot be in the past' }, { status: 422 })
  }
  if (service_type === 'boarding' && pickup_date <= dropoff_date) {
    return NextResponse.json({ error: 'Pick-up date must be after drop-off date' }, { status: 422 })
  }

  // 4. Verify the selected dogs belong to this client and are active
  const { data: dogs, error: dogsErr } = await supabase
    .from('dogs')
    .select('id, birthdate')
    .eq('active', true)
    .in('id', dog_ids)
  if (dogsErr || !dogs?.length) {
    return NextResponse.json({ error: 'Invalid dog selection' }, { status: 422 })
  }
  // All requested dog_ids must be owned by this client (enforced via RLS on dogs table)
  if (dogs.length !== dog_ids.length) {
    return NextResponse.json({ error: 'One or more dogs not found or not active' }, { status: 422 })
  }

  // 5. Check no selected dates fall on blocked_dates
  const datesToCheck = [dropoff_date]
  if (service_type === 'boarding') {
    // Check every night of the stay
    const d = new Date(dropoff_date + 'T00:00:00')
    const end = new Date(pickup_date + 'T00:00:00')
    while (d < end) {
      datesToCheck.push(d.toISOString().slice(0, 10))
      d.setDate(d.getDate() + 1)
    }
  }
  const { data: blocked } = await supabase
    .from('blocked_dates')
    .select('date')
    .in('date', datesToCheck)
  if (blocked?.length) {
    return NextResponse.json({
      error: "You've requested a stay that includes days we're unavailable. This request can't move forward as-is — please choose different dates or contact us directly.",
    }, { status: 422 })
  }

  // 6. Server-side price calculation — this is what gets stored, never the client value.
  //    Rates come from the DB (pricing_rates) via the security-definer RPC, so the
  //    price reflects the rates in effect AT BOOKING TIME and can't be tampered with.
  const { data: rates, error: ratesErr } = await supabase.rpc('get_pricing_rates')
  if (ratesErr || !rates) {
    return NextResponse.json({ error: 'Could not load pricing. Please try again.' }, { status: 500 })
  }
  let serverPrice: number
  try {
    const result = calculatePrice({
      service_type,
      dropoff_date,
      pickup_date: service_type === 'daycare' ? dropoff_date : pickup_date,
      dogs: dogs.map((d: { id: string; birthdate: string }) => ({
        id:        d.id,
        birthdate: d.birthdate,
      })),
      payment_method,
    }, rates as RateTable)
    serverPrice = result.total
  } catch {
    // Long stays (>14 nights) are no longer blocked — they price normally on the
    // extended rate. Any throw here is a genuine calculation failure.
    return NextResponse.json({ error: 'Pricing calculation failed' }, { status: 500 })
  }

  // 7. Insert reservation — status is always 'upcoming' on creation
  const { data: reservation, error: resErr } = await supabase
    .from('reservations')
    .insert({
      client_id:      clientId,
      service_type,
      dropoff_date,
      dropoff_time,
      pickup_date:    service_type === 'daycare' ? dropoff_date : pickup_date,
      pickup_time,
      payment_method,
      total_price:       serverPrice,
      status:            'upcoming',
      care_notes:        care_notes?.trim() || null,
      // Record Terms acceptance at the moment the booking is created.
      // Server-stamped so the timestamp can't be spoofed by the client.
      terms_accepted_at: new Date().toISOString(),
      terms_version:     TERMS_VERSION,
    })
    .select('id, service_type, dropoff_date, dropoff_time, pickup_date, pickup_time, payment_method, total_price, status')
    .single()

  if (resErr || !reservation) {
    console.error('reservation insert error:', resErr)
    return NextResponse.json({ error: 'Failed to create reservation' }, { status: 500 })
  }

  // 8. Insert reservation_dogs join rows
  const { error: rdErr } = await supabase
    .from('reservation_dogs')
    .insert(dogs.map((d: { id: string }) => ({
      reservation_id: reservation.id,
      dog_id:         d.id,
    })))

  if (rdErr) {
    // Roll back the reservation if dog links fail
    await supabase.from('reservations').delete().eq('id', reservation.id)
    console.error('reservation_dogs insert error:', rdErr)
    return NextResponse.json({ error: 'Failed to link dogs to reservation' }, { status: 500 })
  }

  // Notification fires automatically via the DB trigger on reservations INSERT.

  return NextResponse.json({ reservation }, { status: 201 })
}
