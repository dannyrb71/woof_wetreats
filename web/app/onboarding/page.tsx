'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { processImageFile, ImageValidationError } from '@/lib/image-utils'
import type { User } from '@supabase/supabase-js'

// ── Types ──────────────────────────────────────────────────────
interface ProfileData {
  first_name:              string
  last_name:               string
  phone:                   string
  email:                   string
  address:                 string
  emergency_contact_name:  string
  emergency_contact_phone: string
  vet_name:                string
  vet_phone:               string
  vet_address:             string
}
interface DogData { name: string; birthdate: string; gender: string; photoBlob?: Blob }

const EMPTY_PROFILE: ProfileData = {
  first_name: '', last_name: '', phone: '', email: '', address: '',
  emergency_contact_name: '', emergency_contact_phone: '',
  vet_name: '', vet_phone: '', vet_address: '',
}

// ── Progress bar ───────────────────────────────────────────────
function ProgressBar({ step }: { step: number }) {
  const steps = ['Your info', 'Emergency contact', 'Vet info', 'Your dog(s)']
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        {steps.map((label, i) => (
          <div key={i} style={{ flex: 1 }}>
            <div style={{
              height: 4, borderRadius: 2,
              background: i < step ? '#2563eb' : i === step - 1 ? '#2563eb' : '#e5e7eb',
            }} />
          </div>
        ))}
      </div>
      <p style={{ margin: 0, fontSize: 13, color: '#6b7280' }}>
        Step {step} of 4 — <strong style={{ color: '#111827' }}>{steps[step - 1]}</strong>
      </p>
    </div>
  )
}

// ── Field helper ───────────────────────────────────────────────
function Field({ label, type = 'text', value, onChange, required = true, hint }: {
  label: string; type?: string; value: string
  onChange: (v: string) => void; required?: boolean; hint?: string
}) {
  return (
    <label style={s.label}>
      {label}{required && <span style={{ color: '#ef4444' }}> *</span>}
      {type === 'textarea'
        ? <textarea style={{ ...s.input, height: 72, resize: 'vertical' }} value={value} onChange={e => onChange(e.target.value)} required={required} />
        : <input style={s.input} type={type} value={value} onChange={e => onChange(e.target.value)} required={required} />
      }
      {hint && <span style={{ fontSize: 12, color: '#9ca3af' }}>{hint}</span>}
    </label>
  )
}

// ── Step components ────────────────────────────────────────────
function Step1({ data, onChange }: { data: ProfileData; onChange: (k: keyof ProfileData, v: string) => void }) {
  return (
    <>
      <Field label="First name"    value={data.first_name} onChange={v => onChange('first_name', v)} />
      <Field label="Last name"     value={data.last_name}  onChange={v => onChange('last_name', v)} />
      <Field label="Phone"         value={data.phone}     onChange={v => onChange('phone', v)} type="tel" />
      <Field label="Email"         value={data.email}     onChange={v => onChange('email', v)} type="email" />
      <Field label="Home address"  value={data.address}   onChange={v => onChange('address', v)} type="textarea" />
    </>
  )
}

function Step2({ data, onChange }: { data: ProfileData; onChange: (k: keyof ProfileData, v: string) => void }) {
  return (
    <>
      <p style={s.stepHint}>Who should we call if we can't reach you?</p>
      <Field label="Contact name"  value={data.emergency_contact_name}  onChange={v => onChange('emergency_contact_name', v)} />
      <Field label="Contact phone" value={data.emergency_contact_phone} onChange={v => onChange('emergency_contact_phone', v)} type="tel" />
    </>
  )
}

function Step3({ data, onChange }: { data: ProfileData; onChange: (k: keyof ProfileData, v: string) => void }) {
  return (
    <>
      <p style={s.stepHint}>We need this in case your dog requires medical attention while in our care.</p>
      <Field label="Vet name"    value={data.vet_name}    onChange={v => onChange('vet_name', v)} />
      <Field label="Vet phone"   value={data.vet_phone}   onChange={v => onChange('vet_phone', v)} type="tel" />
      <Field label="Vet address" value={data.vet_address} onChange={v => onChange('vet_address', v)} type="textarea" />
    </>
  )
}

function DogPhotoInput({ preview, onFile }: {
  preview: string | null
  onFile: (blob: Blob, previewUrl: string) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [processing, setProcessing] = useState(false)
  const [err, setErr] = useState('')

  async function handleChange(file: File) {
    setProcessing(true); setErr('')
    try {
      const blob = await processImageFile(file)
      onFile(blob, URL.createObjectURL(blob))
    } catch (e) {
      setErr(e instanceof ImageValidationError ? e.message : 'Could not process image.')
    } finally { setProcessing(false) }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <input ref={inputRef} type="file"
        accept=".jpg,.jpeg,.png,.heic,.heif,.webp,image/jpeg,image/png,image/heic,image/heif"
        style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) handleChange(f); e.target.value = '' }} />
      {preview
        ? <img src={preview} alt="Dog photo" style={{ width: 56, height: 56, borderRadius: 8, objectFit: 'cover', border: '2px solid #e5e7eb' }} />
        : <div style={{ width: 56, height: 56, borderRadius: 8, background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>🐕</div>
      }
      <div>
        <button type="button" onClick={() => inputRef.current?.click()}
          style={{ fontSize: 12, color: '#2563eb', background: 'none', border: '1px solid #bfdbfe', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontFamily: 'inherit' }}>
          {processing ? '⏳ Processing…' : preview ? '📷 Change photo' : '📷 Add photo'}
        </button>
        <p style={{ margin: '4px 0 0', fontSize: 11, color: '#9ca3af' }}>Optional · JPG, PNG, or HEIC</p>
        {err && <p style={{ margin: '4px 0 0', fontSize: 11, color: '#ef4444' }}>{err}</p>}
      </div>
    </div>
  )
}

function Step4({ dogs, onChange, onAdd, onRemove, onPhoto, photoPreviews }: {
  dogs: DogData[]
  onChange: (i: number, k: keyof DogData, v: string) => void
  onAdd: () => void
  onRemove: (i: number) => void
  onPhoto: (i: number, blob: Blob, previewUrl: string) => void
  photoPreviews: (string | null)[]
}) {
  return (
    <>
      <p style={s.stepHint}>You can add up to 3 dogs now and add more later.</p>
      {dogs.map((dog, i) => (
        <div key={i} style={s.dogCard}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <strong style={{ fontSize: 14 }}>Dog {i + 1}</strong>
            {dogs.length > 1 && (
              <button type="button" onClick={() => onRemove(i)} style={s.removeBtn}>Remove</button>
            )}
          </div>
          <DogPhotoInput
            preview={photoPreviews[i] ?? null}
            onFile={(blob, url) => onPhoto(i, blob, url)} />
          <Field label="Name"      value={dog.name}      onChange={v => onChange(i, 'name', v)} />
          <Field label="Birthdate" value={dog.birthdate} onChange={v => onChange(i, 'birthdate', v)} type="date" hint="Used to calculate puppy pricing" />
          <div>
            <p style={{ margin: '0 0 6px', fontSize: 14, fontWeight: 500 }}>
              Gender <span style={{ color: '#ef4444' }}>*</span>
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              {(['male', 'female'] as const).map(g => (
                <button
                  key={g}
                  type="button"
                  onClick={() => onChange(i, 'gender', g)}
                  style={{
                    fontSize: 13, fontWeight: 600, padding: '7px 16px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit',
                    background: dog.gender === g ? '#2563eb' : '#f3f4f6',
                    color:      dog.gender === g ? '#fff'    : '#374151',
                    border:     dog.gender === g ? '1.5px solid #2563eb' : '1.5px solid #e5e7eb',
                  }}
                >
                  {g === 'male' ? '♂ Male' : '♀ Female'}
                </button>
              ))}
            </div>
          </div>
        </div>
      ))}
      {dogs.length < 3 && (
        <button type="button" onClick={onAdd} style={s.addDogBtn}>+ Add Another Dog</button>
      )}
    </>
  )
}

// ── Main onboarding page ───────────────────────────────────────
export default function OnboardingPage() {
  const router   = useRouter()
  const supabase = createClient()

  const [user,    setUser]    = useState<User | null>(null)
  const [step,    setStep]    = useState(1)
  const [profile, setProfile] = useState<ProfileData>(EMPTY_PROFILE)
  const [dogs,    setDogs]    = useState<DogData[]>([{ name: '', birthdate: '', gender: '' }])
  const [photoPreviews, setPhotoPreviews] = useState<(string | null)[]>([null])
  const [error,   setError]   = useState('')
  const [loading, setLoading] = useState(false)
  const [clientId, setClientId] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.replace('/auth'); return }
      setUser(session.user)
      // Pre-fill email from auth session
      setProfile(p => ({ ...p, email: session.user.email ?? '' }))

      // If profile is already complete, skip onboarding
      const { data } = await supabase.rpc('get_client_auth_status')
      const status = data?.[0]?.status
      if (status === 'complete') { router.replace('/dashboard'); return }
      if (status === 'blocked')  { router.replace('/blocked');   return }

      // If partial profile exists (incomplete), load it into the form
      if (status === 'incomplete') {
        const { data: existingProfile } = await supabase
          .from('clients_client_view')
          .select('*')
          .single()
        if (existingProfile) {
          setClientId(existingProfile.id)
          setProfile({
            first_name:              existingProfile.first_name              ?? '',
            last_name:               existingProfile.last_name               ?? '',
            phone:                   existingProfile.phone                   ?? '',
            email:                   existingProfile.email                   ?? '',
            address:                 existingProfile.address                 ?? '',
            emergency_contact_name:  existingProfile.emergency_contact_name  ?? '',
            emergency_contact_phone: existingProfile.emergency_contact_phone ?? '',
            vet_name:                existingProfile.vet_name                ?? '',
            vet_phone:               existingProfile.vet_phone               ?? '',
            vet_address:             existingProfile.vet_address             ?? '',
          })
        }
      }
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function updateProfile(key: keyof ProfileData, value: string) {
    setProfile(p => ({ ...p, [key]: value }))
  }

  function updateDog(i: number, key: keyof DogData, value: string) {
    setDogs(d => d.map((dog, idx) => idx === i ? { ...dog, [key]: value } : dog))
  }

  function stageDogPhoto(i: number, blob: Blob, previewUrl: string) {
    setDogs(d => d.map((dog, idx) => idx === i ? { ...dog, photoBlob: blob } : dog))
    setPhotoPreviews(p => p.map((v, idx) => idx === i ? previewUrl : v))
  }

  // Saves client profile after Step 3 (mandatory steps complete)
  async function saveProfile(): Promise<string> {
    if (clientId) {
      // Profile row already exists — update it
      const { error } = await supabase
        .from('clients')
        .update({ ...profile })
        .eq('id', clientId)
      if (error) throw error
      return clientId
    } else {
      // New client row
      const { data, error } = await supabase
        .from('clients')
        .insert({ ...profile, auth_id: user!.id })
        .select('id')
        .single()
      if (error) throw error
      return data.id
    }
  }

  async function saveDogs(cId: string) {
    const validEntries = dogs
      .map((d, i) => ({ dog: d, idx: i }))
      .filter(({ dog }) => dog.name.trim() && dog.birthdate)
    if (validEntries.length === 0) return

    // Insert dogs, get back IDs so we can attach photos
    const { data: inserted, error } = await supabase
      .from('dogs')
      .insert(validEntries.map(({ dog }) => ({ client_id: cId, name: dog.name.trim(), birthdate: dog.birthdate, gender: dog.gender || null })))
      .select('id')
    if (error) throw error

    // Upload any photos that were staged
    if (!inserted || !user) return
    await Promise.all(inserted.map(async (row, n) => {
      const blob = validEntries[n]?.dog.photoBlob
      if (!blob) return
      const path = `${user.id}/${row.id}.jpg`
      const { error: uploadErr } = await supabase.storage
        .from('dog-photos')
        .upload(path, blob, { contentType: 'image/jpeg', upsert: true })
      if (uploadErr) return  // photo upload failure is non-fatal
      await supabase.from('dogs').update({ photo_url: path }).eq('id', row.id)
    }))
  }

  async function handleNext(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (step < 3) { setStep(s => s + 1); return }

    if (step === 3) {
      // Save mandatory profile fields
      setLoading(true)
      try {
        const cId = await saveProfile()
        setClientId(cId)
        setStep(4)
      } catch (e: any) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
      return
    }

    if (step === 4) {
      // Validate: any named dog must have gender selected
      const missingGender = dogs.find(d => d.name.trim() && !d.gender)
      if (missingGender) {
        setError(`Please select a gender for ${missingGender.name || 'your dog'}.`)
        return
      }
      // Save dogs (optional — skip if empty)
      setLoading(true)
      try {
        if (clientId && dogs.some(d => d.name.trim())) {
          await saveDogs(clientId)
        }
        router.replace('/dashboard')
      } catch (e: any) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }
  }

  async function handleSkipDogs() {
    router.replace('/dashboard')
  }

  return (
    <div style={s.page}>
      <div style={s.card}>
        <h2 style={s.heading}>
          {step === 1 ? 'Welcome! Let\'s set up your profile.' :
           step === 2 ? 'Emergency contact' :
           step === 3 ? 'Vet information' :
                        'Add your dog(s)'}
        </h2>
        <ProgressBar step={step} />

        <form onSubmit={handleNext} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {step === 1 && <Step1 data={profile} onChange={updateProfile} />}
          {step === 2 && <Step2 data={profile} onChange={updateProfile} />}
          {step === 3 && <Step3 data={profile} onChange={updateProfile} />}
          {step === 4 && (
            <Step4
              dogs={dogs}
              onChange={updateDog}
              onPhoto={stageDogPhoto}
              photoPreviews={photoPreviews}
              onAdd={() => { setDogs(d => [...d, { name: '', birthdate: '', gender: '' }]); setPhotoPreviews(p => [...p, null]) }}
              onRemove={i => { setDogs(d => d.filter((_, idx) => idx !== i)); setPhotoPreviews(p => p.filter((_, idx) => idx !== i)) }}
            />
          )}

          {error && <p style={s.error}>{error}</p>}

          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            {step > 1 && step < 4 && (
              <button type="button" onClick={() => setStep(s => s - 1)} style={s.backBtn}>
                Back
              </button>
            )}
            <button type="submit" disabled={loading} style={{ ...s.nextBtn, flex: 1 }}>
              {loading ? 'Saving…' : step < 3 ? 'Continue' : step === 3 ? 'Save & Continue' : 'Finish'}
            </button>
          </div>

          {step === 4 && (
            <button type="button" onClick={handleSkipDogs} style={s.skipBtn}>
              Skip for now — I'll add my dog(s) later
            </button>
          )}
        </form>
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  page:     { minHeight: '100vh', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px' },
  card:     { background: '#fff', borderRadius: 16, padding: '36px 32px', width: '100%', maxWidth: 480, boxShadow: '0 4px 24px rgba(0,0,0,0.08)' },
  heading:  { margin: '0 0 20px', fontSize: 22, fontWeight: 700 },
  stepHint: { margin: '0 0 14px', fontSize: 14, color: '#6b7280' },
  label:    { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 14, fontWeight: 500 },
  input:    { padding: '10px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, outline: 'none', fontFamily: 'inherit' },
  error:    { color: '#ef4444', fontSize: 13, margin: 0 },
  nextBtn:  { padding: '11px 0', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: 'pointer' },
  backBtn:  { padding: '11px 16px', background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: 8, fontSize: 15, cursor: 'pointer' },
  skipBtn:  { background: 'none', border: 'none', color: '#6b7280', fontSize: 13, cursor: 'pointer', textDecoration: 'underline', textAlign: 'center', padding: 0 },
  dogCard:  { background: 'var(--surface-muted)', border: '1px solid #e5e7eb', borderRadius: 10, padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 },
  addDogBtn:{ background: 'none', border: '1px dashed #d1d5db', borderRadius: 8, padding: '10px', fontSize: 14, color: '#2563eb', cursor: 'pointer', marginTop: 4 },
  removeBtn:{ background: 'none', border: 'none', color: '#ef4444', fontSize: 12, cursor: 'pointer', padding: 0 },
}
