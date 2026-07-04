'use client'
import React, { useCallback, useEffect, useRef, useState } from 'react'
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
function yearBounds(s: string) { const y = parse(s).getFullYear(); return { start: `${y}-01-01`, end: `${y}-12-31` } }
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
// ISO-8601 week number (Mon-based) — used only for the "Week N" label.
function isoWeek(s: string) {
  const d = parse(s); const t = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const dayNr = (d.getDay() + 6) % 7; t.setDate(t.getDate() - dayNr + 3)
  const firstThu = new Date(t.getFullYear(), 0, 4)
  const firstDayNr = (firstThu.getDay() + 6) % 7; firstThu.setDate(firstThu.getDate() - firstDayNr + 3)
  return 1 + Math.round((t.getTime() - firstThu.getTime()) / (7 * 86400000))
}
function greeting() { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening' }

export default function DashboardPage() {
  const router = useRouter()
  const supabase = createClient()
  const [name, setName] = useState('')
  const [date, setDate] = useState(todayStr())
  const [res, setRes] = useState<Res[]>([])
  const [payments, setPayments] = useState<{ amount: number; paid_on: string }[]>([])
  const [mg, setMg] = useState<{ scheduled_time: string }[]>([])
  const [here, setHere] = useState<HereDog[]>([])
  const [loading, setLoading] = useState(true)
  const [chartView, setChartView] = useState<'year' | 'month' | 'week'>('month')
  const [chartAnchor, setChartAnchor] = useState(todayStr()) // any date inside the shown period
  const touchX = useRef<number | null>(null)

  const load = useCallback(async (d: string) => {
    setLoading(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.replace('/auth'); return }
    const { data: isAdmin } = await supabase.rpc('is_admin')
    if (!isAdmin) { router.replace('/'); return }
    setName((session.user.user_metadata?.full_name as string)?.split(' ')[0] ?? '')

    const [resR, mgR, payR] = await Promise.all([
      supabase.from('reservations')
        .select('id, service_type, status, dropoff_date, dropoff_time, pickup_date, pickup_time, total_price, paid, paid_at')
        .neq('status', 'cancelled'),
      supabase.from('meet_greets').select('scheduled_time').eq('scheduled_date', d).neq('status', 'cancelled'),
      supabase.from('reservation_payments').select('amount, paid_on'),
    ])
    const rows = (resR.data ?? []) as Res[]
    setRes(rows)
    setMg((mgR.data ?? []) as { scheduled_time: string }[])
    setPayments((payR.data ?? []) as { amount: number; paid_on: string }[])

    // On property right now = arrival checked AND departure not checked (RPC = single
    // source of truth, boarding + daycare). Matches the daily-schedule check-offs.
    const { data: presentDogs } = await supabase.rpc('dogs_present', { p_date: d })
    const dogs: HereDog[] = (presentDogs ?? []).map((row: { dog_name: string; gender: string | null; photo_url: string | null }) => ({
      name: row.dog_name, gender: row.gender, photo_url: row.photo_url, photoSigned: null,
    }))
    const paths = [...new Set(dogs.map(x => x.photo_url).filter(Boolean) as string[])]
    const signed: Record<string, string> = {}
    if (paths.length) {
      const { data: urls } = await supabase.storage.from('dog-photos').createSignedUrls(paths, 3600)
      for (const u of urls ?? []) if (u.signedUrl && u.path) signed[u.path] = u.signedUrl
    }
    setHere(dogs.map(x => ({ ...x, photoSigned: x.photo_url ? (signed[x.photo_url] ?? null) : null })))
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
  const dogsHereNow = here.length // present dogs (boarding + daycare) from dogs_present RPC

  const arrivals = notCancelled.filter(r => r.dropoff_date === D)
  const departures = notCancelled.filter(r => r.service_type === 'boarding' && r.pickup_date === D)
  const nextTime = (list: string[]) => list.filter(Boolean).sort()[0] ?? null

  // Collected = money actually received in the window, summed from the payment
  // ledger by each payment's date (paid_on) — so partial payments count on the
  // day they landed, regardless of the booking's drop-off date.
  const paidSum = (from: string, to: string) =>
    payments.filter(p => p.paid_on >= from && p.paid_on <= to).reduce((s, p) => s + Number(p.amount), 0)
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

  // chart: bookings by drop-off date, over the anchored period. Week/Month plot one
  // bar per day; Year aggregates into 12 monthly bars. `isToday` highlights the bar
  // covering the actual current date (only visible when the period includes today).
  const today = todayStr()
  const chart: { key: string; count: number; label: string; isToday: boolean }[] = []
  if (chartView === 'year') {
    const yr = parse(chartAnchor).getFullYear()
    const tParse = parse(today)
    for (let m = 0; m < 12; m++) {
      const count = notCancelled.filter(r => { const dt = parse(r.dropoff_date); return dt.getFullYear() === yr && dt.getMonth() === m }).length
      chart.push({ key: `${yr}-${m}`, count, label: MONTHS_SHORT[m], isToday: tParse.getFullYear() === yr && tParse.getMonth() === m })
    }
  } else {
    const range = chartView === 'week' ? weekBounds(chartAnchor) : monthBounds(chartAnchor)
    for (let cur = range.start; cur <= range.end; cur = shift(cur, 1)) {
      const dd = parse(cur).getDate()
      const showLabel = chartView === 'week' || dd === 1 || dd % 5 === 0
      chart.push({ key: cur, count: notCancelled.filter(r => r.dropoff_date === cur).length, label: showLabel ? String(dd) : '', isToday: cur === today })
    }
  }
  const chartMax = Math.max(1, ...chart.map(c => c.count))

  // Period label under the bars — "(current)" only when today falls in the window.
  const pb = chartView === 'year' ? yearBounds(chartAnchor) : chartView === 'month' ? monthBounds(chartAnchor) : weekBounds(chartAnchor)
  const periodText =
    chartView === 'year'  ? String(parse(chartAnchor).getFullYear())
    : chartView === 'month' ? parse(chartAnchor).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }).replace(' ', ', ')
    : `Week ${isoWeek(chartAnchor)}`
  const periodCurrent = today >= pb.start && today <= pb.end

  // Step the chart backward/forward by one whole period.
  const stepChart = (dir: number) => setChartAnchor(a => {
    const d = parse(a)
    if (chartView === 'year') d.setFullYear(d.getFullYear() + dir)
    else if (chartView === 'month') d.setMonth(d.getMonth() + dir)
    else d.setDate(d.getDate() + dir * 7)
    return ymd(d)
  })

  // Labels are date-agnostic — the (now larger/darker) date under the picker heads
  // the whole row, so tiles don't repeat "Today"/the date. isToday only tweaks the
  // "Dogs Here" sub-line.
  const isToday = D === todayStr()
  const metrics: { label: string; value: string; sub: string; link: boolean; href?: string }[] = [
    { label: 'Dogs Here',     value: String(dogsHereNow),       sub: isToday ? 'Updated just now' : 'On this date', link: false, href: '/staff/schedule' },
    { label: 'Arrivals',      value: String(arrivals.length),   sub: `Next: ${fmtTime(nextTime(arrivals.map(r => r.dropoff_time)))}`, link: true },
    { label: 'Departures',    value: String(departures.length), sub: `Next: ${fmtTime(nextTime(departures.map(r => r.pickup_time)))}`, link: true },
    { label: 'Meet & Greets', value: String(mg.length),         sub: `Next: ${fmtTime(nextTime(mg.map(m => m.scheduled_time)))}`, link: true },
    { label: 'Collected',     value: money(revenueToday),       sub: 'Payments received', link: false },
    { label: 'Earned',        value: money(earnedToday),        sub: 'Accrued value', link: false },
  ]

  return (
    <div className="page">
      <SiteNav />
      <main className="page-body">
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
          {metrics.map(m => {
            const inner = (
              <>
                <span style={s.metricLabel}>{m.label}</span>
                <span style={s.metricValue}>{loading ? '—' : m.value}</span>
                <div style={s.metricFoot}>
                  <span style={s.metricSub}>{m.sub}</span>
                  {m.link && <a href="/staff/schedule" style={s.schedLink}>View Schedule →</a>}
                </div>
              </>
            )
            return m.href
              ? <div key={m.label} role="button" tabIndex={0} onClick={() => router.push(m.href!)}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); router.push(m.href!) } }}
                  className="metric-clickable" style={{ ...s.metricCard, cursor: 'pointer' }}>{inner}</div>
              : <div key={m.label} style={s.metricCard}>{inner}</div>
          })}
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

          {/* Bookings chart */}
          <section style={s.panel}>
            <SectionHeader title="Bookings" action={
              <select value={chartView} onChange={e => { setChartView(e.target.value as 'year' | 'month' | 'week'); setChartAnchor(todayStr()) }} style={s.rangeSelect}>
                <option value="year">By Year</option>
                <option value="month">By Month</option>
                <option value="week">By Week</option>
              </select>
            } />
            <div style={s.chartRow}>
              <button type="button" onClick={() => stepChart(-1)} style={s.chartArrow} aria-label="Previous period">‹</button>
              <div
                style={s.chart}
                onPointerDown={e => { touchX.current = e.clientX }}
                onPointerUp={e => {
                  if (touchX.current === null) return
                  const dx = e.clientX - touchX.current
                  touchX.current = null
                  if (Math.abs(dx) > 40) stepChart(dx < 0 ? 1 : -1) // swipe/drag left → forward
                }}
                onPointerLeave={() => { touchX.current = null }}
              >
                {chart.map(c => (
                  <div key={c.key} style={s.barCol} title={`${c.label || c.key}: ${c.count} booking${c.count !== 1 ? 's' : ''}`}>
                    <div style={{ ...s.bar, height: `${(c.count / chartMax) * 100}%`, background: c.isToday ? 'var(--primary-dark)' : 'var(--primary)' }} />
                    <span style={s.barLabel}>{c.label}</span>
                  </div>
                ))}
              </div>
              <button type="button" onClick={() => stepChart(1)} style={s.chartArrow} aria-label="Next period">›</button>
            </div>
            <p style={s.periodLabel}>{periodText}{periodCurrent ? ' (current)' : ''}</p>
            <p style={s.chartNote}>
              Bars = bookings by drop-off date{chartView === 'year' ? ' (per month)' : ' (per day)'}. Swipe or use ‹ › to change {chartView === 'year' ? 'year' : chartView === 'month' ? 'month' : 'week'}.
            </p>
          </section>

          {/* Currently Here */}
          <section style={s.panel}>
            <SectionHeader title="Currently Here" count={here.length} action={<a href="/staff/schedule" style={s.viewLink}>View all</a>} />
            {here.length === 0 ? <p style={s.muted}>No dogs on the property right now.</p> : (
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
  // page shell + body come from the layout kit (.page / .page-body)
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
  chartRow:    { display: 'flex', alignItems: 'stretch', gap: 2 },
  chartArrow:  { flexShrink: 0, width: 30, alignSelf: 'stretch', border: 'none', background: 'transparent', color: 'var(--text-secondary)', fontSize: 26, lineHeight: 1, cursor: 'pointer', fontFamily: 'inherit', padding: 0, borderRadius: 8 },
  chart:       { flex: 1, display: 'flex', alignItems: 'flex-end', gap: 3, height: 180, padding: '0 2px', touchAction: 'pan-y', minWidth: 0 },
  barCol:      { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end', gap: 4, minWidth: 0 },
  bar:         { width: '100%', maxWidth: 22, borderRadius: 6, minHeight: 2, transition: 'height 0.2s' },
  barLabel:    { fontSize: 10, color: 'var(--text-secondary)', height: 12 },
  periodLabel: { margin: '12px 0 0', fontSize: 14, fontWeight: 800, color: 'var(--text-primary)', textAlign: 'center' },
  chartNote:   { margin: '6px 0 0', fontSize: 12, color: 'var(--text-secondary)', textAlign: 'center' },

  hereGrid:    { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(72px, 1fr))', gap: 12 },
  hereItem:    { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, minWidth: 0 },
  hereAvatar:  { width: 48, height: 48, borderRadius: '50%', objectFit: 'cover' as const, border: '2px solid var(--border)' },
  hereFallback:{ width: 48, height: 48, borderRadius: '50%', background: 'var(--surface-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 },
  hereMore:    { width: 48, height: 48, borderRadius: '50%', background: 'var(--primary-light)', color: 'var(--primary-dark)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 800 },
  hereName:    { fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  muted:       { fontSize: 13, color: 'var(--text-secondary)', margin: 0 },
}
