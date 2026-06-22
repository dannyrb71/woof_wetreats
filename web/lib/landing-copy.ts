// Landing page copy: a headline + ordered paragraphs.
// Paragraph text uses a lightweight markup understood by both the editor
// and the public page: **bold** for bold, and real line breaks for <br>.

export interface LandingCopy {
  headline:   string
  paragraphs: string[]
}

export const DEFAULT_LANDING_COPY: LandingCopy = {
  headline: 'Welcome to Woof Wetreats 🐾',
  paragraphs: [
    'Loving, attentive boarding and daycare for your dog — right here in San Francisco. We keep our home small and personal, so every pup gets real attention, plenty of playtime, and the kind of care we’d want for our own.',
    'Whether it’s a single daycare day or a longer stay while you travel, your dog is family while they’re with us. You’ll get photos and updates throughout, and we promise to treat them like the good boy or girl they are.',
  ],
}

// Tolerant parse of the JSON stored in app_settings.landing_copy.
export function parseLandingCopy(raw: string | null | undefined): LandingCopy {
  if (!raw) return DEFAULT_LANDING_COPY
  try {
    const obj = JSON.parse(raw)
    const headline = typeof obj.headline === 'string' ? obj.headline : DEFAULT_LANDING_COPY.headline
    const paragraphs = Array.isArray(obj.paragraphs)
      ? obj.paragraphs.filter((p: unknown): p is string => typeof p === 'string')
      : DEFAULT_LANDING_COPY.paragraphs
    return { headline, paragraphs }
  } catch {
    return DEFAULT_LANDING_COPY
  }
}

// Render one paragraph's markup to safe HTML: everything is HTML-escaped first,
// then ONLY **bold** → <strong> and newlines → <br> are introduced. No raw HTML
// from the input can survive, so this is safe for dangerouslySetInnerHTML.
export function renderParagraphHtml(text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  return escaped
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br />')
}
