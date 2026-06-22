'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient, routeUser } from '@/lib/supabase'

export default function AuthPage() {
  const router = useRouter()
  const [tab,      setTab]      = useState<'signin' | 'signup'>(() =>
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('mode') === 'signup'
      ? 'signup' : 'signin'
  )
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const [forgot,   setForgot]   = useState(false)
  const [resetSent, setResetSent] = useState(false)

  const supabase = createClient()

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setLoading(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/set-password`,
    })
    setLoading(false)
    // Always show the same confirmation (don't reveal whether an account exists)
    if (error && !error.message.toLowerCase().includes('rate')) { setError(error.message); return }
    setResetSent(true)
  }

  async function handleEmailAuth(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setLoading(true)
    try {
      if (tab === 'signup') {
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      }
      await routeUser(supabase, router)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleOAuth(provider: 'google' | 'facebook') {
    setError(''); setLoading(true)
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
    if (error) { setError(error.message); setLoading(false) }
    // On success, browser navigates to provider — no further action needed here
  }

  return (
    <div style={s.page}>
      <div style={s.card}>
        <h1 style={s.title}>🐾 Woof Wetreats</h1>
        <p style={s.subtitle}>Sign in to manage your reservations</p>

        {/* OAuth buttons */}
        <div style={s.oauthGroup}>
          <button type="button" style={s.oauthBtn} onClick={() => handleOAuth('google')} disabled={loading}>
            <svg width="18" height="18" viewBox="0 0 24 24" style={{ marginRight: 8 }}>
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continue with Google
          </button>
        </div>

        <div style={s.divider}><span style={s.dividerText}>or</span></div>

        {forgot ? (
          /* ── Forgot password ── */
          resetSent ? (
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontSize: 15, fontWeight: 600, color: '#111827', margin: '0 0 8px' }}>Check your email 📬</p>
              <p style={{ fontSize: 14, color: '#6b7280', lineHeight: 1.6, margin: '0 0 20px' }}>
                If an account exists for <strong>{email}</strong>, we&apos;ve sent a link to reset your password.
                It may take a minute to arrive — check your spam folder too.
              </p>
              <button type="button" style={s.linkBtn} onClick={() => { setForgot(false); setResetSent(false) }}>
                ← Back to Sign In
              </button>
            </div>
          ) : (
            <form onSubmit={handleForgot} style={s.form}>
              <p style={{ fontSize: 14, color: '#6b7280', margin: '0 0 4px', lineHeight: 1.6 }}>
                Enter your email and we&apos;ll send you a link to reset your password.
              </p>
              <label style={s.label}>Email
                <input style={s.input} type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" autoFocus />
              </label>
              {error && <p style={s.error}>{error}</p>}
              <button style={s.submitBtn} type="submit" disabled={loading}>
                {loading ? 'Sending…' : 'Send Reset Link'}
              </button>
              <button type="button" style={s.linkBtn} onClick={() => { setForgot(false); setError('') }}>
                ← Back to Sign In
              </button>
            </form>
          )
        ) : (
          <>
            {/* Email tabs */}
            <div style={s.tabRow}>
              <button type="button" style={{ ...s.tab, ...(tab === 'signin' ? s.tabActive : {}) }} onClick={() => setTab('signin')}>Sign In</button>
              <button type="button" style={{ ...s.tab, ...(tab === 'signup' ? s.tabActive : {}) }} onClick={() => setTab('signup')}>Create Account</button>
            </div>

            <form onSubmit={handleEmailAuth} style={s.form}>
              <label style={s.label}>Email
                <input style={s.input} type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" />
              </label>
              <label style={s.label}>Password
                <input style={s.input} type="password" value={password} onChange={e => setPassword(e.target.value)} required autoComplete={tab === 'signup' ? 'new-password' : 'current-password'} minLength={6} />
              </label>
              {error && <p style={s.error}>{error}</p>}
              <button style={s.submitBtn} type="submit" disabled={loading}>
                {loading ? 'Please wait…' : tab === 'signup' ? 'Create Account' : 'Sign In'}
              </button>
            </form>

            {tab === 'signin' && (
              <button type="button" style={s.forgotLink} onClick={() => { setForgot(true); setError('') }}>
                Forgot password?
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  page:       { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: '#fff' },
  card:       { background: '#fff', borderRadius: 16, padding: '40px 36px', width: '100%', maxWidth: 400, boxShadow: '0 4px 24px rgba(0,0,0,0.08)' },
  title:      { margin: '0 0 4px', fontSize: 26, fontWeight: 700, textAlign: 'center' },
  subtitle:   { margin: '0 0 24px', color: '#6b7280', textAlign: 'center', fontSize: 14 },
  oauthGroup: { display: 'flex', flexDirection: 'column', gap: 10 },
  oauthBtn:   { display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '10px 16px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 500, color: '#374151' },
  divider:    { margin: '20px 0', textAlign: 'center', position: 'relative', borderTop: '1px solid #e5e7eb' },
  dividerText:{ position: 'relative', top: -10, background: '#fff', padding: '0 12px', color: '#9ca3af', fontSize: 13 },
  tabRow:     { display: 'flex', borderRadius: 8, border: '1px solid #e5e7eb', overflow: 'hidden', marginBottom: 20 },
  tab:        { flex: 1, padding: '8px 0', background: '#fff', border: 'none', cursor: 'pointer', fontSize: 14, color: '#6b7280' },
  tabActive:  { background: '#f3f4f6', fontWeight: 600, color: '#111827' },
  form:       { display: 'flex', flexDirection: 'column', gap: 14 },
  label:      { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 14, fontWeight: 500 },
  input:      { padding: '10px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, outline: 'none' },
  error:      { color: '#ef4444', fontSize: 13, margin: 0 },
  submitBtn:  { padding: '11px 0', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: 'pointer', marginTop: 4 },
  forgotLink: { display: 'block', margin: '16px auto 0', background: 'none', border: 'none', color: '#2563eb', fontSize: 13, fontWeight: 500, cursor: 'pointer', textDecoration: 'underline', fontFamily: 'inherit' },
  linkBtn:    { display: 'block', margin: '4px auto 0', background: 'none', border: 'none', color: '#6b7280', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' },
}
