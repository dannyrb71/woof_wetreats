'use client'
import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient, routeUser } from '@/lib/supabase'

// Landing page for BOTH flows:
//  - Password reset (resetPasswordForEmail → type=recovery)
//  - Staff invite (inviteUserByEmail → type=invite)
// In both cases the link establishes a session via the token in the URL;
// the user then sets a password here and is routed to the right place.
export default function SetPasswordPage() {
  const router   = useRouter()
  const supabase = createClient()

  const [phase,    setPhase]    = useState<'checking' | 'ready' | 'no_session'>('checking')
  const [password, setPassword] = useState('')
  const [confirm,  setConfirm]  = useState('')
  const [error,    setError]    = useState('')
  const [saving,   setSaving]   = useState(false)

  useEffect(() => {
    let settled = false

    // The session may arrive slightly after mount as supabase-js parses the
    // token from the URL hash, so listen as well as check immediately.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session && !settled) { settled = true; setPhase('ready') }
    })

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session && !settled) { settled = true; setPhase('ready') }
      else if (!settled) {
        // Give the hash-parsing listener a brief moment before giving up
        setTimeout(() => { if (!settled) setPhase('no_session') }, 1500)
      }
    })

    return () => sub.subscription.unsubscribe()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return }
    if (password !== confirm) { setError('Passwords do not match.'); return }

    setSaving(true)
    const { error } = await supabase.auth.updateUser({ password })
    if (error) { setError(error.message); setSaving(false); return }

    // Password set — send them to the right home based on staff/client status
    await routeUser(supabase, router)
  }

  return (
    <div style={s.page}>
      <div style={s.card}>
        <h1 style={s.title}>🐾 Woof Wetreats</h1>

        {phase === 'checking' && (
          <p style={s.muted}>Verifying your link…</p>
        )}

        {phase === 'no_session' && (
          <>
            <h2 style={s.h2}>Link expired or invalid</h2>
            <p style={s.muted}>
              This password link is no longer valid. Password links expire after a short time
              and can only be used once.
            </p>
            <a href="/auth" style={s.linkBtn}>Back to Sign In</a>
          </>
        )}

        {phase === 'ready' && (
          <>
            <h2 style={s.h2}>Set your password</h2>
            <p style={s.subtitle}>Choose a password to finish.</p>
            <form onSubmit={handleSubmit} style={s.form}>
              <label style={s.label}>New password
                <input style={s.input} type="password" value={password}
                  onChange={e => setPassword(e.target.value)} required minLength={6} autoComplete="new-password" autoFocus />
              </label>
              <label style={s.label}>Confirm password
                <input style={s.input} type="password" value={confirm}
                  onChange={e => setConfirm(e.target.value)} required minLength={6} autoComplete="new-password" />
              </label>
              {error && <p style={s.error}>{error}</p>}
              <button style={s.submitBtn} type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Set Password & Continue'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  page:      { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: '#fff' },
  card:      { background: '#fff', borderRadius: 16, padding: '40px 36px', width: '100%', maxWidth: 400, boxShadow: '0 4px 24px rgba(0,0,0,0.08)' },
  title:     { margin: '0 0 20px', fontSize: 24, fontWeight: 700, textAlign: 'center' },
  h2:        { margin: '0 0 6px', fontSize: 20, fontWeight: 700, color: '#111827' },
  subtitle:  { margin: '0 0 20px', color: '#6b7280', fontSize: 14 },
  muted:     { color: '#6b7280', fontSize: 14, lineHeight: 1.6 },
  form:      { display: 'flex', flexDirection: 'column', gap: 14 },
  label:     { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 14, fontWeight: 500 },
  input:     { padding: '10px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, outline: 'none' },
  error:     { color: '#ef4444', fontSize: 13, margin: 0 },
  submitBtn: { padding: '11px 0', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: 'pointer', marginTop: 4 },
  linkBtn:   { display: 'inline-block', marginTop: 16, padding: '10px 18px', background: '#2563eb', color: '#fff', borderRadius: 8, textDecoration: 'none', fontSize: 14, fontWeight: 600 },
}
