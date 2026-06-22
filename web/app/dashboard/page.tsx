'use client'
import React, { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { DogPhotoUploader } from '@/components/dogs/DogPhotoUploader'
import { processImageFile, ImageValidationError } from '@/lib/image-utils'
import { TERMS_VERSION } from '@/lib/terms'
import { SiteNav } from '@/components/SiteNav'

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
}

interface MeetGreetRecord {
  scheduled_date: string
  scheduled_time: string
}

interface Dog {
  id:          string
  name:        string
  birthdate:   string
  photo_url:   string | null
  photoSigned: string | null
  gender:      string | null
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
  care_notes:     string | null
  dogs:           string[]
}

// ── Helpers ────────────────────────────────────────────────────
const SVC_COLORS = { boarding: '#0058A0', daycare: '#C5A92B' }
const MEET_GREET_COLOR = '#EA580C' // orange — consistent with staff calendar

function fmtDate(ymd: string): string {
  const d = new Date(ymd + 'T00:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtTime(t: string): string {
  const [h, m] = t.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}

function nightsBetween(a: string, b: string): number {
  return Math.round((new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime()) / 86400000)
}

function ageLabel(birthdate: string): string {
  const birth = new Date(birthdate + 'T00:00:00')
  const now   = new Date()
  const months = (now.getFullYear() - birth.getFullYear()) * 12 + (now.getMonth() - birth.getMonth())
  if (months < 12) return `${months}mo`
  return `${Math.floor(months / 12)}yr`
}

// Status takes priority over service-type for stroke color
function resStrokeColor(status: Reservation['status'], serviceType: 'boarding' | 'daycare'): string {
  if (status === 'cancelled' || status === 'completed') return '#9ca3af'
  if (status === 'in_progress') return '#16a34a'
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

// ── Status badge ───────────────────────────────────────────────
function StatusBadge({ status }: { status: Reservation['status'] }) {
  const map: Record<string, { label: string; bg: string; color: string }> = {
    upcoming:    { label: 'Upcoming',    bg: '#eff6ff', color: '#1d4ed8' },
    in_progress: { label: 'In Progress', bg: '#f0fdf4', color: '#15803d' },
    completed:   { label: 'Completed',   bg: '#f3f4f6', color: '#374151' },
    cancelled:   { label: 'Cancelled',   bg: '#fff1f2', color: '#be123c' },
  }
  const { label, bg, color } = map[status] ?? map.completed
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 20, background: bg, color, letterSpacing: '0.02em' }}>
      {label}
    </span>
  )
}

// ── Profile section ────────────────────────────────────────────
function ProfileRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={s.profileReadRow}>
      <span style={s.profileReadLabel}>{label}</span>
      <span style={s.profileReadValue}>{value || <span style={{ color: '#d1d5db' }}>—</span>}</span>
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
  const [expanded, setExpanded] = useState(false)

  function startEdit() {
    setDraft({ ...profile })
    setErr('')
    setEditing(true)
    setExpanded(true)
  }

  function set(field: keyof ClientProfile, value: string) {
    setDraft(prev => ({ ...prev, [field]: value }))
  }

  async function save() {
    setSaving(true)
    setErr('')
    const resp = await fetch('/api/profile/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft),
    })
    let json: Record<string, unknown> = {}
    try { json = await resp.json() } catch { /* empty */ }
    if (!resp.ok) { setErr((json.error as string) ?? 'Save failed — try again.'); setSaving(false); return }
    onSaved(draft)
    setEditing(false)
    setSaving(false)
  }

  const shown = editing ? draft : profile

  return (
    <section style={s.section}>
      <div style={s.profileHeader}>
        <h3 style={s.sectionTitle}>Your Profile</h3>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {!editing && (
            <button type="button" onClick={() => setExpanded(e => !e)} style={s.expandBtn}>
              {expanded ? 'Hide ↑' : 'Show ↓'}
            </button>
          )}
          {!editing && (
            <button type="button" onClick={startEdit} style={s.profileEditBtn}>Edit</button>
          )}
        </div>
      </div>

      {(expanded || editing) && (
        <div style={s.profileCard}>
          {editing ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={s.profileGrid}>
                <label style={s.profileLabel}>
                  First name
                  <input value={draft.first_name} onChange={e => set('first_name', e.target.value)} style={s.profileInput} />
                </label>
                <label style={s.profileLabel}>
                  Last name
                  <input value={draft.last_name} onChange={e => set('last_name', e.target.value)} style={s.profileInput} />
                </label>
                <label style={s.profileLabel}>
                  Phone
                  <input value={draft.phone} onChange={e => set('phone', e.target.value)} style={s.profileInput} />
                </label>
                <label style={{ ...s.profileLabel, gridColumn: '1 / -1' }}>
                  Address
                  <input value={draft.address} onChange={e => set('address', e.target.value)} style={s.profileInput} />
                </label>
              </div>
              <p style={s.profileGroupLabel}>Emergency contact</p>
              <div style={s.profileGrid}>
                <label style={s.profileLabel}>
                  Name
                  <input value={draft.emergency_contact_name} onChange={e => set('emergency_contact_name', e.target.value)} style={s.profileInput} />
                </label>
                <label style={s.profileLabel}>
                  Phone
                  <input value={draft.emergency_contact_phone} onChange={e => set('emergency_contact_phone', e.target.value)} style={s.profileInput} />
                </label>
              </div>
              <p style={s.profileGroupLabel}>Veterinarian</p>
              <div style={s.profileGrid}>
                <label style={s.profileLabel}>
                  Vet name
                  <input value={draft.vet_name} onChange={e => set('vet_name', e.target.value)} style={s.profileInput} />
                </label>
                <label style={s.profileLabel}>
                  Vet phone
                  <input value={draft.vet_phone} onChange={e => set('vet_phone', e.target.value)} style={s.profileInput} />
                </label>
                <label style={{ ...s.profileLabel, gridColumn: '1 / -1' }}>
                  Vet address
                  <input value={draft.vet_address} onChange={e => set('vet_address', e.target.value)} style={s.profileInput} />
                </label>
              </div>
              <p style={s.profileGroupLabel}>Standing care notes</p>
              <p style={{ margin: '-8px 0 4px', fontSize: 12, color: '#9ca3af' }}>
                Pre-fills into all future bookings. Override per-stay during booking if needed.
              </p>
              <textarea
                value={draft.care_notes}
                onChange={e => set('care_notes', e.target.value)}
                rows={3}
                placeholder="e.g. Feed twice daily, takes Apoquel pill with food…"
                style={{ ...s.profileInput, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
              />
              {err && <p style={{ margin: 0, fontSize: 13, color: '#ef4444' }}>{err}</p>}
              <div style={{ display: 'flex', gap: 10 }}>
                <button type="button" onClick={save} disabled={saving}
                  style={{ ...s.saveProfileBtn, opacity: saving ? 0.6 : 1, cursor: saving ? 'not-allowed' : 'pointer' }}>
                  {saving ? 'Saving…' : 'Save Changes'}
                </button>
                <button type="button" onClick={() => setEditing(false)} style={s.cancelProfileBtn}>Cancel</button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={s.profileReadGrid}>
                <ProfileRow label="Phone"   value={shown.phone} />
                <ProfileRow label="Email"   value={shown.email} />
                <ProfileRow label="Address" value={shown.address} />
              </div>
              <div>
                <p style={s.profileGroupLabel}>Emergency contact</p>
                <div style={s.profileReadGrid}>
                  <ProfileRow label="Name"  value={shown.emergency_contact_name} />
                  <ProfileRow label="Phone" value={shown.emergency_contact_phone} />
                </div>
              </div>
              <div>
                <p style={s.profileGroupLabel}>Veterinarian</p>
                <div style={s.profileReadGrid}>
                  <ProfileRow label="Name"    value={shown.vet_name} />
                  <ProfileRow label="Phone"   value={shown.vet_phone} />
                  <ProfileRow label="Address" value={shown.vet_address} />
                </div>
              </div>
              {shown.care_notes && (
                <div>
                  <p style={s.profileGroupLabel}>Standing care notes</p>
                  <p style={s.careNotesDisplay}>{shown.care_notes}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  )
}

// ── Add Dog form ───────────────────────────────────────────────
function AddDogForm({ clientId, authUid, onSave, onCancel }: {
  clientId: string
  authUid:  string
  onSave:   (dog: Dog) => void
  onCancel: () => void
}) {
  const supabase   = createClient()
  const inputRef   = useRef<HTMLInputElement>(null)
  const [name,     setName]     = useState('')
  const [birth,    setBirth]    = useState('')
  const [gender,   setGender]   = useState<'male' | 'female' | ''>('')
  const [blob,     setBlob]     = useState<Blob | null>(null)
  const [preview,  setPreview]  = useState<string | null>(null)
  const [imgErr,   setImgErr]   = useState('')
  const [saving,   setSaving]   = useState(false)
  const [err,      setErr]      = useState('')

  async function handleFile(file: File) {
    setImgErr('')
    try {
      const b = await processImageFile(file)
      setBlob(b)
      setPreview(URL.createObjectURL(b))
    } catch (e) {
      setImgErr(e instanceof ImageValidationError ? e.message : 'Could not process image.')
    }
  }

  async function save() {
    if (!name.trim())  { setErr('Name is required.'); return }
    if (!birth)        { setErr('Birthdate is required.'); return }
    if (!gender)       { setErr('Gender is required.'); return }

    setSaving(true)
    setErr('')

    const { data, error } = await supabase
      .from('dogs')
      .insert({ client_id: clientId, name: name.trim(), birthdate: birth, gender })
      .select('id')
      .single()

    if (error || !data) { setErr(error?.message ?? 'Failed to add dog.'); setSaving(false); return }

    let photo_url: string | null = null
    let photoSigned: string | null = null
    if (blob) {
      const path = `${authUid}/${data.id}.jpg`
      const { error: upErr } = await supabase.storage
        .from('dog-photos').upload(path, blob, { contentType: 'image/jpeg', upsert: true })
      if (!upErr) {
        await supabase.from('dogs').update({ photo_url: path }).eq('id', data.id)
        photo_url   = path
        photoSigned = preview
      }
    }

    onSave({ id: data.id, name: name.trim(), birthdate: birth, gender, photo_url, photoSigned })
    setSaving(false)
  }

  return (
    <div style={s.addDogCard}>
      <p style={{ margin: '0 0 14px', fontWeight: 700, fontSize: 14, color: '#111827' }}>Add a Dog</p>

      {/* Photo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <input ref={inputRef} type="file"
          accept=".jpg,.jpeg,.png,.heic,.heif,.webp,image/jpeg,image/png,image/heic,image/heif"
          style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = '' }} />
        {preview
          ? <img src={preview} alt="Dog" style={{ width: 80, height: 80, borderRadius: 10, objectFit: 'cover', border: '2px solid #e5e7eb' }} />
          : <div style={{ width: 80, height: 80, borderRadius: 10, background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36 }}>🐕</div>
        }
        <div>
          <button type="button" onClick={() => inputRef.current?.click()} style={s.photoBtn}>
            {preview ? '📷 Change photo' : '📷 Add photo (optional)'}
          </button>
          {imgErr && <p style={{ margin: '4px 0 0', fontSize: 11, color: '#ef4444' }}>{imgErr}</p>}
        </div>
      </div>

      {/* Name */}
      <label style={s.addDogLabel}>
        Name <span style={{ color: '#ef4444' }}>*</span>
        <input value={name} onChange={e => setName(e.target.value)} style={s.addDogInput} placeholder="e.g. Biscuit" />
      </label>

      {/* Birthdate */}
      <label style={s.addDogLabel}>
        Birthdate <span style={{ color: '#ef4444' }}>*</span>
        <input type="date" value={birth} onChange={e => setBirth(e.target.value)} style={s.addDogInput} />
      </label>

      {/* Gender */}
      <div style={{ marginTop: 2 }}>
        <p style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 600, color: '#374151' }}>
          Gender <span style={{ color: '#ef4444' }}>*</span>
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          {(['male', 'female'] as const).map(g => (
            <button
              key={g}
              type="button"
              onClick={() => setGender(g)}
              style={{
                ...s.genderToggle,
                background: gender === g ? '#2563eb' : '#f3f4f6',
                color:      gender === g ? '#fff'    : '#374151',
                border:     gender === g ? '1.5px solid #2563eb' : '1.5px solid #e5e7eb',
              }}
            >
              {g === 'male' ? '♂ Male' : '♀ Female'}
            </button>
          ))}
        </div>
      </div>

      {err && <p style={{ margin: '8px 0 0', fontSize: 13, color: '#ef4444' }}>{err}</p>}

      <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
        <button type="button" onClick={save} disabled={saving}
          style={{ ...s.saveProfileBtn, opacity: saving ? 0.6 : 1, cursor: saving ? 'not-allowed' : 'pointer' }}>
          {saving ? 'Saving…' : 'Add dog'}
        </button>
        <button type="button" onClick={onCancel} style={s.cancelProfileBtn}>Cancel</button>
      </div>
    </div>
  )
}

// ── Dog card ───────────────────────────────────────────────────
function DogCard({ dog, authUid, onPhotoUpdate, onGenderSave, onEdit, onRemove }: {
  dog:           Dog
  authUid:       string
  onPhotoUpdate: (dogId: string, newPath: string, previewUrl: string) => void
  onGenderSave:  (dogId: string, gender: 'male' | 'female') => void
  onEdit:        (dogId: string, fields: { name: string; birthdate: string; gender: 'male' | 'female' }) => Promise<void>
  onRemove:      (dogId: string) => Promise<void>
}) {
  const [confirming, setConfirming] = useState(false)
  const [removing,   setRemoving]   = useState(false)
  const [removeErr,  setRemoveErr]  = useState('')

  const [editing,   setEditing]   = useState(false)
  const [eName,     setEName]     = useState(dog.name)
  const [eBirth,    setEBirth]    = useState(dog.birthdate)
  const [eGender,   setEGender]   = useState<'male' | 'female' | ''>((dog.gender as 'male' | 'female') ?? '')
  const [saving,    setSaving]    = useState(false)
  const [editErr,   setEditErr]   = useState('')

  function openEdit() {
    setEName(dog.name)
    setEBirth(dog.birthdate)
    setEGender((dog.gender as 'male' | 'female') ?? '')
    setEditErr('')
    setEditing(true)
  }

  async function handleSaveEdit() {
    if (!eName.trim()) { setEditErr('Name is required.'); return }
    if (!eBirth)       { setEditErr('Birthdate is required.'); return }
    if (!eGender)      { setEditErr('Gender is required.'); return }
    setSaving(true)
    setEditErr('')
    try {
      await onEdit(dog.id, { name: eName.trim(), birthdate: eBirth, gender: eGender })
      setEditing(false)
    } catch (e) {
      setEditErr(e instanceof Error ? e.message : 'Could not save — try again.')
    } finally {
      setSaving(false)
    }
  }

  async function handleRemove() {
    setRemoving(true)
    setRemoveErr('')
    try {
      await onRemove(dog.id)
    } catch (e) {
      setRemoveErr(e instanceof Error ? e.message : 'Could not remove — try again.')
      setRemoving(false)
    }
  }

  if (editing) {
    return (
      <div style={s.dogCard}>
        {dog.photoSigned
          ? <img src={dog.photoSigned} alt={dog.name} style={s.dogPhoto} />
          : <div style={s.dogAvatar}>🐕</div>
        }
        <label style={s.editDogLabel}>
          Name
          <input value={eName} onChange={e => setEName(e.target.value)} style={s.editDogInput} />
        </label>
        <label style={s.editDogLabel}>
          Birthdate
          <input type="date" value={eBirth} onChange={e => setEBirth(e.target.value)} style={s.editDogInput} />
        </label>
        <div style={{ width: '100%' }}>
          <p style={{ margin: '0 0 6px', fontSize: 12, fontWeight: 600, color: '#374151' }}>Gender</p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            {(['male', 'female'] as const).map(g => (
              <button key={g} type="button" onClick={() => setEGender(g)}
                style={{
                  ...s.genderToggle,
                  background: eGender === g ? '#2563eb' : '#f3f4f6',
                  color:      eGender === g ? '#fff'    : '#374151',
                  border:     eGender === g ? '1.5px solid #2563eb' : '1.5px solid #e5e7eb',
                }}>
                {g === 'male' ? '♂ Male' : '♀ Female'}
              </button>
            ))}
          </div>
        </div>
        {editErr && <p style={{ margin: 0, fontSize: 12, color: '#ef4444', textAlign: 'center' }}>{editErr}</p>}
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={handleSaveEdit} disabled={saving}
            style={{ ...s.removeYes, background: '#2563eb', opacity: saving ? 0.6 : 1, cursor: saving ? 'not-allowed' : 'pointer' }}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button type="button" onClick={() => setEditing(false)} disabled={saving} style={s.removeNo}>
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={s.dogCard}>
      {dog.photoSigned
        ? <img src={dog.photoSigned} alt={dog.name} style={s.dogPhoto} />
        : <div style={s.dogAvatar}>🐕</div>
      }
      <p style={s.dogName}>{dog.name}</p>
      <p style={s.dogAge}>
        {ageLabel(dog.birthdate)} · {dog.birthdate}
        {dog.gender && <> · {dog.gender === 'male' ? '♂' : '♀'}</>}
      </p>
      {dog.gender === null && (
        <div style={s.genderPrompt}>
          <p style={s.genderPromptText}>What's {dog.name}'s gender?</p>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['male', 'female'] as const).map(g => (
              <button key={g} type="button" onClick={() => onGenderSave(dog.id, g)} style={s.genderToggle}>
                {g === 'male' ? '♂ Male' : '♀ Female'}
              </button>
            ))}
          </div>
        </div>
      )}
      <DogPhotoUploader
        dogId={dog.id}
        authUid={authUid}
        currentPath={dog.photo_url}
        onDone={(path, url) => onPhotoUpdate(dog.id, path, url)}
      />

      {confirming ? (
        <div style={s.removeConfirm}>
          <p style={s.removeConfirmText}>Remove {dog.name} from your pets?</p>
          {removeErr && <p style={{ margin: 0, fontSize: 12, color: '#ef4444' }}>{removeErr}</p>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={handleRemove} disabled={removing}
              style={{ ...s.removeYes, opacity: removing ? 0.6 : 1, cursor: removing ? 'not-allowed' : 'pointer' }}>
              {removing ? 'Removing…' : 'Yes, Remove'}
            </button>
            <button type="button" onClick={() => setConfirming(false)} disabled={removing} style={s.removeNo}>
              Keep
            </button>
          </div>
        </div>
      ) : (
        <div style={s.dogCardActions}>
          <button type="button" onClick={openEdit} style={s.editBtn}>
            Edit
          </button>
          <button type="button" onClick={() => setConfirming(true)} style={s.removeBtn}>
            Remove
          </button>
        </div>
      )}
    </div>
  )
}

// ── Reservation card ───────────────────────────────────────────
function ReservationCard({ res, onCancel }: { res: Reservation; onCancel: (id: string) => void }) {
  const isBoarding  = res.service_type === 'boarding'
  const borderColor = resStrokeColor(res.status, res.service_type)
  const svcColor    = SVC_COLORS[res.service_type]
  const nights      = isBoarding ? nightsBetween(res.dropoff_date, res.pickup_date) : null
  const [confirming, setConfirming] = useState(false)

  return (
    <div style={{ ...s.resCard, borderLeftColor: borderColor }}>
      <div style={s.resHeader}>
        <div style={s.resHeaderLeft}>
          <span style={{ ...s.serviceBadge, color: svcColor, borderColor: svcColor }}>
            {isBoarding ? '🏠 Boarding' : '🌞 Daycare'}
          </span>
          <StatusBadge status={res.status} />
        </div>
        <span style={s.resPrice}>${Number(res.total_price).toFixed(2)}</span>
      </div>
      <p style={s.resDogs}>{res.dogs.join(', ') || '—'}</p>
      <div style={s.resDates}>
        <div>
          <span style={s.dateLabel}>Drop-off</span>
          <span style={s.dateVal}>{fmtDate(res.dropoff_date)} · {fmtTime(res.dropoff_time)}</span>
        </div>
        {isBoarding && (
          <div>
            <span style={s.dateLabel}>Pick-up</span>
            <span style={s.dateVal}>{fmtDate(res.pickup_date)} · {fmtTime(res.pickup_time)}</span>
          </div>
        )}
        {nights !== null && (
          <div>
            <span style={s.dateLabel}>Duration</span>
            <span style={s.dateVal}>{nights} night{nights !== 1 ? 's' : ''}</span>
          </div>
        )}
      </div>
      {res.care_notes && <p style={s.careNotes}>📋 {res.care_notes}</p>}
      <div style={s.resMeta}>
        <span style={s.metaItem}>#{res.id.slice(0, 8).toUpperCase()}</span>
        <span style={s.metaItem}>{res.payment_method === 'cash' ? '💵 Cash' : '💙 Venmo'}</span>
      </div>
      {res.status === 'upcoming' && (
        <div style={s.cancelRow}>
          {confirming ? (
            <>
              <span style={s.confirmText}>Cancel this reservation?</span>
              <button type="button" onClick={() => onCancel(res.id)} style={s.confirmYes}>Yes, cancel</button>
              <button type="button" onClick={() => setConfirming(false)} style={s.confirmNo}>Keep it</button>
            </>
          ) : (
            <button type="button" onClick={() => setConfirming(true)} style={s.cancelBtn}>Cancel Reservation</button>
          )}
        </div>
      )}
    </div>
  )
}

// ── Meet & Greet section ───────────────────────────────────────
function MeetGreetSection({ status, record, address, onRequest }: {
  status:   ClientProfile['meet_greet_status']
  record:   MeetGreetRecord | null
  address:  string | null
  onRequest: () => Promise<void>
}) {
  const [requesting, setRequesting] = useState(false)
  const [err,        setErr]        = useState('')
  const [agreed,     setAgreed]     = useState(false)

  async function handleRequest() {
    setRequesting(true)
    setErr('')
    try {
      await onRequest()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not send request — please try again.')
    } finally {
      setRequesting(false)
    }
  }

  return (
    <section style={s.section}>
      <h3 style={s.sectionTitle}>Meet &amp; Greet</h3>
      <div style={{ ...s.mgCard, borderLeftColor: MEET_GREET_COLOR }}>
        {status === 'needed' && (
          <>
            <p style={s.mgLead}>🤝 A Meet &amp; Greet is required before your first stay.</p>
            <p style={s.mgSub}>It&apos;s a quick, free 30-minute visit so we can meet you and your pet(s). Once it&apos;s done, you&apos;ll be able to book boarding and daycare.</p>
            <p style={s.mgReview}>
              Please review our{' '}
              <a href="/house-rules" target="_blank" rel="noopener noreferrer" style={s.mgLink}>House Rules</a>{' '}
              and{' '}
              <a href="/terms" target="_blank" rel="noopener noreferrer" style={s.mgLink}>Terms of Service</a>{' '}
              before requesting a Meet &amp; Greet.
            </p>
            <label style={s.mgCheckRow}>
              <input
                type="checkbox"
                checked={agreed}
                onChange={e => setAgreed(e.target.checked)}
                style={s.mgCheckbox}
              />
              <span style={s.mgCheckText}>
                I have read and agree to the House Rules and Terms of Service.
              </span>
            </label>
            {err && <p style={{ margin: '4px 0 10px', fontSize: 13, color: '#ef4444' }}>{err}</p>}
            <button type="button" onClick={handleRequest} disabled={requesting || !agreed}
              style={{ ...s.mgBtn, opacity: (requesting || !agreed) ? 0.5 : 1, cursor: (requesting || !agreed) ? 'not-allowed' : 'pointer' }}>
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
                You&apos;re all set for <strong style={{ color: '#111827' }}>{fmtDate(record.scheduled_date)}</strong> at{' '}
                <strong style={{ color: '#111827' }}>{fmtTime(record.scheduled_time)}</strong>. We&apos;ll see you then! You&apos;ll be able to book once it&apos;s complete.
              </p>
            ) : (
              <p style={s.mgSub}>Your Meet &amp; Greet is scheduled. You&apos;ll be able to book once it&apos;s complete.</p>
            )}
          </>
        )}

        {status === 'completed' && (
          <>
            <p style={s.mgLead}>✅ Meet &amp; Greet complete — you&apos;re ready to book!</p>
            {address && (
              <p style={s.mgSub}>
                Our location: <strong style={{ color: '#111827' }}>{address}</strong>
              </p>
            )}
          </>
        )}
      </div>
    </section>
  )
}

// ── Page ───────────────────────────────────────────────────────
export default function DashboardPage() {
  const router   = useRouter()
  const supabase = createClient()

  const [profile,      setProfile]      = useState<ClientProfile | null>(null)
  const [clientId,     setClientId]     = useState('')
  const [authUid,      setAuthUid]      = useState('')
  const [dogs,         setDogs]         = useState<Dog[]>([])
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState('')
  const [cancelError,  setCancelError]  = useState('')
  const [addingDog,    setAddingDog]    = useState(false)
  const [mgStatus,     setMgStatus]     = useState<ClientProfile['meet_greet_status']>('needed')
  const [mgRecord,     setMgRecord]     = useState<MeetGreetRecord | null>(null)
  const [mgAddress,    setMgAddress]    = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.replace('/auth'); return }
      setAuthUid(session.user.id)

      const [profileRes, dogsRes, resRes] = await Promise.all([
        supabase.from('clients_client_view')
          .select('id, first_name, last_name, phone, email, address, emergency_contact_name, emergency_contact_phone, vet_name, vet_phone, vet_address, care_notes, meet_greet_status')
          .single(),
        supabase.from('dogs').select('id, name, birthdate, photo_url, gender').eq('active', true).order('name'),
        supabase.from('reservations')
          .select('id, service_type, status, dropoff_date, dropoff_time, pickup_date, pickup_time, payment_method, total_price, care_notes')
          .order('dropoff_date', { ascending: false }),
      ])

      if (profileRes.error || dogsRes.error || resRes.error) {
        setError('Failed to load your dashboard. Please refresh.')
        setLoading(false)
        return
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
      })

      // Meet & Greet state
      const status = p?.meet_greet_status ?? 'needed'
      setMgStatus(status)
      if (status === 'scheduled') {
        const { data: mg } = await supabase
          .from('meet_greets')
          .select('scheduled_date, scheduled_time')
          .eq('status', 'scheduled')
          .order('scheduled_date', { ascending: true })
          .limit(1)
          .maybeSingle()
        if (mg) setMgRecord({ scheduled_date: mg.scheduled_date, scheduled_time: mg.scheduled_time })
      } else if (status === 'completed') {
        const { data: setting } = await supabase
          .from('app_settings')
          .select('value')
          .eq('key', 'meet_greet_address')
          .maybeSingle()
        if (setting?.value) setMgAddress(setting.value)
      }

      const rawDogs = dogsRes.data ?? []
      const dogsWithPhotos: Dog[] = await Promise.all(rawDogs.map(async dog => {
        if (!dog.photo_url) return { ...dog, photoSigned: null }
        const { data } = await supabase.storage.from('dog-photos').createSignedUrl(dog.photo_url, 3600)
        return { ...dog, photoSigned: data?.signedUrl ?? null }
      }))
      setDogs(dogsWithPhotos)

      const rawRes = resRes.data ?? []
      if (rawRes.length === 0) { setReservations([]); setLoading(false); return }

      const resIds = rawRes.map(r => r.id)
      const { data: rdRows } = await supabase
        .from('reservation_dogs')
        .select('reservation_id, dogs(name)')
        .in('reservation_id', resIds)

      const dogMap: Record<string, string[]> = {}
      for (const row of rdRows ?? []) {
        const name = (row.dogs as unknown as { name: string } | null)?.name
        if (!name) continue
        if (!dogMap[row.reservation_id]) dogMap[row.reservation_id] = []
        dogMap[row.reservation_id].push(name)
      }

      setReservations(rawRes.map(r => ({ ...r, dogs: dogMap[r.id] ?? [] })))
      setLoading(false)
    }
    load()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function handlePhotoUpdate(dogId: string, newPath: string, previewUrl: string) {
    setDogs(prev => prev.map(d =>
      d.id === dogId ? { ...d, photo_url: newPath, photoSigned: previewUrl } : d
    ))
  }

  async function handleGenderSave(dogId: string, gender: 'male' | 'female') {
    await supabase.from('dogs').update({ gender }).eq('id', dogId)
    setDogs(prev => prev.map(d => d.id === dogId ? { ...d, gender } : d))
  }

  async function handleEditDog(dogId: string, fields: { name: string; birthdate: string; gender: 'male' | 'female' }) {
    const { error } = await supabase.from('dogs')
      .update({ name: fields.name, birthdate: fields.birthdate, gender: fields.gender })
      .eq('id', dogId)
    if (error) throw new Error('Could not save — please try again.')
    setDogs(prev => prev.map(d => d.id === dogId ? { ...d, ...fields } : d))
  }

  async function handleRemoveDog(dogId: string) {
    // Soft-delete: hide from the owner's view while preserving reservation history
    const { error } = await supabase.from('dogs').update({ active: false }).eq('id', dogId)
    if (error) throw new Error('Could not remove — please try again.')
    setDogs(prev => prev.filter(d => d.id !== dogId))
  }

  async function handleCancel(reservationId: string) {
    setCancelError('')
    const { error } = await supabase
      .from('reservations').update({ status: 'cancelled' }).eq('id', reservationId)
    if (error) { setCancelError('Could not cancel — please try again or contact us.'); return }
    setReservations(prev =>
      prev.map(r => r.id === reservationId ? { ...r, status: 'cancelled' as const } : r)
    )
  }

  async function requestMeetGreet() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.replace('/auth'); return }

    const resp = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/request-meet-greet`,
      {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          'apikey':        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        },
        body: JSON.stringify({ accepted: true, terms_version: TERMS_VERSION }),
      }
    )
    const json = await resp.json().catch(() => ({}))
    if (!resp.ok) throw new Error(json.error ?? 'Request failed — please try again.')
    setMgStatus('requested')
    setProfile(prev => prev ? { ...prev, meet_greet_status: 'requested' } : prev)
  }

  const firstName = profile?.first_name || 'there'
  const { active, past } = sortReservations(reservations)

  if (loading) return <div style={s.center}><p style={{ color: '#6b7280' }}>Loading…</p></div>
  if (error)   return <div style={s.center}><p style={{ color: '#ef4444' }}>{error}</p></div>

  return (
    <div style={s.page}>
      <SiteNav />

      <main style={s.main}>
        <h2 style={s.greeting}>Welcome back, {firstName}! 👋</h2>

        {/* ── Meet & Greet ── */}
        <MeetGreetSection
          status={mgStatus}
          record={mgRecord}
          address={mgAddress}
          onRequest={requestMeetGreet}
        />

        {/* ── Dogs ── */}
        <section style={s.section}>
          <h3 style={s.sectionTitle}>{dogs.length === 1 ? 'Your dog' : dogs.length > 1 ? 'Your dogs' : 'Your dogs'}</h3>
          <div style={s.dogRow}>
            {dogs.map(dog => (
              <DogCard
                key={dog.id}
                dog={dog}
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
            <button type="button" onClick={() => setAddingDog(true)} style={s.addDogBtn}>
              + Add a Dog
            </button>
          )}
        </section>

        {/* ── Profile ── */}
        {profile && (
          <ProfileSection profile={profile} onSaved={updated => setProfile(updated)} />
        )}

        {cancelError && (
          <p style={{ color: '#ef4444', fontSize: 13, marginBottom: 12 }}>{cancelError}</p>
        )}

        {/* ── Active reservations ── */}
        <section style={s.section}>
          <h3 style={s.sectionTitle}>Reservations</h3>
          {active.length === 0 && past.length === 0 && (
            <div style={s.empty}>
              <span style={{ fontSize: 36 }}>🏠</span>
              <p style={{ margin: '12px 0 0', color: '#6b7280', fontSize: 14 }}>
                No reservations yet.{' '}
                <a href="/booking" style={{ color: '#2563eb', fontWeight: 600 }}>Book Your First Stay →</a>
              </p>
            </div>
          )}
          {active.map(res => <ReservationCard key={res.id} res={res} onCancel={handleCancel} />)}
        </section>

        {/* ── Past reservations ── */}
        {past.length > 0 && (
          <section style={s.section}>
            <h3 style={{ ...s.sectionTitle, color: '#9ca3af' }}>Past & Cancelled</h3>
            {past.map(res => <ReservationCard key={res.id} res={res} onCancel={handleCancel} />)}
          </section>
        )}
      </main>
    </div>
  )
}

// ── Styles ─────────────────────────────────────────────────────
const s: Record<string, React.CSSProperties> = {
  page:             { minHeight: '100vh', background: 'var(--page-bg)' },
  center:           { display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' },
  header:           { background: '#fff', borderBottom: '1px solid #e5e7eb', position: 'sticky', top: 0, zIndex: 10 },
  headerInner:      { maxWidth: 720, margin: '0 auto', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  headerLeft:       { display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' },
  pawIcon:          { fontSize: 22 },
  appName:          { margin: 0, fontSize: 18, fontWeight: 800, color: '#111827' },
  headerRight:      { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  navLink:          { fontSize: 13, color: '#374151', textDecoration: 'none', fontWeight: 500 },
  newResBtn:        { background: '#2563eb', color: '#fff', padding: '8px 16px', borderRadius: 8, textDecoration: 'none', fontWeight: 600, fontSize: 13 },
  signOutBtn:       { background: 'none', border: '1px solid #e5e7eb', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 13, color: '#6b7280', fontFamily: 'inherit' },
  main:             { maxWidth: 720, margin: '0 auto', padding: '32px 20px 60px' },
  greeting:         { margin: '0 0 28px', fontSize: 22, fontWeight: 800, color: '#111827' },
  section:          { marginBottom: 36 },
  sectionTitle:     { margin: '0 0 16px', fontSize: 14, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.05em' },
  // Dogs
  dogRow:           { display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 16 },
  dogCard:          { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: '18px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, minWidth: 160, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' },
  dogAvatar:        { width: 128, height: 128, borderRadius: 14, background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 60 },
  dogPhoto:         { width: 128, height: 128, borderRadius: 14, objectFit: 'cover' as const, border: '2px solid #e5e7eb' },
  dogName:          { margin: 0, fontWeight: 700, fontSize: 15, color: '#111827' },
  dogAge:           { margin: '0 0 2px', fontSize: 12, color: '#9ca3af', textAlign: 'center' as const },
  genderPrompt:     { background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center', width: '100%', boxSizing: 'border-box' as const },
  genderPromptText: { margin: 0, fontSize: 12, color: '#92400e', fontWeight: 600 },
  genderToggle:     { fontSize: 13, fontWeight: 600, padding: '6px 14px', borderRadius: 8, border: '1.5px solid #e5e7eb', background: '#f3f4f6', color: '#374151', cursor: 'pointer', fontFamily: 'inherit' },
  addDogBtn:        { fontSize: 13, fontWeight: 600, color: '#2563eb', background: '#fff', border: '1.5px dashed #93c5fd', borderRadius: 10, padding: '10px 20px', cursor: 'pointer', fontFamily: 'inherit' },
  dogCardActions:   { display: 'flex', gap: 14, alignItems: 'center' },
  editBtn:          { fontSize: 12, fontWeight: 500, color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: '2px 4px', textDecoration: 'underline' },
  editDogLabel:     { display: 'flex', flexDirection: 'column' as const, gap: 4, fontSize: 12, fontWeight: 600, color: '#374151', width: '100%' },
  editDogInput:     { fontSize: 13, padding: '7px 10px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', color: '#111827', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' as const },
  removeBtn:        { fontSize: 12, fontWeight: 500, color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: '2px 4px', textDecoration: 'underline' },
  removeConfirm:    { display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 8, width: '100%' },
  removeConfirmText:{ margin: 0, fontSize: 12, color: '#374151', fontWeight: 600, textAlign: 'center' as const },
  removeYes:        { fontSize: 12, fontWeight: 600, color: '#fff', background: '#be123c', border: 'none', borderRadius: 6, padding: '5px 12px', fontFamily: 'inherit' },
  removeNo:         { fontSize: 12, fontWeight: 600, color: '#374151', background: '#f3f4f6', border: 'none', borderRadius: 6, padding: '5px 12px', cursor: 'pointer', fontFamily: 'inherit' },
  // Meet & Greet
  mgCard:           { background: '#fff7ed', border: '1px solid #fed7aa', borderLeft: '4px solid', borderRadius: 12, padding: '18px 22px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' },
  mgLead:           { margin: '0 0 6px', fontSize: 15, fontWeight: 700, color: '#9a3412' },
  mgSub:            { margin: '0 0 14px', fontSize: 13, color: '#7c2d12', lineHeight: 1.6 },
  mgBtn:            { fontSize: 14, fontWeight: 700, padding: '10px 22px', borderRadius: 10, border: 'none', background: MEET_GREET_COLOR, color: '#fff', fontFamily: 'inherit' },
  mgReview:         { margin: '0 0 12px', fontSize: 13, color: '#7c2d12', lineHeight: 1.6 },
  mgLink:           { color: '#9a3412', fontWeight: 700, textDecoration: 'underline' },
  mgCheckRow:       { display: 'flex', alignItems: 'flex-start', gap: 8, margin: '0 0 14px', cursor: 'pointer' },
  mgCheckbox:       { marginTop: 2, width: 16, height: 16, accentColor: MEET_GREET_COLOR, cursor: 'pointer', flexShrink: 0 },
  mgCheckText:      { fontSize: 13, color: '#7c2d12', lineHeight: 1.5, fontWeight: 600 },
  addDogCard:       { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: '20px 22px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column', gap: 12 },
  addDogLabel:      { display: 'flex', flexDirection: 'column' as const, gap: 4, fontSize: 13, fontWeight: 600, color: '#374151' },
  addDogInput:      { fontSize: 13, padding: '8px 10px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', color: '#111827', fontFamily: 'inherit', marginTop: 2 },
  photoBtn:         { fontSize: 12, color: '#2563eb', background: 'none', border: '1px solid #bfdbfe', borderRadius: 6, padding: '5px 12px', cursor: 'pointer', fontFamily: 'inherit' },
  // Profile
  profileHeader:    { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  profileEditBtn:   { fontSize: 12, fontWeight: 600, padding: '5px 14px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', color: '#374151', cursor: 'pointer', fontFamily: 'inherit' },
  expandBtn:        { fontSize: 12, fontWeight: 500, padding: '5px 12px', borderRadius: 8, border: '1px solid #e5e7eb', background: 'var(--surface-muted)', color: '#6b7280', cursor: 'pointer', fontFamily: 'inherit' },
  profileCard:      { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '20px 22px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' },
  profileGrid:      { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px' },
  profileLabel:     { display: 'flex', flexDirection: 'column' as const, gap: 4, fontSize: 12, fontWeight: 600, color: '#374151' },
  profileInput:     { fontSize: 13, padding: '7px 10px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', color: '#111827', fontFamily: 'inherit', marginTop: 2, width: '100%', boxSizing: 'border-box' as const },
  profileGroupLabel:{ margin: '0 0 8px', fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' },
  profileReadGrid:  { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px' },
  profileReadRow:   { display: 'flex', flexDirection: 'column' as const, gap: 2 },
  profileReadLabel: { fontSize: 11, color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' },
  profileReadValue: { fontSize: 13, fontWeight: 600, color: '#111827' },
  careNotesDisplay: { margin: 0, fontSize: 13, color: '#374151', background: 'var(--surface-muted)', borderRadius: 8, padding: '8px 12px', lineHeight: 1.6 },
  saveProfileBtn:   { fontSize: 13, fontWeight: 600, padding: '7px 18px', borderRadius: 8, border: 'none', background: '#2563eb', color: '#fff', fontFamily: 'inherit' },
  cancelProfileBtn: { fontSize: 13, fontWeight: 600, padding: '7px 16px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', color: '#374151', cursor: 'pointer', fontFamily: 'inherit' },
  // Reservations
  empty:            { background: '#fff', border: '2px dashed #e5e7eb', borderRadius: 12, padding: '40px 24px', textAlign: 'center' },
  resCard:          { background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', borderLeft: '4px solid', padding: '18px 20px', marginBottom: 14, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' },
  resHeader:        { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  resHeaderLeft:    { display: 'flex', alignItems: 'center', gap: 8 },
  serviceBadge:     { fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 20, border: '1.5px solid', background: 'transparent' },
  resPrice:         { fontSize: 18, fontWeight: 800, color: '#111827' },
  resDogs:          { margin: '0 0 10px', fontSize: 15, fontWeight: 600, color: '#111827' },
  resDates:         { display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 },
  dateLabel:        { fontSize: 11, color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginRight: 8 },
  dateVal:          { fontSize: 13, color: '#374151', fontWeight: 500 },
  careNotes:        { margin: '8px 0', fontSize: 13, color: '#6b7280', fontStyle: 'italic', background: 'var(--surface-muted)', borderRadius: 6, padding: '6px 10px' },
  resMeta:          { display: 'flex', gap: 12, marginTop: 8 },
  metaItem:         { fontSize: 11, color: '#9ca3af' },
  cancelRow:        { marginTop: 12, paddingTop: 12, borderTop: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  cancelBtn:        { fontSize: 12, color: '#be123c', background: 'none', border: '1px solid #fecdd3', borderRadius: 6, padding: '5px 12px', cursor: 'pointer', fontFamily: 'inherit' },
  confirmText:      { fontSize: 13, color: '#374151', fontWeight: 500 },
  confirmYes:       { fontSize: 12, color: '#fff', background: '#be123c', border: 'none', borderRadius: 6, padding: '5px 12px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 },
  confirmNo:        { fontSize: 12, color: '#374151', background: '#f3f4f6', border: 'none', borderRadius: 6, padding: '5px 12px', cursor: 'pointer', fontFamily: 'inherit' },
}
