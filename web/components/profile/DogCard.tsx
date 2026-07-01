'use client'
import React, { useState } from 'react'
import { DogPhotoUploader } from '@/components/dogs/DogPhotoUploader'

function dogNameColor(gender: string | null): string {
  if (gender === 'male')   return 'var(--dog-male)'
  if (gender === 'female') return 'var(--dog-female)'
  return 'var(--text-primary)'
}

function ageLabel(birthdate: string): string {
  const birth  = new Date(birthdate + 'T00:00:00')
  const now    = new Date()
  const months = (now.getFullYear() - birth.getFullYear()) * 12 + (now.getMonth() - birth.getMonth())
  return months < 12 ? `${months}mo` : `${Math.floor(months / 12)}yr`
}

function isPuppy(birthdate: string): boolean {
  const birth  = new Date(birthdate + 'T00:00:00')
  const now    = new Date()
  const months = (now.getFullYear() - birth.getFullYear()) * 12 + (now.getMonth() - birth.getMonth())
  return months < 12
}

// ── Types ─────────────────────────────────────────────────────
export interface SharedDog {
  id:          string
  name:        string
  birthdate:   string
  gender:      string | null
  photo_url:   string | null
  photoSigned: string | null
}

interface BaseProps {
  dog:       SharedDog
  authUid:   string
  /** Border/accent color driven by service type (staff) or primary (client) */
  accentColor?: string
}

interface StaffProps extends BaseProps {
  role:        'staff'
  pathPrefix:  string
  onPhotoUpload: (dogId: string, newPath: string, previewUrl: string) => void
}

interface ClientProps extends BaseProps {
  role:        'client'
  onPhotoUpdate: (dogId: string, newPath: string, previewUrl: string) => void
  onGenderSave:  (dogId: string, gender: 'male' | 'female') => void
  onEdit:        (dogId: string, fields: { name: string; birthdate: string; gender: 'male' | 'female' }) => Promise<void>
  onRemove:      (dogId: string) => Promise<void>
}

type Props = StaffProps | ClientProps

// ── Component ─────────────────────────────────────────────────
export function DogCard(props: Props) {
  const { dog, authUid, accentColor = 'var(--border)' } = props

  // Client-only edit state
  const [editing,   setEditing]   = useState(false)
  const [eName,     setEName]     = useState(dog.name)
  const [eBirth,    setEBirth]    = useState(dog.birthdate)
  const [eGender,   setEGender]   = useState<'male' | 'female' | ''>((dog.gender as 'male' | 'female') ?? '')
  const [saving,    setSaving]    = useState(false)
  const [editErr,   setEditErr]   = useState('')

  // Client-only remove state
  const [confirming, setConfirming] = useState(false)
  const [removing,   setRemoving]   = useState(false)
  const [removeErr,  setRemoveErr]  = useState('')

  function openEdit() {
    setEName(dog.name); setEBirth(dog.birthdate)
    setEGender((dog.gender as 'male' | 'female') ?? '')
    setEditErr(''); setEditing(true)
  }

  async function handleSaveEdit() {
    if (props.role !== 'client') return
    if (!eName.trim()) { setEditErr('Name is required.'); return }
    if (!eBirth)       { setEditErr('Birthdate is required.'); return }
    if (!eGender)      { setEditErr('Gender is required.'); return }
    setSaving(true); setEditErr('')
    try {
      await props.onEdit(dog.id, { name: eName.trim(), birthdate: eBirth, gender: eGender })
      setEditing(false)
    } catch (e) {
      setEditErr(e instanceof Error ? e.message : 'Could not save — try again.')
    } finally { setSaving(false) }
  }

  async function handleRemove() {
    if (props.role !== 'client') return
    setRemoving(true); setRemoveErr('')
    try {
      await props.onRemove(dog.id)
    } catch (e) {
      setRemoveErr(e instanceof Error ? e.message : 'Could not remove — try again.')
      setRemoving(false)
    }
  }

  const puppy = isPuppy(dog.birthdate)

  // ── Edit mode (client only) ──
  if (editing && props.role === 'client') {
    return (
      <div style={{ ...s.card, borderColor: accentColor }}>
        {dog.photoSigned
          ? <img src={dog.photoSigned} alt={dog.name} style={s.photo} />
          : <div style={s.avatar}>🐕</div>}
        <label style={s.editLabel}>Name
          <input value={eName} onChange={e => setEName(e.target.value)} style={s.editInput} />
        </label>
        <label style={s.editLabel}>Birthdate
          <input type="date" value={eBirth} onChange={e => setEBirth(e.target.value)} style={s.editInput} />
        </label>
        <div style={{ width: '100%' }}>
          <p style={{ margin: '0 0 6px', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>Gender</p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            {(['male', 'female'] as const).map(g => (
              <button key={g} type="button" onClick={() => setEGender(g)}
                style={{ ...s.genderToggle, background: eGender === g ? 'var(--primary)' : 'var(--background)', color: eGender === g ? '#fff' : 'var(--text-primary)', border: `1.5px solid ${eGender === g ? 'var(--primary)' : 'var(--border)'}` }}>
                {g === 'male' ? '♂ Male' : '♀ Female'}
              </button>
            ))}
          </div>
        </div>
        {editErr && <p style={{ margin: 0, fontSize: 12, color: 'var(--error)', textAlign: 'center' }}>{editErr}</p>}
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={handleSaveEdit} disabled={saving} className="btn btn-primary btn-xs">
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button type="button" onClick={() => setEditing(false)} disabled={saving} className="btn btn-ghost btn-xs">Cancel</button>
        </div>
      </div>
    )
  }

  // ── Normal display ──
  return (
    <div style={{ ...s.card, borderColor: accentColor }}>
      {dog.photoSigned
        ? <img src={dog.photoSigned} alt={dog.name} style={s.photo} />
        : <div style={s.avatar}>🐕</div>}
      <p style={{ ...s.name, color: dogNameColor(dog.gender) }}>{dog.name}</p>
      <p style={s.meta}>
        {ageLabel(dog.birthdate)} · {dog.birthdate}
        {dog.gender && <> · {dog.gender === 'male' ? '♂' : '♀'}</>}
      </p>
      {!dog.gender && props.role === 'client' && (
        <div style={s.genderPrompt}>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--warning)', fontWeight: 600 }}>What&apos;s {dog.name}&apos;s gender?</p>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['male', 'female'] as const).map(g => (
              <button key={g} type="button" onClick={() => (props as ClientProps).onGenderSave(dog.id, g)} style={s.genderToggle}>
                {g === 'male' ? '♂ Male' : '♀ Female'}
              </button>
            ))}
          </div>
        </div>
      )}
      {!dog.gender && props.role === 'staff' && (
        <p style={{ margin: 0, fontSize: 12, color: 'var(--warning)' }}>Gender not set</p>
      )}
      {puppy && <span style={s.puppyBadge}>🐾 Puppy</span>}

      {props.role === 'staff' ? (
        <DogPhotoUploader
          dogId={dog.id}
          authUid={authUid}
          pathPrefix={(props as StaffProps).pathPrefix}
          currentPath={dog.photo_url ?? null}
          onDone={(newPath, previewUrl) => (props as StaffProps).onPhotoUpload(dog.id, newPath, previewUrl)}
        />
      ) : (
        <DogPhotoUploader
          dogId={dog.id}
          authUid={authUid}
          currentPath={dog.photo_url ?? null}
          onDone={(path, url) => (props as ClientProps).onPhotoUpdate(dog.id, path, url)}
        />
      )}

      {/* Client-only: edit + remove */}
      {props.role === 'client' && (
        confirming ? (
          <div style={s.removeConfirm}>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-primary)', fontWeight: 600, textAlign: 'center' }}>Remove {dog.name}?</p>
            {removeErr && <p style={{ margin: 0, fontSize: 12, color: 'var(--error)' }}>{removeErr}</p>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={handleRemove} disabled={removing} className="btn btn-destructive btn-xs">
                {removing ? 'Removing…' : 'Yes, Remove'}
              </button>
              <button type="button" onClick={() => setConfirming(false)} disabled={removing} className="btn btn-ghost btn-xs">Keep</button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
            <button type="button" onClick={openEdit} className="btn btn-outlined btn-xs">Edit</button>
            <button type="button" onClick={() => setConfirming(true)} className="btn btn-ghost btn-xs">Remove</button>
          </div>
        )
      )}
    </div>
  )
}

// ── Styles ─────────────────────────────────────────────────────
const s: Record<string, React.CSSProperties> = {
  card:        { background: 'var(--surface)', borderRadius: 'var(--radius-card)', border: '1.5px solid', padding: '20px 18px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, boxShadow: '0 0 3.5px rgba(0,0,0,0.10)' },
  photo:       { width: 96, height: 96, borderRadius: 12, objectFit: 'cover' as const, border: '2px solid var(--border)' },
  avatar:      { width: 96, height: 96, borderRadius: 12, background: 'var(--background)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 48 },
  name:        { margin: 0, fontWeight: 700, fontSize: 15 },
  meta:        { margin: '0 0 2px', fontSize: 12, color: 'var(--text-secondary)', textAlign: 'center' as const },
  puppyBadge:  { fontSize: 11, fontWeight: 700, background: 'var(--primary-light)', color: 'var(--primary-dark)', padding: '3px 10px', borderRadius: 10 },
  genderPrompt:{ background: 'var(--background)', borderRadius: 8, padding: '10px 12px', display: 'flex', flexDirection: 'column' as const, gap: 8, alignItems: 'center', width: '100%', boxSizing: 'border-box' as const },
  genderToggle:{ fontSize: 13, fontWeight: 600, padding: '6px 14px', borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--background)', color: 'var(--text-primary)', cursor: 'pointer', fontFamily: 'inherit' },
  editLabel:   { display: 'flex', flexDirection: 'column' as const, gap: 4, fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', width: '100%' },
  editInput:   { fontSize: 13, padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-primary)', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' as const },
  removeConfirm:{ display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 8, width: '100%' },
}
