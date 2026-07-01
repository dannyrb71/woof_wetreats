'use client'
import React, { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

interface StaffMember {
  id: string
  email: string
  first_name: string | null
  last_name: string | null
  added_at: string
  added_by: string | null
}

function fmtDate(ts: string): string {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
function isValidEmail(e: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)
}
function fullName(m: StaffMember): string {
  return [m.first_name, m.last_name].filter(Boolean).join(' ').trim()
}

export function StaffManager() {
  const supabase = createClient()
  const [members,  setMembers]  = useState<StaffMember[]>([])
  const [myEmail,  setMyEmail]  = useState('')
  const [loading,  setLoading]  = useState(true)
  const [first,    setFirst]    = useState('')
  const [last,     setLast]     = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [adding,   setAdding]   = useState(false)
  const [err,      setErr]      = useState('')
  const [notice,   setNotice]   = useState('')
  const [confirmId, setConfirmId] = useState<string | null>(null)

  async function load() {
    const { data: { session } } = await supabase.auth.getSession()
    setMyEmail((session?.user.email ?? '').toLowerCase())
    const { data, error } = await supabase
      .from('staff_members').select('id, email, first_name, last_name, added_at, added_by').order('added_at')
    if (error) { setErr('Could not load staff list.'); setLoading(false); return }
    setMembers((data ?? []) as StaffMember[])
    setLoading(false)
  }
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function addMember() {
    const email = newEmail.trim().toLowerCase()
    const fn = first.trim()
    const ln = last.trim()
    setErr(''); setNotice('')
    if (!fn || !ln)              { setErr('First and last name are both required.'); return }
    if (!isValidEmail(email))    { setErr('Please enter a valid email address.'); return }
    if (members.some(m => m.email.toLowerCase() === email)) { setErr('That email is already a staff member.'); return }

    setAdding(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setErr('Session expired — please refresh.'); setAdding(false); return }

    // Server-side: adds to staff_members AND sends the Supabase Auth invite email
    const resp = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/invite-staff`,
      {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          'apikey':        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        },
        body: JSON.stringify({ email, first_name: fn, last_name: ln, redirect_to: `${window.location.origin}/set-password` }),
      }
    )
    const result = await resp.json().catch(() => ({}))
    setAdding(false)
    if (!resp.ok || !result.member) { setErr(result.error ?? 'Could not add staff member — try again.'); return }

    setMembers(prev => [...prev, result.member as StaffMember])
    setFirst(''); setLast(''); setNewEmail('')
    setNotice(result.invited
      ? `Invite email sent to ${fn} ${ln} (${email}). They'll set their own password via the link.`
      : (result.note || `${fn} ${ln} added.`))
  }

  async function removeMember(id: string) {
    setErr('')
    const { error } = await supabase.from('staff_members').delete().eq('id', id)
    if (error) {
      setErr(error.message.includes('last staff') ? 'There must always be at least one staff member.' : 'Could not remove — try again.')
      setConfirmId(null)
      return
    }
    setMembers(prev => prev.filter(m => m.id !== id))
    setConfirmId(null)
  }

  return (
    <div>
      <p style={s.hint}>Everyone listed here has full staff access — managing clients, bookings, availability, and other staff. There are no permission tiers.</p>

      {/* Add */}
      <div style={s.addRow}>
        <input value={first} onChange={e => setFirst(e.target.value)} placeholder="First name" style={s.inputSm} />
        <input value={last}  onChange={e => setLast(e.target.value)}  placeholder="Last name"  style={s.inputSm} />
        <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') addMember() }}
          placeholder="email@example.com" style={s.input} />
        <button type="button" onClick={addMember} disabled={adding} className="btn btn-primary btn-sm">
          {adding ? 'Adding…' : 'Add Staff Member'}
        </button>
      </div>
      {err && <p style={{ margin: '0 0 12px', fontSize: 13, color: '#ef4444' }}>{err}</p>}
      {notice && <p style={{ margin: '0 0 12px', fontSize: 13, color: '#15803d' }}>{notice}</p>}

      {/* List */}
      {loading ? (
        <p style={s.muted}>Loading…</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {members.map(m => {
            const isMe   = m.email.toLowerCase() === myEmail
            const isLast = members.length <= 1
            const name   = fullName(m)
            return (
              <div key={m.id} style={s.row}>
                <div style={{ minWidth: 0 }}>
                  <p style={s.name}>
                    {name || <span style={{ color: '#9ca3af' }}>(name not set)</span>}
                    {isMe && <span style={s.youTag}>you</span>}
                  </p>
                  <p style={s.email}>{m.email}</p>
                  <p style={s.meta}>Added {fmtDate(m.added_at)}{m.added_by ? ` · by ${m.added_by}` : ''}</p>
                </div>
                {confirmId === m.id ? (
                  <div style={s.confirmWrap}>
                    <span style={s.confirmText}>Remove?</span>
                    <button type="button" onClick={() => removeMember(m.id)} className="btn btn-destructive btn-xs">Yes</button>
                    <button type="button" onClick={() => setConfirmId(null)} className="btn btn-ghost btn-xs">No</button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmId(m.id)}
                    disabled={isLast}
                    title={isLast ? 'At least one staff member must remain' : 'Remove'}
                    className="btn btn-destructive-outlined btn-xs"
                    style={{ opacity: isLast ? 0.4 : 1, cursor: isLast ? 'not-allowed' : 'pointer' }}
                  >
                    Remove
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  hint:        { margin: '0 0 16px', fontSize: 13, color: '#6b7280', lineHeight: 1.6 },
  addRow:      { display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' },
  inputSm:     { width: 130, fontSize: 14, padding: '9px 12px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', color: '#111827', fontFamily: 'inherit' },
  input:       { flex: 1, minWidth: 200, fontSize: 14, padding: '9px 12px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', color: '#111827', fontFamily: 'inherit' },
  muted:       { fontSize: 13, color: '#9ca3af', margin: 0 },
  row:         { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '12px 14px' },
  name:        { margin: 0, fontSize: 14, fontWeight: 600, color: '#111827', display: 'flex', alignItems: 'center', gap: 8 },
  email:       { margin: '2px 0 0', fontSize: 13, color: '#374151' },
  youTag:      { fontSize: 11, fontWeight: 700, background: '#eff6ff', color: '#1d4ed8', padding: '2px 8px', borderRadius: 20 },
  meta:        { margin: '3px 0 0', fontSize: 12, color: '#9ca3af' },
  confirmWrap: { display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 },
  confirmText: { fontSize: 12, color: '#374151', fontWeight: 600 },
}
