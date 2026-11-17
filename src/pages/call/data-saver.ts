/**
 * Keeps the sound clear on a student's weak connection by pausing videos on their device.
 *
 * Google Meet stays clear on a poor line because it drops pictures before sound; the Azure
 * call keeps downloading every video it shows. Here a student's own device, from one reading
 * every few seconds of whether the sound coming in is breaking up:
 *
 *   level 0 - every video plays, as usual;
 *   level 1 - classmates' cameras pause and only the teacher's plays (after two broken
 *             readings in a row, about 20 seconds);
 *   level 2 - the teacher's camera pauses too (a further minute of broken sound).
 *
 * The sound, a shared screen and the whiteboard are never paused. After a calm spell it
 * steps back one level at a time. A line that keeps breaking again soon after the videos
 * come back gets a longer calm spell each time, so the class is not flicking between the two.
 * The student can bring the videos back by hand; then it leaves them alone for a while.
 *
 * Kept apart from the call so it can be tested on its own.
 */

export type SaverLevel = 0 | 1 | 2

/** Broken readings in a row (one every ~10 s) before classmates' cameras pause. */
export const PAUSE_AFTER = 2
/** Further broken readings in a row, with classmates already paused, before the teacher's camera pauses. */
export const DEEPER_AFTER = 6
/** Calm before stepping back a level; doubles when the line breaks again soon after. */
export const FIRST_CALM_MS = 60_000
export const LONGEST_CALM_MS = 8 * 60_000
/** Breaking again within this long of the videos coming back counts as "soon after". */
const SOON_AFTER_MS = 5 * 60_000
/** After "Show videos", how long the pausing stays off. */
export const MANUAL_HOLD_MS = 10 * 60_000

export class DataSaver {
  level: SaverLevel = 0
  private strained = 0
  private calmSince: number
  private calmNeeded = FIRST_CALM_MS
  private lastBack: number | null = null
  private holdUntil = 0

  constructor(now: number) {
    this.calmSince = now
  }

  /** One reading of the incoming sound. Returns the level to apply. */
  reading(broken: boolean, now: number): SaverLevel {
    if (now < this.holdUntil) return this.level

    if (!broken) {
      this.strained = 0
      if (this.level > 0 && now - this.calmSince >= this.calmNeeded) {
        this.level = (this.level - 1) as SaverLevel
        this.calmSince = now
        if (this.level === 0) this.lastBack = now
      }
      return this.level
    }

    this.strained += 1
    this.calmSince = now
    if (this.level === 0 && this.strained >= PAUSE_AFTER) {
      // Broke again soon after the videos came back: they were the trouble, so wait longer next time.
      this.calmNeeded =
        this.lastBack !== null && now - this.lastBack < SOON_AFTER_MS
          ? Math.min(this.calmNeeded * 2, LONGEST_CALM_MS)
          : FIRST_CALM_MS
      this.level = 1
      this.strained = 0
    } else if (this.level === 1 && this.strained >= DEEPER_AFTER) {
      this.level = 2
      this.strained = 0
    }
    return this.level
  }

  /** The student asked for the videos back: all of them, and no pausing for a while. */
  showVideos(now: number): SaverLevel {
    this.level = 0
    this.strained = 0
    this.calmSince = now
    this.lastBack = now
    this.holdUntil = now + MANUAL_HOLD_MS
    return this.level
  }
}
