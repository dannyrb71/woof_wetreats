'use client'
import React from 'react'
import { DogAvatar } from './DogAvatar'

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
  pickup_date:       string | null
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
        background: blocked ? '#fff8f8' : '#fff',
      }}
    >
      {/* ── Client name + phone ── */}
      <div style={s.clientRow}>
        <div style={s.clientLeft}>
          <h3 style={s.ownerName}>
            {needsAction && (
              <span style={s.actionFlag} title="Meet & Greet requested — needs scheduling">🔔</span>
            )}
            {household.first_name} {household.last_name}
          </h3>
          {household.phone && (
            <a
              href={`tel:${household.phone}`}
              onClick={e => e.stopPropagation()}
              style={s.phone}
            >
              {household.phone}
            </a>
          )}
        </div>
        <div style={s.badgeCol}>
          {hasReservation && (
            <span style={{ ...s.badge, borderColor: svcColor, color: svcColor }}>
              {serviceLabel(service_type)}
            </span>
          )}
          {nights !== null && nights > 14 && (
            <span style={{ ...s.badge, background: '#7c3aed', color: '#fff', borderColor: '#7c3aed' }}
              title="Stay over 14 nights — confirm custom flat rate">
              🌙 Long stay
            </span>
          )}
          {needsAction && (
            <span style={{ ...s.badge, background: COLORS.meetGreet, color: '#fff', borderColor: COLORS.meetGreet }}>
              🔔 M&amp;G requested
            </span>
          )}
          {hasScheduledMG && (
            <span style={{ ...s.badge, borderColor: COLORS.meetGreet, color: COLORS.meetGreet }}>
              🤝 Meet &amp; Greet
            </span>
          )}
          {blocked && (
            <span style={{ ...s.badge, background: COLORS.blocked, color: '#fff', borderColor: COLORS.blocked }}>
              Blocked
            </span>
          )}
        </div>
      </div>

      {/* ── Dog photos ── */}
      <div style={s.dogRow}>
        {household.dogs.length > 0
          ? household.dogs.map(dog => (
              <DogAvatar
                key={dog.id}
                name={dog.name}
                photoSigned={dog.photoSigned}
                gender={dog.gender}
                isPuppy={monthsOld(dog.birthdate) < 12}
              />
            ))
          : <span style={{ fontSize: 13, color: '#9ca3af' }}>No dogs on file</span>
        }
      </div>

      {/* ── Meet & Greet flag (orange) ── */}
      {hasScheduledMG && (
        <div style={s.mgStrip}>
          <span style={s.mgFlag}>🤝 Meet &amp; Greet</span>
          <span style={s.mgDate}>
            {fmtDate(household.mg_date!)}{household.mg_time ? ` · ${fmtTime(household.mg_time)}` : ''}
          </span>
        </div>
      )}

      {/* ── Reservation strip ── */}
      {hasReservation ? (
        <div style={s.resStrip}>
          <div style={s.resLeft}>
            <span style={{
              ...s.statusPill,
              background: res_status === 'in_progress' ? '#dcfce7'
                        : res_status === 'upcoming'    ? '#eff6ff'
                        : '#f3f4f6',
              color:      res_status === 'in_progress' ? '#15803d'
                        : res_status === 'upcoming'    ? '#1d4ed8'
                        : '#374151',
            }}>
              {statusLabel(res_status)}
            </span>
            <span style={s.dates}>
              {fmtDate(household.dropoff_date!)}
              {nights !== null && nights > 0 && (
                <> · {nights} night{nights !== 1 ? 's' : ''}</>
              )}
            </span>
          </div>
          {/* Financial: show the outstanding balance only. Once every booking is
              paid this is 0 → no dollar amount appears. */}
          {unpaidTotal > 0 && (
            <span style={s.balanceDue}>Balance due ${unpaidTotal.toFixed(2)}</span>
          )}
        </div>
      ) : (
        <p style={{ fontSize: 13, color: '#9ca3af', margin: '12px 0 0' }}>No active reservation</p>
      )}

      {/* ── Staff note preview ── */}
      {household.staff_note && (
        <p style={s.notePreview}>📝 {household.staff_note}</p>
      )}
    </div>
  )
}

// ── Styles ─────────────────────────────────────────────────────
const s: Record<string, React.CSSProperties> = {
  card:            { borderRadius: 14, border: '2px solid', padding: '18px 20px', cursor: 'pointer', transition: 'all 0.18s ease', display: 'flex', flexDirection: 'column', gap: 0 },

  // Client header
  clientRow:       { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 16 },
  clientLeft:      { display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 },
  ownerName:       { margin: 0, fontSize: 16, fontWeight: 700, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  phone:           { fontSize: 13, color: '#2563eb', textDecoration: 'none', fontWeight: 500 },
  badgeCol:        { display: 'flex', flexDirection: 'column', gap: 5, alignItems: 'flex-end', flexShrink: 0 },
  badge:           { fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 20, border: '1.5px solid', letterSpacing: '0.02em', background: 'transparent', whiteSpace: 'nowrap' },

  // Dogs (avatar size/style lives in the shared DogAvatar component)
  dogRow:          { display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16 },

  // Reservation strip
  resStrip:        { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, paddingTop: 12, borderTop: '1px solid #f3f4f6', flexWrap: 'wrap' as const },
  resLeft:         { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' as const },
  statusPill:      { fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10, whiteSpace: 'nowrap' as const },
  dates:           { fontSize: 12, color: '#6b7280' },
  price:           { fontSize: 15, fontWeight: 700, color: '#111827', whiteSpace: 'nowrap' as const },
  balanceDue:      { fontSize: 13, fontWeight: 700, color: '#b45309', whiteSpace: 'nowrap' as const },

  notePreview:     { margin: '10px 0 0', fontSize: 12, color: '#6b7280', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontStyle: 'italic' },

  // Meet & Greet flag (orange)
  mgStrip:         { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, padding: '7px 12px', marginBottom: 12, flexWrap: 'wrap' as const },
  mgFlag:          { fontSize: 12, fontWeight: 700, color: COLORS.meetGreet },
  actionFlag:      { marginRight: 6, fontSize: 15, verticalAlign: 'middle' },
  mgDate:          { fontSize: 12, fontWeight: 600, color: '#9a3412' },
}
