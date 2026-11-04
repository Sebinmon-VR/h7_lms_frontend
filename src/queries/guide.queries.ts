import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { guideApi } from '@/api/guide.api'
import { ApiError } from '@/api/errors'
import { STALE } from './keys'

const KEY = ['guide', 'videos'] as const

export function useGuideVideos() {
  return useQuery({ queryKey: KEY, queryFn: guideApi.videos, staleTime: STALE.reference })
}

export function useSaveGuideVideos() {
  const qc = useQueryClient()
  return useMutation({
    meta: { silent: true },
    mutationFn: (videos: Record<string, string>) => guideApi.saveVideos(videos),
    onSuccess: (saved) => {
      qc.setQueryData(KEY, saved)
      toast.success('Guide videos saved')
    },
    onError: (error) =>
      toast.error('The videos could not be saved', {
        description: error instanceof ApiError ? error.message : undefined,
      }),
  })
}
