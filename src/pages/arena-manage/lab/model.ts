import type {
  EquipmentKind,
  Experiment,
  ExperimentStep,
  QuizQuestion,
  StepCheck,
  TestKind,
} from '@/pages/student/lab/engine/experiments'
import type { VesselKind } from '@/pages/student/lab/engine/sim'
import { REACTIONS } from '@/pages/student/lab/engine/sim'
import { REAGENTS, REAGENT_BY_ID, type Reagent } from '@/pages/student/lab/engine/substances'

// ---------------------------------------------------------------- labels

export const VESSEL_LABEL: Record<VesselKind, string> = {
  beaker: 'Beaker',
  flask: 'Conical flask',
  testtube: 'Test tube',
  boilingtube: 'Boiling tube',
  cylinder: 'Measuring cylinder',
  dish: 'Evaporating dish',
}

export const EQUIPMENT_LABEL: Record<EquipmentKind, string> = {
  ...VESSEL_LABEL,
  burner: 'Bunsen burner',
  thermometer: 'Thermometer',
  splint: 'Wooden splint',
  dropper: 'Dropper',
  tongs: 'Tongs',
  loop: 'Wire loop',
  litmus: 'Litmus paper',
  delivery: 'Delivery tube',
  spatula: 'Spatula',
}

export const VESSEL_KINDS = Object.keys(VESSEL_LABEL) as VesselKind[]
export const EQUIPMENT_KINDS = Object.keys(EQUIPMENT_LABEL) as EquipmentKind[]

export const TEST_LABEL: Record<TestKind, string> = {
  'splint-glowing': 'Glowing splint',
  'splint-burning': 'Burning splint',
  'litmus-red': 'Red litmus paper',
  'litmus-blue': 'Blue litmus paper',
  flame: 'Flame test',
  thermometer: 'Take the temperature',
}
export const TEST_KINDS = Object.keys(TEST_LABEL) as TestKind[]

export const SPLINT_RESULT_LABEL: Record<string, string> = {
  relights: 'Relights (oxygen)',
  pop: 'Squeaky pop (hydrogen)',
  'goes-out': 'Goes out (carbon dioxide)',
}

/** What the lab records for a litmus test: the colour the paper turned, or 'none'. */
export const LITMUS_RESULT_LABEL: Record<string, string> = {
  blue: 'Turns blue (alkali)',
  red: 'Turns red (acid)',
  none: 'No change',
}

export function resultLabels(test: string): Record<string, string> | null {
  if (test.startsWith('splint')) return SPLINT_RESULT_LABEL
  if (test.startsWith('litmus')) return LITMUS_RESULT_LABEL
  return null
}

export type CheckType = StepCheck['type']

export const CHECK_LABEL: Record<CheckType, string> = {
  add: 'Adds a chemical',
  reaction: 'A reaction happens',
  test: 'Does a test',
  heat: 'Turns on the heat',
  connect: 'Connects a delivery tube',
  place: 'Puts equipment on the bench',
  temp: 'Temperature reaches a value',
  ph: 'pH reaches a value',
}
export const CHECK_TYPES = Object.keys(CHECK_LABEL) as CheckType[]

export const SHELF_LABEL: Record<Reagent['shelf'], string> = {
  acids: 'Acids',
  bases: 'Bases and alkalis',
  salts: 'Salts',
  metals: 'Metals',
  indicators: 'Indicators and tests',
  solids: 'Solids',
  other: 'Other',
}
export const SHELVES = Object.keys(SHELF_LABEL) as Reagent['shelf'][]

export const REACTION_BY_ID = Object.fromEntries(REACTIONS.map((r) => [r.id, r]))

export function reagentLabel(id: string) {
  return REAGENT_BY_ID[id]?.label ?? id
}

/** One line a teacher can read: what the bench waits for. */
export function describeCheck(c: StepCheck): string {
  switch (c.type) {
    case 'add':
      return `Adds ${reagentLabel(c.reagent)}${c.into ? ` to a ${VESSEL_LABEL[c.into].toLowerCase()}` : ''}`
    case 'reaction':
      return `Sees: ${REACTION_BY_ID[c.reaction]?.name ?? c.reaction}`
    case 'test':
      return `${TEST_LABEL[c.test] ?? c.test}${c.result ? ` → ${resultLabels(c.test)?.[c.result] ?? c.result}` : ''}`
    case 'heat':
      return 'Turns on the heat'
    case 'connect':
      return 'Connects a delivery tube'
    case 'place':
      return `Places a ${(EQUIPMENT_LABEL[c.equipment] ?? c.equipment).toLowerCase()}`
    case 'temp':
      return `Temperature${rangeText(c.above, c.below, ' °C')}`
    case 'ph':
      return `pH${rangeText(c.above, c.below, '')}`
  }
}

function rangeText(above: number | undefined, below: number | undefined, unit: string) {
  if (above != null && below != null) return ` between ${above}${unit} and ${below}${unit}`
  if (above != null) return ` above ${above}${unit}`
  if (below != null) return ` below ${below}${unit}`
  return ''
}

// ---------------------------------------------------------------- builder draft

/** A flat check, so switching type in the editor keeps whatever was typed. */
export interface DraftCheck {
  type: CheckType | ''
  reagent: string
  into: VesselKind | ''
  reaction: string
  test: TestKind | ''
  result: string
  equipment: EquipmentKind | ''
  above: string
  below: string
}

export interface DraftStep {
  key: string
  text: string
  hint: string
  check: DraftCheck
}

export interface DraftQuestion {
  key: string
  q: string
  options: string[]
  answer: number | null
  explain: string
}

export interface ExperimentDraft {
  title: string
  emoji: string
  topic: string
  aim: string
  theory: string
  safety: string
  grades: string
  minutes: number
  equipment: EquipmentKind[]
  reagents: string[]
  steps: DraftStep[]
  questions: DraftQuestion[]
}

let seq = 0
export const newKey = () => `k${Date.now().toString(36)}${(seq++).toString(36)}`

export const EMPTY_CHECK: DraftCheck = {
  type: '',
  reagent: '',
  into: '',
  reaction: '',
  test: '',
  result: '',
  equipment: '',
  above: '',
  below: '',
}

export const newStep = (): DraftStep => ({ key: newKey(), text: '', hint: '', check: { ...EMPTY_CHECK } })
export const newQuestion = (): DraftQuestion => ({ key: newKey(), q: '', options: ['', ''], answer: null, explain: '' })

export function emptyDraft(): ExperimentDraft {
  return {
    title: '',
    emoji: '🧪',
    topic: '',
    aim: '',
    theory: '',
    safety: '',
    grades: '7–10',
    minutes: 10,
    equipment: [],
    reagents: [],
    steps: [newStep()],
    questions: [],
  }
}

function checkToDraft(c: Partial<StepCheck> | undefined): DraftCheck {
  const d: DraftCheck = { ...EMPTY_CHECK }
  if (!c || !c.type) return d
  d.type = c.type
  const any = c as Record<string, unknown>
  if (typeof any.reagent === 'string') d.reagent = any.reagent
  if (typeof any.into === 'string') d.into = any.into as VesselKind
  if (typeof any.reaction === 'string') d.reaction = any.reaction
  if (typeof any.test === 'string') d.test = any.test as TestKind
  if (typeof any.result === 'string') d.result = any.result
  if (typeof any.equipment === 'string') d.equipment = any.equipment as EquipmentKind
  if (typeof any.above === 'number') d.above = String(any.above)
  if (typeof any.below === 'number') d.below = String(any.below)
  return d
}

const str = (v: unknown) => (typeof v === 'string' ? v : '')
const list = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : [])

/**
 * Turns a library experiment, or one saved on an assignment, into an editable
 * draft. The saved one is untyped JSON, so everything is read defensively.
 */
export function draftFrom(source: Partial<Experiment> | Record<string, unknown>): ExperimentDraft {
  const e = JSON.parse(JSON.stringify(source)) as Record<string, unknown>
  const steps = list<Partial<ExperimentStep>>(e.steps).map((s) => ({
    key: newKey(),
    text: str(s?.text),
    hint: str(s?.hint),
    check: checkToDraft(s?.check),
  }))
  const questions = list<Partial<QuizQuestion>>(e.questions).map((q) => {
    const options = list<string>(q?.options).map(str).slice(0, 4)
    while (options.length < 2) options.push('')
    const answer = typeof q?.answer === 'number' && q.answer >= 0 && q.answer < options.length ? q.answer : null
    return { key: newKey(), q: str(q?.q), options, answer, explain: str(q?.explain) }
  })
  return {
    title: str(e.title),
    emoji: str(e.emoji) || '🧪',
    topic: str(e.topic),
    aim: str(e.aim),
    theory: str(e.theory),
    safety: list<string>(e.safety).map(str).join('\n'),
    grades: str(e.grades) || '7–10',
    minutes: typeof e.minutes === 'number' && e.minutes > 0 ? e.minutes : 10,
    equipment: list<EquipmentKind>(e.equipment).filter((k) => k in EQUIPMENT_LABEL),
    reagents: list<string>(e.reagents).filter((id) => id in REAGENT_BY_ID),
    steps: steps.length ? steps : [newStep()],
    questions,
  }
}

const num = (s: string): number | undefined => {
  if (s.trim() === '') return undefined
  const n = Number(s)
  return Number.isFinite(n) ? n : undefined
}

/** The check the lab will run, or null while the teacher hasn't filled it in. */
export function toStepCheck(d: DraftCheck): StepCheck | null {
  switch (d.type) {
    case 'add':
      return d.reagent ? { type: 'add', reagent: d.reagent, ...(d.into ? { into: d.into } : {}) } : null
    case 'reaction':
      return d.reaction ? { type: 'reaction', reaction: d.reaction } : null
    case 'test': {
      if (!d.test) return null
      const splint = d.test.startsWith('splint')
      return { type: 'test', test: d.test, ...(splint && d.result ? { result: d.result } : {}) }
    }
    case 'heat':
      return { type: 'heat' }
    case 'connect':
      return { type: 'connect' }
    case 'place':
      return d.equipment ? { type: 'place', equipment: d.equipment } : null
    case 'temp':
    case 'ph': {
      const above = num(d.above)
      const below = num(d.below)
      if (above == null && below == null) return null
      if (above != null && below != null && above >= below) return null
      return { type: d.type, ...(above != null ? { above } : {}), ...(below != null ? { below } : {}) }
    }
    default:
      return null
  }
}

/** Why a step can't be saved yet, or null when it's fine. */
export function stepProblem(s: DraftStep): string | null {
  if (!s.text.trim()) return 'Write the instruction.'
  const c = s.check
  if (!c.type) return 'Choose how the lab checks this step.'
  if (toStepCheck(c)) return null
  switch (c.type) {
    case 'add':
      return 'Pick the chemical.'
    case 'reaction':
      return 'Pick the reaction.'
    case 'test':
      return 'Pick the test.'
    case 'place':
      return 'Pick the equipment.'
    case 'temp':
    case 'ph': {
      const above = num(c.above)
      const below = num(c.below)
      if (above != null && below != null && above >= below) return '“Above” must be lower than “below”.'
      return 'Give a value to go above or below.'
    }
    default:
      return 'Finish this step.'
  }
}

export function questionProblem(q: DraftQuestion): string | null {
  if (!q.q.trim()) return 'Write the question.'
  const filled = q.options.filter((o) => o.trim())
  if (filled.length < 2) return 'Give at least two options.'
  if (q.options.some((o) => !o.trim())) return 'Fill in or remove the empty option.'
  if (q.answer == null || !q.options[q.answer]?.trim()) return 'Mark the correct option.'
  return null
}

export function draftProblems(d: ExperimentDraft): string[] {
  const out: string[] = []
  if (!d.title.trim()) out.push('Give the experiment a title.')
  if (d.steps.length === 0) out.push('Add at least one step.')
  if (d.steps.length > 30) out.push('Keep it to 30 steps or fewer.')
  d.steps.forEach((s, i) => {
    const p = stepProblem(s)
    if (p) out.push(`Step ${i + 1}: ${p}`)
  })
  d.questions.forEach((q, i) => {
    const p = questionProblem(q)
    if (p) out.push(`Question ${i + 1}: ${p}`)
  })
  return out
}

/** Equipment a check needs on the shelf, so a teacher can't set an impossible step. */
function equipmentFor(c: StepCheck): EquipmentKind[] {
  switch (c.type) {
    case 'place':
      return [c.equipment]
    case 'add':
      return c.into ? [c.into] : []
    case 'heat':
      return ['burner']
    case 'connect':
      return ['delivery']
    case 'test':
      if (c.test.startsWith('splint')) return ['splint']
      if (c.test.startsWith('litmus')) return ['litmus']
      if (c.test === 'flame') return ['loop', 'burner']
      return ['thermometer']
    default:
      return []
  }
}

/** The Experiment-shaped object the server stores. Call only once draftProblems is empty. */
export function toExperiment(d: ExperimentDraft): Experiment {
  const steps: ExperimentStep[] = d.steps.map((s) => {
    const check = toStepCheck(s.check) as StepCheck
    return { text: s.text.trim(), ...(s.hint.trim() ? { hint: s.hint.trim() } : {}), check }
  })
  const equipment = new Set<EquipmentKind>(d.equipment)
  const reagents = new Set<string>(d.reagents)
  for (const s of steps) {
    equipmentFor(s.check).forEach((k) => equipment.add(k))
    if (s.check.type === 'add') reagents.add(s.check.reagent)
  }
  return {
    id: 'custom',
    title: d.title.trim(),
    topic: d.topic.trim() || 'Custom experiment',
    grades: d.grades.trim() || '7–10',
    minutes: d.minutes > 0 ? Math.round(d.minutes) : 10,
    emoji: d.emoji.trim() || '🧪',
    aim: d.aim.trim(),
    theory: d.theory.trim(),
    equipment: EQUIPMENT_KINDS.filter((k) => equipment.has(k)),
    reagents: REAGENTS.filter((r) => reagents.has(r.id)).map((r) => r.id),
    safety: d.safety
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean),
    steps,
    questions: d.questions.map((q) => ({
      q: q.q.trim(),
      options: q.options.map((o) => o.trim()),
      answer: q.answer ?? 0,
      ...(q.explain.trim() ? { explain: q.explain.trim() } : {}),
    })),
  }
}

// ---------------------------------------------------------------- misc

/** `<input type="datetime-local">` value from an ISO / API instant. */
export function toLocalInput(iso: string | null | undefined, parse: (v: string) => Date | null): string {
  if (!iso) return ''
  const d = parse(iso)
  if (!d) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function fromLocalInput(raw: string): string | null {
  if (!raw) return null
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}
