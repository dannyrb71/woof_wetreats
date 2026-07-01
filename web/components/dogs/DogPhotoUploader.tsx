'use client'
import React, { useRef, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { processImageFile, ImageValidationError } from '@/lib/image-utils'

interface Props {
  dogId:          string
  authUid:        string
  currentPath:    string | null   // existing storage path, e.g. "{uid}/{dogId}.jpg"
  onDone:         (newPath: string, previewUrl: string) => void
  // Folder prefix for the stored object. Clients use their auth uid (default);
  // staff uploading on a client's behalf pass the client_id (which may have no
  // auth login at all). The admin storage policy permits any folder.
  pathPrefix?:    string
}

export function DogPhotoUploader({ dogId, authUid, currentPath, onDone, pathPrefix }: Props) {
  const supabase    = createClient()
  const inputRef    = useRef<HTMLInputElement>(null)
  const [state, setState] = useState<'idle' | 'processing' | 'uploading' | 'error'>('idle')
  const [errMsg, setErrMsg] = useState('')

  async function handleFile(file: File) {
    setState('processing')
    setErrMsg('')

    let jpeg: Blob
    try {
      jpeg = await processImageFile(file)
    } catch (e) {
      setState('error')
      setErrMsg(e instanceof ImageValidationError ? e.message : 'Could not process image. Please try another file.')
      return
    }

    setState('uploading')
    const path = `${pathPrefix ?? authUid}/${dogId}.jpg`

    // Delete old file if it exists (prevents orphaned objects on overwrite)
    if (currentPath && currentPath !== path) {
      await supabase.storage.from('dog-photos').remove([currentPath])
    }

    const { error: uploadErr } = await supabase.storage
      .from('dog-photos')
      .upload(path, jpeg, { contentType: 'image/jpeg', upsert: true })

    if (uploadErr) {
      setState('error')
      setErrMsg('Upload failed — please try again.')
      return
    }

    // Write path back to dogs table
    const { error: dbErr } = await supabase
      .from('dogs')
      .update({ photo_url: path })
      .eq('id', dogId)

    if (dbErr) {
      setState('error')
      setErrMsg('Photo uploaded but could not save — please try again.')
      return
    }

    // Hand back the path + a local object URL for immediate display
    const previewUrl = URL.createObjectURL(jpeg)
    setState('idle')
    onDone(path, previewUrl)
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

      {state === 'idle' || state === 'error' ? (
        <button type="button" onClick={() => inputRef.current?.click()} className="btn btn-outlined btn-xs">
          {currentPath ? '📷 Change photo' : '📷 Add photo'}
        </button>
      ) : (
        <span style={s.statusText}>
          {state === 'processing' ? '⏳ Processing…' : '⬆️ Uploading…'}
        </span>
      )}

      {errMsg && <p style={s.err}>{errMsg}</p>}
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  wrap:       { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4 },
  statusText: { fontSize: 12, color: '#6b7280', fontStyle: 'italic' },
  err:        { margin: 0, fontSize: 12, color: '#ef4444' },
}
