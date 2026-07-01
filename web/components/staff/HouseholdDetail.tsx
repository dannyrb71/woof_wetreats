'use client'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { COLORS, Household, DogRow, fmtDate, fmtTime } from './HouseholdCard'
import { formatPhone } from '@/lib/format'
import { StaffReservations } from './StaffReservations'
import { DogPhotoUploader } from '@/components/dogs/DogPhotoUploader'
import { getHolidayDateRange } from '@/lib/pricing-engine'
import { ServicePill } from '@/components/shared/molecules/ServicePill'
import { StatusBadge } from '@/components/shared/molecules/StatusBadge'
import { AddDogButton } from '@/components/shared/molecules/AddDogButton'

// ── Constants ──────────────────────────────────────────────────
const TIME_SLOTS: { value: string; label: string }[] = []
for (let h = 7; h <= 20; h++) {
  for (const m of [0, 30]) {
    const value  = `${String(h).padStart(2, '0')}:${m === 0 ? '00' : '30'}`
    const hour   = h > 12 ? h - 12 : h === 0 ? 12 : h
    const period = h < 12 ? 'AM' : 'PM'
    TIME_SLOTS.push({ value, label: `${hour}:${m === 0 ? '00' : '30'} ${period}` })
  }
}
const MG_LABEL: Record<string, string> = {
  needed: 'Needed', requested: 'Requested', scheduled: 'Scheduled', completed: 'Completed',
}
const SUPABASE_URL      = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// ── Helpers ────────────────────────────────────────────────────
function fmtDateLong(ymd: string): string {
  return new Date(ymd + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
}
function toYmd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function ageLabel(birthdate: string): string {
  const birth = new Date(birthdate + 'T00:00:00'), now = new Date()
  const months = (now.getFullYear() - birth.getFullYear()) * 12 + (now.getMonth() - birth.getMonth())
  return months < 12 ? `${months}mo` : `${Math.floor(months / 12)}yr`
}
function dogNameColor(gender: string | null): string {
  if (gender === 'male')   return 'var(--dog-male)'
  if (gender === 'female') return 'var(--dog-female)'
  return 'var(--text-primary)'
}
function nightsBetween(dropoff: string, pickup: string): number {
  return Math.max(0, Math.round((new Date(pickup + 'T00:00:00').getTime() - new Date(dropoff + 'T00:00:00').getTime()) / 86400000))
}

// ── Types ──────────────────────────────────────────────────────
interface CalRes {
  id: string; service_type: 'boarding' | 'daycare'; status: string
  dropoff_date: string; pickup_date: string; paid: boolean; total_price: number
}
interface ClientDetail {
  phone: string; email: string; address: string
  emergency_contact_name: string; emergency_contact_phone: string
  vet_name: string; vet_phone: string; vet_address: string
  care_notes: string
}
interface Props {
  household: Household; onBack: () => void
  onUpdate: (updated: Household) => void; embedded?: boolean
}

// ── Reservation Calendar ───────────────────────────────────────
function ReservationCalendar({ reservations, month, year, onPrev, onNext }: {
  reservations: CalRes[]; month: number; year: number; onPrev: () => void; onNext: () => void
}) {
  const today = toYmd(new Date())
  const startDow = new Date(year, month, 1).getDay()
  const daysInMo = new Date(year, month + 1, 0).getDate()

  const holidaySet = useMemo(() => {
    const from = `${year}-${String(month + 1).padStart(2, '0')}-01`
    const to   = `${year}-${String(month + 1).padStart(2, '0')}-${String(daysInMo).padStart(2, '0')}`
    return getHolidayDateRange(from, to)
  }, [year, month, daysInMo])

  const cells: (number | null)[] = [
    ...Array(startDow).fill(null),
    ...Array.from({ length: daysInMo }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  function resForDate(day: number): CalRes | null {
    const ymd = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    return reservations.find(r => r.status !== 'cancelled' && ymd >= r.dropoff_date && ymd <= r.pickup_date) ?? null
  }

  const monthLabel = new Date(year, month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <button type="button" onClick={onPrev} className="btn btn-icon">‹</button>
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{monthLabel}</span>
        <button type="button" onClick={onNext} className="btn btn-icon">›</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
        {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => (
          <div key={d} style={{ textAlign: 'center', fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', paddingBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{d}</div>
        ))}
        {cells.map((day, i) => {
          if (!day) return <div key={i} />
          const ymd       = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          const res       = resForDate(day)
          const isToday   = ymd === today
          const isHoliday = holidaySet.has(ymd)

          // Solid fill for booking days; white text
          let bg    = 'transparent'
          let color = 'var(--text-primary)'
          let fw    = isToday ? 700 : 400
          if (res) {
            bg    = res.service_type === 'boarding' ? 'var(--status-boarding)' : 'var(--status-daycare)'
            color = '#fff'
            fw    = 600
          }

          // Holiday gets a primary outline, layered on top of booking fill
          const outline = isHoliday ? '2px solid var(--primary)' : 'none'

          return (
            <div key={i} style={{
              textAlign: 'center', padding: res || isToday ? '5px 2px 2px' : '5px 2px 5px',
              borderRadius: 6, background: bg, color, fontWeight: fw, fontSize: 12,
              outline, outlineOffset: '-2px', boxSizing: 'border-box', lineHeight: 1,
            }}>
              {day}
              {isToday && (
                <span style={{
                  display: 'block', width: 4, height: 4, borderRadius: '50%',
                  background: res ? '#fff' : 'var(--primary)', margin: '2px auto 0',
                }} />
              )}
            </div>
          )
        })}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 12, marginTop: 10, flexWrap: 'wrap', borderTop: '1px solid var(--border)', paddingTop: 8 }}>
        {[
          { label: 'Today',    dot: true },
          { label: 'Holiday',  outline: true },
          { label: '🏠 Boarding', fill: 'var(--status-boarding)' },
          { label: '🌞 Daycare',  fill: 'var(--status-daycare)' },
        ].map(({ label, dot, outline, fill }) => (
          <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-secondary)' }}>
            <span style={{
              width: 10, height: 10, borderRadius: 2, display: 'inline-block', flexShrink: 0,
              background: fill ?? 'transparent',
              border: outline ? '2px solid var(--primary)' : fill ? 'none' : '1px solid var(--border)',
              position: 'relative',
            }}>
              {dot && <span style={{ position: 'absolute', width: 4, height: 4, borderRadius: '50%', background: 'var(--primary)', bottom: -2, left: '50%', transform: 'translateX(-50%)' }} />}
            </span>
            {label}
          </span>
        ))}
      </div>
    </div>
  )
}

// ── Pill helper ────────────────────────────────────────────────
// Delegates to the shared ServicePill molecule; keeps a muted "—" fallback
// for rows with no service type.
function SvcPill({ type }: { type: string | null }) {
  if (type === 'boarding' || type === 'daycare') return <ServicePill type={type} />
  return <span style={{ ...s.pill, background: 'var(--text-muted)', color: '#fff' }}>—</span>
}

// ── Main Component ─────────────────────────────────────────────
export function HouseholdDetail({ household, onBack, onUpdate, embedded = false }: Props) {
  const supabase = createClient()
  const now      = new Date()

  const dogNames = household.dogs.length > 0
    ? [...household.dogs].sort((a, b) => a.name.localeCompare(b.name)).map((d: DogRow) => d.name).join(', ')
    : `${household.first_name} ${household.last_name}`

  // ── Fetched data ───────────────────────────────────────────
  const [detail,      setDetail]      = useState<ClientDetail | null>(null)
  const [clientSince, setClientSince] = useState<string | null>(null)
  const [calRes,      setCalRes]      = useState<CalRes[]>([])
  const [calLoading,  setCalLoading]  = useState(true)
  const [dogs,        setDogs]        = useState<DogRow[]>(household.dogs)

  useEffect(() => { setDogs(household.dogs) }, [household.client_id]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadData = useCallback(async () => {
    const [detR, resR, cliR] = await Promise.all([
      supabase.rpc('get_client_detail', { p_client_id: household.client_id }),
      supabase.from('reservations')
        .select('id,service_type,status,dropoff_date,pickup_date,paid,total_price')
        .eq('client_id', household.client_id).order('dropoff_date', { ascending: true }),
      supabase.from('clients').select('created_at').eq('id', household.client_id).single(),
    ])
    if (detR.data?.[0]) setDetail(detR.data[0])
    setCalRes((resR.data ?? []) as CalRes[])
    if (cliR.data?.created_at) {
      const d = new Date(cliR.data.created_at)
      setClientSince(d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }))
    }
    setCalLoading(false)
  }, [household.client_id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadData() }, [loadData])

  // ── Calendar nav ───────────────────────────────────────────
  const [calYear,  setCalYear]  = useState(now.getFullYear())
  const [calMonth, setCalMonth] = useState(now.getMonth())

  function prevMonth() {
    if (calMonth === 0) { setCalYear(y => y - 1); setCalMonth(11) } else setCalMonth(m => m - 1)
  }
  function nextMonth() {
    if (calMonth === 11) { setCalYear(y => y + 1); setCalMonth(0) } else setCalMonth(m => m + 1)
  }

  // ── Derived: current stay cascade ─────────────────────────
  const todayYmd    = toYmd(now)
  const activeRes   = calRes.find(r => r.status === 'in_progress')
  const nextUpcoming = calRes.filter(r => r.status === 'upcoming' && r.dropoff_date >= todayYmd)
    .sort((a, b) => a.dropoff_date.localeCompare(b.dropoff_date))[0] ?? null
  const unpaid      = calRes.filter(r => !r.paid && r.status !== 'cancelled')
  const unpaidTotal = unpaid.reduce((s, r) => s + Number(r.total_price), 0)
  const femaleDogs  = dogs.filter(d => d.gender === 'female').length
  const maleDogs    = dogs.filter(d => d.gender === 'male').length
  const displayRes  = activeRes ?? nextUpcoming
  // Dynamic label for the Current/Upcoming Booking card.
  const currentStayLabel = activeRes ? 'Current Booking' : nextUpcoming ? 'Upcoming Booking' : 'Outstanding Balance'

  // ── Block / unblock ────────────────────────────────────────
  const [isBlocked,    setIsBlocked]    = useState(household.blocked)
  const [blockConfirm, setBlockConfirm] = useState(false)
  const [blockSaving,  setBlockSaving]  = useState(false)
  const [blockErr,     setBlockErr]     = useState('')

  async function toggleBlocked() {
    setBlockSaving(true); setBlockErr(''); setBlockConfirm(false)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setBlockErr('Not authenticated.'); setBlockSaving(false); return }
    const next = !isBlocked
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/toggle-client-blocked`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}`, 'apikey': SUPABASE_ANON_KEY },
      body: JSON.stringify({ client_id: household.client_id, blocked: next }),
    })
    if (!resp.ok) {
      const json = await resp.json().catch(() => ({}))
      setBlockErr(json.error ?? 'Failed — try again.'); setBlockSaving(false); return
    }
    setIsBlocked(next); onUpdate({ ...household, blocked: next }); setBlockSaving(false)
  }

  // ── Meet & Greet ───────────────────────────────────────────
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
    setMgSaving(true); setMgErr('')
    const { data, error } = await supabase.rpc('schedule_meet_greet', { p_client_id: household.client_id, p_date: schedDate, p_time: schedTime })
    setMgSaving(false)
    if (error) { setMgErr(error.message ?? 'Failed to schedule.'); return }
    setMgId(data as string); setMgDate(schedDate); setMgTime(schedTime); setMgStatus('scheduled')
    onUpdate({ ...household, meet_greet_status: 'scheduled', mg_id: data as string, mg_date: schedDate, mg_time: schedTime, mg_status: 'scheduled' })
  }

  async function completeMeetGreet() {
    if (!mgId) return
    setMgSaving(true); setMgErr('')
    const { error } = await supabase.rpc('complete_meet_greet', { p_meet_greet_id: mgId })
    setMgSaving(false)
    if (error) { setMgErr(error.message ?? 'Failed.'); return }
    setMgStatus('completed'); onUpdate({ ...household, meet_greet_status: 'completed', mg_status: 'completed' })
  }

  async function toggleMeetGreetCompleted() {
    const next = mgStatus === 'completed' ? 'needed' : 'completed'
    setMgSaving(true); setMgErr('')
    const { error } = await supabase.from('clients').update({ meet_greet_status: next }).eq('id', household.client_id)
    setMgSaving(false)
    if (error) { setMgErr('Could not update.'); return }
    setMgStatus(next); onUpdate({ ...household, meet_greet_status: next })
  }

  // ── Staff notes ────────────────────────────────────────────
  const [note,    setNote]    = useState(household.staff_note ?? '')
  const [saved,   setSaved]   = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [saveErr, setSaveErr] = useState('')

  async function handleSave() {
    setSaving(true); setSaveErr('')
    const { error } = await supabase.from('staff_notes')
      .upsert({ client_id: household.client_id, note, updated_at: new Date().toISOString() }, { onConflict: 'client_id' })
    setSaving(false)
    if (error) { setSaveErr('Save failed — try again.'); return }
    setSaved(true)
  }

  // ── Client info editing ────────────────────────────────────
  const [editingInfo, setEditingInfo] = useState(false)
  const [editPhone,   setEditPhone]   = useState('')
  const [editAddress, setEditAddress] = useState('')
  const [editEmgName, setEditEmgName] = useState('')
  const [editEmgPhone,setEditEmgPhone]= useState('')
  const [editVet,     setEditVet]     = useState('')
  const [editVetPh,   setEditVetPh]   = useState('')
  const [editVetAddr, setEditVetAddr] = useState('')
  const [infoSaving,  setInfoSaving]  = useState(false)
  const [infoErr,     setInfoErr]     = useState('')

  function openEditInfo() {
    if (!detail) return
    setEditPhone(detail.phone ?? ''); setEditAddress(detail.address ?? '')
    setEditEmgName(detail.emergency_contact_name ?? ''); setEditEmgPhone(detail.emergency_contact_phone ?? '')
    setEditVet(detail.vet_name ?? ''); setEditVetPh(detail.vet_phone ?? ''); setEditVetAddr(detail.vet_address ?? '')
    setInfoErr(''); setEditingInfo(true)
  }

  async function saveClientInfo() {
    setInfoSaving(true); setInfoErr('')
    const { error } = await supabase.from('clients').update({
      phone: editPhone, address: editAddress,
      emergency_contact_name: editEmgName, emergency_contact_phone: editEmgPhone,
      vet_name: editVet, vet_phone: editVetPh, vet_address: editVetAddr,
    }).eq('id', household.client_id)
    setInfoSaving(false)
    if (error) { setInfoErr('Could not save — try again.'); return }
    setDetail(d => d ? { ...d, phone: editPhone, address: editAddress, emergency_contact_name: editEmgName, emergency_contact_phone: editEmgPhone, vet_name: editVet, vet_phone: editVetPh, vet_address: editVetAddr } : d)
    setEditingInfo(false)
  }

  // ── Photo overrides ────────────────────────────────────────
  const [photoOverrides, setPhotoOverrides] = useState<Record<string, string>>({})

  // ── Dog overflow menu ──────────────────────────────────────
  const [openMenuId,      setOpenMenuId]      = useState<string | null>(null)
  const [removeConfirmId, setRemoveConfirmId] = useState<string | null>(null)
  const [removingDogId,   setRemovingDogId]   = useState<string | null>(null)
  const [removeErr,       setRemoveErr]       = useState('')

  async function removeDog(dogId: string) {
    setRemovingDogId(dogId); setRemoveErr('')
    const { error } = await supabase.from('dogs').delete().eq('id', dogId)
    setRemovingDogId(null)
    if (error) { setRemoveErr('Could not remove — try again.'); return }
    setRemoveConfirmId(null); setOpenMenuId(null)
    setDogs(prev => prev.filter(d => d.id !== dogId))
  }

  // ── Add Dog ────────────────────────────────────────────────
  const [showAddDog,   setShowAddDog]   = useState(false)
  const [newDogName,   setNewDogName]   = useState('')
  const [newDogBirth,  setNewDogBirth]  = useState('')
  const [newDogGender, setNewDogGender] = useState<'male'|'female'|''>('')
  const [addingDog,    setAddingDog]    = useState(false)
  const [addDogErr,    setAddDogErr]    = useState('')

  async function addDog() {
    if (!newDogName.trim()) { setAddDogErr('Name is required.'); return }
    if (!newDogBirth)       { setAddDogErr('Birthdate is required.'); return }
    if (!newDogGender)      { setAddDogErr('Gender is required.'); return }
    setAddingDog(true); setAddDogErr('')
    const { data, error } = await supabase.from('dogs')
      .insert({ client_id: household.client_id, name: newDogName.trim(), birthdate: newDogBirth, gender: newDogGender, photo_url: null })
      .select().single()
    setAddingDog(false)
    if (error) { setAddDogErr(error.message ?? 'Could not add dog.'); return }
    setDogs(prev => [...prev, { id: data.id, name: data.name, birthdate: data.birthdate, gender: data.gender, photo_url: null, photoSigned: null }])
    setShowAddDog(false); setNewDogName(''); setNewDogBirth(''); setNewDogGender('')
  }

  // ── Render ─────────────────────────────────────────────────
  return (
    <div style={{ background: 'var(--background)', minHeight: embedded ? undefined : '100vh' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: embedded ? '20px 22px 60px' : '28px 28px 80px' }}>

        {/* Back link */}
        <button type="button" onClick={onBack} className="btn btn-ghost btn-sm" style={{ paddingLeft: 0 }}>
          ← {embedded ? 'Close' : 'Back to clients'}
        </button>

        {/* Page header card */}
        <div style={s.headerCard}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <h1 style={s.pageTitle}>{dogNames}</h1>
              <p style={s.summaryLine}>
                {dogs.length} {dogs.length === 1 ? 'Dog' : 'Dogs'}
                {clientSince && <> · Client since {clientSince}</>}
                {!calLoading && <> · {calRes.length} {calRes.length === 1 ? 'booking' : 'bookings'}</>}
              </p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={s.ownerName}>{household.first_name} {household.last_name}</p>
              {household.phone && <p style={s.ownerPhone}>{formatPhone(household.phone)}</p>}
            </div>
          </div>
          {isBlocked && <div style={s.blockedBanner}>⛔ This client is blocked from booking</div>}
        </div>

        {/* ── 1/3 + 2/3 grid ── */}
        <div className="profile-layout-staff" style={{ marginTop: 20 }}>

          {/* ── LEFT COLUMN ── */}
          <div className="profile-col-left">

            {/* CURRENT / UPCOMING BOOKING — sp-current-stay.
                Label is dynamic (Current Booking / Upcoming Booking / Outstanding
                Balance). The whole card is HIDDEN when the client has no active or
                upcoming booking AND no outstanding balance — e.g. Meet & Greet
                only, or a brand-new client. */}
            {(displayRes || unpaidTotal > 0) && (
              <div className="sp-current-stay" style={s.card}>
                <p className="section-label" style={{ marginBottom: 14 }}>{currentStayLabel}</p>

                {displayRes ? (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                      <SvcPill type={displayRes.service_type} />
                      <StatusBadge status={displayRes.status === 'in_progress' ? 'in-progress' : 'upcoming'} />
                    </div>
                    <p style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                      {fmtDate(displayRes.dropoff_date)}
                      {displayRes.service_type === 'boarding' && ` – ${fmtDate(displayRes.pickup_date)}`}
                    </p>
                    {displayRes.service_type === 'boarding' && (
                      <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--text-secondary)' }}>
                        {nightsBetween(displayRes.dropoff_date, displayRes.pickup_date)} nights
                      </p>
                    )}
                    {unpaidTotal > 0 && (
                      <p style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 700, color: 'var(--warning)' }}>
                        Outstanding: ${unpaidTotal.toFixed(2)}
                      </p>
                    )}
                    {/* CTAs */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <button type="button" className="btn btn-primary"
                        onClick={() => document.getElementById('reservations-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
                        View Booking
                      </button>
                      <button type="button" className="btn btn-outlined"
                        onClick={() => document.getElementById('reservations-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
                        Edit Booking
                      </button>
                      <button type="button" className="btn btn-booking"
                        onClick={() => document.getElementById('reservations-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
                        + New Booking
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <p style={{ margin: '0 0 6px', fontSize: 13, color: 'var(--text-secondary)' }}>No active or upcoming booking</p>
                    <p style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: 'var(--warning)' }}>
                      Outstanding: ${unpaidTotal.toFixed(2)}
                    </p>
                    <p style={{ margin: '0 0 12px', fontSize: 11, color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                      Send payment reminder — coming soon
                    </p>
                    <button type="button" className="btn btn-booking"
                      onClick={() => document.getElementById('reservations-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
                      + New Booking
                    </button>
                  </>
                )}
              </div>
            )}

            {/* CLIENT INFORMATION — sp-client-info */}
            <div className="sp-client-info" style={s.card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <p className="section-label">Client Information</p>
                {detail && !editingInfo && (
                  <button type="button" onClick={openEditInfo} className="btn btn-outlined btn-sm">✎ Edit</button>
                )}
              </div>
              {!detail && <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Loading…</p>}
              {detail && !editingInfo && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                  {[
                    { icon: '📞', label: 'Phone',            value: formatPhone(detail.phone) },
                    { icon: '✉️', label: 'Email',            value: detail.email },
                    { icon: '📍', label: 'Address',          value: detail.address },
                    { icon: '⚠️', label: 'Emergency contact',value: `${detail.emergency_contact_name}${detail.emergency_contact_phone ? ' · ' + formatPhone(detail.emergency_contact_phone) : ''}` },
                    { icon: '🏥', label: 'Vet',              value: detail.vet_name },
                    { icon: '📞', label: 'Vet phone',        value: formatPhone(detail.vet_phone) },
                    { icon: '📍', label: 'Vet address',      value: detail.vet_address },
                  ].filter(r => r.value?.trim()).map(r => (
                    <div key={r.label} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                      <span style={{ fontSize: 13, flexShrink: 0, width: 18 }}>{r.icon}</span>
                      <div>
                        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block' }}>{r.label}</span>
                        <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>{r.value}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {detail && editingInfo && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {[
                    { label: '📞 Phone',            value: editPhone,   onChange: setEditPhone },
                    { label: '📍 Address',          value: editAddress, onChange: setEditAddress },
                    { label: '⚠️ Emergency name',   value: editEmgName, onChange: setEditEmgName },
                    { label: '⚠️ Emergency phone',  value: editEmgPhone,onChange: setEditEmgPhone },
                    { label: '🏥 Vet name',         value: editVet,     onChange: setEditVet },
                    { label: '🏥 Vet phone',        value: editVetPh,   onChange: setEditVetPh },
                    { label: '🏥 Vet address',      value: editVetAddr, onChange: setEditVetAddr },
                  ].map(f => (
                    <label key={f.label} style={s.fieldLabel}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{f.label}</span>
                      <input value={f.value} onChange={e => f.onChange(e.target.value)} style={s.fieldInput} />
                    </label>
                  ))}
                  {infoErr && <p style={{ margin: 0, fontSize: 12, color: 'var(--error)' }}>{infoErr}</p>}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button" onClick={saveClientInfo} disabled={infoSaving} className="btn btn-primary btn-sm">
                      {infoSaving ? 'Saving…' : 'Save'}
                    </button>
                    <button type="button" onClick={() => setEditingInfo(false)} disabled={infoSaving} className="btn btn-outlined btn-sm">
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* MEET & GREET — sp-meet-greet */}
            <div className="sp-meet-greet" style={s.card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <p className="section-label">Meet &amp; Greet</p>
                <span style={{
                  ...s.pill,
                  background: mgStatus === 'completed' ? 'var(--success)' : mgStatus === 'requested' ? 'var(--warning)' : 'var(--status-meet-greet)',
                  color: '#fff',
                }}>
                  {MG_LABEL[mgStatus] ?? mgStatus}
                </span>
              </div>

              {mgStatus === 'requested' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
                  <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)' }}>Client requested — pick a date &amp; time:</p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <label style={s.fieldLabel}>
                      <span style={{ fontSize: 10, color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase' }}>Date</span>
                      <input type="date" value={schedDate} onChange={e => setSchedDate(e.target.value)} style={s.fieldInput} />
                    </label>
                    <label style={s.fieldLabel}>
                      <span style={{ fontSize: 10, color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase' }}>Time</span>
                      <select value={schedTime} onChange={e => setSchedTime(e.target.value)} style={s.fieldInput}>
                        <option value="">Select…</option>
                        {TIME_SLOTS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    </label>
                  </div>
                  <button type="button" onClick={scheduleMeetGreet} disabled={mgSaving} className="btn btn-primary btn-sm">
                    {mgSaving ? 'Scheduling…' : 'Schedule'}
                  </button>
                </div>
              )}

              {mgStatus === 'scheduled' && (
                <div style={{ marginBottom: 12 }}>
                  <p style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--text-primary)', fontWeight: 600 }}>
                    📅 {mgDate ? fmtDateLong(mgDate) : 'Scheduled'}{mgTime ? ` · ${fmtTime(mgTime)}` : ''}
                  </p>
                  <button type="button" onClick={completeMeetGreet} disabled={mgSaving} className="btn btn-success btn-sm">
                    {mgSaving ? 'Saving…' : '✓ Mark Completed'}
                  </button>
                </div>
              )}

              {mgStatus === 'needed' && (
                <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--text-secondary)' }}>
                  Not yet requested. Client must complete a Meet &amp; Greet before booking.
                </p>
              )}

              {mgErr && <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--error)' }}>{mgErr}</p>}

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Completed toggle</span>
                <button type="button" role="switch" aria-checked={mgStatus === 'completed'}
                  onClick={toggleMeetGreetCompleted} disabled={mgSaving}
                  style={{ ...s.toggle, background: mgStatus === 'completed' ? 'var(--success)' : 'var(--border)', opacity: mgSaving ? 0.6 : 1 }}>
                  <span style={{ ...s.toggleKnob, transform: mgStatus === 'completed' ? 'translateX(20px)' : 'translateX(0)' }} />
                </button>
              </div>
            </div>

            {/* CLIENT ACCESS — sp-client-access */}
            <div className="sp-client-access" style={s.card}>
              <p className="section-label" style={{ marginBottom: 10 }}>Client Access</p>
              <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--text-secondary)' }}>
                {isBlocked ? 'Blocked — cannot submit new bookings.' : 'Active — can submit new bookings.'}
              </p>
              {blockConfirm ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                    {isBlocked ? 'Allow this client to book again?' : 'Block this client from booking?'}
                  </p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button" onClick={toggleBlocked}
                      className={isBlocked ? 'btn btn-success btn-sm' : 'btn btn-destructive btn-sm'}>
                      {isBlocked ? 'Yes, Unblock' : 'Yes, Block'}
                    </button>
                    <button type="button" onClick={() => setBlockConfirm(false)} className="btn btn-outlined btn-sm">Cancel</button>
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => setBlockConfirm(true)} disabled={blockSaving}
                  className={isBlocked ? 'btn btn-success' : 'btn btn-destructive'}>
                  {blockSaving ? 'Saving…' : isBlocked ? 'Unblock Client' : 'Block Client'}
                </button>
              )}
              {blockErr && <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--error)' }}>{blockErr}</p>}
            </div>

          </div>{/* /col-left */}

          {/* ── RIGHT COLUMN ── */}
          <div className="profile-col-right">

            {/* DOGS — sp-dogs */}
            <div className="sp-dogs" style={s.card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <p className="section-label">{dogs.length === 1 ? 'Dog' : 'Dogs'} ({dogs.length})</p>
                <AddDogButton onClick={() => setShowAddDog(v => !v)} />
              </div>

              {showAddDog && (
                <div style={s.addDogForm}>
                  <p style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Add a dog</p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <label style={s.fieldLabel}>
                      <span style={{ fontSize: 10, color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase' }}>Name</span>
                      <input value={newDogName} onChange={e => setNewDogName(e.target.value)} style={s.fieldInput} />
                    </label>
                    <label style={s.fieldLabel}>
                      <span style={{ fontSize: 10, color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase' }}>Birthdate</span>
                      <input type="date" value={newDogBirth} onChange={e => setNewDogBirth(e.target.value)} style={s.fieldInput} />
                    </label>
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    {(['male', 'female'] as const).map(g => (
                      <button key={g} type="button" onClick={() => setNewDogGender(g)}
                        style={{ ...s.genderToggle, background: newDogGender === g ? 'var(--primary)' : 'var(--background)', color: newDogGender === g ? '#fff' : 'var(--text-primary)', borderColor: newDogGender === g ? 'var(--primary)' : 'var(--border)' }}>
                        {g === 'male' ? '♂ Male' : '♀ Female'}
                      </button>
                    ))}
                  </div>
                  {addDogErr && <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--error)' }}>{addDogErr}</p>}
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    <button type="button" onClick={addDog} disabled={addingDog} className="btn btn-primary btn-sm">
                      {addingDog ? 'Adding…' : 'Add Dog'}
                    </button>
                    <button type="button" onClick={() => { setShowAddDog(false); setAddDogErr('') }} className="btn btn-outlined btn-sm">Cancel</button>
                  </div>
                </div>
              )}

              {dogs.length === 0 && !showAddDog && (
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', fontStyle: 'italic' }}>No dogs on file.</p>
              )}
              {removeErr && <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--error)' }}>{removeErr}</p>}

              <div style={s.dogGrid}>
                {dogs.map((dog: DogRow) => {
                  const photo = photoOverrides[dog.id] ?? dog.photoSigned
                  return (
                    <div key={dog.id} style={{ ...s.dogCard, position: 'relative' }}>
                      {/* Kebab in top-right corner of card */}
                      <button type="button"
                        onClick={() => { setOpenMenuId(openMenuId === dog.id ? null : dog.id); setRemoveConfirmId(null) }}
                        style={s.kebabBtn}
                        aria-label="More options"
                        title="More options">
                        ⋯
                      </button>
                      {openMenuId === dog.id && (
                        <div style={s.overflowMenu}>
                          {removeConfirmId === dog.id ? (
                            <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>Remove {dog.name}?</span>
                              <div style={{ display: 'flex', gap: 6 }}>
                                <button type="button" onClick={() => removeDog(dog.id)} disabled={removingDogId === dog.id} className="btn btn-destructive btn-xs">
                                  {removingDogId === dog.id ? '…' : 'Remove'}
                                </button>
                                <button type="button" onClick={() => { setRemoveConfirmId(null); setOpenMenuId(null) }} className="btn btn-ghost btn-xs">
                                  Keep
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button type="button" onClick={() => setRemoveConfirmId(dog.id)}
                              style={s.overflowItem}>
                              Remove dog
                            </button>
                          )}
                        </div>
                      )}
                      {/* Circular photo */}
                      {photo
                        ? <img src={photo} alt={dog.name} style={s.dogCircle} />
                        : <div style={s.dogCircleBlank}>🐕</div>}
                      {/* Name — gender color, no icon */}
                      <p style={{ margin: '8px 0 2px', fontWeight: 700, fontSize: 14, color: dogNameColor(dog.gender), textAlign: 'center' }}>
                        {dog.name}
                      </p>
                      {/* Age + birthdate — --text-secondary for ADA */}
                      <p style={{ margin: '0 0 8px', fontSize: 11, color: 'var(--text-secondary)', textAlign: 'center' }}>
                        {ageLabel(dog.birthdate)} · {dog.birthdate}
                      </p>
                      {/* Change Photo */}
                      <DogPhotoUploader
                        dogId={dog.id}
                        authUid={household.client_id}
                        pathPrefix={household.client_id}
                        currentPath={dog.photo_url ?? null}
                        onDone={(newPath, previewUrl) => {
                          setPhotoOverrides(prev => ({ ...prev, [dog.id]: previewUrl }))
                          onUpdate({ ...household, dogs: household.dogs.map((d: DogRow) => d.id === dog.id ? { ...d, photo_url: newPath, photoSigned: previewUrl } : d) })
                        }}
                      />
                    </div>
                  )
                })}
              </div>
            </div>

            {/* CARE NOTES — sp-care-notes */}
            <div className="sp-care-notes" style={{ ...s.card, borderLeft: '3px solid var(--warning)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: 14 }}>📋</span>
                <p className="section-label" style={{ marginBottom: 0 }}>Care Notes</p>
                <span style={{ fontSize: 11, color: 'var(--warning)', fontStyle: 'italic' }}>feeding &amp; medication</span>
              </div>
              {!detail
                ? <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>Loading…</p>
                : detail.care_notes?.trim()
                  ? <p style={{ margin: 0, fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{detail.care_notes}</p>
                  : <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)', fontStyle: 'italic' }}>No care notes on file for this household.</p>}
            </div>

            {/* STAFF NOTES — sp-staff-notes */}
            <div className="sp-staff-notes" style={s.card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 13 }}>🔒</span>
                  <p className="section-label" style={{ marginBottom: 0 }}>Staff Notes</p>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>not visible to client</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {!saved && <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Unsaved</span>}
                  {saveErr && <span style={{ fontSize: 12, color: 'var(--error)' }}>{saveErr}</span>}
                  <button type="button" onClick={handleSave} disabled={saved || saving} className="btn btn-outlined btn-sm">
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>
              <textarea value={note} onChange={e => { setNote(e.target.value); setSaved(false); setSaveErr('') }}
                placeholder="Private staff notes…" rows={4} style={s.textarea} />
            </div>

            {/* RESERVATIONS — sp-reservations */}
            <div id="reservations-section" className="sp-reservations" style={s.card}>
              <p className="section-label" style={{ marginBottom: 16 }}>Bookings</p>
              {!calLoading && calRes.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <ReservationCalendar
                    reservations={calRes} month={calMonth} year={calYear}
                    onPrev={prevMonth} onNext={nextMonth}
                  />
                </div>
              )}
              <StaffReservations
                clientId={household.client_id}
                clientFirstName={household.first_name}
                dogs={dogs.map((d: DogRow) => ({ id: d.id, name: d.name, birthdate: d.birthdate }))}
                meetGreetCompleted={mgStatus === 'completed'}
                onChanged={() => { loadData(); onUpdate(household) }}
              />
            </div>

          </div>{/* /col-right */}
        </div>
      </div>
    </div>
  )
}

// ── Styles ──────────────────────────────────────────────────────
const s: Record<string, React.CSSProperties> = {
  headerCard:    { background: 'var(--surface)', borderRadius: 'var(--radius-card)', boxShadow: '0 0 3.5px rgba(0,0,0,0.10)', padding: '22px 26px' },
  pageTitle:     { margin: '0 0 6px', fontSize: 26, fontWeight: 800, color: 'var(--text-primary)' },
  summaryLine:   { margin: 0, fontSize: 13, color: 'var(--text-secondary)' },
  ownerName:     { margin: '0 0 2px', fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' },
  ownerPhone:    { margin: 0, fontSize: 13, color: 'var(--text-secondary)' },
  blockedBanner: { marginTop: 12, background: 'rgba(184,107,107,0.10)', borderRadius: 8, padding: '8px 12px', fontSize: 13, fontWeight: 600, color: 'var(--error)' },
  card:          { background: 'var(--surface)', borderRadius: 'var(--radius-card)', boxShadow: '0 0 3.5px rgba(0,0,0,0.10)', padding: '22px 24px' },
  // Pill: solid fill, white text, height 22
  pill:          { display: 'inline-flex', alignItems: 'center', height: 22, padding: '0 10px', borderRadius: 999, fontSize: 11, fontWeight: 600, lineHeight: 1, boxSizing: 'border-box', whiteSpace: 'nowrap' },
  // Dog cards
  dogGrid:       { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 14, marginTop: 4 },
  dogCard:       { background: 'var(--background)', borderRadius: 16, padding: '16px 10px', display: 'flex', flexDirection: 'column', alignItems: 'center' },
  dogCircle:     { width: 80, height: 80, borderRadius: '50%', objectFit: 'cover', display: 'block', border: '2px solid var(--border)' },
  dogCircleBlank:{ width: 80, height: 80, borderRadius: '50%', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36, border: '2px solid var(--border)' },
  // Overflow kebab: absolute top-right of card, --text-secondary for ADA contrast
  kebabBtn:      { position: 'absolute', top: 6, right: 6, background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--text-secondary)', padding: '4px 6px', fontFamily: 'inherit', lineHeight: 1, fontWeight: 700, letterSpacing: 1 },
  overflowMenu:  { position: 'absolute', top: 32, right: 0, background: 'var(--surface)', borderRadius: 10, boxShadow: '0 4px 20px rgba(0,0,0,0.13)', zIndex: 20, minWidth: 140, border: '1px solid var(--border)' },
  overflowItem:  { display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: '10px 14px', fontSize: 13, color: 'var(--error)', fontFamily: 'inherit' },
  addDogForm:    { background: 'var(--background)', borderRadius: 12, padding: '14px 16px', marginBottom: 16 },
  genderToggle:  { fontSize: 13, fontWeight: 600, padding: '6px 14px', border: '1.5px solid', cursor: 'pointer', fontFamily: 'inherit' },
  // Forms
  fieldLabel:    { display: 'flex', flexDirection: 'column', gap: 4 },
  fieldInput:    { fontSize: 13, padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-primary)', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box', marginTop: 2 },
  // Staff notes textarea
  textarea:      { width: '100%', borderRadius: 8, border: '1px solid var(--border)', padding: '10px 12px', fontSize: 13, lineHeight: 1.6, fontFamily: 'inherit', resize: 'vertical', background: 'var(--surface)', color: 'var(--text-primary)', boxSizing: 'border-box' },
  // M&G toggle
  toggle:        { position: 'relative', width: 44, height: 24, border: 'none', padding: 0, flexShrink: 0, cursor: 'pointer', fontFamily: 'inherit' },
  toggleKnob:    { position: 'absolute', top: 2, left: 2, width: 20, height: 20, borderRadius: '50%', background: 'var(--surface)', transition: 'transform 0.15s', boxShadow: '0 1px 2px rgba(0,0,0,0.2)' },
}
