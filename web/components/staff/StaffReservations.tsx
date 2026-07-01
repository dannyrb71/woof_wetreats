'use client'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { calculatePrice, getHolidayDateRange, MaxStayExceededError } from '@/lib/pricing-engine'
import type { RateTable, PaymentMethod, ServiceType } from '@/lib/pricing-engine'
import { VENMO_USERNAME } from '@/lib/payment'
import DatePicker from '@/components/booking/DatePicker'
import TimePicker from '@/components/booking/TimePicker'
import { FeeBreakdownModal } from '@/components/staff/FeeBreakdownModal'
import { ServicePill } from '@/components/shared/molecules/ServicePill'
import { StatusBadge, type StatusType } from '@/components/shared/molecules/StatusBadge'

// DB status keys (underscore) → StatusBadge molecule keys (hyphen)
const STATUS_KEY: Record<string, StatusType> = {
  upcoming: 'upcoming', in_progress: 'in-progress', completed: 'completed', cancelled: 'cancelled',
}

const SUPABASE_URL      = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

interface Dog { id: string; name: string; birthdate: string }
interface Reservation {
  id: string; service_type: 'boarding' | 'daycare'; status: string
  dropoff_date: string; dropoff_time: string; pickup_date: string; pickup_time: string
  payment_method: string; total_price: number; price_overridden: boolean; paid: boolean
  care_notes: string | null; dogs: string[]; dog_ids: string[]
}

const SVC = { boarding: 'var(--status-boarding)', daycare: 'var(--status-daycare)' }
function fmtDate(ymd: string) { return new Date(ymd + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) }
function fmtTime(t: string) { if (!t) return ''; const [h, m] = t.split(':').map(Number); return Number.isNaN(h) ? t : `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}` }
function nights(a: string, b: string) { return Math.round((new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime()) / 86400000) }

// ── One reservation card with cancel + edit ────────────────────
function ReservationRow({ res, color, dogs, blocked, rates, onChanged }: {
  res: Reservation; color: string; dogs: Dog[]; blocked: Set<string>; rates: RateTable | null; onChanged: () => void
}) {
  const supabase = createClient()
  const isBoarding = res.service_type === 'boarding'

  const [editing, setEditing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [showBreakdown, setShowBreakdown] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [paid, setPaid] = useState(res.paid)
  const [paidBusy, setPaidBusy] = useState(false)
  const [pm, setPm] = useState<'cash' | 'venmo'>((res.payment_method as 'cash' | 'venmo') || 'cash')
  const [pmBusy, setPmBusy] = useState(false)

  async function togglePaid() {
    const next = !paid
    setPaidBusy(true); setPaid(next); setErr('')
    const { error } = await supabase.from('reservations').update({ paid: next, paid_at: next ? new Date().toISOString() : null }).eq('id', res.id)
    setPaidBusy(false)
    if (error) { setPaid(!next); setErr('Could not update paid status — try again.'); return }
    onChanged() // refresh so the section's unpaid total recomputes
  }

  // Correct the recorded payment METHOD after the fact. Routes through the SAME
  // update-reservation edge function the Edit flow uses, so the total reprices to
  // the new method's rate — EXCEPT when the price was manually overridden, in
  // which case we pass the override through so the edge function preserves it.
  async function setMethod(next: 'cash' | 'venmo') {
    if (next === pm) return
    const prev = pm
    setPmBusy(true); setPm(next); setErr('')
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setPm(prev); setPmBusy(false); setErr('Session expired — refresh.'); return }

    const resp = await fetch(`${SUPABASE_URL}/functions/v1/update-reservation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}`, 'apikey': SUPABASE_ANON_KEY },
      body: JSON.stringify({
        reservation_id: res.id, service_type: res.service_type,
        dropoff_date: res.dropoff_date, dropoff_time: res.dropoff_time,
        pickup_date: res.pickup_date, pickup_time: res.pickup_time,
        payment_method: next, dog_ids: res.dog_ids,
        // Overridden price → pass it back so it's preserved; otherwise null → recalc.
        price_override: res.price_overridden ? Number(res.total_price) : null,
      }),
    })
    const json = await resp.json().catch(() => ({}))
    setPmBusy(false)
    if (!resp.ok) { setPm(prev); setErr(json.error ?? 'Could not update payment method — try again.'); return }
    onChanged()
  }

  if (editing) {
    return (
      <EditReservationForm
        res={res} dogs={dogs} blocked={blocked} rates={rates}
        onSaved={() => { setEditing(false); onChanged() }}
        onClose={() => setEditing(false)}
      />
    )
  }

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
          <ServicePill type={res.service_type} />
          <StatusBadge status={STATUS_KEY[res.status] ?? 'completed'} />
          {res.status !== 'cancelled' && (
            <StatusBadge status={paid ? 'paid' : 'unpaid'} />
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button type="button" onClick={() => setShowBreakdown(true)} className="btn btn-icon" title="View fee breakdown" aria-label="View fee breakdown" style={{ fontSize: 16, color: 'var(--text-secondary)' }}>ⓘ</button>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
            <span style={s.price}>${Number(res.total_price).toFixed(2)}</span>
            {res.price_overridden && <span style={s.overrideBadge}>✎ Overridden</span>}
          </div>
        </div>
      </div>
      {showBreakdown && (
        <FeeBreakdownModal reservationId={res.id} onClose={() => setShowBreakdown(false)} />
      )}
      {res.dogs.length > 0 && <p style={s.dogs}>{res.dogs.join(', ')}</p>}
      <div style={s.dates}>
        <span><b style={s.dlabel}>Drop-off</b> {fmtDate(res.dropoff_date)} · {fmtTime(res.dropoff_time)}</span>
        {isBoarding
          ? <span><b style={s.dlabel}>Pick-up</b> {fmtDate(res.pickup_date)} · {fmtTime(res.pickup_time)}</span>
          : <span><b style={s.dlabel}>Pick-up</b> {fmtTime(res.pickup_time)}</span>}
        {isBoarding && <span><b style={s.dlabel}>Nights</b> {nights(res.dropoff_date, res.pickup_date)}</span>}
        <span><b style={s.dlabel}>Payment</b> {res.payment_method}</span>
      </div>
      {res.care_notes && <p style={s.care}>📋 {res.care_notes}</p>}
      {err && <p style={{ margin: '6px 0 0', fontSize: 12, color: '#ef4444' }}>{err}</p>}
      {res.status !== 'cancelled' && (
        <div style={s.actions}>
          {confirming ? (
            <>
              <span style={{ fontSize: 13, color: '#374151', fontWeight: 500 }}>Cancel this booking?</span>
              <button type="button" onClick={cancel} disabled={busy} className="btn btn-destructive btn-xs">{busy ? 'Cancelling…' : 'Yes, cancel'}</button>
              <button type="button" onClick={() => setConfirming(false)} disabled={busy} className="btn btn-ghost btn-xs">Keep</button>
            </>
          ) : (
            <>
              <button type="button" onClick={togglePaid} disabled={paidBusy}
                className={paid ? 'btn btn-ghost btn-xs' : 'btn btn-success btn-xs'}>
                {paid ? 'Mark Unpaid' : 'Mark Paid'}
              </button>
              {!paid && (
                <span style={s.pmToggle} title="Correct the recorded payment method">
                  {(['cash', 'venmo'] as const).map(m => (
                    <button key={m} type="button" onClick={() => setMethod(m)} disabled={pmBusy}
                      style={{ ...s.pmSeg, ...(pm === m ? s.pmSegOn : {}), cursor: pmBusy ? 'not-allowed' : 'pointer' }}>
                      {m === 'cash' ? '💵 Cash' : '💙 Venmo'}
                    </button>
                  ))}
                </span>
              )}
              <button type="button" onClick={() => { setEditing(true); setErr('') }} className="btn btn-outlined btn-xs">Edit</button>
              <button type="button" onClick={() => { setConfirming(true); setErr('') }} className="btn btn-destructive-outlined btn-xs">Cancel Booking</button>
            </>
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
  const holidayDates = useMemo(() => {
    const from = new Date().toISOString().slice(0, 10)
    const to   = `${new Date().getFullYear() + 3}-12-31`
    return getHolidayDateRange(from, to)
  }, [])
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
      // Staff bypass the 14-night self-service cap (same as the staff edit flow)
      const r = calculatePrice({ service_type: service, dropoff_date: dropDate, pickup_date: service === 'daycare' ? dropDate : pickDate!, dogs: chosen, payment_method: payment }, rates, { skipMaxStayCheck: true })
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
        pickup_date: service === 'daycare' ? dropDate : pickDate, pickup_time: pickTime,
        payment_method: payment, dog_ids: [...selDogs], care_notes: careNotes.trim() || null,
        price_override: (overrideNum !== null && !Number.isNaN(overrideNum) && overrideNum >= 0) ? overrideNum : null,
      }),
    })
    const json = await resp.json().catch(() => ({}))
    setSubmitting(false)
    if (!resp.ok) { setErr(json.error ?? 'Could not create booking.'); return }
    onCreated()
  }

  return (
    <div style={s.form}>
      <div style={s.formHead}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>New Booking</h3>
        <button type="button" onClick={onClose} className="btn btn-ghost btn-sm">Close</button>
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
        <DatePicker label="Drop-off date" value={dropDate} onChange={setDropDate} blockedDates={blocked} holidayDates={holidayDates} rangeEnd={service === 'boarding' ? pickDate : null} allowPast />
        {service === 'boarding' && (
          <DatePicker label="Pick-up date" value={pickDate} onChange={setPickDate} blockedDates={blocked} holidayDates={holidayDates} rangeStart={dropDate} minDate={dropDate ?? undefined} allowPast />
        )}
      </div>
      {/* Both daycare AND boarding capture drop-off + pick-up time (matches client flow) */}
      <div style={s.fieldRow}>
        <TimePicker label="Drop-off time" value={dropTime} onChange={setDropTime} />
        <TimePicker label="Pick-up time" value={pickTime} onChange={setPickTime} />
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
        className="btn btn-booking">
        {submitting ? 'Submitting…' : 'Submit'}
      </button>
    </div>
  )
}

// ── Edit an existing reservation (staff) ───────────────────────
// Fully editable, as if setting up from scratch: service, dogs, dates, times,
// payment, plus a manual price override. The override is held in its own state
// and is NEVER recalculated by editing other fields — only the "Calculated
// price" display updates live. The override only changes when staff edit the
// override field itself.
function EditReservationForm({ res, dogs, blocked, rates, onSaved, onClose }: {
  res: Reservation; dogs: Dog[]; blocked: Set<string>; rates: RateTable | null
  onSaved: () => void; onClose: () => void
}) {
  const supabase = createClient()
  const holidayDates = useMemo(() => {
    const from = new Date().toISOString().slice(0, 10)
    const to   = `${new Date().getFullYear() + 3}-12-31`
    return getHolidayDateRange(from, to)
  }, [])
  const [service, setService]   = useState<ServiceType>(res.service_type)
  const [selDogs, setSelDogs]   = useState<Set<string>>(new Set(res.dog_ids))
  const [dropDate, setDropDate] = useState<string | null>(res.dropoff_date)
  const [pickDate, setPickDate] = useState<string | null>(res.pickup_date)
  const [dropTime, setDropTime] = useState(fmtTime(res.dropoff_time) || '9:00 AM')
  const [pickTime, setPickTime] = useState(fmtTime(res.pickup_time) || '5:00 PM')
  const [payment, setPayment]   = useState<PaymentMethod>((res.payment_method as PaymentMethod) || 'cash')
  // Prefill the override field only when this reservation already carries a
  // staff override, so we visibly preserve it across this edit.
  const [override, setOverride] = useState(res.price_overridden ? String(res.total_price) : '')
  const [reason, setReason]     = useState('')
  const [price, setPrice]       = useState<number | null>(null)
  const [priceErr, setPriceErr] = useState('')
  const [saving, setSaving]     = useState(false)
  const [err, setErr]           = useState('')

  const chosen = dogs.filter(d => selDogs.has(d.id))

  // Live "calculated price" — for staff reference only. Does NOT touch override.
  useEffect(() => {
    setPriceErr(''); setPrice(null)
    if (!rates || chosen.length === 0 || !dropDate) return
    if (service === 'boarding' && (!pickDate || pickDate <= dropDate)) return
    try {
      const r = calculatePrice({ service_type: service, dropoff_date: dropDate, pickup_date: service === 'daycare' ? dropDate : pickDate!, dogs: chosen, payment_method: payment }, rates, { skipMaxStayCheck: true })
      setPrice(r.total)
    } catch (e) { if (e instanceof MaxStayExceededError) setPriceErr(e.message) }
  }, [service, dropDate, pickDate, payment, selDogs, rates]) // eslint-disable-line react-hooks/exhaustive-deps

  const overrideNum = override.trim() === '' ? null : Number(override)
  const overrideValid = overrideNum !== null && !Number.isNaN(overrideNum) && overrideNum >= 0
  const effectivePrice = overrideValid ? overrideNum : price
  const datesChanged = dropDate !== res.dropoff_date || (service === 'boarding' && pickDate !== res.pickup_date)

  async function save() {
    setErr('')
    if (chosen.length === 0) { setErr('Select at least one dog.'); return }
    if (!dropDate) { setErr('Pick a drop-off date.'); return }
    if (service === 'boarding' && (!pickDate || pickDate <= dropDate)) { setErr('Pick-up must be after drop-off.'); return }
    if (datesChanged && !reason.trim()) { setErr('A reason is required when changing dates.'); return }

    setSaving(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setErr('Session expired — refresh.'); setSaving(false); return }

    const resp = await fetch(`${SUPABASE_URL}/functions/v1/update-reservation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}`, 'apikey': SUPABASE_ANON_KEY },
      body: JSON.stringify({
        reservation_id: res.id, service_type: service,
        dropoff_date: dropDate, dropoff_time: dropTime,
        pickup_date: service === 'daycare' ? dropDate : pickDate, pickup_time: pickTime,
        payment_method: payment, dog_ids: [...selDogs],
        reason: reason.trim() || undefined,
        // null → recalculate (clears any prior override); number → set/keep override
        price_override: overrideValid ? overrideNum : null,
      }),
    })
    const json = await resp.json().catch(() => ({}))
    setSaving(false)
    if (!resp.ok) { setErr(json.error ?? 'Could not save changes.'); return }
    onSaved()
  }

  return (
    <div style={s.form}>
      <div style={s.formHead}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Edit Booking</h3>
        <button type="button" onClick={onClose} className="btn btn-ghost btn-sm">Close</button>
      </div>

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
        <DatePicker label="Drop-off date" value={dropDate} onChange={setDropDate} blockedDates={blocked} holidayDates={holidayDates} rangeEnd={service === 'boarding' ? pickDate : null} allowPast />
        {service === 'boarding' && (
          <DatePicker label="Pick-up date" value={pickDate} onChange={setPickDate} blockedDates={blocked} holidayDates={holidayDates} rangeStart={dropDate} minDate={dropDate ?? undefined} allowPast />
        )}
      </div>
      <div style={s.fieldRow}>
        <TimePicker label="Drop-off time" value={dropTime} onChange={setDropTime} />
        <TimePicker label="Pick-up time" value={pickTime} onChange={setPickTime} />
      </div>

      <label style={s.flabel}>Payment
        <select value={payment} onChange={e => setPayment(e.target.value as PaymentMethod)} style={s.input}>
          <option value="cash">💵 Cash</option>
          <option value="venmo">💙 Venmo</option>
        </select>
      </label>

      {datesChanged && (
        <label style={s.flabel}>Reason for date change (required)
          <input type="text" value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. client requested new dates" style={s.input} />
        </label>
      )}

      <div style={s.priceBox}>
        {priceErr ? <span style={{ color: '#ef4444', fontSize: 13 }}>{priceErr}</span> : (
          <>
            <span style={{ fontSize: 13, color: '#6b7280' }}>Calculated price: <b style={{ color: '#111827' }}>{price != null ? `$${price.toFixed(2)}` : '—'}</b></span>
            <label style={{ ...s.flabel, marginTop: 8 }}>Override price (optional)
              <input type="number" min="0" step="1" value={override} onChange={e => setOverride(e.target.value)} placeholder="leave blank to use calculated" style={s.input} />
            </label>
            {overrideValid
              ? <span style={s.overrideTag}>✎ Manual override — won&apos;t be recalculated</span>
              : <span style={{ fontSize: 12, color: '#9ca3af' }}>Blank = system-calculated price.</span>}
            {effectivePrice != null && <span style={{ fontSize: 13, color: '#15803d', fontWeight: 600 }}>Will charge: ${Number(effectivePrice).toFixed(2)}</span>}
          </>
        )}
      </div>

      {err && <p style={{ margin: 0, fontSize: 13, color: '#ef4444' }}>{err}</p>}
      <button type="button" onClick={save} disabled={saving}
        className="btn btn-primary">
        {saving ? 'Saving…' : 'Save Changes'}
      </button>
    </div>
  )
}

// ── Section wrapper: loads everything, renders list + new form ──
export function StaffReservations({ clientId, clientFirstName, dogs, meetGreetCompleted, onChanged }: {
  clientId: string; clientFirstName?: string; dogs: Dog[]; meetGreetCompleted: boolean; onChanged?: () => void
}) {
  const supabase = createClient()
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [blocked, setBlocked] = useState<Set<string>>(new Set())
  const [rates, setRates] = useState<RateTable | null>(null)
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [reminderState, setReminderState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')

  // Outstanding balance = unpaid, non-cancelled reservations.
  const unpaidTotal = reservations
    .filter(r => !r.paid && r.status !== 'cancelled')
    .reduce((t, r) => t + Number(r.total_price), 0)

  // Item 4: staff-initiated, per-click. Inserts a warm, low-pressure in-app
  // notification the client sees on their dashboard. Never automatic/scheduled.
  async function sendReminder() {
    setReminderState('sending')
    const name = clientFirstName?.trim() || 'there'
    const message =
      `Hi ${name}! Just a friendly reminder that there's an outstanding balance of ` +
      `$${unpaidTotal.toFixed(2)} on your account whenever you get a chance. ` +
      `Venmo can go to ${VENMO_USERNAME}, or cash works too. ` +
      `If anything looks off or you've already paid, just let us know and we'll happily sort it out. Thank you! 🐾`
    const { error } = await supabase.from('notifications').insert({ client_id: clientId, message, read: false })
    setReminderState(error ? 'error' : 'sent')
  }

  const load = useCallback(async () => {
    const [resR, bdR, rtR] = await Promise.all([
      supabase.from('reservations')
        .select('id, service_type, status, dropoff_date, dropoff_time, pickup_date, pickup_time, payment_method, total_price, price_overridden, paid, care_notes')
        .eq('client_id', clientId).order('dropoff_date', { ascending: true }),
      supabase.from('blocked_dates').select('date'),
      supabase.rpc('get_pricing_rates'),
    ])
    setBlocked(new Set((bdR.data ?? []).map((r: { date: string }) => r.date)))
    if (rtR.data) setRates(rtR.data as RateTable)

    const rows = resR.data ?? []
    const ids = rows.map(r => r.id)
    const dogMap: Record<string, string[]> = {}
    const dogIdMap: Record<string, string[]> = {}
    if (ids.length) {
      const { data: rd } = await supabase.from('reservation_dogs').select('reservation_id, dog_id, dogs(name)').in('reservation_id', ids)
      for (const row of rd ?? []) {
        ;(dogIdMap[row.reservation_id] ??= []).push(row.dog_id)
        const nm = (Array.isArray(row.dogs) ? row.dogs[0] : row.dogs)?.name
        if (!nm) continue
        ;(dogMap[row.reservation_id] ??= []).push(nm)
      }
    }
    setReservations(rows.map(r => ({ ...r, dogs: dogMap[r.id] ?? [], dog_ids: dogIdMap[r.id] ?? [] })) as Reservation[])
    setLoading(false)
  }, [clientId, supabase])

  useEffect(() => { load() }, [load])

  function afterChange() { load(); onChanged?.() }

  return (
    <div style={s.section}>
      <div style={s.sectionHead}>
        <h2 style={s.sectionTitle}>Bookings{!loading ? ` (${reservations.length})` : ''}</h2>
        {!showNew && <button type="button" onClick={() => setShowNew(true)} className="btn btn-booking btn-sm">+ New Booking</button>}
      </div>

      {!loading && unpaidTotal > 0 && (
        <div style={s.balanceBar}>
          <span style={s.balanceText}>Outstanding balance: <b>${unpaidTotal.toFixed(2)}</b></span>
          {reminderState === 'sent'
            ? <span style={s.reminderSent}>✓ Reminder sent</span>
            : reminderState === 'error'
              ? <span style={{ fontSize: 12, color: 'var(--error)' }}>Could not send — try again.</span>
              : <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                  Send payment reminder — coming soon
                </span>}
        </div>
      )}

      {showNew && (
        <NewReservationForm
          clientId={clientId} dogs={dogs} blocked={blocked} rates={rates}
          meetGreetCompleted={meetGreetCompleted}
          onCreated={() => { setShowNew(false); afterChange() }}
          onClose={() => setShowNew(false)}
        />
      )}

      {loading ? <p style={{ fontSize: 13, color: '#9ca3af' }}>Loading…</p>
        : reservations.length === 0 ? <p style={{ fontSize: 13, color: '#9ca3af' }}>No bookings yet.</p>
        : reservations.map(r => <ReservationRow key={r.id} res={r} color={SVC[r.service_type]} dogs={dogs} blocked={blocked} rates={rates} onChanged={afterChange} />)}
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  section:      { },
  sectionHead:  { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' },
  sectionTitle: { margin: 0, fontSize: 15, fontWeight: 700, color: '#111827' },
  card:         { background: '#fff', borderRadius: 'var(--radius-card)', border: '1px solid #e5e7eb', borderLeft: '4px solid', padding: '16px 18px', marginBottom: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' },
  cardTop:      { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' },
  svcBadge:     { fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 20, border: 'none' },
  statusPill:   { fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10 },
  price:        { fontSize: 17, fontWeight: 800, color: '#111827' },
  dogs:         { margin: '0 0 8px', fontSize: 14, fontWeight: 600, color: '#111827' },
  dates:        { display: 'flex', flexDirection: 'column', gap: 3, fontSize: 13, color: '#374151' },
  dlabel:       { color: '#9ca3af', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', marginRight: 6 },
  care:         { margin: '8px 0 0', fontSize: 13, color: '#6b7280', fontStyle: 'italic', background: '#f9fafb', borderRadius: 6, padding: '6px 10px' },
  actions:      { marginTop: 12, paddingTop: 12, borderTop: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  overrideBadge:{ fontSize: 10, fontWeight: 700, color: '#92400e', background: '#fef3c7', borderRadius: 6, padding: '1px 7px', whiteSpace: 'nowrap' },
  overrideTag:  { fontSize: 12, fontWeight: 600, color: '#92400e' },
  paidPill:     { fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: '#f0fdf4', color: '#15803d' },
  unpaidPill:   { fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: '#fffbeb', color: '#b45309' },
  pmToggle:     { display: 'inline-flex', border: '1px solid #e5e7eb', borderRadius: 6, overflow: 'hidden' },
  pmSeg:        { fontSize: 12, fontWeight: 600, color: '#6b7280', background: '#fff', border: 'none', padding: '5px 10px', fontFamily: 'inherit' },
  pmSegOn:      { background: '#eff6ff', color: '#1d4ed8' },
  balanceBar:   { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '10px 14px', marginBottom: 12 },
  balanceText:  { fontSize: 13, color: '#92400e' },
  reminderSent: { fontSize: 12, fontWeight: 700, color: '#15803d' },
  form:         { background: '#fafafa', border: '1px solid #e5e7eb', borderRadius: 'var(--radius-card)', padding: '18px 20px', marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 12 },
  formHead:     { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  warn:         { margin: 0, fontSize: 13, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '8px 12px' },
  fieldRow:     { display: 'flex', gap: 10, flexWrap: 'wrap' },
  flabel:       { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, fontWeight: 600, color: '#374151' },
  toggleBtn:    { fontSize: 14, fontWeight: 600, padding: '8px 16px', borderRadius: 8, border: '1.5px solid', cursor: 'pointer', fontFamily: 'inherit' },
  dogChip:      { fontSize: 13, fontWeight: 600, padding: '6px 14px', borderRadius: 20, border: '1.5px solid', cursor: 'pointer', fontFamily: 'inherit' },
  pickerRow:    { display: 'flex', gap: 16, flexWrap: 'wrap' },
  input:        { fontSize: 14, padding: '8px 10px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', color: '#111827', fontFamily: 'inherit', marginTop: 2 },
  priceBox:     { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 4 },
}
