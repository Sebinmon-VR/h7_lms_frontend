import { cn } from '@/lib/cn'

/**
 * Bo, the study owl.
 *
 * Inline SVG rather than an image file so it inherits theme tokens — the same
 * mascot works on light and dark without shipping two assets — and so it costs
 * no extra request on a page a student opens every day.
 *
 * Moods are deliberately few. A mascot that reacts to everything becomes
 * wallpaper; one that only appears at "nothing here yet", "well done" and
 * "something went wrong" still means something when it shows up.
 */
export type MascotMood = 'happy' | 'cheer' | 'sleepy' | 'curious' | 'oops'

const SIZES = {
  sm: 56,
  md: 96,
  lg: 132,
} as const

export function Mascot({
  mood = 'happy',
  size = 'md',
  className,
  float = true,
}: {
  mood?: MascotMood
  size?: keyof typeof SIZES
  className?: string
  float?: boolean
}) {
  const px = SIZES[size]
  const asleep = mood === 'sleepy'

  return (
    <svg
      width={px}
      height={px}
      viewBox="0 0 120 120"
      fill="none"
      role="img"
      aria-label="Bo the study owl"
      className={cn(float && 'float-slow', className)}
    >
      {/* Soft halo, so the mascot reads on any background. */}
      <circle cx="60" cy="62" r="46" fill="hsl(var(--primary) / 0.10)" />

      {/* Body */}
      <path
        d="M60 22c-19 0-33 15-33 34v10c0 19 14 32 33 32s33-13 33-32V56c0-19-14-34-33-34Z"
        fill="hsl(var(--primary))"
      />
      {/* Belly */}
      <path
        d="M60 54c-11 0-19 9-19 20v2c0 11 8 18 19 18s19-7 19-18v-2c0-11-8-20-19-20Z"
        fill="hsl(var(--primary-foreground) / 0.92)"
      />

      {/* Ear tufts */}
      <path d="M33 30c2-7 6-12 10-14 1 6 0 12-3 18Z" fill="hsl(var(--primary))" />
      <path d="M87 30c-2-7-6-12-10-14-1 6 0 12 3 18Z" fill="hsl(var(--primary))" />

      {/* Eyes — big and wide-set, which is most of what makes it read as friendly */}
      <circle cx="46" cy="50" r="14" fill="hsl(var(--card))" />
      <circle cx="74" cy="50" r="14" fill="hsl(var(--card))" />

      {asleep ? (
        <>
          <path
            d="M38 50c4 5 12 5 16 0"
            stroke="hsl(var(--foreground))"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <path
            d="M66 50c4 5 12 5 16 0"
            stroke="hsl(var(--foreground))"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </>
      ) : (
        <>
          {/* Curious looks up-left; the others look straight ahead. */}
          <circle
            cx={mood === 'curious' ? 43 : 46}
            cy={mood === 'curious' ? 47 : 51}
            r="6.5"
            fill="hsl(var(--foreground))"
          />
          <circle
            cx={mood === 'curious' ? 71 : 74}
            cy={mood === 'curious' ? 47 : 51}
            r="6.5"
            fill="hsl(var(--foreground))"
          />
          <circle cx={mood === 'curious' ? 45 : 48} cy={mood === 'curious' ? 45 : 49} r="2.2" fill="white" />
          <circle cx={mood === 'curious' ? 73 : 76} cy={mood === 'curious' ? 45 : 49} r="2.2" fill="white" />
        </>
      )}

      {/* Beak */}
      <path d="M60 60l-6 8h12l-6-8Z" fill="hsl(var(--warning))" />

      {/* Mood mouth */}
      {mood === 'cheer' && (
        <path
          d="M52 74c3 5 13 5 16 0"
          stroke="hsl(var(--foreground) / 0.55)"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      )}
      {mood === 'oops' && (
        <path
          d="M53 78c3-4 11-4 14 0"
          stroke="hsl(var(--foreground) / 0.55)"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      )}

      {/* Feet */}
      <path d="M50 97v6M70 97v6" stroke="hsl(var(--warning))" strokeWidth="4" strokeLinecap="round" />

      {asleep && (
        <>
          <text x="88" y="34" fontSize="13" fill="hsl(var(--muted-foreground))" fontWeight="600">
            z
          </text>
          <text x="96" y="24" fontSize="10" fill="hsl(var(--muted-foreground))" fontWeight="600">
            z
          </text>
        </>
      )}

      {mood === 'cheer' && (
        <>
          <path
            d="M22 40l2.5 5 5.5.8-4 3.9.9 5.5-4.9-2.6-4.9 2.6.9-5.5-4-3.9 5.5-.8L22 40Z"
            fill="hsl(var(--warning))"
          />
          <path
            d="M99 46l2 4 4.4.6-3.2 3.1.7 4.4-3.9-2-3.9 2 .7-4.4-3.2-3.1 4.4-.6 2-4Z"
            fill="hsl(var(--accent))"
          />
        </>
      )}
    </svg>
  )
}
