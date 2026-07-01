'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import BookingForm from '@/components/booking/BookingForm'

export default function BookingPage() {
  const router   = useRouter()
  const supabase = createClient()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.replace('/auth'); return }
      const { data } = await supabase.rpc('get_client_auth_status')
      const status = data?.[0]?.status
      if (status !== 'complete') { router.replace('/'); return }
      setReady(true)
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (!ready) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
      <p style={{ color: '#6b7280' }}>Loading…</p>
    </div>
  )

  return (
    <div style={s.page}>
      <div style={s.card}>
        <div style={s.header}>
          <button type="button" onClick={() => router.push('/dashboard')} style={s.back}>← Back</button>
          <h1 style={s.title}>New Booking</h1>
        </div>
        <BookingForm />
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  page:   { minHeight: '100vh', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '32px 16px' },
  card:   { background: '#fff', borderRadius: 'var(--radius-card)', padding: '28px 32px', width: '100%', maxWidth: 660, boxShadow: '0 4px 24px rgba(0,0,0,0.08)' },
  header: { display: 'flex', alignItems: 'center', gap: 16, marginBottom: 4 },
  back:   { background: 'none', border: 'none', color: '#6b7280', fontSize: 14, cursor: 'pointer', padding: 0 },
  title:  { margin: 0, fontSize: 22, fontWeight: 700 },
}
