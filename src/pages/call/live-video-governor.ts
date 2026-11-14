/**
 * Decides how many live videos a teacher's grid plays, from one reading every few seconds
 * of whether the call is under strain (choppy incoming sound, pictures arriving faster than
 * the device draws them, or the processor under pressure).
 *
 * Down a step after two strained readings in a row; up a step after a minute with none,
 * never above where the device started. At the lowest step, half a minute more of strain
 * says the device needs more help (load-control turns the teacher's effects off) - once.
 *
 * Kept apart from the call so it can be tested on its own.
 */

/** The live-video counts the grid steps between. 16 is the browser's own ceiling. */
export const LEVELS = [4, 6, 9, 12, 15] as const

export const STEP_DOWN_AFTER = 2 // strained readings in a row
export const STEP_UP_AFTER_MS = 60_000 // with no strain
export const GIVE_UP_EFFECTS_AFTER_MS = 30_000 // at the lowest step, still strained

export class LiveVideoGovernor {
  private readonly ceiling: number
  private level: number
  private strainedReadings = 0
  private calmSince: number
  private lowestStrainSince: number | null = null
  private gaveUpEffects = false

  /** `start`: the device's starting count, one of LEVELS. */
  constructor(start: number, now: number) {
    this.ceiling = Math.max(0, LEVELS.indexOf(start as (typeof LEVELS)[number]))
    this.level = this.ceiling
    this.calmSince = now
  }

  get liveVideos(): number {
    return LEVELS[this.level]
  }

  /** One reading. Returns true the one time the device needs its effects turned off. */
  reading(strained: boolean, now: number): boolean {
    if (!strained) {
      this.strainedReadings = 0
      this.lowestStrainSince = null
      if (now - this.calmSince >= STEP_UP_AFTER_MS && this.level < this.ceiling) {
        this.level += 1
        this.calmSince = now
      }
      return false
    }
    this.strainedReadings += 1
    this.calmSince = now
    if (this.strainedReadings >= STEP_DOWN_AFTER && this.level > 0) {
      this.level -= 1
      this.strainedReadings = 0
    }
    if (this.level > 0) return false
    this.lowestStrainSince ??= now
    if (!this.gaveUpEffects && now - this.lowestStrainSince >= GIVE_UP_EFFECTS_AFTER_MS) {
      this.gaveUpEffects = true
      return true
    }
    return false
  }
}
