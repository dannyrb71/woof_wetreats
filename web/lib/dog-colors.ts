// Single source of truth for gender-based dog name coloring. Returns CSS-token
// references (not raw hex) so the values live in globals.css (--dog-male /
// --dog-female) and can be re-themed in one place. Used everywhere a dog name
// is colored by gender (Clients cards, household detail, Rover dog list).
export function dogNameColor(gender: string | null | undefined): string {
  if (gender === 'male')   return 'var(--dog-male)'
  if (gender === 'female') return 'var(--dog-female)'
  return 'var(--text-primary)'
}
