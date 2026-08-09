import { post } from './client'
import type { StorageUploadResponse } from './types'

export const storageApi = {
  /**
   * Bare upload — creates no StudyMaterial record. Used to host meeting
   * recordings, whose returned `access_url` feeds `recording_url`.
   */
  upload: (file: File, folder: string, onProgress?: (percent: number) => void) => {
    const form = new FormData()
    form.append('folder', folder)
    form.append('file', file)

    return post<StorageUploadResponse>('/storage/upload', form, {
      timeout: 120_000,
      onUploadProgress: (e) => {
        if (onProgress && e.total) onProgress(Math.round((e.loaded / e.total) * 100))
      },
    })
  },
}
