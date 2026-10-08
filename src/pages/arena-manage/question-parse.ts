import type { ArenaQuestion, ArenaQuestionCreate, ArenaQuestionType } from '@/api/arena.types'
import { parseCsvObjects } from '@/lib/csv'

/**
 * The question form's working shape, its validation, and the two bulk formats
 * (pasted text and CSV). Validation mirrors the backend's `QuestionIn` so a
 * question the preview calls ready is one the server will take.
 */

export const OPTION_KEYS = ['A', 'B', 'C', 'D', 'E', 'F'] as const
export const MIN_OPTIONS = 2
export const MAX_OPTIONS = 6
export const MAX_BULK = 500
export const LIMITS = { text: 600, option: 300, explanation: 1000 } as const
/** Below this many active questions a chapter or challenge is not offered for battle. */
export const MIN_BATTLE_QUESTIONS = 3

export type TrueFalse = 'TRUE' | 'FALSE'

export interface QuestionDraft {
  question_type: ArenaQuestionType
  text: string
  /** MCQ option texts in order; their keys are their letters. */
  options: string[]
  correctIndex: number | null
  /** Kept apart from `correctIndex` so flipping the type back and forth loses nothing. */
  tfAnswer: TrueFalse | null
  explanation: string
  difficulty: number
}

export const QUESTION_TYPE_LABEL: Record<ArenaQuestionType, string> = {
  MCQ: 'Multiple choice',
  TRUE_FALSE: 'True–false',
}

const NO_ANSWER_MCQ = 'Choose the correct answer.'
const NO_ANSWER_TF = 'Choose whether the statement is true or false.'

export function emptyDraft(type: ArenaQuestionType = 'MCQ', difficulty = 1): QuestionDraft {
  return {
    question_type: type,
    text: '',
    options: ['', '', '', ''],
    correctIndex: null,
    tfAnswer: null,
    explanation: '',
    difficulty,
  }
}

export function draftFromQuestion(q: ArenaQuestion): QuestionDraft {
  if (q.question_type === 'TRUE_FALSE') {
    return {
      ...emptyDraft('TRUE_FALSE', q.difficulty),
      text: q.text,
      tfAnswer: q.correct_key === 'FALSE' ? 'FALSE' : 'TRUE',
      explanation: q.explanation ?? '',
    }
  }
  const index = q.options.findIndex((o) => o.key === q.correct_key)
  return {
    question_type: 'MCQ',
    text: q.text,
    options: q.options.map((o) => o.text),
    correctIndex: index >= 0 ? index : null,
    tfAnswer: null,
    explanation: q.explanation ?? '',
    difficulty: q.difficulty || 1,
  }
}

export function validateDraft(d: QuestionDraft): string[] {
  const errors: string[] = []
  const text = d.text.trim()
  if (!text) errors.push('Write the question.')
  else if (text.length > LIMITS.text) errors.push(`The question is longer than ${LIMITS.text} characters.`)

  if (d.question_type === 'MCQ') {
    const options = d.options.map((o) => o.trim())
    if (options.length < MIN_OPTIONS || options.length > MAX_OPTIONS) {
      errors.push(`A multiple-choice question needs ${MIN_OPTIONS} to ${MAX_OPTIONS} options.`)
    }
    if (options.some((o) => !o)) errors.push('Fill in every option, or remove the empty one.')
    if (options.some((o) => o.length > LIMITS.option)) {
      errors.push(`An option is longer than ${LIMITS.option} characters.`)
    }
    const filled = options.filter(Boolean).map((o) => o.toLowerCase())
    if (new Set(filled).size !== filled.length) errors.push('Two options have the same text.')
    if (d.correctIndex == null || d.correctIndex < 0 || d.correctIndex >= options.length) {
      errors.push(NO_ANSWER_MCQ)
    }
  } else if (d.tfAnswer == null) {
    errors.push(NO_ANSWER_TF)
  }

  if (d.explanation.trim().length > LIMITS.explanation) {
    errors.push(`The explanation is longer than ${LIMITS.explanation} characters.`)
  }
  if (![1, 2, 3].includes(d.difficulty)) errors.push('Difficulty must be easy, medium or hard.')
  return errors
}

/** The draft as the API takes it, minus where it goes (chapter or category). */
export function draftToPayload(d: QuestionDraft): Omit<ArenaQuestionCreate, 'chapter_id' | 'category'> {
  const explanation = d.explanation.trim() || null
  if (d.question_type === 'TRUE_FALSE') {
    // The server fills in the True/False options itself.
    return {
      question_type: 'TRUE_FALSE',
      text: d.text.trim(),
      correct_key: d.tfAnswer ?? 'TRUE',
      explanation,
      difficulty: d.difficulty,
    }
  }
  return {
    question_type: 'MCQ',
    text: d.text.trim(),
    options: d.options.map((text, i) => ({ key: OPTION_KEYS[i], text: text.trim() })),
    correct_key: OPTION_KEYS[d.correctIndex ?? 0],
    explanation,
    difficulty: d.difficulty,
  }
}

// ------------------------------------------------------------------ bulk

export interface ParsedQuestion {
  /** "Question 3" or "Row 4" — how the preview names it. */
  label: string
  text: string
  draft: QuestionDraft | null
  errors: string[]
}

interface RawQuestion {
  text: string
  options: Array<{ letter: string; text: string; marked: boolean }>
  answer?: string
  explanation?: string
  level?: string
}

function tfWord(value: string): TrueFalse | null {
  const v = value.trim().toLowerCase()
  if (v === 'true') return 'TRUE'
  if (v === 'false') return 'FALSE'
  return null
}

/** Answer lines are looser than option texts: T/F and yes/no count too. */
function tfAnswer(value: string): TrueFalse | null {
  const v = value.trim().toLowerCase()
  if (['true', 't', 'yes'].includes(v)) return 'TRUE'
  if (['false', 'f', 'no'].includes(v)) return 'FALSE'
  return null
}

function parseLevel(value: string): number | null {
  const v = value.trim().toLowerCase()
  if (v === '1' || v === 'easy') return 1
  if (v === '2' || v === 'medium') return 2
  if (v === '3' || v === 'hard') return 3
  return null
}

function clip(value: string, max = 60): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value
}

function buildDraft(raw: RawQuestion, label: string): ParsedQuestion {
  const errors: string[] = []
  let answerHandled = false

  let difficulty = 1
  if (raw.level?.trim()) {
    const level = parseLevel(raw.level)
    if (level == null) errors.push(`Level “${clip(raw.level)}” isn't 1, 2, 3, Easy, Medium or Hard.`)
    else difficulty = level
  }

  const options = raw.options
  const answer = raw.answer?.trim() || ''
  const letters = options.map((o) => o.letter)
  for (const letter of new Set(letters)) {
    if (letters.filter((l) => l === letter).length > 1) errors.push(`Option ${letter} appears twice.`)
  }
  const marked = options.filter((o) => o.marked)
  if (marked.length > 1) {
    errors.push('More than one option is marked with *.')
    answerHandled = true
  }
  const byLetter = (value: string) =>
    /^[A-F]$/i.test(value) ? options.findIndex((o) => o.letter === value.toUpperCase()) : -1

  const isTrueFalse =
    (options.length === 0 && !!answer && tfAnswer(answer) != null) ||
    (options.length === 2 &&
      tfWord(options[0].text) != null &&
      tfWord(options[1].text) != null &&
      tfWord(options[0].text) !== tfWord(options[1].text))

  let draft: QuestionDraft
  if (isTrueFalse) {
    const fromMark = marked.length === 1 ? tfWord(marked[0].text) : null
    let fromAnswer: TrueFalse | null = null
    if (answer) {
      const index = byLetter(answer)
      fromAnswer = index >= 0 ? tfWord(options[index].text) : tfAnswer(answer)
      if (fromAnswer == null) errors.push(`Answer “${clip(answer)}” isn't True or False.`)
    }
    if (fromMark && fromAnswer && fromMark !== fromAnswer) {
      errors.push('The * mark and the Answer line disagree.')
    }
    const result = fromMark ?? fromAnswer
    if (result == null && !answer) {
      errors.push('Mark the correct answer with * or add an “Answer:” line.')
    }
    answerHandled = true
    draft = {
      ...emptyDraft('TRUE_FALSE', difficulty),
      text: raw.text,
      tfAnswer: result,
      explanation: raw.explanation ?? '',
    }
  } else {
    if (options.length === 0) {
      errors.push('No options found. Put each on its own line, like “A) Mumbai”.')
      answerHandled = true
    }
    const markIndex = marked.length === 1 ? options.indexOf(marked[0]) : null
    let answerIndex: number | null = null
    if (answer && options.length > 0) {
      let index = byLetter(answer)
      if (index < 0) index = options.findIndex((o) => o.text.trim().toLowerCase() === answer.toLowerCase())
      if (index < 0) {
        errors.push(`Answer “${clip(answer)}” doesn't match any option.`)
        answerHandled = true
      } else answerIndex = index
    }
    if (markIndex != null && answerIndex != null && markIndex !== answerIndex) {
      errors.push('The * mark and the Answer line disagree.')
    }
    const correctIndex = markIndex ?? answerIndex
    if (correctIndex == null && options.length > 0 && !answerHandled) {
      errors.push('Mark the correct option with * or add an “Answer:” line.')
      answerHandled = true
    }
    draft = {
      question_type: 'MCQ',
      text: raw.text,
      options: options.map((o) => o.text),
      correctIndex,
      tfAnswer: null,
      explanation: raw.explanation ?? '',
      difficulty,
    }
  }

  for (const message of validateDraft(draft)) {
    // The answer has already been explained in this format's own terms.
    if (answerHandled && (message === NO_ANSWER_MCQ || message === NO_ANSWER_TF)) continue
    if (options.length === 0 && !isTrueFalse && message.startsWith('A multiple-choice')) continue
    if (!errors.includes(message)) errors.push(message)
  }

  return { label, text: raw.text.trim(), draft: errors.length ? null : draft, errors }
}

// "Q:", "Q1.", "Question 2:", "1.", "3)"
const QUESTION_PREFIX = /^(?:Q(?:uestion)?\s*\d*\s*[:.)-]|\d+\s*[.)])\s*/i
// "A) text", "A. text", "A: text", "(A) text", "*B) text"
const OPTION_LINE = /^(\*\s*)?\(?([A-F])\s*[).:]\s*(.+)$/i
const ANSWER_LINE = /^(?:answer|ans|correct)\s*[:=-]\s*(.*)$/i
const EXPLAIN_LINE = /^(?:explain|explanation|why)\s*[:=-]\s*(.*)$/i
const LEVEL_LINE = /^(?:level|difficulty)\s*[:=-]\s*(.*)$/i

/** Blocks separated by a blank line; see the format notes in the bulk dialog. */
export function parsePastedQuestions(input: string): ParsedQuestion[] {
  const blocks = input
    .replace(/\r\n?/g, '\n')
    .split(/\n[ \t]*\n/)
    .map((block) => block.split('\n').map((line) => line.trim()).filter(Boolean))
    .filter((lines) => lines.length > 0)

  return blocks.map((lines, i) => {
    const raw: RawQuestion = { text: lines[0].replace(QUESTION_PREFIX, '').trim(), options: [] }
    const lineErrors: string[] = []
    let last: 'text' | 'option' | 'explanation' | 'other' = 'text'

    for (const line of lines.slice(1)) {
      let m: RegExpExecArray | null
      if ((m = ANSWER_LINE.exec(line))) {
        raw.answer = m[1].trim()
        last = 'other'
      } else if ((m = EXPLAIN_LINE.exec(line))) {
        raw.explanation = m[1].trim()
        last = 'explanation'
      } else if ((m = LEVEL_LINE.exec(line))) {
        raw.level = m[1].trim()
        last = 'other'
      } else if ((m = OPTION_LINE.exec(line))) {
        let text = m[3].trim()
        let marked = !!m[1]
        // "B) New Delhi *" works as well as "*B) New Delhi".
        if (/\s\*$/.test(text)) {
          text = text.replace(/\s*\*$/, '')
          marked = true
        }
        raw.options.push({ letter: m[2].toUpperCase(), text, marked })
        last = 'option'
      } else if (last === 'text') {
        // A question that wraps onto a second line.
        raw.text = `${raw.text} ${line}`
      } else if (last === 'explanation') {
        raw.explanation = `${raw.explanation ?? ''} ${line}`.trim()
      } else {
        lineErrors.push(`Couldn't read the line “${clip(line)}”.`)
      }
    }

    const parsed = buildDraft(raw, `Question ${i + 1}`)
    if (lineErrors.length === 0) return parsed
    return { ...parsed, draft: null, errors: [...lineErrors, ...parsed.errors] }
  })
}

export interface CsvParseResult {
  questions: ParsedQuestion[]
  /** Set when the file can't be read as a question sheet at all. */
  error: string | null
}

export function parseCsvQuestions(input: string): CsvParseResult {
  const { headers, rows } = parseCsvObjects(input)
  if (headers.length === 0) return { questions: [], error: 'The file is empty.' }
  if (!headers.includes('question')) {
    return {
      questions: [],
      error: 'The first row must be a header with a “question” column. Download the template to see the layout.',
    }
  }
  const questions = rows.map((row, i) => {
    const options = OPTION_KEYS.map((letter) => {
      const l = letter.toLowerCase()
      return { letter, text: row[`option_${l}`] ?? row[l] ?? '', marked: false }
    }).filter((o) => o.text.trim() !== '')
    return buildDraft(
      {
        text: row.question ?? '',
        options,
        answer: row.answer ?? row.correct ?? row.correct_answer,
        explanation: row.explanation ?? row.explain,
        level: row.difficulty ?? row.level,
      },
      // +2: the header is row 1 and people count from 1.
      `Row ${i + 2}`,
    )
  })
  return { questions, error: null }
}

export const CSV_TEMPLATE = [
  'question,option_a,option_b,option_c,option_d,option_e,option_f,answer,explanation,difficulty',
  'What is the capital of India?,Mumbai,New Delhi,Kolkata,Chennai,,,B,New Delhi has been the capital since 1931.,1',
  'The Sun is a star.,,,,,,,TRUE,,1',
  '"Which of these is a prime number?",21,27,29,33,,,C,"29 has no factors other than 1 and itself.",2',
  'Water boils at 100 °C at sea level.,True,False,,,,,A,,Easy',
].join('\r\n')

export const PASTE_EXAMPLE = `1. What is the capital of India?
A) Mumbai
*B) New Delhi
C) Kolkata
D) Chennai
Explain: New Delhi has been the capital since 1931.
Level: Easy

Q: The Sun is a star.
Answer: True

Which of these is a prime number?
A. 21
B. 27
C. 29
D. 33
Answer: C
Level: 2`
