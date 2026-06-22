'use client'
import React, { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

interface BlockedDate { id: string; date: string; reason: string | null }

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

export function BlockedDatesCalendar() {
  const supabase = createClient()
  const todayStr = toYMD(new Date())
  const seed = new Date()

  const [blocked,   setBlocked]   = useState<Map<string, BlockedDate>>(new Map())
  const [viewYear,  setYear]      = useState(seed.getFullYear())
  const [viewMonth, setMonth]     = useState(seed.getMonth())
  const [loading,   setLoading]   = useState(true)
  const [busy,      setBusy]      = useState<string | null>(null)
  const [err,       setErr]       = useState('')

  async function load() {
    const { data, error } = await supabase.from('blocked_dates').select('id, date, reason').order('date')
    if (error) { setErr('Could not load blocked dates.'); setLoading(false); return }
    const map = new Map<string, BlockedDate>()
    for (const r of data ?? []) map.set(r.date, r as BlockedDate)
    setBlocked(map)
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

  async function saveReason(date: string, reason: string) {
    const existing = blocked.get(date)
    if (!existing) return
    const value = reason.trim() || null
    await supabase.from('blocked_dates').update({ reason: value }).eq('id', existing.id)
    setBlocked(prev => new Map(prev).set(date, { ...existing, reason: value }))
  }

  const days   = daysInMonth(viewYear, viewMonth)
  const offset = firstDow(viewYear, viewMonth)
  const blockedList = [...blocked.values()].filter(b => b.date >= todayStr).sort((a, b) => a.date.localeCompare(b.date))

  return (
    <div>
      <p style={s.hint}>Click a date to block or unblock it. Blocked days are greyed out for clients on the booking calendar and rejected on submission.</p>

      <div style={s.layout}>
        {/* Calendar */}
        <div style={s.cal}>
          <div style={s.nav}>
            <button type="button" onClick={prevMonth} style={s.navBtn}>‹</button>
            <span style={s.monthLabel}>{MONTH_NAMES[viewMonth]} {viewYear}</span>
            <button type="button" onClick={nextMonth} style={s.navBtn}>›</button>
          </div>
          <div style={s.grid}>
            {DOW_LABELS.map(d => <div key={d} style={s.dowCell}>{d}</div>)}
            {Array.from({ length: offset }).map((_, i) => <div key={`e${i}`} />)}
            {days.map(date => {
              const isPast    = date < todayStr
              const isBlocked = blocked.has(date)
              const dayNum    = parseInt(date.slice(8), 10)
              const cellStyle: React.CSSProperties = {
                ...s.dayCell,
                ...(isPast ? s.past : {}),
                ...(isBlocked ? s.blocked : {}),
                cursor: isPast ? 'not-allowed' : 'pointer',
                opacity: busy === date ? 0.5 : 1,
              }
              return (
                <div key={date} style={cellStyle} onClick={() => !isPast && toggleDate(date)}
                  title={isBlocked ? 'Blocked — click to unblock' : isPast ? '' : 'Click to block'}>
                  {isBlocked ? <span style={s.blockedNum}>{dayNum}</span> : dayNum}
                </div>
              )
            })}
          </div>
          <div style={s.legend}>
            <span style={s.legendItem}><span style={{ ...s.legendDot, background: '#fecaca' }} />Blocked</span>
            <span style={s.legendItem}><span style={{ ...s.legendDot, background: '#fff', border: '1px solid #e5e7eb' }} />Available</span>
          </div>
          {err && <p style={{ margin: '8px 0 0', fontSize: 12, color: '#ef4444' }}>{err}</p>}
        </div>

        {/* Blocked list with reasons */}
        <div style={s.listCol}>
          <h4 style={s.listTitle}>Currently blocked ({blockedList.length})</h4>
          {loading ? (
            <p style={s.muted}>Loading…</p>
          ) : blockedList.length === 0 ? (
            <p style={s.muted}>No upcoming blocked dates.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {blockedList.map(b => (
                <div key={b.id} style={s.row}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={s.rowDate}>{fmtLong(b.date)}</p>
                    <input
                      defaultValue={b.reason ?? ''}
                      placeholder="Reason (staff-only, optional)"
                      onBlur={e => saveReason(b.date, e.target.value)}
                      style={s.reasonInput}
                    />
                  </div>
                  <button type="button" onClick={() => toggleDate(b.date)} style={s.unblockBtn}>Unblock</button>
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
  cal:        { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 14, width: 300 },
  nav:        { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  navBtn:     { background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', padding: '0 8px', color: '#374151', lineHeight: 1 },
  monthLabel: { fontWeight: 600, fontSize: 14, color: '#111827' },
  grid:       { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 },
  dowCell:    { textAlign: 'center', fontSize: 11, fontWeight: 600, color: '#9ca3af', padding: '4px 0' },
  dayCell:    { textAlign: 'center', fontSize: 13, padding: '7px 0', borderRadius: 6, userSelect: 'none', transition: 'background 0.1s' },
  past:       { color: '#d1d5db' },
  blocked:    { background: '#fee2e2', color: '#b91c1c' },
  blockedNum: { fontWeight: 700 },
  legend:     { display: 'flex', gap: 12, marginTop: 10, paddingTop: 8, borderTop: '1px solid #f3f4f6' },
  legendItem: { display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#6b7280' },
  legendDot:  { width: 10, height: 10, borderRadius: 3, display: 'inline-block', flexShrink: 0 },
  listCol:    { flex: 1, minWidth: 260 },
  listTitle:  { margin: '0 0 12px', fontSize: 13, fontWeight: 700, color: '#374151' },
  muted:      { fontSize: 13, color: '#9ca3af', margin: 0 },
  row:        { display: 'flex', alignItems: 'flex-start', gap: 10, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '10px 12px' },
  rowDate:    { margin: '0 0 6px', fontSize: 13, fontWeight: 600, color: '#111827' },
  reasonInput:{ width: '100%', fontSize: 12, padding: '5px 8px', borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', color: '#111827', fontFamily: 'inherit', boxSizing: 'border-box' },
  unblockBtn: { flexShrink: 0, fontSize: 12, fontWeight: 600, color: '#be123c', background: '#fff', border: '1px solid #fecdd3', borderRadius: 6, padding: '5px 12px', cursor: 'pointer', fontFamily: 'inherit' },
}
