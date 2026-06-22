'use client'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { parseLandingCopy, renderParagraphHtml } from '@/lib/landing-copy'

export function LandingCopyEditor() {
  const supabase = createClient()
  const [headline,   setHeadline]   = useState('')
  const [paragraphs, setParagraphs] = useState<string[]>([])
  const [saved,      setSaved]      = useState('')   // JSON snapshot of last persisted state
  const [loading,    setLoading]    = useState(true)
  const [saving,     setSaving]     = useState(false)
  const [err,        setErr]        = useState('')
  const [notice,     setNotice]     = useState('')
  const [confirmIdx, setConfirmIdx] = useState<number | null>(null)

  const taRefs = useRef<(HTMLTextAreaElement | null)[]>([])

  async function load() {
    const { data } = await supabase.rpc('get_landing_copy')
    const copy = parseLandingCopy(data as string | null)
    setHeadline(copy.headline)
    setParagraphs(copy.paragraphs)
    setSaved(JSON.stringify(copy))
    setLoading(false)
  }
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const current = useMemo(() => JSON.stringify({ headline, paragraphs }), [headline, paragraphs])
  const dirty   = current !== saved

  function setParagraph(i: number, value: string) {
    setParagraphs(prev => prev.map((p, idx) => idx === i ? value : p))
    setNotice('')
  }

  // Wrap the current selection in the i-th textarea with **bold** markers.
  function bold(i: number) {
    const ta = taRefs.current[i]
    if (!ta) return
    const start = ta.selectionStart ?? 0
    const end   = ta.selectionEnd ?? 0
    const val   = paragraphs[i]
    const sel   = val.slice(start, end) || 'bold text'
    const next  = val.slice(0, start) + '**' + sel + '**' + val.slice(end)
    setParagraph(i, next)
    // Restore focus + place caret just after the inserted bold span
    requestAnimationFrame(() => {
      ta.focus()
      const caret = start + 2 + sel.length + 2
      ta.setSelectionRange(caret, caret)
    })
  }

  function addParagraph() {
    setParagraphs(prev => [...prev, ''])
    setNotice('')
  }

  function deleteParagraph(i: number) {
    setParagraphs(prev => prev.filter((_, idx) => idx !== i))
    setConfirmIdx(null)
    setNotice('')
  }

  async function save() {
    setErr(''); setNotice('')
    setSaving(true)
    const value = JSON.stringify({ headline: headline.trim(), paragraphs })
    const { error } = await supabase.from('app_settings')
      .upsert({ key: 'landing_copy', value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
    setSaving(false)
    if (error) { setErr('Save failed — please try again.'); return }
    setSaved(JSON.stringify({ headline, paragraphs }))
    setNotice('Saved. The public landing page now shows this copy.')
  }

  if (loading) return <p style={s.muted}>Loading…</p>

  return (
    <div>
      <p style={s.hint}>
        Edit the public homepage headline and paragraphs. Use <strong>Bold</strong> to emphasize
        text and press Enter for line breaks within a paragraph. Changes go live only when you Save.
      </p>

      {/* Headline */}
      <label style={s.label}>Headline</label>
      <input value={headline} onChange={e => { setHeadline(e.target.value); setNotice('') }} style={s.headlineInput} />

      {/* Paragraphs */}
      <p style={{ ...s.label, marginTop: 18 }}>Paragraphs</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {paragraphs.map((p, i) => (
          <div key={i} style={s.block}>
            <div style={s.blockHeader}>
              <span style={s.blockNum}>Paragraph {i + 1}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button type="button" onClick={() => bold(i)} style={s.boldBtn} title="Wrap selected text in bold">
                  <strong>B</strong>
                </button>
                {confirmIdx === i ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={s.confirmText}>Delete?</span>
                    <button type="button" onClick={() => deleteParagraph(i)} style={s.confirmYes}>Yes</button>
                    <button type="button" onClick={() => setConfirmIdx(null)} style={s.confirmNo}>No</button>
                  </span>
                ) : (
                  <button type="button" onClick={() => setConfirmIdx(i)} style={s.deleteBtn}>Delete</button>
                )}
              </div>
            </div>
            <textarea
              ref={el => { taRefs.current[i] = el }}
              value={p}
              onChange={e => setParagraph(i, e.target.value)}
              rows={4}
              style={s.textarea}
              placeholder="Paragraph text… use **bold** and line breaks"
            />
            {p.trim() && (
              <div style={s.preview}>
                <span style={s.previewLabel}>Preview:</span>
                <span dangerouslySetInnerHTML={{ __html: renderParagraphHtml(p) }} />
              </div>
            )}
          </div>
        ))}
      </div>

      <button type="button" onClick={addParagraph} style={s.addBtn}>+ Add Paragraph</button>

      {err && <p style={{ margin: '14px 0 0', fontSize: 13, color: '#ef4444' }}>{err}</p>}
      {notice && <p style={{ margin: '14px 0 0', fontSize: 13, color: '#15803d' }}>{notice}</p>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16 }}>
        <button type="button" onClick={save} disabled={!dirty || saving}
          style={{ ...s.saveBtn, opacity: (!dirty || saving) ? 0.5 : 1, cursor: (!dirty || saving) ? 'not-allowed' : 'pointer' }}>
          {saving ? 'Saving…' : 'Save changes'}
        </button>
        {dirty && !saving && <span style={{ fontSize: 13, color: '#b45309' }}>Unsaved changes</span>}
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  hint:         { margin: '0 0 18px', fontSize: 13, color: '#6b7280', lineHeight: 1.6 },
  muted:        { fontSize: 14, color: '#9ca3af', margin: 0 },
  label:        { display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 },
  headlineInput:{ width: '100%', fontSize: 15, padding: '10px 12px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', color: '#111827', fontFamily: 'inherit', boxSizing: 'border-box' },
  block:        { background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 10, padding: '12px 14px' },
  blockHeader:  { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  blockNum:     { fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em' },
  boldBtn:      { fontSize: 13, width: 30, height: 28, borderRadius: 6, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer', fontFamily: 'inherit', color: '#111827' },
  deleteBtn:    { fontSize: 12, fontWeight: 600, color: '#be123c', background: '#fff', border: '1px solid #fecdd3', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontFamily: 'inherit' },
  confirmText:  { fontSize: 12, color: '#374151', fontWeight: 600 },
  confirmYes:   { fontSize: 12, fontWeight: 600, color: '#fff', background: '#be123c', border: 'none', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontFamily: 'inherit' },
  confirmNo:    { fontSize: 12, fontWeight: 600, color: '#374151', background: '#e5e7eb', border: 'none', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontFamily: 'inherit' },
  textarea:     { width: '100%', fontSize: 14, lineHeight: 1.6, padding: '10px 12px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', color: '#111827', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' },
  preview:      { marginTop: 8, fontSize: 13, color: '#374151', lineHeight: 1.6 },
  previewLabel: { fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.04em', marginRight: 8 },
  addBtn:       { marginTop: 14, fontSize: 13, fontWeight: 600, color: '#2563eb', background: '#fff', border: '1.5px dashed #bfdbfe', borderRadius: 10, padding: '9px 18px', cursor: 'pointer', fontFamily: 'inherit' },
  saveBtn:      { fontSize: 14, fontWeight: 700, color: '#fff', background: '#2563eb', border: 'none', borderRadius: 8, padding: '10px 22px', fontFamily: 'inherit' },
}
