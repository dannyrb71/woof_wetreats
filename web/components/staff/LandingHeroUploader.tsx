'use client'
import React, { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { processImageFile, ImageValidationError } from '@/lib/image-utils'

const HERO_PATH = 'landing/hero.jpg'

export function LandingHeroUploader() {
  const supabase = createClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const [currentUrl, setCurrentUrl] = useState<string | null>(null)
  const [state, setState] = useState<'idle' | 'processing' | 'uploading' | 'error'>('idle')
  const [err,   setErr]   = useState('')

  useEffect(() => {
    supabase.rpc('get_landing_hero').then(({ data }) => {
      const row = data?.[0]
      if (row?.path) {
        const { data: pub } = supabase.storage.from('site-assets').getPublicUrl(row.path)
        setCurrentUrl(`${pub.publicUrl}?v=${row.version ?? '0'}`)
      }
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleFile(file: File) {
    setState('processing')
    setErr('')

    let jpeg: Blob
    try {
      jpeg = await processImageFile(file)
    } catch (e) {
      setState('error')
      setErr(e instanceof ImageValidationError ? e.message : 'Could not process image. Try another file.')
      return
    }

    setState('uploading')
    const { error: upErr } = await supabase.storage
      .from('site-assets')
      .upload(HERO_PATH, jpeg, { contentType: 'image/jpeg', upsert: true })
    if (upErr) { setState('error'); setErr('Upload failed — please try again.'); return }

    const version = String(Date.now())
    const { error: dbErr } = await supabase.from('app_settings').upsert([
      { key: 'landing_hero_path',    value: HERO_PATH, updated_at: new Date().toISOString() },
      { key: 'landing_hero_version', value: version,   updated_at: new Date().toISOString() },
    ], { onConflict: 'key' })
    if (dbErr) { setState('error'); setErr('Photo uploaded but could not save — please try again.'); return }

    const { data: pub } = supabase.storage.from('site-assets').getPublicUrl(HERO_PATH)
    setCurrentUrl(`${pub.publicUrl}?v=${version}`)
    setState('idle')
  }

  return (
    <div style={s.wrap}>
      <input
        ref={inputRef}
        type="file"
        accept=".jpg,.jpeg,.png,.heic,.heif,.webp,image/jpeg,image/png,image/heic,image/heif,image/webp"
        style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = '' }}
      />

      <div style={s.preview}>
        {currentUrl
          ? <img src={currentUrl} alt="Landing hero" style={s.previewImg} />
          : <div style={s.previewEmpty}><span style={{ fontSize: 40 }}>🐾</span><span style={s.emptyText}>No photo yet</span></div>
        }
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {state === 'idle' || state === 'error' ? (
          <button type="button" onClick={() => inputRef.current?.click()} style={s.btn}>
            {currentUrl ? '📷 Replace Photo' : '📷 Upload Photo'}
          </button>
        ) : (
          <span style={s.statusText}>{state === 'processing' ? '⏳ Processing…' : '⬆️ Uploading…'}</span>
        )}
        <span style={s.hint}>Shown across the top of the public landing page. Resized &amp; compressed automatically.</span>
      </div>
      {err && <p style={s.err}>{err}</p>}
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  wrap:        { display: 'flex', flexDirection: 'column', gap: 14 },
  preview:     { width: '100%', maxWidth: 520 },
  previewImg:  { width: '100%', height: 200, objectFit: 'cover', borderRadius: 12, border: '1px solid #e5e7eb', display: 'block' },
  previewEmpty:{ width: '100%', height: 200, borderRadius: 12, background: 'linear-gradient(135deg, #dbeafe, #fef3c7)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyText:   { fontSize: 13, color: '#6b7280' },
  btn:         { fontSize: 13, fontWeight: 600, color: '#2563eb', background: '#fff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontFamily: 'inherit' },
  statusText:  { fontSize: 13, color: '#6b7280', fontStyle: 'italic' },
  hint:        { fontSize: 12, color: '#9ca3af' },
  err:         { margin: 0, fontSize: 13, color: '#ef4444' },
}
