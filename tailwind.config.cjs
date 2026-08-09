/** @type {import('tailwindcss').Config} */
const withOpacity = (variable) => `hsl(var(${variable}) / <alpha-value>)`

module.exports = {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    container: {
      center: true,
      padding: '1.5rem',
      screens: { '2xl': '1440px' },
    },
    extend: {
      colors: {
        background: withOpacity('--background'),
        foreground: withOpacity('--foreground'),
        surface: withOpacity('--surface'),
        card: withOpacity('--card'),
        'card-foreground': withOpacity('--card-foreground'),
        border: withOpacity('--border'),
        input: withOpacity('--input'),
        ring: withOpacity('--ring'),
        muted: {
          DEFAULT: withOpacity('--muted'),
          foreground: withOpacity('--muted-foreground'),
        },
        primary: {
          DEFAULT: withOpacity('--primary'),
          foreground: withOpacity('--primary-foreground'),
          soft: withOpacity('--primary-soft'),
        },
        accent: {
          DEFAULT: withOpacity('--accent'),
          foreground: withOpacity('--accent-foreground'),
          soft: withOpacity('--accent-soft'),
        },
        success: {
          DEFAULT: withOpacity('--success'),
          foreground: withOpacity('--success-foreground'),
          soft: withOpacity('--success-soft'),
        },
        warning: {
          DEFAULT: withOpacity('--warning'),
          foreground: withOpacity('--warning-foreground'),
          soft: withOpacity('--warning-soft'),
        },
        danger: {
          DEFAULT: withOpacity('--danger'),
          foreground: withOpacity('--danger-foreground'),
          soft: withOpacity('--danger-soft'),
        },
        info: {
          DEFAULT: withOpacity('--info'),
          foreground: withOpacity('--info-foreground'),
          soft: withOpacity('--info-soft'),
        },
        // Playful identity palette. Referenced by name only where a fixed
        // hue is wanted; subject-driven colour goes through the `--tile`
        // custom property instead, so one class works for every subject.
        fun: {
          1: withOpacity('--fun-1'),
          2: withOpacity('--fun-2'),
          3: withOpacity('--fun-3'),
          4: withOpacity('--fun-4'),
          5: withOpacity('--fun-5'),
          6: withOpacity('--fun-6'),
          7: withOpacity('--fun-7'),
          8: withOpacity('--fun-8'),
          9: withOpacity('--fun-9'),
          ink: withOpacity('--fun-ink'),
        },
      },
      spacing: {
        // Control height that sits between h-9 and h-10 — the default field size.
        9.5: '2.375rem',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 4px)',
        sm: 'calc(var(--radius) - 8px)',
        xl: 'calc(var(--radius) + 4px)',
        '2xl': 'calc(var(--radius) + 10px)',
      },
      fontFamily: {
        sans: ['Inter var', 'Inter', 'ui-sans-serif', 'system-ui', 'Segoe UI', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      boxShadow: {
        xs: '0 1px 2px 0 hsl(var(--shadow-color) / 0.05)',
        sm: '0 1px 3px 0 hsl(var(--shadow-color) / 0.08), 0 1px 2px -1px hsl(var(--shadow-color) / 0.06)',
        md: '0 4px 12px -2px hsl(var(--shadow-color) / 0.10), 0 2px 6px -2px hsl(var(--shadow-color) / 0.06)',
        lg: '0 12px 28px -6px hsl(var(--shadow-color) / 0.14), 0 4px 10px -4px hsl(var(--shadow-color) / 0.08)',
        xl: '0 24px 48px -12px hsl(var(--shadow-color) / 0.20)',
        glow: '0 0 0 1px hsl(var(--primary) / 0.18), 0 8px 30px -8px hsl(var(--primary) / 0.45)',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.96)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
        'aurora-drift': {
          '0%, 100%': { transform: 'translate3d(0,0,0) scale(1)' },
          '50%': { transform: 'translate3d(3%, -4%, 0) scale(1.08)' },
        },
        'pulse-ring': {
          '0%': { boxShadow: '0 0 0 0 hsl(var(--primary) / 0.45)' },
          '70%': { boxShadow: '0 0 0 10px hsl(var(--primary) / 0)' },
          '100%': { boxShadow: '0 0 0 0 hsl(var(--primary) / 0)' },
        },
        // Playful surfaces. `confetti-fall` reads --fall-x so each piece
        // drifts a different way without needing its own keyframe.
        'confetti-fall': {
          '0%': { transform: 'translate3d(0,0,0) rotate(0deg)', opacity: '1' },
          '100%': {
            transform: 'translate3d(var(--fall-x, 0), 105vh, 0) rotate(var(--fall-spin, 540deg))',
            opacity: '0',
          },
        },
        'float-slow': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-8px)' },
        },
        'pop-in': {
          '0%': { transform: 'scale(0.7)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        wiggle: {
          '0%, 100%': { transform: 'rotate(-3deg)' },
          '50%': { transform: 'rotate(3deg)' },
        },
        // Scenery. `doodle-drift` composes with the per-doodle rotation set
        // inline, which is why the rotation is repeated in every keyframe.
        'doodle-drift': {
          '0%, 100%': {
            transform: 'translate3d(0,0,0) rotate(var(--doodle-rotate, 0deg))',
          },
          '50%': {
            transform: 'translate3d(6px,-16px,0) rotate(calc(var(--doodle-rotate, 0deg) + 8deg))',
          },
        },
        'bloom-drift': {
          '0%, 100%': { transform: 'translate3d(0,0,0) scale(1)' },
          '50%': { transform: 'translate3d(4%, 6%, 0) scale(1.12)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 200ms ease-out',
        'fade-up': 'fade-up 260ms cubic-bezier(0.22, 1, 0.36, 1)',
        'scale-in': 'scale-in 180ms cubic-bezier(0.22, 1, 0.36, 1)',
        shimmer: 'shimmer 1.6s infinite',
        'aurora-drift': 'aurora-drift 18s ease-in-out infinite',
        'pulse-ring': 'pulse-ring 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'float-slow': 'float-slow 5s ease-in-out infinite',
        'pop-in': 'pop-in 450ms cubic-bezier(0.34, 1.56, 0.64, 1)',
        wiggle: 'wiggle 500ms ease-in-out 2',
        'doodle-drift': 'doodle-drift 8s ease-in-out infinite',
        'bloom-drift': 'bloom-drift 26s ease-in-out infinite',
      },
      transitionTimingFunction: {
        spring: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}
