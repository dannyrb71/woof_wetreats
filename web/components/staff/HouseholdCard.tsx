'use client'
import React from 'react'

// ── Theme tokens ───────────────────────────────────────────────
export const COLORS = {
  boarding:  '#0058A0',
  daycare:   '#C5A92B',
  blocked:   '#C52B2D',
  meetGreet: '#EA580C', // orange
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
  if (status === 'cancelled' || status === 'completed') return '#9ca3af'
  if (status === 'in_progress') return '#16a34a'
  if (serviceType === 'boarding') return COLORS.boarding
  if (serviceType === 'daycare')  return COLORS.daycare
  return '#9ca3af'
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

// Format a raw phone string as (XXX) XXX-XXXX when it's a 10-digit US number
// (or 11 with a leading 1); otherwise return it unchanged.
function fmtPhone(raw: string | null): string {
  if (!raw) return ''
  let d = raw.replace(/\D/g, '')
  if (d.length === 11 && d.startsWith('1')) d = d.slice(1)
  if (d.length !== 10) return raw
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`
}

// Dog name color by gender (icons removed). Boys blue, girls magenta,
// unknown a neutral dark so it never miscolors.
function dogNameColor(gender: string | null): string {
  if (gender === 'male')   return '#2140AF'
  if (gender === 'female') return '#AE08A1'
  return '#111827'
}

// Compact-card name truncation (>8 chars → ellipsis). Full name still shows in
// the detail view / modal — this is for the card only.
function cardName(name: string): string {
  return name.length > 8 ? `${name.slice(0, 8).trimEnd()}…` : name
}

// Reuse the Daily Schedule arrival/departure arrow glyphs for drop-off/pick-up.
const ARROW_DROPOFF = '⬇'
const ARROW_PICKUP  = '⬆'

// ── Component ──────────────────────────────────────────────────
interface Props {
  household: Household
  onClick:   () => void
}

export function HouseholdCard({ household, onClick }: Props) {
  const { service_type, res_status, blocked } = household
  // EVERY client always shows a card with its most-relevant reservation
  // (latest completed / in-progress / next upcoming). Nothing about completion
  // hides the card or fades it — that treatment lives only on the Daily Schedule.
  const hasReservation = service_type !== null
  // "Active" = something current or ahead. A client whose only booking is in the
  // past (completed) is INACTIVE: no service tag, muted card, "Last booking was…".
  const isActive       = res_status === 'in_progress' || res_status === 'upcoming'
  // Financial info hides per-reservation once paid: the only dollar figure on the
  // card is the client's outstanding balance, which drops to 0 when all is paid.
  const unpaidTotal    = Number(household.unpaid_total ?? 0)
  const hasScheduledMG = household.mg_status === 'scheduled' && !!household.mg_date
  // Staff action needed: client requested a Meet & Greet that isn't scheduled yet
  const needsAction    = household.meet_greet_status === 'requested'
  // M&G border only when there's no active reservation to color the card
  const border         = !hasReservation && hasScheduledMG
    ? COLORS.meetGreet
    : strokeColor(res_status, service_type)
  const svcColor       = service_type === 'boarding' ? COLORS.boarding
                       : service_type === 'daycare'  ? COLORS.daycare
                       : '#9ca3af'
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
        borderColor: border,
        boxShadow: hovered ? '0 8px 32px rgba(0,0,0,0.13)' : '0 2px 12px rgba(0,0,0,0.07)',
        transform: hovered ? 'translateY(-2px)' : 'none',
        background: blocked ? '#fff8f8' : (isActive ? '#fff' : 'var(--surface-muted)'),
      }}
    >
      {/* ── Top: dogs stacked (prominent) on the left, owner info upper-right ── */}
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
              {fmtPhone(household.phone)}
            </a>
          )}
          {(needsAction || hasScheduledMG || blocked) && (
            <div style={s.ownerBadges}>
              {needsAction && (
                <span style={{ ...s.badge, background: COLORS.meetGreet, color: '#fff', borderColor: COLORS.meetGreet }}>🔔 M&amp;G requested</span>
              )}
              {hasScheduledMG && (
                <span style={{ ...s.badge, borderColor: COLORS.meetGreet, color: COLORS.meetGreet }}>🤝 Meet &amp; Greet</span>
              )}
              {blocked && (
                <span style={{ ...s.badge, background: COLORS.blocked, color: '#fff', borderColor: COLORS.blocked }}>Blocked</span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Staff note preview (sits above the bottom-anchored footer) ── */}
      {household.staff_note && (
        <p style={s.notePreview}>📝 {household.staff_note}</p>
      )}

      {/* ── Footer: status + service badge + date/time (left), money (right) ── */}
      <div style={s.footer}>
        <div style={s.footerLeft}>
          {isActive ? (
            <>
              <div style={s.footerBadges}>
                <span style={{
                  ...s.statusPill,
                  background: res_status === 'in_progress' ? '#dcfce7' : '#eff6ff',
                  color:      res_status === 'in_progress' ? '#15803d' : '#1d4ed8',
                }}>
                  {statusLabel(res_status)}
                </span>
                <span style={{ ...s.badge, borderColor: svcColor, color: svcColor }}>{serviceLabel(service_type)}</span>
                {nights !== null && nights > 14 && (
                  <span style={{ ...s.badge, background: '#7c3aed', color: '#fff', borderColor: '#7c3aed' }}
                    title="Stay over 14 nights — confirm custom flat rate">🌙 Long stay</span>
                )}
              </div>
              {service_type === 'daycare' ? (
                // Daycare: single date + drop-off/pick-up times with ⬇/⬆ arrows.
                <div style={s.dateTime}>
                  <span style={s.dateText}>{fmtDate(household.dropoff_date!)}</span>
                  <span style={s.timeRow}>
                    {household.dropoff_time && <span>{ARROW_DROPOFF} {fmtTime(household.dropoff_time)}</span>}
                    {household.pickup_time  && <span>{ARROW_PICKUP} {fmtTime(household.pickup_time)}</span>}
                  </span>
                </div>
              ) : (
                <div style={s.dateTime}>
                  <span style={s.dateText}>
                    {fmtDate(household.dropoff_date!)}
                    {nights !== null && nights > 0 && <> · {nights} night{nights !== 1 ? 's' : ''}</>}
                  </span>
                </div>
              )}
            </>
          ) : (
            // Inactive (Batch 5 logic preserved): last booking date / no bookings.
            <span style={s.inactiveText}>
              {hasReservation
                ? `Last booking was ${fmtDate(household.dropoff_date!)}`
                : 'No bookings yet'}
            </span>
          )}
        </div>

        {/* Financial (Batch 5 logic): outstanding balance only — hidden when paid. */}
        {unpaidTotal > 0 && (
          <div style={s.footerRight}>
            <span style={s.amount}>${unpaidTotal.toFixed(2)}</span>
            {isActive && household.payment_method
              ? <span style={s.amountSub}>{household.payment_method === 'cash' ? 'Cash' : 'Venmo'}</span>
              : <span style={s.amountSub}>Balance due</span>}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Styles ─────────────────────────────────────────────────────
const s: Record<string, React.CSSProperties> = {
  // Fixed height sized to comfortably fit 3 dog rows (our max per household) +
  // the bottom block, so every card is the same height regardless of dog count.
  card:            { borderRadius: 14, border: '2px solid', padding: '18px 20px', cursor: 'pointer', transition: 'all 0.18s ease', display: 'flex', flexDirection: 'column', gap: 0, height: 300, boxSizing: 'border-box' as const, overflow: 'hidden' },

  // Top: dogs (left, prominent) + owner (upper-right, secondary)
  topRow:          { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 14 },
  dogsCol:         { display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0, flex: 1 },
  dogItem:         { display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 },
  dogPhoto:        { width: 44, height: 44, borderRadius: '50%', objectFit: 'cover' as const, border: '2px solid #e5e7eb', flexShrink: 0 },
  dogFallback:     { width: 44, height: 44, borderRadius: '50%', background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 },
  // Pets stay the most prominent text (gender-colored), but balanced — not oversized.
  dogName:         { fontSize: 17, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0, lineHeight: 1.15 },
  noDogs:          { fontSize: 13, color: '#9ca3af' },

  // Owner info — secondary, upper-right
  ownerCol:        { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, flexShrink: 0, maxWidth: '46%', textAlign: 'right' as const },
  ownerName:       { fontSize: 15, fontWeight: 600, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' },
  phone:           { fontSize: 14, color: '#2563eb', textDecoration: 'none', fontWeight: 600, whiteSpace: 'nowrap' },
  ownerBadges:     { display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end', marginTop: 6 },
  badge:           { fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 20, border: '1.5px solid', letterSpacing: '0.02em', background: 'transparent', whiteSpace: 'nowrap' },

  // Meet & Greet scheduled strip (orange)
  mgStrip:         { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, padding: '7px 12px', marginBottom: 12, flexWrap: 'wrap' as const },
  mgFlag:          { fontSize: 12, fontWeight: 700, color: COLORS.meetGreet },
  mgDate:          { fontSize: 12, fontWeight: 600, color: '#9a3412' },

  // Footer: status + service badge + date/time (left), money (right)
  // marginTop:auto anchors the bottom block flush to the card bottom, with the
  // dog list filling the space above — consistent across 1-, 2-, and 3-dog cards.
  // No wrap: keep the amount pinned bottom-right. The left column flexes/shrinks
  // (badges wrap within it) so a wide badge row never pushes the price to a new line.
  footer:          { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 10, marginTop: 'auto', paddingTop: 12, borderTop: '1px solid #f3f4f6', flexWrap: 'nowrap' as const },
  footerLeft:      { display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0, flex: 1 },
  footerBadges:    { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' as const },
  statusPill:      { fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10, whiteSpace: 'nowrap' as const },
  dateTime:        { display: 'flex', flexDirection: 'column', gap: 2 },
  dateText:        { fontSize: 14, fontWeight: 700, color: '#111827' },
  timeRow:         { display: 'flex', gap: 14, fontSize: 13, fontWeight: 600, color: '#374151' },
  inactiveText:    { fontSize: 13, color: '#9ca3af', fontWeight: 500 },
  footerRight:     { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', flexShrink: 0 },
  amount:          { fontSize: 15, fontWeight: 700, color: '#111827', whiteSpace: 'nowrap' as const },
  amountSub:       { fontSize: 12, color: '#6b7280', fontWeight: 600 },

  notePreview:     { margin: '10px 0 0', fontSize: 12, color: '#6b7280', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontStyle: 'italic' },
}
