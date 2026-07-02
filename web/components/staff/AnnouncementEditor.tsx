'use client'
import React, { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

interface Announcement { message: string; enabled: boolean }

export function parseAnnouncement(raw: string | null): Announcement {
  if (!raw) return { message: '', enabled: false }
  try {
    const o = JSON.parse(raw)
    return { message: String(o.message ?? ''), enabled: Boolean(o.enabled) }
  } catch {
    return { message: '', enabled: false }
  }
}

export function AnnouncementEditor() {
  const supabase = createClient()
  const [message, setMessage] = useState('')
  const [enabled, setEnabled] = useState(false)
  const [saved,   setSaved]   = useState('')
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [err,     setErr]     = useState('')
  const [notice,  setNotice]  = useState('')

  useEffect(() => {
    (async () => {
      const { data } = await supabase.rpc('get_announcement')
      const a = parseAnnouncement(data as string | null)
      setMessage(a.message); setEnabled(a.enabled)
      setSaved(JSON.stringify(a)); setLoading(false)
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = JSON.stringify({ message, enabled }) !== saved

  async function save() {
    setErr(''); setNotice(''); setSaving(true)
    const clean = { message: message.trim(), enabled }
    const { error } = await supabase.from('app_settings')
      .upsert({ key: 'announcement', value: JSON.stringify(clean), updated_at: new Date().toISOString() }, { onConflict: 'key' })
    setSaving(false)
    if (error) { setErr('Save failed — please try again.'); return }
    setSaved(JSON.stringify(clean))
    setNotice(enabled ? 'Saved — this is now showing on every client dashboard.' : 'Saved — the announcement is turned off.')
  }

  if (loading) return <p style={s.muted}>Loading…</p>

  return (
    <div>
      <p style={s.hint}>
        Write an announcement that appears at the top of every client&apos;s dashboard (e.g. closure dates).
        Toggle it on to show it to all clients; toggle off to hide it. Clients can dismiss it.
      </p>

      <label style={s.label}>Message</label>
      <textarea value={message} onChange={e => { setMessage(e.target.value); setNotice('') }} rows={3}
        placeholder="e.g. We'll be closed October 12–18. Please plan boarding accordingly." style={s.textarea} />

      <div style={s.toggleRow}>
        <div>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Show to all clients</span>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: enabled ? '#15803d' : '#9ca3af' }}>
            {enabled ? '● On — visible on every client dashboard' : '○ Off — clients don’t see it yet'}
          </p>
        </div>
        <button type="button" role="switch" aria-checked={enabled} onClick={() => { setEnabled(v => !v); setNotice('') }}
          style={{ ...s.toggle, background: enabled ? 'var(--status-in-progress)' : '#d1d5db' }}>
          <span style={{ ...s.knob, transform: enabled ? 'translateX(20px)' : 'translateX(0)' }} />
        </button>
      </div>

      {message.trim() && (
        <>
          <p style={{ ...s.label, marginTop: 18 }}>Preview <span style={{ fontWeight: 400, color: '#9ca3af' }}>(staff only — clients see it when toggled on)</span></p>
          <div style={s.previewBanner}>
            <span style={{ fontSize: 16, lineHeight: 1.4 }}>📢</span>
            <p style={{ margin: 0, flex: 1, fontSize: 14, color: 'var(--primary-dark)', lineHeight: 1.5 }}>{message}</p>
          </div>
        </>
      )}

      {err && <p style={{ margin: '14px 0 0', fontSize: 13, color: '#ef4444' }}>{err}</p>}
      {notice && <p style={{ margin: '14px 0 0', fontSize: 13, color: '#15803d' }}>{notice}</p>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16 }}>
        <button type="button" onClick={save} disabled={!dirty || saving} className="btn btn-primary btn-sm">
          {saving ? 'Saving…' : 'Save changes'}
        </button>
        {dirty && !saving && <span style={{ fontSize: 13, color: '#b45309' }}>Unsaved changes</span>}
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  hint:          { margin: '0 0 18px', fontSize: 13, color: '#6b7280', lineHeight: 1.6 },
  muted:         { fontSize: 14, color: '#9ca3af', margin: 0 },
  label:         { display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 },
  textarea:      { width: '100%', fontSize: 14, lineHeight: 1.6, padding: '10px 12px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', color: '#111827', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' },
  toggleRow:     { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 16, maxWidth: 320 },
  toggle:        { position: 'relative', width: 44, height: 24, borderRadius: 999, border: 'none', cursor: 'pointer', padding: 2, transition: 'background 0.15s', flexShrink: 0 },
  knob:          { display: 'block', width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'transform 0.15s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' },
  previewBanner: { display: 'flex', alignItems: 'flex-start', gap: 10, background: 'var(--primary-light)', border: '1px solid var(--primary)', borderRadius: 'var(--radius-card)', padding: '14px 16px' },
}
