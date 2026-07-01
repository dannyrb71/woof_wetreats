'use client'
import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { SiteNav } from '@/components/SiteNav'
import { LandingHeroUploader } from '@/components/staff/LandingHeroUploader'
import { StaffManager } from '@/components/staff/StaffManager'
import { PricingEditor } from '@/components/staff/PricingEditor'
import { LandingCopyEditor } from '@/components/staff/LandingCopyEditor'

type TabKey = 'landing' | 'pricing' | 'staff'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'pricing',      label: 'Pricing' },
  { key: 'staff',        label: 'Staff' },
  { key: 'landing',      label: 'Landing Page' },
]

export default function StaffSettingsPage() {
  const router   = useRouter()
  const supabase = createClient()
  const [ready, setReady] = useState(false)
  const [tab,   setTab]   = useState<TabKey>('pricing')

  useEffect(() => {
    async function guard() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.replace('/auth'); return }
      const { data: isAdmin } = await supabase.rpc('is_admin')
      if (!isAdmin) { router.replace('/'); return }
      setReady(true)
    }
    guard()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (!ready) return <div style={s.center}><p style={{ color: '#6b7280' }}>Loading…</p></div>

  return (
    <div style={s.page}>
      <SiteNav />

      <main style={s.main}>
        <h2 style={s.pageTitle}>Settings</h2>

        {/* ── Tabs ── */}
        <div style={s.tabBar}>
          {TABS.map(t => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              style={{ ...s.tab, ...(tab === t.key ? s.tabActive : {}) }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Active section ── */}
        <section style={s.sectionCard}>
          {tab === 'landing' && (
            <>
              <h3 className="section-label" style={{ margin: '0 0 12px' }}>Landing page photo</h3>
              <p style={s.sectionHint}>
                The featured photo at the top of the public landing page visitors see before logging in.
              </p>
              <LandingHeroUploader />

              <div style={{ height: 1, background: '#e5e7eb', margin: '28px 0' }} />

              <h3 className="section-label" style={{ margin: '0 0 12px' }}>Landing page copy</h3>
              <p style={s.sectionHint}>
                The headline and intro paragraphs shown on the public landing page.
              </p>
              <LandingCopyEditor />
            </>
          )}

          {tab === 'pricing' && (
            <>
              <h3 className="section-label" style={{ margin: '0 0 12px' }}>Pricing rates</h3>
              <PricingEditor />
            </>
          )}

          {tab === 'staff' && (
            <>
              <h3 className="section-label" style={{ margin: '0 0 12px' }}>Staff members</h3>
              <StaffManager />
            </>
          )}

        </section>
      </main>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  page:        { minHeight: '100vh', background: 'var(--page-bg)' },
  center:      { display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' },
  header:      { background: '#fff', borderBottom: '1px solid #e5e7eb', position: 'sticky', top: 0, zIndex: 10 },
  headerInner: { maxWidth: 920, margin: '0 auto', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 },
  headerLeft:  { display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' },
  pawIcon:     { fontSize: 24 },
  appName:     { margin: 0, fontSize: 20, fontWeight: 800, color: '#111827' },
  staffBadge:  { fontSize: 11, fontWeight: 700, background: '#111827', color: '#fff', padding: '3px 9px', borderRadius: 20, letterSpacing: '0.04em' },
  navLink:     { fontSize: 13, color: '#6b7280', textDecoration: 'none', fontWeight: 500 },
  main:        { maxWidth: 920, margin: '0 auto', padding: '32px 24px 60px' },
  pageTitle:   { margin: '0 0 20px', fontSize: 22, fontWeight: 800, color: '#111827' },
  tabBar:      { display: 'flex', gap: 4, borderBottom: '1px solid #e5e7eb', marginBottom: 24 },
  tab:         { fontSize: 14, fontWeight: 600, color: '#6b7280', background: 'none', border: 'none', borderBottom: '2px solid transparent', padding: '10px 16px', cursor: 'pointer', fontFamily: 'inherit', marginBottom: -1 },
  tabActive:   { color: 'var(--dog-male)', borderBottomColor: 'var(--dog-male)' },
  sectionCard: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 'var(--radius-card)', padding: '24px 26px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' },
  sectionTitle:{ margin: '0 0 6px', fontSize: 16, fontWeight: 700, color: '#111827' },
  sectionHint: { margin: '0 0 18px', fontSize: 14, color: '#6b7280', lineHeight: 1.6 },
}
