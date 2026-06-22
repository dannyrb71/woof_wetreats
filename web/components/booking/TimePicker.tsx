import React from 'react'

// 7:00 AM – 10:00 PM in 30-minute increments.
// 30 min is the right granularity for drop-off/pick-up windows —
// 15 min is too granular for scheduling; 1 hr is too coarse.
const SLOTS: string[] = []
for (let h = 7; h <= 22; h++) {
  for (const m of [0, 30]) {
    if (h === 22 && m === 30) break   // stop at 10:00 PM exactly
    const hour   = h > 12 ? h - 12 : h === 0 ? 12 : h
    const period = h < 12 ? 'AM' : 'PM'
    const min    = m === 0 ? '00' : '30'
    SLOTS.push(`${hour}:${min} ${period}`)
  }
}

interface Props {
  label:    string
  value:    string
  onChange: (v: string) => void
}

export default function TimePicker({ label, value, onChange }: Props) {
  return (
    <label style={s.wrap}>
      <span style={s.label}>{label}</span>
      <select style={s.select} value={value} onChange={e => onChange(e.target.value)}>
        {SLOTS.map(slot => (
          <option key={slot} value={slot}>{slot}</option>
        ))}
      </select>
    </label>
  )
}

const s: Record<string, React.CSSProperties> = {
  wrap:   { display: 'flex', flexDirection: 'column', gap: 4 },
  label:  { fontSize: 13, fontWeight: 600, color: '#374151' },
  select: { padding: '9px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, background: '#fff', cursor: 'pointer', fontFamily: 'inherit' },
}
