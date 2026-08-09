import {
  File,
  FileArchive,
  FileAudio,
  FileCode,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileType,
  FileVideo,
  Presentation,
} from 'lucide-react'

import { cn } from '@/lib/cn'
import { fileKind, type FileKind } from '@/lib/files'

const ICON: Record<FileKind, typeof File> = {
  pdf: FileType,
  doc: FileText,
  sheet: FileSpreadsheet,
  slides: Presentation,
  image: FileImage,
  video: FileVideo,
  audio: FileAudio,
  archive: FileArchive,
  code: FileCode,
  text: FileText,
  other: File,
}

const TONE: Record<FileKind, string> = {
  pdf: 'text-danger bg-danger/12',
  doc: 'text-info bg-info/12',
  sheet: 'text-success bg-success/12',
  slides: 'text-warning bg-warning/15',
  image: 'text-accent bg-accent/12',
  video: 'text-primary bg-primary/12',
  audio: 'text-accent bg-accent/12',
  archive: 'text-muted-foreground bg-muted',
  code: 'text-info bg-info/12',
  text: 'text-muted-foreground bg-muted',
  other: 'text-muted-foreground bg-muted',
}

export function FileTypeIcon({
  url,
  size = 'md',
  className,
}: {
  url: string | null | undefined
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  const kind = fileKind(url)
  const Icon = ICON[kind]
  const box = size === 'sm' ? 'size-8' : size === 'lg' ? 'size-12' : 'size-10'
  const glyph = size === 'sm' ? 'size-4' : size === 'lg' ? 'size-6' : 'size-5'

  return (
    <span className={cn('inline-flex shrink-0 items-center justify-center rounded-lg', box, TONE[kind], className)}>
      <Icon className={glyph} />
    </span>
  )
}
