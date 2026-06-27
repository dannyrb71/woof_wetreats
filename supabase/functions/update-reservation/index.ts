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

// ── Pricing engine (inlined; handles boarding AND daycare) ───────
type PaymentMethod = 'cash' | 'venmo'
type ServiceType   = 'boarding' | 'daycare'
type RateType      = 'regular' | 'extended' | 'holiday' | 'daycare'
interface RateTable { regular_1st_cash:number; regular_extra_cash:number; extended_1st_cash:number; extended_extra_cash:number; holiday_1st_cash:number; holiday_extra_cash:number; daycare_1st_cash:number; venmo_surcharge:number; puppy_surcharge:number }
const EXTENDED_THRESHOLD = 8
function _cash(r:RateTable,t:RateType,first:boolean):number{switch(t){case 'regular':return first?r.regular_1st_cash:r.regular_extra_cash;case 'extended':return first?r.extended_1st_cash:r.extended_extra_cash;case 'holiday':return first?r.holiday_1st_cash:r.holiday_extra_cash;case 'daycare':return r.daycare_1st_cash}}
function _rate(r:RateTable,t:RateType,first:boolean,pm:PaymentMethod):number{const c=_cash(r,t,first);return pm==='venmo'?c+r.venmo_surcharge:c}
const _pd=(s:string)=>{const[y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d)}
const _fd=(d:Date)=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
const _ad=(d:Date,n:number)=>{const r=new Date(d);r.setDate(r.getDate()+n);return r}
const _dd=(a:Date,b:Date)=>Math.round((b.getTime()-a.getTime())/86400000)
const _pup=(bd:string,nd:string)=>{const b=_pd(bd),n=_pd(nd);return n<new Date(b.getFullYear()+1,b.getMonth(),b.getDate())}
const _nth=(y:number,mo:number,wd:number,nth:number)=>{const f=new Date(y,mo-1,1);let d=wd-f.getDay();if(d<0)d+=7;return new Date(y,mo-1,1+d+(nth-1)*7)}
const _lwd=(y:number,mo:number,wd:number)=>{const l=new Date(y,mo,0);let d=l.getDay()-wd;if(d<0)d+=7;return new Date(l.getFullYear(),l.getMonth(),l.getDate()-d)}
function _fmw(dates:Set<string>,h:Date){const off:Record<number,number>={5:0,6:-1,0:-2,1:-3};const fr=_ad(h,off[h.getDay()]);for(let i=0;i<4;i++)dates.add(_fd(_ad(fr,i)))}
function _hol(y:number):Set<string>{const d=new Set<string>();d.add(`${y}-01-01`);d.add(`${y}-12-31`);_fmw(d,_nth(y,2,1,3));_fmw(d,_lwd(y,5,1));_fmw(d,_nth(y,9,1,1));for(const fd of [new Date(y,6,4),new Date(y,10,11)]){const dw=fd.getDay();if(dw===2||dw===3||dw===4)d.add(_fd(fd));else _fmw(d,fd)}const tg=_nth(y,11,4,4);for(let i=0;i<4;i++)d.add(_fd(_ad(tg,i)));d.add(`${y}-12-24`);d.add(`${y}-12-25`);return d}
function _hs(drop:string,pick:string):Set<string>{const all=new Set<string>();for(let y=_pd(drop).getFullYear();y<=_pd(pick).getFullYear();y++)for(const x of _hol(y))all.add(x);return all}
function calcTotal(service:ServiceType,drop:string,pick:string,dogs:{id:string;birthdate:string}[],pm:PaymentMethod,rates:RateTable):number{
  if(service==='daycare'){let t=0;for(const dog of dogs){t+=_rate(rates,'daycare',true,pm)+(_pup(dog.birthdate,drop)?rates.puppy_surcharge:0)}return t}
  const d0=_pd(drop),d1=_pd(pick),tn=_dd(d0,d1);const ext=tn>=EXTENDED_THRESHOLD,hs=_hs(drop,pick);let total=0
  for(let n=0;n<tn;n++){const nd=_fd(_ad(d0,n)),rt:RateType=hs.has(nd)?'holiday':ext?'extended':'regular';dogs.forEach((dog,i)=>{total+=_rate(rates,rt,i===0,pm)+(_pup(dog.birthdate,nd)?rates.puppy_surcharge:0)})}
  return total
}
// ── End pricing engine ───────────────────────────────────────

function fmtDate(iso: string): string {
  const [y,m,d] = iso.split('-').map(Number)
  return new Date(y, m-1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function buildNotificationMessage(p: { newDropoff: string; newPickup: string; prevDropoff: string; prevPickup: string; newTotal: number; reason: string }): string {
  const nd = `${fmtDate(p.newDropoff)}–${fmtDate(p.newPickup)}`
  const pd = `${fmtDate(p.prevDropoff)}–${fmtDate(p.prevPickup)}`
  return `Your reservation was updated: now ${nd} (was ${pd}). New total: $${p.newTotal}. Reason: ${p.reason}`
}

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
  const { data: { user }, error: userError } = await userClient.auth.getUser()
  if (userError || !user) return json({ error: 'Unauthorized' }, 401)

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  if (!(await isStaff(admin, user.email))) return json({ error: 'Forbidden' }, 403)

  let body: {
    reservation_id: string; service_type?: ServiceType
    dropoff_date: string; dropoff_time?: string; pickup_date: string; pickup_time?: string
    payment_method?: string; dog_ids?: string[]; reason?: string
    price_override?: number | null
  }
  try { body = await req.json() } catch { return json({ error: 'Invalid JSON body' }, 400) }

  const { reservation_id } = body
  if (!reservation_id) return json({ error: 'reservation_id is required' }, 400)

  const { data: res, error: resErr } = await admin
    .from('reservations')
    .select('id,service_type,dropoff_date,dropoff_time,pickup_date,pickup_time,payment_method,total_price,status,client_id')
    .eq('id', reservation_id).single()
  if (resErr || !res) return json({ error: 'Reservation not found' }, 404)

  // Effective values fall back to the current reservation when a field is omitted
  const service: ServiceType  = (body.service_type ?? res.service_type) as ServiceType
  const dropoff_date          = body.dropoff_date ?? res.dropoff_date
  const dropoff_time          = body.dropoff_time ?? res.dropoff_time
  // Daycare is a single day: pickup mirrors dropoff regardless of what was sent.
  const pickup_date           = service === 'daycare' ? dropoff_date : (body.pickup_date ?? res.pickup_date)
  const pickup_time           = body.pickup_time ?? res.pickup_time
  const effectivePM           = (body.payment_method ?? res.payment_method) as PaymentMethod

  if (service === 'boarding' && pickup_date <= dropoff_date)
    return json({ error: 'Pick-up must be after drop-off.' }, 422)

  const datesChanging = dropoff_date !== res.dropoff_date || pickup_date !== res.pickup_date
  if (datesChanging && !body.reason?.trim())
    return json({ error: 'reason is required when changing reservation dates' }, 400)
  const reason = body.reason?.trim() ?? ''

  const { data: curDogs } = await admin.from('reservation_dogs').select('dog_id').eq('reservation_id', reservation_id)
  const prevDogIds = (curDogs ?? []).map((r: { dog_id: string }) => r.dog_id)
  const effectiveDogIds = body.dog_ids ?? prevDogIds

  const { data: dogRows, error: dogErr } = await admin.from('dogs').select('id,birthdate').in('id', effectiveDogIds)
  if (dogErr || !dogRows) return json({ error: 'Could not fetch dog data' }, 500)

  let dogs: { id: string; birthdate: string }[]
  try { dogs = effectiveDogIds.map((id: string) => { const r=dogRows.find((d: {id:string;birthdate:string})=>d.id===id); if(!r) throw new Error(`Dog ${id} not found`); return{id,birthdate:r.birthdate} }) }
  catch (e) { return json({ error: (e as Error).message }, 400) }

  // ── Price: explicit override wins and is recorded as overridden so later
  //    edits never silently recalculate it away. Otherwise recompute from rates.
  const ov = body.price_override
  const hasOverride = typeof ov === 'number' && isFinite(ov) && ov >= 0
  let total_price: number
  let price_overridden: boolean
  if (hasOverride) {
    total_price = ov as number
    price_overridden = true
  } else {
    const { data: rates, error: ratesErr } = await admin.from('pricing_rates').select('*').eq('id', 1).single()
    if (ratesErr || !rates) return json({ error: 'Could not load pricing rates' }, 500)
    try { total_price = calcTotal(service, dropoff_date, pickup_date, dogs, effectivePM, rates as RateTable) }
    catch (e) { return json({ error: (e as Error).message }, 422) }
    price_overridden = false
  }

  // Notify the client only on a real date change, and never for manual/no-account clients.
  const { data: client } = await admin.from('clients').select('is_manual').eq('id', res.client_id).maybeSingle()
  const notify = datesChanging && !(client?.is_manual)
  const notificationMessage = notify
    ? buildNotificationMessage({ newDropoff: dropoff_date, newPickup: pickup_date, prevDropoff: res.dropoff_date, prevPickup: res.pickup_date, newTotal: total_price, reason })
    : null

  const { error: rpcErr } = await admin.rpc('update_reservation_full', {
    p_reservation_id: reservation_id,
    p_service_type: service,
    p_new_dropoff_date: dropoff_date, p_new_dropoff_time: dropoff_time,
    p_new_pickup_date: pickup_date,   p_new_pickup_time: pickup_time,
    p_new_payment_method: effectivePM, p_new_dog_ids: effectiveDogIds,
    p_new_total_price: total_price, p_price_overridden: price_overridden,
    p_prev_dropoff_date: res.dropoff_date, p_prev_pickup_date: res.pickup_date,
    p_prev_payment_method: res.payment_method, p_prev_dog_ids: prevDogIds, p_prev_total_price: res.total_price,
    p_reason: reason, p_notification_message: notificationMessage, p_notify: notify,
  })
  if (rpcErr) return json({ error: rpcErr.message }, 500)

  return json({
    ok: true, reservation_id,
    updated: { service_type: service, dropoff_date, dropoff_time, pickup_date, pickup_time, payment_method: effectivePM, total_price, price_overridden },
  })
})
