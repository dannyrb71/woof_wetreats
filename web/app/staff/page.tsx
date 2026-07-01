'use client'
import React, { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { HouseholdCard, Household } from '@/components/staff/HouseholdCard'
import type { DogRow } from '@/components/staff/HouseholdCard'
import { HouseholdDetail } from '@/components/staff/HouseholdDetail'
import { SiteNav } from '@/components/SiteNav'

// Pill filter groups (single-select; "All" is the default/reset).
type FilterKey = 'all' | 'in_progress' | 'upcoming_boarding' | 'upcoming_daycare' | 'no_active'

function matchesFilter(h: Household, f: FilterKey): boolean {
  switch (f) {
    case 'in_progress':       return h.res_status === 'in_progress'
    case 'upcoming_boarding': return h.res_status === 'upcoming' && h.service_type === 'boarding'
    case 'upcoming_daycare':  return h.res_status === 'upcoming' && h.service_type === 'daycare'
    case 'no_active':         return !(h.res_status === 'in_progress' || h.res_status === 'upcoming')
    case 'all':
    default:                  return true
  }
}

export default function StaffPage() {
  const router   = useRouter()
  const supabase = createClient()

  const [households, setHouseholds] = useState<Household[]>([])
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState('')
  const [filter,     setFilter]     = useState<FilterKey>('all')
  const [search,     setSearch]     = useState('')
  const [selected,   setSelected]   = useState<Household | null>(null)

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.replace('/auth'); return }

      const { data: isAdmin } = await supabase.rpc('is_admin')
      if (!isAdmin) { router.replace('/'); return }

      const { data, error: rpcErr } = await supabase.rpc('get_staff_households')
      if (rpcErr) { setError('Failed to load households.'); setLoading(false); return }

      const rows: Household[] = (data ?? []).map((r: Record<string, unknown>) => ({
        ...r,
        reservation_id: r.reservation_id ?? null,
        dogs: (typeof r.dogs === 'string' ? JSON.parse(r.dogs) : (r.dogs ?? [])).map(
          (d: Omit<DogRow, 'photoSigned'>) => ({ ...d, photoSigned: null })
        ),
      })) as Household[]

      // Generate signed URLs for all dog photos (storage policy allows admin read)
      const uniquePaths = [...new Set(
        rows.flatMap(h => h.dogs.map((d: DogRow) => d.photo_url).filter(Boolean) as string[])
      )]
      const signedMap: Record<string, string> = {}
      if (uniquePaths.length > 0) {
        const { data: signed } = await supabase.storage.from('dog-photos').createSignedUrls(uniquePaths, 3600)
        for (const entry of signed ?? []) {
          if (entry.signedUrl && entry.path) signedMap[entry.path] = entry.signedUrl
        }
      }

      setHouseholds(rows.map(h => ({
        ...h,
        dogs: h.dogs.map((d: DogRow) => ({
          ...d,
          photoSigned: d.photo_url ? (signedMap[d.photo_url] ?? null) : null,
        })),
      })))
      setLoading(false)
    }
    load()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Visible cards: pill filter, then search narrows WITHIN it, then alphabetical
  // by client name (the default order — no separate sort control).
  const sorted = useMemo(() => {
    const q = search.trim().toLowerCase()
    return households
      .filter(h => matchesFilter(h, filter))
      .filter(h => {
        if (!q) return true
        if (h.full_name.toLowerCase().includes(q)) return true
        // Match ANY dog's name → the whole household card surfaces.
        return h.dogs.some(d => d.name.toLowerCase().includes(q))
      })
      .sort((a, b) => a.full_name.localeCompare(b.full_name))
  }, [households, filter, search])

  // Legend/summary counts across ALL households (not the filtered view).
  const counts = useMemo(() => {
    let inProgress = 0, upBoarding = 0, upDaycare = 0, noActive = 0
    for (const h of households) {
      if (h.res_status === 'in_progress') inProgress++
      else if (h.res_status === 'upcoming' && h.service_type === 'boarding') upBoarding++
      else if (h.res_status === 'upcoming' && h.service_type === 'daycare') upDaycare++
      else noActive++
    }
    return { inProgress, upBoarding, upDaycare, noActive }
  }, [households])

  if (selected) {
    return (
      <HouseholdDetail
        household={selected}
        onBack={() => setSelected(null)}
        onUpdate={(updated) => {
          setSelected(updated)
          setHouseholds(prev => prev.map(h => h.client_id === updated.client_id ? updated : h))
        }}
      />
    )
  }

  if (loading) {
    return (
      <div style={s.center}>
        <p style={{ color: '#6b7280' }}>Loading…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div style={s.center}>
        <p style={{ color: '#ef4444' }}>{error}</p>
      </div>
    )
  }

  return (
    <div style={s.page}>
      <SiteNav />

      {/* ── Card grid ── */}
      <main style={s.main}>
        <div className="staff-header-2col" style={s.toolbar}>
          <div className="page-header-text">
            <h2 style={s.pageHeading}>Clients</h2>
            <p style={s.subtitle}>Overview of your clients and their pets.</p>
          </div>
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by client or dog name…"
            className="clients-search-input"
            aria-label="Search clients and dogs"
          />
        </div>

        {/* ── Filter pills (single-select; "All" resets) ── */}
        <div style={s.legendRow}>
          {([
            ['all',               'All',                households.length,  'var(--border)'],
            ['in_progress',       'In Progress',        counts.inProgress,  'var(--status-in-progress)'],
            ['upcoming_boarding', 'Upcoming Boarding',  counts.upBoarding,  'var(--status-boarding)'],
            ['upcoming_daycare',  'Upcoming Daycare',   counts.upDaycare,   'var(--status-daycare)'],
            ['no_active',         'No Active Booking',  counts.noActive,    'var(--status-no-activity)'],
          ] as const).map(([key, label, n, color]) => {
            const active = filter === key
            // "All" is a faded neutral circle with a dark (default) count so it reads
            // distinctly from the similarly-gray "No Active Booking" circle.
            const faded = key === 'all'
            return (
              <button key={key} type="button" onClick={() => setFilter(key)}
                aria-pressed={active}
                style={{ ...s.legendBox, ...(active ? s.legendBoxActive : {}) }}>
                <span style={{ ...s.legendCircle, background: color, color: faded ? 'var(--text-primary)' : '#fff' }}>{n}</span>
                <span style={s.legendText}>{label}</span>
              </button>
            )
          })}
        </div>

        {sorted.length === 0 ? (
          <div style={s.empty}>
            <p style={{ color: 'var(--text-secondary)', fontSize: 15 }}>
              {search.trim() ? `No matches for “${search.trim()}”.` : 'No clients in this group.'}
            </p>
          </div>
        ) : (
          <div style={s.grid}>
            {sorted.map(h => (
              <HouseholdCard
                key={h.client_id}
                household={h}
                onClick={() => setSelected(h)}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  page:        { minHeight: '100vh', background: 'var(--background)' },
  center:      { display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' },
  main:        { maxWidth: 1200, margin: '0 auto', padding: '32px 24px' },
  toolbar:     { marginBottom: 16 },
  pageHeading: { margin: 0, fontSize: 28, fontWeight: 800, color: 'var(--text-primary)' },
  subtitle:    { margin: '4px 0 0', fontSize: 15, color: 'var(--text-secondary)' },


  legendRow:   { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 24 },
  legendBox:   { display: 'flex', alignItems: 'center', gap: 10, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 999, padding: '12px 18px', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', transition: 'border-color 0.15s, background 0.15s' },
  legendBoxActive: { borderColor: 'var(--primary)', background: 'var(--primary-light)' },
  legendCircle:{ minWidth: 40, height: 40, borderRadius: 999, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, fontWeight: 800, color: '#fff', flexShrink: 0, padding: '0 8px' },
  legendText:  { fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', flex: 1, textTransform: 'uppercase', letterSpacing: '0.06em' },

  grid:        { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 20, alignItems: 'start' },
  empty:       { textAlign: 'center', padding: '80px 24px' },
}
