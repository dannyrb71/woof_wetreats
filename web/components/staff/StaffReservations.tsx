'use client'
import React, { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { calculatePrice, MaxStayExceededError } from '@/lib/pricing-engine'
import type { RateTable, PaymentMethod, ServiceType } from '@/lib/pricing-engine'
import DatePicker from '@/components/booking/DatePicker'
import TimePicker from '@/components/booking/TimePicker'

const SUPABASE_URL      = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

interface Dog { id: string; name: string; birthdate: string }
interface Reservation {
  id: string; service_type: 'boarding' | 'daycare'; status: string
  dropoff_date: string; dropoff_time: string; pickup_date: string; pickup_time: string
  payment_method: string; total_price: number; care_notes: string | null; dogs: string[]
}

const SVC = { boarding: '#0058A0', daycare: '#C5A92B' }
const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  upcoming:    { bg: '#eff6ff', color: '#1d4ed8', label: 'Upcoming' },
  in_progress: { bg: '#f0fdf4', color: '#15803d', label: 'In Progress' },
  completed:   { bg: '#f3f4f6', color: '#374151', label: 'Completed' },
  cancelled:   { bg: '#fff1f2', color: '#be123c', label: 'Cancelled' },
}
function fmtDate(ymd: string) { return new Date(ymd + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) }
function fmtTime(t: string) { if (!t) return ''; const [h, m] = t.split(':').map(Number); return Number.isNaN(h) ? t : `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}` }
function nights(a: string, b: string) { return Math.round((new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime()) / 86400000) }

// ── One reservation card with cancel + edit ────────────────────
function ReservationRow({ res, color, onChanged }: { res: Reservation; color: string; onChanged: () => void }) {
  const supabase = createClient()
  const isBoarding = res.service_type === 'boarding'
  const st = STATUS_STYLE[res.status] ?? STATUS_STYLE.completed

  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function cancel() {
    setBusy(true); setErr('')
    const { error } = await supabase.from('reservations').update({ status: 'cancelled' }).eq('id', res.id)
    setBusy(false)
    if (error) { setErr('Could not cancel — try again.'); return }
    setConfirming(false); onChanged()
  }

  return (
    <div style={{ ...s.card, borderLeftColor: res.status === 'cancelled' || res.status === 'completed' ? '#9ca3af' : SVC[res.service_type] }}>
      <div style={s.cardTop}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ ...s.svcBadge, color: SVC[res.service_type], borderColor: SVC[res.service_type] }}>{isBoarding ? '🏠 Boarding' : '🌞 Daycare'}</span>
          <span style={{ ...s.statusPill, background: st.bg, color: st.color }}>{st.label}</span>
        </div>
        <span style={s.price}>${Number(res.total_price).toFixed(2)}</span>
      </div>
      {res.dogs.length > 0 && <p style={s.dogs}>{res.dogs.join(', ')}</p>}
      <div style={s.dates}>
        <span><b style={s.dlabel}>Drop-off</b> {fmtDate(res.dropoff_date)} · {fmtTime(res.dropoff_time)}</span>
        {isBoarding && <span><b style={s.dlabel}>Pick-up</b> {fmtDate(res.pickup_date)} · {fmtTime(res.pickup_time)}</span>}
        {isBoarding && <span><b style={s.dlabel}>Nights</b> {nights(res.dropoff_date, res.pickup_date)}</span>}
        <span><b style={s.dlabel}>Payment</b> {res.payment_method}</span>
      </div>
      {res.care_notes && <p style={s.care}>📋 {res.care_notes}</p>}
      {err && <p style={{ margin: '6px 0 0', fontSize: 12, color: '#ef4444' }}>{err}</p>}
      {res.status !== 'cancelled' && (
        <div style={s.actions}>
          {confirming ? (
            <>
              <span style={{ fontSize: 13, color: '#374151', fontWeight: 500 }}>Cancel this reservation?</span>
              <button type="button" onClick={cancel} disabled={busy} style={s.yes}>{busy ? 'Cancelling…' : 'Yes, cancel'}</button>
              <button type="button" onClick={() => setConfirming(false)} disabled={busy} style={s.no}>Keep</button>
            </>
          ) : (
            <button type="button" onClick={() => { setConfirming(true); setErr('') }} style={s.cancelBtn}>Cancel Reservation</button>
          )}
        </div>
      )}
    </div>
  )
}

// ── New-reservation form (staff, for a specific client) ─────────
function NewReservationForm({ clientId, dogs, blocked, rates, meetGreetCompleted, onCreated, onClose }: {
  clientId: string; dogs: Dog[]; blocked: Set<string>; rates: RateTable | null
  meetGreetCompleted: boolean; onCreated: () => void; onClose: () => void
}) {
  const supabase = createClient()
  const [service, setService] = useState<ServiceType>('boarding')
  const [selDogs, setSelDogs] = useState<Set<string>>(new Set(dogs.length === 1 ? [dogs[0].id] : []))
  const [dropDate, setDropDate] = useState<string | null>(null)
  const [pickDate, setPickDate] = useState<string | null>(null)
  const [dropTime, setDropTime] = useState('9:00 AM')
  const [pickTime, setPickTime] = useState('5:00 PM')
  const [payment, setPayment] = useState<PaymentMethod>('cash')
  const [careNotes, setCareNotes] = useState('')
  const [override, setOverride] = useState('')
  const [price, setPrice] = useState<number | null>(null)
  const [priceErr, setPriceErr] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState('')

  const chosen = dogs.filter(d => selDogs.has(d.id))

  useEffect(() => {
    setPriceErr(''); setPrice(null)
    if (!rates || chosen.length === 0 || !dropDate) return
    if (service === 'boarding' && (!pickDate || pickDate <= dropDate)) return
    try {
      const r = calculatePrice({ service_type: service, dropoff_date: dropDate, pickup_date: service === 'daycare' ? dropDate : pickDate!, dogs: chosen, payment_method: payment }, rates)
      setPrice(r.total)
    } catch (e) { if (e instanceof MaxStayExceededError) setPriceErr(e.message) }
  }, [service, dropDate, pickDate, payment, selDogs, rates]) // eslint-disable-line react-hooks/exhaustive-deps

  const overrideNum = override.trim() === '' ? null : Number(override)
  const effectivePrice = (overrideNum !== null && !Number.isNaN(overrideNum) && overrideNum >= 0) ? overrideNum : price

  async function submit() {
    setErr('')
    if (chosen.length === 0) { setErr('Select at least one dog.'); return }
    if (!dropDate) { setErr('Pick a drop-off date.'); return }
    if (service === 'boarding' && (!pickDate || pickDate <= dropDate)) { setErr('Pick-up must be after drop-off.'); return }

    setSubmitting(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setErr('Session expired — refresh.'); setSubmitting(false); return }

    const resp = await fetch(`${SUPABASE_URL}/functions/v1/staff-create-reservation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}`, 'apikey': SUPABASE_ANON_KEY },
      body: JSON.stringify({
        client_id: clientId, service_type: service,
        dropoff_date: dropDate, dropoff_time: dropTime,
        pickup_date: service === 'daycare' ? dropDate : pickDate, pickup_time: service === 'daycare' ? dropTime : pickTime,
        payment_method: payment, dog_ids: [...selDogs], care_notes: careNotes.trim() || null,
        price_override: (overrideNum !== null && !Number.isNaN(overrideNum) && overrideNum >= 0) ? overrideNum : null,
      }),
    })
    const json = await resp.json().catch(() => ({}))
    setSubmitting(false)
    if (!resp.ok) { setErr(json.error ?? 'Could not create reservation.'); return }
    onCreated()
  }

  return (
    <div style={s.form}>
      <div style={s.formHead}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>New Reservation</h3>
        <button type="button" onClick={onClose} style={s.no}>Close</button>
      </div>

      {!meetGreetCompleted && (
        <p style={s.warn}>⚠️ This client&apos;s Meet &amp; Greet isn&apos;t marked completed. Use the Meet &amp; Greet Completed toggle above before booking.</p>
      )}

      <div style={s.fieldRow}>
        {(['boarding', 'daycare'] as const).map(sv => (
          <button key={sv} type="button" onClick={() => setService(sv)}
            style={{ ...s.toggleBtn, background: service === sv ? SVC[sv] : '#fff', color: service === sv ? '#fff' : '#374151', borderColor: service === sv ? SVC[sv] : '#e5e7eb' }}>
            {sv === 'boarding' ? '🏠 Boarding' : '🌞 Daycare'}
          </button>
        ))}
      </div>

      <p style={s.flabel}>Dogs</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {dogs.length === 0 && <span style={{ fontSize: 13, color: '#9ca3af' }}>This client has no dogs on file.</span>}
        {dogs.map(d => {
          const on = selDogs.has(d.id)
          return (
            <button key={d.id} type="button" onClick={() => setSelDogs(prev => { const n = new Set(prev); n.has(d.id) ? n.delete(d.id) : n.add(d.id); return n })}
              style={{ ...s.dogChip, background: on ? '#eff6ff' : '#fff', borderColor: on ? '#2563eb' : '#e5e7eb', color: on ? '#1d4ed8' : '#374151' }}>
              {on ? '✓ ' : ''}{d.name}
            </button>
          )
        })}
      </div>

      <div style={s.pickerRow}>
        <DatePicker label="Drop-off date" value={dropDate} onChange={setDropDate} blockedDates={blocked} rangeEnd={service === 'boarding' ? pickDate : null} />
        {service === 'boarding' && (
          <DatePicker label="Pick-up date" value={pickDate} onChange={setPickDate} blockedDates={blocked} rangeStart={dropDate} minDate={dropDate ?? undefined} />
        )}
      </div>
      <div style={s.fieldRow}>
        <TimePicker label="Drop-off time" value={dropTime} onChange={setDropTime} />
        {service === 'boarding' && <TimePicker label="Pick-up time" value={pickTime} onChange={setPickTime} />}
      </div>

      <label style={s.flabel}>Payment
        <select value={payment} onChange={e => setPayment(e.target.value as PaymentMethod)} style={s.input}>
          <option value="cash">💵 Cash</option>
          <option value="venmo">💙 Venmo</option>
        </select>
      </label>

      <label style={s.flabel}>Care notes (optional)
        <textarea value={careNotes} onChange={e => setCareNotes(e.target.value)} rows={2} style={{ ...s.input, resize: 'vertical', fontFamily: 'inherit' }} />
      </label>

      <div style={s.priceBox}>
        {priceErr ? <span style={{ color: '#ef4444', fontSize: 13 }}>{priceErr}</span> : (
          <>
            <span style={{ fontSize: 13, color: '#6b7280' }}>Calculated price: <b style={{ color: '#111827' }}>{price != null ? `$${price.toFixed(2)}` : '—'}</b></span>
            <label style={{ ...s.flabel, marginTop: 8 }}>Override price (optional)
              <input type="number" min="0" step="1" value={override} onChange={e => setOverride(e.target.value)} placeholder="leave blank to use calculated" style={s.input} />
            </label>
            {effectivePrice != null && <span style={{ fontSize: 13, color: '#15803d', fontWeight: 600 }}>Will charge: ${Number(effectivePrice).toFixed(2)}</span>}
          </>
        )}
      </div>

      {err && <p style={{ margin: 0, fontSize: 13, color: '#ef4444' }}>{err}</p>}
      <button type="button" onClick={submit} disabled={submitting || !meetGreetCompleted}
        style={{ ...s.submit, opacity: (submitting || !meetGreetCompleted) ? 0.5 : 1, cursor: (submitting || !meetGreetCompleted) ? 'not-allowed' : 'pointer' }}>
        {submitting ? 'Creating…' : 'Create Reservation'}
      </button>
    </div>
  )
}

// ── Section wrapper: loads everything, renders list + new form ──
export function StaffReservations({ clientId, dogs, meetGreetCompleted, onChanged }: {
  clientId: string; dogs: Dog[]; meetGreetCompleted: boolean; onChanged?: () => void
}) {
  const supabase = createClient()
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [blocked, setBlocked] = useState<Set<string>>(new Set())
  const [rates, setRates] = useState<RateTable | null>(null)
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)

  const load = useCallback(async () => {
    const [resR, bdR, rtR] = await Promise.all([
      supabase.from('reservations')
        .select('id, service_type, status, dropoff_date, dropoff_time, pickup_date, pickup_time, payment_method, total_price, care_notes')
        .eq('client_id', clientId).order('dropoff_date', { ascending: false }),
      supabase.from('blocked_dates').select('date'),
      supabase.rpc('get_pricing_rates'),
    ])
    setBlocked(new Set((bdR.data ?? []).map((r: { date: string }) => r.date)))
    if (rtR.data) setRates(rtR.data as RateTable)

    const rows = resR.data ?? []
    const ids = rows.map(r => r.id)
    const dogMap: Record<string, string[]> = {}
    if (ids.length) {
      const { data: rd } = await supabase.from('reservation_dogs').select('reservation_id, dogs(name)').in('reservation_id', ids)
      for (const row of rd ?? []) {
        const nm = (Array.isArray(row.dogs) ? row.dogs[0] : row.dogs)?.name
        if (!nm) continue
        ;(dogMap[row.reservation_id] ??= []).push(nm)
      }
    }
    setReservations(rows.map(r => ({ ...r, dogs: dogMap[r.id] ?? [] })) as Reservation[])
    setLoading(false)
  }, [clientId, supabase])

  useEffect(() => { load() }, [load])

  function afterChange() { load(); onChanged?.() }

  return (
    <div style={s.section}>
      <div style={s.sectionHead}>
        <h2 style={s.sectionTitle}>Reservations{!loading ? ` (${reservations.length})` : ''}</h2>
        {!showNew && <button type="button" onClick={() => setShowNew(true)} style={s.newBtn}>+ New Reservation</button>}
      </div>

      {showNew && (
        <NewReservationForm
          clientId={clientId} dogs={dogs} blocked={blocked} rates={rates}
          meetGreetCompleted={meetGreetCompleted}
          onCreated={() => { setShowNew(false); afterChange() }}
          onClose={() => setShowNew(false)}
        />
      )}

      {loading ? <p style={{ fontSize: 13, color: '#9ca3af' }}>Loading…</p>
        : reservations.length === 0 ? <p style={{ fontSize: 13, color: '#9ca3af' }}>No reservations yet.</p>
        : reservations.map(r => <ReservationRow key={r.id} res={r} color={SVC[r.service_type]} onChanged={afterChange} />)}
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  section:      { },
  sectionHead:  { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' },
  sectionTitle: { margin: 0, fontSize: 15, fontWeight: 700, color: '#111827' },
  newBtn:       { fontSize: 13, fontWeight: 600, color: '#fff', background: '#2563eb', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontFamily: 'inherit' },
  card:         { background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', borderLeft: '4px solid', padding: '16px 18px', marginBottom: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' },
  cardTop:      { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' },
  svcBadge:     { fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 20, border: '1.5px solid', background: 'transparent' },
  statusPill:   { fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10 },
  price:        { fontSize: 17, fontWeight: 800, color: '#111827' },
  dogs:         { margin: '0 0 8px', fontSize: 14, fontWeight: 600, color: '#111827' },
  dates:        { display: 'flex', flexDirection: 'column', gap: 3, fontSize: 13, color: '#374151' },
  dlabel:       { color: '#9ca3af', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', marginRight: 6 },
  care:         { margin: '8px 0 0', fontSize: 13, color: '#6b7280', fontStyle: 'italic', background: '#f9fafb', borderRadius: 6, padding: '6px 10px' },
  actions:      { marginTop: 12, paddingTop: 12, borderTop: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  cancelBtn:    { fontSize: 12, fontWeight: 600, color: '#be123c', background: '#fff', border: '1px solid #fecdd3', borderRadius: 6, padding: '5px 12px', cursor: 'pointer', fontFamily: 'inherit' },
  yes:          { fontSize: 12, fontWeight: 600, color: '#fff', background: '#be123c', border: 'none', borderRadius: 6, padding: '5px 12px', cursor: 'pointer', fontFamily: 'inherit' },
  no:           { fontSize: 12, fontWeight: 600, color: '#374151', background: '#f3f4f6', border: 'none', borderRadius: 6, padding: '5px 12px', cursor: 'pointer', fontFamily: 'inherit' },
  form:         { background: '#fafafa', border: '1px solid #e5e7eb', borderRadius: 12, padding: '18px 20px', marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 12 },
  formHead:     { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  warn:         { margin: 0, fontSize: 13, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '8px 12px' },
  fieldRow:     { display: 'flex', gap: 10, flexWrap: 'wrap' },
  flabel:       { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, fontWeight: 600, color: '#374151' },
  toggleBtn:    { fontSize: 14, fontWeight: 600, padding: '8px 16px', borderRadius: 8, border: '1.5px solid', cursor: 'pointer', fontFamily: 'inherit' },
  dogChip:      { fontSize: 13, fontWeight: 600, padding: '6px 14px', borderRadius: 20, border: '1.5px solid', cursor: 'pointer', fontFamily: 'inherit' },
  pickerRow:    { display: 'flex', gap: 16, flexWrap: 'wrap' },
  input:        { fontSize: 14, padding: '8px 10px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', color: '#111827', fontFamily: 'inherit', marginTop: 2 },
  priceBox:     { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 4 },
  submit:       { fontSize: 15, fontWeight: 700, color: '#fff', background: '#2563eb', border: 'none', borderRadius: 10, padding: '11px 0', fontFamily: 'inherit' },
}
