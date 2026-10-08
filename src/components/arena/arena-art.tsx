import { cn } from '@/lib/cn'

/** Fluent 3D emoji renders, bundled under /public/arena/3d (MIT, see LICENSE there). */
export type ArtName =
  | 'owl' | 'fox' | 'panda' | 'frog' | 'penguin' | 'koala' | 'tiger' | 'octopus' | 'robot' | 'lion'
  | 'alien' | 'unicorn' | 'trex' | 'mage' | 'dragon' | 'eagle' | 'chick' | 'mech_arm'
  | 'crossed_swords' | 'brain' | 'microscope' | 'test_tube' | 'alembic' | 'laptop' | 'dna' | 'gear'
  | 'sauropod' | 'castle' | 'construction' | 'globe' | 'rocket' | 'bulb' | 'voltage' | 'joystick'
  | 'video_game' | 'trophy' | 'crown' | 'coin' | 'gem' | 'fire' | 'star' | 'lock' | 'gift'
  | 'medal_1' | 'medal_2' | 'medal_3'
  | 'student' | 'technologist' | 'artist' | 'scientist' | 'detective' | 'pilot' | 'firefighter' | 'guard'
  | 'ninja' | 'astronaut' | 'elf' | 'fairy' | 'prince' | 'princess' | 'zombie' | 'superhero' | 'vampire'
  | 'genie' | 'troll' | 'supervillain'

export function artUrl(name: ArtName): string {
  return `/arena/3d/${name}.png`
}

/** The 3D render for an avatar emoji (avatars and bots arrive as emoji from the API). */
const EMOJI_ART: Record<string, ArtName> = {
  '🦉': 'owl', '🦊': 'fox', '🐼': 'panda', '🐸': 'frog', '🐧': 'penguin', '🐨': 'koala',
  '🐯': 'tiger', '🐙': 'octopus', '🤖': 'robot', '🦁': 'lion', '👽': 'alien', '🦄': 'unicorn',
  '🦖': 'trex', '🧙': 'mage', '🐉': 'dragon', '🦅': 'eagle', '🐣': 'chick', '🦾': 'mech_arm',
  '🧑‍🎓': 'student', '🧑‍💻': 'technologist', '🧑‍🎨': 'artist', '🧑‍🔬': 'scientist',
  '🕵️': 'detective', '🕵': 'detective', '🧑‍✈️': 'pilot', '🧑‍✈': 'pilot',
  '🧑‍🚒': 'firefighter', '💂': 'guard', '🥷': 'ninja', '🧑‍🚀': 'astronaut', '🧝': 'elf',
  '🧚': 'fairy', '🤴': 'prince', '👸': 'princess', '🧟': 'zombie', '🦸': 'superhero', '🧛': 'vampire',
  '🧞': 'genie', '🧌': 'troll', '🦹': 'supervillain',
}

export function artForEmoji(emoji: string | null | undefined): ArtName | null {
  return (emoji && EMOJI_ART[emoji]) || null
}

export function Art3D({
  name,
  emoji,
  alt = '',
  className,
  float,
}: {
  name?: ArtName | null
  /** Fallback when there is no render for this emoji. */
  emoji?: string | null
  alt?: string
  className?: string
  /** Gentle idle bob. */
  float?: boolean
}) {
  const art = name ?? artForEmoji(emoji)
  if (!art) {
    return (
      <span
        className={cn('inline-flex items-center justify-center leading-none', className)}
        role={alt ? 'img' : undefined}
        aria-label={alt || undefined}
        aria-hidden={alt ? undefined : true}
      >
        {emoji ?? '❔'}
      </span>
    )
  }
  return (
    <img
      src={artUrl(art)}
      alt={alt}
      draggable={false}
      loading="lazy"
      className={cn(
        'pointer-events-none select-none object-contain drop-shadow-[0_10px_14px_rgba(0,0,0,0.28)]',
        float && 'motion-safe:animate-float-slow',
        className,
      )}
    />
  )
}

/** A hero's art: the full figure or the head, bundled under /public/arena/heroes. */
export function heroUrl(character: string, variant: 'full' | 'head' = 'full'): string {
  return `/arena/heroes/${character}-${variant}.webp`
}

/**
 * Draws a player's avatar item: the hero image when it is a hero, the older
 * emoji render otherwise. `variant` picks the full figure or the head crop.
 */
export function HeroArt({
  avatar,
  variant = 'full',
  className,
  float,
  alt = '',
}: {
  avatar?: { character?: string | null; emoji?: string | null } | null
  variant?: 'full' | 'head'
  className?: string
  float?: boolean
  alt?: string
}) {
  if (avatar?.character) {
    return (
      <img
        src={heroUrl(avatar.character, variant)}
        alt={alt}
        draggable={false}
        loading="lazy"
        className={cn(
          'pointer-events-none select-none object-contain drop-shadow-[0_12px_16px_rgba(0,0,0,0.22)]',
          float && 'motion-safe:animate-float-slow',
          className,
        )}
      />
    )
  }
  return <Art3D emoji={avatar?.emoji ?? '🦉'} className={className} float={float} alt={alt} />
}
