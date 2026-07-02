'use client'
import React, { useState } from 'react'
import { createClient } from '@/lib/supabase'
// NOTE: create the client once (lazy useState initializer). Calling createClient()
// directly in the component body makes a fresh, un-hydrated auth client on every
// render, which can send RPCs before the session loads -> auth.uid() is null ->
// SECURITY DEFINER checks fail with "not authorized".

interface Props {
  clientId:        string
  authUid:         string
  primaryAuthId:   string | null
  primaryName:     string
  primaryEmail:    string
  secondaryAuthId: string | null
  secondaryEmail:  string | null
  onChanged:       () => void
}

export function ManageUsers(props: Props) {
  const { clientId, authUid, primaryAuthId, primaryName, primaryEmail, secondaryAuthId, secondaryEmail, onChanged } = props
  const [supabase] = useState(() => createClient())

  const [adding,      setAdding]      = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [editingSelf, setEditingSelf] = useState(false)
  const [selfEmail,   setSelfEmail]   = useState('')
  const [newEmail,    setNewEmail]    = useState('')
  const [busy,        setBusy]        = useState(false)
  const [err,         setErr]         = useState('')
  const [notice,      setNotice]      = useState('')

  const isPrimaryYou  = authUid === primaryAuthId
  const isPartnerYou  = secondaryAuthId != null && authUid === secondaryAuthId
  const partnerJoined = secondaryAuthId != null
  const partnerPending = !partnerJoined && !!secondaryEmail

  async function sendInvite() {
    const email = inviteEmail.trim().toLowerCase()
    if (!email.includes('@')) { setErr('Enter a valid email.'); return }
    setBusy(true); setErr(''); setNotice('')
    const { error } = await supabase.rpc('set_coowner_invite', { p_client_id: clientId, p_email: email })
    setBusy(false)
    if (error) { setErr(`Could not send invite — ${error.message || 'try again.'}`); return }
    setAdding(false); setInviteEmail('')
    setNotice(`Invite ready — ${email} just needs to sign in with that email to join.`)
    onChanged()
  }

  async function removePartner() {
    setBusy(true); setErr(''); setNotice('')
    const { error } = await supabase.rpc('remove_coowner', { p_client_id: clientId })
    setBusy(false)
    if (error) { setErr(`Could not remove — ${error.message || 'try again.'}`); return }
    onChanged()
  }

  async function saveEmail() {
    const email = newEmail.trim().toLowerCase()
    if (!email.includes('@')) { setErr('Enter a valid email.'); return }
    if (email === selfEmail.trim().toLowerCase()) { setErr('That’s already your email.'); return }
    setBusy(true); setErr(''); setNotice('')
    // Supabase sends the confirmation + password-setup emails for the change.
    const { error } = await supabase.auth.updateUser({ email })
    setBusy(false)
    if (error) { setErr(error.message || 'Could not update email.'); return }
    setEditingSelf(false)
    setNotice(`We emailed ${email} — follow the link there to confirm the change and finish setting up your login.`)
  }

  function startEditSelf(current: string) { setSelfEmail(current); setNewEmail(current); setErr(''); setNotice(''); setEditingSelf(true) }

  return (
    <div style={s.card}>
      <h3 className="section-label" style={{ marginBottom: 6 }}>Manage Users</h3>

      {/* Primary owner */}
      <div style={s.row}>
        <div style={{ minWidth: 0 }}>
          <p style={s.name}>{primaryName || 'Primary'}{isPrimaryYou && <span style={s.youBadge}>you</span>}</p>
          <p style={s.email}>{primaryEmail}</p>
        </div>
        {isPrimaryYou && (
          <button type="button" onClick={() => startEditSelf(primaryEmail)} className="btn btn-outlined btn-xs">Edit</button>
        )}
      </div>

      {/* Partner — joined */}
      {partnerJoined && (
        <div style={s.row}>
          <div style={{ minWidth: 0 }}>
            <p style={s.name}>Partner{isPartnerYou && <span style={s.youBadge}>you</span>}</p>
            <p style={s.email}>{secondaryEmail}</p>
          </div>
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            {isPartnerYou && <button type="button" onClick={() => startEditSelf(secondaryEmail ?? '')} className="btn btn-outlined btn-xs">Edit</button>}
            <button type="button" onClick={removePartner} disabled={busy} className="btn btn-destructive-outlined btn-xs">Delete</button>
          </div>
        </div>
      )}

      {/* Partner — pending */}
      {partnerPending && (
        <div style={s.row}>
          <div style={{ minWidth: 0 }}>
            <p style={s.name}>Partner <span style={{ ...s.youBadge, background: 'var(--surface-muted)', color: 'var(--text-secondary)' }}>pending</span></p>
            <p style={s.email}>{secondaryEmail}</p>
            <p style={s.pendingHint}>Ask them to sign in with this email to join.</p>
          </div>
          <button type="button" onClick={removePartner} disabled={busy} className="btn btn-ghost btn-xs">Cancel</button>
        </div>
      )}

      {/* Add partner */}
      {!partnerJoined && !partnerPending && (
        adding ? (
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="partner@email.com" style={s.input} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={sendInvite} disabled={busy} className="btn btn-primary btn-sm">{busy ? 'Sending…' : 'Send Invite'}</button>
              <button type="button" onClick={() => { setAdding(false); setErr('') }} className="btn btn-ghost btn-sm">Cancel</button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => { setAdding(true); setNotice(''); setErr('') }} style={s.addBtn}>+ Add Partner</button>
        )
      )}

      {/* Change own login email */}
      {editingSelf && (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>Change your login email</label>
          <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} style={s.input} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={saveEmail} disabled={busy} className="btn btn-primary btn-sm">{busy ? 'Saving…' : 'Save'}</button>
            <button type="button" onClick={() => { setEditingSelf(false); setErr('') }} className="btn btn-ghost btn-sm">Cancel</button>
          </div>
        </div>
      )}

      {err && <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--error)' }}>{err}</p>}
      {notice && <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--success)' }}>{notice}</p>}
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  card:      { background: 'var(--surface)', borderRadius: 'var(--radius-card)', border: '1px solid var(--border)', padding: '20px 22px', boxShadow: '0 0 3.5px rgba(0,0,0,0.10)' },
  row:       { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '12px 0', borderTop: '1px solid var(--border)' },
  name:      { margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 },
  email:     { margin: '2px 0 0', fontSize: 12, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  pendingHint:{ margin: '3px 0 0', fontSize: 11, color: 'var(--warning)' },
  youBadge:  { fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', background: 'var(--primary-light)', color: 'var(--primary-dark)', padding: '2px 7px', borderRadius: 999 },
  input:     { fontSize: 14, padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-primary)', fontFamily: 'inherit', boxSizing: 'border-box', width: '100%' },
  addBtn:    { marginTop: 14, fontSize: 13, fontWeight: 600, color: 'var(--primary)', background: 'var(--surface)', border: '1.5px dashed var(--primary-light)', padding: '10px 20px', cursor: 'pointer', fontFamily: 'inherit' },
}
