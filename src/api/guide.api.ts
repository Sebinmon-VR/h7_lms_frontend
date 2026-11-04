import { get, put } from './client'

/** The User Guide's video links, keyed by guide topic. Admins edit them; everyone reads them. */
export interface GuideVideos {
  videos: Record<string, string>
  updated_at: string | null
}

export const guideApi = {
  videos: () => get<GuideVideos>('/guide/videos'),
  saveVideos: (videos: Record<string, string>) => put<GuideVideos>('/admin/guide/videos', { videos }),
}
