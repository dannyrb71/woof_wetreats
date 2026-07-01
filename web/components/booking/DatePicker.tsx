'use client'
import React, { useEffect, useState } from 'react'

// ── Helpers ────────────────────────────────────────────────────
function toYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function today(): string { return toYMD(new Date()) }

function daysInMonth(year: number, month: number): string[] {
  const days: string[] = []
  const d = new Date(year, month, 1)
  while (d.getMonth() === month) { days.push(toYMD(d)); d.setDate(d.getDate() + 1) }
  return days
}
function firstDow(year: number, month: number): number {
  return new Date(year, month, 1).getDay()
}

const MONTH_NAMES = ['January','February','March','April','May','June',
                     'July','August','September','October','November','December']
const DOW_LABELS  = ['Su','Mo','Tu','We','Th','Fr','Sa']

// ── Types ──────────────────────────────────────────────────────
interface Props {
  label:         string
  value:         string | null
  onChange:      (date: string) => void
  blockedDates:  Set<string>
  holidayDates?: Set<string>
  rangeStart?:   string | null
  rangeEnd?:     string | null
  minDate?:      string
  allowPast?:    boolean
  /** Controls booking fill color for selected/range cells */
  serviceType?:  'boarding' | 'daycare'
}

// ── Component ──────────────────────────────────────────────────
export default function DatePicker({
  label, value, onChange, blockedDates, holidayDates,
  rangeStart, rangeEnd, minDate, allowPast, serviceType,
}: Props) {
  const todayStr = today()
  const minStr   = minDate ?? (allowPast ? '0000-01-01' : todayStr)

  const seed = value ? new Date(value + 'T00:00:00') : new Date()
  const [viewYear,  setYear]  = useState(seed.getFullYear())
  const [viewMonth, setMonth] = useState(seed.getMonth())

  useEffect(() => {
    if (value || !minDate) return
    const min = new Date(minDate + 'T00:00:00')
    const lastDayOfMonth = new Date(min.getFullYear(), min.getMonth() + 1, 0).getDate()
    const target = min.getDate() === lastDayOfMonth
      ? new Date(min.getFullYear(), min.getMonth() + 1, 1) : min
    setYear(target.getFullYear()); setMonth(target.getMonth())
  }, [minDate, value])

  function prevMonth() {
    if (viewMonth === 0) { setYear(y => y - 1); setMonth(11) } else setMonth(m => m - 1)
  }
  function nextMonth() {
    if (viewMonth === 11) { setYear(y => y + 1); setMonth(0) } else setMonth(m => m + 1)
  }

  const days   = daysInMonth(viewYear, viewMonth)
  const offset = firstDow(viewYear, viewMonth)

  // Service color tokens
  const svcFill  = serviceType === 'daycare' ? 'var(--status-daycare)' : 'var(--status-boarding)'
  const svcRgba  = serviceType === 'daycare' ? 'rgba(184,146,74,0.82)' : 'rgba(95,135,168,0.82)'

  function handleClick(date: string) {
    const isPast    = date < minStr
    const isBlocked = blockedDates.has(date)
    if (!isPast && !isBlocked) onChange(date)
  }

  return (
    <div style={s.wrap}>
      <span style={s.label}>{label}</span>
      <div style={s.cal}>
        {/* Month navigation */}
        <div style={s.nav}>
          <button type="button" onClick={prevMonth} style={s.navBtn}>‹</button>
          <span style={s.monthLabel}>{MONTH_NAMES[viewMonth]} {viewYear}</span>
          <button type="button" onClick={nextMonth} style={s.navBtn}>›</button>
        </div>

        {/* Day-of-week headers */}
        <div style={s.grid}>
          {DOW_LABELS.map(d => <div key={d} style={s.dowCell}>{d}</div>)}

          {Array.from({ length: offset }).map((_, i) => <div key={`e${i}`} />)}

          {days.map(date => {
            const dayNum    = parseInt(date.slice(8), 10)
            const isPast    = date < minStr
            const isBlocked = blockedDates.has(date)
            const isSelected = date === value
            const isToday   = date === todayStr
            const isHoliday = holidayDates?.has(date) ?? false

            const lo = rangeStart ?? rangeEnd
            const hi = rangeEnd   ?? rangeStart
            const isInRange = !!(lo && hi && date > lo && date < hi)

            const clickable = !isPast && !isBlocked

            // Build background: selected > in-range > default
            let bg = 'transparent'
            let color = isPast || isBlocked ? 'var(--text-muted)' : 'var(--text-primary)'
            let fontWeight: number = isToday ? 700 : 400
            let textDecoration = 'none'

            if (isSelected) {
              bg = svcFill; color = '#fff'; fontWeight = 700
            } else if (isInRange) {
              bg = svcRgba; color = '#fff'; fontWeight = 600
            }

            if (isBlocked) { bg = 'var(--background)'; textDecoration = 'line-through' }

            // Holiday gets a primary-color outline on top of whatever background
            const outline       = isHoliday ? '2px solid var(--primary)' : 'none'
            const outlineOffset = '-2px'

            return (
              <div key={date}
                style={{
                  ...s.dayCell,
                  background: bg, color, fontWeight,
                  outline, outlineOffset,
                  opacity: (isPast || isBlocked) ? 0.45 : 1,
                  cursor: clickable ? 'pointer' : 'not-allowed',
                  textDecoration,
                  boxSizing: 'border-box',
                  paddingBottom: isToday ? 2 : 6,
                }}
                onClick={() => handleClick(date)}
                title={
                  isBlocked ? 'Unavailable'
                  : isHoliday ? 'Holiday rate applies'
                  : undefined
                }
              >
                {dayNum}
                {/* Today indicator: small dot below the number */}
                {isToday && (
                  <span style={{
                    display: 'block', width: 4, height: 4, borderRadius: '50%',
                    background: isSelected || isInRange ? '#fff' : 'var(--primary)',
                    margin: '1px auto 0',
                  }} />
                )}
              </div>
            )
          })}
        </div>

        {/* Legend */}
        <div style={s.legend}>
          <span style={s.legendItem}>
            <span style={{ ...s.legendDot, background: 'transparent', position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: 'transparent', border: '1px solid var(--text-muted)', display: 'block' }} />
              <span style={{ position: 'absolute', width: 4, height: 4, borderRadius: '50%', background: 'var(--primary)', bottom: -1, left: '50%', transform: 'translateX(-50%)' }} />
            </span>
            Today
          </span>
          {holidayDates && holidayDates.size > 0 && (
            <span style={s.legendItem}>
              <span style={{ ...s.legendDot, background: 'transparent', border: '2px solid var(--primary)', boxSizing: 'border-box' }} />
              Holiday rate
            </span>
          )}
          <span style={s.legendItem}>
            <span style={{ ...s.legendDot, background: svcFill }} />
            {serviceType === 'daycare' ? '🌞 Daycare' : '🏠 Boarding'}
          </span>
          <span style={s.legendItem}>
            <span style={{ ...s.legendDot, background: 'var(--background)', border: '1px solid var(--text-muted)', boxSizing: 'border-box' }} />
            Unavailable
          </span>
        </div>
      </div>
    </div>
  )
}

// ── Styles ─────────────────────────────────────────────────────
const s: Record<string, React.CSSProperties> = {
  wrap:       { display: 'flex', flexDirection: 'column', gap: 6 },
  label:      { fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' },
  cal:        { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 14, width: 280 },
  nav:        { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  navBtn:     { background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', padding: '0 8px', color: 'var(--text-secondary)', lineHeight: 1 },
  monthLabel: { fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' },
  grid:       { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 },
  dowCell:    { textAlign: 'center', fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', padding: '4px 0', textTransform: 'uppercase', letterSpacing: '0.04em' },
  dayCell:    { textAlign: 'center', fontSize: 13, padding: '6px 0 6px', borderRadius: 6, userSelect: 'none', transition: 'background 0.1s', lineHeight: 1 },
  legend:     { display: 'flex', gap: 10, marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--border)', flexWrap: 'wrap' },
  legendItem: { display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-secondary)' },
  legendDot:  { width: 10, height: 10, borderRadius: 3, display: 'inline-block', flexShrink: 0 },
}
