'use client'
import React from 'react'
import type { RateTable } from '@/lib/pricing-engine'

/* ── RateChartModal ─────────────────────────────────────────────────────────
   Private, client-facing rate card. Reads the same `pricing_rates` the engine
   uses (passed in from the booking form) so it can never drift from what a
   client is actually charged. Venmo = cash + venmo_surcharge, per dog/night. */

function money(n: number) { return `$${Number(n).toFixed(2)}` }

export function RateChartModal({ rates, onClose }: { rates: RateTable; onClose: () => void }) {
  const v = rates.venmo_surcharge
  const row = (label: string, sub: string, cash: number) => ({ label, sub, cash, venmo: cash + v })

  const boarding = [
    row('Regular', '1–7 nights · first dog',       rates.regular_1st_cash),
    row('Regular', '1–7 nights · each extra dog',  rates.regular_extra_cash),
    row('Extended stay', '8+ nights · first dog',      rates.extended_1st_cash),
    row('Extended stay', '8+ nights · each extra dog', rates.extended_extra_cash),
    row('Holiday', 'Holiday nights · first dog',      rates.holiday_1st_cash),
    row('Holiday', 'Holiday nights · each extra dog', rates.holiday_extra_cash),
  ]
  const daycare = [row('Daycare', 'Per dog, per day', rates.daycare_1st_cash)]

  return (
    <div style={s.overlay} onClick={onClose} role="presentation">
      <div style={s.dialog} onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Our rates">
        <div style={s.head}>
          <h3 style={s.title}>Our rates</h3>
          <button type="button" onClick={onClose} style={s.close} aria-label="Close">✕</button>
        </div>

        <div style={s.body}>
          <div style={s.colHead}>
            <span />
            <span style={s.colLabel}>Cash</span>
            <span style={s.colLabel}>Venmo</span>
          </div>

          <p style={s.group}>Boarding <span style={s.groupUnit}>· per night</span></p>
          {boarding.map((r, i) => (
            <div key={`b${i}`} style={s.row}>
              <div style={s.rowLabel}>
                <span style={s.rowName}>{r.label}</span>
                <span style={s.rowSub}>{r.sub}</span>
              </div>
              <span style={s.price}>{money(r.cash)}</span>
              <span style={s.price}>{money(r.venmo)}</span>
            </div>
          ))}

          <p style={s.group}>Daycare <span style={s.groupUnit}>· per day</span></p>
          {daycare.map((r, i) => (
            <div key={`d${i}`} style={s.row}>
              <div style={s.rowLabel}>
                <span style={s.rowName}>{r.label}</span>
                <span style={s.rowSub}>{r.sub}</span>
              </div>
              <span style={s.price}>{money(r.cash)}</span>
              <span style={s.price}>{money(r.venmo)}</span>
            </div>
          ))}

          <div style={s.notes}>
            <p style={s.note}>🐶 <b>Puppy surcharge</b> — {money(rates.puppy_surcharge)} per night for dogs under 1 year.</p>
            <p style={s.note}>💙 <b>Venmo</b> adds {money(v)} per dog, per night (or per day for daycare).</p>
            <p style={s.note}>🎄 <b>Holiday</b> rates apply automatically on major holidays and their surrounding nights.</p>
            <p style={s.note}>🌙 Stays over 14 nights use a custom flat rate — we&apos;ll confirm it with you.</p>
          </div>
        </div>
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  overlay:  { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 1000 },
  dialog:   { background: 'var(--surface)', borderRadius: 'var(--radius-card)', width: '100%', maxWidth: 440, maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 12px 40px rgba(0,0,0,0.25)' },
  head:     { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border)' },
  title:    { margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--text-primary)' },
  close:    { border: 'none', background: 'transparent', fontSize: 16, color: 'var(--text-secondary)', cursor: 'pointer', padding: 4, lineHeight: 1 },
  body:     { padding: '8px 20px 20px', overflowY: 'auto' },
  colHead:  { display: 'grid', gridTemplateColumns: '1fr 68px 68px', alignItems: 'end', gap: 8, padding: '8px 0 4px' },
  colLabel: { fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textAlign: 'right', textTransform: 'uppercase', letterSpacing: '0.04em' },
  group:    { margin: '14px 0 2px', fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' },
  groupUnit:{ fontWeight: 500, color: 'var(--text-secondary)' },
  row:      { display: 'grid', gridTemplateColumns: '1fr 68px 68px', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--border)' },
  rowLabel: { display: 'flex', flexDirection: 'column', minWidth: 0 },
  rowName:  { fontSize: 13.5, fontWeight: 600, color: 'var(--text-primary)' },
  rowSub:   { fontSize: 11.5, color: 'var(--text-secondary)' },
  price:    { fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', textAlign: 'right' },
  notes:    { marginTop: 16, display: 'flex', flexDirection: 'column', gap: 7 },
  note:     { margin: 0, fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.5 },
}
