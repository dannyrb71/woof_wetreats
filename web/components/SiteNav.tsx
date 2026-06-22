'use client'
import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

type ViewerState = 'loading' | 'logged_out' | 'client' | 'staff'

// The ONE nav bar used on every page. Content is state-aware:
//  - logged out → Log In / Sign Up
//  - client / staff → Sign Out (+ role links)
// The logo ALWAYS links to the public landing page for every state. Clients
// reach their dashboard via the "[First Name] avatar" Profile link; staff via
// "Staff Dashboard". A redundant "Home Page" text link is kept alongside the
// logo on purpose (some users don't realize logos are clickable).
function AvatarIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="10" r="3" />
      <path d="M6.5 19a5.5 5.5 0 0 1 11 0" />
    </svg>
  )
}

export function SiteNav() {
  const router = useRouter()
  const [viewer,    setViewer]    = useState<ViewerState>('loading')
  const [firstName, setFirstName] = useState('')

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { setViewer('logged_out'); return }
      const { data: isAdmin } = await supabase.rpc('is_admin')
      if (isAdmin) { setViewer('staff'); return }
      setViewer('client')
      // Client's first name for the Profile link
      const { data: profile } = await supabase
        .from('clients_client_view').select('first_name').single()
      setFirstName(profile?.first_name || 'Profile')
    })
  }, [])

  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.replace('/')
    router.refresh()
  }

  return (
    <header style={s.header}>
      <div style={s.inner}>
        {/* Logo ALWAYS goes to the public landing page now */}
        <a href="/" style={s.logo}>
          <span style={s.paw}>🐾</span>
          <span style={s.name}>Woof Wetreats</span>
          {viewer === 'staff' && <span style={s.staffBadge}>Staff</span>}
        </a>

        <nav style={s.nav}>
          {/* Redundant-with-logo, kept intentionally */}
          {(viewer === 'client' || viewer === 'staff') && (
            <a href="/" style={s.link}>Home Page</a>
          )}

          <a href="/house-rules" style={s.link}>House Rules</a>

          {/* Staff-only links (driven by the same is_staff/is_admin check) */}
          {viewer === 'staff' && (
            <>
              <a href="/staff/schedule" style={s.link}>Daily Schedule</a>
              <a href="/staff"          style={s.link}>Staff Dashboard</a>
              <a href="/staff/settings" style={s.settingsLink}>
                Settings
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
                  style={{ marginLeft: 5 }}>
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              </a>
            </>
          )}

          {viewer === 'logged_out' && (
            <>
              <a href="/auth" style={s.link}>Log In</a>
              <a href="/auth?mode=signup" style={s.cta}>Sign Up</a>
            </>
          )}

          {/* Client-only self-service booking — a proper button, left of Sign Out */}
          {viewer === 'client' && (
            <a href="/booking" style={s.cta}>+ New Reservation</a>
          )}

          {(viewer === 'client' || viewer === 'staff') && (
            <button type="button" onClick={signOut} style={s.signOut}>Sign Out</button>
          )}

          {/* Client Profile link — to the right of Sign Out — goes to their dashboard */}
          {viewer === 'client' && (
            <a href="/dashboard" style={s.profile}>
              <span>{firstName}</span>
              <AvatarIcon />
            </a>
          )}
        </nav>
      </div>
    </header>
  )
}

const s: Record<string, React.CSSProperties> = {
  header:       { background: '#fff', borderBottom: '1px solid #e5e7eb', position: 'sticky', top: 0, zIndex: 20 },
  inner:        { maxWidth: 1200, margin: '0 auto', padding: '14px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' },
  logo:         { display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' },
  paw:          { fontSize: 22 },
  name:         { fontSize: 18, fontWeight: 800, color: '#111827' },
  staffBadge:   { fontSize: 11, fontWeight: 700, background: '#111827', color: '#fff', padding: '3px 9px', borderRadius: 20, letterSpacing: '0.04em' },
  nav:          { display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' },
  link:         { fontSize: 14, color: '#374151', textDecoration: 'none', fontWeight: 500 },
  settingsLink: { fontSize: 14, color: '#374151', textDecoration: 'none', fontWeight: 500, display: 'flex', alignItems: 'center' },
  cta:          { fontSize: 14, fontWeight: 600, color: '#fff', background: '#2563eb', padding: '8px 16px', borderRadius: 8, textDecoration: 'none' },
  signOut:      { fontSize: 14, fontWeight: 500, color: '#6b7280', background: 'none', border: '1px solid #e5e7eb', borderRadius: 8, padding: '7px 14px', cursor: 'pointer', fontFamily: 'inherit' },
  profile:      { display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 600, color: '#111827', textDecoration: 'none' },
}
