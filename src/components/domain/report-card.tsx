import {
  Award,
  CalendarCheck,
  CalendarRange,
  CircleSlash,
  MessageSquareQuote,
  Printer,
  Trophy,
} from 'lucide-react'
import * as React from 'react'

import type { ReportCardOut, ReportCardSubjectLine } from '@/api/types'
import { cn } from '@/lib/cn'
import { formatDate, formatDateTime } from '@/lib/datetime'
import { APP_NAME } from '@/lib/env'
import { formatMark } from '@/lib/exams'
import { formatPercent, performanceTone } from '@/lib/format'
import { subjectLook, toneStyle } from '@/lib/subjects'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Logo } from '@/components/layout/logo'

/**
 * A report card, designed to be read on a screen and to survive a printer.
 *
 * The layout answers the questions in the order a parent asks them: how did
 * they do overall (the big ring), where do they stand (rank, attendance),
 * then subject by subject, then what the teacher said. Every number on it is
 * a snapshot the backend took when the card was generated, so nothing here is
 * recomputed — the component only arranges what it is given.
 *
 * Printing: the `report-card-print` class and the `printing-report-card`
 * body flag are what `index.css` uses to hide everything else on the page.
 */

const RING_TONE: Record<ReturnType<typeof performanceTone>, string> = {
  success: 'hsl(var(--success))',
  warning: 'hsl(var(--warning))',
  danger: 'hsl(var(--danger))',
  muted: 'hsl(var(--muted-foreground) / 0.4)',
}

function ScoreRing({ percentage, grade }: { percentage: number; grade: string | null }) {
  const size = 132
  const stroke = 11
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const clamped = Math.max(0, Math.min(100, percentage))
  const tone = performanceTone(clamped)

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="hsl(var(--muted))" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={RING_TONE[tone]}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped / 100)}
          style={{ transition: 'stroke-dashoffset 900ms cubic-bezier(0.22, 1, 0.36, 1)' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold tabular-nums tracking-tight">{formatPercent(clamped, 1)}</span>
        {grade ? (
          <span className="mt-0.5 rounded-full bg-foreground px-2 py-0.5 text-2xs font-semibold uppercase tracking-wider text-background">
            Grade {grade}
          </span>
        ) : (
          <span className="mt-0.5 text-2xs text-muted-foreground">overall</span>
        )}
      </div>
    </div>
  )
}

function Summary({
  icon: Icon,
  label,
  value,
  hint,
  tone = 'primary',
}: {
  icon: typeof Trophy
  label: string
  value: React.ReactNode
  hint?: string
  tone?: 'primary' | 'success' | 'info' | 'warning' | 'neutral'
}) {
  const look = {
    primary: 'bg-primary/12 text-primary',
    success: 'bg-success/12 text-success',
    info: 'bg-info/12 text-info',
    warning: 'bg-warning/15 text-warning',
    neutral: 'bg-muted text-muted-foreground',
  }[tone]

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/70 bg-surface/60 px-3.5 py-3 print:bg-transparent">
      <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg', look)}>
        <Icon className="size-4" />
      </span>
      <div className="min-w-0">
        <p className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="truncate text-base font-semibold tabular-nums leading-tight">{value}</p>
        {hint && <p className="truncate text-2xs text-muted-foreground">{hint}</p>}
      </div>
    </div>
  )
}

function GradePill({ grade, percentage }: { grade: string | null; percentage: number | null }) {
  if (!grade && percentage == null) return <span className="text-muted-foreground">—</span>
  const tone = performanceTone(percentage)
  return (
    <span
      className={cn(
        'inline-flex min-w-9 items-center justify-center rounded-md px-2 py-0.5 text-xs font-bold tabular-nums',
        tone === 'success' && 'bg-success/15 text-success',
        tone === 'warning' && 'bg-warning/18 text-warning',
        tone === 'danger' && 'bg-danger/15 text-danger',
        tone === 'muted' && 'bg-muted text-muted-foreground',
      )}
    >
      {grade ?? formatPercent(percentage, 0)}
    </span>
  )
}

function SubjectBlock({ line }: { line: ReportCardSubjectLine }) {
  const name = line.subject_name ?? `Subject ${line.subject_id}`
  const look = subjectLook(name)

  return (
    <div
      style={toneStyle(look.tone)}
      className="overflow-hidden rounded-xl border border-border/80 break-inside-avoid print:rounded-md"
    >
      <div className="flex flex-wrap items-center gap-3 border-b border-border/70 bg-[hsl(var(--tile)/0.09)] px-4 py-2.5 print:bg-transparent">
        <span
          className="tile-solid flex size-8 shrink-0 items-center justify-center rounded-lg text-base print:hidden"
          aria-hidden
        >
          {look.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{name}</p>
          <p className="text-2xs text-muted-foreground">
            {line.subject_code ? `${line.subject_code} · ` : ''}
            {line.exams_counted} {line.exams_counted === 1 ? 'exam' : 'exams'} counted
            {line.exams_missed > 0 && `, ${line.exams_missed} missed`}
          </p>
        </div>
        <div className="flex items-center gap-4 text-right">
          <div>
            <p className="text-2xs uppercase tracking-wide text-muted-foreground">Total</p>
            <p className="text-sm font-semibold tabular-nums">
              {formatMark(line.total_marks)}
              <span className="text-muted-foreground"> / {formatMark(line.total_max_marks)}</span>
            </p>
          </div>
          <div>
            <p className="text-2xs uppercase tracking-wide text-muted-foreground">Score</p>
            <p className="text-sm font-semibold tabular-nums">{formatPercent(line.percentage, 1)}</p>
          </div>
          <GradePill grade={line.grade} percentage={line.percentage} />
        </div>
      </div>

      <table className="w-full text-sm">
        <thead className="sr-only">
          <tr>
            <th>Exam</th>
            <th>Date</th>
            <th>Marks</th>
            <th>Score</th>
            <th>Grade</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {line.exams.map((exam) => (
            <tr key={exam.exam_id} className={cn(exam.missed && 'text-muted-foreground')}>
              <td className="px-4 py-2">
                <p className={cn('font-medium', exam.missed && 'font-normal')}>{exam.title}</p>
                {exam.remarks && <p className="text-xs text-muted-foreground">{exam.remarks}</p>}
              </td>
              <td className="whitespace-nowrap px-2 py-2 text-xs text-muted-foreground">
                {exam.conducted_on ? formatDate(exam.conducted_on) : ''}
              </td>
              <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums">
                {exam.missed ? (
                  <span className="inline-flex items-center gap-1 text-xs">
                    <CircleSlash className="size-3" />
                    Not sat
                  </span>
                ) : (
                  <>
                    {formatMark(exam.marks_obtained)}
                    <span className="text-muted-foreground"> / {formatMark(exam.max_marks)}</span>
                  </>
                )}
              </td>
              <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums text-muted-foreground">
                {exam.missed ? '' : formatPercent(exam.percentage, 0)}
              </td>
              <td className="px-4 py-2 text-right">
                {exam.missed ? '' : <GradePill grade={exam.grade} percentage={exam.percentage} />}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {line.teacher_remarks && (
        <p className="border-t border-border/60 bg-surface/60 px-4 py-2 text-xs print:bg-transparent">
          <span className="font-semibold">Teacher&rsquo;s note:</span> {line.teacher_remarks}
        </p>
      )}
    </div>
  )
}

/** Fires the browser's print dialog with everything but the card hidden. */
export function printReportCard() {
  document.body.classList.add('printing-report-card')
  const cleanup = () => {
    document.body.classList.remove('printing-report-card')
    window.removeEventListener('afterprint', cleanup)
  }
  window.addEventListener('afterprint', cleanup)
  window.print()
  // Browsers that never fire `afterprint` (some mobile WebViews) still need the flag cleared.
  window.setTimeout(cleanup, 2000)
}

export function ReportCardView({
  card,
  actions,
  className,
}: {
  card: ReportCardOut
  /** Rendered in the header, hidden when printing. */
  actions?: React.ReactNode
  className?: string
}) {
  const studentName = card.student?.full_name ?? `Student #${String(card.student_id).slice(-6)}`
  const className_ = card.class_room ? `${card.class_room.name}${card.class_room.code ? ` · ${card.class_room.code}` : ''}` : ''
  const period =
    card.from_date || card.to_date
      ? `${card.from_date ? formatDate(card.from_date) : 'Start'} – ${card.to_date ? formatDate(card.to_date) : 'Today'}`
      : null

  return (
    <article
      className={cn(
        'report-card-print overflow-hidden rounded-2xl border border-border bg-card shadow-md print:rounded-none print:border-0 print:shadow-none',
        className,
      )}
      aria-label={`${card.title} for ${studentName}`}
    >
      {/* ------------------------------------------------------- band */}
      <div className="relative overflow-hidden bg-gradient-to-br from-primary via-primary to-accent px-6 py-5 text-primary-foreground print:bg-none print:border-b print:border-border print:text-foreground">
        <div className="grid-pattern absolute inset-0 opacity-20 print:hidden" aria-hidden />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-white/15 print:bg-transparent">
              <Logo />
            </span>
            <div>
              <p className="text-2xs font-semibold uppercase tracking-[0.2em] opacity-80">{APP_NAME} · Report card</p>
              <h2 className="text-xl font-semibold leading-tight tracking-tight">{card.title}</h2>
              {period && (
                <p className="mt-0.5 inline-flex items-center gap-1.5 text-xs opacity-90">
                  <CalendarRange className="size-3.5" />
                  {period}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 print:hidden">
            {card.is_published ? (
              <Badge tone="success" className="border-white/30 bg-white/15 text-primary-foreground">
                Released {card.published_at ? formatDate(card.published_at) : ''}
              </Badge>
            ) : (
              <Badge tone="neutral" className="border-white/30 bg-white/10 text-primary-foreground">
                Not released
              </Badge>
            )}
            {actions}
          </div>
        </div>
      </div>

      {/* --------------------------------------------------- identity */}
      <div className="grid gap-5 px-6 py-5 md:grid-cols-[auto_1fr]">
        <div className="flex items-center gap-4">
          <Avatar name={studentName} size="xl" className="print:hidden" />
          <div className="min-w-0">
            <p className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">Student</p>
            <p className="truncate text-lg font-semibold leading-tight">{studentName}</p>
            {card.student?.email && (
              <p className="truncate text-xs text-muted-foreground">{card.student.email}</p>
            )}
            {className_ && <p className="mt-1 text-sm">{className_}</p>}
          </div>
        </div>

        <div className="flex flex-col items-start gap-4 md:flex-row md:items-center md:justify-end">
          <ScoreRing percentage={card.overall_percentage} grade={card.overall_grade} />
          <div className="grid w-full grid-cols-2 gap-2 sm:grid-cols-2 md:w-auto md:min-w-[22rem]">
            <Summary
              icon={Award}
              label="Total marks"
              value={
                <>
                  {formatMark(card.total_marks)}
                  <span className="text-muted-foreground"> / {formatMark(card.total_max_marks)}</span>
                </>
              }
              hint={`${card.exams_counted} ${card.exams_counted === 1 ? 'exam' : 'exams'}${card.exams_missed > 0 ? `, ${card.exams_missed} missed` : ''}`}
            />
            <Summary
              icon={Trophy}
              label="Class rank"
              value={card.rank != null ? `#${card.rank}` : '—'}
              hint={card.rank != null && card.class_size != null ? `of ${card.class_size} students` : 'Not ranked'}
              tone={card.rank != null && card.rank <= 3 ? 'warning' : 'neutral'}
            />
            <Summary
              icon={CalendarCheck}
              label="Attendance"
              value={card.attendance_percentage != null ? formatPercent(card.attendance_percentage, 0) : '—'}
              hint={card.attendance_percentage != null ? 'of classes attended' : 'Not included'}
              tone={
                card.attendance_percentage == null
                  ? 'neutral'
                  : card.attendance_percentage >= 75
                    ? 'success'
                    : 'warning'
              }
            />
            <Summary
              icon={CalendarRange}
              label="Issued"
              value={formatDate(card.generated_at)}
              hint={card.class_room ? `Class ${card.class_room.name}` : undefined}
              tone="info"
            />
          </div>
        </div>
      </div>

      {/* ---------------------------------------------------- subjects */}
      <div className="space-y-3 border-t border-border/70 px-6 py-5">
        <div className="flex items-baseline justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Subjects</h3>
          <p className="text-2xs text-muted-foreground">
            {card.subjects.length} {card.subjects.length === 1 ? 'subject' : 'subjects'}
          </p>
        </div>
        {card.subjects.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            No exams were counted on this card.
          </p>
        ) : (
          card.subjects.map((line) => <SubjectBlock key={line.subject_id} line={line} />)
        )}
      </div>

      {/* ----------------------------------------------------- remarks */}
      {card.remarks && (
        <div className="border-t border-border/70 px-6 py-5">
          <div className="flex gap-3 rounded-xl bg-primary/6 px-4 py-3 print:bg-transparent print:px-0">
            <MessageSquareQuote className="mt-0.5 size-4 shrink-0 text-primary" />
            <div>
              <p className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                Class teacher&rsquo;s remarks
              </p>
              <p className="mt-1 text-sm leading-relaxed">{card.remarks}</p>
            </div>
          </div>
        </div>
      )}

      {/* --------------------------------------------------- signatures */}
      <div className="hidden grid-cols-3 gap-8 border-t border-border px-6 pb-6 pt-10 print:grid">
        {['Class teacher', 'Principal', 'Parent / Guardian'].map((who) => (
          <div key={who} className="border-t border-foreground/60 pt-1.5 text-center text-xs text-muted-foreground">
            {who}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/70 bg-surface/50 px-6 py-3 text-2xs text-muted-foreground print:bg-transparent">
        <span>Generated {formatDateTime(card.generated_at)}</span>
        <span>Marks are a snapshot taken when this card was issued.</span>
      </div>
    </article>
  )
}

/** The header button that pairs with `printReportCard`. */
export function PrintReportCardButton({ className }: { className?: string }) {
  return (
    <Button
      variant="outline"
      size="sm"
      icon={<Printer />}
      onClick={printReportCard}
      className={cn('border-white/30 bg-white/10 text-primary-foreground hover:bg-white/20', className)}
    >
      Print
    </Button>
  )
}

/**
 * A compact tile for lists — the parts of a card someone scans for before
 * opening it. Used by both the class teacher's list and a student's own.
 */
export function ReportCardTile({
  card,
  onClick,
  showStudent = true,
  className,
}: {
  card: ReportCardOut
  onClick?: () => void
  showStudent?: boolean
  className?: string
}) {
  const studentName = card.student?.full_name ?? `Student #${String(card.student_id).slice(-6)}`
  const tone = performanceTone(card.overall_percentage)

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group flex w-full items-center gap-4 rounded-xl border border-border bg-card p-4 text-left shadow-sm transition-all',
        'hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        className,
      )}
    >
      <div
        className={cn(
          'flex size-14 shrink-0 flex-col items-center justify-center rounded-xl text-center',
          tone === 'success' && 'bg-success/12 text-success',
          tone === 'warning' && 'bg-warning/15 text-warning',
          tone === 'danger' && 'bg-danger/12 text-danger',
          tone === 'muted' && 'bg-muted text-muted-foreground',
        )}
      >
        <span className="text-lg font-bold leading-none tabular-nums">{card.overall_grade ?? formatPercent(card.overall_percentage, 0)}</span>
        {card.overall_grade && (
          <span className="mt-1 text-2xs font-medium opacity-80">{formatPercent(card.overall_percentage, 0)}</span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{showStudent ? studentName : card.title}</p>
        <p className="truncate text-xs text-muted-foreground">
          {showStudent ? card.title : (card.class_room?.name ?? '')}
          {card.class_room && showStudent ? ` · ${card.class_room.name}` : ''}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {card.rank != null && (
            <Badge tone={card.rank <= 3 ? 'warning' : 'neutral'} size="sm">
              <Trophy />#{card.rank}
              {card.class_size != null && ` of ${card.class_size}`}
            </Badge>
          )}
          <Badge tone={card.is_published ? 'success' : 'neutral'} size="sm" dot>
            {card.is_published ? 'Released' : 'Draft'}
          </Badge>
          <span className="text-2xs text-muted-foreground">{formatDate(card.generated_at)}</span>
        </div>
      </div>
    </button>
  )
}
