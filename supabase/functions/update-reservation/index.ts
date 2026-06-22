import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY         = Deno.env.get('SUPABASE_ANON_KEY')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey',
}

// ── Pricing engine (inlined) ────────────────────────────────
type PaymentMethod = 'cash' | 'venmo'
type ServiceType   = 'boarding' | 'daycare'
type RateType      = 'regular' | 'extended' | 'holiday' | 'daycare'
interface DogInput        { id: string; birthdate: string }
interface PricingInput    { service_type: ServiceType; dropoff_date: string; pickup_date: string; dogs: DogInput[]; payment_method: PaymentMethod }
interface PricingOptions  { skipMaxStayCheck?: boolean }
interface DogPeriodCost   { dog_id: string; base_rate: number; puppy_surcharge: number; subtotal: number }
interface PeriodBreakdown { date: string; type: RateType; dogs: DogPeriodCost[]; subtotal: number }
interface PricingResult   { total: number; total_nights: number; is_extended: boolean; breakdown: PeriodBreakdown[] }

const MAX_NIGHTS = 14, EXTENDED_THRESHOLD = 8
interface RateTable {
  regular_1st_cash: number; regular_extra_cash: number
  extended_1st_cash: number; extended_extra_cash: number
  holiday_1st_cash: number; holiday_extra_cash: number
  daycare_1st_cash: number; venmo_surcharge: number; puppy_surcharge: number
}
function _cash(r: RateTable, t: RateType, first: boolean): number {
  switch (t) {
    case 'regular':  return first ? r.regular_1st_cash  : r.regular_extra_cash
    case 'extended': return first ? r.extended_1st_cash : r.extended_extra_cash
    case 'holiday':  return first ? r.holiday_1st_cash  : r.holiday_extra_cash
    case 'daycare':  return r.daycare_1st_cash
  }
}
function _rate(r: RateTable, t: RateType, first: boolean, pm: PaymentMethod): number {
  const c = _cash(r, t, first); return pm === 'venmo' ? c + r.venmo_surcharge : c
}
const _pd  = (s: string) => { const [y,m,d]=s.split('-').map(Number); return new Date(y,m-1,d) }
const _fd  = (d: Date)   => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
const _ad  = (d: Date, n: number) => { const r=new Date(d); r.setDate(r.getDate()+n); return r }
const _dd  = (a: Date, b: Date)  => Math.round((b.getTime()-a.getTime())/86400000)
const _pup = (bd: string, nd: string) => { const b=_pd(bd),n=_pd(nd); return n < new Date(b.getFullYear()+1,b.getMonth(),b.getDate()) }
const _nth = (y: number,mo: number,wd: number,nth: number) => { const f=new Date(y,mo-1,1); let d=wd-f.getDay(); if(d<0)d+=7; return new Date(y,mo-1,1+d+(nth-1)*7) }
const _lwd = (y: number,mo: number,wd: number) => { const l=new Date(y,mo,0); let d=l.getDay()-wd; if(d<0)d+=7; return new Date(l.getFullYear(),l.getMonth(),l.getDate()-d) }
function _fmw(dates: Set<string>, h: Date) { const off: Record<number,number>={5:0,6:-1,0:-2,1:-3}; const fr=_ad(h,off[h.getDay()]); for(let i=0;i<4;i++) dates.add(_fd(_ad(fr,i))) }
function _hol(y: number): Set<string> {
  const d=new Set<string>(); d.add(`${y}-01-01`); d.add(`${y}-12-31`)
  _fmw(d,_nth(y,2,1,3)); _fmw(d,_lwd(y,5,1)); _fmw(d,_nth(y,9,1,1))
  for(const fd of [new Date(y,6,4),new Date(y,10,11)]) { const dw=fd.getDay(); if(dw===2||dw===3||dw===4) d.add(_fd(fd)); else _fmw(d,fd) }
  const tg=_nth(y,11,4,4); for(let i=0;i<4;i++) d.add(_fd(_ad(tg,i)))
  d.add(`${y}-12-24`); d.add(`${y}-12-25`); return d
}
function _hs(drop: string, pick: string): Set<string> {
  const all=new Set<string>(); for(let y=_pd(drop).getFullYear();y<=_pd(pick).getFullYear();y++) for(const x of _hol(y)) all.add(x); return all
}
function calcPrice(input: PricingInput, rates: RateTable, opts: PricingOptions={}): PricingResult {
  const {dropoff_date,pickup_date,dogs,payment_method}=input
  const drop=_pd(dropoff_date),pick=_pd(pickup_date),tn=_dd(drop,pick)
  if(tn>MAX_NIGHTS&&!opts.skipMaxStayCheck) throw new Error(`Stay of ${tn} nights exceeds the 14-night self-service maximum.`)
  const ext=tn>=EXTENDED_THRESHOLD,hs=_hs(dropoff_date,pickup_date)
  const bd: PeriodBreakdown[]=[]; let total=0
  for(let n=0;n<tn;n++) {
    const nd=_fd(_ad(drop,n)),rt: RateType=hs.has(nd)?'holiday':ext?'extended':'regular'
    const dc=dogs.map((dog,i): DogPeriodCost => { const br=_rate(rates,rt,i===0,payment_method),s=_pup(dog.birthdate,nd)?rates.puppy_surcharge:0; return{dog_id:dog.id,base_rate:br,puppy_surcharge:s,subtotal:br+s} })
    const nt=dc.reduce((s,d)=>s+d.subtotal,0); total+=nt; bd.push({date:nd,type:rt,dogs:dc,subtotal:nt})
  }
  return{total,total_nights:tn,is_extended:ext,breakdown:bd}
}
// ── End pricing engine ───────────────────────────────────────

function fmtDate(iso: string): string {
  const [y,m,d] = iso.split('-').map(Number)
  return new Date(y, m-1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function buildNotificationMessage(p: {
  newDropoff: string; newPickup: string
  prevDropoff: string; prevPickup: string
  newTotal: number; reason: string
}): string {
  const nd = `${fmtDate(p.newDropoff)}–${fmtDate(p.newPickup)}`
  const pd = `${fmtDate(p.prevDropoff)}–${fmtDate(p.prevPickup)}`
  return `Your reservation was updated: now ${nd} (was ${pd}). New total: $${p.newTotal}. Reason: ${p.reason}`
}

// Returns true if the given email is in staff_members (case-insensitive).
async function isStaff(admin: ReturnType<typeof createClient>, email: string | undefined): Promise<boolean> {
  if (!email) return false
  const { data } = await admin.from('staff_members').select('id').ilike('email', email).maybeSingle()
  return !!data
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: CORS_HEADERS })

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return new Response('Missing Authorization header', { status: 401, headers: CORS_HEADERS })

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } })
  const { data: { user }, error: userError } = await userClient.auth.getUser()
  if (userError || !user) return new Response('Unauthorized', { status: 401, headers: CORS_HEADERS })

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  // Authorize against the staff_members list (not a single hardcoded email)
  if (!(await isStaff(admin, user.email))) return new Response('Forbidden', { status: 403, headers: CORS_HEADERS })

  let body: { reservation_id: string; dropoff_date: string; pickup_date: string; payment_method?: string; dog_ids?: string[]; reason?: string }
  try { body = await req.json() } catch { return new Response('Invalid JSON body', { status: 400, headers: CORS_HEADERS }) }

  const { reservation_id, dropoff_date, pickup_date } = body
  if (!reservation_id || !dropoff_date || !pickup_date)
    return new Response('reservation_id, dropoff_date, and pickup_date are required', { status: 400, headers: CORS_HEADERS })

  const { data: res, error: resErr } = await admin
    .from('reservations')
    .select('id,service_type,dropoff_date,pickup_date,payment_method,total_price,status,client_id')
    .eq('id', reservation_id).single()
  if (resErr || !res) return new Response(JSON.stringify({ error: 'Reservation not found' }), { status: 404, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } })

  const datesChanging = dropoff_date !== res.dropoff_date || pickup_date !== res.pickup_date
  if (datesChanging && !body.reason?.trim())
    return new Response(JSON.stringify({ error: 'reason is required when changing reservation dates' }), { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } })
  const reason = body.reason?.trim() ?? ''

  const { data: curDogs } = await admin.from('reservation_dogs').select('dog_id').eq('reservation_id', reservation_id)
  const prevDogIds = (curDogs ?? []).map((r: { dog_id: string }) => r.dog_id)
  const effectiveDogIds = body.dog_ids ?? prevDogIds
  const effectivePM = (body.payment_method ?? res.payment_method) as PaymentMethod

  const { data: dogRows, error: dogErr } = await admin.from('dogs').select('id,birthdate').in('id', effectiveDogIds)
  if (dogErr || !dogRows) return new Response(JSON.stringify({ error: 'Could not fetch dog data' }), { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } })

  let dogs: DogInput[]
  try { dogs = effectiveDogIds.map((id: string) => { const r=dogRows.find((d: {id:string;birthdate:string})=>d.id===id); if(!r) throw new Error(`Dog ${id} not found`); return{id,birthdate:r.birthdate} }) }
  catch (e: any) { return new Response(JSON.stringify({ error: e.message }), { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }) }

  // Rates from the DB (single source of truth) — staff repricing uses current rates
  const { data: rates, error: ratesErr } = await admin.from('pricing_rates').select('*').eq('id', 1).single()
  if (ratesErr || !rates) return new Response(JSON.stringify({ error: 'Could not load pricing rates' }), { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } })

  let pricing: PricingResult
  try { pricing = calcPrice({ service_type: res.service_type as ServiceType, dropoff_date, pickup_date, dogs, payment_method: effectivePM }, rates as RateTable, { skipMaxStayCheck: true }) }
  catch (e: any) { return new Response(JSON.stringify({ error: e.message }), { status: 422, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }) }

  const notificationMessage = buildNotificationMessage({
    newDropoff: dropoff_date, newPickup: pickup_date,
    prevDropoff: res.dropoff_date, prevPickup: res.pickup_date,
    newTotal: pricing.total, reason,
  })

  const { error: rpcErr } = await admin.rpc('update_reservation_with_log', {
    p_reservation_id: reservation_id,
    p_new_dropoff_date: dropoff_date, p_new_pickup_date: pickup_date,
    p_new_payment_method: effectivePM, p_new_dog_ids: effectiveDogIds, p_new_total_price: pricing.total,
    p_prev_dropoff_date: res.dropoff_date, p_prev_pickup_date: res.pickup_date,
    p_prev_payment_method: res.payment_method, p_prev_dog_ids: prevDogIds, p_prev_total_price: res.total_price,
    p_reason: reason,
    p_notification_message: notificationMessage,
  })
  if (rpcErr) return new Response(JSON.stringify({ error: rpcErr.message }), { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } })

  return new Response(JSON.stringify({
    ok: true, reservation_id,
    previous: { dropoff_date: res.dropoff_date, pickup_date: res.pickup_date, payment_method: res.payment_method, total_price: res.total_price },
    updated:  { dropoff_date, pickup_date, payment_method: effectivePM, total_price: pricing.total, total_nights: pricing.total_nights, is_extended: pricing.is_extended, breakdown: pricing.breakdown },
    notification_sent: notificationMessage,
  }), { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } })
})
