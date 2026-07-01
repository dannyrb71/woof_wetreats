'use client'
import React from 'react'

/* ── StatusBadge ─────────────────────────────────────────────────────────────
   Single source of truth for booking lifecycle + payment status badges.
   Token-based skins (locked-in design system). Soft tint backgrounds pair with
   a token-colored label. Do NOT re-implement status pills inline.

   lifecycle: upcoming | in-progress | completed | cancelled
   payment:   paid | unpaid | partial | overridden                              */

export type StatusType =
  | 'upcoming'
  | 'in-progress'
  | 'completed'
  | 'cancelled'
  | 'paid'
  | 'unpaid'
  | 'partial'
  | 'overridden'

const STATUS: Record<StatusType, { label: string; bg: string; color: string }> = {
  upcoming:     { label: 'Upcoming',     bg: 'var(--primary-light)', color: 'var(--primary-dark)' },
  'in-progress':{ label: 'In Progress',  bg: '#E7F1E8',              color: 'var(--success)' },
  completed:    { label: 'Completed',    bg: 'var(--background)',    color: 'var(--text-secondary)' },
  cancelled:    { label: 'Cancelled',    bg: '#FBECEC',              color: 'var(--error)' },
  paid:         { label: '✅ Paid',      bg: '#EEF6EF',              color: 'var(--success)' },
  unpaid:       { label: '● Unpaid',     bg: '#FBF4E9',              color: 'var(--warning)' },
  partial:      { label: 'Partial',      bg: '#FBF4E9',              color: 'var(--warning)' },
  overridden:   { label: '✎ Overridden', bg: '#FBF1E0',             color: 'var(--primary-dark)' },
}

const BASE: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  fontSize: 11,
  fontWeight: 700,
  padding: '3px 9px',
  borderRadius: 999,
  letterSpacing: '0.02em',
  whiteSpace: 'nowrap',
  lineHeight: 1.2,
}

interface Props {
  status: StatusType
  label?: string
  style?: React.CSSProperties
}

export function StatusBadge({ status, label, style }: Props) {
  const spec = STATUS[status] ?? STATUS.completed
  return (
    <span style={{ ...BASE, background: spec.bg, color: spec.color, ...style }}>
      {label ?? spec.label}
    </span>
  )
}
