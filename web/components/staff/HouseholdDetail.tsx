'use client'
import React, { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { COLORS, Household, DogRow, monthsOld, fmtDate, fmtTime } from './HouseholdCard'
import { StaffReservations } from './StaffReservations'

// 30-minute time slots (7:00 AM – 8:00 PM). Value is 24h "HH:MM" for the DB;
// label is the friendly 12h form. Only :00 and :30 are selectable.
const TIME_SLOTS: { value: string; label: string }[] = []
for (let h = 7; h <= 20; h++) {
  for (const m of [0, 30]) {
    const value  = `${String(h).padStart(2, '0')}:${m === 0 ? '00' : '30'}`
    const hour   = h > 12 ? h - 12 : h
    const period = h < 12 ? 'AM' : 'PM'
    TIME_SLOTS.push({ value, label: `${hour}:${m === 0 ? '00' : '30'} ${period}` })
  }
}

const MG_LABEL: Record<string, string> = {
  needed:    'Needed',
  requested: 'Requested',
  scheduled: 'Scheduled',
  completed: 'Completed',
}

// ── Helpers ────────────────────────────────────────────────────
function nightsBetween(dropoff: string, pickup: string): number {
  const a = new Date(dropoff + 'T00:00:00')
  const b = new Date(pickup  + 'T00:00:00')
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 86400000))
}

function fmtDateLong(ymd: string): string {
  const d = new Date(ymd + 'T00:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
}

function serviceColor(t: string | null) {
  if (t === 'boarding') return COLORS.boarding
  if (t === 'daycare')  return COLORS.daycare
  return '#9ca3af'
}
function serviceLabel(t: string | null) {
  if (t === 'boarding') return 'Boarding'
  if (t === 'daycare')  return 'Daycare'
  return '—'
}
function statusLabel(s: string | null) {
  if (s === 'in_progress') return 'In Progress'
  if (s === 'upcoming')    return 'Upcoming'
  if (s === 'completed')   return 'Completed'
  return '—'
}

// ── Sub-components ─────────────────────────────────────────────
function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={s.infoRow}>
      <dt style={s.infoLabel}>{label}</dt>
      <dd style={s.infoValue}>{value}</dd>
    </div>
  )
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={s.sectionCard}>
      <h2 style={s.sectionTitle}>{title}</h2>
      {children}
    </div>
  )
}

// ── Full client info (fetched on expand) ───────────────────────
interface ClientDetail {
  phone: string; email: string; address: string
  emergency_contact_name: string; emergency_contact_phone: string
  vet_name: string; vet_phone: string; vet_address: string
  care_notes: string
}

const SUPABASE_URL      = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// ── Props ──────────────────────────────────────────────────────
interface Props {
  household: Household
  onBack:    () => void
  onUpdate:  (updated: Household) => void
  // When rendered inside a modal: drop the full-page chrome (100vh height,
  // page background, sticky top bar) and label the back control as "Close".
  embedded?: boolean
}

export function HouseholdDetail({ household, onBack, onUpdate, embedded = false }: Props) {
  const supabase = createClient()
  const color    = serviceColor(household.service_type)

  // Local copy of reservation fields — updated optimistically after save
  const [res, setRes] = React.useState({
    dropoff_date:   household.dropoff_date   ?? '',
    pickup_date:    household.pickup_date    ?? '',
    payment_method: household.payment_method ?? 'cash',
    res_status:     household.res_status     ?? '',
    total_price:    household.total_price    ?? 0,
  })

  // Reservation edit mode
  const [editRes,      setEditRes]      = useState(false)
  const [editDropoff,  setEditDropoff]  = useState('')
  const [editPickup,   setEditPickup]   = useState('')
  const [editPayment,  setEditPayment]  = useState<'cash'|'venmo'>('cash')
  const [editReason,   setEditReason]   = useState('')
  const [resSaving,    setResSaving]    = useState(false)
  const [resErr,       setResErr]       = useState('')

  // Reservation cancellation
  const [cancelConfirm, setCancelConfirm] = useState(false)
  const [cancelling,    setCancelling]    = useState(false)
  const [cancelErr,     setCancelErr]     = useState('')

  async function cancelReservation() {
    if (!household.reservation_id) return
    setCancelling(true)
    setCancelErr('')
    // Staff are admins, so the cancellation guard trigger permits any status → cancelled
    const { error } = await supabase
      .from('reservations').update({ status: 'cancelled' }).eq('id', household.reservation_id)
    setCancelling(false)
    if (error) { setCancelErr('Could not cancel — please try again.'); return }
    setRes(r => ({ ...r, res_status: 'cancelled' }))
    onUpdate({ ...household, res_status: 'cancelled' })
    setCancelConfirm(false)
  }

  function openEditRes() {
    setEditDropoff(res.dropoff_date)
    setEditPickup(res.pickup_date)
    setEditPayment((res.payment_method as 'cash'|'venmo') ?? 'cash')
    setEditReason('')
    setResErr('')
    setEditRes(true)
  }

  async function saveReservation() {
    if (!household.reservation_id) return
    if (!editDropoff || !editPickup) { setResErr('Both dates are required.'); return }
    if (editPickup <= editDropoff)   { setResErr('Pick-up must be after drop-off.'); return }
    if (!editReason.trim())          { setResErr('A reason is required when changing dates.'); return }

    setResSaving(true)
    setResErr('')

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setResErr('Not authenticated.'); setResSaving(false); return }

    const resp = await fetch(`${SUPABASE_URL}/functions/v1/update-reservation`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${session.access_token}`,
        'apikey':        SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({
        reservation_id: household.reservation_id,
        dropoff_date:   editDropoff,
        pickup_date:    editPickup,
        payment_method: editPayment,
        reason:         editReason.trim(),
      }),
    })

    const json = await resp.json()
    if (!resp.ok) { setResErr(json.error ?? 'Save failed — try again.'); setResSaving(false); return }

    // Derive new status from updated dates (mirrors DB logic)
    const today = new Date().toISOString().slice(0, 10)
    const newStatus =
      today < editDropoff ? 'upcoming' :
      today > editPickup  ? 'completed' : 'in_progress'

    const newPrice = json.updated.total_price

    // Optimistic update — both local display and parent list
    const updatedRes = { dropoff_date: editDropoff, pickup_date: editPickup, payment_method: editPayment, res_status: newStatus, total_price: newPrice }
    setRes(updatedRes)
    onUpdate({ ...household, ...updatedRes })

    setEditRes(false)
    setResSaving(false)
  }

  // Block / unblock
  const [isBlocked,    setIsBlocked]    = useState(household.blocked)
  const [blockSaving,  setBlockSaving]  = useState(false)
  const [blockErr,     setBlockErr]     = useState('')
  const [blockConfirm, setBlockConfirm] = useState(false)

  async function toggleBlocked() {
    setBlockSaving(true)
    setBlockErr('')
    setBlockConfirm(false)

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setBlockErr('Not authenticated.'); setBlockSaving(false); return }

    const newBlocked = !isBlocked
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/toggle-client-blocked`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${session.access_token}`,
        'apikey':        SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ client_id: household.client_id, blocked: newBlocked }),
    })

    if (!resp.ok) {
      const json = await resp.json().catch(() => ({}))
      setBlockErr(json.error ?? 'Failed to update — try again.')
      setBlockSaving(false)
      return
    }

    setIsBlocked(newBlocked)
    onUpdate({ ...household, blocked: newBlocked })
    setBlockSaving(false)
  }

  // ── Meet & Greet ──
  const [mgStatus, setMgStatus] = useState(household.meet_greet_status ?? 'needed')
  const [mgId,     setMgId]     = useState(household.mg_id)
  const [mgDate,   setMgDate]   = useState(household.mg_date)
  const [mgTime,   setMgTime]   = useState(household.mg_time)
  const [schedDate,  setSchedDate]  = useState('')
  const [schedTime,  setSchedTime]  = useState('')
  const [mgSaving,   setMgSaving]   = useState(false)
  const [mgErr,      setMgErr]      = useState('')

  async function scheduleMeetGreet() {
    if (!schedDate || !schedTime) { setMgErr('Pick a date and time.'); return }
    setMgSaving(true)
    setMgErr('')
    const { data, error } = await supabase.rpc('schedule_meet_greet', {
      p_client_id: household.client_id,
      p_date:      schedDate,
      p_time:      schedTime,
    })
    setMgSaving(false)
    if (error) { setMgErr(error.message ?? 'Failed to schedule — try again.'); return }
    setMgId(data as string)
    setMgDate(schedDate)
    setMgTime(schedTime)
    setMgStatus('scheduled')
    onUpdate({ ...household, meet_greet_status: 'scheduled', mg_id: data as string, mg_date: schedDate, mg_time: schedTime, mg_status: 'scheduled' })
  }

  async function completeMeetGreet() {
    if (!mgId) return
    setMgSaving(true)
    setMgErr('')
    const { error } = await supabase.rpc('complete_meet_greet', { p_meet_greet_id: mgId })
    setMgSaving(false)
    if (error) { setMgErr(error.message ?? 'Failed to complete — try again.'); return }
    setMgStatus('completed')
    onUpdate({ ...household, meet_greet_status: 'completed', mg_status: 'completed' })
  }

  // Direct "completed" override — works from ANY status, no schedule required.
  // Staff are admins, so the clients.meet_greet_status guard trigger permits it.
  async function toggleMeetGreetCompleted() {
    const next = mgStatus === 'completed' ? 'needed' : 'completed'
    setMgSaving(true)
    setMgErr('')
    const { error } = await supabase
      .from('clients').update({ meet_greet_status: next }).eq('id', household.client_id)
    setMgSaving(false)
    if (error) { setMgErr('Could not update — please try again.'); return }
    setMgStatus(next)
    onUpdate({ ...household, meet_greet_status: next })
  }

  // Client detail (lazy-loaded)
  const [detail, setDetail] = useState<ClientDetail | null>(null)

  // Staff notes
  const [note,    setNote]    = useState(household.staff_note ?? '')
  const [saved,   setSaved]   = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [saveErr, setSaveErr] = useState('')

  // Load full client info on mount
  React.useEffect(() => {
    supabase.rpc('get_client_detail', { p_client_id: household.client_id })
      .then(({ data }) => { if (data?.[0]) setDetail(data[0]) })
  }, [household.client_id]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleNoteChange(v: string) {
    setNote(v)
    setSaved(false)
    setSaveErr('')
  }

  async function handleSave() {
    setSaving(true)
    setSaveErr('')
    const { error } = await supabase
      .from('staff_notes')
      .upsert({ client_id: household.client_id, note, updated_at: new Date().toISOString() },
               { onConflict: 'client_id' })
    setSaving(false)
    if (error) { setSaveErr('Save failed — try again.'); return }
    setSaved(true)
  }

  const hasRes  = household.service_type !== null
  const nights  = hasRes && household.service_type === 'boarding' && res.dropoff_date && res.pickup_date
    ? nightsBetween(res.dropoff_date, res.pickup_date)
    : null

  return (
    <div style={embedded ? s.pageEmbedded : s.page}>
      {/* ── Top bar ── */}
      <div style={{ ...(embedded ? s.topBarEmbedded : s.topBar), borderTopColor: color }}>
        <div style={embedded ? s.topBarInnerEmbedded : s.topBarInner}>
          <button type="button" onClick={onBack} style={s.backBtn}>
            {embedded ? '✕ Close' : '← Back to dashboard'}
          </button>
          <div style={s.titleRow}>
            <h1 style={s.ownerName}>{household.first_name} {household.last_name}</h1>
            <div style={s.badgesRow}>
              {hasRes && (
                <span style={{ ...s.badge, borderColor: color, color }}>
                  {serviceLabel(household.service_type)}
                </span>
              )}
              <span style={s.statusBadge}>
                {statusLabel(res.res_status)}
              </span>
              {isBlocked && (
                <span style={{ ...s.badge, background: COLORS.blocked, color: '#fff', borderColor: COLORS.blocked }}>
                  Blocked
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div style={embedded ? s.bodyEmbedded : s.body}>
        {/* ── Care notes (feeding / medication) — prominent for staff reference ── */}
        <div style={s.careCard}>
          <div style={s.careHeader}>
            <span style={s.careIcon}>📋</span>
            <h2 style={s.careTitle}>Care notes</h2>
            <span style={s.careHint}>feeding &amp; medication</span>
          </div>
          {detail
            ? (detail.care_notes?.trim()
                ? <p style={s.careBody}>{detail.care_notes}</p>
                : <p style={s.careEmpty}>No care notes on file for this household.</p>)
            : <p style={s.careEmpty}>Loading…</p>
          }
        </div>

        {/* ── Client information ── */}
        <SectionCard title="Client Information">
          {detail ? (
            <dl style={s.infoGrid}>
              <InfoRow label="Phone"             value={detail.phone} />
              <InfoRow label="Email"             value={detail.email} />
              <InfoRow label="Address"           value={detail.address} />
              <InfoRow label="Emergency contact" value={`${detail.emergency_contact_name} · ${detail.emergency_contact_phone}`} />
              <InfoRow label="Veterinarian"      value={detail.vet_name} />
              <InfoRow label="Vet phone"         value={detail.vet_phone} />
              <InfoRow label="Vet address"       value={detail.vet_address} />
            </dl>
          ) : (
            <p style={{ color: '#9ca3af', fontSize: 13 }}>Loading…</p>
          )}
        </SectionCard>

        {/* ── Meet & Greet ── */}
        <div style={{ ...s.sectionCard, borderLeft: `4px solid ${COLORS.meetGreet}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
            <h2 style={{ ...s.sectionTitle, margin: 0 }}>Meet &amp; Greet</h2>
            <span style={{
              ...s.badge,
              borderColor: COLORS.meetGreet,
              color: mgStatus === 'completed' ? '#fff' : COLORS.meetGreet,
              background: mgStatus === 'completed' ? COLORS.meetGreet : 'transparent',
            }}>
              {MG_LABEL[mgStatus] ?? mgStatus}
            </span>
          </div>

          {mgStatus === 'needed' && (
            <p style={{ margin: 0, fontSize: 13, color: '#6b7280' }}>
              This client hasn&apos;t requested a Meet &amp; Greet yet. They must complete one before booking.
            </p>
          )}

          {mgStatus === 'requested' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={{ margin: 0, fontSize: 13, color: '#374151' }}>
                📨 This client has <strong>requested</strong> a Meet &amp; Greet. Pick a date and time to schedule it.
              </p>
              <div style={s.editRow}>
                <label style={s.editLabel}>
                  Date
                  <input type="date" value={schedDate} onChange={e => setSchedDate(e.target.value)} style={s.editInput} />
                </label>
                <label style={s.editLabel}>
                  Time
                  <select value={schedTime} onChange={e => setSchedTime(e.target.value)} style={s.editInput}>
                    <option value="">Select a time…</option>
                    {TIME_SLOTS.map(slot => (
                      <option key={slot.value} value={slot.value}>{slot.label}</option>
                    ))}
                  </select>
                </label>
              </div>
              <p style={{ margin: 0, fontSize: 12, color: '#9ca3af' }}>Duration is 30 minutes.</p>
              {mgErr && <p style={{ margin: 0, fontSize: 13, color: '#ef4444' }}>{mgErr}</p>}
              <div>
                <button type="button" onClick={scheduleMeetGreet} disabled={mgSaving}
                  style={{ ...s.saveBtn, background: mgSaving ? '#e5e7eb' : COLORS.meetGreet, color: mgSaving ? '#9ca3af' : '#fff', cursor: mgSaving ? 'not-allowed' : 'pointer' }}>
                  {mgSaving ? 'Scheduling…' : 'Schedule Meet & Greet'}
                </button>
              </div>
            </div>
          )}

          {mgStatus === 'scheduled' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={{ margin: 0, fontSize: 14, color: '#111827', fontWeight: 600 }}>
                📅 {mgDate ? fmtDateLong(mgDate) : 'Scheduled'}{mgTime ? ` at ${fmtTime(mgTime)}` : ''} · 30 min
              </p>
              {mgErr && <p style={{ margin: 0, fontSize: 13, color: '#ef4444' }}>{mgErr}</p>}
              <div>
                <button type="button" onClick={completeMeetGreet} disabled={mgSaving}
                  style={{ ...s.saveBtn, background: mgSaving ? '#e5e7eb' : '#16a34a', color: mgSaving ? '#9ca3af' : '#fff', cursor: mgSaving ? 'not-allowed' : 'pointer' }}>
                  {mgSaving ? 'Saving…' : '✓ Mark as Completed'}
                </button>
              </div>
            </div>
          )}

          {mgStatus === 'completed' && (
            <p style={{ margin: 0, fontSize: 13, color: '#15803d', fontWeight: 600 }}>
              ✅ Meet &amp; Greet complete — this client can book.
            </p>
          )}

          {/* ── Direct override: mark completed from any status ── */}
          <div style={s.mgToggleRow}>
            <div>
              <p style={s.mgToggleLabel}>Meet &amp; Greet Completed</p>
              <p style={s.mgToggleHint}>
                Override at any time — flips status straight to completed (no scheduling needed), or back to needed.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={mgStatus === 'completed'}
              onClick={toggleMeetGreetCompleted}
              disabled={mgSaving}
              style={{
                ...s.toggle,
                background: mgStatus === 'completed' ? '#16a34a' : '#d1d5db',
                cursor: mgSaving ? 'not-allowed' : 'pointer',
                opacity: mgSaving ? 0.6 : 1,
              }}
            >
              <span style={{ ...s.toggleKnob, transform: mgStatus === 'completed' ? 'translateX(20px)' : 'translateX(0)' }} />
            </button>
          </div>
        </div>

        {/* ── Reservations (all of them) + staff create ── */}
        <div style={s.sectionCard}>
          <StaffReservations
            clientId={household.client_id}
            dogs={household.dogs.map((d: DogRow) => ({ id: d.id, name: d.name, birthdate: d.birthdate }))}
            meetGreetCompleted={mgStatus === 'completed'}
            onChanged={() => onUpdate(household)}
          />
        </div>

        {/* ── Dogs ── */}
        <div>
          <h2 style={s.sectionTitle}>
            {household.dogs.length === 1 ? 'Dog' : 'Dogs'}
          </h2>
          <div style={s.dogGrid}>
            {household.dogs.map((dog: DogRow) => {
              const isPuppy = monthsOld(dog.birthdate) < 12
              return (
                <div key={dog.id} style={{ ...s.dogCard, borderColor: color }}>
                  {dog.photoSigned
                    ? <img src={dog.photoSigned} alt={dog.name} style={s.dogPhoto} />
                    : <div style={s.dogAvatar}>🐕</div>
                  }
                  <p style={s.dogCardName}>{dog.name}</p>
                  <p style={s.dogCardBirth}>{fmtDate(dog.birthdate)}</p>
                  {dog.gender
                    ? <p style={s.dogGender}>{dog.gender === 'male' ? '♂ Male' : '♀ Female'}</p>
                    : <p style={{ ...s.dogGender, color: '#f59e0b' }}>Gender not set</p>
                  }
                  {isPuppy && <span style={s.puppyBadge}>🐾 Puppy</span>}
                </div>
              )
            })}
          </div>
        </div>

        {/* ── Block / unblock ── */}
        <div style={{ ...s.sectionCard, background: isBlocked ? '#fff7f7' : '#fff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2 style={{ ...s.sectionTitle, margin: 0 }}>Client access</h2>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: '#6b7280' }}>
                {isBlocked
                  ? 'This client is blocked — they cannot submit new reservations.'
                  : 'This client can submit new reservations.'}
              </p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
              {!blockConfirm ? (
                <button
                  type="button"
                  onClick={() => setBlockConfirm(true)}
                  disabled={blockSaving}
                  style={{
                    ...s.blockBtn,
                    background: isBlocked ? '#16a34a' : '#dc2626',
                    opacity: blockSaving ? 0.6 : 1,
                    cursor: blockSaving ? 'not-allowed' : 'pointer',
                  }}
                >
                  {blockSaving ? 'Saving…' : isBlocked ? 'Unblock Client' : 'Block Client'}
                </button>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
                  <span style={{ fontSize: 13, color: '#374151', fontWeight: 500 }}>
                    {isBlocked ? 'Allow this client to book again?' : 'Block this client from booking?'}
                  </span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button" onClick={toggleBlocked}
                      style={{ ...s.blockBtn, background: isBlocked ? '#16a34a' : '#dc2626', cursor: 'pointer' }}>
                      {isBlocked ? 'Yes, Unblock' : 'Yes, Block'}
                    </button>
                    <button type="button" onClick={() => setBlockConfirm(false)} style={s.cancelEditBtn}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}
              {blockErr && <span style={{ fontSize: 12, color: '#dc2626' }}>{blockErr}</span>}
            </div>
          </div>
        </div>

        {/* ── Staff notes ── */}
        <div style={{ ...s.sectionCard, background: '#fafafa' }}>
          <div style={s.notesHeader}>
            <div style={s.notesLeft}>
              <span style={s.lockIcon}>🔒</span>
              <h2 style={s.sectionTitle}>Staff notes</h2>
              <span style={s.notesHint}>(not visible to client)</span>
            </div>
            <div style={s.notesActions}>
              {!saved && <span style={s.unsavedText}>Unsaved changes</span>}
              {saveErr && <span style={{ ...s.unsavedText, color: COLORS.blocked }}>{saveErr}</span>}
              <button
                type="button"
                onClick={handleSave}
                disabled={saved || saving}
                style={{
                  ...s.saveBtn,
                  background: saved || saving ? '#e5e7eb' : color,
                  color:      saved || saving ? '#9ca3af' : '#fff',
                  cursor:     saved || saving ? 'not-allowed' : 'pointer',
                }}
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
          <textarea
            value={note}
            onChange={e => handleNoteChange(e.target.value)}
            placeholder="Add private staff notes here…"
            rows={4}
            style={{ ...s.notesTextarea, outlineColor: color }}
          />
        </div>
      </div>
    </div>
  )
}

// ── Styles ─────────────────────────────────────────────────────
const s: Record<string, React.CSSProperties> = {
  page:          { minHeight: '100vh', background: 'var(--page-bg)' },
  pageEmbedded:  { background: 'var(--page-bg)' },
  topBar:        { background: '#fff', borderBottom: '1px solid #e5e7eb', borderTop: '3px solid', marginBottom: 0 },
  topBarEmbedded:{ background: '#fff', borderBottom: '1px solid #e5e7eb', borderTop: '3px solid', position: 'sticky', top: 0, zIndex: 2, borderTopLeftRadius: 14, borderTopRightRadius: 14 },
  topBarInner:   { maxWidth: 860, margin: '0 auto', padding: '20px 24px 24px' },
  topBarInnerEmbedded: { padding: '18px 22px 20px' },
  backBtn:       { background: 'none', border: 'none', color: '#6b7280', fontSize: 13, cursor: 'pointer', padding: 0, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 },
  titleRow:      { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10 },
  ownerName:     { margin: 0, fontSize: 26, fontWeight: 800, color: '#111827' },
  badgesRow:     { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
  badge:         { fontSize: 12, fontWeight: 700, padding: '4px 12px', borderRadius: 20, border: '1.5px solid', background: 'transparent' },
  statusBadge:   { fontSize: 12, fontWeight: 600, padding: '4px 12px', borderRadius: 20, background: '#f3f4f6', color: '#374151' },
  body:          { maxWidth: 860, margin: '0 auto', padding: '32px 24px', display: 'flex', flexDirection: 'column', gap: 24 },
  bodyEmbedded:  { padding: '22px', display: 'flex', flexDirection: 'column', gap: 20 },
  // Care notes — prominent, never truncated
  careCard:      { background: '#fffbeb', border: '1px solid #fde68a', borderLeft: '4px solid #f59e0b', borderRadius: 12, padding: '18px 22px' },
  careHeader:    { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 },
  careIcon:      { fontSize: 16 },
  careTitle:     { margin: 0, fontSize: 15, fontWeight: 700, color: '#92400e' },
  careHint:      { fontSize: 12, color: '#b45309', fontStyle: 'italic' },
  careBody:      { margin: 0, fontSize: 15, color: '#1f2937', lineHeight: 1.7, whiteSpace: 'pre-wrap' },
  careEmpty:     { margin: 0, fontSize: 14, color: '#9ca3af', fontStyle: 'italic' },
  sectionCard:   { background: '#fff', borderRadius: 12, padding: '22px 24px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid #f3f4f6' },
  sectionTitle:  { margin: '0 0 16px', fontSize: 15, fontWeight: 700, color: '#111827' },
  infoGrid:      { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 24px', margin: 0, padding: 0 },
  infoRow:       { display: 'contents' },
  infoLabel:     { fontSize: 13, color: '#6b7280', fontWeight: 400, alignSelf: 'start', paddingTop: 1 },
  infoValue:     { fontSize: 13, fontWeight: 600, color: '#111827', margin: 0 },
  dogGrid:       { display: 'flex', flexWrap: 'wrap', gap: 16 },
  dogCard:       { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '20px 24px', borderRadius: 12, border: '1.5px solid', background: '#fff', minWidth: 120, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' },
  dogAvatar:     { fontSize: 40, lineHeight: 1 },
  dogCardName:   { margin: 0, fontWeight: 700, fontSize: 15, color: '#111827' },
  dogCardBirth:  { margin: 0, fontSize: 12, color: '#9ca3af' },
  dogPhoto:      { width: 80, height: 80, borderRadius: 10, objectFit: 'cover' as const, border: '2px solid #e5e7eb' },
  dogGender:     { margin: 0, fontSize: 12, color: '#6b7280' },
  puppyBadge:    { fontSize: 11, fontWeight: 700, background: '#fef3c7', color: '#92400e', padding: '3px 10px', borderRadius: 10 },
  notesHeader:   { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' },
  notesLeft:     { display: 'flex', alignItems: 'center', gap: 8 },
  lockIcon:      { fontSize: 14 },
  notesHint:     { fontSize: 12, color: '#9ca3af' },
  notesActions:  { display: 'flex', alignItems: 'center', gap: 12 },
  unsavedText:   { fontSize: 12, color: '#6b7280' },
  saveBtn:       { fontSize: 13, fontWeight: 600, padding: '6px 16px', borderRadius: 8, border: 'none', transition: 'background 0.15s' },
  notesTextarea:  { width: '100%', borderRadius: 8, border: '1px solid #e5e7eb', padding: '10px 12px', fontSize: 13, lineHeight: 1.6, fontFamily: 'inherit', resize: 'vertical', background: '#fff', color: '#111827', boxSizing: 'border-box', outline: '2px solid transparent', transition: 'outline 0.15s' },
  editBtn:        { fontSize: 12, fontWeight: 600, padding: '5px 14px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', color: '#374151', cursor: 'pointer', fontFamily: 'inherit' },
  cancelBtn:      { fontSize: 12, fontWeight: 600, padding: '5px 14px', borderRadius: 8, border: '1px solid #fecdd3', background: '#fff', color: '#be123c', cursor: 'pointer', fontFamily: 'inherit' },
  mgToggleRow:    { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginTop: 16, paddingTop: 16, borderTop: '1px solid #f3f4f6' },
  mgToggleLabel:  { margin: 0, fontSize: 14, fontWeight: 700, color: '#111827' },
  mgToggleHint:   { margin: '3px 0 0', fontSize: 12, color: '#6b7280', lineHeight: 1.5, maxWidth: 460 },
  toggle:         { position: 'relative', width: 44, height: 24, borderRadius: 999, border: 'none', padding: 0, flexShrink: 0, transition: 'background 0.15s', fontFamily: 'inherit' },
  toggleKnob:     { position: 'absolute', top: 2, left: 2, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'transform 0.15s', boxShadow: '0 1px 2px rgba(0,0,0,0.2)' },
  cancelYes:      { fontSize: 12, fontWeight: 600, padding: '5px 12px', borderRadius: 8, border: 'none', background: '#be123c', color: '#fff', cursor: 'pointer', fontFamily: 'inherit' },
  cancelNo:       { fontSize: 12, fontWeight: 600, padding: '5px 12px', borderRadius: 8, border: 'none', background: '#f3f4f6', color: '#374151', cursor: 'pointer', fontFamily: 'inherit' },
  blockBtn:       { fontSize: 13, fontWeight: 600, padding: '7px 16px', borderRadius: 8, border: 'none', color: '#fff', fontFamily: 'inherit', transition: 'opacity 0.15s' },
  editRow:        { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  editLabel:      { display: 'flex', flexDirection: 'column' as const, gap: 4, fontSize: 12, fontWeight: 600, color: '#374151' },
  editInput:      { fontSize: 13, padding: '7px 10px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', color: '#111827', fontFamily: 'inherit', marginTop: 2, width: '100%', boxSizing: 'border-box' as const },
  cancelEditBtn:  { fontSize: 13, fontWeight: 600, padding: '6px 16px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', color: '#374151', cursor: 'pointer', fontFamily: 'inherit' },
}
