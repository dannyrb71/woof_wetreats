'use client'
import React, { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { SiteNav } from '@/components/SiteNav'
import { parseLandingCopy, renderParagraphHtml, DEFAULT_LANDING_COPY, type LandingCopy } from '@/lib/landing-copy'

type ViewerState = 'loading' | 'logged_out' | 'client' | 'staff'

export default function LandingPage() {
  const [heroUrl, setHeroUrl] = useState<string | null>(null)
  const [viewer,  setViewer]  = useState<ViewerState>('loading')
  const [copy,    setCopy]    = useState<LandingCopy>(DEFAULT_LANDING_COPY)

  useEffect(() => {
    const supabase = createClient()
    supabase.rpc('get_landing_hero').then(({ data }) => {
      const row = data?.[0]
      if (row?.path) {
        const { data: pub } = supabase.storage.from('site-assets').getPublicUrl(row.path)
        // Cache-bust so a freshly uploaded photo shows immediately
        setHeroUrl(`${pub.publicUrl}?v=${row.version ?? '0'}`)
      }
    })

    // Editable headline + paragraphs (falls back to defaults if unset)
    supabase.rpc('get_landing_copy').then(({ data }) => {
      setCopy(parseLandingCopy(data as string | null))
    })

    // Make the body CTA login-state-aware, consistent with the nav
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { setViewer('logged_out'); return }
      const { data: isAdmin } = await supabase.rpc('is_admin')
      setViewer(isAdmin ? 'staff' : 'client')
    })
  }, [])

  return (
    <div style={s.page}>
      <SiteNav />

      {/* ── Hero photo ── */}
      <div style={s.hero}>
        {heroUrl
          ? <img src={heroUrl} alt="Happy dogs at Woof Wetreats" style={s.heroImg} />
          : <div style={s.heroPlaceholder}><span style={{ fontSize: 64 }}>🐾</span></div>
        }
      </div>

      <main style={s.main}>
        {/* ── Intro copy (editable via Settings → Landing Page) ── */}
        <section style={s.intro}>
          <h1 style={s.h1}>{copy.headline}</h1>
          {copy.paragraphs.map((p, i) => (
            <p
              key={i}
              style={i === 0 ? s.lead : s.body}
              dangerouslySetInnerHTML={{ __html: renderParagraphHtml(p) }}
            />
          ))}

          {/* ── Calls to action (login-state-aware) ── */}
          <div style={s.ctaRow}>
            {viewer === 'logged_out' && (
              <>
                <a href="/auth?mode=signup" style={s.ctaPrimary}>Sign Up</a>
                <a href="/auth" style={s.ctaSecondary}>Log In</a>
              </>
            )}
            {viewer === 'client' && (
              <a href="/dashboard" style={s.ctaPrimary}>Go to My Dashboard</a>
            )}
            {viewer === 'staff' && (
              <a href="/staff" style={s.ctaPrimary}>Go to Staff Dashboard</a>
            )}
            {/* viewer === 'loading' → render nothing to avoid a flash of the wrong CTA */}
          </div>

          {/* ── House Rules link ── */}
          <a href="/house-rules" style={s.rulesLink}>
            📋 Read our House Rules before booking →
          </a>
        </section>

        {/* ── Quick highlights ── */}
        <section style={s.highlights}>
          <div style={s.card}>
            <span style={s.cardIcon}>🏠</span>
            <h3 style={s.cardTitle}>Boarding</h3>
            <p style={s.cardText}>Overnight stays in a real home, not a kennel.</p>
          </div>
          <div style={s.card}>
            <span style={s.cardIcon}>🌞</span>
            <h3 style={s.cardTitle}>Daycare</h3>
            <p style={s.cardText}>Daytime play and company while you&apos;re out.</p>
          </div>
          <div style={s.card}>
            <span style={s.cardIcon}>📸</span>
            <h3 style={s.cardTitle}>Updates</h3>
            <p style={s.cardText}>Photos and check-ins so you never have to wonder.</p>
          </div>
        </section>
      </main>

      <footer style={s.footer}>
        <a href="/house-rules" style={s.footerLink}>House Rules</a>
        <span style={s.footerDot}>·</span>
        <a href="/terms" style={s.footerLink}>Terms of Service</a>
      </footer>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  page:           { minHeight: '100vh', background: 'var(--page-bg)' },
  hero:           { width: '100%', maxWidth: 980, margin: '0 auto', padding: '20px 24px 0' },
  heroImg:        { width: '100%', height: 360, objectFit: 'cover', borderRadius: 16, display: 'block' },
  heroPlaceholder:{ width: '100%', height: 360, borderRadius: 16, background: 'linear-gradient(135deg, #dbeafe, #fef3c7)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  main:           { maxWidth: 980, margin: '0 auto', padding: '32px 24px 48px' },
  intro:          { maxWidth: 680 },
  h1:             { margin: '0 0 16px', fontSize: 32, fontWeight: 800, color: '#111827' },
  lead:           { margin: '0 0 16px', fontSize: 18, lineHeight: 1.6, color: '#374151' },
  body:           { margin: '0 0 28px', fontSize: 15, lineHeight: 1.7, color: '#6b7280' },
  ctaRow:         { display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' },
  ctaPrimary:     { fontSize: 16, fontWeight: 700, color: '#fff', background: '#2563eb', padding: '12px 28px', borderRadius: 10, textDecoration: 'none' },
  ctaSecondary:   { fontSize: 16, fontWeight: 600, color: '#2563eb', background: '#fff', border: '1.5px solid #bfdbfe', padding: '12px 28px', borderRadius: 10, textDecoration: 'none' },
  rulesLink:      { display: 'inline-block', fontSize: 15, fontWeight: 600, color: '#b45309', textDecoration: 'none' },
  highlights:     { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginTop: 44 },
  card:           { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 'var(--radius-card)', padding: '22px 24px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' },
  cardIcon:       { fontSize: 28 },
  cardTitle:      { margin: '10px 0 6px', fontSize: 17, fontWeight: 700, color: '#111827' },
  cardText:       { margin: 0, fontSize: 14, lineHeight: 1.6, color: '#6b7280' },
  footer:         { maxWidth: 980, margin: '0 auto', padding: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, borderTop: '1px solid #e5e7eb' },
  footerLink:     { fontSize: 13, color: '#6b7280', textDecoration: 'none' },
  footerDot:      { color: '#d1d5db' },
}
