'use client'
import React, { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { COLORS } from '@/components/staff/HouseholdCard'
import type { Household, DogRow } from '@/components/staff/HouseholdCard'
import { HouseholdDetail } from '@/components/staff/HouseholdDetail'
import { DogAvatar } from '@/components/staff/DogAvatar'
import { ManualBookingForm } from '@/components/staff/ManualBookingForm'
import { SiteNav } from '@/components/SiteNav'

// ── Types ──────────────────────────────────────────────────────
interface ScheduleDog {
  name:        string
  photo_url:   string | null
  gender:      string | null
  photoSigned: string | null
}

interface ScheduleRow {
  group_num:      1 | 2
  activity_type:  'arrival' | 'departure' | 'daycare' | 'meet_greet' | 'in_progress'
  client_id:      string
  full_name:      string
  first_name:     string
  last_name:      string
  phone:          string | null
  service_type:   string | null
  reservation_id: string | null
  meet_greet_id:  string | null
  event_time:     string | null
  pickup_time:    string | null
  dropoff_date:   string | null
  pickup_date:    string | null
  care_notes:     string | null
  completed:      boolean
  dogs:           ScheduleDog[]
}

// ── Helpers ────────────────────────────────────────────────────
const IN_PROGRESS_COLOR = '#16a34a'

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function fmtTime(t: string | null): string {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}

function fmtDateLong(ymd: string): string {
  const d = new Date(ymd + 'T00:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}

function fmtDateShort(ymd: string): string {
  const d = new Date(ymd + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function shiftDate(ymd: string, days: number): string {
  const d = new Date(ymd + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const ACTIVITY: Record<ScheduleRow['activity_type'], { label: string; color: string }> = {
  arrival:     { label: '⬇ Arrival',     color: COLORS.boarding },
  departure:   { label: '⬆ Departure',   color: COLORS.boarding },
  daycare:     { label: '🌞 Daycare',     color: COLORS.daycare },
  meet_greet:  { label: '🤝 Meet & Greet', color: COLORS.meetGreet },
  in_progress: { label: '🏠 Boarding',    color: IN_PROGRESS_COLOR },
}

// ── Dog list (shared avatar — same size as the staff dashboard) ──
function DogList({ dogs }: { dogs: ScheduleDog[] }) {
  if (dogs.length === 0) return <span style={s.noDogs}>—</span>
  return (
    <div style={s.dogRow}>
      {dogs.map((d, i) => (
        <DogAvatar key={i} name={d.name} photoSigned={d.photoSigned} gender={d.gender} />
      ))}
    </div>
  )
}

// ── Care-notes one-line preview ────────────────────────────────
// Signals "there are notes here" without showing the full content. Clicking it
// falls through to the row's onClick, which opens the existing household detail
// modal (full care notes live there). Omitted entirely when none on file.
function CareNotesPreview({ notes }: { notes: string | null }) {
  if (!notes || !notes.trim()) return null
  const oneLine = notes.replace(/\s+/g, ' ').trim()
  return <p style={s.carePreview}>📋 {oneLine}</p>
}

// ── Activity row ───────────────────────────────────────────────
function ActivityRow({ row, onOpen, onToggle }: {
  row: ScheduleRow
  onOpen: (clientId: string) => void
  onToggle: (row: ScheduleRow, next: boolean) => void
}) {
  const a = ACTIVITY[row.activity_type]
  const [hovered, setHovered] = useState(false)
  // Completion toggles apply only to "Activity on this date" items (group 1).
  const togglable = row.group_num === 1
  const done = row.completed
  // A completed BOARDING ARRIVAL is special: the dog hasn't left, the stay has
  // just started. It must NOT gray out — it turns green and renders in the
  // In Progress group. (Daycare/departure/meet_greet keep the gray "done" look.)
  const startedStay = row.activity_type === 'arrival' && done
  const grayed = done && !startedStay
  const accent = startedStay ? IN_PROGRESS_COLOR : a.color
  // When started, present it like an in-progress overnight stay.
  const badgeLabel = startedStay ? ACTIVITY.in_progress.label : a.label
  const showSpan = (row.activity_type === 'in_progress' || startedStay) && row.dropoff_date && row.pickup_date
  // Long-stay flag: boarding stays over 14 nights need a custom flat rate.
  const nights = row.dropoff_date && row.pickup_date
    ? Math.round((new Date(row.pickup_date + 'T00:00:00').getTime() - new Date(row.dropoff_date + 'T00:00:00').getTime()) / 86400000)
    : 0
  const longStay = row.service_type === 'boarding' && nights > 14
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(row.client_id)}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(row.client_id) } }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        ...s.row,
        borderLeftColor: grayed ? '#d1d5db' : accent,
        cursor: 'pointer',
        opacity: grayed ? 0.6 : 1,
        background: grayed ? '#f9fafb' : '#fff',
        boxShadow: hovered ? '0 6px 20px rgba(0,0,0,0.10)' : '0 1px 3px rgba(0,0,0,0.05)',
        transform: hovered ? 'translateY(-1px)' : 'none',
        transition: 'all 0.15s ease',
      }}
    >
      <div style={s.rowTop}>
        <div style={s.rowLeft}>
          {togglable && (
            <button
              type="button"
              role="checkbox"
              aria-checked={done}
              aria-label={done ? 'Mark not done' : 'Mark done'}
              onClick={e => { e.stopPropagation(); onToggle(row, !done) }}
              style={{ ...s.check, background: done ? (startedStay ? IN_PROGRESS_COLOR : '#16a34a') : '#fff', borderColor: done ? (startedStay ? IN_PROGRESS_COLOR : '#16a34a') : '#d1d5db', color: done ? '#fff' : 'transparent' }}
            >✓</button>
          )}
          <span style={{ ...s.activityBadge, color: grayed ? '#9ca3af' : accent, borderColor: grayed ? '#d1d5db' : accent, textDecoration: grayed ? 'line-through' : 'none' }}>{badgeLabel}</span>
          {longStay && <span style={s.longStayBadge} title="Stay over 14 nights — confirm custom flat rate">🌙 Long stay</span>}
          {!startedStay && (row.activity_type === 'daycare'
            ? <span style={s.time}>{fmtTime(row.event_time)}{row.pickup_time ? ` → ${fmtTime(row.pickup_time)}` : ''}</span>
            : (row.event_time && <span style={s.time}>{fmtTime(row.event_time)}</span>))}
          {showSpan && (
            <span style={s.spanDates}>{fmtDateShort(row.dropoff_date!)} → {fmtDateShort(row.pickup_date!)}</span>
          )}
        </div>
        <div style={s.rowClient}>
          <span style={s.clientName}>{row.first_name} {row.last_name}</span>
          {row.phone && (
            <a href={`tel:${row.phone}`} onClick={e => e.stopPropagation()} style={s.phone}>{row.phone}</a>
          )}
        </div>
      </div>
      <CareNotesPreview notes={row.care_notes} />
      <DogList dogs={row.dogs} />
    </div>
  )
}

// ── Household detail modal ─────────────────────────────────────
function HouseholdModal({ household, onClose, onUpdate }: {
  household: Household
  onClose:   () => void
  onUpdate:  (h: Household) => void
}) {
  // Escape to close + lock background scroll while open
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [onClose])

  return (
    <div style={s.overlay} onClick={onClose} role="dialog" aria-modal="true" aria-label={`${household.full_name} details`}>
      <div style={s.dialog} onClick={e => e.stopPropagation()}>
        <HouseholdDetail household={household} embedded onBack={onClose} onUpdate={onUpdate} />
      </div>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────
export default function SchedulePage() {
  const router   = useRouter()
  const supabase = createClient()

  const [date,    setDate]    = useState(todayStr())
  const [rows,    setRows]    = useState<ScheduleRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')
  const [selected,    setSelected]    = useState<Household | null>(null)
  const [openingId,   setOpeningId]   = useState<string | null>(null)
  const [manualEnabled, setManualEnabled] = useState(false)
  const [showManual,    setShowManual]    = useState(false)

  // Whether the manual-booking feature is switched on in Settings.
  useEffect(() => {
    supabase.from('app_settings').select('value').eq('key', 'manual_booking_enabled').maybeSingle()
      .then(({ data }) => setManualEnabled(data?.value === 'true'))
  }, [supabase])

  const load = useCallback(async (d: string) => {
    setLoading(true)
    setError('')

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.replace('/auth'); return }
    const { data: isAdmin } = await supabase.rpc('is_admin')
    if (!isAdmin) { router.replace('/'); return }

    const { data, error: rpcErr } = await supabase.rpc('get_daily_schedule', { p_date: d })
    if (rpcErr) { setError('Failed to load the schedule.'); setLoading(false); return }

    const raw: ScheduleRow[] = (data ?? []).map((r: Record<string, unknown>) => ({
      ...r,
      dogs: ((r.dogs as ScheduleDog[]) ?? []).map(dog => ({ ...dog, photoSigned: null })),
    })) as ScheduleRow[]

    // Sign all dog photos in one batch
    const paths = [...new Set(
      raw.flatMap(r => r.dogs.map(dog => dog.photo_url).filter(Boolean) as string[])
    )]
    const signed: Record<string, string> = {}
    if (paths.length > 0) {
      const { data: urls } = await supabase.storage.from('dog-photos').createSignedUrls(paths, 3600)
      for (const u of urls ?? []) {
        if (u.signedUrl && u.path) signed[u.path] = u.signedUrl
      }
    }

    setRows(raw.map(r => ({
      ...r,
      dogs: r.dogs.map(dog => ({ ...dog, photoSigned: dog.photo_url ? (signed[dog.photo_url] ?? null) : null })),
    })))
    setLoading(false)
  }, [router, supabase])

  useEffect(() => { load(date) }, [date, load])

  // Build the full Household for the clicked client (reuses the same RPC as the
  // staff dashboard, so the modal shows identical data) and open the modal.
  const openHousehold = useCallback(async (clientId: string) => {
    setOpeningId(clientId)
    const { data } = await supabase.rpc('get_staff_households')
    const row = (data ?? []).find((r: Record<string, unknown>) => r.client_id === clientId)
    if (!row) { setOpeningId(null); return }

    const dogs: DogRow[] = (typeof row.dogs === 'string' ? JSON.parse(row.dogs) : (row.dogs ?? []))
      .map((d: Omit<DogRow, 'photoSigned'>) => ({ ...d, photoSigned: null }))

    const paths = [...new Set(dogs.map(d => d.photo_url).filter(Boolean) as string[])]
    const signed: Record<string, string> = {}
    if (paths.length > 0) {
      const { data: urls } = await supabase.storage.from('dog-photos').createSignedUrls(paths, 3600)
      for (const u of urls ?? []) {
        if (u.signedUrl && u.path) signed[u.path] = u.signedUrl
      }
    }

    const household: Household = {
      ...(row as unknown as Household),
      reservation_id: (row.reservation_id as string | null) ?? null,
      dogs: dogs.map(d => ({ ...d, photoSigned: d.photo_url ? (signed[d.photo_url] ?? null) : null })),
    }
    setSelected(household)
    setOpeningId(null)
  }, [supabase])

  // Toggle a schedule item complete/incomplete. Meet & Greet uses the dedicated
  // RPCs so its completion correctly drives clients.meet_greet_status (and thus
  // the client dashboard); other items use the generic completion table.
  const toggleComplete = useCallback(async (row: ScheduleRow, next: boolean) => {
    const matches = (r: ScheduleRow) =>
      row.activity_type === 'meet_greet'
        ? r.meet_greet_id === row.meet_greet_id
        : r.reservation_id === row.reservation_id && r.activity_type === row.activity_type
    // Optimistic update
    setRows(prev => prev.map(r => matches(r) ? { ...r, completed: next } : r))

    let error
    if (row.activity_type === 'meet_greet' && row.meet_greet_id) {
      const fn = next ? 'complete_meet_greet' : 'reopen_meet_greet'
      ;({ error } = await supabase.rpc(fn, { p_meet_greet_id: row.meet_greet_id }))
    } else if (row.reservation_id) {
      ;({ error } = await supabase.rpc('set_schedule_item_complete', {
        p_reservation_id: row.reservation_id, p_activity_type: row.activity_type, p_date: date, p_complete: next,
      }))
    }
    if (error) {
      // Revert on failure
      setRows(prev => prev.map(r => matches(r) ? { ...r, completed: !next } : r))
      setError('Could not update — try again.')
    }
  }, [supabase, date])

  function closeModal() {
    setSelected(null)
    // Reflect any edits made in the modal (dates, M&G, etc.) without losing the date
    load(date)
  }

  // A completed boarding arrival = a stay that just started → it leaves
  // "Activity on this date" and joins the In Progress group (green), not the
  // grayed bottom of group 1.
  const isStartedArrival = (r: ScheduleRow) => r.activity_type === 'arrival' && r.completed

  // Within "Activity on this date", completed items sink to the bottom but stay
  // visible (stable sort preserves the RPC's time ordering otherwise).
  const group1 = rows.filter(r => r.group_num === 1 && !isStartedArrival(r))
    .map((r, i) => ({ r, i }))
    .sort((a, b) => (a.r.completed === b.r.completed) ? a.i - b.i : (a.r.completed ? 1 : -1))
    .map(x => x.r)
  // In Progress = just-started arrivals first, then ongoing stays with no activity.
  const group2 = [...rows.filter(isStartedArrival), ...rows.filter(r => r.group_num === 2)]

  return (
    <div style={s.page}>
      <SiteNav />

      <main style={s.main}>
        <h2 style={s.pageHeading}>Daily Schedule</h2>
        {/* ── Manual booking (only when enabled in Settings) ── */}
        {manualEnabled && (
          <div style={{ textAlign: 'center', marginBottom: 14 }}>
            <button type="button" onClick={() => setShowManual(true)} style={s.manualBtn}>+ Manual Booking</button>
          </div>
        )}
        {/* ── Date picker ── */}
        <div style={s.dateBar}>
          <button type="button" onClick={() => setDate(d => shiftDate(d, -1))} style={s.navBtn} aria-label="Previous day">‹</button>
          <div style={s.dateCenter}>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} style={s.dateInput} />
            <p style={s.dateLong}>{fmtDateLong(date)}</p>
          </div>
          <button type="button" onClick={() => setDate(d => shiftDate(d, 1))} style={s.navBtn} aria-label="Next day">›</button>
        </div>
        {date !== todayStr() && (
          <div style={{ textAlign: 'center', marginBottom: 16 }}>
            <button type="button" onClick={() => setDate(todayStr())} style={s.todayBtn}>Jump to Today</button>
          </div>
        )}

        {loading ? (
          <p style={s.muted}>Loading…</p>
        ) : error ? (
          <p style={{ ...s.muted, color: '#ef4444' }}>{error}</p>
        ) : rows.length === 0 ? (
          <div style={s.empty}>
            <span style={{ fontSize: 36 }}>📭</span>
            <p style={{ margin: '12px 0 0', color: '#6b7280' }}>Nothing scheduled for this day.</p>
          </div>
        ) : (
          <>
            {/* ── Group 1: activity on this date ── */}
            <section style={s.section}>
              <h2 style={s.groupTitle}>Activity on this date</h2>
              {group1.length === 0
                ? <p style={s.muted}>No arrivals, departures, daycare, or Meet &amp; Greets today.</p>
                : group1.map((r, i) => <ActivityRow key={`${r.activity_type}-${r.reservation_id ?? r.meet_greet_id}-${i}`} row={r} onOpen={openHousehold} onToggle={toggleComplete} />)
              }
            </section>

            {/* ── Hairline separator ── */}
            <div style={s.hairline} />

            {/* ── Group 2: in progress, no activity ── */}
            <section style={s.section}>
              <h2 style={{ ...s.groupTitle, color: '#9ca3af' }}>In progress · staying overnight</h2>
              {group2.length === 0
                ? <p style={s.muted}>No dogs currently staying overnight.</p>
                : group2.map((r, i) => <ActivityRow key={`ip-${r.activity_type}-${r.reservation_id}-${i}`} row={r} onOpen={openHousehold} onToggle={toggleComplete} />)
              }
            </section>
          </>
        )}
      </main>

      {openingId && !selected && (
        <div style={s.overlay}><div style={s.openingToast}>Loading household…</div></div>
      )}

      {selected && (
        <HouseholdModal household={selected} onClose={closeModal} onUpdate={setSelected} />
      )}

      {showManual && (
        <div style={s.overlay} onClick={() => setShowManual(false)} role="dialog" aria-modal="true" aria-label="Manual booking">
          <div style={{ maxWidth: 520, width: '100%' }} onClick={e => e.stopPropagation()}>
            <ManualBookingForm
              onClose={() => setShowManual(false)}
              onCreated={() => { setShowManual(false); load(date) }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

// ── Styles ─────────────────────────────────────────────────────
const s: Record<string, React.CSSProperties> = {
  page:        { minHeight: '100vh', background: 'var(--page-bg)' },
  main:        { maxWidth: 760, margin: '0 auto', padding: '28px 24px 60px' },
  pageHeading: { margin: '0 0 20px', fontSize: 22, fontWeight: 800, color: '#111827', textAlign: 'center' },

  dateBar:     { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, marginBottom: 8 },
  navBtn:      { fontSize: 22, lineHeight: 1, width: 38, height: 38, borderRadius: '50%', border: '1px solid #e5e7eb', background: '#fff', color: '#374151', cursor: 'pointer', fontFamily: 'inherit' },
  dateCenter:  { textAlign: 'center' },
  dateInput:   { fontSize: 14, padding: '7px 12px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', color: '#111827', fontFamily: 'inherit', cursor: 'pointer' },
  dateLong:    { margin: '6px 0 0', fontSize: 14, fontWeight: 700, color: '#111827' },
  todayBtn:    { fontSize: 12, fontWeight: 600, color: '#2563eb', background: '#fff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '5px 14px', cursor: 'pointer', fontFamily: 'inherit' },
  manualBtn:   { fontSize: 13, fontWeight: 700, color: '#fff', background: '#2563eb', border: 'none', borderRadius: 999, padding: '8px 18px', cursor: 'pointer', fontFamily: 'inherit' },

  section:     { display: 'flex', flexDirection: 'column', gap: 12 },
  groupTitle:  { margin: '0 0 4px', fontSize: 13, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.05em' },
  hairline:    { height: 1, background: '#e5e7eb', margin: '28px 0' },

  row:         { background: '#fff', borderRadius: 12, border: '1px solid #f3f4f6', borderLeft: '4px solid', padding: '14px 18px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' },
  rowTop:      { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 10, flexWrap: 'wrap' },
  rowLeft:     { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  activityBadge:{ fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 20, border: '1.5px solid', background: 'transparent', whiteSpace: 'nowrap' },
  time:        { fontSize: 14, fontWeight: 700, color: '#111827' },
  spanDates:   { fontSize: 12, color: '#9ca3af' },
  rowClient:   { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1, minWidth: 0 },
  clientName:  { fontSize: 14, fontWeight: 700, color: '#111827' },
  phone:       { fontSize: 12, color: '#2563eb', textDecoration: 'none' },

  check:       { width: 22, height: 22, borderRadius: '50%', border: '2px solid', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, cursor: 'pointer', flexShrink: 0, padding: 0, fontFamily: 'inherit', lineHeight: 1 },
  carePreview: { margin: '0 0 8px', fontSize: 12, color: '#6b7280', fontStyle: 'italic', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' },
  longStayBadge: { fontSize: 11, fontWeight: 700, color: '#fff', background: '#7c3aed', borderRadius: 20, padding: '3px 9px', whiteSpace: 'nowrap' },

  dogRow:      { display: 'flex', flexWrap: 'wrap', gap: 12 },
  noDogs:      { fontSize: 13, color: '#9ca3af' },

  muted:       { fontSize: 14, color: '#9ca3af', margin: 0 },
  empty:       { textAlign: 'center', padding: '60px 24px' },

  // Modal
  overlay:     { position: 'fixed', inset: 0, background: 'rgba(17,24,39,0.55)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px', zIndex: 50, overflowY: 'auto' },
  dialog:      { background: 'var(--page-bg)', borderRadius: 14, maxWidth: 900, width: '100%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' },
  openingToast:{ alignSelf: 'center', margin: 'auto', background: '#fff', borderRadius: 10, padding: '14px 22px', fontSize: 14, color: '#374151', boxShadow: '0 8px 30px rgba(0,0,0,0.2)' },
}
