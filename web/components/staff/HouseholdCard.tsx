'use client'
import React from 'react'
import { dogNameColor } from '@/lib/dog-colors'
import { formatPhone } from '@/lib/format'

// ── Status colors — token-backed (Batch 11a palette). These reference the CSS
//    variables in globals.css so the whole app re-themes from one place. ──
export const COLORS = {
  boarding:  'var(--status-boarding)',
  daycare:   'var(--status-daycare)',
  blocked:   'var(--error)',
  meetGreet: 'var(--status-meet-greet)',
} as const

// ── Types ──────────────────────────────────────────────────────
export interface DogRow {
  id:          string
  name:        string
  birthdate:   string    // 'YYYY-MM-DD'
  photo_url:   string | null
  gender:      string | null
  photoSigned: string | null  // generated client-side after load
}

export interface Household {
  client_id:         string
  full_name:         string
  first_name:        string
  last_name:         string
  phone:             string | null
  blocked:           boolean
  meet_greet_status: string | null
  mg_id:             string | null
  mg_date:           string | null
  mg_time:           string | null
  mg_status:         string | null
  reservation_id:    string | null
  service_type:      string | null
  res_status:        string | null
  dropoff_date:      string | null
  dropoff_time:      string | null
  pickup_date:       string | null
  pickup_time:       string | null
  total_price:       number | null
  payment_method:    string | null
  paid:              boolean | null
  has_unpaid_balance: boolean | null
  unpaid_total:      number | null
  dogs:              DogRow[]
  staff_note:        string | null
}

// ── Helpers ────────────────────────────────────────────────────
export function monthsOld(birthdate: string): number {
  const b = new Date(birthdate + 'T00:00:00')
  const n = new Date()
  return (n.getFullYear() - b.getFullYear()) * 12 + (n.getMonth() - b.getMonth())
}

export function fmtDate(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${months[m - 1]} ${d}, ${y}`
}

// Status takes priority; service-type only applies for upcoming
export function strokeColor(status: string | null, serviceType: string | null): string {
  if (status === 'cancelled' || status === 'completed') return 'var(--status-no-activity)'
  if (status === 'in_progress') return 'var(--status-in-progress)'
  if (serviceType === 'boarding') return COLORS.boarding
  if (serviceType === 'daycare')  return COLORS.daycare
  return 'var(--status-no-activity)'
}

function serviceLabel(serviceType: string | null): string {
  if (serviceType === 'boarding') return '🏠 Boarding'
  if (serviceType === 'daycare')  return '🌞 Daycare'
  return '—'
}

function statusLabel(s: string | null): string {
  if (s === 'in_progress') return 'In Progress'
  if (s === 'upcoming')    return 'Upcoming'
  if (s === 'completed')   return 'Completed'
  return '—'
}

function nightsBetween(a: string, b: string): number {
  return Math.round(
    (new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime()) / 86400000
  )
}

export function fmtTime(t: string): string {
  const [h, m] = t.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}




// Compact-card name truncation (>8 chars → ellipsis). Full name still shows in
// the detail view / modal — this is for the card only.
function cardName(name: string): string {
  return name.length > 8 ? `${name.slice(0, 8).trimEnd()}…` : name
}

// Reuse the Daily Schedule arrival/departure arrow glyphs for drop-off/pick-up.
const ARROW_DROPOFF = '⬇'
const ARROW_PICKUP  = '⬆'

// Daycare duration in hours from drop-off → pick-up time (e.g. "8.5"). Null when
// times are missing or non-positive.
function durationHours(a: string | null, b: string | null): string | null {
  if (!a || !b) return null
  const [h1, m1] = a.split(':').map(Number)
  const [h2, m2] = b.split(':').map(Number)
  const mins = (h2 * 60 + m2) - (h1 * 60 + m1)
  if (mins <= 0) return null
  const hrs = mins / 60
  return Number.isInteger(hrs) ? String(hrs) : hrs.toFixed(1)
}

// ── Component ──────────────────────────────────────────────────
interface Props {
  household: Household
  onClick:   () => void
}

export function HouseholdCard({ household, onClick }: Props) {
  const { service_type, res_status, blocked } = household
  // Every client always shows a card. "Active" = current/upcoming; a client whose
  // only booking is in the past is INACTIVE ("Last booking was…"); a client with
  // no non-cancelled booking shows "No Active Reservations" (Figma spec).
  const hasReservation = service_type !== null
  const isActive       = res_status === 'in_progress' || res_status === 'upcoming'
  // Only dollar figure on the card is the outstanding balance (drops to 0 when paid).
  const unpaidTotal    = Number(household.unpaid_total ?? 0)
  const hasScheduledMG = household.mg_status === 'scheduled' && !!household.mg_date
  const needsAction    = household.meet_greet_status === 'requested'
  const svcColor       = service_type === 'boarding' ? COLORS.boarding
                       : service_type === 'daycare'  ? COLORS.daycare
                       : 'var(--status-no-activity)'
  const nights = hasReservation && household.dropoff_date && household.pickup_date
    ? nightsBetween(household.dropoff_date, household.pickup_date)
    : null

  const [hovered, setHovered] = React.useState(false)

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        ...s.card,
        boxShadow: hovered ? '0 6px 22px rgba(0,0,0,0.14)' : '0 0 3.5px rgba(0,0,0,0.10)',
        transform: hovered ? 'translateY(-2px)' : 'none',
      }}
    >
      {/* ── Top section: fixed height, dogs left + owner upper-right, divider below ── */}
      <div style={s.topSection}>
        <div style={s.topRow}>
          <div style={s.dogsCol}>
            {household.dogs.length > 0
              ? household.dogs.map(dog => (
                  <div key={dog.id} style={s.dogItem}>
                    {dog.photoSigned
                      ? <img src={dog.photoSigned} alt={dog.name} style={s.dogPhoto} />
                      : <div style={s.dogFallback}>🐕</div>}
                    <span style={{ ...s.dogName, color: dogNameColor(dog.gender) }} title={dog.name}>
                      {cardName(dog.name)}
                    </span>
                  </div>
                ))
              : <span style={s.noDogs}>No dogs on file</span>}
          </div>

          <div style={s.ownerCol}>
            <span style={s.ownerName}>{household.first_name} {household.last_name}</span>
            {household.phone && (
              <a href={`tel:${household.phone}`} onClick={e => e.stopPropagation()} style={s.phone}>
                {formatPhone(household.phone)}
              </a>
            )}
            {(needsAction || hasScheduledMG || blocked) && (
              <div style={s.ownerBadges}>
                {needsAction && <span style={{ ...s.pill, background: COLORS.meetGreet, color: '#fff' }}>🔔 M&amp;G requested</span>}
                {hasScheduledMG && <span style={{ ...s.pillOutline, color: COLORS.meetGreet, borderColor: COLORS.meetGreet }}>🤝 Meet &amp; Greet</span>}
                {blocked && <span style={{ ...s.pill, background: COLORS.blocked, color: '#fff' }}>Blocked</span>}
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={s.divider} />

      {/* ── Bottom section: flex-grow, content vertically centered ── */}
      <div style={s.bottomSection}>
        {isActive ? (
          <div style={s.bottomActive}>
            <div style={s.bottomLeft}>
              <span style={s.statusText}>{statusLabel(res_status)}</span>
              <div style={s.badgeRow}>
                <span style={{ ...s.svcBadge, background: svcColor }}>{serviceLabel(service_type)}</span>
                {nights !== null && nights > 14 && (
                  <span style={s.longStay} title="Stay over 14 nights — confirm custom flat rate">🌙 Long stay</span>
                )}
              </div>

              {service_type === 'daycare' ? (
                <div style={s.dateBlock}>
                  <span style={s.dateLine}>{fmtDate(household.dropoff_date!)}</span>
                  {(household.dropoff_time || household.pickup_time) && (
                    <span style={s.timeLine}>
                      {household.dropoff_time && <>{ARROW_DROPOFF} {fmtTime(household.dropoff_time)}</>}
                      {household.dropoff_time && household.pickup_time && ' – '}
                      {household.pickup_time && <>{ARROW_PICKUP} {fmtTime(household.pickup_time)}</>}
                    </span>
                  )}
                  {durationHours(household.dropoff_time, household.pickup_time) && (
                    <span style={s.subLine}>{durationHours(household.dropoff_time, household.pickup_time)} hours</span>
                  )}
                </div>
              ) : (
                <div style={s.dateBlock}>
                  <span style={s.dateLine}>
                    {fmtDate(household.dropoff_date!)}{household.dropoff_time && <> · {ARROW_DROPOFF} {fmtTime(household.dropoff_time)}</>}
                  </span>
                  {household.pickup_date && (
                    <span style={s.dateLine}>
                      {fmtDate(household.pickup_date)}{household.pickup_time && <> · {ARROW_PICKUP} {fmtTime(household.pickup_time)}</>}
                    </span>
                  )}
                  {nights !== null && nights > 0 && <span style={s.subLine}>{nights} night{nights !== 1 ? 's' : ''}</span>}
                </div>
              )}
            </div>

            {unpaidTotal > 0 && (
              <div style={s.bottomRight}>
                <span style={s.amount}>${unpaidTotal.toFixed(2)}</span>
                <span style={s.amountSub}>{household.payment_method === 'venmo' ? 'Venmo' : 'Cash'}</span>
              </div>
            )}
          </div>
        ) : (
          <div style={s.bottomInactive}>
            <span style={s.inactiveText}>
              {hasReservation ? `Last booking was ${fmtDate(household.dropoff_date!)}` : 'No Active Bookings'}
            </span>
            {unpaidTotal > 0 && <span style={s.inactiveBalance}>Balance due ${unpaidTotal.toFixed(2)}</span>}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Styles ─────────────────────────────────────────────────────
const s: Record<string, React.CSSProperties> = {
  // White card, 24px radius, soft shadow, NO border. Fixed total height so every
  // card matches regardless of dog count / content (top fixed + bottom flex).
  card:            { background: 'var(--surface)', borderRadius: 'var(--radius-card)', padding: 0, cursor: 'pointer', transition: 'all 0.18s ease', display: 'flex', flexDirection: 'column', height: 300, boxSizing: 'border-box' as const, overflow: 'hidden' },

  // Top section — fixed height; divider sits beneath it.
  topSection:      { height: 163, padding: '18px 20px 0', boxSizing: 'border-box' as const, overflow: 'hidden', flexShrink: 0 },
  divider:         { height: 1, background: '#dfdfdf', margin: '0 20px', flexShrink: 0 },

  topRow:          { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  dogsCol:         { display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0, flex: 1 },
  dogItem:         { display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 },
  dogPhoto:        { width: 42, height: 42, borderRadius: '50%', objectFit: 'cover' as const, border: '2px solid var(--border)', flexShrink: 0 },
  dogFallback:     { width: 42, height: 42, borderRadius: '50%', background: 'var(--surface-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 21, flexShrink: 0 },
  dogName:         { fontSize: 17, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0, lineHeight: 1.15 },
  noDogs:          { fontSize: 13, color: 'var(--text-secondary)' },

  // Owner info — secondary, upper-right
  ownerCol:        { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, flexShrink: 0, maxWidth: '48%', textAlign: 'right' as const },
  ownerName:       { fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' },
  phone:           { fontSize: 15, color: 'var(--status-boarding)', textDecoration: 'none', fontWeight: 600, whiteSpace: 'nowrap' },
  ownerBadges:     { display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end', marginTop: 6 },
  pill:            { display: 'inline-flex', alignItems: 'center', height: 22, fontSize: 11, fontWeight: 700, padding: '0 10px', borderRadius: 999, whiteSpace: 'nowrap', boxSizing: 'border-box', lineHeight: 1 },
  pillOutline:     { display: 'inline-flex', alignItems: 'center', height: 22, fontSize: 11, fontWeight: 700, padding: '0 10px', borderRadius: 999, border: '1.5px solid', background: 'transparent', whiteSpace: 'nowrap', boxSizing: 'border-box', lineHeight: 1 },

  // Bottom section — fills remaining height; content vertically centered.
  bottomSection:   { flex: 1, display: 'flex', alignItems: 'center', padding: '0 20px', minHeight: 0 },
  bottomActive:    { width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'nowrap' as const },
  bottomLeft:      { display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 },
  bottomInactive:  { width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, textAlign: 'center' as const },

  // Status as plain small gray text (not a pill)
  statusText:      { fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)' },
  badgeRow:        { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' as const },
  // Service type — SOLID filled pill, white text.
  svcBadge:        { display: 'inline-flex', alignItems: 'center', height: 22, fontSize: 11, fontWeight: 700, padding: '0 10px', borderRadius: 999, color: '#fff', whiteSpace: 'nowrap', boxSizing: 'border-box', lineHeight: 1 },
  longStay:        { display: 'inline-flex', alignItems: 'center', height: 22, fontSize: 11, fontWeight: 700, padding: '0 10px', borderRadius: 999, color: '#fff', background: 'var(--status-long-stay)', whiteSpace: 'nowrap', boxSizing: 'border-box', lineHeight: 1 },

  dateBlock:       { display: 'flex', flexDirection: 'column', gap: 1, marginTop: 2 },
  dateLine:        { fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' },
  timeLine:        { fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' },
  subLine:         { fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)' },

  inactiveText:    { fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500 },
  inactiveBalance: { fontSize: 13, fontWeight: 700, color: 'var(--warning)' },

  bottomRight:     { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', flexShrink: 0 },
  amount:          { fontSize: 17, fontWeight: 800, color: 'var(--text-primary)', whiteSpace: 'nowrap' as const },
  amountSub:       { fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 },
}
