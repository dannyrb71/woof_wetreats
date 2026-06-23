'use client'
import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'

interface Reservation {
  id:             string
  service_type:   string
  dropoff_date:   string
  dropoff_time:   string
  pickup_date:    string
  pickup_time:    string
  payment_method: string
  total_price:    number
  status:         string
  care_notes:     string | null
}

function fmtDate(ymd: string): string {
  const d = new Date(ymd + 'T00:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' })
}

function fmtTime(t: string): string {
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`
}

// useSearchParams() requires a Suspense boundary during static generation,
// so the data-loading body lives in a child wrapped by <Suspense> below.
function ConfirmationContent() {
  const router      = useRouter()
  const params      = useSearchParams()
  const id          = params.get('id')
  const supabase    = createClient()

  const [reservation, setReservation] = useState<Reservation | null>(null)
  const [dogNames,    setDogNames]    = useState<string[]>([])
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState('')

  useEffect(() => {
    if (!id) { router.replace('/dashboard'); return }

    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.replace('/auth'); return }

      const { data: res, error: resErr } = await supabase
        .from('reservations')
        .select('*')
        .eq('id', id)
        .single()

      if (resErr || !res) { setError('Reservation not found.'); setLoading(false); return }
      setReservation(res)

      // Fetch dog names via reservation_dogs join
      const { data: rd } = await supabase
        .from('reservation_dogs')
        .select('dog_id, dogs(name)')
        .eq('reservation_id', id)

      if (rd) {
        // Supabase types the embedded `dogs(name)` join as an array; normalize
        // to handle either an object or a single-element array at runtime.
        const rows = rd as unknown as Array<{ dogs: { name: string } | { name: string }[] | null }>
        const names = rows
          .map(r => (Array.isArray(r.dogs) ? r.dogs[0] : r.dogs)?.name ?? '')
          .filter(Boolean)
        setDogNames(names)
      }
      setLoading(false)
    }
    load()
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return (
    <div style={s.center}><p style={{ color: '#6b7280' }}>Loading…</p></div>
  )
  if (error) return (
    <div style={s.center}><p style={{ color: '#ef4444' }}>{error}</p></div>
  )
  if (!reservation) return null

  const isBoarding = reservation.service_type === 'boarding'
  const nights = isBoarding
    ? Math.round((new Date(reservation.pickup_date + 'T00:00:00').getTime() -
                  new Date(reservation.dropoff_date + 'T00:00:00').getTime()) / 86400000)
    : null

  return (
    <div style={s.page}>
      <div style={s.card}>
        {/* Success header */}
        <div style={s.successHeader}>
          <div style={s.checkCircle}>✓</div>
          <h1 style={s.title}>Booking Confirmed!</h1>
          <p style={s.subtitle}>
            Your {isBoarding ? 'boarding' : 'daycare'} request has been received.
            We'll see you soon!
          </p>
        </div>

        {/* Reservation details */}
        <div style={s.detailsCard}>
          <div style={s.detailRow}>
            <span style={s.detailLabel}>Service</span>
            <span style={{ ...s.detailValue, ...s.serviceBadge,
              background: isBoarding ? '#eff6ff' : '#fefce8',
              color:      isBoarding ? '#0058A0' : '#92400e',
            }}>
              {isBoarding ? '🏠 Boarding' : '🌞 Daycare'}
            </span>
          </div>

          <div style={s.detailRow}>
            <span style={s.detailLabel}>Dog{dogNames.length !== 1 ? 's' : ''}</span>
            <span style={s.detailValue}>{dogNames.join(', ') || '—'}</span>
          </div>

          <div style={s.divider} />

          <div style={s.detailRow}>
            <span style={s.detailLabel}>Drop-off</span>
            <span style={s.detailValue}>
              {fmtDate(reservation.dropoff_date)} at {fmtTime(reservation.dropoff_time)}
            </span>
          </div>

          {isBoarding && (
            <div style={s.detailRow}>
              <span style={s.detailLabel}>Pick-up</span>
              <span style={s.detailValue}>
                {fmtDate(reservation.pickup_date)} at {fmtTime(reservation.pickup_time)}
              </span>
            </div>
          )}

          {nights !== null && (
            <div style={s.detailRow}>
              <span style={s.detailLabel}>Duration</span>
              <span style={s.detailValue}>{nights} night{nights !== 1 ? 's' : ''}</span>
            </div>
          )}

          <div style={s.divider} />

          <div style={s.detailRow}>
            <span style={s.detailLabel}>Payment</span>
            <span style={s.detailValue}>
              {reservation.payment_method === 'cash' ? '💵 Cash' : '💙 Venmo'}
            </span>
          </div>

          <div style={s.detailRow}>
            <span style={s.detailLabel}>Total</span>
            <span style={{ ...s.detailValue, fontSize: 20, fontWeight: 800, color: '#111827' }}>
              ${Number(reservation.total_price).toFixed(2)}
            </span>
          </div>

          {reservation.care_notes && (
            <>
              <div style={s.divider} />
              <div style={s.detailRow}>
                <span style={s.detailLabel}>Care notes</span>
                <span style={{ ...s.detailValue, fontStyle: 'italic', color: '#6b7280' }}>
                  {reservation.care_notes}
                </span>
              </div>
            </>
          )}
        </div>

        {/* Confirmation ID */}
        <p style={s.refLine}>
          Confirmation # <code style={s.refCode}>{reservation.id.slice(0, 8).toUpperCase()}</code>
        </p>

        {/* Actions */}
        <div style={s.actions}>
          <button type="button" onClick={() => router.push('/booking')} style={s.secondaryBtn}>
            + New reservation
          </button>
          <button type="button" onClick={() => router.push('/dashboard')} style={s.primaryBtn}>
            Back to dashboard →
          </button>
        </div>
      </div>
    </div>
  )
}

export default function ConfirmationPage() {
  return (
    <Suspense fallback={<div style={s.center}><p style={{ color: '#6b7280' }}>Loading…</p></div>}>
      <ConfirmationContent />
    </Suspense>
  )
}

const s: Record<string, React.CSSProperties> = {
  page:          { minHeight: '100vh', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '48px 16px', background: 'var(--page-bg)' },
  center:        { display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' },
  card:          { background: '#fff', borderRadius: 16, padding: '36px 32px', width: '100%', maxWidth: 520, boxShadow: '0 4px 24px rgba(0,0,0,0.08)' },
  successHeader: { textAlign: 'center', marginBottom: 28 },
  checkCircle:   { width: 56, height: 56, borderRadius: '50%', background: '#dcfce7', color: '#16a34a', fontSize: 24, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' },
  title:         { margin: '0 0 8px', fontSize: 24, fontWeight: 800, color: '#111827' },
  subtitle:      { margin: 0, fontSize: 14, color: '#6b7280', lineHeight: 1.5 },
  detailsCard:   { background: 'var(--surface-muted)', borderRadius: 12, padding: '20px', marginBottom: 16, border: '1px solid #e5e7eb' },
  detailRow:     { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, padding: '6px 0' },
  detailLabel:   { fontSize: 13, color: '#6b7280', flexShrink: 0 },
  detailValue:   { fontSize: 14, fontWeight: 600, color: '#111827', textAlign: 'right' },
  serviceBadge:  { padding: '2px 10px', borderRadius: 20, fontSize: 13 },
  divider:       { borderTop: '1px solid #e5e7eb', margin: '10px 0' },
  refLine:       { textAlign: 'center', fontSize: 12, color: '#9ca3af', margin: '0 0 24px' },
  refCode:       { fontFamily: 'monospace', background: '#f3f4f6', padding: '2px 6px', borderRadius: 4, color: '#374151' },
  actions:       { display: 'flex', gap: 12 },
  primaryBtn:    { flex: 1, padding: '12px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
  secondaryBtn:  { flex: 1, padding: '12px', background: '#fff', color: '#374151', border: '1px solid #e5e7eb', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
}
