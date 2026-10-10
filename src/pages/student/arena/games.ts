import type { ArtName } from '@/components/arena/arena-art'

import { arenaPaths } from './arena-paths'

/**
 * The games on the Arena shelf. Quiz Battle is live; the rest are announced
 * so students see what is coming — each becomes playable by giving it a `to`.
 */
export interface GameEntry {
  id: string
  title: string
  genre: string
  blurb: string
  art: ArtName
  /** A second, smaller render tucked behind the hero art. */
  sideArt?: ArtName
  /** Hero characters to show instead of the art: [main, side]. */
  heroes?: [string, string?]
  /** Card colours: [top, bottom]. Identity colours, like a game's box art. */
  colors: [string, string]
  /** Route when playable; absent means coming soon. */
  to?: string
  players: string
  tags: string[]
}

export const GAMES: GameEntry[] = [
  {
    id: 'quiz-battle',
    title: 'Quiz Battle',
    genre: 'Multiplayer',
    blurb: 'Battle classmates, friends or a bot on your own syllabus. Fastest right answer wins.',
    art: 'crossed_swords',
    sideArt: 'brain',
    heroes: ['shade', 'nova'],
    colors: ['#ef4444', '#b91c1c'],
    to: '/student/arena/quiz',
    players: '1–8 players',
    tags: ['Live', 'Ranked', 'Your syllabus'],
  },
  {
    id: 'world-builder',
    title: 'World Builder',
    genre: 'Strategy',
    blurb: 'Grow your own island. Every chapter you master unlocks new buildings.',
    art: 'castle',
    sideArt: 'globe',
    colors: ['#2563eb', '#1e40af'],
    players: 'Solo + class city',
    tags: ['All subjects'],
  },
  {
    id: 'virtual-lab',
    title: 'Virtual Lab',
    genre: 'Science',
    blurb: 'A chemistry lab bench: mix any chemicals, heat, test gases and run the experiments your teacher sets.',
    art: 'microscope',
    sideArt: 'test_tube',
    colors: ['#7c3aed', '#5b21b6'],
    to: '/student/arena/lab',
    players: 'Solo',
    tags: ['Chemistry', 'Experiments'],
  },
  {
    id: 'code-quest',
    title: 'Code Quest',
    genre: 'Coding',
    blurb: 'Program a robot through mazes, then build a bot to fight your classmates’ bots.',
    art: 'robot',
    sideArt: 'laptop',
    colors: ['#0891b2', '#155e75'],
    players: 'Solo + arena',
    tags: ['Logic', 'Python'],
  },
  {
    id: 'engineering',
    title: 'Build It!',
    genre: 'Engineering',
    blurb: 'Design bridges, catapults and rockets on a budget, then watch physics test them.',
    art: 'construction',
    sideArt: 'gear',
    colors: ['#ea580c', '#9a3412'],
    players: 'Solo',
    tags: ['Physics', 'Maths'],
  },
  {
    id: 'evolution',
    title: 'Evolution',
    genre: 'Biology',
    blurb: 'Design a creature and see if it survives ice ages, droughts and predators.',
    art: 'sauropod',
    sideArt: 'dna',
    colors: ['#16a34a', '#166534'],
    players: 'Solo',
    tags: ['Biology'],
  },
  {
    id: 'ai-trainer',
    title: 'Train Your AI',
    genre: 'AI',
    blurb: 'Teach a model to recognise things, then find out where it goes wrong.',
    art: 'brain',
    sideArt: 'bulb',
    colors: ['#db2777', '#9d174d'],
    players: 'Solo',
    tags: ['Data', 'AI'],
  },
]

/** Announced games built around classmates, which online tuition does not have. */
const CLASS_GAMES = new Set(['world-builder', 'code-quest'])

/**
 * The shelf for a programme. Online tuition gets the solo games: Quiz Battle
 * against the bot on the global challenges (no class, so no syllabus and no
 * classmates), and the lab without teacher-set experiments.
 */
export function gamesFor(tuition: boolean): GameEntry[] {
  if (!tuition) return GAMES
  const paths = arenaPaths(true)
  return GAMES.filter((g) => !CLASS_GAMES.has(g.id)).map((g) => {
    if (g.id === 'quiz-battle') {
      return {
        ...g,
        genre: 'Vs bot',
        blurb: 'Take on a bot in a global challenge: general knowledge, science, maths and more. Fastest right answer wins.',
        to: paths.quiz,
        players: '1 player vs bot',
        tags: ['Global challenges', 'XP and coins'],
      }
    }
    if (g.id === 'virtual-lab') {
      return {
        ...g,
        blurb: 'A chemistry lab bench: mix any chemicals, heat, test gases and run guided experiments.',
        to: paths.lab,
      }
    }
    return g
  })
}
