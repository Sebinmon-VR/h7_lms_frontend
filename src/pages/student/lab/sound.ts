/**
 * Tiny synthesised lab sounds: fizzing, hissing, a boiling rumble, crackles,
 * the hydrogen pop, a relight whoosh and a glass clink. Everything is made
 * from one buffer of noise and a couple of oscillators, so there are no
 * files to load. Silent until the student turns sound on.
 */

export interface SoundLevels {
  fizz: number
  hiss: number
  boil: number
  crackle: number
  pour: number
}

export class LabAudio {
  private ctx: AudioContext | null = null
  private noise: AudioBuffer | null = null
  private loops: Record<'fizz' | 'hiss' | 'boil' | 'pour', GainNode> | null = null
  private master: GainNode | null = null
  enabled = false

  setEnabled(on: boolean) {
    this.enabled = on
    if (on) this.ensure()
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(on ? 0.55 : 0, this.ctx.currentTime, 0.05)
  }

  private ensure() {
    if (this.ctx) {
      void this.ctx.resume()
      return
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return
    const ctx = new Ctor()
    this.ctx = ctx
    const len = ctx.sampleRate * 2
    const buf = ctx.createBuffer(1, len, ctx.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
    this.noise = buf
    const master = ctx.createGain()
    master.gain.value = 0.55
    master.connect(ctx.destination)
    this.master = master

    const loop = (type: BiquadFilterType, freq: number, q: number) => {
      const src = ctx.createBufferSource()
      src.buffer = buf
      src.loop = true
      const f = ctx.createBiquadFilter()
      f.type = type
      f.frequency.value = freq
      f.Q.value = q
      const g = ctx.createGain()
      g.gain.value = 0
      src.connect(f).connect(g).connect(master)
      src.start()
      return g
    }
    this.loops = {
      fizz: loop('bandpass', 5200, 0.7),
      hiss: loop('highpass', 3200, 0.5),
      boil: loop('lowpass', 320, 0.8),
      pour: loop('bandpass', 1400, 0.9),
    }
  }

  update(l: SoundLevels) {
    if (!this.enabled || !this.ctx || !this.loops) return
    const now = this.ctx.currentTime
    // Fizz flutters a little so it sounds like bubbles, not a radio.
    const flutter = 0.75 + Math.random() * 0.5
    this.loops.fizz.gain.setTargetAtTime(Math.min(0.5, l.fizz * 0.35 * flutter), now, 0.06)
    this.loops.hiss.gain.setTargetAtTime(Math.min(0.4, l.hiss * 0.3), now, 0.08)
    this.loops.boil.gain.setTargetAtTime(Math.min(0.6, l.boil * 0.5 * flutter), now, 0.1)
    this.loops.pour.gain.setTargetAtTime(Math.min(0.4, l.pour * 0.3), now, 0.05)
    if (l.crackle > 0 && Math.random() < l.crackle * 0.25) this.burst(0.012 + Math.random() * 0.02, 0.25, 2500)
  }

  private burst(dur: number, vol: number, freq: number) {
    if (!this.ctx || !this.noise || !this.master) return
    const src = this.ctx.createBufferSource()
    src.buffer = this.noise
    const f = this.ctx.createBiquadFilter()
    f.type = 'bandpass'
    f.frequency.value = freq
    const g = this.ctx.createGain()
    const now = this.ctx.currentTime
    g.gain.setValueAtTime(vol, now)
    g.gain.exponentialRampToValueAtTime(0.001, now + dur)
    src.connect(f).connect(g).connect(this.master)
    src.start(now, Math.random() * 1.5, dur + 0.02)
  }

  private tone(from: number, to: number, dur: number, vol: number, type: OscillatorType = 'sine') {
    if (!this.ctx || !this.master) return
    const o = this.ctx.createOscillator()
    o.type = type
    const g = this.ctx.createGain()
    const now = this.ctx.currentTime
    o.frequency.setValueAtTime(from, now)
    o.frequency.exponentialRampToValueAtTime(to, now + dur)
    g.gain.setValueAtTime(vol, now)
    g.gain.exponentialRampToValueAtTime(0.001, now + dur)
    o.connect(g).connect(this.master)
    o.start(now)
    o.stop(now + dur + 0.02)
  }

  pop() {
    if (!this.enabled) return
    this.tone(1100, 140, 0.14, 0.6)
    this.burst(0.08, 0.5, 1800)
  }

  whoosh() {
    if (!this.enabled) return
    this.burst(0.35, 0.3, 900)
  }

  clink() {
    if (!this.enabled) return
    this.tone(2600, 2300, 0.18, 0.12, 'triangle')
    this.tone(3900, 3700, 0.12, 0.05)
  }

  click() {
    if (!this.enabled) return
    this.burst(0.03, 0.3, 4000)
  }
}
