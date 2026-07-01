'use client'
import React, { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { processImageFile, ImageValidationError } from '@/lib/image-utils'

// Simple staff profile editor: name, email, and profile image. Persists to the
// Supabase auth user (user_metadata.full_name / avatar_url, and email). The
// avatar image reuses the existing compress pipeline and is stored in the
// public site-assets bucket (admin-writable).
export function MyProfileModal({ onClose, onSaved }: { onClose: () => void; onSaved?: (avatarUrl: string | null, name: string) => void }) {
  const supabase = createClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [name, setName]       = useState('')
  const [email, setEmail]     = useState('')
  const [avatar, setAvatar]   = useState<string | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [blob, setBlob]       = useState<Blob | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [msg, setMsg]         = useState('')
  const [err, setErr]         = useState('')

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setName((user?.user_metadata?.full_name as string) ?? '')
      setEmail(user?.email ?? '')
      setAvatar((user?.user_metadata?.avatar_url as string) ?? null)
      setLoading(false)
    })
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function pickFile(file: File) {
    setErr('')
    try { const b = await processImageFile(file); setBlob(b); setPreview(URL.createObjectURL(b)) }
    catch (e) { setErr(e instanceof ImageValidationError ? e.message : 'Could not process image.') }
  }

  async function save() {
    setSaving(true); setErr(''); setMsg('')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setErr('Not signed in.'); setSaving(false); return }

    let avatarUrl = avatar
    if (blob) {
      const path = `staff-avatars/${user.id}-${Date.now()}.jpg`
      const { error: upErr } = await supabase.storage.from('site-assets').upload(path, blob, { contentType: 'image/jpeg', upsert: true })
      if (upErr) { setErr('Image upload failed — try again.'); setSaving(false); return }
      avatarUrl = supabase.storage.from('site-assets').getPublicUrl(path).data.publicUrl
    }

    const { error: metaErr } = await supabase.auth.updateUser({ data: { full_name: name.trim(), avatar_url: avatarUrl } })
    if (metaErr) { setErr('Could not save profile — try again.'); setSaving(false); return }

    const { data: { user: cur } } = await supabase.auth.getUser()
    let emailNote = ''
    if (email.trim() && email.trim() !== cur?.email) {
      const { error: emailErr } = await supabase.auth.updateUser({ email: email.trim() })
      if (emailErr) { setErr('Profile saved, but email change failed: ' + emailErr.message); setSaving(false); return }
      emailNote = ' Check your inbox to confirm the new email.'
    }

    setSaving(false)
    setMsg('Saved.' + emailNote)
    onSaved?.(avatarUrl, name.trim())
  }

  const shown = preview ?? avatar
  const initials = (name || email || '?').trim().charAt(0).toUpperCase()

  return (
    <div style={s.overlay} onClick={onClose} role="dialog" aria-modal="true" aria-label="My profile">
      <div style={s.modal} onClick={e => e.stopPropagation()}>
        <div style={s.head}>
          <h3 style={s.title}>My Profile</h3>
          <button type="button" onClick={onClose} className="btn btn-icon" style={{ fontSize: 16 }} aria-label="Close">✕</button>
        </div>

        {loading ? <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Loading…</p> : (
          <>
            <div style={s.avatarRow}>
              {shown ? <img src={shown} alt="" style={s.avatarImg} /> : <div style={s.avatarFallback}>{initials}</div>}
              <input ref={fileRef} type="file" accept=".jpg,.jpeg,.png,.heic,.heif,.webp,image/*" style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) pickFile(f); e.target.value = '' }} />
              <button type="button" onClick={() => fileRef.current?.click()} className="btn btn-outlined btn-sm">Change photo</button>
            </div>

            <label style={s.label}>Name
              <input value={name} onChange={e => setName(e.target.value)} style={s.input} placeholder="Your name" />
            </label>
            <label style={s.label}>Email
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} style={s.input} placeholder="you@example.com" />
            </label>

            {err && <p style={{ margin: 0, fontSize: 13, color: 'var(--error)' }}>{err}</p>}
            {msg && <p style={{ margin: 0, fontSize: 13, color: 'var(--success)' }}>{msg}</p>}

            <div style={s.actions}>
              <button type="button" onClick={save} disabled={saving} className="btn btn-primary btn-sm">{saving ? 'Saving…' : 'Save'}</button>
              <button type="button" onClick={onClose} className="btn btn-ghost btn-sm">Close</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  overlay:    { position: 'fixed', inset: 0, background: 'rgba(46,42,38,0.5)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '60px 16px', zIndex: 100, overflowY: 'auto' },
  modal:      { background: 'var(--surface)', borderRadius: 'var(--radius-card)', maxWidth: 420, width: '100%', padding: '22px 24px', boxShadow: '0 20px 60px rgba(46,42,38,0.3)', display: 'flex', flexDirection: 'column', gap: 14 },
  head:       { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  title:      { margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--text-primary)' },
  avatarRow:  { display: 'flex', alignItems: 'center', gap: 14 },
  avatarImg:  { width: 64, height: 64, borderRadius: '50%', objectFit: 'cover' as const, border: '2px solid var(--border)' },
  avatarFallback: { width: 64, height: 64, borderRadius: '50%', background: 'var(--primary-light)', color: 'var(--primary-dark)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, fontWeight: 800 },
  label:      { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' },
  input:      { fontSize: 14, padding: '9px 11px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-primary)', fontFamily: 'inherit', marginTop: 2 },
  actions:    { display: 'flex', gap: 10, marginTop: 4 },
}
