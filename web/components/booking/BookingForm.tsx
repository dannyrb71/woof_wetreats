'use client'
import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { calculatePrice, MaxStayExceededError } from '@/lib/pricing-engine'
import type { PricingResult, PaymentMethod, ServiceType, RateTable } from '@/lib/pricing-engine'
import DatePicker from './DatePicker'
import TimePicker from './TimePicker'

interface Dog { id: string; name: string; birthdate: string }

const DEFAULT_DROPOFF_TIME = '12:00 PM'
const DEFAULT_PICKUP_TIME  = '12:00 PM'

// Convert '12:00 PM' display format → '12:00:00' DB format
function toDbTime(display: string): string {
  const [time, meridiem] = display.split(' ')
  let [h, m] = time.split(':').map(Number)
  if (meridiem === 'PM' && h !== 12) h += 12
  if (meridiem === 'AM' && h === 12) h = 0
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`
}

export default function BookingForm() {
  const router   = useRouter()
  const supabase = createClient()

  // ── Data fetched on mount ──────────────────────────────────
  const [dogs,         setDogs]         = useState<Dog[]>([])
  const [blockedDates, setBlockedDates] = useState<Set<string>>(new Set())
  const [loadError,    setLoadError]    = useState('')

  // ── Form state ─────────────────────────────────────────────
  const [service,      setService]      = useState<ServiceType>('boarding')
  const [dropoffDate,  setDropoffDate]  = useState<string | null>(null)
  const [pickupDate,   setPickupDate]   = useState<string | null>(null)
  const [dropoffTime,  setDropoffTime]  = useState(DEFAULT_DROPOFF_TIME)
  const [pickupTime,   setPickupTime]   = useState(DEFAULT_PICKUP_TIME)
  const [selectedDogs, setSelectedDogs] = useState<Set<string>>(new Set())
  const [payment,      setPayment]      = useState<PaymentMethod>('cash')
  const [careNotes,    setCareNotes]    = useState('')

  // ── Submit state ───────────────────────────────────────────
  const [submitting,   setSubmitting]   = useState(false)
  const [submitError,  setSubmitError]  = useState('')

  // ── Pricing state ──────────────────────────────────────────
  const [pricing,      setPricing]      = useState<PricingResult | null>(null)
  const [pricingError, setPricingError] = useState('')
  const [rates,        setRates]        = useState<RateTable | null>(null)

  // ── Load dogs, blocked dates, and client default care notes ─
  useEffect(() => {
    async function load() {
      const [{ data: dogsData, error: dogsErr }, { data: bdData, error: bdErr }, { data: profile }, { data: ratesData }] = await Promise.all([
        supabase.from('dogs').select('id, name, birthdate').eq('active', true).order('name'),
        supabase.from('blocked_dates').select('date'),
        supabase.from('clients_client_view').select('care_notes').single(),
        supabase.rpc('get_pricing_rates'),
      ])

      if (dogsErr || bdErr) { setLoadError('Failed to load booking data. Please refresh.'); return }

      setDogs(dogsData ?? [])
      setBlockedDates(new Set((bdData ?? []).map((r: { date: string }) => r.date)))
      if (dogsData?.length === 1) setSelectedDogs(new Set([dogsData[0].id]))
      if (profile?.care_notes) setCareNotes(profile.care_notes)
      if (ratesData) setRates(ratesData as RateTable)
    }
    load()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Live price recalc ──────────────────────────────────────
  useEffect(() => {
    setPricingError('')
    setPricing(null)

    const chosenDogs = dogs.filter(d => selectedDogs.has(d.id))
    if (chosenDogs.length === 0) return
    if (!rates) return   // wait for rates before previewing a price

    if (service === 'boarding') {
      if (!dropoffDate || !pickupDate) return
      if (pickupDate <= dropoffDate) return
      try {
        setPricing(calculatePrice({
          service_type: 'boarding', dropoff_date: dropoffDate,
          pickup_date: pickupDate, dogs: chosenDogs, payment_method: payment,
        }, rates))
      } catch (e) {
        if (e instanceof MaxStayExceededError) setPricingError(e.message)
      }
    } else {
      if (!dropoffDate) return
      setPricing(calculatePrice({
        service_type: 'daycare', dropoff_date: dropoffDate,
        pickup_date: dropoffDate, dogs: chosenDogs, payment_method: payment,
      }, rates))
    }
  }, [service, dropoffDate, pickupDate, selectedDogs, payment, dogs, rates])

  // ── Handlers ───────────────────────────────────────────────
  function handleDropoffChange(date: string) {
    setDropoffDate(date)
    if (pickupDate && pickupDate <= date) setPickupDate(null)
  }

  function toggleDog(id: string) {
    setSelectedDogs(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function handleSubmit() {
    if (!pricing || submitting) return
    setSubmitting(true)
    setSubmitError('')

    try {
      const res = await fetch('/api/booking/create', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service_type:   service,
          dropoff_date:   dropoffDate,
          dropoff_time:   toDbTime(dropoffTime),
          pickup_date:    service === 'daycare' ? dropoffDate : pickupDate,
          pickup_time:    toDbTime(pickupTime),
          payment_method: payment,
          dog_ids:        Array.from(selectedDogs),
          care_notes:     careNotes.trim() || undefined,
        }),
      })

      const json = await res.json()

      if (!res.ok) {
        setSubmitError(json.error ?? 'Something went wrong. Please try again.')
        return
      }

      router.push(`/booking/confirmation?id=${json.reservation.id}`)
    } catch {
      setSubmitError('Network error. Please check your connection and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Derived ────────────────────────────────────────────────
  const todayStr = new Date().toISOString().slice(0, 10)

  // Check whether any blocked date falls inside the selected range (exclusive of endpoints).
  // Endpoints being blocked are already prevented by the DatePicker, so this catches the
  // "middle of range" case — e.g. drop-off July 2, pick-up July 6, but July 3-4 are blocked.
  const rangeBlockedDates: string[] = React.useMemo(() => {
    if (service !== 'boarding' || !dropoffDate || !pickupDate) return []
    const hits: string[] = []
    const d = new Date(dropoffDate + 'T00:00:00')
    const end = new Date(pickupDate + 'T00:00:00')
    while (d < end) {
      const ymd = d.toISOString().slice(0, 10)
      if (blockedDates.has(ymd)) hits.push(ymd)
      d.setDate(d.getDate() + 1)
    }
    return hits
  }, [service, dropoffDate, pickupDate, blockedDates])

  const rangeIsBlocked = rangeBlockedDates.length > 0
  const canSubmit = !!pricing && !pricingError && !submitting && !rangeIsBlocked
  const rateLabel: Record<string, string> = {
    regular: 'Regular', extended: 'Extended stay', holiday: 'Holiday', daycare: 'Daycare',
  }

  if (loadError) return <p style={{ color: '#ef4444', padding: 16 }}>{loadError}</p>

  return (
    <div style={s.root}>
      {/* ── Service type ──────────────────────────────────── */}
      <section style={s.section}>
        <h3 style={s.sectionTitle}>Service</h3>
        <div style={s.toggle}>
          {(['boarding', 'daycare'] as ServiceType[]).map(svc => (
            <button key={svc} type="button"
              style={{ ...s.toggleBtn, ...(service === svc ? s.toggleActive : {}) }}
              onClick={() => { setService(svc); setDropoffDate(null); setPickupDate(null) }}
            >
              {svc === 'boarding' ? '🏠 Boarding' : '🌞 Daycare'}
            </button>
          ))}
        </div>
      </section>

      {/* ── Dates & Times ─────────────────────────────────── */}
      <section style={s.section}>
        <h3 style={s.sectionTitle}>{service === 'boarding' ? 'Drop-off & Pick-up' : 'Date'}</h3>
        <div style={s.calRow}>
          {service === 'boarding' ? (
            <>
              <div style={s.calCol}>
                <DatePicker label="Drop-off date" value={dropoffDate} onChange={handleDropoffChange}
                  blockedDates={blockedDates} rangeStart={dropoffDate} rangeEnd={pickupDate} minDate={todayStr} />
                <div style={{ marginTop: 10 }}>
                  <TimePicker label="Drop-off time" value={dropoffTime} onChange={setDropoffTime} />
                </div>
              </div>
              <div style={s.calCol}>
                <DatePicker label="Pick-up date" value={pickupDate} onChange={setPickupDate}
                  blockedDates={blockedDates} rangeStart={dropoffDate} rangeEnd={pickupDate}
                  minDate={dropoffDate ?? todayStr} />
                <div style={{ marginTop: 10 }}>
                  <TimePicker label="Pick-up time" value={pickupTime} onChange={setPickupTime} />
                </div>
              </div>
            </>
          ) : (
            <div style={s.calCol}>
              <DatePicker label="Date" value={dropoffDate} onChange={setDropoffDate}
                blockedDates={blockedDates} minDate={todayStr} />
              <div style={{ marginTop: 10, display: 'flex', gap: 16 }}>
                <TimePicker label="Drop-off time" value={dropoffTime} onChange={setDropoffTime} />
                <TimePicker label="Pick-up time"  value={pickupTime}  onChange={setPickupTime} />
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ── Blocked-range warning ────────────────────────── */}
      {rangeIsBlocked && (
        <div style={s.rangeWarning}>
          <span style={s.rangeWarningIcon}>⚠️</span>
          <p style={s.rangeWarningText}>
            Your selected stay includes dates we're unavailable
            {rangeBlockedDates.length <= 3 ? ` (${rangeBlockedDates.join(', ')})` : ''}.
            Please choose different dates or{' '}
            <a href="sms:+14155960160" style={{ color: '#92400e', fontWeight: 600 }}>text us</a> directly.
          </p>
        </div>
      )}

      {/* ── Dog selection ─────────────────────────────────── */}
      <section style={s.section}>
        <h3 style={s.sectionTitle}>Dog(s)</h3>
        {dogs.length === 0
          ? <p style={s.hint}>No dogs on your account yet. <a href="/onboarding" style={{ color: '#2563eb' }}>Add one</a>.</p>
          : dogs.map(dog => (
            <label key={dog.id} style={s.checkRow}>
              <input type="checkbox" checked={selectedDogs.has(dog.id)}
                onChange={() => toggleDog(dog.id)}
                style={{ accentColor: '#2563eb', width: 16, height: 16 }} />
              <span style={s.dogName}>{dog.name}</span>
              <span style={s.dogBirth}>{dog.birthdate}</span>
            </label>
          ))
        }
      </section>

      {/* ── Payment method ────────────────────────────────── */}
      <section style={s.section}>
        <h3 style={s.sectionTitle}>Payment method</h3>
        <div style={s.toggle}>
          {(['cash', 'venmo'] as PaymentMethod[]).map(m => (
            <button key={m} type="button"
              style={{ ...s.toggleBtn, ...(payment === m ? s.toggleActive : {}) }}
              onClick={() => setPayment(m)}
            >
              {m === 'cash' ? '💵 Cash' : '💙 Venmo'}
            </button>
          ))}
        </div>
        {payment === 'venmo' && (
          <p style={s.hint}>Venmo rates are slightly higher — $5 per dog per night.</p>
        )}
      </section>

      {/* ── Care notes ────────────────────────────────────── */}
      <section style={s.section}>
        <h3 style={s.sectionTitle}>Care notes <span style={s.optional}>(optional)</span></h3>
        <textarea
          value={careNotes}
          onChange={e => setCareNotes(e.target.value)}
          placeholder="Anything we should know for this stay — feeding schedule, medications, quirks…"
          rows={3}
          style={s.textarea}
        />
      </section>

      {/* ── Live price preview ────────────────────────────── */}
      <section style={{ ...s.section, ...s.priceBox }}>
        <h3 style={{ ...s.sectionTitle, margin: 0 }}>Price estimate</h3>
        {pricingError && <p style={{ color: '#ef4444', fontSize: 13, margin: '8px 0 0' }}>{pricingError}</p>}
        {!pricing && !pricingError && (
          <p style={{ color: '#9ca3af', fontSize: 13, margin: '8px 0 0' }}>
            {selectedDogs.size === 0 ? 'Select at least one dog.' : 'Select dates to see your price.'}
          </p>
        )}
        {pricing && (
          <>
            <div style={s.totalRow}>
              <span style={s.totalLabel}>Total</span>
              <span style={s.totalAmount}>${pricing.total.toFixed(2)}</span>
            </div>
            {pricing.total_nights > 0 && (
              <p style={s.priceDetail}>
                {pricing.total_nights} night{pricing.total_nights !== 1 ? 's' : ''}
                {pricing.is_extended ? ' · Extended stay rate' : ''}
              </p>
            )}
            <div style={s.breakdown}>
              {pricing.breakdown.slice(0, 5).map((p, i) => (
                <div key={i} style={s.breakdownRow}>
                  <span style={{ color: '#6b7280', fontSize: 12 }}>
                    {p.type !== 'daycare' ? p.date : 'Daycare'}&nbsp;
                    <span style={{ ...s.rateTag, ...(p.type === 'holiday' ? s.rateHoliday : {}) }}>
                      {rateLabel[p.type]}
                    </span>
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 500 }}>${p.subtotal.toFixed(2)}</span>
                </div>
              ))}
              {pricing.breakdown.length > 5 && (
                <p style={{ fontSize: 12, color: '#9ca3af', margin: '4px 0 0' }}>
                  + {pricing.breakdown.length - 5} more nights
                </p>
              )}
            </div>
          </>
        )}
      </section>

      {/* ── Submit error ──────────────────────────────────── */}
      {submitError && (
        <p style={{ color: '#ef4444', fontSize: 13, margin: '16px 0 0', textAlign: 'center' }}>
          {submitError}
        </p>
      )}

      {/* ── Terms agreement (shown on every submission) ───── */}
      <p style={s.termsNotice}>
        By clicking Request Booking, you agree to our{' '}
        <a href="/terms" target="_blank" rel="noopener noreferrer" style={s.termsLink}>
          Terms of Service
        </a>.
      </p>

      {/* ── Submit ────────────────────────────────────────── */}
      <button
        type="button"
        onClick={handleSubmit}
        disabled={!canSubmit}
        style={{ ...s.submitBtn, ...(!canSubmit ? s.submitDisabled : {}) }}
      >
        {submitting ? 'Submitting…' : 'Request Booking'}
      </button>
    </div>
  )
}

// ── Styles ─────────────────────────────────────────────────────
const s: Record<string, React.CSSProperties> = {
  root:          { display: 'flex', flexDirection: 'column', gap: 0 },
  section:       { padding: '20px 0', borderBottom: '1px solid #f3f4f6' },
  sectionTitle:  { margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: '#111827' },
  optional:      { fontWeight: 400, color: '#9ca3af', fontSize: 13 },
  toggle:        { display: 'flex', gap: 8 },
  toggleBtn:     { padding: '8px 18px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit', color: '#374151' },
  toggleActive:  { background: '#2563eb', color: '#fff', border: '1px solid #2563eb', fontWeight: 600 },
  calRow:        { display: 'flex', gap: 20, flexWrap: 'wrap' },
  calCol:        { display: 'flex', flexDirection: 'column' },
  checkRow:      { display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', cursor: 'pointer' },
  dogName:       { fontSize: 14, fontWeight: 500, color: '#111827' },
  dogBirth:      { fontSize: 12, color: '#9ca3af' },
  hint:          { fontSize: 13, color: '#6b7280', margin: '4px 0 0' },
  textarea:      { width: '100%', borderRadius: 8, border: '1px solid #e5e7eb', padding: '10px 12px', fontSize: 13, lineHeight: 1.6, fontFamily: 'inherit', resize: 'vertical', color: '#111827', boxSizing: 'border-box' },
  priceBox:      { background: 'var(--surface-muted)', borderRadius: 12, padding: 16, border: '1px solid #e5e7eb', marginTop: 4 },
  totalRow:      { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 10 },
  totalLabel:    { fontWeight: 600, fontSize: 15, color: '#111827' },
  totalAmount:   { fontWeight: 700, fontSize: 24, color: '#2563eb' },
  priceDetail:   { margin: '2px 0 8px', fontSize: 12, color: '#6b7280' },
  breakdown:     { borderTop: '1px solid #e5e7eb', paddingTop: 8, marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 },
  breakdownRow:  { display: 'flex', justifyContent: 'space-between' },
  rateTag:       { background: '#e5e7eb', color: '#374151', fontSize: 10, padding: '1px 5px', borderRadius: 4, fontWeight: 600, textTransform: 'uppercase' },
  rateHoliday:   { background: '#fef3c7', color: '#92400e' },
  rangeWarning:     { display: 'flex', gap: 10, alignItems: 'flex-start', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 10, padding: '12px 14px', margin: '4px 0' },
  rangeWarningIcon: { fontSize: 16, flexShrink: 0, marginTop: 1 },
  rangeWarningText: { margin: 0, fontSize: 13, color: '#78350f', lineHeight: 1.5 },
  submitBtn:     { marginTop: 8, padding: '13px 0', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
  submitDisabled:{ background: '#e5e7eb', color: '#9ca3af', cursor: 'not-allowed' },
  termsNotice:   { margin: '20px 0 0', fontSize: 13, color: '#6b7280', textAlign: 'center', lineHeight: 1.5 },
  termsLink:     { color: '#2563eb', fontWeight: 600, textDecoration: 'underline' },
}
