import React from 'react'

// 404 page for unmatched routes.
export default function NotFound() {
  return (
    <div style={s.page}>
      <div style={s.card}>
        <span style={{ fontSize: 40 }}>🐾</span>
        <h1 style={s.title}>Page not found</h1>
        <p style={s.body}>The page you&apos;re looking for doesn&apos;t exist or may have moved.</p>
        <a href="/" style={s.link}>Back to home</a>
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  page:  { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: '#fff' },
  card:  { background: '#fff', borderRadius: 'var(--radius-card)', padding: '40px 36px', width: '100%', maxWidth: 440, boxShadow: '0 4px 24px rgba(0,0,0,0.08)', textAlign: 'center' },
  title: { margin: '16px 0 8px', fontSize: 24, fontWeight: 800, color: '#111827' },
  body:  { margin: '0 0 20px', fontSize: 15, lineHeight: 1.6, color: '#6b7280' },
  link:  { display: 'inline-block', fontSize: 14, fontWeight: 600, color: '#fff', background: '#2563eb', borderRadius: 8, padding: '10px 20px', textDecoration: 'none' },
}
