'use client'
import React from 'react'
import { VENMO_USERNAME } from '@/lib/payment'

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

function svcLabel(t: string) { return t === 'boarding' ? '🏠 Boarding' : '🌞 Daycare' }

function resDatesLabel(r: Reservation): string {
  return r.service_type === 'boarding'
    ? `${fmtDate(r.dropoff_date)} – ${fmtDate(r.pickup_date)}`
    : fmtDate(r.dropoff_date)
}

function sum(list: Reservation[]) { return list.reduce((t, r) => t + Number(r.total_price), 0) }

interface Props { reservations: Reservation[] }

export function BalanceSection({ reservations }: Props) {
  const billable = reservations.filter(r => r.status !== 'cancelled')
  const unpaid   = billable.filter(r => !r.paid)
  const lastPaid = billable.filter(r => r.paid)
    .sort((a, b) => b.dropoff_date.localeCompare(a.dropoff_date))[0] ?? null
  const dueCash  = unpaid.filter(r => r.payment_method === 'cash')
  const dueVenmo = unpaid.filter(r => r.payment_method === 'venmo')

  if (!lastPaid && unpaid.length === 0) return null

  return (
    <div style={s.card}>
      <h3 style={s.title}>Balance</h3>
      {lastPaid && (
        <div style={s.lastPaidRow}>
          <div>
            <p style={s.subLabel}>Last paid</p>
            <p style={s.detail}>{svcLabel(lastPaid.service_type)} · {resDatesLabel(lastPaid)}</p>
          </div>
          <span style={s.paidAmt}>${Number(lastPaid.total_price).toFixed(2)}</span>
        </div>
      )}
      {unpaid.length > 0 && (
        <>
          {lastPaid && <div style={s.divider} />}
          <p style={s.dueLabel}>Balance due</p>
          {[
            { label: '💵 Cash',  list: dueCash },
            { label: '💙 Venmo', list: dueVenmo, venmo: true },
          ].map(({ label, list, venmo }) => list.length === 0 ? null : (
            <div key={label} style={s.dueGroup}>
              <div style={s.dueGroupHead}>
                <span style={s.methodLabel}>
                  {label}{venmo && <> · <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{VENMO_USERNAME}</span></>}
                </span>
                <span style={s.dueAmt}>${sum(list).toFixed(2)}</span>
              </div>
              {list.map(r => (
                <div key={r.id} style={s.dueLine}>
                  <span style={s.dueLineLeft}>{svcLabel(r.service_type)} · {resDatesLabel(r)}</span>
                  <span style={s.dueLineAmt}>${Number(r.total_price).toFixed(2)}</span>
                </div>
              ))}
            </div>
          ))}
        </>
      )}
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  card:        { background: 'var(--surface)', borderRadius: 'var(--radius-card)', border: '1px solid var(--border)', padding: '20px 22px', boxShadow: '0 0 3.5px rgba(0,0,0,0.10)' },
  title:       { margin: '0 0 14px', fontSize: 14, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' },
  lastPaidRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  subLabel:    { margin: 0, fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' },
  detail:      { margin: '3px 0 0', fontSize: 13, color: 'var(--text-secondary)' },
  paidAmt:     { fontSize: 17, fontWeight: 800, color: 'var(--success)', flexShrink: 0 },
  divider:     { height: 1, background: 'var(--border)', margin: '12px 0' },
  dueLabel:    { margin: '0 0 8px', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' },
  dueGroup:    { marginTop: 4 },
  dueGroupHead:{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 8 },
  methodLabel: { fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600 },
  dueAmt:      { fontSize: 17, fontWeight: 800, color: 'var(--warning)' },
  dueLine:     { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 4, paddingLeft: 4 },
  dueLineLeft: { fontSize: 13, color: 'var(--text-secondary)' },
  dueLineAmt:  { fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' },
}
