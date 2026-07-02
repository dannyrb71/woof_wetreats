'use client'
import React, { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { MyProfileModal } from '@/components/MyProfileModal'

type ViewerState = 'loading' | 'logged_out' | 'client' | 'staff'

// Is `href` the active route? '/' and '/staff' match exactly (everything else
// lives beneath /staff); other links match the path or any nested sub-path.
function isActiveLink(pathname: string, href: string): boolean {
  if (href === '/' || href === '/staff') return pathname === href
  return pathname === href || pathname.startsWith(href + '/')
}

// Staff primary nav (Batch 11a). Dashboard is a NEW page (later batch) and
// Clients is the renamed current Staff Dashboard — both temporarily point at the
// existing /staff content until those batches land. Schedule will merge the
// Daily Schedule + Availability later; for now it's the current schedule page.
const STAFF_LINKS = [
  { label: 'Dashboard', href: '/staff/dashboard' }, // Batch 11c — new dashboard
  { label: 'Schedule',  href: '/staff/schedule' },  // TODO(11d): merge Availability
  { label: 'Clients',   href: '/staff' },            // current Staff Dashboard (Clients)
  { label: 'Rover',     href: '/staff/rover' },
]

function Chevron() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 9l6 6 6-6" />
    </svg>
  )
}

export function SiteNav() {
  const router = useRouter()
  const pathname = usePathname()
  const dashActive = isActiveLink(pathname, '/dashboard')
  // When active, avatar + name both go blue so they read as one unit.
  const clientAvatarSkin = dashActive
    ? { background: 'rgba(72,130,175,0.18)', color: 'var(--dog-male)' }
    : { background: 'var(--primary-light)', color: 'var(--primary-dark)' }
  const [viewer,      setViewer]      = useState<ViewerState>('loading')
  const [firstName,   setFirstName]   = useState('')      // client profile link
  const [staffName,   setStaffName]   = useState('')
  const [staffEmail,  setStaffEmail]  = useState('')
  const [staffAvatar, setStaffAvatar] = useState<string | null>(null)
  const [staffAvatarErr, setStaffAvatarErr] = useState(false)
  const [menuOpen,    setMenuOpen]    = useState(false)
  const [mobileOpen,  setMobileOpen]  = useState(false)
  const [showProfile, setShowProfile] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { setViewer('logged_out'); return }
      const { data: isAdmin } = await supabase.rpc('is_admin')
      if (isAdmin) {
        setViewer('staff')
        const u = session.user
        setStaffName((u.user_metadata?.full_name as string) ?? '')
        setStaffEmail(u.email ?? '')
        setStaffAvatar((u.user_metadata?.avatar_url as string) ?? null)
        return
      }
      setViewer('client')
      const { data: profile } = await supabase.from('clients_client_view').select('first_name').single()
      setFirstName(profile?.first_name || 'Profile')
    })
  }, [])

  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.replace('/')
    router.refresh()
  }

  const initial = (staffName || staffEmail || '?').trim().charAt(0).toUpperCase()

  function Avatar({ size = 32 }: { size?: number }) {
    return staffAvatar && !staffAvatarErr
      ? <img src={staffAvatar} alt="" referrerPolicy="no-referrer" onError={() => setStaffAvatarErr(true)} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', border: '1px solid var(--border)' }} />
      : <span style={{ ...s.avatarFallback, width: size, height: size, fontSize: size * 0.42 }}>{initial}</span>
  }

  return (
    <header style={s.header}>
      <div style={s.inner}>
        <a href="/" style={s.logo}>
          <span style={s.paw}>🐾</span>
          <span style={s.name}>Woof Wetreats</span>
          {viewer === 'staff' && <span style={s.staffBadge}>Staff</span>}
        </a>

        {/* ── Desktop nav (≥860px) ── */}
        <div className="nav-desktop">
          {viewer === 'staff' && (
            <>
              <nav style={s.links}>
                {STAFF_LINKS.map(l => {
                  const active = isActiveLink(pathname, l.href)
                  return (
                    <a key={l.label} href={l.href} aria-current={active ? 'page' : undefined}
                      className={active ? 'nav-link nav-link-active' : 'nav-link'} style={s.link}>
                      {l.label}
                    </a>
                  )
                })}
              </nav>

              {/* Avatar + chevron dropdown */}
              <div style={{ position: 'relative' }}>
                <button type="button" onClick={() => setMenuOpen(o => !o)} style={s.avatarBtn} aria-haspopup="menu" aria-expanded={menuOpen}>
                  <Avatar />
                  <Chevron />
                </button>
                {menuOpen && (
                  <>
                    <div style={s.clickCatcher} onClick={() => setMenuOpen(false)} />
                    <div style={s.menu} role="menu">
                      <button type="button" style={s.menuItem} onClick={() => { setMenuOpen(false); setShowProfile(true) }}>My Profile</button>
                      <a href="/staff/settings" style={s.menuItem} onClick={() => setMenuOpen(false)}>Settings</a>
                      <button type="button" style={{ ...s.menuItem, color: 'var(--error)' }} onClick={signOut}>Sign Out</button>
                    </div>
                  </>
                )}
              </div>
            </>
          )}

          {viewer === 'client' && (
            <nav style={s.links}>
              <a href="/" aria-current={isActiveLink(pathname, '/') ? 'page' : undefined}
                className={isActiveLink(pathname, '/') ? 'nav-link nav-link-active' : 'nav-link'} style={s.link}>Home</a>
              <a href="/house-rules" aria-current={isActiveLink(pathname, '/house-rules') ? 'page' : undefined}
                className={isActiveLink(pathname, '/house-rules') ? 'nav-link nav-link-active' : 'nav-link'} style={s.link}>House Rules</a>
              <a href="/dashboard?new=1" style={s.cta}>+ New Booking</a>
              <button type="button" onClick={signOut} style={s.signOut}>Sign Out</button>
              <a href="/dashboard" aria-current={dashActive ? 'page' : undefined}
                style={{ ...s.profile, ...(dashActive ? { color: 'var(--dog-male)' } : {}) }}>
                <span style={{ ...s.clientAvatar, ...clientAvatarSkin }}>{(firstName || '?').trim().charAt(0).toUpperCase()}</span>
                <span>{firstName}</span>
              </a>
            </nav>
          )}

          {viewer === 'logged_out' && (
            <nav style={s.links}>
              <a href="/house-rules" style={s.link}>House Rules</a>
              <a href="/auth" style={s.link}>Log In</a>
              <a href="/auth?mode=signup" style={s.cta}>Sign Up</a>
            </nav>
          )}
        </div>

        {/* ── Hamburger (<860px) ── */}
        {viewer !== 'loading' && (
          <button type="button" className="nav-hamburger" style={s.hamburger}
            onClick={() => setMobileOpen(o => !o)} aria-label="Menu" aria-expanded={mobileOpen}>
            {mobileOpen ? '✕' : '☰'}
          </button>
        )}
      </div>

      {/* ── Mobile panel (only reachable via the hamburger, which is hidden ≥860px) ── */}
      {mobileOpen && (
        <div style={s.mobilePanel}>
          {viewer === 'staff' && <>
            {STAFF_LINKS.map(l => {
              const active = isActiveLink(pathname, l.href)
              return <a key={l.label} href={l.href} aria-current={active ? 'page' : undefined}
                style={{ ...s.mobileItem, ...(active ? { color: 'var(--dog-male)' } : {}) }}
                onClick={() => setMobileOpen(false)}>{l.label}</a>
            })}
            <div style={s.mobileDivider} />
            <button type="button" style={s.mobileItem} onClick={() => { setMobileOpen(false); setShowProfile(true) }}>My Profile</button>
            <a href="/staff/settings" style={s.mobileItem} onClick={() => setMobileOpen(false)}>Settings</a>
            <button type="button" style={{ ...s.mobileItem, color: 'var(--error)' }} onClick={signOut}>Sign Out</button>
          </>}
          {viewer === 'client' && <>
            <a href="/" aria-current={isActiveLink(pathname, '/') ? 'page' : undefined}
              style={{ ...s.mobileItem, ...(isActiveLink(pathname, '/') ? { color: 'var(--dog-male)' } : {}) }} onClick={() => setMobileOpen(false)}>Home</a>
            <a href="/house-rules" aria-current={isActiveLink(pathname, '/house-rules') ? 'page' : undefined}
              style={{ ...s.mobileItem, ...(isActiveLink(pathname, '/house-rules') ? { color: 'var(--dog-male)' } : {}) }} onClick={() => setMobileOpen(false)}>House Rules</a>
            <a href="/dashboard?new=1" style={{ ...s.mobileItem, color: 'var(--status-in-progress)' }} onClick={() => setMobileOpen(false)}>+ New Booking</a>
            <a href="/dashboard" aria-current={dashActive ? 'page' : undefined}
              style={{ ...s.mobileItem, display: 'flex', alignItems: 'center', gap: 8, ...(dashActive ? { color: 'var(--dog-male)' } : {}) }}
              onClick={() => setMobileOpen(false)}>
              <span style={{ ...s.clientAvatar, ...clientAvatarSkin }}>{(firstName || '?').trim().charAt(0).toUpperCase()}</span>
              {firstName}
            </a>
            <button type="button" style={{ ...s.mobileItem, color: 'var(--error)' }} onClick={signOut}>Sign Out</button>
          </>}
          {viewer === 'logged_out' && <>
            <a href="/house-rules" style={s.mobileItem} onClick={() => setMobileOpen(false)}>House Rules</a>
            <a href="/auth" style={s.mobileItem} onClick={() => setMobileOpen(false)}>Log In</a>
            <a href="/auth?mode=signup" style={s.mobileItem} onClick={() => setMobileOpen(false)}>Sign Up</a>
          </>}
        </div>
      )}

      {showProfile && (
        <MyProfileModal
          onClose={() => setShowProfile(false)}
          onSaved={(url, nm) => { setStaffAvatar(url); setStaffName(nm) }}
        />
      )}
    </header>
  )
}

const s: Record<string, React.CSSProperties> = {
  header:       { background: 'var(--surface)', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, zIndex: 20 },
  inner:        { maxWidth: 1200, margin: '0 auto', padding: '12px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 },
  logo:         { display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' },
  paw:          { fontSize: 22 },
  name:         { fontSize: 18, fontWeight: 800, color: 'var(--text-primary)' },
  staffBadge:   { fontSize: 11, fontWeight: 700, background: 'var(--primary)', color: '#fff', padding: '3px 9px', borderRadius: 999, letterSpacing: '0.04em' },
  links:        { display: 'flex', alignItems: 'center', gap: 22 },
  link:         { fontSize: 14, color: 'var(--text-primary)', textDecoration: 'none', fontWeight: 600 },
  cta:          { fontSize: 14, fontWeight: 600, color: '#fff', background: 'var(--status-in-progress)', padding: '8px 16px', borderRadius: 999, textDecoration: 'none' },
  signOut:      { fontSize: 14, fontWeight: 500, color: 'var(--text-secondary)', background: 'none', border: '1px solid var(--border)', borderRadius: 999, padding: '7px 14px', cursor: 'pointer', fontFamily: 'inherit' },
  profile:      { display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', textDecoration: 'none' },
  clientAvatar: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: '50%', fontSize: 13, fontWeight: 800, flexShrink: 0 },

  avatarBtn:    { display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--text-secondary)', borderRadius: 999 },
  avatarFallback:{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', background: 'var(--primary-light)', color: 'var(--primary-dark)', fontWeight: 800 },
  clickCatcher: { position: 'fixed', inset: 0, zIndex: 30 },
  menu:         { position: 'absolute', top: 'calc(100% + 8px)', right: 0, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, boxShadow: 'var(--hover-shadow)', minWidth: 170, padding: 6, display: 'flex', flexDirection: 'column', zIndex: 40 },
  menuItem:     { textAlign: 'left', fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', background: 'none', border: 'none', borderRadius: 10, padding: '9px 12px', cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'none' },

  hamburger:    { fontSize: 22, lineHeight: 1, background: 'none', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', padding: 4, fontFamily: 'inherit' },
  mobilePanel:  { display: 'flex', borderTop: '1px solid var(--border)', background: 'var(--surface)', padding: '8px 16px 14px', flexDirection: 'column', gap: 2 },
  mobileItem:   { display: 'block', textAlign: 'left', width: '100%', fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', background: 'none', border: 'none', padding: '11px 6px', cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'none' },
  mobileDivider:{ height: 1, background: 'var(--border)', margin: '6px 0' },
}
