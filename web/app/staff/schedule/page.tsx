'use client'
import React, { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import type { Household, DogRow } from '@/components/staff/HouseholdCard'
import { HouseholdDetail } from '@/components/staff/HouseholdDetail'
import { SiteNav } from '@/components/SiteNav'
import { BlockedDatesCalendar } from '@/components/staff/BlockedDatesCalendar'
import { DateNavigator } from '@/components/shared/molecules/DateNavigator'
import { ServicePill, type ServiceType } from '@/components/shared/molecules/ServicePill'
import { FeeBreakdownModal } from '@/components/staff/FeeBreakdownModal'
import { formatPhone } from '@/lib/format'
import { dogNameColor } from '@/lib/dog-colors'

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
  return new Date(ymd + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}
function fmtDateShort(ymd: string): string {
  return new Date(ymd + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
function shiftDate(ymd: string, days: number): string {
  const d = new Date(ymd + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function dayOfStay(dropoff: string, selected: string): number {
  const a = new Date(dropoff + 'T00:00:00').getTime()
  const b = new Date(selected + 'T00:00:00').getTime()
  return Math.round((b - a) / 86400000) + 1
}
function totalNights(dropoff: string, pickup: string): number {
  return Math.round((new Date(pickup + 'T00:00:00').getTime() - new Date(dropoff + 'T00:00:00').getTime()) / 86400000)
}

// ── Service pills ──────────────────────────────────────────────
// Schedule activity_type keys → shared ServicePill types.
// (in_progress activity renders as the "Boarding" pill.)
const ACT_TO_PILL: Record<ScheduleRow['activity_type'], ServiceType> = {
  arrival:     'arrival',
  departure:   'departure',
  daycare:     'daycare',
  meet_greet:  'meet-greet',
  in_progress: 'boarding',
}

// ── Dog list with gender-colored names ─────────────────────────
const DOG_SIZE = 48
function DogList({ dogs }: { dogs: ScheduleDog[] }) {
  if (dogs.length === 0) return null
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 10 }}>
      {dogs.map((d, i) => (
        <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, width: DOG_SIZE }}>
          {d.photoSigned
            ? <img src={d.photoSigned} alt={d.name} style={{ width: DOG_SIZE, height: DOG_SIZE, borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--border)', flexShrink: 0 }} />
            : <div style={{ width: DOG_SIZE, height: DOG_SIZE, borderRadius: '50%', background: 'var(--surface-muted)', border: '2px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>🐕</div>
          }
          <span style={{ fontSize: 11, fontWeight: 700, color: dogNameColor(d.gender), textAlign: 'center', lineHeight: 1.2, maxWidth: DOG_SIZE + 16, overflowWrap: 'break-word' }}>{d.name}</span>
        </div>
      ))}
    </div>
  )
}

// ── Care notes preview ─────────────────────────────────────────
function CareNotesPreview({ notes }: { notes: string | null }) {
  if (!notes?.trim()) return null
  return <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--text-secondary)', fontStyle: 'italic', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>📋 {notes.replace(/\s+/g, ' ').trim()}</p>
}

// ── Collapsible section container ─────────────────────────────
function ScheduleSection({ title, count, open, onToggle, isMobile, children }: {
  title:    string
  count:    number
  open:     boolean
  onToggle: () => void
  isMobile: boolean
  children: React.ReactNode
}) {
  return (
    <div style={s.section}>
      <div
        role="button"
        tabIndex={0}
        onClick={isMobile ? onToggle : undefined}
        onKeyDown={isMobile ? (e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle() } }) : undefined}
        style={{ ...s.sectionHead, cursor: isMobile ? 'pointer' : 'default' }}
      >
        <h3 style={s.sectionTitle}>{title}</h3>
        <span style={s.countBadge}>{count}</span>
        {isMobile && (
          <svg
            width="20" height="20" viewBox="0 0 20 20" fill="none"
            style={{ flexShrink: 0, marginLeft: 'auto', display: 'block', transition: 'transform 0.2s ease', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
          >
            <polyline points="4,7 10,13 16,7" stroke="var(--text-secondary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>
      <div style={{ display: (!isMobile || open) ? 'flex' : 'none', flexDirection: 'column', gap: 10 }}>
        {children}
      </div>
    </div>
  )
}

// ── Today's Activity card ──────────────────────────────────────
function ActivityCard({ row, onOpen, onToggle, onBreakdown }: {
  row:         ScheduleRow
  onOpen:      (clientId: string) => void
  onToggle:    (row: ScheduleRow, next: boolean) => void
  onBreakdown: (resId: string) => void
}) {
  const [hovered, setHovered] = useState(false)
  const nights = row.dropoff_date && row.pickup_date ? totalNights(row.dropoff_date, row.pickup_date) : 0
  const longStay = row.service_type === 'boarding' && nights > 14
  const timeStr = row.activity_type === 'daycare'
    ? `${fmtTime(row.event_time)}${row.pickup_time ? ` – ${fmtTime(row.pickup_time)}` : ''}`
    : fmtTime(row.event_time)

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(row.client_id)}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(row.client_id) } }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ ...s.card, boxShadow: hovered ? '0 6px 22px rgba(0,0,0,0.10)' : '0 0 3.5px rgba(0,0,0,0.10)', transform: hovered ? 'translateY(-1px)' : 'none', transition: 'all 0.15s ease' }}
    >
      <div style={s.cardTop}>
        <div style={s.cardLeft}>
          <button
            type="button"
            role="checkbox"
            aria-checked={false}
            aria-label="Mark done"
            onClick={e => { e.stopPropagation(); onToggle(row, true) }}
            style={s.checkbox}
          />
          <ServicePill type={ACT_TO_PILL[row.activity_type]} />
          {longStay && <ServicePill type="long-stay" />}
          {timeStr && <span style={s.time}>{timeStr}</span>}
        </div>
        <div style={s.cardRight}>
          {row.reservation_id && (
            <button type="button" onClick={e => { e.stopPropagation(); onBreakdown(row.reservation_id!) }} className="btn btn-icon" style={{ fontSize: 15, color: 'var(--text-secondary)' }} title="View fee breakdown" aria-label="View fee breakdown">ⓘ</button>
          )}
          <span style={s.ownerName}>{row.first_name} {row.last_name}</span>
          {row.phone && <a href={`tel:${row.phone}`} onClick={e => e.stopPropagation()} style={s.phone}>{formatPhone(row.phone)}</a>}
        </div>
      </div>
      <CareNotesPreview notes={row.care_notes} />
      <DogList dogs={row.dogs} />
    </div>
  )
}

// ── In Progress card ───────────────────────────────────────────
function InProgressCard({ row, date, onOpen, onToggle, onBreakdown }: {
  row:         ScheduleRow
  date:        string
  onOpen:      (clientId: string) => void
  onToggle:    (row: ScheduleRow, next: boolean) => void
  onBreakdown: (resId: string) => void
}) {
  const [hovered, setHovered] = useState(false)
  const nights = row.dropoff_date && row.pickup_date ? totalNights(row.dropoff_date, row.pickup_date) : 0
  const dayNum = row.dropoff_date ? dayOfStay(row.dropoff_date, date) : 1
  const isDay1of1 = dayNum === 1 && nights === 1
  const longStay = nights > 14

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(row.client_id)}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(row.client_id) } }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ ...s.card, boxShadow: hovered ? '0 6px 22px rgba(0,0,0,0.10)' : '0 0 3.5px rgba(0,0,0,0.10)', transform: hovered ? 'translateY(-1px)' : 'none', transition: 'all 0.15s ease' }}
    >
      <div style={s.cardTop}>
        <div style={s.cardLeft}>
          {isDay1of1 && (
            <button
              type="button"
              role="checkbox"
              aria-checked={false}
              aria-label="Complete stay"
              onClick={e => { e.stopPropagation(); onToggle(row, true) }}
              style={s.checkbox}
            />
          )}
          <ServicePill type="boarding" />
          {longStay && <ServicePill type="long-stay" />}
        </div>
        <div style={s.cardRight}>
          {row.reservation_id && (
            <button type="button" onClick={e => { e.stopPropagation(); onBreakdown(row.reservation_id!) }} className="btn btn-icon" style={{ fontSize: 15, color: 'var(--text-secondary)' }} title="View fee breakdown" aria-label="View fee breakdown">ⓘ</button>
          )}
          <span style={s.ownerName}>{row.first_name} {row.last_name}</span>
          {row.phone && <a href={`tel:${row.phone}`} onClick={e => e.stopPropagation()} style={s.phone}>{formatPhone(row.phone)}</a>}
        </div>
      </div>
      {row.dropoff_date && row.pickup_date && (
        <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>
          {fmtDateShort(row.dropoff_date)} → {fmtDateShort(row.pickup_date)}
        </p>
      )}
      <DogList dogs={row.dogs} />
      {row.dropoff_date && row.pickup_date && (
        <p style={{ margin: '8px 0 0', fontSize: 12, fontWeight: 700, color: 'var(--status-in-progress)' }}>
          Day {dayNum} of {nights}
        </p>
      )}
    </div>
  )
}

// ── Completed card ─────────────────────────────────────────────
function CompletedCard({ row, onOpen, onToggle, onBreakdown }: {
  row:         ScheduleRow
  onOpen:      (clientId: string) => void
  onToggle:    (row: ScheduleRow, next: boolean) => void
  onBreakdown: (resId: string) => void
}) {
  const [hovered, setHovered] = useState(false)
  // CompletedCard intentionally ignores outlined — completed items use solid pills
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(row.client_id)}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(row.client_id) } }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ ...s.card, opacity: 0.85, boxShadow: hovered ? '0 4px 14px rgba(0,0,0,0.09)' : '0 0 3.5px rgba(0,0,0,0.08)', transition: 'all 0.15s ease' }}
    >
      <div style={s.cardTop}>
        <div style={s.cardLeft}>
          <button
            type="button"
            role="checkbox"
            aria-checked={true}
            aria-label="Mark not done"
            onClick={e => { e.stopPropagation(); onToggle(row, false) }}
            style={s.checkedBox}
          >✓</button>
          <ServicePill type={ACT_TO_PILL[row.activity_type]} />
        </div>
        <div style={s.cardRight}>
          {row.reservation_id && (
            <button type="button" onClick={e => { e.stopPropagation(); onBreakdown(row.reservation_id!) }} className="btn btn-icon" style={{ fontSize: 15, color: 'var(--text-secondary)' }} title="View fee breakdown" aria-label="View fee breakdown">ⓘ</button>
          )}
          <span style={s.ownerName}>{row.first_name} {row.last_name}</span>
          {row.phone && <a href={`tel:${row.phone}`} onClick={e => e.stopPropagation()} style={s.phone}>{formatPhone(row.phone)}</a>}
        </div>
      </div>
      {row.dogs.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
          {row.dogs.map((d, i) => (
            <span key={i} style={{ fontSize: 12, fontWeight: 700, color: dogNameColor(d.gender) }}>{d.name}</span>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Household detail modal ─────────────────────────────────────
function HouseholdModal({ household, onClose, onUpdate }: {
  household: Household
  onClose:   () => void
  onUpdate:  (h: Household) => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [onClose])

  return (
    <div style={s.overlay} onClick={onClose} role="dialog" aria-modal="true">
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

  const [date,      setDate]      = useState(todayStr())
  const [rows,      setRows]      = useState<ScheduleRow[]>([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState('')
  const [selected,       setSelected]       = useState<Household | null>(null)
  const [openingId,      setOpeningId]      = useState<string | null>(null)
  const [breakdownResId, setBreakdownResId] = useState<string | null>(null)

  // Section collapse state (desktop: all always open; mobile: Activity open, rest collapsed)
  const [activityOpen,   setActivityOpen]   = useState(true)
  const [inProgressOpen, setInProgressOpen] = useState(false)
  const [completedOpen,  setCompletedOpen]  = useState(false)

  // JS-driven mobile detection — avoids CSS specificity battles with inline styles.
  // Initialised synchronously on the client so there's no flash on mobile.
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' && window.innerWidth <= 980
  )
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 980px)')
    setIsMobile(mq.matches)
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

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

    const paths = [...new Set(raw.flatMap(r => r.dogs.map(d => d.photo_url).filter(Boolean) as string[]))]
    const signed: Record<string, string> = {}
    if (paths.length > 0) {
      const { data: urls } = await supabase.storage.from('dog-photos').createSignedUrls(paths, 3600)
      for (const u of urls ?? []) { if (u.signedUrl && u.path) signed[u.path] = u.signedUrl }
    }

    setRows(raw.map(r => ({
      ...r,
      dogs: r.dogs.map(d => ({ ...d, photoSigned: d.photo_url ? (signed[d.photo_url] ?? null) : null })),
    })))
    setLoading(false)
  }, [router, supabase])

  useEffect(() => { load(date) }, [date, load])

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
      for (const u of urls ?? []) { if (u.signedUrl && u.path) signed[u.path] = u.signedUrl }
    }

    setSelected({
      ...(row as unknown as Household),
      reservation_id: (row.reservation_id as string | null) ?? null,
      dogs: dogs.map(d => ({ ...d, photoSigned: d.photo_url ? (signed[d.photo_url] ?? null) : null })),
    })
    setOpeningId(null)
  }, [supabase])

  const toggleComplete = useCallback(async (row: ScheduleRow, next: boolean) => {
    const matches = (r: ScheduleRow) =>
      row.activity_type === 'meet_greet'
        ? r.meet_greet_id === row.meet_greet_id
        : r.reservation_id === row.reservation_id && r.activity_type === row.activity_type
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
      setRows(prev => prev.map(r => matches(r) ? { ...r, completed: !next } : r))
      setError('Could not update — try again.')
    }
  }, [supabase, date])

  function closeModal() { setSelected(null); load(date) }

  // ── Compute sections ───────────────────────────────────────────
  const isStartedArrival = (r: ScheduleRow) => r.activity_type === 'arrival' && r.completed

  // Today's Activity: uncompleted group1 events (arrivals, departures, daycare, M&G)
  const todayActivity = rows.filter(r => r.group_num === 1 && !r.completed)

  // In Progress: just-started boarding arrivals + ongoing overnight stays
  const inProgress = [...rows.filter(isStartedArrival), ...rows.filter(r => r.group_num === 2)]

  // Completed: completed group1 events (started arrivals move to In Progress, not here)
  const completedItems = rows.filter(r => r.group_num === 1 && r.completed && !isStartedArrival(r))

  return (
    <div style={s.page}>
      <SiteNav />

      <main style={s.main}>
        {/* ── Header ── */}
        <div className="staff-header-3col">
          <div className="page-header-text">
            <h2 style={s.pageTitle}>Daily Schedule</h2>
            <p style={s.subtitle}>Here&apos;s what&apos;s happening today.</p>
          </div>
          <DateNavigator
            date={date}
            todayStr={todayStr()}
            onChange={setDate}
            onPrev={() => setDate(d => shiftDate(d, -1))}
            onNext={() => setDate(d => shiftDate(d, 1))}
          />
          <div className="page-header-cta">
            <button type="button" onClick={() => router.push('/staff/rover?new=1')} className="btn btn-rover btn-sm">+ Add Rover Booking</button>
          </div>
        </div>

        {/* ── Two-column body ── */}
        <div className="sched-body">

          {/* Left: availability calendar */}
          <aside style={s.availPanel}>
            <h3 style={s.availTitle}>Manage Availability</h3>
            <p style={s.availHint}>Block dates you&apos;re unavailable.</p>
            <BlockedDatesCalendar stacked />
          </aside>

          {/* Right: three sections */}
          <div style={s.sectionsCol}>
            {loading ? (
              <p style={s.muted}>Loading…</p>
            ) : error ? (
              <p style={{ ...s.muted, color: 'var(--error)' }}>{error}</p>
            ) : (
              <>
                <ScheduleSection
                  title="Today's Activity"
                  count={todayActivity.length}
                  open={activityOpen}
                  onToggle={() => setActivityOpen(o => !o)}
                  isMobile={isMobile}
                >
                  {todayActivity.length === 0
                    ? <p style={s.empty}>No arrivals, departures, daycare, or Meet &amp; Greets today.</p>
                    : todayActivity.map((r, i) => (
                        <ActivityCard
                          key={`${r.activity_type}-${r.reservation_id ?? r.meet_greet_id}-${i}`}
                          row={r}
                          onOpen={openHousehold}
                          onToggle={toggleComplete}
                          onBreakdown={setBreakdownResId}
                        />
                      ))
                  }
                </ScheduleSection>

                <ScheduleSection
                  title="In Progress"
                  count={inProgress.length}
                  open={inProgressOpen}
                  onToggle={() => setInProgressOpen(o => !o)}
                  isMobile={isMobile}
                >
                  {inProgress.length === 0
                    ? <p style={s.empty}>No dogs currently staying overnight.</p>
                    : <div style={s.grid2}>
                        {inProgress.map((r, i) => (
                          <InProgressCard
                            key={`ip-${r.activity_type}-${r.reservation_id}-${i}`}
                            row={r}
                            date={date}
                            onOpen={openHousehold}
                            onToggle={toggleComplete}
                            onBreakdown={setBreakdownResId}
                          />
                        ))}
                      </div>
                  }
                </ScheduleSection>

                <ScheduleSection
                  title="Completed"
                  count={completedItems.length}
                  open={completedOpen}
                  onToggle={() => setCompletedOpen(o => !o)}
                  isMobile={isMobile}
                >
                  {completedItems.length === 0
                    ? <p style={s.empty}>Nothing completed yet.</p>
                    : <div style={s.grid2}>
                        {completedItems.map((r, i) => (
                          <CompletedCard
                            key={`done-${r.activity_type}-${r.reservation_id ?? r.meet_greet_id}-${i}`}
                            row={r}
                            onOpen={openHousehold}
                            onToggle={toggleComplete}
                            onBreakdown={setBreakdownResId}
                          />
                        ))}
                      </div>
                  }
                </ScheduleSection>
              </>
            )}
          </div>

        </div>
      </main>

      {openingId && !selected && (
        <div style={s.overlay}><div style={s.openingToast}>Loading…</div></div>
      )}
      {selected && (
        <HouseholdModal household={selected} onClose={closeModal} onUpdate={setSelected} />
      )}
      {breakdownResId && (
        <FeeBreakdownModal reservationId={breakdownResId} onClose={() => setBreakdownResId(null)} />
      )}
    </div>
  )
}

// ── Styles ─────────────────────────────────────────────────────
const s: Record<string, React.CSSProperties> = {
  page:        { minHeight: '100vh', background: 'var(--page-bg)' },
  main:        { maxWidth: 1200, margin: '0 auto', padding: '28px 24px 60px' },

  // Header
  pageTitle:   { margin: '0 0 4px', fontSize: 28, fontWeight: 800, color: 'var(--text-primary)' },
  subtitle:    { margin: 0, fontSize: 14, color: 'var(--text-secondary)' },
  // Availability panel (left column)
  availPanel:  { background: 'var(--surface)', borderRadius: 'var(--radius-card)', padding: '20px', boxShadow: '0 0 3.5px rgba(0,0,0,0.10)' },
  availTitle:  { margin: '0 0 4px', fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.06em' },
  availHint:   { margin: '0 0 16px', fontSize: 13, color: 'var(--text-secondary)' },

  // Sections column (right column)
  sectionsCol: { display: 'flex', flexDirection: 'column', gap: 16 },

  // Section container
  section:     { background: 'rgba(255,255,255,0.55)', borderRadius: 'var(--radius-card)', padding: '20px' },
  sectionHead: { display: 'flex', alignItems: 'center', marginBottom: 14, cursor: 'pointer', userSelect: 'none', gap: 8 },
  sectionTitle:{ margin: 0, fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.06em' },
  countBadge:  { minWidth: 20, height: 20, borderRadius: 999, background: 'var(--primary-light)', color: 'var(--primary-dark)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0, padding: '0 6px' },

  // Cards
  card:        { background: 'var(--surface)', borderRadius: 'var(--radius-card)', padding: '14px 16px', cursor: 'pointer' },
  cardTop:     { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' },
  cardLeft:    { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  cardRight:   { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, minWidth: 0 },
  ownerName:   { fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' },
  phone:       { fontSize: 12, color: 'var(--primary)', textDecoration: 'none' },
  time:        { fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' },

  // Checkbox states
  checkbox:    { width: 22, height: 22, borderRadius: '50%', border: '2px solid var(--border)', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, padding: 0, fontFamily: 'inherit', lineHeight: 1 },
  checkedBox:  { width: 22, height: 22, borderRadius: '50%', background: 'var(--success)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, flexShrink: 0, border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', lineHeight: 1 },

  // Pills
  longStayPill:{ display: 'inline-flex', alignItems: 'center', height: 22, background: 'var(--status-long-stay)', color: '#fff', fontSize: 11, fontWeight: 700, padding: '0 10px', borderRadius: 999, whiteSpace: 'nowrap', boxSizing: 'border-box', lineHeight: 1 },

  // In Progress / Completed grids
  grid2:       { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 },

  empty:       { margin: 0, fontSize: 14, color: 'var(--text-secondary)', fontStyle: 'italic' },
  muted:       { fontSize: 14, color: 'var(--text-secondary)', margin: 0 },

  // Modal
  overlay:     { position: 'fixed', inset: 0, background: 'rgba(17,24,39,0.55)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px', zIndex: 50, overflowY: 'auto' },
  dialog:      { background: 'var(--page-bg)', borderRadius: 'var(--radius-card)', maxWidth: 900, width: '100%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' },
  openingToast:{ alignSelf: 'center', margin: 'auto', background: '#fff', borderRadius: 10, padding: '14px 22px', fontSize: 14, color: '#374151', boxShadow: '0 8px 30px rgba(0,0,0,0.2)' },
}
