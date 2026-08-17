import { UserRoundCog } from 'lucide-react'

import type { UserOut } from '@/api/types'
import { useAuth } from '@/providers/auth-provider'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

/**
 * Marks a record somebody else filed.
 *
 * The teacher listing endpoints return this teacher's own records PLUS
 * everything filed against the classes they are class teacher of, whoever
 * entered it. Without a marker those pages quietly claim another teacher's
 * register or marks as the reader's own work, which is both confusing and — the
 * moment they edit one — the wrong thing to have believed.
 *
 * It renders nothing for a teacher's own records, which is every record a plain
 * subject teacher ever sees, so the badge only ever appears where it means
 * something.
 */
export function FiledBy({
  teacherId,
  teacher,
  size = 'sm',
}: {
  teacherId: number | null
  /** Present on topics, meetings, materials and grades; absent on attendance. */
  teacher?: UserOut | null
  size?: 'sm' | 'md'
}) {
  const { user } = useAuth()

  if (teacherId == null || user == null || teacherId === user.id) return null

  const name = teacher?.full_name ?? 'another teacher'

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge tone="warning" size={size}>
          <UserRoundCog />
          {name}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        You can see this because you are the class teacher of this class. You may correct it.
      </TooltipContent>
    </Tooltip>
  )
}

/** True when the record belongs to someone other than the signed-in teacher. */
export function useIsForeignRecord() {
  const { user } = useAuth()
  return (teacherId: number | null | undefined) =>
    user != null && teacherId != null && teacherId !== user.id
}
