import type { StudyMaterialOut } from '@/api/types'

/**
 * Web links shared into the library instead of an uploaded file.
 *
 * The backend validates the address and records `link_kind` and `youtube_id`
 * (app/services/links.py). This mirrors its YouTube parsing so the share
 * dialog can preview a video before anything is saved; the stored fields win
 * once a material exists.
 */

const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
])
const SHORT_HOSTS = new Set(['youtu.be', 'www.youtu.be'])
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/
const PATH_PREFIXES = ['/shorts/', '/live/', '/embed/', '/v/', '/e/']

/** Adds the scheme people leave off when they paste "youtu.be/…". */
export function normaliseUrl(raw: string): string {
  const url = raw.trim()
  if (!url) return ''
  return url.includes('://') ? url : `https://${url}`
}

function parse(raw: string): URL | null {
  try {
    return new URL(normaliseUrl(raw))
  } catch {
    return null
  }
}

/** True for a plain http(s) address with a real-looking host. */
export function isWebUrl(raw: string): boolean {
  const url = parse(raw)
  return !!url && (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname.includes('.')
}

export function youtubeVideoId(raw: string | null | undefined): string | null {
  if (!raw) return null
  const url = parse(raw)
  if (!url) return null
  const host = url.hostname.toLowerCase()
  let candidate: string | null = null

  if (SHORT_HOSTS.has(host)) {
    candidate = url.pathname.replace(/^\//, '').split('/')[0]
  } else if (YOUTUBE_HOSTS.has(host)) {
    if (url.pathname === '/watch' || url.pathname === '/watch/') {
      candidate = url.searchParams.get('v')
    } else {
      const prefix = PATH_PREFIXES.find((p) => url.pathname.startsWith(p))
      if (prefix) candidate = url.pathname.slice(prefix.length).split('/')[0]
    }
  }
  return candidate && VIDEO_ID.test(candidate) ? candidate : null
}

/** "khanacademy.org" — what a reader recognises a link by. */
export function linkHost(raw: string | null | undefined): string {
  const url = raw ? parse(raw) : null
  return url ? url.hostname.replace(/^www\./, '') : ''
}

export function youtubeThumbnail(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
}

/** The privacy-enhanced player: no YouTube cookies until the student presses play. */
export function youtubeEmbedUrl(videoId: string, autoplay = false): string {
  const params = new URLSearchParams({ rel: '0', modestbranding: '1' })
  if (autoplay) params.set('autoplay', '1')
  return `https://www.youtube-nocookie.com/embed/${videoId}?${params}`
}

type LinkFields = Pick<StudyMaterialOut, 'external_url' | 'youtube_id' | 'link_kind'>

/** A shared web link rather than an uploaded file. */
export function isLinkMaterial(material: LinkFields): boolean {
  return !!material.external_url
}

/** The YouTube video a material plays, if it is one. */
export function materialYoutubeId(material: LinkFields): string | null {
  if (!material.external_url) return null
  return material.youtube_id ?? youtubeVideoId(material.external_url)
}
