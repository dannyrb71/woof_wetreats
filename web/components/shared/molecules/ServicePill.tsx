'use client'
import React from 'react'

/* ── ServicePill ─────────────────────────────────────────────────────────────
   Single source of truth for every service/activity pill in the app.
   Locked-in design system (globals.css tokens):
   • All solid-filled, white text, 999px radius, Inter Semi Bold 11px, icon + label
   • Meet & Greet is the ONLY outlined pill (white bg, colored stroke + text)
   • Height/box-sizing fixed so solid + outlined pills line up when adjacent

   Do NOT re-implement pills inline. Add a new `type` here instead.            */

export type ServiceType =
  | 'boarding'
  | 'daycare'
  | 'in-progress'
  | 'arrival'
  | 'departure'
  | 'long-stay'
  | 'meet-greet'

const PILLS: Record<ServiceType, { label: string; color: string; outlined?: boolean }> = {
  boarding:     { label: '🏠 Boarding',     color: 'var(--status-boarding)' },
  daycare:      { label: '🌞 Daycare',      color: 'var(--status-daycare)' },
  'in-progress':{ label: 'In Progress',     color: 'var(--status-in-progress)' },
  arrival:      { label: '⬇ Arrival',       color: 'var(--status-arrival)' },
  departure:    { label: '⬆ Departure',     color: 'var(--status-departure)' },
  'long-stay':  { label: '🌙 Long Stay',    color: 'var(--status-long-stay)' },
  'meet-greet': { label: '🤝 Meet & Greet', color: 'var(--status-meet-greet)', outlined: true },
}

const BASE: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  height: 22,
  fontSize: 11,
  fontWeight: 700,
  padding: '0 10px',
  borderRadius: 999,
  whiteSpace: 'nowrap',
  letterSpacing: '0.01em',
  boxSizing: 'border-box',
  lineHeight: 1,
}

interface Props {
  type: ServiceType
  /** Override the default label text (icon stays unless you include your own) */
  label?: string
  style?: React.CSSProperties
}

export function ServicePill({ type, label, style }: Props) {
  const spec = PILLS[type]
  const text = label ?? spec.label
  const skin: React.CSSProperties = spec.outlined
    ? { background: '#fff', color: spec.color, border: `1.5px solid ${spec.color}` }
    : { background: spec.color, color: '#fff' }
  return <span style={{ ...BASE, ...skin, ...style }}>{text}</span>
}
