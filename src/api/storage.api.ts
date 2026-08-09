import { get, post } from './client'
import type { StorageHealth, StorageUploadResponse } from './types'

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

  /**
   * Which storage backend is active and whether it is reachable.
   *
   * Available to teachers, which is the point: it answers "is my upload not
   * reaching Drive because of this file, or because of the server?" without
   * needing admin rights. Admins get the fuller picture, Meet included, from
   * `adminApi.integrations`.
   */
  status: () => get<StorageHealth>('/storage/status', { timeout: 20_000 }),
}
