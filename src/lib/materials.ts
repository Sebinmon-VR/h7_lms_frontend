import type { StudyMaterialOut } from '@/api/types'
import { fileKind } from './files'
import { isLinkMaterial, materialYoutubeId } from './links'

/**
 * How study materials are grouped for a learner.
 *
 * `material_type` is free-form, so the shelves are decided here rather than
 * trusted to the label: a published class recording is always a video, and
 * so is an uploaded .mp4 whatever its teacher typed as its type. A shared
 * YouTube link sits with the videos too; any other link goes by its type.
 */

/** A published class recording rather than an upload. */
export function isClassVideo(material: Pick<StudyMaterialOut, 'material_type' | 'recording_key'>) {
  return material.material_type?.toUpperCase() === 'RECORDING' || !!material.recording_key
}

export type LibraryShelf = 'videos' | 'notes' | 'books' | 'other'

export const LIBRARY_SHELVES: readonly LibraryShelf[] = ['videos', 'notes', 'books', 'other']

export function libraryShelf(material: StudyMaterialOut): LibraryShelf {
  if (isClassVideo(material) || materialYoutubeId(material)) return 'videos'
  if (!isLinkMaterial(material) && fileKind(material.file_url) === 'video') return 'videos'
  const type = (material.material_type ?? '').trim().toUpperCase()
  if (type === 'NOTES' || type === 'NOTE') return 'notes'
  if (type === 'BOOK' || type === 'BOOKS' || type === 'TEXTBOOK') return 'books'
  return 'other'
}
