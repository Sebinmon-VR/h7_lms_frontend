import { API_ORIGIN } from './env'

/**
 * `file_url` is polymorphic: an absolute GCS URL when cloud storage is on,
 * a root-relative "/uploads/..." path when the backend falls back to local
 * storage. The backend also writes raw filenames (spaces, unicode) straight
 * into the path, so segments need encoding.
 */
export function encodePathSegments(path: string): string {
  return path
    .split('/')
    .map((seg) => (seg ? encodeURIComponent(decodeURIComponent(seg)) : seg))
    .join('/')
}

export function resolveFileUrl(url: string | null | undefined): string | null {
  if (!url) return null
  if (/^https?:\/\//i.test(url)) return url
  const path = url.startsWith('/') ? url : `/${url}`
  return `${API_ORIGIN}${encodePathSegments(path)}`
}

/** Last path segment, decoded — what the user thinks of as "the file". */
export function fileNameFromUrl(url: string | null | undefined): string {
  if (!url) return 'file'
  const clean = url.split('?')[0].split('#')[0]
  const last = clean.substring(clean.lastIndexOf('/') + 1)
  try {
    return decodeURIComponent(last) || 'file'
  } catch {
    return last || 'file'
  }
}

export function fileExtension(nameOrUrl: string | null | undefined): string {
  const name = fileNameFromUrl(nameOrUrl)
  const idx = name.lastIndexOf('.')
  return idx > 0 ? name.slice(idx + 1).toLowerCase() : ''
}

export type FileKind =
  | 'pdf'
  | 'doc'
  | 'sheet'
  | 'slides'
  | 'image'
  | 'video'
  | 'audio'
  | 'archive'
  | 'code'
  | 'text'
  | 'other'

const KIND_BY_EXT: Record<string, FileKind> = {
  pdf: 'pdf',
  doc: 'doc',
  docx: 'doc',
  rtf: 'doc',
  odt: 'doc',
  xls: 'sheet',
  xlsx: 'sheet',
  csv: 'sheet',
  ods: 'sheet',
  ppt: 'slides',
  pptx: 'slides',
  odp: 'slides',
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  gif: 'image',
  webp: 'image',
  svg: 'image',
  bmp: 'image',
  mp4: 'video',
  mov: 'video',
  avi: 'video',
  mkv: 'video',
  webm: 'video',
  mp3: 'audio',
  wav: 'audio',
  m4a: 'audio',
  ogg: 'audio',
  zip: 'archive',
  rar: 'archive',
  '7z': 'archive',
  tar: 'archive',
  gz: 'archive',
  js: 'code',
  ts: 'code',
  py: 'code',
  java: 'code',
  cpp: 'code',
  c: 'code',
  json: 'code',
  html: 'code',
  css: 'code',
  txt: 'text',
  md: 'text',
}

export function fileKind(nameOrUrl: string | null | undefined): FileKind {
  return KIND_BY_EXT[fileExtension(nameOrUrl)] ?? 'other'
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let i = 0
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024
    i += 1
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[i]}`
}

/** Client-side upload guard. The backend enforces no limit at all. */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024

/** Human name for a `storage_provider` value. */
export const STORAGE_LABEL: Record<string, string> = {
  GCS: 'Cloud Storage',
  DRIVE: 'Google Drive',
  LOCAL: 'Server disk',
}

export function storageLabel(provider: string | null | undefined): string {
  if (!provider) return 'storage'
  return STORAGE_LABEL[provider] ?? provider
}
