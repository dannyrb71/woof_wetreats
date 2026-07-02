'use client'
import React, { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

interface Payment { id: string; amount: number; method: string; paid_on: string; note: string | null }

function fmtDate(ymd: string) { return new Date(ymd + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }
function todayLA() { return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' }) }

export function PaymentsPanel({ reservationId, total, defaultMethod, onChanged }: {
  reservationId: string
  total:         number
  defaultMethod: 'cash' | 'venmo'
  onChanged:     () => void
}) {
  const supabase = createClient()
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading,  setLoading]  = useState(true)
  const [adding,   setAdding]   = useState(false)
  const [amount,   setAmount]   = useState('')
  const [method,   setMethod]   = useState<'cash' | 'venmo'>(defaultMethod)
  const [paidOn,   setPaidOn]   = useState(todayLA())
  const [busy,     setBusy]     = useState(false)
  const [err,      setErr]      = useState('')

  const load = useCallback(async () => {
    const { data } = await supabase.from('reservation_payments')
      .select('id, amount, method, paid_on, note').eq('reservation_id', reservationId).order('paid_on')
    setPayments((data ?? []) as Payment[]); setLoading(false)
  }, [reservationId, supabase])
  useEffect(() => { load() }, [load])

  const paidAmt = payments.reduce((t, p) => t + Number(p.amount), 0)
  const balance = Math.max(0, total - paidAmt)
  const fully   = total > 0 && paidAmt >= total

  function openAdd() {
    setAmount(balance > 0 ? balance.toFixed(2) : ''); setMethod(defaultMethod); setPaidOn(todayLA()); setErr(''); setAdding(true)
  }

  async function addPayment() {
    const amt = Number(amount)
    if (!amt || amt <= 0) { setErr('Enter an amount.'); return }
    setBusy(true); setErr('')
    const { data: { session } } = await supabase.auth.getSession()
    const { error } = await supabase.from('reservation_payments').insert({
      reservation_id: reservationId, amount: amt, method, paid_on: paidOn, created_by: session?.user.id ?? null,
    })
    setBusy(false)
    if (error) { setErr('Could not add payment — try again.'); return }
    setAdding(false); await load(); onChanged()
  }

  async function voidPayment(id: string) {
    setBusy(true); setErr('')
    const { error } = await supabase.from('reservation_payments').delete().eq('id', id)
    setBusy(false)
    if (error) { setErr('Could not remove — try again.'); return }
    await load(); onChanged()
  }

  return (
    <div style={s.panel}>
      <div style={s.summary}>
        <span>Total <b style={{ color: 'var(--text-primary)' }}>${total.toFixed(2)}</b></span>
        <span>Paid <b style={{ color: 'var(--success)' }}>${paidAmt.toFixed(2)}</b></span>
        <span>Balance <b style={{ color: balance > 0 ? 'var(--warning)' : 'var(--text-secondary)' }}>${balance.toFixed(2)}</b></span>
      </div>

      {!loading && payments.length > 0 && (
        <div style={s.list}>
          {payments.map(p => (
            <div key={p.id} style={s.pRow}>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{fmtDate(p.paid_on)} · {p.method === 'venmo' ? '💙 Venmo' : '💵 Cash'}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <b style={{ fontSize: 13, color: 'var(--text-primary)' }}>${Number(p.amount).toFixed(2)}</b>
                <button type="button" onClick={() => voidPayment(p.id)} disabled={busy} title="Remove payment" aria-label="Remove payment" style={s.void}>✕</button>
              </span>
            </div>
          ))}
        </div>
      )}

      {adding ? (
        <div style={s.addForm}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <label style={s.f}>Amount<input type="number" step="0.01" min="0" value={amount} onChange={e => setAmount(e.target.value)} style={{ ...s.in, width: 90 }} /></label>
            <label style={s.f}>Method
              <select value={method} onChange={e => setMethod(e.target.value as 'cash' | 'venmo')} style={s.in}>
                <option value="cash">💵 Cash</option><option value="venmo">💙 Venmo</option>
              </select>
            </label>
            <label style={s.f}>Date<input type="date" value={paidOn} onChange={e => setPaidOn(e.target.value)} style={s.in} /></label>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={addPayment} disabled={busy} className="btn btn-success btn-xs">{busy ? 'Saving…' : 'Save payment'}</button>
            <button type="button" onClick={() => setAdding(false)} className="btn btn-ghost btn-xs">Cancel</button>
          </div>
        </div>
      ) : (
        !fully && <button type="button" onClick={openAdd} className="btn btn-success btn-xs" style={{ marginTop: 8 }}>+ Add payment</button>
      )}
      {err && <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--error)' }}>{err}</p>}
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  panel:   { marginTop: 10, padding: '10px 12px', background: 'var(--background)', borderRadius: 10, border: '1px solid var(--border)' },
  summary: { display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13, color: 'var(--text-secondary)' },
  list:    { marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6, borderTop: '1px solid var(--border)', paddingTop: 8 },
  pRow:    { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  void:    { background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit', padding: 2, lineHeight: 1 },
  addForm: { marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 },
  f:       { display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' },
  in:      { fontSize: 13, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-primary)', fontFamily: 'inherit' },
}
