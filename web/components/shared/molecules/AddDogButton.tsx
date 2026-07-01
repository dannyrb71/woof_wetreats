'use client'
import React from 'react'

/* ── AddDogButton ────────────────────────────────────────────────────────────
   The single "+ Add Dog" control used everywhere a dog can be added — client
   dashboard, staff profile, and the Rover page. Dashed outline in --primary so
   it reads as an "add" affordance distinct from solid action buttons.
   Do NOT hand-roll add-dog buttons; use this so client + staff stay identical. */

const BASE: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--primary)',
  background: 'var(--surface)',
  border: '1.5px dashed var(--primary-light)',
  padding: '10px 20px',
  cursor: 'pointer',
  fontFamily: 'inherit',
}

interface Props {
  onClick: () => void
  label?: string
  style?: React.CSSProperties
}

export function AddDogButton({ onClick, label = '+ Add Dog', style }: Props) {
  return (
    <button type="button" onClick={onClick} style={{ ...BASE, ...style }}>
      {label}
    </button>
  )
}
