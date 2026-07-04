'use client'
import React from 'react'

/* ── Money ────────────────────────────────────────────────────────────────────
   Single source of truth for rendering a booking amount. When the booking is
   cancelled the amount is struck through (and muted) — everywhere it's shown:
   cards, lists, and the fee-breakdown popup. Never re-implement the strike inline. */
export function Money({ value, cancelled, style }: {
  value:      number
  cancelled?: boolean
  style?:     React.CSSProperties
}) {
  return (
    <span style={{ ...style, ...(cancelled ? { textDecoration: 'line-through', color: 'var(--text-secondary)' } : {}) }}>
      ${Number(value).toFixed(2)}
    </span>
  )
}
