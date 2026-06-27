'use client'
import React from 'react'

// Single source of truth for staff-side dog photo sizing. Both the staff
// dashboard (HouseholdCard) and the daily schedule view render dogs through
// this component, so the photo size stays consistent across views.
export const DOG_PHOTO_SIZE = 64

interface Props {
  name:        string
  photoSigned: string | null
  gender:      string | null
  isPuppy?:    boolean
}

export function DogAvatar({ name, photoSigned, gender, isPuppy = false }: Props) {
  const genderMark = gender === 'male' ? '♂' : gender === 'female' ? '♀' : null

  return (
    <div style={s.wrap}>
      {photoSigned
        ? <img src={photoSigned} alt={name} style={s.photo} />
        : <div style={s.fallback}>🐕</div>
      }
      <div style={s.label}>
        <span style={s.name}>
          {name}
          {genderMark && <span style={s.genderMark}> {genderMark}</span>}
        </span>
        {isPuppy && <span style={s.puppyBadge}>Puppy</span>}
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  // Fixed photo-width wrap so a long dog name can never widen it and push the
  // (centered) photo off the left edge — the photo stays flush-left always.
  wrap:       { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, width: DOG_PHOTO_SIZE },
  photo:      { width: DOG_PHOTO_SIZE, height: DOG_PHOTO_SIZE, borderRadius: '50%', objectFit: 'cover' as const, border: '2.5px solid #e5e7eb', flexShrink: 0 },
  fallback:   { width: DOG_PHOTO_SIZE, height: DOG_PHOTO_SIZE, borderRadius: '50%', background: '#f3f4f6', border: '2px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, flexShrink: 0 },
  label:      { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, width: '100%' },
  name:       { fontSize: 12, fontWeight: 600, color: '#374151', textAlign: 'center' as const, lineHeight: 1.2, maxWidth: '100%', overflowWrap: 'break-word' },
  genderMark: { color: '#9ca3af', fontWeight: 400 },
  puppyBadge: { fontSize: 10, fontWeight: 700, background: '#fef3c7', color: '#92400e', padding: '1px 6px', borderRadius: 10 },
}
