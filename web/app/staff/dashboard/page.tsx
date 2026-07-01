'use client'
import React, { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { SiteNav } from '@/components/SiteNav'
import { dogNameColor } from '@/lib/dog-colors'
import { DateNavigator } from '@/components/shared/molecules/DateNavigator'
import { SectionHeader } from '@/components/shared/molecules/SectionHeader'

// ── Batch 11c — staff Dashboard. All metrics reflect REAL data for the selected
// date (default today), pulled via direct admin queries (no migration needed).
//
// METRIC DEFINITIONS:
//  • Collected = sum(total_price) of paid bookings keyed on paid_at's local date
//    (money actually received that day, regardless of drop-off). Full payments
//    only for now; partial payments arrive with the payment ledger (Batch 12).
//  • Earned = accrued economics of the day: each boarding stay present contributes
//    total/nights; each daycare booking contributes its full price. Payment-agnostic.
//  • Revenue panel Today/Week/Month = Collected over that period (by paid_at).
//  • Outstanding = all-time sum(total_price) of non-cancelled, unpaid reservations.
//  • Bookings-by-Day chart = COUNT of reservations per day (by dropoff_date).

interface Res {
  id: string; service_type: string; status: string
  dropoff_date: string; dropoff_time: string; pickup_date: string; pickup_time: string
  total_price: number; paid: boolean; paid_at: string | null
}
interface HereDog { name: string; gender: string | null; photo_url: string | null; photoSigned: string | null }

// ── date helpers (local) ──
function ymd(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
function todayStr() { return ymd(new Date()) }
function parse(s: string) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d) }
function shift(s: string, days: number) { const d = parse(s); d.setDate(d.getDate() + days); return ymd(d) }
function fmtLong(s: string) { return parse(s).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) }
function fmtTime(t: string | null) { if (!t) return '—'; const [h, m] = t.split(':').map(Number); return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}` }
function money(n: number) { return `$${n.toFixed(2)}` }
function monthBounds(s: string) { const d = parse(s); return { start: ymd(new Date(d.getFullYear(), d.getMonth(), 1)), end: ymd(new Date(d.getFullYear(), d.getMonth() + 1, 0)) } }
function weekBounds(s: string) { const d = parse(s); const start = shift(s, -d.getDay()); return { start, end: shift(start, 6) } }
function greeting() { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening' }

export default function DashboardPage() {
  const router = useRouter()
  const supabase = createClient()
  const [name, setName] = useState('')
  const [date, setDate] = useState(todayStr())
  const [res, setRes] = useState<Res[]>([])
  const [mg, setMg] = useState<{ scheduled_time: string }[]>([])
  const [here, setHere] = useState<HereDog[]>([])
  const [loading, setLoading] = useState(true)
  const [chartRange, setChartRange] = useState<'week' | 'month'>('month')

  const load = useCallback(async (d: string) => {
    setLoading(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.replace('/auth'); return }
    const { data: isAdmin } = await supabase.rpc('is_admin')
    if (!isAdmin) { router.replace('/'); return }
    setName((session.user.user_metadata?.full_name as string)?.split(' ')[0] ?? '')

    const [resR, mgR] = await Promise.all([
      supabase.from('reservations')
        .select('id, service_type, status, dropoff_date, dropoff_time, pickup_date, pickup_time, total_price, paid, paid_at')
        .neq('status', 'cancelled'),
      supabase.from('meet_greets').select('scheduled_time').eq('scheduled_date', d).neq('status', 'cancelled'),
    ])
    const rows = (resR.data ?? []) as Res[]
    setRes(rows)
    setMg((mgR.data ?? []) as { scheduled_time: string }[])

    // Currently here = boarding stays spanning the selected date.
    const present = rows.filter(r => r.service_type === 'boarding' && r.dropoff_date <= d && r.pickup_date > d)
    if (present.length) {
      const { data: rd } = await supabase.from('reservation_dogs')
        .select('reservation_id, dogs(name, gender, photo_url)')
        .in('reservation_id', present.map(r => r.id))
      const dogs: HereDog[] = (rd ?? []).map(row => {
        const dg = (Array.isArray(row.dogs) ? row.dogs[0] : row.dogs) as { name: string; gender: string | null; photo_url: string | null } | null
        return { name: dg?.name ?? '?', gender: dg?.gender ?? null, photo_url: dg?.photo_url ?? null, photoSigned: null }
      })
      const paths = [...new Set(dogs.map(x => x.photo_url).filter(Boolean) as string[])]
      const signed: Record<string, string> = {}
      if (paths.length) {
        const { data: urls } = await supabase.storage.from('dog-photos').createSignedUrls(paths, 3600)
        for (const u of urls ?? []) if (u.signedUrl && u.path) signed[u.path] = u.signedUrl
      }
      setHere(dogs.map(x => ({ ...x, photoSigned: x.photo_url ? (signed[x.photo_url] ?? null) : null })))
    } else setHere([])
    setLoading(false)
  }, [router, supabase])

  useEffect(() => { load(date) }, [date, load])

  // ── derive metrics for the selected date ──
  const D = date
  const month = monthBounds(D)
  const week = weekBounds(D)
  const notCancelled = res

  const presentBoarding = notCancelled.filter(r => r.service_type === 'boarding' && r.dropoff_date <= D && r.pickup_date > D)
  const daycareToday = notCancelled.filter(r => r.service_type === 'daycare' && r.dropoff_date === D)
  const dogsHereNow = here.length + daycareToday.length // boarding dogs (real) + daycare reservations today

  const arrivals = notCancelled.filter(r => r.dropoff_date === D)
  const departures = notCancelled.filter(r => r.service_type === 'boarding' && r.pickup_date === D)
  const nextTime = (list: string[]) => list.filter(Boolean).sort()[0] ?? null

  // Collected = money received in the window, keyed on the payment date (paid_at,
  // stamped when Paid is toggled), NOT the booking's drop-off date. paid_at is
  // converted to a local YYYY-MM-DD so "collected on this date" matches the calendar.
  // (Bookings paid before paid_at existed have a NULL stamp and don't count until re-toggled.)
  const paidSum = (from: string, to: string) =>
    notCancelled.filter(r => {
      if (!r.paid || !r.paid_at) return false
      const collected = new Date(r.paid_at).toLocaleDateString('en-CA')
      return collected >= from && collected <= to
    }).reduce((s, r) => s + Number(r.total_price), 0)
  const revenueToday = paidSum(D, D)
  const revenueWeek  = paidSum(week.start, week.end)
  const revenueMonth = paidSum(month.start, month.end)

  // Earned Today = accrued economics of the day, independent of payment: each
  // boarding stay present today contributes its per-night slice (total / nights);
  // each daycare booking today contributes its full price.
  const earnedToday =
    presentBoarding.reduce((sum, r) => {
      const nights = Math.max(1, Math.round(
        (new Date(r.pickup_date + 'T00:00:00').getTime() - new Date(r.dropoff_date + 'T00:00:00').getTime()) / 86400000))
      return sum + Number(r.total_price) / nights
    }, 0) +
    daycareToday.reduce((sum, r) => sum + Number(r.total_price), 0)
  // Unpaid splits by status: completed = genuinely overdue (Outstanding); upcoming
  // or in-progress = money expected but not yet collected (Upcoming Income).
  const outstanding    = notCancelled.filter(r => !r.paid && r.status === 'completed').reduce((s, r) => s + Number(r.total_price), 0)
  const upcomingIncome = notCancelled.filter(r => !r.paid && (r.status === 'upcoming' || r.status === 'in_progress')).reduce((s, r) => s + Number(r.total_price), 0)

  // chart: count of reservations per day by dropoff_date over the chosen range
  const range = chartRange === 'week' ? week : month
  const chart: { day: string; count: number }[] = []
  for (let cur = range.start; cur <= range.end; cur = shift(cur, 1)) {
    chart.push({ day: cur, count: notCancelled.filter(r => r.dropoff_date === cur).length })
  }
  const chartMax = Math.max(1, ...chart.map(c => c.count))

  // Labels are date-agnostic — the (now larger/darker) date under the picker heads
  // the whole row, so tiles don't repeat "Today"/the date. isToday only tweaks the
  // "Dogs Here" sub-line.
  const isToday = D === todayStr()
  const metrics = [
    { label: 'Dogs Here',     value: String(dogsHereNow),       sub: isToday ? 'Updated just now' : 'On this date', link: false },
    { label: 'Arrivals',      value: String(arrivals.length),   sub: `Next: ${fmtTime(nextTime(arrivals.map(r => r.dropoff_time)))}`, link: true },
    { label: 'Departures',    value: String(departures.length), sub: `Next: ${fmtTime(nextTime(departures.map(r => r.pickup_time)))}`, link: true },
    { label: 'Meet & Greets', value: String(mg.length),         sub: `Next: ${fmtTime(nextTime(mg.map(m => m.scheduled_time)))}`, link: true },
    { label: 'Collected',     value: money(revenueToday),       sub: 'Payments received', link: false },
    { label: 'Earned',        value: money(earnedToday),        sub: 'Accrued value', link: false },
  ]

  return (
    <div style={s.page}>
      <SiteNav />
      <main style={s.main}>
        {/* Header */}
        <div className="staff-header-3col" style={s.header}>
          <div className="page-header-text">
            <h2 style={s.greeting}>{greeting()}{name ? `, ${name}` : ''}!</h2>
            <p style={s.subtitle}>Here&apos;s what&apos;s happening today.</p>
          </div>
          <DateNavigator
            date={date}
            todayStr={todayStr()}
            onChange={setDate}
            onPrev={() => setDate(d => shift(d, -1))}
            onNext={() => setDate(d => shift(d, 1))}
          />
          <div className="page-header-cta" />
        </div>

        {/* Metric cards */}
        <div style={s.metricRow}>
          {metrics.map(m => (
            <div key={m.label} style={s.metricCard}>
              <span style={s.metricLabel}>{m.label}</span>
              <span style={s.metricValue}>{loading ? '—' : m.value}</span>
              <div style={s.metricFoot}>
                <span style={s.metricSub}>{m.sub}</span>
                {m.link && <a href="/staff/schedule" style={s.schedLink}>View Schedule →</a>}
              </div>
            </div>
          ))}
        </div>

        {/* 3-column body (collapses to 1 column on tablet/mobile via globals.css) */}
        <div className="dash-body">
          {/* Revenue panel */}
          <section style={s.panel}>
            <SectionHeader title="Revenue" action={<a href="#" style={s.viewLink}>View report</a>} />
            {([
              ['Today',               revenueToday,   'var(--text-primary)'],
              ['This Week',           revenueWeek,    'var(--text-primary)'],
              ['This Month',          revenueMonth,   'var(--text-primary)'],
              ['Outstanding Balances',outstanding,    'var(--warning)'],
              ['Upcoming Income',     upcomingIncome, 'var(--success)'],
            ] as const).map(([l, v, color]) => (
              <div key={l} style={s.revRow}>
                <span style={s.revLabel}>{l}</span>
                <span style={{ ...s.revVal, color: loading ? 'var(--text-secondary)' : color }}>{loading ? '—' : money(v)}</span>
              </div>
            ))}
          </section>

          {/* Bookings by Day chart */}
          <section style={s.panel}>
            <SectionHeader title="Bookings by Day" action={
              <select value={chartRange} onChange={e => setChartRange(e.target.value as 'week' | 'month')} style={s.rangeSelect}>
                <option value="month">This Month</option>
                <option value="week">This Week</option>
              </select>
            } />
            <div style={s.chart}>
              {chart.map(c => {
                const day = parse(c.day).getDate()
                const showLabel = chartRange === 'week' || day === 1 || day % 5 === 0
                return (
                  <div key={c.day} style={s.barCol} title={`${c.day}: ${c.count} booking${c.count !== 1 ? 's' : ''}`}>
                    <div style={{ ...s.bar, height: `${(c.count / chartMax) * 100}%`, background: c.day === D ? 'var(--primary-dark)' : 'var(--primary)' }} />
                    <span style={s.barLabel}>{showLabel ? day : ''}</span>
                  </div>
                )
              })}
            </div>
            <p style={s.chartNote}>Bars = number of bookings per day (by drop-off date).</p>
          </section>

          {/* Currently Here */}
          <section style={s.panel}>
            <SectionHeader title="Currently Here" count={here.length} action={<a href="/staff/schedule" style={s.viewLink}>View all</a>} />
            {here.length === 0 ? <p style={s.muted}>No dogs boarding on this date.</p> : (
              <div style={s.hereGrid}>
                {here.slice(0, 6).map((d, i) => (
                  <div key={i} style={s.hereItem}>
                    {d.photoSigned ? <img src={d.photoSigned} alt={d.name} style={s.hereAvatar} /> : <div style={s.hereFallback}>🐕</div>}
                    <span style={{ ...s.hereName, color: dogNameColor(d.gender) }} title={d.name}>{d.name}</span>
                  </div>
                ))}
                {here.length > 6 && (
                  <div style={s.hereItem}><div style={s.hereMore}>+{here.length - 6}</div><span style={s.hereName}>more</span></div>
                )}
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  page:        { minHeight: '100vh', background: 'var(--background)' },
  main:        { maxWidth: 1200, margin: '0 auto', padding: '28px 24px 60px' },
  header:      {},
  greeting:    { margin: 0, fontSize: 26, fontWeight: 800, color: 'var(--text-primary)' },
  subtitle:    { margin: '4px 0 0', fontSize: 15, color: 'var(--text-secondary)' },

  metricRow:   { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(172px, 1fr))', gap: 14, marginBottom: 22 },
  metricCard:  { background: 'var(--surface)', borderRadius: 'var(--radius-card)', padding: '18px 20px', boxShadow: '0 0 3.5px rgba(0,0,0,0.1)', display: 'flex', flexDirection: 'column', gap: 6, height: 130 },
  metricLabel: { fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' },
  metricValue: { fontSize: 30, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 },
  metricFoot:  { marginTop: 'auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  metricSub:   { fontSize: 12, color: 'var(--text-secondary)' },
  schedLink:   { fontSize: 12, fontWeight: 700, color: 'var(--primary)', textDecoration: 'none' },

  body:        { display: 'grid', gridTemplateColumns: 'minmax(220px, 1fr) minmax(280px, 2fr) minmax(220px, 1fr)', gap: 16, alignItems: 'start' },
  panel:       { background: 'var(--surface)', borderRadius: 'var(--radius-card)', padding: '20px 22px', boxShadow: '0 0 3.5px rgba(0,0,0,0.1)' },
  panelHead:   { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 10 },
  panelTitle:  { margin: 0, fontSize: 15, fontWeight: 800, color: 'var(--text-primary)' },
  viewLink:    { fontSize: 13, fontWeight: 600, color: 'var(--primary)', textDecoration: 'none' },
  revRow:      { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '10px 0', borderBottom: '1px solid var(--border)' },
  revLabel:    { fontSize: 14, color: 'var(--text-secondary)' },
  revVal:      { fontSize: 17, fontWeight: 800 },

  rangeSelect: { fontSize: 13, padding: '6px 12px', borderRadius: 999, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-primary)', cursor: 'pointer', fontFamily: 'inherit' },
  chart:       { display: 'flex', alignItems: 'flex-end', gap: 3, height: 180, padding: '0 2px' },
  barCol:      { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end', gap: 4, minWidth: 0 },
  bar:         { width: '100%', maxWidth: 22, borderRadius: 6, minHeight: 2, transition: 'height 0.2s' },
  barLabel:    { fontSize: 10, color: 'var(--text-secondary)', height: 12 },
  chartNote:   { margin: '10px 0 0', fontSize: 12, color: 'var(--text-secondary)' },

  hereGrid:    { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(72px, 1fr))', gap: 12 },
  hereItem:    { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, minWidth: 0 },
  hereAvatar:  { width: 48, height: 48, borderRadius: '50%', objectFit: 'cover' as const, border: '2px solid var(--border)' },
  hereFallback:{ width: 48, height: 48, borderRadius: '50%', background: 'var(--surface-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 },
  hereMore:    { width: 48, height: 48, borderRadius: '50%', background: 'var(--primary-light)', color: 'var(--primary-dark)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 800 },
  hereName:    { fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  muted:       { fontSize: 13, color: 'var(--text-secondary)', margin: 0 },
}
