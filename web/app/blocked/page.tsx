// Static page — no auth check, no redirects, no dynamic data.
// Shown immediately when a client's blocked field is true.
export default function BlockedPage() {
  return (
    <div style={s.page}>
      <div style={s.card}>
        <span style={s.icon}>🚫</span>
        <h1 style={s.title}>This service is no longer available to you</h1>
        <p style={s.body}>
          Your account access has been removed. If you believe this is a mistake,
          please contact us directly.
        </p>
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  page:  { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 },
  card:  { background: '#fff', borderRadius: 'var(--radius-card)', padding: '48px 36px', width: '100%', maxWidth: 440, boxShadow: '0 4px 24px rgba(0,0,0,0.08)', textAlign: 'center' },
  icon:  { fontSize: 48 },
  title: { margin: '16px 0 12px', fontSize: 22, fontWeight: 700, color: '#111827' },
  body:  { margin: 0, color: '#6b7280', fontSize: 15, lineHeight: 1.6 },
}
