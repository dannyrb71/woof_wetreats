'use client'
import React, { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { calculatePrice, getHolidayDateRange } from '@/lib/pricing-engine'
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

const MAX_OCCURRENCES = 12
const toYmd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const fmtShort = (ymd: string) => new Date(ymd + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
const weekdayName = (ymd: string) => new Date(ymd + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long' })

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

  // ── Recurring daycare ──────────────────────────────────────
  const [repeat,      setRepeat]      = useState(false)
  const [repeatMode,  setRepeatMode]  = useState<'count' | 'until'>('count')
  const [repeatCount, setRepeatCount] = useState(4)
  const [repeatUntil, setRepeatUntil] = useState<string | null>(null)

  // ── Submit state ───────────────────────────────────────────
  const [submitting,   setSubmitting]   = useState(false)
  const [submitError,  setSubmitError]  = useState('')

  // ── Pricing state ──────────────────────────────────────────
  const [pricing,      setPricing]      = useState<PricingResult | null>(null)
  const [pricingError, setPricingError] = useState('')
  const [rates,        setRates]        = useState<RateTable | null>(null)

  // Holiday dates for the next 2 years — computed once, no I/O required.
  const holidayDates = useMemo(() => {
    const from = new Date().toISOString().slice(0, 10)
    const to   = `${new Date().getFullYear() + 2}-12-31`
    return getHolidayDateRange(from, to)
  }, [])

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
      setPricing(calculatePrice({
        service_type: 'boarding', dropoff_date: dropoffDate,
        pickup_date: pickupDate, dogs: chosenDogs, payment_method: payment,
      }, rates))
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

  function createOne(date: string) {
    return fetch('/api/booking/create', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service_type:   service,
        dropoff_date:   date,
        dropoff_time:   toDbTime(dropoffTime),
        pickup_date:    service === 'daycare' ? date : pickupDate,
        pickup_time:    toDbTime(pickupTime),
        payment_method: payment,
        dog_ids:        Array.from(selectedDogs),
        care_notes:     careNotes.trim() || undefined,
      }),
    })
  }

  async function handleSubmit() {
    if (!pricing || submitting || !dropoffDate) return
    setSubmitting(true)
    setSubmitError('')

    try {
      // Recurring daycare → create one booking per available (non-blocked) week.
      if (recurringActive) {
        let made = 0
        for (const date of availableOccurrences) {
          const res = await createOne(date)
          const json = await res.json()
          if (!res.ok) {
            setSubmitError(`Booked ${made} visit${made !== 1 ? 's' : ''}, then hit a problem on ${fmtShort(date)}: ${json.error ?? 'try again'}.`)
            return
          }
          made++
        }
        router.push('/dashboard')
        return
      }

      // Single booking (boarding or one-off daycare).
      const res = await createOne(dropoffDate)
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

  // Recurring daycare: weekly occurrences from the selected date.
  const occurrences = React.useMemo(() => {
    if (service !== 'daycare' || !repeat || !dropoffDate) return []
    const dates: string[] = []
    const start = new Date(dropoffDate + 'T00:00:00')
    for (let i = 0; i < MAX_OCCURRENCES; i++) {
      const d = new Date(start); d.setDate(start.getDate() + i * 7)
      const ymd = toYmd(d)
      if (repeatMode === 'until') { if (!repeatUntil || ymd > repeatUntil) break }
      dates.push(ymd)
      if (repeatMode === 'count' && dates.length >= repeatCount) break
    }
    return dates
  }, [service, repeat, dropoffDate, repeatMode, repeatCount, repeatUntil])

  const blockedOccurrences   = occurrences.filter(d => blockedDates.has(d))
  const availableOccurrences = occurrences.filter(d => !blockedDates.has(d))
  const recurringActive = service === 'daycare' && repeat
  const perVisit        = pricing?.total ?? 0
  const recurringTotal  = perVisit * availableOccurrences.length

  const canSubmit = !!pricing && !pricingError && !submitting && !rangeIsBlocked
    && (!recurringActive || availableOccurrences.length > 0)
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
              style={{ ...s.toggleBtn, ...(service === svc ? { ...s.toggleActive, background: svc === 'boarding' ? 'var(--status-boarding)' : 'var(--status-daycare)' } : {}) }}
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
                  blockedDates={blockedDates} holidayDates={holidayDates} rangeStart={dropoffDate} rangeEnd={pickupDate} minDate={todayStr} />
                <div style={{ marginTop: 10 }}>
                  <TimePicker label="Drop-off time" value={dropoffTime} onChange={setDropoffTime} />
                </div>
              </div>
              <div style={s.calCol}>
                <DatePicker label="Pick-up date" value={pickupDate} onChange={setPickupDate}
                  blockedDates={blockedDates} holidayDates={holidayDates} rangeStart={dropoffDate} rangeEnd={pickupDate}
                  minDate={dropoffDate ?? todayStr} />
                <div style={{ marginTop: 10 }}>
                  <TimePicker label="Pick-up time" value={pickupTime} onChange={setPickupTime} />
                </div>
              </div>
            </>
          ) : (
            <div style={s.calCol}>
              <DatePicker label="Date" value={dropoffDate} onChange={setDropoffDate}
                blockedDates={blockedDates} holidayDates={holidayDates} minDate={todayStr} />
              <div style={{ marginTop: 10, display: 'flex', gap: 16 }}>
                <TimePicker label="Drop-off time" value={dropoffTime} onChange={setDropoffTime} />
                <TimePicker label="Pick-up time"  value={pickupTime}  onChange={setPickupTime} />
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ── Repeat weekly (daycare only) ──────────────────── */}
      {service === 'daycare' && (
        <section style={s.section}>
          <label style={{ ...s.checkRow, cursor: 'pointer' }}>
            <input type="checkbox" checked={repeat} onChange={e => setRepeat(e.target.checked)}
              style={{ accentColor: 'var(--primary)', width: 16, height: 16 }} />
            <span style={s.dogName}>Repeat weekly</span>
          </label>

          {repeat && (
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={s.hint}>
                Books the same weekday each week{dropoffDate ? ` (every ${weekdayName(dropoffDate)})` : ''}, up to {MAX_OCCURRENCES} visits.
              </p>
              <div style={s.toggle}>
                {(['count', 'until'] as const).map(mode => (
                  <button key={mode} type="button" onClick={() => setRepeatMode(mode)}
                    style={{ ...s.toggleBtn, ...(repeatMode === mode ? s.toggleActive : {}) }}>
                    {mode === 'count' ? 'Number of visits' : 'Until a date'}
                  </button>
                ))}
              </div>

              {repeatMode === 'count' ? (
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: '#374151' }}>
                  Number of visits
                  <select value={repeatCount} onChange={e => setRepeatCount(Number(e.target.value))} style={s.select}>
                    {Array.from({ length: MAX_OCCURRENCES - 1 }, (_, i) => i + 2).map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </label>
              ) : (
                <DatePicker label="Repeat until" value={repeatUntil} onChange={setRepeatUntil}
                  blockedDates={blockedDates} holidayDates={holidayDates} minDate={dropoffDate ?? todayStr} />
              )}

              {availableOccurrences.length > 0 && (
                <div style={s.occSummary}>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#111827' }}>
                    {availableOccurrences.length} visit{availableOccurrences.length !== 1 ? 's' : ''}
                  </p>
                  <p style={{ margin: '4px 0 0', fontSize: 12, color: '#6b7280', lineHeight: 1.7 }}>
                    {availableOccurrences.map(fmtShort).join('  ·  ')}
                  </p>
                </div>
              )}

              {blockedOccurrences.length > 0 && (
                <div style={s.rangeWarning}>
                  <span style={s.rangeWarningIcon}>⚠️</span>
                  <p style={s.rangeWarningText}>
                    We&apos;re unavailable on {blockedOccurrences.map(fmtShort).join(', ')} — {blockedOccurrences.length === 1 ? 'that date' : 'those dates'} will be skipped.
                  </p>
                </div>
              )}
            </div>
          )}
        </section>
      )}

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
          ? <p style={s.hint}>No dogs on your account yet. <a href="/onboarding" style={{ color: 'var(--primary)' }}>Add one</a>.</p>
          : dogs.map(dog => (
            <label key={dog.id} style={s.checkRow}>
              <input type="checkbox" checked={selectedDogs.has(dog.id)}
                onChange={() => toggleDog(dog.id)}
                style={{ accentColor: 'var(--primary)', width: 16, height: 16 }} />
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

      {/* Care notes field removed — the client's standing Care Notes card is the
          single source; the saved notes still flow onto the booking via careNotes. */}

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
              <span style={s.totalAmount}>${(recurringActive ? recurringTotal : pricing.total).toFixed(2)}</span>
            </div>
            {recurringActive && (
              <p style={s.priceDetail}>
                {availableOccurrences.length} visit{availableOccurrences.length !== 1 ? 's' : ''} × ${perVisit.toFixed(2)} each
              </p>
            )}
            {!recurringActive && pricing.total_nights > 0 && (
              <p style={s.priceDetail}>
                {pricing.total_nights} night{pricing.total_nights !== 1 ? 's' : ''}
                {pricing.is_extended ? ' · Extended stay rate' : ''}
              </p>
            )}
            {pricing.total_nights > 14 && (
              <p style={s.longStayNote}>
                🌙 For stays over 14 days, we offer a custom flat rate — we&apos;ll reach out to
                confirm pricing, or feel free to text us in the meantime. The amount above is an
                estimate for now.
              </p>
            )}
            {!recurringActive && <div style={s.breakdown}>
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
            </div>}
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
        By clicking Submit, you agree to our{' '}
        <a href="/terms" target="_blank" rel="noopener noreferrer" style={s.termsLink}>
          Terms of Service
        </a>.
      </p>

      {/* ── Submit ────────────────────────────────────────── */}
      <button
        type="button"
        onClick={handleSubmit}
        disabled={!canSubmit}
        className="btn btn-booking"
        style={{ marginTop: 8, width: '100%' }}
      >
        {submitting ? 'Submitting…' : 'Submit'}
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
  toggleActive:  { background: 'var(--primary)', color: '#fff', border: '1px solid transparent', fontWeight: 600 },
  calRow:        { display: 'flex', gap: 20, flexWrap: 'wrap' },
  calCol:        { display: 'flex', flexDirection: 'column' },
  checkRow:      { display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', cursor: 'pointer' },
  dogName:       { fontSize: 14, fontWeight: 500, color: '#111827' },
  dogBirth:      { fontSize: 12, color: '#9ca3af' },
  hint:          { fontSize: 13, color: '#6b7280', margin: '4px 0 0' },
  textarea:      { width: '100%', borderRadius: 8, border: '1px solid #e5e7eb', padding: '10px 12px', fontSize: 13, lineHeight: 1.6, fontFamily: 'inherit', resize: 'vertical', color: '#111827', boxSizing: 'border-box' },
  select:        { fontSize: 14, padding: '8px 12px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', color: '#111827', fontFamily: 'inherit', cursor: 'pointer' },
  occSummary:    { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '12px 14px' },
  priceBox:      { background: 'var(--surface-muted)', borderRadius: 'var(--radius-card)', padding: 16, border: '1px solid #e5e7eb', marginTop: 4 },
  totalRow:      { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 10 },
  totalLabel:    { fontWeight: 600, fontSize: 15, color: '#111827' },
  totalAmount:   { fontWeight: 700, fontSize: 24, color: 'var(--primary)' },
  priceDetail:   { margin: '2px 0 8px', fontSize: 12, color: '#6b7280' },
  longStayNote:  { margin: '2px 0 10px', fontSize: 12.5, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '8px 10px', lineHeight: 1.5 },
  breakdown:     { borderTop: '1px solid #e5e7eb', paddingTop: 8, marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 },
  breakdownRow:  { display: 'flex', justifyContent: 'space-between' },
  rateTag:       { background: '#e5e7eb', color: '#374151', fontSize: 10, padding: '1px 5px', borderRadius: 4, fontWeight: 600, textTransform: 'uppercase' },
  rateHoliday:   { background: '#fef3c7', color: '#92400e' },
  rangeWarning:     { display: 'flex', gap: 10, alignItems: 'flex-start', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 10, padding: '12px 14px', margin: '4px 0' },
  rangeWarningIcon: { fontSize: 16, flexShrink: 0, marginTop: 1 },
  rangeWarningText: { margin: 0, fontSize: 13, color: '#78350f', lineHeight: 1.5 },
  termsNotice:   { margin: '20px 0 0', fontSize: 13, color: '#6b7280', textAlign: 'center', lineHeight: 1.5 },
  termsLink:     { color: 'var(--primary)', fontWeight: 600, textDecoration: 'underline' },
}
