/**
 * Subject identity — a stable colour and icon for every subject.
 *
 * A learner recognises "the green one with the calculator" long before they
 * read the label, so the pairing has to be the same on every screen and across
 * sessions. Two rules make that hold:
 *
 *  1. Known subjects are matched by keyword, so Maths is always the same colour
 *     in every school using this app.
 *  2. Anything unrecognised is hashed from its NAME, not its database id — ids
 *     differ between environments, and a subject that changed colour between
 *     the demo and the real deployment would undo the whole point.
 *
 * There are nine hues. Two subjects in one class can still collide; that is
 * acceptable because the label is always present too, and the alternative
 * (unbounded generated hues) produces muddy colours that fail contrast.
 */

export interface SubjectLook {
  /** Index into the --fun-N scale, 1-9. */
  tone: number
  /** Emoji, used as the tile glyph. Chosen to be legible at 20px. */
  emoji: string
}

/**
 * Keyword → look. Order matters: the first match wins, so more specific
 * keywords ("computer science") must precede looser ones ("science").
 */
const KNOWN: [RegExp, SubjectLook][] = [
  [/comput|program|coding|software|informat|\bict\b/i, { tone: 7, emoji: '💻' }],
  [/math|algebra|geometry|calculus|arithmet|statis/i, { tone: 8, emoji: '📐' }],
  [/physic/i, { tone: 6, emoji: '🔭' }],
  [/chemis/i, { tone: 4, emoji: '🧪' }],
  [/bio|botany|zoolog|life science/i, { tone: 5, emoji: '🌱' }],
  [/science/i, { tone: 5, emoji: '🔬' }],
  [/english|literature|language arts|grammar/i, { tone: 9, emoji: '📖' }],
  [/hindi|arabic|urdu|french|spanish|german|malayalam|tamil|language/i, { tone: 2, emoji: '🗣️' }],
  [/histor|civic|social|polit/i, { tone: 3, emoji: '🏛️' }],
  [/geograph/i, { tone: 6, emoji: '🌍' }],
  [/econom|business|commerce|account/i, { tone: 4, emoji: '📊' }],
  [/art|draw|paint|craft|design/i, { tone: 9, emoji: '🎨' }],
  [/music|sing|choir|instrument/i, { tone: 8, emoji: '🎵' }],
  [/sport|physical education|\bpe\b|gym|athletic/i, { tone: 1, emoji: '⚽' }],
  [/moral|religio|value|ethic/i, { tone: 3, emoji: '🕊️' }],
  [/health|nutrition|hygiene/i, { tone: 5, emoji: '🍎' }],
]

const FALLBACK_EMOJI = ['📚', '✏️', '🧠', '🔖', '🧩', '🎯', '⭐', '🚀', '🧭']

/** Small stable string hash. Not cryptographic — it only has to be repeatable. */
function hash(value: string): number {
  let h = 0
  for (let i = 0; i < value.length; i += 1) {
    h = (h << 5) - h + value.charCodeAt(i)
    h |= 0
  }
  return Math.abs(h)
}

export function subjectLook(name: string | null | undefined): SubjectLook {
  const label = (name ?? '').trim()
  if (!label) return { tone: 8, emoji: '📚' }

  for (const [pattern, look] of KNOWN) {
    if (pattern.test(label)) return look
  }

  const h = hash(label.toLowerCase())
  return {
    tone: (h % 9) + 1,
    emoji: FALLBACK_EMOJI[h % FALLBACK_EMOJI.length],
  }
}

/**
 * Inline style that sets `--tile`, which every `.sticker` / `.tile-solid` /
 * `.tile-soft` rule reads.
 *
 * Done as a custom property rather than nine variants of each class so a single
 * class name works for any subject, and so the colour survives into nested
 * children without being threaded through props.
 */
export function toneStyle(tone: number): React.CSSProperties {
  return { '--tile': `var(--fun-${tone})` } as React.CSSProperties
}

export function subjectStyle(name: string | null | undefined): React.CSSProperties {
  return toneStyle(subjectLook(name).tone)
}

/** Cycles the palette for lists that have no subject of their own. */
export function toneForIndex(index: number): number {
  return (index % 9) + 1
}
