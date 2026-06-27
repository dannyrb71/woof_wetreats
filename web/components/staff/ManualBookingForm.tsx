'use client'
import React, { useState } from 'react'
import { createClient } from '@/lib/supabase'
import DatePicker from '@/components/booking/DatePicker'
import TimePicker from '@/components/booking/TimePicker'

// Manual / generic booking for a client with NO account yet, so the schedule
// stays accurate. Gated by the `manual_booking_enabled` app setting (the parent
// only renders this when enabled; the edge function re-checks the flag).
//
// PERMISSIONS NOTE (flag for later): any staff member can use this while the
// feature is enabled. Once role-based staff permissions exist, restrict the
// entry point + edge function to manager/admin-only.

const SUPABASE_URL      = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const SVC = { boarding: '#0058A0', daycare: '#C5A92B' }
type ServiceType = 'boarding' | 'daycare'
type PaymentMethod = 'cash' | 'venmo'

export function ManualBookingForm({ onCreated, onClose }: { onCreated: () => void; onClose: () => void }) {
  const supabase = createClient()
  const [name, setName]         = useState('')
  const [phone, setPhone]       = useState('')
  const [service, setService]   = useState<ServiceType>('boarding')
  const [dropDate, setDropDate] = useState<string | null>(null)
  const [pickDate, setPickDate] = useState<string | null>(null)
  const [dropTime, setDropTime] = useState('9:00 AM')
  const [pickTime, setPickTime] = useState('5:00 PM')
  const [payment, setPayment]   = useState<PaymentMethod>('cash')
  const [price, setPrice]       = useState('')
  const [careNotes, setCareNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState('')

  const noBlocked = new Set<string>()

  async function submit() {
    setErr('')
    if (!name.trim()) { setErr('Enter the client name.'); return }
    if (!dropDate) { setErr('Pick a drop-off date.'); return }
    if (service === 'boarding' && (!pickDate || pickDate <= dropDate)) { setErr('Pick-up must be after drop-off.'); return }

    setSubmitting(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setErr('Session expired — refresh.'); setSubmitting(false); return }

    const priceNum = price.trim() === '' ? 0 : Number(price)
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/staff-create-manual-booking`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}`, 'apikey': SUPABASE_ANON_KEY },
      body: JSON.stringify({
        client_name: name.trim(), client_phone: phone.trim() || undefined,
        service_type: service,
        dropoff_date: dropDate, dropoff_time: dropTime,
        pickup_date: service === 'daycare' ? dropDate : pickDate, pickup_time: pickTime,
        payment_method: payment, total_price: Number.isFinite(priceNum) && priceNum >= 0 ? priceNum : 0,
        care_notes: careNotes.trim() || undefined,
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
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Manual Booking</h3>
        <button type="button" onClick={onClose} style={s.close}>Close</button>
      </div>
      <p style={s.sub}>For a client who doesn&apos;t have an account yet. Creates a standalone booking so the schedule stays accurate.</p>

      <label style={s.flabel}>Client name
        <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Jane Doe" style={s.input} />
      </label>
      <label style={s.flabel}>Phone (optional)
        <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="optional" style={s.input} />
      </label>

      <div style={s.fieldRow}>
        {(['boarding', 'daycare'] as const).map(sv => (
          <button key={sv} type="button" onClick={() => setService(sv)}
            style={{ ...s.toggleBtn, background: service === sv ? SVC[sv] : '#fff', color: service === sv ? '#fff' : '#374151', borderColor: service === sv ? SVC[sv] : '#e5e7eb' }}>
            {sv === 'boarding' ? '🏠 Boarding' : '🌞 Daycare'}
          </button>
        ))}
      </div>

      <div style={s.pickerRow}>
        <DatePicker label="Drop-off date" value={dropDate} onChange={setDropDate} blockedDates={noBlocked} rangeEnd={service === 'boarding' ? pickDate : null} />
        {service === 'boarding' && (
          <DatePicker label="Pick-up date" value={pickDate} onChange={setPickDate} blockedDates={noBlocked} rangeStart={dropDate} minDate={dropDate ?? undefined} />
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

      <label style={s.flabel}>Price
        <input type="number" min="0" step="1" value={price} onChange={e => setPrice(e.target.value)} placeholder="enter price (no auto-calculation)" style={s.input} />
      </label>

      <label style={s.flabel}>Notes (optional — e.g. dog names, details)
        <textarea value={careNotes} onChange={e => setCareNotes(e.target.value)} rows={2} style={{ ...s.input, resize: 'vertical', fontFamily: 'inherit' }} />
      </label>

      {err && <p style={{ margin: 0, fontSize: 13, color: '#ef4444' }}>{err}</p>}
      <button type="button" onClick={submit} disabled={submitting}
        style={{ ...s.submit, opacity: submitting ? 0.5 : 1, cursor: submitting ? 'not-allowed' : 'pointer' }}>
        {submitting ? 'Creating…' : 'Create Booking'}
      </button>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  form:      { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 12, boxShadow: '0 8px 30px rgba(0,0,0,0.12)' },
  formHead:  { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  sub:       { margin: 0, fontSize: 13, color: '#6b7280', lineHeight: 1.5 },
  close:     { fontSize: 12, fontWeight: 600, color: '#374151', background: '#f3f4f6', border: 'none', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontFamily: 'inherit' },
  flabel:    { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, fontWeight: 600, color: '#374151' },
  fieldRow:  { display: 'flex', gap: 10, flexWrap: 'wrap' },
  pickerRow: { display: 'flex', gap: 16, flexWrap: 'wrap' },
  toggleBtn: { fontSize: 14, fontWeight: 600, padding: '8px 16px', borderRadius: 8, border: '1.5px solid', cursor: 'pointer', fontFamily: 'inherit' },
  input:     { fontSize: 14, padding: '9px 11px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', color: '#111827', fontFamily: 'inherit', marginTop: 2 },
  submit:    { fontSize: 15, fontWeight: 700, color: '#fff', background: '#2563eb', border: 'none', borderRadius: 10, padding: '11px 0', fontFamily: 'inherit' },
}
