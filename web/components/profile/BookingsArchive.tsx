'use client'
import React, { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { ServicePill } from '@/components/shared/molecules/ServicePill'
import { StatusBadge, type StatusType } from '@/components/shared/molecules/StatusBadge'
import { Money } from '@/components/shared/molecules/Money'
import { FeeBreakdownModal } from '@/components/staff/FeeBreakdownModal'

// Minimal shape both the client dashboard and staff household detail already have.
export interface ArchiveBooking {
  id:             string
  service_type:   'boarding' | 'daycare'
  status:         string
  dropoff_date:   string
  pickup_date:    string
  total_price:    number
  payment_method: string
}

const PAY_LABEL: Record<string, string> = { cash: '💵 Cash', venmo: '💙 Venmo' }

const STATUS_KEY: Record<string, StatusType> = {
  upcoming: 'upcoming', in_progress: 'in-progress', completed: 'completed', cancelled: 'cancelled',
}
function fmtDate(ymd: string) {
  return new Date(ymd + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
function money(n: number) { return `$${Number(n).toFixed(2)}` }

// A compact, year-tabbed archive table for past/cancelled bookings.
// Rows: service pill · dates (no times) · cost with balance-due beneath · ⓘ breakdown.
export function BookingsArchive({ bookings, onSelect }: { bookings: ArchiveBooking[]; onSelect?: (id: string) => void }) {
  const supabase = createClient()
  const [paidMap,     setPaidMap]     = useState<Record<string, number>>({})
  const [breakdownId, setBreakdownId] = useState<string | null>(null)
  const [hoveredId,   setHoveredId]   = useState<string | null>(null)

  const years = useMemo(() => {
    const set = new Set(bookings.map(b => b.dropoff_date.slice(0, 4)))
    return [...set].sort((a, b) => b.localeCompare(a)) // newest first
  }, [bookings])
  const [year, setYear] = useState<string>(years[0] ?? '')
  useEffect(() => { if (!years.includes(year)) setYear(years[0] ?? '') }, [years, year])

  // Amount paid per booking (payment ledger) → balance due.
  useEffect(() => {
    const ids = bookings.map(b => b.id)
    if (ids.length === 0) return
    let cancelled = false
    ;(async () => {
      const { data } = await supabase.from('reservation_payments').select('reservation_id, amount').in('reservation_id', ids)
      if (cancelled) return
      const m: Record<string, number> = {}
      for (const p of data ?? []) m[p.reservation_id] = (m[p.reservation_id] ?? 0) + Number(p.amount)
      setPaidMap(m)
    })()
    return () => { cancelled = true }
  }, [bookings]) // eslint-disable-line react-hooks/exhaustive-deps

  const rows = useMemo(
    () => bookings.filter(b => b.dropoff_date.slice(0, 4) === year)
                  .sort((a, b) => b.dropoff_date.localeCompare(a.dropoff_date)),
    [bookings, year],
  )

  if (bookings.length === 0) return <p style={s.empty}>No past bookings yet.</p>

  return (
    <div>
      {/* Year pills — same pill UI as the staff Clients sorter */}
      <div style={s.pillRow}>
        {years.map(y => (
          <button key={y} type="button" onClick={() => setYear(y)}
            aria-pressed={year === y}
            style={{ ...s.pill, ...(year === y ? s.pillActive : {}) }}>{y}</button>
        ))}
      </div>

      {/* Compact table */}
      <div>
        {rows.map(b => {
          const total     = Number(b.total_price)
          const balance   = Math.max(0, total - (paidMap[b.id] ?? 0))
          const boarding  = b.service_type === 'boarding'
          const cancelled = b.status === 'cancelled'
          const dates     = boarding ? `${fmtDate(b.dropoff_date)} – ${fmtDate(b.pickup_date)}` : fmtDate(b.dropoff_date)
          return (
            <div key={b.id}
              style={{ ...s.row, ...(onSelect ? { cursor: 'pointer' } : {}), ...(hoveredId === b.id ? { background: 'var(--surface-muted)' } : {}) }}
              onClick={onSelect ? () => onSelect(b.id) : undefined}
              onMouseEnter={onSelect ? () => setHoveredId(b.id) : undefined}
              onMouseLeave={onSelect ? () => setHoveredId(null) : undefined}
              role={onSelect ? 'button' : undefined}
              tabIndex={onSelect ? 0 : undefined}
              onKeyDown={onSelect ? (e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(b.id) } }) : undefined}
            >
              <div style={s.left}>
                <ServicePill type={b.service_type} />
                {(b.status === 'cancelled' || b.status === 'completed') && <StatusBadge status={STATUS_KEY[b.status]} />}
              </div>
              <span style={s.dates}>{dates}</span>
              <span style={s.pay}>{PAY_LABEL[b.payment_method] ?? b.payment_method}</span>
              <div style={s.amounts}>
                <Money value={total} cancelled={cancelled} style={s.cost} />
                {!cancelled && (
                  <span style={{ ...s.balance, color: balance > 0 ? '#b45309' : '#15803d' }}>
                    {balance > 0 ? `${money(balance)} due` : 'Paid'}
                  </span>
                )}
              </div>
              <button type="button" onClick={e => { e.stopPropagation(); setBreakdownId(b.id) }} className="btn btn-icon"
                title="View fee breakdown" aria-label="View fee breakdown"
                style={{ fontSize: 15, color: 'var(--text-secondary)', flexShrink: 0 }}>ⓘ</button>
            </div>
          )
        })}
        {rows.length === 0 && <p style={s.empty}>No bookings in {year}.</p>}
      </div>

      {breakdownId && <FeeBreakdownModal reservationId={breakdownId} onClose={() => setBreakdownId(null)} />}
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  pillRow:    { display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  pill:       { padding: '6px 16px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-primary)', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '0.02em', transition: 'background 0.12s, border-color 0.12s, color 0.12s' },
  pillActive: { background: 'var(--primary)', borderColor: 'var(--primary)', color: '#fff' },
  row:        { display: 'flex', alignItems: 'center', gap: 12, padding: '12px 4px', borderBottom: '1px solid var(--border)' },
  left:       { display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 },
  dates:      { flex: 1, fontSize: 13, color: 'var(--text-primary)', fontWeight: 600, minWidth: 0 },
  pay:        { fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, flexShrink: 0, whiteSpace: 'nowrap' },
  amounts:    { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1, flexShrink: 0 },
  cost:       { fontSize: 14, fontWeight: 800, color: 'var(--text-primary)' },
  balance:    { fontSize: 12, fontWeight: 700 },
  empty:      { fontSize: 13, color: 'var(--text-secondary)', margin: '8px 0' },
}
