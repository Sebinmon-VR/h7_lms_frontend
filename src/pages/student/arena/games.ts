import type { ArtName } from '@/components/arena/arena-art'

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
  {
    id: 'alchemy',
    title: 'Element Alchemy',
    genre: 'Chemistry',
    blurb: 'Combine elements to discover compounds and fill your discovery book.',
    art: 'alembic',
    sideArt: 'voltage',
    colors: ['#ca8a04', '#854d0e'],
    players: 'Solo',
    tags: ['Chemistry'],
  },
]
