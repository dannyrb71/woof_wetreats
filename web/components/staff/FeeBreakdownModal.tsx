'use client'
import React, { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { calculatePrice } from '@/lib/pricing-engine'
import type { RateTable, PeriodBreakdown } from '@/lib/pricing-engine'

interface Props {
  reservationId: string
  onClose: () => void
}

interface ResData {
  service_type:    'boarding' | 'daycare'
  dropoff_date:    string
  pickup_date:     string
  payment_method:  string
  total_price:     number
  price_overridden: boolean
  paid:            boolean
}
interface DogData { id: string; name: string; birthdate: string }

function fmtDate(ymd: string) {
  return new Date(ymd + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}
function fmtMoney(n: number) { return `$${n.toFixed(2)}` }

// Distribute a total evenly across n nights, in whole cents, so the rows sum exactly.
function evenSplit(total: number, n: number): number[] {
  if (n <= 0) return []
  const base = Math.floor((total / n) * 100) / 100
  const arr = Array(n).fill(base)
  const remainderCents = Math.round((total - base * n) * 100)
  for (let i = 0; i < remainderCents && i < n; i++) arr[i] = Math.round((arr[i] + 0.01) * 100) / 100
  return arr
}

const RATE_LABEL: Record<string, string> = {
  regular:  'Regular',
  extended: 'Extended stay',
  holiday:  'Holiday',
  daycare:  'Daycare',
}
const RATE_COLOR: Record<string, string> = {
  regular:  'var(--text-secondary)',
  extended: 'var(--status-boarding)',
  holiday:  'var(--status-daycare)',
  daycare:  'var(--status-daycare)',
}

export function FeeBreakdownModal({ reservationId, onClose }: Props) {
  const supabase = createClient()
  const [res,      setRes]      = useState<ResData | null>(null)
  const [dogs,     setDogs]     = useState<DogData[]>([])
  const [rates,    setRates]    = useState<RateTable | null>(null)
  const [paidSum,  setPaidSum]  = useState(0)
  const [loading,  setLoading]  = useState(true)
  const [err,      setErr]      = useState('')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [onClose])

  useEffect(() => {
    async function load() {
      const [resR, rdR, ratesR, paysR] = await Promise.all([
        supabase.from('reservations')
          .select('service_type, dropoff_date, pickup_date, payment_method, total_price, price_overridden, paid')
          .eq('id', reservationId).single(),
        supabase.from('reservation_dogs')
          .select('dog_id, dogs(id, name, birthdate)')
          .eq('reservation_id', reservationId),
        supabase.rpc('get_pricing_rates'),
        supabase.from('reservation_payments').select('amount').eq('reservation_id', reservationId),
      ])
      if (resR.error || !resR.data) { setErr('Could not load booking.'); setLoading(false); return }
      setRes(resR.data as ResData)
      setPaidSum((paysR.data ?? []).reduce((sum, p) => sum + Number(p.amount), 0))
      const dogList: DogData[] = []
      for (const row of rdR.data ?? []) {
        const d = Array.isArray(row.dogs) ? row.dogs[0] : row.dogs
        if (d) dogList.push({ id: d.id, name: d.name, birthdate: d.birthdate })
      }
      setDogs(dogList)
      if (ratesR.data) setRates(ratesR.data as RateTable)
      setLoading(false)
    }
    load()
  }, [reservationId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Compute breakdown from the pricing engine
  const breakdown: PeriodBreakdown[] = React.useMemo(() => {
    if (!res || !rates || dogs.length === 0) return []
    try {
      const result = calculatePrice(
        {
          service_type:   res.service_type,
          dropoff_date:   res.dropoff_date,
          pickup_date:    res.service_type === 'daycare' ? res.dropoff_date : res.pickup_date,
          dogs,
          payment_method: res.payment_method as 'cash' | 'venmo',
        },
        rates,
        { skipMaxStayCheck: true },
      )
      return result.breakdown
    } catch {
      return []
    }
  }, [res, rates, dogs])

  const engineTotal = breakdown.reduce((s, p) => s + p.subtotal, 0)
  const storedTotal = res ? Number(res.total_price) : 0
  const isOverride  = !!res?.price_overridden

  // When overridden, show the stored total spread evenly across the nights/days.
  const overrideSplit = React.useMemo(
    () => (isOverride ? evenSplit(storedTotal, breakdown.length) : []),
    [isOverride, storedTotal, breakdown.length],
  )

  const balance   = Math.max(0, storedTotal - paidSum)
  const payStatus = storedTotal > 0 && paidSum >= storedTotal ? 'paid' : paidSum > 0 ? 'partial' : 'unpaid'
  const payColor  = payStatus === 'paid' ? '#15803d' : payStatus === 'partial' ? '#b45309' : '#b45309'
  const payLabel  = payStatus === 'paid' ? '✅ Paid' : payStatus === 'partial' ? '● Partial' : '● Unpaid'

  const serviceLabel = res?.service_type === 'boarding' ? 'Boarding' : 'Daycare'
  const dateRange = res
    ? res.service_type === 'boarding'
      ? `${fmtDate(res.dropoff_date)} – ${fmtDate(res.pickup_date)}`
      : fmtDate(res.dropoff_date)
    : ''

  return (
    <div style={s.overlay} onClick={onClose} role="dialog" aria-modal="true">
      <div style={s.dialog} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={s.header}>
          <div>
            <h2 style={s.title}>Fee Breakdown</h2>
            <p style={s.subtitle}>{serviceLabel} · {dateRange}</p>
          </div>
          <button type="button" onClick={onClose} style={s.closeBtn} aria-label="Close">✕</button>
        </div>

        {loading ? (
          <p style={s.muted}>Loading…</p>
        ) : err ? (
          <p style={{ color: 'var(--error)', fontSize: 13 }}>{err}</p>
        ) : (
          <>
            {/* Override banner */}
            {res?.price_overridden && (
              <div style={s.overrideBanner}>
                <span style={s.overrideIcon}>✎</span>
                <span>
                  Price was <strong>manually overridden</strong> to <strong>{fmtMoney(storedTotal)}</strong>,
                  shown below as an even nightly rate. The engine&apos;s estimate was {fmtMoney(engineTotal)}.
                </span>
              </div>
            )}

            {/* Per-night/per-day table */}
            {breakdown.length > 0 ? (
              <div style={s.tableWrap}>
                <table style={s.table}>
                  <thead>
                    <tr>
                      <th style={s.th}>Date</th>
                      <th style={s.th}>Rate type</th>
                      <th style={s.th}>Dogs</th>
                      <th style={{ ...s.th, textAlign: 'right' }}>Night total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {breakdown.map((period, i) => (
                      <tr key={i} style={{ background: i % 2 === 0 ? '#fafaf9' : '#fff' }}>
                        <td style={s.td}>{fmtDate(period.date)}</td>
                        <td style={s.td}>
                          {isOverride ? (
                            <span style={{ ...s.rateTag, color: '#92400e' }}>Manual Override</span>
                          ) : (
                            <span style={{ ...s.rateTag, color: RATE_COLOR[period.type] }}>
                              {RATE_LABEL[period.type] ?? period.type}
                            </span>
                          )}
                        </td>
                        <td style={s.td}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            {period.dogs.map((d, di) => {
                              const dog = dogs.find(x => x.id === d.dog_id)
                              return (
                                <span key={di} style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                                  {dog?.name ?? 'Dog'}{di === 0 ? ' (1st)' : ' (extra)'}
                                  {!isOverride && d.puppy_surcharge > 0 && <span style={s.puppySurcharge}> +puppy</span>}
                                  {!isOverride && <span style={s.rateAmt}> {fmtMoney(d.subtotal)}</span>}
                                </span>
                              )
                            })}
                          </div>
                        </td>
                        <td style={{ ...s.td, textAlign: 'right', fontWeight: 700 }}>
                          {fmtMoney(isOverride ? (overrideSplit[i] ?? 0) : period.subtotal)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p style={s.muted}>No breakdown available.</p>
            )}

            {/* Summary */}
            <div style={s.summary}>
              {res?.price_overridden ? (
                <>
                  <div style={s.summaryRow}>
                    <span style={s.summaryLabel}>Engine total ({breakdown.length} {res.service_type === 'boarding' ? 'night' : 'day'}{breakdown.length !== 1 ? 's' : ''})</span>
                    <span style={{ ...s.summaryValue, color: 'var(--text-secondary)', textDecoration: 'line-through' }}>{fmtMoney(engineTotal)}</span>
                  </div>
                  <div style={s.summaryRow}>
                    <span style={{ ...s.summaryLabel, fontWeight: 700 }}>Manual override total</span>
                    <span style={{ ...s.summaryValue, fontWeight: 800, color: 'var(--text-primary)' }}>{fmtMoney(storedTotal)}</span>
                  </div>
                </>
              ) : (
                <div style={s.summaryRow}>
                  <span style={{ ...s.summaryLabel, fontWeight: 700 }}>Total ({breakdown.length} {res?.service_type === 'boarding' ? 'night' : 'day'}{breakdown.length !== 1 ? 's' : ''})</span>
                  <span style={{ ...s.summaryValue, fontWeight: 800, color: 'var(--text-primary)' }}>{fmtMoney(storedTotal)}</span>
                </div>
              )}
              {/* Payment ledger */}
              <div style={{ ...s.summaryRow, marginTop: 4 }}>
                <span style={s.summaryLabel}>Paid</span>
                <span style={s.summaryValue}>{fmtMoney(paidSum)}</span>
              </div>
              <div style={s.summaryRow}>
                <span style={{ ...s.summaryLabel, fontWeight: 700 }}>Balance due</span>
                <span style={{ ...s.summaryValue, fontWeight: 800, color: balance > 0 ? '#b45309' : '#15803d' }}>{fmtMoney(balance)}</span>
              </div>
              <div style={s.summaryRow}>
                <span style={s.summaryLabel}>Status</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: payColor }}>{payLabel}</span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  overlay:        { position: 'fixed', inset: 0, background: 'rgba(46,42,38,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 },
  dialog:         { background: 'var(--surface)', borderRadius: 'var(--radius-card)', boxShadow: '0 8px 40px rgba(46,42,38,0.22)', width: '100%', maxWidth: 620, maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  header:         { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, padding: '20px 24px 16px', borderBottom: '1px solid var(--border)' },
  title:          { margin: '0 0 2px', fontSize: 17, fontWeight: 800, color: 'var(--text-primary)' },
  subtitle:       { margin: 0, fontSize: 13, color: 'var(--text-secondary)' },
  closeBtn:       { background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--text-secondary)', padding: '2px 6px', lineHeight: 1, flexShrink: 0 },
  overrideBanner: { margin: '16px 24px 0', background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#92400e', display: 'flex', gap: 8, alignItems: 'flex-start' },
  overrideIcon:   { fontSize: 16, flexShrink: 0 },
  tableWrap:      { overflowX: 'auto', overflowY: 'auto', flex: 1, padding: '16px 24px 0' },
  table:          { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th:             { padding: '8px 10px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '1px solid var(--border)', background: 'var(--surface)', whiteSpace: 'nowrap' },
  td:             { padding: '9px 10px', borderBottom: '1px solid var(--border)', verticalAlign: 'top' },
  rateTag:        { fontWeight: 700, fontSize: 12 },
  rateAmt:        { fontWeight: 600, color: 'var(--text-primary)' },
  puppySurcharge: { fontSize: 11, color: 'var(--status-boarding)', fontWeight: 600 },
  summary:        { borderTop: '2px solid var(--border)', margin: '0 24px', padding: '14px 0 0', display: 'flex', flexDirection: 'column', gap: 6 },
  summaryRow:     { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  summaryLabel:   { fontSize: 13, color: 'var(--text-secondary)' },
  summaryValue:   { fontSize: 14 },
  placeholder:    { padding: '10px 24px 18px', margin: '8px 0 0' },
  muted:          { margin: '20px 24px', fontSize: 13, color: 'var(--text-secondary)' },
}
