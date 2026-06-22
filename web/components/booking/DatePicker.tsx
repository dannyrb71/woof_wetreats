'use client'
import React, { useState } from 'react'

// ── Helpers ────────────────────────────────────────────────────
function toYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function today(): string {
  return toYMD(new Date())
}

// Returns array of 'YYYY-MM-DD' strings for every day in the given month.
function daysInMonth(year: number, month: number): string[] {
  const days: string[] = []
  const d = new Date(year, month, 1)
  while (d.getMonth() === month) { days.push(toYMD(d)); d.setDate(d.getDate() + 1) }
  return days
}

// 0=Sun … 6=Sat offset of the first day of the month
function firstDow(year: number, month: number): number {
  return new Date(year, month, 1).getDay()
}

const MONTH_NAMES = ['January','February','March','April','May','June',
                     'July','August','September','October','November','December']
const DOW_LABELS  = ['Su','Mo','Tu','We','Th','Fr','Sa']

// ── Types ──────────────────────────────────────────────────────
interface Props {
  label:        string
  value:        string | null      // selected date 'YYYY-MM-DD'
  onChange:     (date: string) => void
  blockedDates: Set<string>
  // Range highlight (boarding only) — the OTHER selected date
  rangeStart?:  string | null
  rangeEnd?:    string | null
  // Minimum selectable date (defaults to today)
  minDate?:     string
}

// ── Component ──────────────────────────────────────────────────
export default function DatePicker({ label, value, onChange, blockedDates, rangeStart, rangeEnd, minDate }: Props) {
  const todayStr  = today()
  const minStr    = minDate ?? todayStr

  // Start calendar view on the month containing the selected date,
  // or the current month if nothing is selected.
  const seed  = value ? new Date(value + 'T00:00:00') : new Date()
  const [viewYear,  setYear]  = useState(seed.getFullYear())
  const [viewMonth, setMonth] = useState(seed.getMonth())

  function prevMonth() {
    if (viewMonth === 0) { setYear(y => y - 1); setMonth(11) }
    else setMonth(m => m - 1)
  }
  function nextMonth() {
    if (viewMonth === 11) { setYear(y => y + 1); setMonth(0) }
    else setMonth(m => m + 1)
  }

  const days   = daysInMonth(viewYear, viewMonth)
  const offset = firstDow(viewYear, viewMonth)

  function cellState(date: string): 'past' | 'blocked' | 'selected' | 'range' | 'available' {
    if (date < minStr)         return 'past'
    if (blockedDates.has(date)) return 'blocked'
    if (date === value)         return 'selected'
    // Range highlight: between rangeStart and rangeEnd
    const lo = rangeStart ?? rangeEnd
    const hi = rangeEnd   ?? rangeStart
    if (lo && hi && date > lo && date < hi) return 'range'
    return 'available'
  }

  function handleClick(date: string) {
    const state = cellState(date)
    if (state === 'past' || state === 'blocked') return
    onChange(date)
  }

  return (
    <div style={s.wrap}>
      <span style={s.label}>{label}</span>

      {/* Month navigation */}
      <div style={s.cal}>
        <div style={s.nav}>
          <button type="button" onClick={prevMonth} style={s.navBtn}>‹</button>
          <span style={s.monthLabel}>{MONTH_NAMES[viewMonth]} {viewYear}</span>
          <button type="button" onClick={nextMonth} style={s.navBtn}>›</button>
        </div>

        {/* Day-of-week headers */}
        <div style={s.grid}>
          {DOW_LABELS.map(d => (
            <div key={d} style={s.dowCell}>{d}</div>
          ))}

          {/* Empty leading cells */}
          {Array.from({ length: offset }).map((_, i) => (
            <div key={`e${i}`} />
          ))}

          {/* Day cells */}
          {days.map(date => {
            const state   = cellState(date)
            const dayNum  = parseInt(date.slice(8), 10)
            const clickable = state !== 'past' && state !== 'blocked'

            const cellStyle: React.CSSProperties = {
              ...s.dayCell,
              ...(state === 'past'     ? s.past     : {}),
              ...(state === 'blocked'  ? s.blocked  : {}),
              ...(state === 'selected' ? s.selected : {}),
              ...(state === 'range'    ? s.inRange  : {}),
              cursor: clickable ? 'pointer' : 'not-allowed',
            }

            return (
              <div
                key={date}
                style={cellStyle}
                onClick={() => handleClick(date)}
                title={state === 'blocked' ? 'Unavailable' : undefined}
              >
                {state === 'blocked'
                  ? <span style={s.blockedNum}>{dayNum}</span>
                  : dayNum}
              </div>
            )
          })}
        </div>

        {/* Legend */}
        <div style={s.legend}>
          <span style={s.legendItem}><span style={{ ...s.legendDot, background: '#d1d5db' }} />Unavailable</span>
          <span style={s.legendItem}><span style={{ ...s.legendDot, background: '#2563eb' }} />Selected</span>
          <span style={s.legendItem}><span style={{ ...s.legendDot, background: '#dbeafe' }} />Stay range</span>
        </div>
      </div>
    </div>
  )
}

// ── Styles ─────────────────────────────────────────────────────
const s: Record<string, React.CSSProperties> = {
  wrap:       { display: 'flex', flexDirection: 'column', gap: 6 },
  label:      { fontSize: 13, fontWeight: 600, color: '#374151' },
  cal:        { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 14, width: 280 },
  nav:        { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  navBtn:     { background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', padding: '0 8px', color: '#374151', lineHeight: 1 },
  monthLabel: { fontWeight: 600, fontSize: 14, color: '#111827' },
  grid:       { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 },
  dowCell:    { textAlign: 'center', fontSize: 11, fontWeight: 600, color: '#9ca3af', padding: '4px 0' },
  dayCell:    { textAlign: 'center', fontSize: 13, padding: '6px 0', borderRadius: 6, userSelect: 'none', transition: 'background 0.1s' },
  past:       { color: '#d1d5db' },
  blocked:    { background: '#f3f4f6', color: '#9ca3af', position: 'relative' },
  blockedNum: { textDecoration: 'line-through', opacity: 0.6 },
  selected:   { background: '#2563eb', color: '#fff', fontWeight: 700 },
  inRange:    { background: '#dbeafe', color: '#1e40af' },
  legend:     { display: 'flex', gap: 12, marginTop: 10, paddingTop: 8, borderTop: '1px solid #f3f4f6' },
  legendItem: { display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#6b7280' },
  legendDot:  { width: 10, height: 10, borderRadius: 3, display: 'inline-block', flexShrink: 0 },
}
