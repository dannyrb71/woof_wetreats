'use client'
import React from 'react'

/* ── SectionHeader ───────────────────────────────────────────────────────────
   Single source of truth for every card / section title in the app.
   • ALL CAPS label (reuses the .section-label class from globals.css)
   • Optional count badge — sits IMMEDIATELY after the title text, not far-right
   • Optional right-side slot for any atom (primary button, outlined button,
     status badge, "Show/Hide" toggle, etc.)

   Replaces ALL ad-hoc section headers. Do NOT hand-roll section titles.        */

const COUNT_BADGE: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: 20,
  height: 20,
  padding: '0 6px',
  fontSize: 11,
  fontWeight: 700,
  lineHeight: 1,
  borderRadius: 999,
  background: 'var(--primary-light)',
  color: 'var(--primary-dark)',
  letterSpacing: 0,
}

const ROW: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  flexWrap: 'wrap',
  marginBottom: 14,
}

const TITLE_GROUP: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
}

interface Props {
  title: string
  /** Count badge rendered immediately after the title. Omit or null to hide. */
  count?: number | null
  /** Right-aligned slot — any atom (button, badge, toggle…). */
  action?: React.ReactNode
  /** Optional heading element override (default h3). */
  as?: 'h2' | 'h3' | 'h4'
  style?: React.CSSProperties
}

export function SectionHeader({ title, count, action, as = 'h3', style }: Props) {
  const Heading = as
  const showCount = count !== undefined && count !== null
  return (
    <div style={{ ...ROW, ...style }}>
      <span style={TITLE_GROUP}>
        <Heading className="section-label">{title}</Heading>
        {showCount && <span style={COUNT_BADGE}>{count}</span>}
      </span>
      {action != null && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>{action}</span>}
    </div>
  )
}
