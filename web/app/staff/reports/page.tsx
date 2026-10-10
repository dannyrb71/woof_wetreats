'use client'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { SiteNav } from '@/components/SiteNav'
import { SectionHeader } from '@/components/shared/molecules/SectionHeader'
import { getHolidayDateRange } from '@/lib/pricing-engine'
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from 'recharts'

// ── Types (mirror the analytics RPCs) ──────────────────────────
interface Booking {
  id: string; client_id: string; service_type: 'boarding' | 'daycare'; status: string
  dropoff_date: string; pickup_date: string; created_at: string
  total_price: number; referral_free: boolean; referral_discount: number
  payment_method: string; price_overridden: boolean; dogs_count: number
  is_new_client: boolean; client_created_at: string; meet_greet_status: string; is_manual: boolean
  client_first_name: string | null; client_last_name: string | null
}
interface Payment { reservation_id: string; amount: number; paid_on: string; method: string; service_type: string; client_id: string }

type View = 'week' | 'month' | 'quarter' | 'year'
type Compare = 'none' | 'previous' | 'yoy'
type ServiceFilter = 'all' | 'boarding' | 'daycare'
type Tab = 'revenue' | 'demand' | 'customers' | 'rates'

const EXTENDED_THRESHOLD = 8
const COLORS = { boarding: '#2563eb', daycare: '#f59e0b', regular: '#64748b', extended: '#7c3aed', holiday: '#dc2626', earned: '#16a34a', collected: '#2563eb', cash: '#16a34a', venmo: '#2563eb', accent: 'var(--primary)' }

// ── Date helpers (local, no UTC drift) ─────────────────────────
function ymd(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
function parse(s: string) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d) }
function shift(s: string, days: number) { const d = parse(s); d.setDate(d.getDate() + days); return ymd(d) }
function todayStr() { return ymd(new Date()) }
function nightsBetween(a: string, b: string) { return Math.max(0, Math.round((parse(b).getTime() - parse(a).getTime()) / 86400000)) }
function money(n: number) { return `$${n.toFixed(2)}` }
function moneyShort(n: number) { return n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${Math.round(n)}` }

// Range for a view anchored on a date.
function rangeBounds(view: View, anchor: string): { start: string; end: string } {
  const d = parse(anchor)
  if (view === 'week') { const s = shift(anchor, -d.getDay()); return { start: s, end: shift(s, 6) } }
  if (view === 'month') return { start: ymd(new Date(d.getFullYear(), d.getMonth(), 1)), end: ymd(new Date(d.getFullYear(), d.getMonth() + 1, 0)) }
  if (view === 'quarter') { const q = Math.floor(d.getMonth() / 3); return { start: ymd(new Date(d.getFullYear(), q * 3, 1)), end: ymd(new Date(d.getFullYear(), q * 3 + 3, 0)) } }
  return { start: `${d.getFullYear()}-01-01`, end: `${d.getFullYear()}-12-31` }
}
function stepAnchor(view: View, anchor: string, dir: number): string {
  const d = parse(anchor)
  if (view === 'week') return shift(anchor, dir * 7)
  if (view === 'month') { d.setMonth(d.getMonth() + dir); return ymd(d) }
  if (view === 'quarter') { d.setMonth(d.getMonth() + dir * 3); return ymd(d) }
  d.setFullYear(d.getFullYear() + dir); return ymd(d)
}
// Comparison anchor (previous period, or same period last year).
function compareAnchor(view: View, anchor: string, mode: Compare): string | null {
  if (mode === 'none') return null
  if (mode === 'yoy') { const d = parse(anchor); d.setFullYear(d.getFullYear() - 1); return ymd(d) }
  return stepAnchor(view, anchor, -1)
}
function periodLabel(view: View, anchor: string): string {
  const d = parse(anchor)
  if (view === 'week') { const b = rangeBounds('week', anchor); return `${parse(b.start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${parse(b.end).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` }
  if (view === 'month') return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  if (view === 'quarter') return `Q${Math.floor(d.getMonth() / 3) + 1} ${d.getFullYear()}`
  return String(d.getFullYear())
}

// Accrued (earned) value of a booking within [start,end].
function earnedInRange(b: Booking, start: string, end: string): number {
  if (b.status === 'cancelled') return 0
  const total = Number(b.total_price)
  if (b.service_type === 'daycare') return b.dropoff_date >= start && b.dropoff_date <= end ? total : 0
  const n = nightsBetween(b.dropoff_date, b.pickup_date)
  if (n <= 0) return 0
  let inRange = 0
  for (let d = b.dropoff_date; d < b.pickup_date; d = shift(d, 1)) if (d >= start && d <= end) inRange++
  return total * inRange / n
}
// Rover bookings (valued by rate card, stored in rover_earned; separate from Woof analytics).
interface RoverBk { id: string; service_type: 'boarding' | 'daycare'; status: string; dropoff_date: string; pickup_date: string; rover_earned: number }
// Accrued Rover rate-card value within [start,end] — same basis as earnedInRange.
function roverEarnedInRange(b: RoverBk, start: string, end: string): number {
  if (b.status === 'cancelled') return 0
  const total = Number(b.rover_earned)
  if (b.service_type === 'daycare') return b.dropoff_date >= start && b.dropoff_date <= end ? total : 0
  const n = nightsBetween(b.dropoff_date, b.pickup_date)
  if (n <= 0) return 0
  let inRange = 0
  for (let d = b.dropoff_date; d < b.pickup_date; d = shift(d, 1)) if (d >= start && d <= end) inRange++
  return total * inRange / n
}
// Nights by rate type for a booking (dates only; daycare = one 'daycare' unit).
function rateTypeNights(b: Booking): Record<string, number> {
  if (b.service_type === 'daycare') return { daycare: 1 }
  const n = nightsBetween(b.dropoff_date, b.pickup_date)
  if (n <= 0) return {}
  const holidays = getHolidayDateRange(b.dropoff_date, b.pickup_date)
  const extended = n >= EXTENDED_THRESHOLD
  const out: Record<string, number> = {}
  for (let d = b.dropoff_date; d < b.pickup_date; d = shift(d, 1)) {
    const t = holidays.has(d) ? 'holiday' : extended ? 'extended' : 'regular'
    out[t] = (out[t] ?? 0) + 1
  }
  return out
}

// Buckets for the time-series chart across a range.
function buckets(view: View, range: { start: string; end: string }): { key: string; label: string; start: string; end: string }[] {
  const out: { key: string; label: string; start: string; end: string }[] = []
  if (view === 'week' || view === 'month') {
    for (let d = range.start; d <= range.end; d = shift(d, 1)) {
      const dd = parse(d).getDate()
      out.push({ key: d, label: view === 'week' ? parse(d).toLocaleDateString('en-US', { weekday: 'short' }) : (dd === 1 || dd % 5 === 0 ? String(dd) : ''), start: d, end: d })
    }
  } else if (view === 'quarter') {
    let s = range.start
    while (s <= range.end) { const e = shift(s, 6); out.push({ key: s, label: parse(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), start: s, end: e > range.end ? range.end : e }); s = shift(s, 7) }
  } else {
    const y = parse(range.start).getFullYear()
    for (let m = 0; m < 12; m++) out.push({ key: `${y}-${m}`, label: ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'][m], start: ymd(new Date(y, m, 1)), end: ymd(new Date(y, m + 1, 0)) })
  }
  return out
}

function pct(now: number, prev: number | null): { text: string; up: boolean } | null {
  if (prev == null) return null
  if (prev === 0) return now > 0 ? { text: 'new', up: true } : null
  const change = ((now - prev) / prev) * 100
  return { text: `${change >= 0 ? '+' : ''}${change.toFixed(0)}%`, up: change >= 0 }
}

export default function ReportsPage() {
  const router = useRouter()
  const supabase = createClient()
  const [bookings, setBookings] = useState<Booking[]>([])
  const [roverBks, setRoverBks] = useState<RoverBk[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)

  const [view, setView] = useState<View>('month')
  const [anchor, setAnchor] = useState(todayStr())
  const [compare, setCompare] = useState<Compare>('previous')
  const [svc, setSvc] = useState<ServiceFilter>('all')
  const [tab, setTab] = useState<Tab>('revenue')

  const load = useCallback(async () => {
    setLoading(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.replace('/auth'); return }
    const { data: isAdmin } = await supabase.rpc('is_admin')
    if (!isAdmin) { router.replace('/'); return }
    const [bR, pR, rR] = await Promise.all([
      supabase.rpc('get_analytics_bookings'),
      supabase.rpc('get_analytics_payments'),
      supabase.rpc('get_rover_earnings'),
    ])
    setBookings((bR.data ?? []) as Booking[])
    setPayments((pR.data ?? []) as Payment[])
    setRoverBks((rR.data ?? []) as RoverBk[])
    setLoading(false)
  }, [router, supabase])
  useEffect(() => { load() }, [load])

  // Service filter applied to the working sets.
  const bks = useMemo(() => svc === 'all' ? bookings : bookings.filter(b => b.service_type === svc), [bookings, svc])
  const pays = useMemo(() => svc === 'all' ? payments : payments.filter(p => p.service_type === svc), [payments, svc])
  const roverF = useMemo(() => svc === 'all' ? roverBks : roverBks.filter(b => b.service_type === svc), [roverBks, svc])

  const range = rangeBounds(view, anchor)
  const cmpAnchor = compareAnchor(view, anchor, compare)
  const cmpRange = cmpAnchor ? rangeBounds(view, cmpAnchor) : null

  // ── Metric helpers over an arbitrary range ──
  const inRange = (d: string, r: { start: string; end: string }) => d >= r.start && d <= r.end
  const earned = (r: { start: string; end: string }) => bks.reduce((s, b) => s + earnedInRange(b, r.start, r.end), 0)
  const roverEarned = (r: { start: string; end: string }) => roverF.reduce((s, b) => s + roverEarnedInRange(b, r.start, r.end), 0)
  const collected = (r: { start: string; end: string }) => pays.filter(p => inRange(p.paid_on, r)).reduce((s, p) => s + Number(p.amount), 0)
  const bookedIn = (r: { start: string; end: string }) => bks.filter(b => b.status !== 'cancelled' && inRange(b.dropoff_date, r))
  const bookingCount = (r: { start: string; end: string }) => bookedIn(r).length
  const newClientCount = (r: { start: string; end: string }) => new Set(bookedIn(r).filter(b => b.is_new_client).map(b => b.client_id)).size
  const referralTotal = (r: { start: string; end: string }) => bookedIn(r).reduce((s, b) => s + Number(b.referral_discount), 0)
  const avgValue = (r: { start: string; end: string }) => { const l = bookedIn(r); return l.length ? l.reduce((s, b) => s + Number(b.total_price), 0) / l.length : 0 }

  // ── KPI scorecards ──
  const kpis = [
    { label: 'Earned', now: earned(range), prev: cmpRange ? earned(cmpRange) : null, fmt: money },
    { label: 'Rover Earned', now: roverEarned(range), prev: cmpRange ? roverEarned(cmpRange) : null, fmt: money },
    { label: 'Collected', now: collected(range), prev: cmpRange ? collected(cmpRange) : null, fmt: money },
    { label: 'Bookings', now: bookingCount(range), prev: cmpRange ? bookingCount(cmpRange) : null, fmt: (n: number) => String(n) },
    { label: 'New clients', now: newClientCount(range), prev: cmpRange ? newClientCount(cmpRange) : null, fmt: (n: number) => String(n) },
    { label: 'Avg booking', now: avgValue(range), prev: cmpRange ? avgValue(cmpRange) : null, fmt: money },
    { label: 'Referral $', now: referralTotal(range), prev: cmpRange ? referralTotal(cmpRange) : null, fmt: money },
  ]

  // ── Time-series (earned vs collected per bucket) ──
  const series = useMemo(() => buckets(view, range).map(b => ({
    label: b.label,
    earned: Math.round(earned({ start: b.start, end: b.end })),
    collected: Math.round(collected({ start: b.start, end: b.end })),
    bookings: bookingCount({ start: b.start, end: b.end }),
  })), [view, anchor, bks, pays]) // eslint-disable-line react-hooks/exhaustive-deps

  const rangeBks = bookedIn(range)

  // ── Revenue splits ──
  const byService = (['boarding', 'daycare'] as const).map(t => ({ name: t === 'boarding' ? 'Boarding' : 'Daycare', value: Math.round(bookings.filter(b => b.service_type === t).reduce((s, b) => s + earnedInRange(b, range.start, range.end), 0)) })).filter(x => x.value > 0)
  const byPayment = (['cash', 'venmo'] as const).map(m => ({ name: m === 'cash' ? 'Cash' : 'Venmo', value: rangeBks.filter(b => b.payment_method === m).reduce((s, b) => s + Number(b.total_price), 0) })).filter(x => x.value > 0)

  // ── Rate mix (nights by type) ──
  const rateMix = useMemo(() => {
    const acc: Record<string, number> = {}
    for (const b of rangeBks) { const m = rateTypeNights(b); for (const k in m) acc[k] = (acc[k] ?? 0) + m[k] }
    return Object.entries(acc).map(([k, v]) => ({ name: k[0].toUpperCase() + k.slice(1), key: k, value: v }))
  }, [rangeBks]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Customers ──
  const newVsReturning = [
    { name: 'New', value: new Set(rangeBks.filter(b => b.is_new_client).map(b => b.client_id)).size },
    { name: 'Returning', value: new Set(rangeBks.filter(b => !b.is_new_client).map(b => b.client_id)).size },
  ].filter(x => x.value > 0)
  const topClients = useMemo(() => {
    const m: Record<string, { total: number; count: number; name: string }> = {}
    for (const b of rangeBks) {
      const name = `${b.client_first_name ?? ''} ${b.client_last_name ?? ''}`.trim() || `Client ${b.client_id.slice(0, 8)}`
      ;(m[b.client_id] ??= { total: 0, count: 0, name }); m[b.client_id].total += Number(b.total_price); m[b.client_id].count++
    }
    return Object.entries(m).map(([id, v]) => ({ id, ...v })).sort((a, b) => b.total - a.total).slice(0, 8)
  }, [rangeBks]) // eslint-disable-line react-hooks/exhaustive-deps
  // Booking cadence: median gap (days) between consecutive bookings per repeat client.
  const cadence = useMemo(() => {
    const byClient: Record<string, string[]> = {}
    for (const b of bks) if (b.status !== 'cancelled') (byClient[b.client_id] ??= []).push(b.dropoff_date)
    const gaps: number[] = []
    for (const id in byClient) { const ds = byClient[id].sort(); for (let i = 1; i < ds.length; i++) gaps.push(nightsBetween(ds[i - 1], ds[i])) }
    if (!gaps.length) return null
    gaps.sort((a, b) => a - b)
    return gaps[Math.floor(gaps.length / 2)]
  }, [bks])
  // Lead time: median days from booking creation to drop-off, for bookings in range.
  const leadTime = useMemo(() => {
    const l = rangeBks.map(b => nightsBetween(ymd(new Date(b.created_at)), b.dropoff_date)).filter(n => n >= 0).sort((a, b) => a - b)
    return l.length ? l[Math.floor(l.length / 2)] : null
  }, [rangeBks]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── CSV export of the bookings in the current view ──
  function exportCsv() {
    const rows = [...rangeBks].sort((a, b) => a.dropoff_date.localeCompare(b.dropoff_date))
    const head = ['dropoff', 'pickup', 'service', 'status', 'dogs', 'payment', 'total', 'referral_discount', 'new_client', 'created']
    const lines = rows.map(b => [b.dropoff_date, b.pickup_date, b.service_type, b.status, b.dogs_count, b.payment_method, Number(b.total_price).toFixed(2), Number(b.referral_discount).toFixed(2), b.is_new_client ? 'new' : 'returning', ymd(new Date(b.created_at))].join(','))
    const csv = [head.join(','), ...lines].join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const a = document.createElement('a'); a.href = url; a.download = `woof-report-${view}-${range.start}.csv`; a.click(); URL.revokeObjectURL(url)
  }

  return (
    <>
      <SiteNav />
      <main className="page-body" style={{ '--page-max': '1180px' } as React.CSSProperties}>
        <div style={s.head}>
          <h1 style={s.title}>Business Reports</h1>
          <button type="button" onClick={exportCsv} className="btn btn-outlined btn-sm">⬇ Export CSV</button>
        </div>

        {/* Control bar */}
        <div style={s.controls}>
          <div style={s.pillRow}>
            {(['week', 'month', 'quarter', 'year'] as View[]).map(v => (
              <button key={v} type="button" onClick={() => { setView(v); setAnchor(todayStr()) }} aria-pressed={view === v}
                className={`seg-btn${view === v ? ' is-active' : ''}`}>{v[0].toUpperCase() + v.slice(1)}</button>
            ))}
          </div>
          <div style={s.navRow}>
            <button type="button" onClick={() => setAnchor(a => stepAnchor(view, a, -1))} style={s.arrow} aria-label="Previous">‹</button>
            <span style={s.period}>{periodLabel(view, anchor)}</span>
            <button type="button" onClick={() => setAnchor(a => stepAnchor(view, a, 1))} style={s.arrow} aria-label="Next">›</button>
          </div>
          <select value={compare} onChange={e => setCompare(e.target.value as Compare)} style={s.select}>
            <option value="none">No comparison</option>
            <option value="previous">vs. previous</option>
            <option value="yoy">vs. last year</option>
          </select>
          <select value={svc} onChange={e => setSvc(e.target.value as ServiceFilter)} style={s.select}>
            <option value="all">All services</option>
            <option value="boarding">Boarding</option>
            <option value="daycare">Daycare</option>
          </select>
        </div>

        {loading ? <p style={s.muted}>Loading…</p> : (
          <>
            {/* KPI scorecards */}
            <div style={s.kpiGrid}>
              {kpis.map(k => {
                const p = pct(k.now, k.prev)
                return (
                  <div key={k.label} style={s.kpiCard}>
                    <span style={s.kpiLabel}>{k.label}</span>
                    <span style={s.kpiValue}>{k.fmt(k.now)}</span>
                    {p && <span style={{ ...s.kpiDelta, color: p.up ? '#15803d' : '#b4241c' }}>{p.text}{compare === 'yoy' ? ' YoY' : ''}</span>}
                  </div>
                )
              })}
            </div>

            {/* Tabs */}
            <div style={s.tabRow}>
              {(['revenue', 'demand', 'customers', 'rates'] as Tab[]).map(t => (
                <button key={t} type="button" onClick={() => setTab(t)} aria-pressed={tab === t}
                  className={`seg-btn${tab === t ? ' is-active' : ''}`}>
                  {t === 'revenue' ? 'Revenue' : t === 'demand' ? 'Bookings & Demand' : t === 'customers' ? 'Customers' : 'Rate Mix'}
                </button>
              ))}
            </div>

            {tab === 'revenue' && (
              <div style={s.cardCol}>
                <section style={s.card}>
                  <SectionHeader title="Earned vs. Collected" />
                  <ResponsiveContainer width="100%" height={260}>
                    <LineChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: -10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={moneyShort} />
                      <Tooltip formatter={(v) => money(Number(v))} />
                      <Legend />
                      <Line type="monotone" dataKey="earned" name="Earned" stroke={COLORS.earned} strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="collected" name="Collected" stroke={COLORS.collected} strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                  <p style={s.note}>Earned = value of service delivered in the period (boarding spread across nights). Collected = payments received in the period.</p>
                </section>
                <div style={s.twoUp}>
                  <section style={s.card}>
                    <SectionHeader title="Earned by service" />
                    <MiniPie data={byService} colors={[COLORS.boarding, COLORS.daycare]} />
                  </section>
                  <section style={s.card}>
                    <SectionHeader title="Booked value by payment" />
                    <MiniPie data={byPayment} colors={[COLORS.cash, COLORS.venmo]} />
                  </section>
                </div>
              </div>
            )}

            {tab === 'demand' && (
              <div style={s.cardCol}>
                <section style={s.card}>
                  <SectionHeader title="Bookings over time" />
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="bookings" name="Bookings" fill={COLORS.accent as string} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                  <p style={s.note}>Bookings counted by drop-off date. Median booking lead time this period: <b>{leadTime != null ? `${leadTime} days` : '—'}</b> from booking to drop-off.</p>
                </section>
              </div>
            )}

            {tab === 'customers' && (
              <div style={s.cardCol}>
                <div style={s.twoUp}>
                  <section style={s.card}>
                    <SectionHeader title="New vs. returning" />
                    <MiniPie data={newVsReturning} colors={['#16a34a', '#64748b']} />
                  </section>
                  <section style={s.card}>
                    <SectionHeader title="Booking cadence" />
                    <div style={s.bigStat}>{cadence != null ? `${cadence}` : '—'}<span style={s.bigStatUnit}>median days between a client&apos;s bookings</span></div>
                  </section>
                </div>
                <section style={s.card}>
                  <SectionHeader title="Top clients (this period)" />
                  {topClients.length === 0 ? <p style={s.muted}>No bookings in range.</p> : (
                    <div>
                      {topClients.map((c, i) => (
                        <div key={c.id} style={s.rankRow}>
                          <span style={s.rankNum}>{i + 1}</span>
                          <span style={s.rankName}>{c.name}</span>
                          <span style={s.rankMeta}>{c.count} booking{c.count !== 1 ? 's' : ''}</span>
                          <span style={s.rankTotal}>{money(c.total)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <p style={s.note}>Ranked by total booked value in the selected period.</p>
                </section>
              </div>
            )}

            {tab === 'rates' && (
              <div style={s.cardCol}>
                <section style={s.card}>
                  <SectionHeader title="Nights by rate type" />
                  <MiniPie data={rateMix.map(r => ({ name: r.name, value: r.value }))} colors={rateMix.map(r => (COLORS as Record<string, string>)[r.key] ?? COLORS.regular)} />
                  <p style={s.note}>Boarding nights classified as Regular / Extended (8+ nights) / Holiday; Daycare counted as days. Reconstructed from each booking&apos;s dates.</p>
                </section>
              </div>
            )}
          </>
        )}
      </main>
    </>
  )
}

// Small reusable pie with legend + values.
function MiniPie({ data, colors }: { data: { name: string; value: number }[]; colors: string[] }) {
  if (data.length === 0) return <p style={s.muted}>No data in range.</p>
  const total = data.reduce((s, d) => s + d.value, 0)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
      <ResponsiveContainer width={160} height={160}>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius={44} outerRadius={70} paddingAngle={2}>
            {data.map((d, i) => <Cell key={d.name} fill={colors[i % colors.length]} />)}
          </Pie>
          <Tooltip formatter={(v) => Number(v).toLocaleString()} />
        </PieChart>
      </ResponsiveContainer>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 120 }}>
        {data.map((d, i) => (
          <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: colors[i % colors.length], flexShrink: 0 }} />
            <span style={{ flex: 1, color: 'var(--text-primary)' }}>{d.name}</span>
            <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{total ? Math.round((d.value / total) * 100) : 0}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  head:      { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 },
  title:     { margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--text-primary)' },
  controls:  { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 18 },
  pillRow:   { display: 'flex', gap: 6, flexWrap: 'wrap' },
  pill:      { padding: '6px 14px', borderRadius: 999, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-primary)', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  pillOn:    { background: 'var(--primary)', borderColor: 'var(--primary)', color: '#fff' },
  navRow:    { display: 'flex', alignItems: 'center', gap: 6 },
  arrow:     { width: 28, height: 28, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text-secondary)', fontSize: 18, lineHeight: 1, cursor: 'pointer', fontFamily: 'inherit' },
  period:    { fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', minWidth: 120, textAlign: 'center' },
  select:    { fontSize: 13, padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-primary)', cursor: 'pointer', fontFamily: 'inherit' },
  kpiGrid:   { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 18 },
  kpiCard:   { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-card)', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 3 },
  kpiLabel:  { fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' },
  kpiValue:  { fontSize: 22, fontWeight: 800, color: 'var(--text-primary)' },
  kpiDelta:  { fontSize: 12, fontWeight: 700 },
  tabRow:    { display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' },
  cardCol:   { display: 'flex', flexDirection: 'column', gap: 16 },
  twoUp:     { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 },
  card:      { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-card)', padding: '18px 20px' },
  note:      { margin: '10px 0 0', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 },
  muted:     { fontSize: 13, color: 'var(--text-secondary)', margin: '8px 0' },
  bigStat:   { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 40, fontWeight: 800, color: 'var(--text-primary)', padding: '10px 0' },
  bigStatUnit:{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' },
  rankRow:   { display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px solid var(--border)' },
  rankNum:   { width: 22, height: 22, borderRadius: '50%', background: 'var(--surface-muted)', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  rankName:  { flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' },
  rankMeta:  { fontSize: 12, color: 'var(--text-secondary)' },
  rankTotal: { fontSize: 14, fontWeight: 800, color: 'var(--text-primary)', minWidth: 70, textAlign: 'right' },
}
