'use client'
import React, { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { SiteNav } from '@/components/SiteNav'
import DatePicker from '@/components/booking/DatePicker'
import TimePicker from '@/components/booking/TimePicker'
import { DogPhotoUploader } from '@/components/dogs/DogPhotoUploader'

// ── Rover: the one permanent no-login client. Every dog that comes through Rover
// is its own dogs row attached here; bookings carry NO price/payment (total_price
// is always $0 and hidden). This page is both the dog overview and the booking UI.

const SVC = { boarding: '#0058A0', daycare: '#C5A92B' }
type ServiceType = 'boarding' | 'daycare'

interface RoverDog { id: string; name: string; gender: string | null; birthdate: string; photo_url: string | null; photoSigned: string | null }
interface RoverRes { id: string; service_type: string; status: string; dropoff_date: string; dropoff_time: string; pickup_date: string; pickup_time: string; dogs: string[]; dog_ids: string[] }
interface RoverMG  { id: string; scheduled_date: string; scheduled_time: string; status: string; dog_id: string | null }

function dogNameColor(g: string | null) { return g === 'male' ? '#2140AF' : g === 'female' ? '#AE08A1' : '#111827' }
function fmtDate(ymd: string) { const [y,m,d] = ymd.split('-').map(Number); return new Date(y,m-1,d).toLocaleDateString('en-US',{ month:'short', day:'numeric', year:'numeric' }) }
function fmtTime(t: string) { if (!t) return ''; const [h,m] = t.split(':').map(Number); return `${h%12||12}:${String(m).padStart(2,'0')} ${h>=12?'PM':'AM'}` }

export default function RoverPage() {
  const router = useRouter()
  const supabase = createClient()
  const [roverId, setRoverId] = useState('')
  const [dogs, setDogs] = useState<RoverDog[]>([])
  const [reservations, setReservations] = useState<RoverRes[]>([])
  const [meetGreets, setMeetGreets] = useState<RoverMG[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showBooking, setShowBooking] = useState(false)
  const [addingDog, setAddingDog] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [delConfirm, setDelConfirm] = useState<string | null>(null)
  const [delBusy, setDelBusy] = useState(false)

  async function deleteBooking(id: string) {
    setDelBusy(true)
    // Hard delete — reservation_dogs cascades. Rover bookings have no payment
    // history to preserve, so a true delete (not cancel) is appropriate.
    const { error } = await supabase.from('reservations').delete().eq('id', id)
    setDelBusy(false)
    setDelConfirm(null)
    if (!error) load()
  }

  const load = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.replace('/auth'); return }
    const { data: isAdmin } = await supabase.rpc('is_admin')
    if (!isAdmin) { router.replace('/'); return }

    const { data: rover } = await supabase.from('clients').select('id').eq('is_rover', true).maybeSingle()
    if (!rover) { setError('Rover client not found.'); setLoading(false); return }
    setRoverId(rover.id)

    const [dogsR, resR, mgR] = await Promise.all([
      supabase.from('dogs').select('id, name, gender, birthdate, photo_url').eq('client_id', rover.id).order('name'),
      supabase.from('reservations').select('id, service_type, status, dropoff_date, dropoff_time, pickup_date, pickup_time').eq('client_id', rover.id).neq('status', 'cancelled').order('dropoff_date', { ascending: false }),
      supabase.from('meet_greets').select('id, scheduled_date, scheduled_time, status, dog_id').eq('client_id', rover.id).neq('status', 'cancelled').order('scheduled_date', { ascending: false }),
    ])

    const rawDogs = (dogsR.data ?? []) as Omit<RoverDog, 'photoSigned'>[]
    const paths = [...new Set(rawDogs.map(d => d.photo_url).filter(Boolean) as string[])]
    const signed: Record<string, string> = {}
    if (paths.length) {
      const { data: urls } = await supabase.storage.from('dog-photos').createSignedUrls(paths, 3600)
      for (const u of urls ?? []) if (u.signedUrl && u.path) signed[u.path] = u.signedUrl
    }
    setDogs(rawDogs.map(d => ({ ...d, photoSigned: d.photo_url ? (signed[d.photo_url] ?? null) : null })))

    // dog names per reservation
    const rows = resR.data ?? []
    const ids = rows.map(r => r.id)
    const nameMap: Record<string, string[]> = {}
    const idMap: Record<string, string[]> = {}
    if (ids.length) {
      const { data: rd } = await supabase.from('reservation_dogs').select('reservation_id, dog_id, dogs(name)').in('reservation_id', ids)
      for (const row of rd ?? []) {
        (idMap[row.reservation_id] ??= []).push(row.dog_id)
        const nm = (Array.isArray(row.dogs) ? row.dogs[0] : row.dogs)?.name
        if (nm) (nameMap[row.reservation_id] ??= []).push(nm)
      }
    }
    setReservations(rows.map(r => ({ ...r, dogs: nameMap[r.id] ?? [], dog_ids: idMap[r.id] ?? [] })) as RoverRes[])
    setMeetGreets((mgR.data ?? []) as RoverMG[])
    setLoading(false)
  }, [router, supabase])

  useEffect(() => { load() }, [load])

  // Open the booking form when arrived via the Daily Schedule "Add Rover Booking" button.
  useEffect(() => {
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('new') === '1') {
      setShowBooking(true)
    }
  }, [])

  if (loading) return <div style={s.center}><p style={{ color: '#6b7280' }}>Loading…</p></div>
  if (error)   return <div style={s.center}><p style={{ color: '#ef4444' }}>{error}</p></div>

  return (
    <div style={s.page}>
      <SiteNav />
      <main style={s.main}>
        <div style={s.header}>
          <div style={s.avatar}>R</div>
          <div>
            <h2 style={s.title}>Rover</h2>
            <p style={s.subtitle}>Rover bookings — no login, no fees. {dogs.length} dog{dogs.length !== 1 ? 's' : ''} on file.</p>
          </div>
          {!showBooking && (
            <button type="button" onClick={() => setShowBooking(true)} style={s.addBookingBtn}>+ Add Rover Booking</button>
          )}
        </div>

        {showBooking && (
          <RoverBookingForm
            roverId={roverId} dogs={dogs}
            onClose={() => setShowBooking(false)}
            onCreated={() => { setShowBooking(false); load() }}
          />
        )}

        {/* ── Bookings ── */}
        <section style={s.section}>
          <h3 style={s.sectionTitle}>Bookings</h3>
          {reservations.length === 0
            ? <p style={s.muted}>No Rover bookings yet.</p>
            : reservations.map(r => (
                editingId === r.id ? (
                  <RoverBookingForm key={r.id} roverId={roverId} dogs={dogs} existing={r}
                    onClose={() => setEditingId(null)}
                    onCreated={() => { setEditingId(null); load() }} />
                ) : (
                  <div key={r.id} style={{ ...s.resCard, borderLeftColor: SVC[r.service_type as ServiceType] ?? '#9ca3af' }}>
                    <div style={s.resTop}>
                      <span style={{ ...s.svcBadge, color: SVC[r.service_type as ServiceType], borderColor: SVC[r.service_type as ServiceType] }}>
                        {r.service_type === 'boarding' ? '🏠 Boarding' : '🌞 Daycare'}
                      </span>
                      <span style={s.resStatus}>{r.status.replace('_', ' ')}</span>
                    </div>
                    <p style={s.resDogs}>{r.dogs.join(', ') || '—'}</p>
                    <p style={s.resDates}>
                      {r.service_type === 'boarding'
                        ? <>{fmtDate(r.dropoff_date)} · {fmtTime(r.dropoff_time)} → {fmtDate(r.pickup_date)} · {fmtTime(r.pickup_time)}</>
                        : <>{fmtDate(r.dropoff_date)} · ⬇ {fmtTime(r.dropoff_time)} ⬆ {fmtTime(r.pickup_time)}</>}
                    </p>
                    <div style={s.resActions}>
                      {delConfirm === r.id ? (
                        <>
                          <span style={{ fontSize: 12, color: '#374151', fontWeight: 600 }}>Delete this booking?</span>
                          <button type="button" onClick={() => deleteBooking(r.id)} disabled={delBusy} style={s.tinyDanger}>{delBusy ? '…' : 'Yes, delete'}</button>
                          <button type="button" onClick={() => setDelConfirm(null)} style={s.tinyBtn}>Keep</button>
                        </>
                      ) : (
                        <>
                          <button type="button" onClick={() => { setEditingId(r.id); setShowBooking(false) }} style={s.tinyBtn}>Edit</button>
                          <button type="button" onClick={() => setDelConfirm(r.id)} style={s.tinyDangerOutline}>Delete</button>
                        </>
                      )}
                    </div>
                  </div>
                )
              ))}
        </section>

        {/* ── Dogs ── */}
        <section style={s.section}>
          <div style={s.sectionHead}>
            <h3 style={s.sectionTitle}>Rover Dogs</h3>
            {!addingDog && <button type="button" onClick={() => setAddingDog(true)} style={s.smallBtn}>+ Add Dog</button>}
          </div>
          {addingDog && (
            <AddRoverDog roverId={roverId} onClose={() => setAddingDog(false)} onAdded={() => { setAddingDog(false); load() }} />
          )}
          <div style={s.dogGrid}>
            {dogs.map(d => (
              <RoverDogCard key={d.id} dog={d} roverId={roverId} meetGreets={meetGreets.filter(m => m.dog_id === d.id)} onChanged={load} />
            ))}
            {dogs.length === 0 && <p style={s.muted}>No dogs yet.</p>}
          </div>
        </section>
      </main>
    </div>
  )
}

// Date-derived status (LA), mirrors set_reservation_status_on_insert — used on edit
// since the DB status trigger only runs on INSERT.
function deriveStatus(service: ServiceType, dropoff: string, pickup: string): string {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
  if (service === 'daycare') return dropoff > today ? 'upcoming' : dropoff < today ? 'completed' : 'in_progress'
  return today < dropoff ? 'upcoming' : today >= pickup ? 'completed' : 'in_progress'
}

// ── Booking form: create (page + Daily Schedule button) AND edit existing ──
function RoverBookingForm({ roverId, dogs, existing, onClose, onCreated }: {
  roverId: string; dogs: RoverDog[]; existing?: RoverRes; onClose: () => void; onCreated: () => void
}) {
  const supabase = createClient()
  const [service, setService] = useState<ServiceType>((existing?.service_type as ServiceType) ?? 'boarding')
  const [sel, setSel] = useState<Set<string>>(new Set(existing?.dog_ids ?? []))
  const [dropDate, setDropDate] = useState<string | null>(existing?.dropoff_date ?? null)
  const [pickDate, setPickDate] = useState<string | null>(existing?.pickup_date ?? null)
  const [dropTime, setDropTime] = useState(existing ? fmtTime(existing.dropoff_time) : '9:00 AM')
  const [pickTime, setPickTime] = useState(existing ? fmtTime(existing.pickup_time) : '5:00 PM')
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState('')
  const noBlocked = new Set<string>()

  async function submit() {
    setErr('')
    if (sel.size === 0) { setErr('Select at least one dog.'); return }
    if (!dropDate) { setErr('Pick a drop-off date.'); return }
    if (service === 'boarding' && (!pickDate || pickDate <= dropDate)) { setErr('Pick-up must be after drop-off.'); return }
    setSubmitting(true)
    const pickup = service === 'daycare' ? dropDate : pickDate!

    if (existing) {
      // Edit: direct update keeps total_price at 0 (no repricing for Rover) and
      // re-derives status from the new dates. Then replace the dog links.
      const { error } = await supabase.from('reservations').update({
        service_type: service, dropoff_date: dropDate, dropoff_time: dropTime,
        pickup_date: pickup, pickup_time: pickTime, total_price: 0,
        status: deriveStatus(service, dropDate, pickup),
      }).eq('id', existing.id)
      if (error) { setErr('Could not save changes — try again.'); setSubmitting(false); return }
      await supabase.from('reservation_dogs').delete().eq('reservation_id', existing.id)
      const { error: rdErr } = await supabase.from('reservation_dogs').insert([...sel].map(dog_id => ({ reservation_id: existing.id, dog_id })))
      if (rdErr) { setErr('Saved dates, but could not update dogs — try again.'); setSubmitting(false); return }
      setSubmitting(false)
      onCreated()
      return
    }

    // Create: total_price always 0, payment_method placeholder (never shown).
    const { data: res, error } = await supabase.from('reservations').insert({
      client_id: roverId, service_type: service,
      dropoff_date: dropDate, dropoff_time: dropTime,
      pickup_date: pickup, pickup_time: pickTime,
      payment_method: 'cash', total_price: 0,
    }).select('id').single()
    if (error || !res) { setErr('Could not create booking — try again.'); setSubmitting(false); return }
    const { error: rdErr } = await supabase.from('reservation_dogs').insert([...sel].map(dog_id => ({ reservation_id: res.id, dog_id })))
    if (rdErr) { await supabase.from('reservations').delete().eq('id', res.id); setErr('Could not link dogs — try again.'); setSubmitting(false); return }
    setSubmitting(false)
    onCreated()
  }

  return (
    <div style={s.form}>
      <div style={s.formHead}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{existing ? 'Edit Rover Booking' : 'New Rover Booking'}</h3>
        <button type="button" onClick={onClose} style={s.smallBtn}>Close</button>
      </div>
      <div style={s.fieldRow}>
        {(['boarding', 'daycare'] as const).map(sv => (
          <button key={sv} type="button" onClick={() => setService(sv)}
            style={{ ...s.toggleBtn, background: service === sv ? SVC[sv] : '#fff', color: service === sv ? '#fff' : '#374151', borderColor: service === sv ? SVC[sv] : '#e5e7eb' }}>
            {sv === 'boarding' ? '🏠 Boarding' : '🌞 Daycare'}
          </button>
        ))}
      </div>

      <p style={s.flabel}>Dogs on this booking</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {dogs.length === 0 && <span style={s.muted}>No Rover dogs yet — add one below first.</span>}
        {dogs.map(d => {
          const on = sel.has(d.id)
          return (
            <button key={d.id} type="button" onClick={() => setSel(prev => { const n = new Set(prev); n.has(d.id) ? n.delete(d.id) : n.add(d.id); return n })}
              style={{ ...s.dogChip, background: on ? '#eff6ff' : '#fff', borderColor: on ? '#2563eb' : '#e5e7eb', color: on ? '#1d4ed8' : '#374151' }}>
              {on ? '✓ ' : ''}{d.name}
            </button>
          )
        })}
      </div>

      <div style={s.pickerRow}>
        <DatePicker label="Drop-off date" value={dropDate} onChange={setDropDate} blockedDates={noBlocked} rangeEnd={service === 'boarding' ? pickDate : null} allowPast />
        {service === 'boarding' && (
          <DatePicker label="Pick-up date" value={pickDate} onChange={setPickDate} blockedDates={noBlocked} rangeStart={dropDate} minDate={dropDate ?? undefined} allowPast />
        )}
      </div>
      <div style={s.fieldRow}>
        <TimePicker label="Drop-off time" value={dropTime} onChange={setDropTime} />
        <TimePicker label="Pick-up time" value={pickTime} onChange={setPickTime} />
      </div>

      {err && <p style={{ margin: 0, fontSize: 13, color: '#ef4444' }}>{err}</p>}
      <button type="button" onClick={submit} disabled={submitting}
        style={{ ...s.submit, opacity: submitting ? 0.5 : 1, cursor: submitting ? 'not-allowed' : 'pointer' }}>
        {submitting ? 'Saving…' : existing ? 'Save Changes' : 'Create Booking'}
      </button>
    </div>
  )
}

// ── Add a Rover dog ──
function AddRoverDog({ roverId, onClose, onAdded }: { roverId: string; onClose: () => void; onAdded: () => void }) {
  const supabase = createClient()
  const [name, setName] = useState('')
  const [gender, setGender] = useState<'male' | 'female' | ''>('')
  const [birth, setBirth] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  async function save() {
    if (!name.trim()) { setErr('Name is required.'); return }
    setSaving(true); setErr('')
    const { error } = await supabase.from('dogs').insert({
      client_id: roverId, name: name.trim(),
      gender: gender || null,
      birthdate: birth || '2000-01-01', // birthdate is required; unknown → placeholder
    })
    setSaving(false)
    if (error) { setErr('Could not add dog — try again.'); return }
    onAdded()
  }

  return (
    <div style={s.form}>
      <label style={s.flabel}>Dog name
        <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Rocky" style={s.input} />
      </label>
      <div>
        <p style={{ ...s.flabel, marginBottom: 6 }}>Gender (optional)</p>
        <div style={{ display: 'flex', gap: 8 }}>
          {(['male', 'female'] as const).map(g => (
            <button key={g} type="button" onClick={() => setGender(gender === g ? '' : g)}
              style={{ ...s.dogChip, background: gender === g ? '#eff6ff' : '#fff', borderColor: gender === g ? '#2563eb' : '#e5e7eb', color: gender === g ? '#1d4ed8' : '#374151' }}>
              {g === 'male' ? '♂ Male' : '♀ Female'}
            </button>
          ))}
        </div>
      </div>
      <label style={s.flabel}>Birthdate (optional)
        <input type="date" value={birth} onChange={e => setBirth(e.target.value)} style={s.input} />
      </label>
      {err && <p style={{ margin: 0, fontSize: 13, color: '#ef4444' }}>{err}</p>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" onClick={save} disabled={saving} style={{ ...s.submit, opacity: saving ? 0.5 : 1 }}>{saving ? 'Adding…' : 'Add Dog'}</button>
        <button type="button" onClick={onClose} style={s.smallBtn}>Cancel</button>
      </div>
    </div>
  )
}

// ── One Rover dog card: photo, gender-colored name, M&G, hard-delete ──
function RoverDogCard({ dog, roverId, meetGreets, onChanged }: {
  dog: RoverDog; roverId: string; meetGreets: RoverMG[]; onChanged: () => void
}) {
  const supabase = createClient()
  const [preview, setPreview] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [schedOpen, setSchedOpen] = useState(false)
  const [mgDate, setMgDate] = useState('')
  const [mgTime, setMgTime] = useState('9:00 AM')

  async function setGender(g: 'male' | 'female') {
    await supabase.from('dogs').update({ gender: g }).eq('id', dog.id); onChanged()
  }
  async function remove() {
    setBusy(true); setErr('')
    // Hard delete — reservation_dogs + meet_greets(dog_id) cascade on delete.
    const { error } = await supabase.from('dogs').delete().eq('id', dog.id)
    setBusy(false)
    if (error) { setErr('Could not delete — try again.'); return }
    onChanged()
  }
  async function scheduleMG() {
    if (!mgDate) { setErr('Pick a date.'); return }
    setBusy(true); setErr('')
    // Scheduling visibility only — does NOT touch Rover's permanent completed status.
    const { error } = await supabase.from('meet_greets').insert({
      client_id: roverId, dog_id: dog.id, scheduled_date: mgDate, scheduled_time: mgTime, duration_minutes: 30, status: 'scheduled',
    })
    setBusy(false)
    if (error) { setErr('Could not schedule — try again.'); return }
    setSchedOpen(false); setMgDate(''); onChanged()
  }

  const shown = preview ?? dog.photoSigned

  return (
    <div style={s.dogCard}>
      <div style={s.dogTop}>
        {shown ? <img src={shown} alt={dog.name} style={s.dogPhoto} /> : <div style={s.dogFallback}>🐕</div>}
        <span style={{ ...s.dogName, color: dogNameColor(dog.gender) }} title={dog.name}>{dog.name}</span>
      </div>

      {dog.gender === null && (
        <div style={{ display: 'flex', gap: 6 }}>
          {(['male', 'female'] as const).map(g => (
            <button key={g} type="button" onClick={() => setGender(g)} style={s.tinyBtn}>{g === 'male' ? '♂ Male' : '♀ Female'}</button>
          ))}
        </div>
      )}

      <DogPhotoUploader dogId={dog.id} authUid={roverId} pathPrefix={roverId} currentPath={dog.photo_url}
        onDone={(_p, url) => { setPreview(url); onChanged() }} />

      {meetGreets.length > 0 && (
        <p style={s.mgNote}>🤝 M&amp;G {meetGreets.map(m => `${fmtDate(m.scheduled_date)}${m.status === 'completed' ? ' ✓' : ''}`).join(', ')}</p>
      )}

      {schedOpen ? (
        <div style={s.schedBox}>
          <input type="date" value={mgDate} onChange={e => setMgDate(e.target.value)} style={s.input} />
          <TimePicker label="Time" value={mgTime} onChange={setMgTime} />
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" onClick={scheduleMG} disabled={busy} style={s.tinyPrimary}>{busy ? '…' : 'Schedule'}</button>
            <button type="button" onClick={() => setSchedOpen(false)} style={s.tinyBtn}>Cancel</button>
          </div>
        </div>
      ) : (
        <div style={s.dogActions}>
          <button type="button" onClick={() => { setSchedOpen(true); setErr('') }} style={s.tinyBtn}>+ Meet &amp; Greet</button>
          {confirming ? (
            <>
              <button type="button" onClick={remove} disabled={busy} style={s.tinyDanger}>{busy ? '…' : 'Delete'}</button>
              <button type="button" onClick={() => setConfirming(false)} style={s.tinyBtn}>Keep</button>
            </>
          ) : (
            <button type="button" onClick={() => { setConfirming(true); setErr('') }} style={s.tinyDangerOutline}>Delete</button>
          )}
        </div>
      )}
      {err && <p style={{ margin: 0, fontSize: 12, color: '#ef4444' }}>{err}</p>}
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  page:        { minHeight: '100vh', background: 'var(--page-bg)' },
  center:      { display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' },
  main:        { maxWidth: 920, margin: '0 auto', padding: '28px 24px 60px' },
  header:      { display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24, flexWrap: 'wrap' },
  avatar:      { width: 52, height: 52, borderRadius: '50%', background: '#16a34a', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, fontWeight: 800, flexShrink: 0 },
  title:       { margin: 0, fontSize: 22, fontWeight: 800, color: '#111827' },
  subtitle:    { margin: '2px 0 0', fontSize: 13, color: '#6b7280' },
  addBookingBtn:{ marginLeft: 'auto', fontSize: 14, fontWeight: 700, color: '#fff', background: '#16a34a', border: 'none', borderRadius: 999, padding: '10px 18px', cursor: 'pointer', fontFamily: 'inherit' },
  section:     { marginBottom: 32 },
  sectionHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle:{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.05em' },
  muted:       { fontSize: 13, color: '#9ca3af', margin: 0 },
  resCard:     { background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', borderLeft: '4px solid', padding: '14px 16px', marginBottom: 10 },
  resTop:      { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 },
  svcBadge:    { fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 20, border: '1.5px solid', background: 'transparent' },
  resStatus:   { fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10, background: '#f3f4f6', color: '#374151', textTransform: 'capitalize' },
  resDogs:     { margin: '0 0 4px', fontSize: 15, fontWeight: 700, color: '#111827' },
  resDates:    { margin: 0, fontSize: 13, color: '#374151' },
  resActions:  { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 10, paddingTop: 10, borderTop: '1px solid #f3f4f6' },
  dogGrid:     { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14 },
  dogCard:     { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' },
  dogTop:      { display: 'flex', alignItems: 'center', gap: 12 },
  dogPhoto:    { width: 44, height: 44, borderRadius: '50%', objectFit: 'cover' as const, border: '2px solid #e5e7eb', flexShrink: 0 },
  dogFallback: { width: 44, height: 44, borderRadius: '50%', background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 },
  dogName:     { fontSize: 17, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 },
  dogActions:  { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
  mgNote:      { margin: 0, fontSize: 12, color: '#9a3412', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 6, padding: '4px 8px' },
  schedBox:    { display: 'flex', flexDirection: 'column', gap: 8, background: '#fafafa', border: '1px solid #e5e7eb', borderRadius: 8, padding: 10 },
  form:        { background: '#fafafa', border: '1px solid #e5e7eb', borderRadius: 12, padding: '16px 18px', marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 12 },
  formHead:    { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  fieldRow:    { display: 'flex', gap: 10, flexWrap: 'wrap' },
  pickerRow:   { display: 'flex', gap: 16, flexWrap: 'wrap' },
  flabel:      { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, fontWeight: 600, color: '#374151' },
  toggleBtn:   { fontSize: 14, fontWeight: 600, padding: '8px 16px', borderRadius: 8, border: '1.5px solid', cursor: 'pointer', fontFamily: 'inherit' },
  dogChip:     { fontSize: 13, fontWeight: 600, padding: '6px 14px', borderRadius: 20, border: '1.5px solid', cursor: 'pointer', fontFamily: 'inherit' },
  input:       { fontSize: 14, padding: '9px 11px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', color: '#111827', fontFamily: 'inherit', marginTop: 2 },
  submit:      { fontSize: 15, fontWeight: 700, color: '#fff', background: '#16a34a', border: 'none', borderRadius: 10, padding: '10px 18px', fontFamily: 'inherit', cursor: 'pointer' },
  smallBtn:    { fontSize: 12, fontWeight: 600, color: '#374151', background: '#f3f4f6', border: 'none', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontFamily: 'inherit' },
  tinyBtn:     { fontSize: 12, fontWeight: 600, color: '#374151', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontFamily: 'inherit' },
  tinyPrimary: { fontSize: 12, fontWeight: 700, color: '#fff', background: '#16a34a', border: 'none', borderRadius: 6, padding: '4px 12px', cursor: 'pointer', fontFamily: 'inherit' },
  tinyDanger:  { fontSize: 12, fontWeight: 600, color: '#fff', background: '#be123c', border: 'none', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontFamily: 'inherit' },
  tinyDangerOutline: { fontSize: 12, fontWeight: 600, color: '#be123c', background: '#fff', border: '1px solid #fecdd3', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontFamily: 'inherit' },
}
