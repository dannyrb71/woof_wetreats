'use client'
import React from 'react'

/* ── DateNavigator ───────────────────────────────────────────────────────────
   Shared prev/next + date field + conditional "Today" pill. Identical on the
   Staff Dashboard and Daily Schedule. The Today pill renders ONLY when the
   selected date is the actual today.                                           */

interface Props {
  date:      string
  onChange:  (date: string) => void
  onPrev:    () => void
  onNext:    () => void
  todayStr:  string
}

export function DateNavigator({ date, onChange, onPrev, onNext, todayStr }: Props) {
  return (
    <div className="date-navigator">
      <div className="date-nav-row">
        <button type="button" onClick={onPrev} style={s.navBtn} aria-label="Previous day">‹</button>
        <input
          type="date"
          value={date}
          onChange={e => onChange(e.target.value)}
          style={s.dateInput}
        />
        <button type="button" onClick={onNext} style={s.navBtn} aria-label="Next day">›</button>
      </div>
      <p style={s.dateLong}>
        {formatDateLong(date)}
        {date === todayStr && <span style={s.todayPill}>Today</span>}
      </p>
    </div>
  )
}

function formatDateLong(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  })
}

const s: Record<string, React.CSSProperties> = {
  navBtn:    { fontSize: 22, lineHeight: 1, width: 38, height: 38, borderRadius: 999, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-primary)', cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' },
  dateInput: { fontSize: 14, padding: '8px 12px', borderRadius: 999, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-primary)', fontFamily: 'inherit', cursor: 'pointer' },
  dateLong:  { margin: '10px 0 0', fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 },
  todayPill: { fontSize: 12, fontWeight: 700, color: 'var(--primary-dark)', background: 'var(--primary-light)', borderRadius: 999, padding: '3px 10px', flexShrink: 0 },
}
