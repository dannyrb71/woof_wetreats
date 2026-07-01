'use client'
import React, { useEffect } from 'react'

// Route-level error boundary. Catches runtime errors in any page/segment
// and renders a recoverable UI instead of a blank/refreshing screen.
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error('Route error:', error) }, [error])

  return (
    <div style={s.page}>
      <div style={s.card}>
        <span style={{ fontSize: 40 }}>🐾</span>
        <h1 style={s.title}>Something went wrong</h1>
        <p style={s.body}>
          Sorry — an unexpected error occurred. You can try again, or head back home.
        </p>
        {error?.message && <p style={s.detail}>{error.message}</p>}
        <div style={s.row}>
          <button type="button" onClick={() => reset()} style={s.primary}>Try again</button>
          <a href="/" style={s.secondary}>Back to home</a>
        </div>
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  page:      { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: '#fff' },
  card:      { background: '#fff', borderRadius: 'var(--radius-card)', padding: '40px 36px', width: '100%', maxWidth: 440, boxShadow: '0 4px 24px rgba(0,0,0,0.08)', textAlign: 'center' },
  title:     { margin: '16px 0 8px', fontSize: 24, fontWeight: 800, color: '#111827' },
  body:      { margin: '0 0 12px', fontSize: 15, lineHeight: 1.6, color: '#6b7280' },
  detail:    { margin: '0 0 20px', fontSize: 13, color: '#9ca3af', fontFamily: 'monospace', wordBreak: 'break-word' },
  row:       { display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' },
  primary:   { fontSize: 14, fontWeight: 600, color: '#fff', background: '#2563eb', border: 'none', borderRadius: 8, padding: '10px 20px', cursor: 'pointer', fontFamily: 'inherit' },
  secondary: { fontSize: 14, fontWeight: 600, color: '#374151', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '10px 20px', textDecoration: 'none' },
}
