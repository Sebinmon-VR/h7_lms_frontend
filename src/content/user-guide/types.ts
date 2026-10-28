/**
 * The shape of the in-app User Guide.
 *
 * Text may mark button and menu names with **double asterisks**; the page shows them in bold,
 * exactly as they read on screen. A topic's `id` never changes once published: it is the
 * key its video link is filed under (videos.ts) and the `#id` a link to the topic uses.
 */
export interface GuideSection {
  heading: string
  /** Numbered steps, done in order. */
  steps?: string[]
  /** Points that are not a sequence. */
  points?: string[]
}

export interface GuideTopic {
  id: string
  title: string
  /** One sentence: what this is for. */
  summary: string
  steps?: string[]
  sections?: GuideSection[]
  tips?: string[]
  /** Extra words a reader might search for that the text does not use. */
  keywords?: string[]
}

export interface GuidePart {
  id: string
  title: string
  topics: GuideTopic[]
}
