import {
  CalendarClock,
  Globe2,
  ListPlus,
  Lock,
  MoreHorizontal,
  Package,
  Pencil,
  Plus,
  Power,
  Search,
  Trash2,
  TriangleAlert,
  Trophy,
} from 'lucide-react'
import * as React from 'react'
import { format } from 'date-fns'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'

import type { ArenaCategory, ArenaChallenge, ArenaChallengeInput, ArenaQuestion } from '@/api/arena.types'
import {
  useCreateChallenge,
  useDeleteChallenge,
  useGlobalQuestions,
  useInstallStarterPack,
  useManageChallenges,
  useManageScopes,
  useUpdateChallenge,
} from '@/queries/arena.queries'
import { useAuth } from '@/providers/auth-provider'
import { cn } from '@/lib/cn'
import { formatDateTime, parseApiDateTime } from '@/lib/datetime'
import { DIFFICULTY_LABEL } from '@/components/arena/arena-ui'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input, Textarea } from '@/components/ui/input'
import { Segmented } from '@/components/ui/segmented'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogForm,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { EmptyState, NoResults } from '@/components/feedback/states'
import { QueryBoundary } from '@/components/feedback/query-boundary'
import { ConfirmDialog } from '@/components/forms/confirm-dialog'
import { Field, FieldRow, FormError } from '@/components/forms/field'
import { PageHeader } from '@/components/layout/page-header'
import { BulkQuestionsDialog, QuestionDialog, QuestionList, type QuestionTarget } from './question-editor'
import { MIN_BATTLE_QUESTIONS } from './question-parse'

type Tab = 'challenges' | 'pool'

const EMOJI_SUGGESTIONS = ['🌍', '🧠', '🔬', '🧮', '📚', '🏛️', '🗺️', '⚽', '🎨', '💻', '🎉', '🏆']

type Status = { label: string; tone: 'success' | 'info' | 'neutral' | 'warning' }

function challengeStatus(c: ArenaChallenge, now = new Date()): Status {
  if (!c.is_active) return { label: 'Off', tone: 'neutral' }
  if (c.is_open) return { label: 'Open', tone: 'success' }
  const starts = parseApiDateTime(c.starts_at)
  if (starts && starts > now) return { label: 'Scheduled', tone: 'info' }
  return { label: 'Ended', tone: 'warning' }
}

function windowLine(c: ArenaChallenge): string {
  if (!c.starts_at && !c.ends_at) return 'Always open'
  if (c.starts_at && c.ends_at) return `${formatDateTime(c.starts_at)} – ${formatDateTime(c.ends_at)}`
  if (c.starts_at) return `From ${formatDateTime(c.starts_at)}`
  return `Until ${formatDateTime(c.ends_at)}`
}

/** API instant → the value a datetime-local input shows, in the viewer's zone. */
function toLocalInput(value: string | null | undefined): string {
  const d = parseApiDateTime(value)
  return d ? format(d, "yyyy-MM-dd'T'HH:mm") : ''
}

function fromLocalInput(value: string): string | null {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

function chip(active: boolean) {
  return cn(
    'inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
    active ? 'border-primary bg-primary/12 text-primary' : 'border-border text-muted-foreground hover:border-primary/40',
  )
}

export default function ArenaGlobalPage() {
  const { role } = useAuth()
  const isAdmin = role === 'ADMIN'
  const [params, setParams] = useSearchParams()
  const tab: Tab = params.get('tab') === 'pool' ? 'pool' : 'challenges'

  const scopesQuery = useManageScopes(isAdmin)
  const challengesQuery = useManageChallenges(isAdmin)
  const questionsQuery = useGlobalQuestions(isAdmin)
  const installPack = useInstallStarterPack()

  if (!isAdmin) {
    return (
      <>
        <PageHeader title="Global challenges" description="School-wide quiz competitions and their question pool." />
        <div className="flex items-start gap-3 rounded-xl border border-info/30 bg-info/8 p-4 text-sm">
          <Lock className="mt-0.5 size-4 shrink-0 text-info" />
          <div>
            <p className="font-medium text-foreground">Only an administrator can manage global challenges</p>
            <p className="mt-0.5 text-muted-foreground">
              They reach every student in the school. Chapters and questions for your own classes are under
              Syllabus &amp; questions.
            </p>
          </div>
        </div>
      </>
    )
  }

  const categories = scopesQuery.data?.categories ?? []
  const poolEmpty = questionsQuery.data?.length === 0
  const noChallenges = challengesQuery.data?.length === 0

  return (
    <>
      <PageHeader
        title="Global challenges"
        description={`Themed competitions open to every student, drawing on the school-wide question pool. Each has its own leaderboard; a challenge needs at least ${MIN_BATTLE_QUESTIONS} matching questions to be playable.`}
      />

      {(poolEmpty || noChallenges) && (
        <Card className="mb-6 flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary">
              <Package className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold">
                {poolEmpty ? 'Start with the starter pack' : 'No challenges yet'}
              </p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                About 84 school-friendly questions across 10 categories, and four ready-made challenges. Pressing it
                again never adds duplicates.
              </p>
            </div>
          </div>
          <Button
            variant="primary"
            icon={<Package />}
            className="shrink-0 self-start sm:self-auto"
            loading={installPack.isPending}
            onClick={() => installPack.mutate()}
          >
            Install starter pack
          </Button>
        </Card>
      )}

      <Tabs
        value={tab}
        onValueChange={(v) =>
          setParams(
            (prev) => {
              const next = new URLSearchParams(prev)
              if (v === 'pool') next.set('tab', 'pool')
              else next.delete('tab')
              return next
            },
            { replace: true },
          )
        }
      >
        <TabsList>
          <TabsTrigger value="challenges">
            <Trophy />
            Challenges
          </TabsTrigger>
          <TabsTrigger value="pool">
            <Globe2 />
            Question pool
          </TabsTrigger>
        </TabsList>
        <TabsContent value="challenges">
          <ChallengesTab
            query={challengesQuery}
            categories={categories}
            questions={questionsQuery.data ?? []}
          />
        </TabsContent>
        <TabsContent value="pool">
          <PoolTab query={questionsQuery} categories={categories} categoriesLoading={scopesQuery.isPending} />
        </TabsContent>
      </Tabs>
    </>
  )
}

// ---------------------------------------------------------------- challenges

function ChallengesTab({
  query,
  categories,
  questions,
}: {
  query: ReturnType<typeof useManageChallenges>
  categories: ArenaCategory[]
  questions: ArenaQuestion[]
}) {
  const updateChallenge = useUpdateChallenge()
  const deleteChallenge = useDeleteChallenge()
  const [editing, setEditing] = React.useState<{ challenge: ArenaChallenge | null } | null>(null)
  const [deleting, setDeleting] = React.useState<ArenaChallenge | null>(null)
  const categoryById = React.useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories])

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {query.data ? `${query.data.length} challenge${query.data.length === 1 ? '' : 's'}` : ''}
        </p>
        <Button variant="primary" icon={<Plus />} onClick={() => setEditing({ challenge: null })}>
          New challenge
        </Button>
      </div>

      <QueryBoundary
        query={query}
        loading={
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-52 rounded-xl" />
            ))}
          </div>
        }
        isEmpty={(d) => d.length === 0}
        empty={
          <EmptyState
            icon={<Trophy />}
            title="No global challenges yet"
            description="Create one — say a general-knowledge week — or install the starter pack above for four ready-made ones."
            action={
              <Button variant="primary" icon={<Plus />} onClick={() => setEditing({ challenge: null })}>
                New challenge
              </Button>
            }
          />
        }
      >
        {(challenges) => (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {challenges.map((c) => {
              const status = challengeStatus(c)
              const short = c.question_count < MIN_BATTLE_QUESTIONS
              return (
                <Card key={c.id} className="flex min-w-0 flex-col p-4">
                  <div className="flex items-start gap-3">
                    <span
                      className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-muted text-2xl"
                      aria-hidden
                    >
                      {c.emoji}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="min-w-0 break-words text-sm font-semibold">{c.title}</p>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="-mr-1.5 -mt-1.5 shrink-0"
                              aria-label={`Actions for ${c.title}`}
                            >
                              <MoreHorizontal />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => setEditing({ challenge: c })}>
                              <Pencil />
                              Edit challenge
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onSelect={() =>
                                updateChallenge.mutate(
                                  { challengeId: c.id, body: { is_active: !c.is_active } },
                                  {
                                    onSuccess: () =>
                                      toast.success(c.is_active ? `“${c.title}” switched off` : `“${c.title}” switched on`),
                                  },
                                )
                              }
                            >
                              <Power />
                              {c.is_active ? 'Switch off' : 'Switch on'}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem destructive onSelect={() => setDeleting(c)}>
                              <Trash2 />
                              Delete challenge
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <Badge tone={status.tone} size="sm" dot>
                          {status.label}
                        </Badge>
                        <Badge tone="outline" size="sm">
                          {c.difficulty ? DIFFICULTY_LABEL[c.difficulty] : 'Any level'}
                        </Badge>
                        <Badge tone="outline" size="sm">
                          {c.rounds} rounds
                        </Badge>
                      </div>
                    </div>
                  </div>

                  {c.description && (
                    <p className="mt-3 line-clamp-3 break-words text-xs text-muted-foreground">{c.description}</p>
                  )}

                  <div className="mt-3 flex flex-wrap gap-1">
                    {c.categories.length === 0 ? (
                      <Badge tone="neutral" size="sm">
                        All categories
                      </Badge>
                    ) : (
                      c.categories.map((id) => {
                        const cat = categoryById.get(id)
                        return (
                          <Badge key={id} tone="accent" size="sm">
                            {cat ? `${cat.emoji} ${cat.name}` : id}
                          </Badge>
                        )
                      })
                    )}
                  </div>

                  <div className="mt-auto space-y-1.5 pt-3 text-xs text-muted-foreground">
                    <p className="flex items-start gap-1.5">
                      <CalendarClock className="mt-px size-3.5 shrink-0" />
                      <span className="min-w-0">{windowLine(c)}</span>
                    </p>
                    <p className={cn('flex items-start gap-1.5', short && 'font-medium text-warning')}>
                      {short ? (
                        <TriangleAlert className="mt-px size-3.5 shrink-0" />
                      ) : (
                        <Globe2 className="mt-px size-3.5 shrink-0" />
                      )}
                      <span className="min-w-0">
                        {c.question_count} matching question{c.question_count === 1 ? '' : 's'}
                        {short && ` — needs ${MIN_BATTLE_QUESTIONS} to be playable`}
                      </span>
                    </p>
                  </div>
                </Card>
              )
            })}
          </div>
        )}
      </QueryBoundary>

      <ChallengeDialog
        open={!!editing}
        challenge={editing?.challenge ?? null}
        categories={categories}
        questions={questions}
        onOpenChange={(v) => !v && setEditing(null)}
      />

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(v) => !v && setDeleting(null)}
        title="Delete this challenge?"
        description={
          deleting
            ? `“${deleting.title}” disappears from students' arena, along with its leaderboard. The questions stay in the pool. To pause it instead, switch it off.`
            : undefined
        }
        confirmLabel="Delete challenge"
        destructive
        loading={deleteChallenge.isPending}
        onConfirm={() => {
          if (!deleting) return
          deleteChallenge.mutate(deleting.id, { onSettled: () => setDeleting(null) })
        }}
      />
    </>
  )
}

const DIFFICULTY_CHOICES = [
  { value: 'any', label: 'Any' },
  { value: '1', label: 'Easy' },
  { value: '2', label: 'Medium' },
  { value: '3', label: 'Hard' },
] as const
type DifficultyChoice = (typeof DIFFICULTY_CHOICES)[number]['value']

function ChallengeDialog({
  open,
  challenge,
  categories,
  questions,
  onOpenChange,
}: {
  open: boolean
  challenge: ArenaChallenge | null
  categories: ArenaCategory[]
  questions: ArenaQuestion[]
  onOpenChange: (open: boolean) => void
}) {
  const createChallenge = useCreateChallenge()
  const updateChallenge = useUpdateChallenge()
  const pending = createChallenge.isPending || updateChallenge.isPending

  const [title, setTitle] = React.useState('')
  const [emoji, setEmoji] = React.useState('🌍')
  const [description, setDescription] = React.useState('')
  const [picked, setPicked] = React.useState<string[]>([])
  const [difficulty, setDifficulty] = React.useState<DifficultyChoice>('any')
  const [rounds, setRounds] = React.useState('7')
  const [startsAt, setStartsAt] = React.useState('')
  const [endsAt, setEndsAt] = React.useState('')
  const [active, setActive] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) return
    setTitle(challenge?.title ?? '')
    setEmoji(challenge?.emoji ?? '🌍')
    setDescription(challenge?.description ?? '')
    setPicked(challenge?.categories ?? [])
    setDifficulty(challenge?.difficulty ? (String(challenge.difficulty) as DifficultyChoice) : 'any')
    setRounds(String(challenge?.rounds ?? 7))
    setStartsAt(toLocalInput(challenge?.starts_at))
    setEndsAt(toLocalInput(challenge?.ends_at))
    setActive(challenge?.is_active ?? true)
    setError(null)
  }, [open, challenge])

  const roundsNumber = Number(rounds)
  const roundsOk = Number.isInteger(roundsNumber) && roundsNumber >= 3 && roundsNumber <= 15
  const windowOk = !startsAt || !endsAt || new Date(endsAt) > new Date(startsAt)
  const ready = title.trim().length > 0 && roundsOk && windowOk && emoji.trim().length > 0

  // The same filter the server applies, so the count is honest before saving.
  const matching = React.useMemo(() => {
    const cats = new Set(picked)
    const level = difficulty === 'any' ? null : Number(difficulty)
    return questions.filter(
      (q) => q.is_active && (cats.size === 0 || (q.category && cats.has(q.category))) && (level == null || q.difficulty === level),
    ).length
  }, [questions, picked, difficulty])

  const toggleCategory = (id: string) =>
    setPicked((list) => (list.includes(id) ? list.filter((c) => c !== id) : [...list, id]))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!ready) return
    setError(null)
    const body: ArenaChallengeInput = {
      title: title.trim(),
      description: description.trim() || null,
      emoji: emoji.trim(),
      categories: picked,
      difficulty: difficulty === 'any' ? null : Number(difficulty),
      rounds: roundsNumber,
      starts_at: fromLocalInput(startsAt),
      ends_at: fromLocalInput(endsAt),
      is_active: active,
    }
    try {
      if (challenge) {
        await updateChallenge.mutateAsync({ challengeId: challenge.id, body })
        toast.success('Challenge saved')
      } else {
        await createChallenge.mutateAsync(body)
      }
      onOpenChange(false)
    } catch (err) {
      setError((err as { message?: string })?.message ?? 'Could not save the challenge.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !pending && onOpenChange(v)}>
      <DialogContent size="lg">
        <DialogForm onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{challenge ? 'Edit challenge' : 'New global challenge'}</DialogTitle>
            <DialogDescription>
              Every student can enter it while it is open. Questions come from the pool, filtered by the categories
              and level chosen here.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <FormError message={error} />

            <div className="grid gap-x-4 gap-y-5 sm:grid-cols-[6rem_minmax(0,1fr)]">
              <Field id="arena-challenge-emoji" label="Emoji" required>
                <Input
                  id="arena-challenge-emoji"
                  value={emoji}
                  onChange={(e) => setEmoji(e.target.value)}
                  maxLength={16}
                  className="text-center text-lg"
                />
              </Field>
              <Field id="arena-challenge-title" label="Title" required>
                <Input
                  id="arena-challenge-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={120}
                  placeholder="Science Week Showdown"
                />
              </Field>
            </div>
            <div className="-mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Emoji suggestions">
              {EMOJI_SUGGESTIONS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setEmoji(e)}
                  className={cn(
                    'flex size-8 items-center justify-center rounded-md border text-lg transition-colors',
                    emoji === e ? 'border-primary bg-primary/12' : 'border-border hover:border-primary/40',
                  )}
                  aria-label={`Use ${e}`}
                >
                  {e}
                </button>
              ))}
            </div>

            <Field id="arena-challenge-description" label="Description" hint="Optional — shown on the challenge card.">
              <Textarea
                id="arena-challenge-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={1000}
                className="min-h-16"
              />
            </Field>

            <Field
              id="arena-challenge-categories"
              label="Categories"
              hint={picked.length === 0 ? 'None picked: questions come from every category.' : undefined}
            >
              <div id="arena-challenge-categories" className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setPicked([])} className={chip(picked.length === 0)}>
                  All categories
                </button>
                {categories.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => toggleCategory(c.id)}
                    className={chip(picked.includes(c.id))}
                    aria-pressed={picked.includes(c.id)}
                  >
                    <span aria-hidden>{c.emoji}</span>
                    {c.name}
                  </button>
                ))}
              </div>
            </Field>

            <FieldRow>
              <Field id="arena-challenge-difficulty" label="Difficulty">
                <div>
                  <Segmented<DifficultyChoice>
                    layoutId="arena-challenge-difficulty"
                    value={difficulty}
                    onChange={setDifficulty}
                    aria-label="Difficulty"
                    options={[...DIFFICULTY_CHOICES]}
                  />
                </div>
              </Field>
              <Field
                id="arena-challenge-rounds"
                label="Rounds"
                required
                error={rounds && !roundsOk ? 'Between 3 and 15.' : undefined}
                hint="Questions per battle, 3 to 15."
              >
                <Input
                  id="arena-challenge-rounds"
                  type="number"
                  inputMode="numeric"
                  min={3}
                  max={15}
                  value={rounds}
                  onChange={(e) => setRounds(e.target.value)}
                  invalid={!!rounds && !roundsOk}
                />
              </Field>
            </FieldRow>

            <p
              className={cn(
                'rounded-lg border px-3 py-2 text-xs',
                matching < MIN_BATTLE_QUESTIONS
                  ? 'border-warning/30 bg-warning/10 text-warning'
                  : 'border-border bg-muted/30 text-muted-foreground',
              )}
            >
              {matching} active question{matching === 1 ? '' : 's'} in the pool match.
              {matching < MIN_BATTLE_QUESTIONS && ` Students can't play it until at least ${MIN_BATTLE_QUESTIONS} do.`}
            </p>

            <FieldRow>
              <Field id="arena-challenge-starts" label="Opens" hint="Optional. Your device's time zone.">
                <Input
                  id="arena-challenge-starts"
                  type="datetime-local"
                  value={startsAt}
                  onChange={(e) => setStartsAt(e.target.value)}
                />
              </Field>
              <Field
                id="arena-challenge-ends"
                label="Closes"
                hint="Optional. Leave both empty to keep it always open."
                error={windowOk ? undefined : 'It has to close after it opens.'}
              >
                <Input
                  id="arena-challenge-ends"
                  type="datetime-local"
                  value={endsAt}
                  onChange={(e) => setEndsAt(e.target.value)}
                  invalid={!windowOk}
                />
              </Field>
            </FieldRow>

            <label className="flex cursor-pointer items-start justify-between gap-3 rounded-lg border border-border px-3 py-2.5">
              <span className="text-sm">
                <span className="font-medium">Switched on</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  Off hides it from students whatever the dates say.
                </span>
              </span>
              <Switch checked={active} onCheckedChange={setActive} aria-label="Switched on" />
            </label>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={!ready} loading={pending}>
              {challenge ? 'Save changes' : 'Create challenge'}
            </Button>
          </DialogFooter>
        </DialogForm>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------- question pool

function PoolTab({
  query,
  categories,
  categoriesLoading,
}: {
  query: ReturnType<typeof useGlobalQuestions>
  categories: ArenaCategory[]
  categoriesLoading: boolean
}) {
  const [category, setCategory] = React.useState<string | null>(null)
  const [search, setSearch] = React.useState('')
  const [adding, setAdding] = React.useState(false)
  const [bulkOpen, setBulkOpen] = React.useState(false)

  const all = query.data ?? []
  const counts = React.useMemo(() => {
    const map = new Map<string, number>()
    for (const q of all) if (q.category) map.set(q.category, (map.get(q.category) ?? 0) + 1)
    return map
  }, [all])

  const needle = search.trim().toLowerCase()
  const filtered = React.useMemo(
    () =>
      all.filter(
        (q) =>
          (!category || q.category === category) &&
          (!needle ||
            q.text.toLowerCase().includes(needle) ||
            q.options.some((o) => o.text.toLowerCase().includes(needle))),
      ),
    [all, category, needle],
  )

  const target = React.useMemo<QuestionTarget>(
    () => ({ kind: 'global', categories, defaultCategory: category }),
    [categories, category],
  )

  return (
    <>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="w-full sm:max-w-xs">
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search questions"
            aria-label="Search questions"
            leading={<Search />}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" icon={<ListPlus />} onClick={() => setBulkOpen(true)} disabled={categoriesLoading}>
            Bulk add
          </Button>
          <Button variant="primary" icon={<Plus />} onClick={() => setAdding(true)} disabled={categoriesLoading}>
            Add question
          </Button>
        </div>
      </div>

      {all.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          <button type="button" onClick={() => setCategory(null)} className={chip(category === null)}>
            All
            <span className="tabular-nums opacity-70">{all.length}</span>
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCategory(c.id)}
              className={chip(category === c.id)}
              aria-pressed={category === c.id}
            >
              <span aria-hidden>{c.emoji}</span>
              {c.name}
              <span className="tabular-nums opacity-70">{counts.get(c.id) ?? 0}</span>
            </button>
          ))}
        </div>
      )}

      <QueryBoundary
        query={query}
        loading={
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-32 rounded-xl" />
            ))}
          </div>
        }
        isEmpty={(d) => d.length === 0}
        empty={
          <EmptyState
            icon={<Globe2 />}
            title="The pool is empty"
            description="Install the starter pack above for a ready-made set, or add your own questions one at a time or in bulk."
            action={
              <Button variant="primary" icon={<Plus />} onClick={() => setAdding(true)} disabled={categoriesLoading}>
                Add question
              </Button>
            }
          />
        }
      >
        {() =>
          filtered.length === 0 ? (
            <NoResults
              onClear={() => {
                setCategory(null)
                setSearch('')
              }}
            />
          ) : (
            <QuestionList questions={filtered} target={target} />
          )
        }
      </QueryBoundary>

      <QuestionDialog open={adding} onOpenChange={setAdding} target={target} />
      <BulkQuestionsDialog open={bulkOpen} onOpenChange={setBulkOpen} target={target} />
    </>
  )
}
