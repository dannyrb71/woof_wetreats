'use client'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { processImageFile, ImageValidationError } from '@/lib/image-utils'
import { TERMS_VERSION } from '@/lib/terms'
import { VENMO_USERNAME } from '@/lib/payment'
import { SiteNav } from '@/components/SiteNav'
import { DogCard, SharedDog } from '@/components/profile/DogCard'
import { BalanceSection } from '@/components/profile/BalanceSection'
import BookingForm from '@/components/booking/BookingForm'
import { parseAnnouncement } from '@/components/staff/AnnouncementEditor'
import { ManageUsers } from '@/components/profile/ManageUsers'
import { formatPhone } from '@/lib/format'
import { ServicePill } from '@/components/shared/molecules/ServicePill'
import { StatusBadge, type StatusType } from '@/components/shared/molecules/StatusBadge'
import { AddDogButton } from '@/components/shared/molecules/AddDogButton'

// DB status keys (underscore) → StatusBadge molecule keys (hyphen)
const STATUS_KEY: Record<string, StatusType> = {
  upcoming: 'upcoming', in_progress: 'in-progress', completed: 'completed', cancelled: 'cancelled',
}

// ── Types ──────────────────────────────────────────────────────
interface ClientProfile {
  first_name:              string
  last_name:               string
  phone:                   string
  email:                   string
  address:                 string
  emergency_contact_name:  string
  emergency_contact_phone: string
  vet_name:                string
  vet_phone:               string
  vet_address:             string
  care_notes:              string
  meet_greet_status:       'needed' | 'requested' | 'scheduled' | 'completed'
  auth_id:                 string | null
  secondary_auth_id:       string | null
  secondary_invite_email:  string | null
}

interface MeetGreetRecord {
  scheduled_date: string
  scheduled_time: string
}

interface Reservation {
  id:             string
  service_type:   'boarding' | 'daycare'
  status:         'upcoming' | 'in_progress' | 'completed' | 'cancelled'
  dropoff_date:   string
  dropoff_time:   string
  pickup_date:    string
  pickup_time:    string
  payment_method: string
  total_price:    number
  paid:           boolean
  care_notes:     string | null
  dogs:           string[]
}

interface ClientNotification {
  id:         string
  message:    string
  created_at: string
}

// ── Helpers ────────────────────────────────────────────────────
const SVC_COLORS = { boarding: 'var(--status-boarding)', daycare: 'var(--status-daycare)' }
const MEET_GREET_COLOR = 'var(--warning)'

function fmtDate(ymd: string): string {
  return new Date(ymd + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtTime(t: string): string {
  const [h, m] = t.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}

function nightsBetween(a: string, b: string): number {
  return Math.round((new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime()) / 86400000)
}

function greeting(): string {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

function resStrokeColor(status: Reservation['status'], serviceType: 'boarding' | 'daycare'): string {
  if (status === 'cancelled' || status === 'completed') return 'var(--status-no-activity)'
  if (status === 'in_progress') return 'var(--status-in-progress)'
  return SVC_COLORS[serviceType]
}

function sortReservations(list: Reservation[]): { active: Reservation[]; past: Reservation[] } {
  const active = list
    .filter(r => r.status === 'in_progress' || r.status === 'upcoming')
    .sort((a, b) => {
      if (a.status === 'in_progress' && b.status !== 'in_progress') return -1
      if (b.status === 'in_progress' && a.status !== 'in_progress') return  1
      return a.dropoff_date.localeCompare(b.dropoff_date)
    })
  const past = list
    .filter(r => r.status === 'completed' || r.status === 'cancelled')
    .sort((a, b) => b.dropoff_date.localeCompare(a.dropoff_date))
  return { active, past }
}

// ── Profile section ────────────────────────────────────────────
function ProfileRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={s.profileReadRow}>
      <span style={s.profileReadLabel}>{label}</span>
      <span style={s.profileReadValue}>{value || <span style={{ color: 'var(--text-secondary)' }}>—</span>}</span>
    </div>
  )
}

function ProfileSection({ profile, onSaved }: {
  profile: ClientProfile
  onSaved: (updated: ClientProfile) => void
}) {
  const [editing,  setEditing]  = useState(false)
  const [draft,    setDraft]    = useState(profile)
  const [saving,   setSaving]   = useState(false)
  const [err,      setErr]      = useState('')

  function startEdit() { setDraft({ ...profile }); setErr(''); setEditing(true) }
  function set(field: keyof ClientProfile, value: string) { setDraft(prev => ({ ...prev, [field]: value })) }

  async function save() {
    setSaving(true); setErr('')
    const resp = await fetch('/api/profile/update', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft) })
    let json: Record<string, unknown> = {}
    try { json = await resp.json() } catch { /* empty */ }
    if (!resp.ok) { setErr((json.error as string) ?? 'Save failed — try again.'); setSaving(false); return }
    onSaved(draft); setEditing(false); setSaving(false)
  }

  const shown = editing ? draft : profile

  return (
    <div style={s.sectionCard}>
      <div style={s.profileHeader}>
        <h3 style={s.sectionTitle}>Your Profile</h3>
        {!editing && (
          <button type="button" onClick={startEdit} className="btn btn-outlined btn-sm">Edit</button>
        )}
      </div>

      {editing ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={s.profileGrid}>
              <label style={s.profileLabel}>First name
                <input value={draft.first_name} onChange={e => set('first_name', e.target.value)} style={s.profileInput} />
              </label>
              <label style={s.profileLabel}>Last name
                <input value={draft.last_name} onChange={e => set('last_name', e.target.value)} style={s.profileInput} />
              </label>
              <label style={s.profileLabel}>Phone
                <input value={draft.phone} onChange={e => set('phone', e.target.value)} style={s.profileInput} />
              </label>
              <label style={{ ...s.profileLabel, gridColumn: '1 / -1' }}>Address
                <input value={draft.address} onChange={e => set('address', e.target.value)} style={s.profileInput} />
              </label>
            </div>
            <p style={s.profileGroupLabel}>Emergency contact</p>
            <div style={s.profileGrid}>
              <label style={s.profileLabel}>Name
                <input value={draft.emergency_contact_name} onChange={e => set('emergency_contact_name', e.target.value)} style={s.profileInput} />
              </label>
              <label style={s.profileLabel}>Phone
                <input value={draft.emergency_contact_phone} onChange={e => set('emergency_contact_phone', e.target.value)} style={s.profileInput} />
              </label>
            </div>
            <p style={s.profileGroupLabel}>Veterinarian</p>
            <div style={s.profileGrid}>
              <label style={s.profileLabel}>Vet name
                <input value={draft.vet_name} onChange={e => set('vet_name', e.target.value)} style={s.profileInput} />
              </label>
              <label style={s.profileLabel}>Vet phone
                <input value={draft.vet_phone} onChange={e => set('vet_phone', e.target.value)} style={s.profileInput} />
              </label>
              <label style={{ ...s.profileLabel, gridColumn: '1 / -1' }}>Vet address
                <input value={draft.vet_address} onChange={e => set('vet_address', e.target.value)} style={s.profileInput} />
              </label>
            </div>
            {err && <p style={{ margin: 0, fontSize: 13, color: 'var(--error)' }}>{err}</p>}
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" onClick={save} disabled={saving} className="btn btn-primary btn-sm">
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
              <button type="button" onClick={() => setEditing(false)} className="btn btn-ghost btn-sm">Cancel</button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 12 }}>
            <div style={s.profileReadGrid}>
              <ProfileRow label="Phone"   value={formatPhone(shown.phone)} />
              <ProfileRow label="Email"   value={shown.email} />
              <ProfileRow label="Address" value={shown.address} />
            </div>
            <div>
              <p style={s.profileGroupLabel}>Emergency contact</p>
              <div style={s.profileReadGrid}>
                <ProfileRow label="Name"  value={shown.emergency_contact_name} />
                <ProfileRow label="Phone" value={formatPhone(shown.emergency_contact_phone)} />
              </div>
            </div>
            <div>
              <p style={s.profileGroupLabel}>Veterinarian</p>
              <div style={s.profileReadGrid}>
                <ProfileRow label="Name"    value={shown.vet_name} />
                <ProfileRow label="Phone"   value={formatPhone(shown.vet_phone)} />
                <ProfileRow label="Address" value={shown.vet_address} />
              </div>
            </div>
          </div>
        )}
    </div>
  )
}

// ── Care Notes card (client-editable standing care notes) ──────
function CareNotesSection({ profile, onSaved }: {
  profile: ClientProfile
  onSaved: (updated: ClientProfile) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft,   setDraft]   = useState(profile.care_notes)
  const [saving,  setSaving]  = useState(false)
  const [err,     setErr]     = useState('')

  async function save() {
    setSaving(true); setErr('')
    const updated = { ...profile, care_notes: draft }
    const resp = await fetch('/api/profile/update', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updated) })
    let json: Record<string, unknown> = {}
    try { json = await resp.json() } catch { /* empty */ }
    if (!resp.ok) { setErr((json.error as string) ?? 'Save failed — try again.'); setSaving(false); return }
    onSaved(updated); setEditing(false); setSaving(false)
  }

  return (
    <div style={{ ...s.sectionCard, borderLeft: '3px solid var(--warning)' }}>
      <div style={s.profileHeader}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14 }}>📋</span>
          <h3 style={{ ...s.sectionTitle, marginBottom: 0 }}>Care Notes</h3>
        </div>
        {!editing && (
          <button type="button" onClick={() => { setDraft(profile.care_notes); setErr(''); setEditing(true) }} className="btn btn-outlined btn-sm">Edit</button>
        )}
      </div>

      {editing ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)' }}>
            Pre-fills into all future bookings. You can override per-stay during booking.
          </p>
          <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={4}
            placeholder="e.g. Feed twice daily, takes Apoquel pill with food…"
            style={{ ...s.profileInput, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }} />
          {err && <p style={{ margin: 0, fontSize: 13, color: 'var(--error)' }}>{err}</p>}
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" onClick={save} disabled={saving} className="btn btn-primary btn-sm">{saving ? 'Saving…' : 'Save'}</button>
            <button type="button" onClick={() => setEditing(false)} className="btn btn-ghost btn-sm">Cancel</button>
          </div>
        </div>
      ) : (
        profile.care_notes?.trim()
          ? <p style={{ ...s.careNotesDisplay, marginTop: 12 }}>{profile.care_notes}</p>
          : <p style={{ margin: '12px 0 0', fontSize: 13, color: 'var(--text-secondary)', fontStyle: 'italic' }}>No care notes yet — add feeding, medication, or handling instructions.</p>
      )}
    </div>
  )
}

// ── Add Dog form ───────────────────────────────────────────────
function AddDogForm({ clientId, authUid, onSave, onCancel }: {
  clientId: string; authUid: string
  onSave:   (dog: SharedDog) => void; onCancel: () => void
}) {
  const supabase  = createClient()
  const inputRef  = useRef<HTMLInputElement>(null)
  const [name,    setName]    = useState('')
  const [birth,   setBirth]   = useState('')
  const [gender,  setGender]  = useState<'male' | 'female' | ''>('')
  const [blob,    setBlob]    = useState<Blob | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [imgErr,  setImgErr]  = useState('')
  const [saving,  setSaving]  = useState(false)
  const [err,     setErr]     = useState('')

  async function handleFile(file: File) {
    setImgErr('')
    try { const b = await processImageFile(file); setBlob(b); setPreview(URL.createObjectURL(b)) }
    catch (e) { setImgErr(e instanceof ImageValidationError ? e.message : 'Could not process image.') }
  }

  async function save() {
    if (!name.trim()) { setErr('Name is required.'); return }
    if (!birth)       { setErr('Birthdate is required.'); return }
    if (!gender)      { setErr('Gender is required.'); return }
    setSaving(true); setErr('')
    const { data, error } = await supabase.from('dogs')
      .insert({ client_id: clientId, name: name.trim(), birthdate: birth, gender })
      .select('id').single()
    if (error || !data) { setErr(error?.message ?? 'Failed to add dog.'); setSaving(false); return }
    let photo_url: string | null = null
    let photoSigned: string | null = null
    if (blob) {
      const path = `${authUid}/${data.id}.jpg`
      const { error: upErr } = await supabase.storage.from('dog-photos').upload(path, blob, { contentType: 'image/jpeg', upsert: true })
      if (!upErr) {
        await supabase.from('dogs').update({ photo_url: path }).eq('id', data.id)
        photo_url = path; photoSigned = preview
      }
    }
    onSave({ id: data.id, name: name.trim(), birthdate: birth, gender, photo_url, photoSigned })
    setSaving(false)
  }

  return (
    <div style={s.addDogCard}>
      <p style={{ margin: '0 0 14px', fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>Add Dog</p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <input ref={inputRef} type="file" accept=".jpg,.jpeg,.png,.heic,.heif,.webp,image/jpeg,image/png,image/heic,image/heif"
          style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = '' }} />
        {preview
          ? <img src={preview} alt="Dog" style={{ width: 80, height: 80, borderRadius: 10, objectFit: 'cover', border: '2px solid var(--border)' }} />
          : <div style={{ width: 80, height: 80, borderRadius: 10, background: 'var(--background)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36 }}>🐕</div>}
        <div>
          <button type="button" onClick={() => inputRef.current?.click()} style={s.photoBtn}>
            {preview ? '📷 Change photo' : '📷 Add photo (optional)'}
          </button>
          {imgErr && <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--error)' }}>{imgErr}</p>}
        </div>
      </div>
      <label style={s.addDogLabel}>Name <span style={{ color: 'var(--error)' }}>*</span>
        <input value={name} onChange={e => setName(e.target.value)} style={s.addDogInput} placeholder="e.g. Biscuit" />
      </label>
      <label style={s.addDogLabel}>Birthdate <span style={{ color: 'var(--error)' }}>*</span>
        <input type="date" value={birth} onChange={e => setBirth(e.target.value)} style={s.addDogInput} />
      </label>
      <div style={{ marginTop: 2 }}>
        <p style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
          Gender <span style={{ color: 'var(--error)' }}>*</span>
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          {(['male', 'female'] as const).map(g => (
            <button key={g} type="button" onClick={() => setGender(g)}
              style={{ ...s.genderToggle, background: gender === g ? 'var(--primary)' : 'var(--background)', color: gender === g ? '#fff' : 'var(--text-primary)', border: `1.5px solid ${gender === g ? 'var(--primary)' : 'var(--border)'}` }}>
              {g === 'male' ? '♂ Male' : '♀ Female'}
            </button>
          ))}
        </div>
      </div>
      {err && <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--error)' }}>{err}</p>}
      <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
        <button type="button" onClick={save} disabled={saving} className="btn btn-primary btn-sm">
          {saving ? 'Saving…' : 'Add dog'}
        </button>
        <button type="button" onClick={onCancel} className="btn btn-ghost btn-sm">Cancel</button>
      </div>
    </div>
  )
}

// ── Reservation card ───────────────────────────────────────────
function ReservationCard({ res, onCancel }: { res: Reservation; onCancel: (id: string) => void }) {
  const isBoarding  = res.service_type === 'boarding'
  const borderColor = resStrokeColor(res.status, res.service_type)
  const nights      = isBoarding ? nightsBetween(res.dropoff_date, res.pickup_date) : null
  const [confirming, setConfirming] = useState(false)

  return (
    <div style={{ ...s.resCard, borderLeftColor: borderColor }}>
      <div style={s.resHeader}>
        <div style={s.resHeaderLeft}>
          <ServicePill type={res.service_type} />
          <StatusBadge status={STATUS_KEY[res.status] ?? 'completed'} />
          {res.status !== 'cancelled' && (
            <StatusBadge status={res.paid ? 'paid' : 'unpaid'} />
          )}
        </div>
        <span style={s.resPrice}>${Number(res.total_price).toFixed(2)}</span>
      </div>
      <p style={s.resDogs}>{res.dogs.join(', ') || '—'}</p>
      <div style={s.resDates}>
        <div>
          <span style={s.dateLabel}>Drop-off</span>
          <span style={s.dateVal}>{fmtDate(res.dropoff_date)} · {fmtTime(res.dropoff_time)}</span>
        </div>
        <div>
          <span style={s.dateLabel}>Pick-up</span>
          <span style={s.dateVal}>{isBoarding ? `${fmtDate(res.pickup_date)} · ${fmtTime(res.pickup_time)}` : fmtTime(res.pickup_time)}</span>
        </div>
        {nights !== null && (
          <div>
            <span style={s.dateLabel}>Duration</span>
            <span style={s.dateVal}>{nights} night{nights !== 1 ? 's' : ''}</span>
          </div>
        )}
      </div>
      {nights !== null && nights > 14 && (
        <p style={s.longStayNote}>
          🌙 Stays over 14 days get a custom flat rate — we&apos;ll reach out to confirm pricing.
          The total above is an estimate for now.
        </p>
      )}
      {res.care_notes && <p style={s.careNotesInline}>📋 {res.care_notes}</p>}
      <div style={s.resMeta}>
        <span style={s.metaItem}>#{res.id.slice(0, 8).toUpperCase()}</span>
        <span style={s.metaItem}>
          {res.payment_method === 'cash' ? '💵 Cash' : <>💙 Venmo · <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{VENMO_USERNAME}</span></>}
        </span>
      </div>
      {res.status === 'upcoming' && (
        <div style={s.cancelRow}>
          {confirming ? (
            <>
              <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>Cancel this booking?</span>
              <button type="button" onClick={() => onCancel(res.id)} className="btn btn-destructive btn-xs">Yes, cancel</button>
              <button type="button" onClick={() => setConfirming(false)} className="btn btn-ghost btn-xs">Keep it</button>
            </>
          ) : (
            <button type="button" onClick={() => setConfirming(true)} className="btn btn-destructive-outlined btn-xs">Cancel Booking</button>
          )}
        </div>
      )}
    </div>
  )
}

// ── Meet & Greet section ───────────────────────────────────────
function MeetGreetSection({ status, record, address, onRequest }: {
  status:    ClientProfile['meet_greet_status']
  record:    MeetGreetRecord | null
  address:   string | null
  onRequest: () => Promise<void>
}) {
  const [requesting, setRequesting] = useState(false)
  const [err,        setErr]        = useState('')
  const [agreed,     setAgreed]     = useState(false)

  async function handleRequest() {
    setRequesting(true); setErr('')
    try { await onRequest() }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not send request — please try again.') }
    finally { setRequesting(false) }
  }

  if (status === 'completed') {
    if (!address) return null
    return (
      <div style={s.mgLocation}>
        <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>Our location: </span>
        <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`}
          target="_blank" rel="noopener noreferrer" style={s.mgMapLink}>
          📍 {address}
        </a>
      </div>
    )
  }

  return (
    <div style={{ ...s.mgCard, borderLeftColor: MEET_GREET_COLOR }}>
      {status === 'needed' && (
        <>
          <p style={s.mgLead}>🤝 A Meet &amp; Greet is required before your first stay.</p>
          <p style={s.mgSub}>It&apos;s a quick, free 30-minute visit so we can meet you and your pet(s). Once it&apos;s done, you&apos;ll be able to book boarding and daycare.</p>
          <p style={s.mgSub}>Please review our{' '}
            <a href="/house-rules" target="_blank" rel="noopener noreferrer" style={s.mgLink}>House Rules</a>{' '}
            and <a href="/terms" target="_blank" rel="noopener noreferrer" style={s.mgLink}>Terms of Service</a>{' '}
            before requesting a Meet &amp; Greet.
          </p>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, margin: '0 0 14px', cursor: 'pointer' }}>
            <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)}
              style={{ marginTop: 2, width: 16, height: 16, accentColor: MEET_GREET_COLOR, cursor: 'pointer', flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: 'var(--primary-dark)', lineHeight: 1.5, fontWeight: 600 }}>
              I have read and agree to the House Rules and Terms of Service.
            </span>
          </label>
          {err && <p style={{ margin: '4px 0 10px', fontSize: 13, color: 'var(--error)' }}>{err}</p>}
          <button type="button" onClick={handleRequest} disabled={requesting || !agreed}
            className="btn btn-primary">
            {requesting ? 'Sending…' : 'Request Meet & Greet'}
          </button>
        </>
      )}
      {status === 'requested' && (
        <>
          <p style={s.mgLead}>⏳ Meet &amp; Greet requested</p>
          <p style={s.mgSub}>Thanks! We&apos;ve received your request and will reach out soon to schedule a time. Booking opens once your Meet &amp; Greet is complete.</p>
        </>
      )}
      {status === 'scheduled' && (
        <>
          <p style={s.mgLead}>📅 Meet &amp; Greet scheduled</p>
          {record ? (
            <p style={s.mgSub}>
              You&apos;re all set for <strong style={{ color: 'var(--text-primary)' }}>{fmtDate(record.scheduled_date)}</strong> at{' '}
              <strong style={{ color: 'var(--text-primary)' }}>{fmtTime(record.scheduled_time)}</strong>. We&apos;ll see you then!
            </p>
          ) : (
            <p style={s.mgSub}>Your Meet &amp; Greet is scheduled. You&apos;ll be able to book once it&apos;s complete.</p>
          )}
        </>
      )}
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────
// ── Past & Cancelled — month navigator + "See all" (by year) ───
function PastBookings({ past, onCancel }: { past: Reservation[]; onCancel: (id: string) => void }) {
  const months = useMemo(() => {
    const set = new Set(past.map(r => r.dropoff_date.slice(0, 7)))  // YYYY-MM
    return [...set].sort((a, b) => b.localeCompare(a))               // newest first
  }, [past])
  const byYear = useMemo(() => {
    const map: Record<string, Reservation[]> = {}
    for (const r of past) { (map[r.dropoff_date.slice(0, 4)] ??= []).push(r) }
    return Object.entries(map)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([y, list]) => [y, list.slice().sort((a, b) => b.dropoff_date.localeCompare(a.dropoff_date))] as [string, Reservation[]])
  }, [past])

  const [idx,     setIdx]     = useState(0)
  const [showAll, setShowAll] = useState(false)

  if (past.length === 0) return null

  const activeMonth = months[idx]
  const monthLabel  = new Date(activeMonth + '-01T00:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  const monthList   = past.filter(r => r.dropoff_date.slice(0, 7) === activeMonth)
    .sort((a, b) => b.dropoff_date.localeCompare(a.dropoff_date))

  return (
    <div style={s.sectionCard}>
      <div style={s.profileHeader}>
        <h3 style={{ ...s.sectionTitle, color: 'var(--text-secondary)', marginBottom: 0 }}>Past &amp; Cancelled</h3>
        <button type="button" onClick={() => setShowAll(true)} className="btn btn-ghost btn-sm">See all</button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, margin: '14px 0' }}>
        <button type="button" onClick={() => setIdx(i => Math.min(months.length - 1, i + 1))} disabled={idx >= months.length - 1}
          style={s.navChevron} aria-label="Older month">‹</button>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', minWidth: 140, textAlign: 'center' }}>{monthLabel}</span>
        <button type="button" onClick={() => setIdx(i => Math.max(0, i - 1))} disabled={idx <= 0}
          style={s.navChevron} aria-label="Newer month">›</button>
      </div>

      {monthList.map(res => <ReservationCard key={res.id} res={res} onCancel={onCancel} />)}

      {showAll && (
        <div style={s.modalOverlay} onClick={() => setShowAll(false)}>
          <div style={s.modalCard} onClick={e => e.stopPropagation()}>
            <div style={{ ...s.profileHeader, marginBottom: 8 }}>
              <h3 style={{ ...s.sectionTitle, marginBottom: 0 }}>All Past &amp; Cancelled</h3>
              <button type="button" onClick={() => setShowAll(false)} className="btn btn-ghost btn-sm">Close</button>
            </div>
            {byYear.map(([year, list]) => (
              <div key={year} style={{ marginTop: 16 }}>
                <p style={{ ...s.sectionTitle, color: 'var(--text-secondary)', marginBottom: 10 }}>{year}</p>
                {list.map(res => <ReservationCard key={res.id} res={res} onCancel={onCancel} />)}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default function DashboardPage() {
  const router   = useRouter()
  const supabase = createClient()

  const [profile,       setProfile]       = useState<ClientProfile | null>(null)
  const [clientId,      setClientId]      = useState('')
  const [authUid,       setAuthUid]       = useState('')
  const [dogs,          setDogs]          = useState<SharedDog[]>([])
  const [reservations,  setReservations]  = useState<Reservation[]>([])
  const [loading,       setLoading]       = useState(true)
  const [error,         setError]         = useState('')
  const [cancelError,   setCancelError]   = useState('')
  const [addingDog,     setAddingDog]     = useState(false)
  const [showNewBooking, setShowNewBooking] = useState(false)
  const [announcement, setAnnouncement] = useState<{ message: string; enabled: boolean } | null>(null)
  const [annDismissed, setAnnDismissed] = useState(true)
  const [mgStatus,      setMgStatus]      = useState<ClientProfile['meet_greet_status']>('needed')
  const [mgRecord,      setMgRecord]      = useState<MeetGreetRecord | null>(null)
  const [mgAddress,     setMgAddress]     = useState<string | null>(null)
  const [notifications, setNotifications] = useState<ClientNotification[]>([])

  // Open the inline booking form when arrived via the nav "+ New Booking" (?new=1).
  useEffect(() => {
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('new') === '1') {
      setShowNewBooking(true)
    }
  }, [])

  // Staff-broadcast announcement (shown at top; dismissal remembered per browser
  // until the message text changes).
  useEffect(() => {
    (async () => {
      const { data } = await supabase.rpc('get_announcement')
      const a = parseAnnouncement(data as string | null)
      if (a.enabled && a.message.trim()) {
        setAnnouncement(a)
        setAnnDismissed(typeof window !== 'undefined' && localStorage.getItem('woof_ann_dismissed') === a.message)
      }
    })()
  }, [supabase])

  function dismissAnnouncement() {
    if (typeof window !== 'undefined' && announcement) localStorage.setItem('woof_ann_dismissed', announcement.message)
    setAnnDismissed(true)
  }

  async function refreshHousehold() {
    const { data } = await supabase.from('clients_client_view')
      .select('auth_id, secondary_auth_id, secondary_invite_email').single()
    if (data) setProfile(prev => prev ? { ...prev, auth_id: data.auth_id, secondary_auth_id: data.secondary_auth_id, secondary_invite_email: data.secondary_invite_email } : prev)
  }

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.replace('/auth'); return }
      setAuthUid(session.user.id)

      const [profileRes, dogsRes, resRes] = await Promise.all([
        supabase.from('clients_client_view')
          .select('id, auth_id, secondary_auth_id, secondary_invite_email, first_name, last_name, phone, email, address, emergency_contact_name, emergency_contact_phone, vet_name, vet_phone, vet_address, care_notes, meet_greet_status')
          .single(),
        supabase.from('dogs').select('id, name, birthdate, photo_url, gender').eq('active', true).order('name'),
        supabase.from('reservations')
          .select('id, service_type, status, dropoff_date, dropoff_time, pickup_date, pickup_time, payment_method, total_price, paid, care_notes')
          .order('dropoff_date', { ascending: false }),
      ])

      if (profileRes.error?.code === 'PGRST116' || !profileRes.data) { router.replace('/onboarding'); return }
      if (profileRes.error || dogsRes.error || resRes.error) {
        setError('Failed to load your dashboard. Please refresh.'); setLoading(false); return
      }

      const p = profileRes.data
      setClientId(p?.id ?? '')
      setProfile({
        first_name:              p?.first_name              ?? '',
        last_name:               p?.last_name               ?? '',
        phone:                   p?.phone                   ?? '',
        email:                   p?.email                   ?? '',
        address:                 p?.address                 ?? '',
        emergency_contact_name:  p?.emergency_contact_name  ?? '',
        emergency_contact_phone: p?.emergency_contact_phone ?? '',
        vet_name:                p?.vet_name                ?? '',
        vet_phone:               p?.vet_phone               ?? '',
        vet_address:             p?.vet_address             ?? '',
        care_notes:              p?.care_notes              ?? '',
        meet_greet_status:       p?.meet_greet_status       ?? 'needed',
        auth_id:                 p?.auth_id                 ?? null,
        secondary_auth_id:       p?.secondary_auth_id       ?? null,
        secondary_invite_email:  p?.secondary_invite_email  ?? null,
      })

      const status = p?.meet_greet_status ?? 'needed'
      setMgStatus(status)
      if (status === 'scheduled') {
        const { data: mg } = await supabase.from('meet_greets').select('scheduled_date, scheduled_time')
          .eq('status', 'scheduled').order('scheduled_date', { ascending: true }).limit(1).maybeSingle()
        if (mg) setMgRecord({ scheduled_date: mg.scheduled_date, scheduled_time: mg.scheduled_time })
      } else if (status === 'completed') {
        const { data: setting } = await supabase.from('app_settings').select('value').eq('key', 'meet_greet_address').maybeSingle()
        if (setting?.value) setMgAddress(setting.value)
      }

      const rawDogs = dogsRes.data ?? []
      const dogsWithPhotos: SharedDog[] = await Promise.all(rawDogs.map(async dog => {
        if (!dog.photo_url) return { ...dog, photoSigned: null }
        const { data } = await supabase.storage.from('dog-photos').createSignedUrl(dog.photo_url, 3600)
        return { ...dog, photoSigned: data?.signedUrl ?? null }
      }))
      setDogs(dogsWithPhotos)

      const rawRes = resRes.data ?? []
      if (rawRes.length === 0) { setReservations([]); setLoading(false); return }

      const resIds = rawRes.map(r => r.id)
      const { data: rdRows } = await supabase.from('reservation_dogs').select('reservation_id, dogs(name)').in('reservation_id', resIds)
      const dogMap: Record<string, string[]> = {}
      for (const row of rdRows ?? []) {
        const name = (row.dogs as unknown as { name: string } | null)?.name
        if (!name) continue
        if (!dogMap[row.reservation_id]) dogMap[row.reservation_id] = []
        dogMap[row.reservation_id].push(name)
      }
      setReservations(rawRes.map(r => ({ ...r, dogs: dogMap[r.id] ?? [] })))

      const { data: notes } = await supabase.from('notifications').select('id, message, created_at').eq('read', false).order('created_at', { ascending: false })
      setNotifications(notes ?? [])

      setLoading(false)
    }
    load()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function handlePhotoUpdate(dogId: string, newPath: string, previewUrl: string) {
    setDogs(prev => prev.map(d => d.id === dogId ? { ...d, photo_url: newPath, photoSigned: previewUrl } : d))
  }

  async function handleGenderSave(dogId: string, gender: 'male' | 'female') {
    await supabase.from('dogs').update({ gender }).eq('id', dogId)
    setDogs(prev => prev.map(d => d.id === dogId ? { ...d, gender } : d))
  }

  async function handleEditDog(dogId: string, fields: { name: string; birthdate: string; gender: 'male' | 'female' }) {
    const { error } = await supabase.from('dogs').update({ name: fields.name, birthdate: fields.birthdate, gender: fields.gender }).eq('id', dogId)
    if (error) throw new Error('Could not save — please try again.')
    setDogs(prev => prev.map(d => d.id === dogId ? { ...d, ...fields } : d))
  }

  async function handleRemoveDog(dogId: string) {
    const { error } = await supabase.from('dogs').update({ active: false }).eq('id', dogId)
    if (error) throw new Error('Could not remove — please try again.')
    setDogs(prev => prev.filter(d => d.id !== dogId))
  }

  async function handleCancel(reservationId: string) {
    setCancelError('')
    const { error } = await supabase.from('reservations').update({ status: 'cancelled' }).eq('id', reservationId)
    if (error) { setCancelError('Could not cancel — please try again or contact us.'); return }
    setReservations(prev => prev.map(r => r.id === reservationId ? { ...r, status: 'cancelled' as const } : r))
  }

  async function requestMeetGreet() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.replace('/auth'); return }
    const resp = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/request-meet-greet`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}`, 'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! },
      body: JSON.stringify({ accepted: true, terms_version: TERMS_VERSION }),
    })
    const json = await resp.json().catch(() => ({}))
    if (!resp.ok) throw new Error(json.error ?? 'Request failed — please try again.')
    setMgStatus('requested'); setProfile(prev => prev ? { ...prev, meet_greet_status: 'requested' } : prev)
  }

  async function dismissNotification(id: string) {
    setNotifications(prev => prev.filter(n => n.id !== id))
    await supabase.from('notifications').update({ read: true }).eq('id', id)
  }

  const firstName = profile?.first_name || 'there'
  const { active, past } = sortReservations(reservations)

  if (loading) return <div style={s.center}><p style={{ color: 'var(--text-secondary)' }}>Loading…</p></div>
  if (error)   return <div style={s.center}><p style={{ color: 'var(--error)' }}>{error}</p></div>

  return (
    <div style={s.page}>
      <SiteNav />
      <main style={s.main}>

        {/* ── Staff announcement banner ── */}
        {announcement && !annDismissed && (
          <div style={{ ...s.noteCard, marginBottom: 20 }}>
            <span style={{ fontSize: 16, lineHeight: 1.4 }}>📢</span>
            <p style={s.noteMsg}>{announcement.message}</p>
            <button type="button" onClick={dismissAnnouncement} className="btn btn-xs" style={{ background: 'transparent', color: 'var(--primary-dark)', border: '1.5px solid var(--primary-dark)' }} aria-label="Dismiss announcement">Dismiss</button>
          </div>
        )}

        {/* ── Page header ── */}
        <div style={s.pageHeader}>
          <h2 style={s.greeting}>{greeting()}, {firstName}! 👋</h2>
        </div>

        {/* ── 1/3 + 2/3 two-column layout ── */}
        <div className="profile-layout-client">

          {/* ── LEFT — location, balance, profile ── */}
          <div className="profile-col-left">

            {/* Our Location / Meet & Greet */}
            <div style={s.sectionCard}>
              <h3 style={s.sectionTitle}>{mgStatus === 'completed' ? 'Location' : 'Meet & Greet'}</h3>
              {mgStatus === 'completed' && mgAddress ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <iframe
                    title="Meet &amp; Greet location"
                    src={`https://maps.google.com/maps?q=${encodeURIComponent(mgAddress)}&z=15&output=embed`}
                    style={{ width: '100%', height: 180, border: 0, borderRadius: 12, display: 'block' }}
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                  />
                  <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mgAddress)}`}
                    target="_blank" rel="noopener noreferrer" style={s.mgMapLink}>📍 {mgAddress}</a>
                  <a href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(mgAddress)}`}
                    target="_blank" rel="noopener noreferrer" className="btn btn-outlined btn-sm" style={{ alignSelf: 'flex-start' }}>Get directions</a>
                </div>
              ) : (
                <MeetGreetSection status={mgStatus} record={mgRecord} address={mgAddress} onRequest={requestMeetGreet} />
              )}
            </div>

            {/* Balance */}
            <BalanceSection reservations={reservations} />

            {/* Profile */}
            {profile && <ProfileSection profile={profile} onSaved={updated => setProfile(updated)} />}

            {/* Manage Users (co-owners) */}
            {profile && clientId && (
              <ManageUsers
                clientId={clientId}
                authUid={authUid}
                primaryAuthId={profile.auth_id}
                primaryName={`${profile.first_name} ${profile.last_name}`.trim()}
                primaryEmail={profile.email}
                secondaryAuthId={profile.secondary_auth_id}
                secondaryEmail={profile.secondary_invite_email}
                onChanged={refreshHousehold}
              />
            )}

          </div>{/* /col-left */}

          {/* ── RIGHT — dogs, care notes, bookings ── */}
          <div className="profile-col-right">

            {cancelError && (
              <p style={{ color: 'var(--error)', fontSize: 13, margin: '0 0 8px' }}>{cancelError}</p>
            )}

            {/* Dogs */}
            <div style={s.sectionCard}>
              <h3 style={s.sectionTitle}>{dogs.length === 1 ? 'Your dog' : 'Your dogs'}</h3>
              <div style={s.dogRow}>
                {dogs.map(dog => (
                  <DogCard
                    key={dog.id}
                    dog={dog}
                    role="client"
                    authUid={authUid}
                    onPhotoUpdate={handlePhotoUpdate}
                    onGenderSave={handleGenderSave}
                    onEdit={handleEditDog}
                    onRemove={handleRemoveDog}
                  />
                ))}
              </div>
              {addingDog ? (
                <AddDogForm
                  clientId={clientId}
                  authUid={authUid}
                  onSave={newDog => { setDogs(prev => [...prev, newDog]); setAddingDog(false) }}
                  onCancel={() => setAddingDog(false)}
                />
              ) : (
                <AddDogButton onClick={() => setAddingDog(true)} />
              )}
            </div>

            {/* Care Notes */}
            {profile && <CareNotesSection profile={profile} onSaved={updated => setProfile(updated)} />}

            {/* Bookings */}
            <div style={s.sectionCard}>
              <div style={s.profileHeader}>
                <h3 style={{ ...s.sectionTitle, marginBottom: 0 }}>Bookings</h3>
                {!showNewBooking && (
                  <button type="button" onClick={() => setShowNewBooking(true)} className="btn btn-booking btn-sm">+ New Booking</button>
                )}
              </div>

              {/* Inline new-booking form (expands like the staff version) */}
              {showNewBooking && (
                <div style={s.inlineForm}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <h4 style={{ ...s.sectionTitle, marginBottom: 0 }}>New Booking</h4>
                    <button type="button" onClick={() => setShowNewBooking(false)} className="btn btn-ghost btn-sm">Close</button>
                  </div>
                  <BookingForm />
                </div>
              )}

              {/* Booking-change notifications — attached to the bookings area */}
              {notifications.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, margin: '14px 0' }}>
                  {notifications.map(n => (
                    <div key={n.id} style={s.noteCard}>
                      <span style={{ fontSize: 16, lineHeight: 1.4 }}>🔔</span>
                      <p style={s.noteMsg}>{n.message}</p>
                      <button type="button" onClick={() => dismissNotification(n.id)} className="btn btn-xs" style={{ background: 'transparent', color: 'var(--primary-dark)', border: '1.5px solid var(--primary-dark)' }} aria-label="Dismiss">Dismiss</button>
                    </div>
                  ))}
                </div>
              )}

              {active.length === 0 && past.length === 0 && (
                <div style={{ ...s.empty, marginTop: 14 }}>
                  <span style={{ fontSize: 36 }}>🏠</span>
                  <p style={{ margin: '12px 0 0', color: 'var(--text-secondary)', fontSize: 14 }}>
                    No bookings yet.{' '}
                    <a href="/booking" style={{ color: 'var(--primary)', fontWeight: 600 }}>Book Your First Stay →</a>
                  </p>
                </div>
              )}
              <div style={{ marginTop: active.length ? 14 : 0 }}>
                {active.map(res => <ReservationCard key={res.id} res={res} onCancel={handleCancel} />)}
              </div>

              <p style={s.bookingDisclaimer}>
                Need to change or cancel a booking? All changes are handled by us —{' '}
                <a href="sms:+14155960160" style={{ color: 'var(--primary)', fontWeight: 700, whiteSpace: 'nowrap' }}>text us at (415) 596-0160</a>.
              </p>
            </div>

            {/* Past & Cancelled — month navigator + See all */}
            <PastBookings past={past} onCancel={handleCancel} />

          </div>{/* /col-right */}
        </div>{/* /profile-layout-client */}
      </main>
    </div>
  )
}

// ── Styles ─────────────────────────────────────────────────────
const s: Record<string, React.CSSProperties> = {
  page:             { minHeight: '100vh', background: 'var(--background)' },
  center:           { display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' },
  main:             { maxWidth: 1100, margin: '0 auto', padding: '28px 24px 60px' },
  // Page header
  pageHeader:       { marginBottom: 20 },
  greeting:         { margin: '0 0 6px', fontSize: 24, fontWeight: 800, color: 'var(--text-primary)' },
  mgLocation:       { margin: '0 0 20px', fontSize: 14 },
  mgMapLink:        { color: 'var(--primary)', fontWeight: 600, textDecoration: 'underline' },
  // Sections
  sectionCard:      { background: 'var(--surface)', borderRadius: 'var(--radius-card)', border: '1px solid var(--border)', padding: '20px 22px', boxShadow: '0 0 3.5px rgba(0,0,0,0.10)' },
  navChevron:       { fontSize: 22, lineHeight: 1, width: 38, height: 38, borderRadius: 999, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-primary)', cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' },
  inlineForm:       { marginTop: 14, padding: '16px', background: 'var(--background)', border: '1px solid var(--border)', borderRadius: 'var(--radius-card)', display: 'flex', flexDirection: 'column', gap: 8 },
  bookingDisclaimer:{ margin: '16px 0 0', paddingTop: 14, borderTop: '1px solid var(--border)', fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.6 },
  modalOverlay:     { position: 'fixed', inset: 0, background: 'rgba(46,42,38,0.45)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px', zIndex: 50, overflowY: 'auto' },
  modalCard:        { background: 'var(--surface)', borderRadius: 'var(--radius-card)', padding: '20px 22px', boxShadow: 'var(--hover-shadow)', width: '100%', maxWidth: 560, maxHeight: '85vh', overflowY: 'auto' },
  sectionTitle:     { margin: '0 0 14px', fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.06em' },
  // Dogs
  dogRow:           { display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 14 },
  addDogCard:       { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-card)', padding: '20px 22px', boxShadow: '0 0 3.5px rgba(0,0,0,0.10)', display: 'flex', flexDirection: 'column', gap: 12 },
  addDogLabel:      { display: 'flex', flexDirection: 'column' as const, gap: 4, fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' },
  addDogInput:      { fontSize: 13, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-primary)', fontFamily: 'inherit', marginTop: 2 },
  photoBtn:         { fontSize: 12, color: 'var(--primary)', background: 'none', border: '1px solid var(--primary-light)', borderRadius: 6, padding: '5px 12px', cursor: 'pointer', fontFamily: 'inherit' },
  genderToggle:     { fontSize: 13, fontWeight: 600, padding: '6px 14px', borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--background)', color: 'var(--text-primary)', cursor: 'pointer', fontFamily: 'inherit' },
  // Meet & Greet
  mgCard:           { background: '#fff7ed', border: '1px solid var(--primary-light)', borderLeft: '4px solid', borderRadius: 'var(--radius-card)', padding: '18px 22px', boxShadow: '0 0 3.5px rgba(0,0,0,0.10)' },
  mgLead:           { margin: '0 0 6px', fontSize: 15, fontWeight: 700, color: 'var(--primary-dark)' },
  mgSub:            { margin: '0 0 14px', fontSize: 13, color: 'var(--primary-dark)', lineHeight: 1.6, opacity: 0.85 },
  mgLink:           { color: 'var(--primary-dark)', fontWeight: 700, textDecoration: 'underline' },
  // Reservations
  empty:            { background: 'var(--background)', border: '2px dashed var(--border)', borderRadius: 'var(--radius-card)', padding: '40px 24px', textAlign: 'center' },
  resCard:          { background: 'var(--surface)', borderRadius: 'var(--radius-card)', border: '1px solid var(--border)', borderLeft: '4px solid', padding: '18px 20px', marginBottom: 14, boxShadow: '0 0 3.5px rgba(0,0,0,0.10)' },
  resHeader:        { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  resHeaderLeft:    { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  resPrice:         { fontSize: 18, fontWeight: 800, color: 'var(--text-primary)' },
  resDogs:          { margin: '0 0 10px', fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' },
  resDates:         { display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 },
  dateLabel:        { fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginRight: 8 },
  dateVal:          { fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500 },
  careNotesInline:  { margin: '8px 0', fontSize: 13, color: 'var(--text-secondary)', fontStyle: 'italic', background: 'var(--background)', borderRadius: 6, padding: '6px 10px' },
  longStayNote:     { margin: '8px 0', fontSize: 12.5, color: 'var(--primary-dark)', background: 'var(--primary-light)', border: '1px solid var(--primary)', borderRadius: 8, padding: '8px 10px', lineHeight: 1.5, opacity: 0.9 },
  resMeta:          { display: 'flex', gap: 12, marginTop: 8 },
  metaItem:         { fontSize: 11, color: 'var(--text-secondary)' },
  cancelRow:        { marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  // Notifications
  noteCard:         { display: 'flex', alignItems: 'flex-start', gap: 10, background: 'var(--primary-light)', border: '1px solid var(--primary)', borderRadius: 'var(--radius-card)', padding: '14px 16px' },
  noteMsg:          { margin: 0, flex: 1, fontSize: 14, color: 'var(--primary-dark)', lineHeight: 1.5 },
  // Profile
  profileHeader:    { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  profileGrid:      { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px' },
  profileLabel:     { display: 'flex', flexDirection: 'column' as const, gap: 4, fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' },
  profileInput:     { fontSize: 13, padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-primary)', fontFamily: 'inherit', marginTop: 2, width: '100%', boxSizing: 'border-box' as const },
  profileGroupLabel:{ margin: '0 0 8px', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' },
  profileReadGrid:  { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px' },
  profileReadRow:   { display: 'flex', flexDirection: 'column' as const, gap: 2 },
  profileReadLabel: { fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' },
  profileReadValue: { fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' },
  careNotesDisplay: { margin: 0, fontSize: 13, color: 'var(--text-primary)', background: 'var(--background)', borderRadius: 8, padding: '8px 12px', lineHeight: 1.6 },
}
