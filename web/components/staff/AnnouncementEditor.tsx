'use client'
import React, { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

// ── Color themes ─────────────────────────────────────────────────────────────
// Each swatch sets the banner's background, border, and text together so the
// combo always stays legible. The editor and the client banner both read this
// map, so a color can never render differently in the two places.
export interface AnnTheme { bg: string; border: string; text: string }
export const ANNOUNCEMENT_THEMES: Record<string, AnnTheme & { label: string }> = {
  brand:   { label: 'Brand',   bg: 'var(--primary-light)', border: 'var(--primary)', text: 'var(--primary-dark)' },
  info:    { label: 'Info',    bg: '#EFF6FF', border: '#93C5FD', text: '#1E40AF' },
  success: { label: 'Success', bg: '#ECFDF5', border: '#6EE7B7', text: '#065F46' },
  warning: { label: 'Warning', bg: '#FFFBEB', border: '#FCD34D', text: '#92400E' },
  alert:   { label: 'Alert',   bg: '#FEF2F2', border: '#FCA5A5', text: '#991B1B' },
  neutral: { label: 'Neutral', bg: '#F3F4F6', border: '#D1D5DB', text: '#374151' },
}
export type AnnColor = keyof typeof ANNOUNCEMENT_THEMES
export function announcementTheme(color: string): AnnTheme {
  return ANNOUNCEMENT_THEMES[color] ?? ANNOUNCEMENT_THEMES.brand
}

interface Announcement { message: string; enabled: boolean; color: AnnColor }

export function parseAnnouncement(raw: string | null): Announcement {
  if (!raw) return { message: '', enabled: false, color: 'brand' }
  try {
    const o = JSON.parse(raw)
    const color = (o.color in ANNOUNCEMENT_THEMES ? o.color : 'brand') as AnnColor
    return { message: String(o.message ?? ''), enabled: Boolean(o.enabled), color }
  } catch {
    return { message: '', enabled: false, color: 'brand' }
  }
}

export function AnnouncementEditor() {
  const supabase = createClient()
  const [message, setMessage] = useState('')
  const [enabled, setEnabled] = useState(false)
  const [color,   setColor]   = useState<AnnColor>('brand')
  const [saved,   setSaved]   = useState('')
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [err,     setErr]     = useState('')
  const [notice,  setNotice]  = useState('')

  useEffect(() => {
    (async () => {
      const { data } = await supabase.rpc('get_announcement')
      const a = parseAnnouncement(data as string | null)
      setMessage(a.message); setEnabled(a.enabled); setColor(a.color)
      setSaved(JSON.stringify(a)); setLoading(false)
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = JSON.stringify({ message, enabled, color }) !== saved

  async function save() {
    setErr(''); setNotice(''); setSaving(true)
    const clean = { message: message.trim(), enabled, color }
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

      <p style={{ ...s.label, marginTop: 18 }}>Color</p>
      <div style={s.swatchRow}>
        {(Object.keys(ANNOUNCEMENT_THEMES) as AnnColor[]).map(key => {
          const t = ANNOUNCEMENT_THEMES[key]
          const active = color === key
          return (
            <button key={key} type="button" onClick={() => { setColor(key); setNotice('') }}
              aria-pressed={active} title={t.label}
              style={{ ...s.swatch, background: t.bg, borderColor: active ? t.text : t.border, boxShadow: active ? `0 0 0 2px ${t.text}` : 'none' }}>
              <span style={{ ...s.swatchDot, background: t.text }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: t.text }}>{t.label}</span>
            </button>
          )
        })}
      </div>

      {message.trim() && (
        <>
          <p style={{ ...s.label, marginTop: 18 }}>Preview <span style={{ fontWeight: 400, color: '#9ca3af' }}>(staff only — clients see it when toggled on)</span></p>
          <div style={{ ...s.previewBanner, background: announcementTheme(color).bg, borderColor: announcementTheme(color).border }}>
            <span style={{ fontSize: 16, lineHeight: 1.4 }}>📢</span>
            <p style={{ margin: 0, flex: 1, fontSize: 14, color: announcementTheme(color).text, lineHeight: 1.5 }}>{message}</p>
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
  swatchRow:     { display: 'flex', flexWrap: 'wrap', gap: 8 },
  swatch:        { display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 999, border: '1.5px solid', cursor: 'pointer', fontFamily: 'inherit', transition: 'box-shadow 0.12s, border-color 0.12s' },
  swatchDot:     { width: 10, height: 10, borderRadius: '50%', flexShrink: 0 },
}
