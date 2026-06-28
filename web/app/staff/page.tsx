'use client'
import React, { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { HouseholdCard, Household } from '@/components/staff/HouseholdCard'
import type { DogRow } from '@/components/staff/HouseholdCard'
import { HouseholdDetail } from '@/components/staff/HouseholdDetail'
import { SiteNav } from '@/components/SiteNav'

type SortOption = 'date' | 'name' | 'in_progress' | 'upcoming' | 'completed'

export default function StaffPage() {
  const router   = useRouter()
  const supabase = createClient()

  const [households, setHouseholds] = useState<Household[]>([])
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState('')
  const [sortBy,     setSortBy]     = useState<SortOption>('date')
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

  const sorted = useMemo(() => {
    const list = [...households]
    switch (sortBy) {
      case 'name':        return list.sort((a, b) => a.full_name.localeCompare(b.full_name))
      case 'in_progress': return list.filter(h => h.res_status === 'in_progress')
      case 'upcoming':    return list.filter(h => h.res_status === 'upcoming')
      case 'completed':   return list.filter(h => h.res_status === 'completed')
      case 'date':
      default:
        // Effective date = reservation drop-off, or scheduled Meet & Greet date
        return list.sort((a, b) => {
          const ad = a.dropoff_date ?? (a.mg_status === 'scheduled' ? a.mg_date : null)
          const bd = b.dropoff_date ?? (b.mg_status === 'scheduled' ? b.mg_date : null)
          if (!ad && !bd) return 0
          if (!ad) return 1
          if (!bd) return -1
          return ad.localeCompare(bd)
        })
    }
  }, [households, sortBy])

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
        <div style={s.toolbar}>
          <h2 style={s.pageHeading}>Households</h2>
          <div style={s.sortWrap}>
            <label htmlFor="sort" style={s.sortLabel}>Sort by:</label>
            <select
              id="sort"
              value={sortBy}
              onChange={e => setSortBy(e.target.value as SortOption)}
              style={s.sortSelect}
            >
              <option value="date">Date</option>
              <option value="name">Name</option>
              <option value="in_progress">In Progress</option>
              <option value="upcoming">Upcoming</option>
              <option value="completed">Completed</option>
            </select>
          </div>
        </div>

        {sorted.length === 0 ? (
          <div style={s.empty}>
            <p style={{ color: '#9ca3af', fontSize: 15 }}>No households for this filter.</p>
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
  page:        { minHeight: '100vh', background: 'var(--page-bg)' },
  center:      { display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' },
  main:        { maxWidth: 1200, margin: '0 auto', padding: '32px 24px' },
  toolbar:     { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 24, flexWrap: 'wrap' },
  pageHeading: { margin: 0, fontSize: 22, fontWeight: 800, color: '#111827' },
  sortWrap:    { display: 'flex', alignItems: 'center', gap: 8 },
  sortLabel:   { fontSize: 13, color: '#6b7280' },
  sortSelect:  { fontSize: 13, padding: '6px 10px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', color: '#374151', cursor: 'pointer', fontFamily: 'inherit' },
  grid:        { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 20, alignItems: 'start' },
  empty:       { textAlign: 'center', padding: '80px 24px' },
}
