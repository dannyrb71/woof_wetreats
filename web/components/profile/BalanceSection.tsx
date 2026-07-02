'use client'
import React from 'react'
import { VENMO_USERNAME } from '@/lib/payment'
import { ServicePill } from '@/components/shared/molecules/ServicePill'

interface Reservation {
  id:             string
  service_type:   'boarding' | 'daycare'
  status:         string
  dropoff_date:   string
  pickup_date:    string
  payment_method: string
  total_price:    number
  paid:           boolean
  dogs:           string[]
}

function fmtDate(ymd: string): string {
  return new Date(ymd + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

function resDatesLabel(r: Reservation): string {
  return r.service_type === 'boarding'
    ? `${fmtDate(r.dropoff_date)} – ${fmtDate(r.pickup_date)}`
    : fmtDate(r.dropoff_date)
}

function MethodLabel({ r }: { r: Reservation }) {
  return r.payment_method === 'venmo'
    ? <>💙 Venmo · <strong style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{VENMO_USERNAME}</strong></>
    : <>💵 Cash</>
}

function sum(list: Reservation[]) { return list.reduce((t, r) => t + Number(r.total_price), 0) }

interface Props { reservations: Reservation[] }

export function BalanceSection({ reservations }: Props) {
  const billable = reservations.filter(r => r.status !== 'cancelled')
  const unpaid   = billable.filter(r => !r.paid).sort((a, b) => a.dropoff_date.localeCompare(b.dropoff_date))
  const lastPaid = billable.filter(r => r.paid).sort((a, b) => b.dropoff_date.localeCompare(a.dropoff_date))[0] ?? null
  const totalDue = sum(unpaid)

  if (!lastPaid && unpaid.length === 0) return null

  return (
    <div style={s.card}>
      <h3 style={s.title}>Balance</h3>

      {/* Balance due — top */}
      {unpaid.length > 0 && (
        <>
          <div style={s.totalRow}>
            <span style={s.dueLabel}>Balance due</span>
            <span style={s.totalAmt}>${totalDue.toFixed(2)}</span>
          </div>
          <div>
            {unpaid.map((r, i) => (
              <div key={r.id} style={{ ...s.dueItem, borderTop: i === 0 ? 'none' : '1px solid var(--border)' }}>
                <div style={s.dueItemTop}>
                  <ServicePill type={r.service_type} />
                  <span style={s.dueItemAmt}>${Number(r.total_price).toFixed(2)}</span>
                </div>
                <p style={s.dueItemMeta}>{resDatesLabel(r)} · <MethodLabel r={r} /></p>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Last paid — bottom */}
      {lastPaid && (
        <>
          {unpaid.length > 0 && <div style={s.divider} />}
          <p style={s.subLabel}>Last paid</p>
          <div style={s.lastPaidRow}>
            <div style={s.lastPaidLeft}>
              <ServicePill type={lastPaid.service_type} />
              <span style={s.lastPaidDate}>{resDatesLabel(lastPaid)}</span>
            </div>
            <span style={s.paidAmt}>${Number(lastPaid.total_price).toFixed(2)}</span>
          </div>
        </>
      )}
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  card:        { background: 'var(--surface)', borderRadius: 'var(--radius-card)', border: '1px solid var(--border)', padding: '20px 22px', boxShadow: '0 0 3.5px rgba(0,0,0,0.10)' },
  title:       { margin: '0 0 14px', fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.06em' },
  totalRow:    { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginBottom: 4 },
  dueLabel:    { fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' },
  totalAmt:    { fontSize: 20, fontWeight: 800, color: 'var(--warning)' },
  dueItem:     { padding: '12px 0' },
  dueItemTop:  { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  dueItemAmt:  { fontSize: 15, fontWeight: 800, color: 'var(--text-primary)' },
  dueItemMeta: { margin: '7px 0 0', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 },
  divider:     { height: 1, background: 'var(--border)', margin: '16px 0' },
  subLabel:    { margin: '0 0 8px', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' },
  lastPaidRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  lastPaidLeft:{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  lastPaidDate:{ fontSize: 12, color: 'var(--text-secondary)' },
  paidAmt:     { fontSize: 16, fontWeight: 800, color: 'var(--success)', flexShrink: 0 },
}
