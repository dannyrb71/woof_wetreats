/** Format a raw phone string as (XXX) XXX-XXXX for display.
 *  Handles 10-digit US numbers and 11-digit with a leading 1.
 *  Returns the original string unchanged if it doesn't match. */
export function formatPhone(raw: string | null | undefined): string {
  if (!raw) return ''
  let d = raw.replace(/\D/g, '')
  if (d.length === 11 && d.startsWith('1')) d = d.slice(1)
  if (d.length !== 10) return raw
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`
}
