'use client'
import React, { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase'

type RateKey =
  | 'regular_1st_cash' | 'regular_extra_cash'
  | 'extended_1st_cash' | 'extended_extra_cash'
  | 'holiday_1st_cash'  | 'holiday_extra_cash'
  | 'daycare_1st_cash'
type AllKey = RateKey | 'venmo_surcharge' | 'puppy_surcharge'

// The 7 cash rates the bulk-adjust applies to (NOT venmo/puppy surcharge)
const CASH_FIELDS: { key: RateKey; label: string }[] = [
  { key: 'regular_1st_cash',    label: 'Regular Boarding — 1st Dog (Cash)' },
  { key: 'regular_extra_cash',  label: 'Regular Boarding — Extra Dog (Cash)' },
  { key: 'extended_1st_cash',   label: 'Extended Boarding — 1st Dog (Cash)' },
  { key: 'extended_extra_cash', label: 'Extended Boarding — Extra Dog (Cash)' },
  { key: 'holiday_1st_cash',    label: 'Holiday Boarding — 1st Dog (Cash)' },
  { key: 'holiday_extra_cash',  label: 'Holiday Boarding — Extra Dog (Cash)' },
  { key: 'daycare_1st_cash',    label: 'Daycare — Per Dog (Cash)' },
]
const ALL_KEYS: AllKey[] = [...CASH_FIELDS.map(f => f.key), 'venmo_surcharge', 'puppy_surcharge']

type Draft = Record<AllKey, string>

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2)
}

export function PricingEditor() {
  const supabase = createClient()
  const [draft,   setDraft]   = useState<Draft | null>(null)
  const [saved,   setSaved]   = useState<Draft | null>(null)   // last persisted values
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [err,     setErr]     = useState('')
  const [notice,  setNotice]  = useState('')
  const [bulk,    setBulk]    = useState('')

  async function load() {
    const { data, error } = await supabase.from('pricing_rates').select('*').eq('id', 1).single()
    if (error || !data) { setErr('Could not load pricing.'); setLoading(false); return }
    const d = {} as Draft
    for (const k of ALL_KEYS) d[k] = fmt(Number(data[k]))
    setDraft(d); setSaved(d); setLoading(false)
  }
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function set(key: AllKey, value: string) {
    setDraft(prev => prev ? { ...prev, [key]: value } : prev)
    setNotice('')
  }

  const dirty = useMemo(() => {
    if (!draft || !saved) return false
    return ALL_KEYS.some(k => draft[k] !== saved[k])
  }, [draft, saved])

  const venmoSurchargeNum = draft ? Number(draft.venmo_surcharge) : 0

  // Bulk preview: each cash field + bulk amount
  const bulkNum = bulk.trim() === '' ? null : Number(bulk)
  const bulkValid = bulkNum !== null && !Number.isNaN(bulkNum) && bulkNum !== 0
  const bulkPreview = useMemo(() => {
    if (!draft || !bulkValid) return null
    return CASH_FIELDS.map(f => ({
      label: f.label,
      from:  Number(draft[f.key]),
      to:    Number(draft[f.key]) + (bulkNum as number),
    }))
  }, [draft, bulkValid, bulkNum])

  function applyBulk() {
    if (!draft || !bulkValid) return
    const next = { ...draft }
    for (const f of CASH_FIELDS) next[f.key] = fmt(Number(draft[f.key]) + (bulkNum as number))
    setDraft(next)
    setBulk('')
    setNotice('Bulk adjustment applied to the 7 cash rates below — review, then Save changes.')
  }

  async function save() {
    if (!draft) return
    setErr(''); setNotice('')
    // Validate all 9 are valid non-negative numbers
    const payload: Record<string, number> = {}
    for (const k of ALL_KEYS) {
      const n = Number(draft[k])
      if (Number.isNaN(n) || n < 0) { setErr(`"${draft[k]}" is not a valid amount.`); return }
      payload[k] = n
    }
    setSaving(true)
    const { error } = await supabase.from('pricing_rates')
      .update({ ...payload, updated_at: new Date().toISOString() }).eq('id', 1)
    setSaving(false)
    if (error) { setErr('Save failed — please try again.'); return }
    const normalized = {} as Draft
    for (const k of ALL_KEYS) normalized[k] = fmt(payload[k])
    setDraft(normalized); setSaved(normalized)
    setNotice('Pricing saved. New rates apply to future bookings only — existing bookings are unchanged.')
  }

  if (loading) return <p style={s.muted}>Loading…</p>
  if (!draft)  return <p style={{ ...s.muted, color: '#ef4444' }}>{err || 'Could not load pricing.'}</p>

  return (
    <div>
      <p style={s.hint}>
        Edit the cash rates below. Venmo prices are computed automatically as cash + the Venmo
        surcharge — they&apos;re never set independently. Saving affects <strong>future bookings only</strong>;
        existing bookings keep the price calculated when they were created.
      </p>

      {/* ── Cash rates with live Venmo preview ── */}
      <div style={s.grid}>
        {CASH_FIELDS.map(f => {
          const cash = Number(draft[f.key])
          const venmo = (Number.isNaN(cash) ? 0 : cash) + venmoSurchargeNum
          return (
            <div key={f.key} style={s.field}>
              <label style={s.label}>{f.label}</label>
              <div style={s.inputRow}>
                <span style={s.dollar}>$</span>
                <input
                  type="number" min="0" step="1" inputMode="decimal"
                  value={draft[f.key]} onChange={e => set(f.key, e.target.value)}
                  style={s.input}
                />
                <span style={s.venmoPreview}>Venmo: <strong>${fmt(venmo)}</strong></span>
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Surcharges ── */}
      <div style={{ ...s.grid, marginTop: 4 }}>
        <div style={s.field}>
          <label style={s.label}>Venmo Surcharge (applies to all rates)</label>
          <div style={s.inputRow}>
            <span style={s.dollar}>$</span>
            <input type="number" min="0" step="1" inputMode="decimal"
              value={draft.venmo_surcharge} onChange={e => set('venmo_surcharge', e.target.value)} style={s.input} />
          </div>
        </div>
        <div style={s.field}>
          <label style={s.label}>Puppy Surcharge (per night)</label>
          <div style={s.inputRow}>
            <span style={s.dollar}>$</span>
            <input type="number" min="0" step="1" inputMode="decimal"
              value={draft.puppy_surcharge} onChange={e => set('puppy_surcharge', e.target.value)} style={s.input} />
          </div>
        </div>
      </div>

      {/* ── Bulk adjust ── */}
      <div style={s.bulkCard}>
        <p style={s.bulkTitle}>Bulk adjust cash rates</p>
        <p style={s.bulkHint}>Add or subtract an amount from all 7 cash rates at once (e.g. <code>+5</code> or <code>-2.50</code>). Does not touch the Venmo or puppy surcharge.</p>
        <div style={s.bulkRow}>
          <input type="number" step="0.5" inputMode="decimal" placeholder="+5"
            value={bulk} onChange={e => setBulk(e.target.value)} style={s.bulkInput} />
          <button type="button" onClick={applyBulk} disabled={!bulkValid}
            className="btn btn-outlined btn-sm">
            Apply to all cash rates
          </button>
        </div>
        {bulkPreview && (
          <div style={s.bulkPreview}>
            <p style={{ margin: '0 0 6px', fontSize: 12, fontWeight: 600, color: '#374151' }}>Preview:</p>
            {bulkPreview.map(p => (
              <div key={p.label} style={s.bulkPreviewRow}>
                <span style={{ color: '#6b7280' }}>{p.label}</span>
                <span><span style={{ color: '#9ca3af' }}>${fmt(p.from)}</span> → <strong>${fmt(p.to)}</strong></span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Save ── */}
      {err && <p style={{ margin: '14px 0 0', fontSize: 13, color: '#ef4444' }}>{err}</p>}
      {notice && <p style={{ margin: '14px 0 0', fontSize: 13, color: '#15803d' }}>{notice}</p>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16 }}>
        <button type="button" onClick={save} disabled={!dirty || saving}
          className="btn btn-primary btn-sm">
          {saving ? 'Saving…' : 'Save changes'}
        </button>
        {dirty && !saving && <span style={{ fontSize: 13, color: '#b45309' }}>Unsaved changes</span>}
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  hint:        { margin: '0 0 18px', fontSize: 13, color: '#6b7280', lineHeight: 1.6 },
  muted:       { fontSize: 14, color: '#9ca3af', margin: 0 },
  grid:        { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 },
  field:       { display: 'flex', flexDirection: 'column', gap: 5 },
  label:       { fontSize: 13, fontWeight: 600, color: '#374151' },
  inputRow:    { display: 'flex', alignItems: 'center', gap: 8 },
  dollar:      { fontSize: 15, color: '#6b7280' },
  input:       { width: 90, fontSize: 14, padding: '8px 10px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', color: '#111827', fontFamily: 'inherit' },
  venmoPreview:{ fontSize: 13, color: '#6b7280' },
  bulkCard:    { marginTop: 22, background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 'var(--radius-card)', padding: '16px 18px' },
  bulkTitle:   { margin: '0 0 4px', fontSize: 14, fontWeight: 700, color: '#111827' },
  bulkHint:    { margin: '0 0 12px', fontSize: 12, color: '#6b7280', lineHeight: 1.6 },
  bulkRow:     { display: 'flex', gap: 10, flexWrap: 'wrap' },
  bulkInput:   { width: 110, fontSize: 14, padding: '8px 10px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', color: '#111827', fontFamily: 'inherit' },
  bulkPreview: { marginTop: 12, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '10px 12px' },
  bulkPreviewRow: { display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12, padding: '3px 0' },
}
