'use client'
import React, { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

interface BlockedDate { id: string; date: string; reason: string | null }
interface BlockedGroup { dates: BlockedDate[]; start: string; end: string; reason: string | null; count: number }

function toYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function daysInMonth(year: number, month: number): string[] {
  const days: string[] = []
  const d = new Date(year, month, 1)
  while (d.getMonth() === month) { days.push(toYMD(d)); d.setDate(d.getDate() + 1) }
  return days
}
function firstDow(year: number, month: number): number {
  return new Date(year, month, 1).getDay()
}
function fmtLong(ymd: string): string {
  return new Date(ymd + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DOW_LABELS  = ['Su','Mo','Tu','We','Th','Fr','Sa']

// Availability-calendar-only day shading by how many bookings occupy that day
// (Rover included). Purely informational so staff don't block committed dates.
//   1–3 bookings → thick diagonal light-gray stripes
//   4–8 bookings → diagonal light-orange stripes (approaching capacity)
//   9+  bookings → solid light-orange (full)
const STRIPE_GRAY   = 'repeating-linear-gradient(45deg, #d1d5db 0, #d1d5db 6px, #ffffff 6px, #ffffff 12px)'
const STRIPE_ORANGE = 'repeating-linear-gradient(45deg, #fed7aa 0, #fed7aa 6px, #ffffff 6px, #ffffff 12px)'
const SOLID_ORANGE  = '#fed7aa'
function bookingBg(count: number): React.CSSProperties {
  if (count >= 9) return { background: SOLID_ORANGE }
  if (count >= 4) return { background: STRIPE_ORANGE }
  if (count >= 1) return { background: STRIPE_GRAY }
  return {}
}

function groupConsecutive(list: BlockedDate[]): BlockedGroup[] {
  if (list.length === 0) return []
  const groups: BlockedGroup[] = []
  let cur: BlockedDate[] = [list[0]]
  for (let i = 1; i < list.length; i++) {
    const prev = cur[cur.length - 1]
    const d = new Date(prev.date + 'T00:00:00')
    d.setDate(d.getDate() + 1)
    if (list[i].date === toYMD(d) && list[i].reason === prev.reason) {
      cur.push(list[i])
    } else {
      groups.push({ dates: cur, start: cur[0].date, end: cur[cur.length - 1].date, reason: cur[0].reason, count: cur.length })
      cur = [list[i]]
    }
  }
  groups.push({ dates: cur, start: cur[0].date, end: cur[cur.length - 1].date, reason: cur[0].reason, count: cur.length })
  return groups
}

function fmtRange(g: BlockedGroup): string {
  if (g.count === 1) return fmtLong(g.start)
  const s = new Date(g.start + 'T00:00:00')
  const e = new Date(g.end   + 'T00:00:00')
  if (s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth()) {
    return `${s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}–${e.getDate()}, ${e.getFullYear()} · ${g.count} days`
  }
  if (s.getFullYear() === e.getFullYear()) {
    return `${s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${e.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${e.getFullYear()} · ${g.count} days`
  }
  return `${fmtLong(g.start)} – ${fmtLong(g.end)} · ${g.count} days`
}

export function BlockedDatesCalendar({ stacked }: { stacked?: boolean }) {
  const supabase = createClient()
  const todayStr = toYMD(new Date())
  const seed = new Date()

  const [blocked,   setBlocked]   = useState<Map<string, BlockedDate>>(new Map())
  const [counts,    setCounts]    = useState<Map<string, number>>(new Map())
  const [viewYear,  setYear]      = useState(seed.getFullYear())
  const [viewMonth, setMonth]     = useState(seed.getMonth())
  const [loading,   setLoading]   = useState(true)
  const [busy,      setBusy]      = useState<string | null>(null)
  const [err,       setErr]       = useState('')

  async function load() {
    const [bdR, resR] = await Promise.all([
      supabase.from('blocked_dates').select('id, date, reason').order('date'),
      // Non-cancelled bookings (Rover included) → per-day occupancy shading.
      supabase.from('reservations').select('service_type, dropoff_date, pickup_date').neq('status', 'cancelled'),
    ])
    if (bdR.error) { setErr('Could not load blocked dates.'); setLoading(false); return }
    const map = new Map<string, BlockedDate>()
    for (const r of bdR.data ?? []) map.set(r.date, r as BlockedDate)
    setBlocked(map)

    // Count how many bookings occupy each date (boarding spans dropoff→pickup
    // inclusive; daycare is a single day).
    const cmap = new Map<string, number>()
    for (const r of resR.data ?? []) {
      const start = r.dropoff_date as string
      const end   = (r.service_type === 'boarding' ? r.pickup_date : r.dropoff_date) as string
      if (!start || !end) continue
      const d = new Date(start + 'T00:00:00')
      const endD = new Date(end + 'T00:00:00')
      let guard = 0
      while (d <= endD && guard < 400) {
        const key = toYMD(d)
        cmap.set(key, (cmap.get(key) ?? 0) + 1)
        d.setDate(d.getDate() + 1); guard++
      }
    }
    setCounts(cmap)
    setLoading(false)
  }
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function prevMonth() { if (viewMonth === 0) { setYear(y => y - 1); setMonth(11) } else setMonth(m => m - 1) }
  function nextMonth() { if (viewMonth === 11) { setYear(y => y + 1); setMonth(0) } else setMonth(m => m + 1) }

  async function toggleDate(date: string) {
    if (date < todayStr) return
    setErr('')
    setBusy(date)
    const existing = blocked.get(date)
    if (existing) {
      const { error } = await supabase.from('blocked_dates').delete().eq('id', existing.id)
      if (error) { setErr('Could not unblock — try again.'); setBusy(null); return }
      setBlocked(prev => { const m = new Map(prev); m.delete(date); return m })
    } else {
      const { data, error } = await supabase.from('blocked_dates').insert({ date, reason: null }).select('id, date, reason').single()
      if (error || !data) { setErr('Could not block — try again.'); setBusy(null); return }
      setBlocked(prev => new Map(prev).set(date, data as BlockedDate))
    }
    setBusy(null)
  }

  async function saveGroupReason(group: BlockedGroup, reason: string) {
    const value = reason.trim() || null
    const ids = group.dates.map(d => d.id)
    await supabase.from('blocked_dates').update({ reason: value }).in('id', ids)
    setBlocked(prev => {
      const m = new Map(prev)
      for (const d of group.dates) m.set(d.date, { ...d, reason: value })
      return m
    })
  }

  async function unblockGroup(group: BlockedGroup) {
    setErr('')
    const ids = group.dates.map(d => d.id)
    const { error } = await supabase.from('blocked_dates').delete().in('id', ids)
    if (error) { setErr('Could not unblock — try again.'); return }
    setBlocked(prev => {
      const m = new Map(prev)
      for (const d of group.dates) m.delete(d.date)
      return m
    })
  }

  const days         = daysInMonth(viewYear, viewMonth)
  const offset       = firstDow(viewYear, viewMonth)
  const blockedList  = [...blocked.values()].filter(b => b.date >= todayStr).sort((a, b) => a.date.localeCompare(b.date))
  const blockedGroups = groupConsecutive(blockedList)

  return (
    <div>
      <p style={s.hint}>Click a date to block or unblock it. Blocked days are greyed out for clients on the booking calendar and rejected on submission. Shaded days already have bookings (Rover included) — a heads-up so you don&apos;t block dates you&apos;ve committed to.</p>

      <div style={stacked ? { display: 'flex', flexDirection: 'column', gap: 20 } : s.layout}>
        {/* Calendar */}
        <div style={s.cal}>
          <div style={s.nav}>
            <button type="button" onClick={prevMonth} className="btn btn-icon" style={{ fontSize: 20 }}>‹</button>
            <span style={s.monthLabel}>{MONTH_NAMES[viewMonth]} {viewYear}</span>
            <button type="button" onClick={nextMonth} className="btn btn-icon" style={{ fontSize: 20 }}>›</button>
          </div>
          <div style={s.grid}>
            {DOW_LABELS.map(d => <div key={d} style={s.dowCell}>{d}</div>)}
            {Array.from({ length: offset }).map((_, i) => <div key={`e${i}`} />)}
            {days.map(date => {
              const isPast    = date < todayStr
              const isBlocked = blocked.has(date)
              const count     = counts.get(date) ?? 0
              const dayNum    = parseInt(date.slice(8), 10)
              const cellStyle: React.CSSProperties = {
                ...s.dayCell,
                ...(count > 0 && !isPast && !isBlocked ? bookingBg(count) : {}),
                ...(isPast ? s.past : {}),
                ...(isBlocked ? s.blocked : {}),
                cursor: isPast ? 'not-allowed' : 'pointer',
                opacity: busy === date ? 0.5 : 1,
              }
              return (
                <div key={date} style={cellStyle} onClick={() => !isPast && toggleDate(date)}
                  title={isBlocked ? 'Blocked — click to unblock'
                    : count > 0 ? `${count} booking${count !== 1 ? 's' : ''} this day — click to block anyway`
                    : isPast ? '' : 'Click to block'}>
                  {isBlocked ? <span style={s.blockedNum}>{dayNum}</span> : dayNum}
                </div>
              )
            })}
          </div>
          <div style={s.legend}>
            <span style={s.legendItem}><span style={{ ...s.legendDot, background: '#fecaca' }} />Blocked</span>
            <span style={s.legendItem}><span style={{ ...s.legendDot, background: STRIPE_GRAY }} />1–3</span>
            <span style={s.legendItem}><span style={{ ...s.legendDot, background: STRIPE_ORANGE }} />4–8</span>
            <span style={s.legendItem}><span style={{ ...s.legendDot, background: SOLID_ORANGE }} />9+</span>
            <span style={s.legendItem}><span style={{ ...s.legendDot, background: '#fff', border: '1px solid #e5e7eb' }} />Open</span>
          </div>
          {err && <p style={{ margin: '8px 0 0', fontSize: 12, color: '#ef4444' }}>{err}</p>}
        </div>

        {/* Blocked list — grouped by consecutive dates + same reason */}
        <div style={s.listCol}>
          <h4 style={s.listTitle}>Currently blocked ({blockedGroups.length})</h4>
          {loading ? (
            <p style={s.muted}>Loading…</p>
          ) : blockedGroups.length === 0 ? (
            <p style={s.muted}>No upcoming blocked dates.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {blockedGroups.map((g, i) => (
                <div key={i} style={s.row}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={s.rowDate}>{fmtRange(g)}</p>
                    <input
                      defaultValue={g.reason ?? ''}
                      placeholder="Reason (staff-only, optional)"
                      onBlur={e => saveGroupReason(g, e.target.value)}
                      style={s.reasonInput}
                    />
                  </div>
                  <button type="button" onClick={() => unblockGroup(g)} className="btn btn-destructive-outlined btn-xs">Unblock</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  hint:       { margin: '0 0 16px', fontSize: 13, color: '#6b7280', lineHeight: 1.6 },
  layout:     { display: 'flex', gap: 28, flexWrap: 'wrap', alignItems: 'flex-start' },
  cal:        { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 14, width: '100%', maxWidth: 300 },
  nav:        { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  monthLabel: { fontWeight: 600, fontSize: 14, color: '#111827' },
  grid:       { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 },
  dowCell:    { textAlign: 'center', fontSize: 11, fontWeight: 600, color: '#9ca3af', padding: '4px 0' },
  dayCell:    { textAlign: 'center', fontSize: 13, padding: '7px 0', borderRadius: 6, userSelect: 'none', transition: 'background 0.1s' },
  past:       { color: '#d1d5db' },
  blocked:    { background: '#fee2e2', color: '#b91c1c' },
  blockedNum: { fontWeight: 700 },
  legend:     { display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10, paddingTop: 8, borderTop: '1px solid #f3f4f6' },
  legendItem: { display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#6b7280' },
  legendDot:  { width: 10, height: 10, borderRadius: 3, display: 'inline-block', flexShrink: 0 },
  listCol:    { flex: 1, minWidth: 260 },
  listTitle:  { margin: '0 0 12px', fontSize: 13, fontWeight: 700, color: '#374151' },
  muted:      { fontSize: 13, color: '#9ca3af', margin: 0 },
  row:        { display: 'flex', alignItems: 'flex-start', gap: 10, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '10px 12px' },
  rowDate:    { margin: '0 0 6px', fontSize: 13, fontWeight: 600, color: '#111827' },
  reasonInput:{ width: '100%', fontSize: 12, padding: '5px 8px', borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', color: '#111827', fontFamily: 'inherit', boxSizing: 'border-box' },
}
