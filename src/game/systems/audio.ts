import type { Vector3 } from 'three'
import type { CallKind } from '../data/creatures'

/** Procedural WebAudio cues: no sound files needed. */

let ctx: AudioContext | null = null
let master: GainNode | null = null

function audio(): AudioContext | null {
  if (typeof window === 'undefined' || !('AudioContext' in window)) return null
  if (!ctx) {
    ctx = new AudioContext()
    master = ctx.createGain()
    master.gain.value = 0.5
    master.connect(ctx.destination)
  }
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

export function unlockAudio() {
  audio()
}

export function updateListener(pos: Vector3, forward: Vector3) {
  if (!ctx) return
  const l = ctx.listener
  if (l.positionX) {
    l.positionX.value = pos.x
    l.positionY.value = pos.y
    l.positionZ.value = pos.z
    l.forwardX.value = forward.x
    l.forwardY.value = forward.y
    l.forwardZ.value = forward.z
    l.upX.value = 0
    l.upY.value = 1
    l.upZ.value = 0
  }
}

function tone(
  c: AudioContext,
  out: AudioNode,
  { type = 'sine', from, to, start, dur, vol = 0.4 }: { type?: OscillatorType; from: number; to?: number; start: number; dur: number; vol?: number },
) {
  const osc = c.createOscillator()
  const g = c.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(from, start)
  if (to) osc.frequency.exponentialRampToValueAtTime(to, start + dur)
  g.gain.setValueAtTime(0.0001, start)
  g.gain.exponentialRampToValueAtTime(vol, start + Math.min(0.03, dur / 4))
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur)
  osc.connect(g).connect(out)
  osc.start(start)
  osc.stop(start + dur + 0.05)
}

function noise(c: AudioContext, out: AudioNode, { start, dur, freq, q = 1, vol = 0.4 }: { start: number; dur: number; freq: number; q?: number; vol?: number }) {
  const len = Math.ceil(c.sampleRate * dur)
  const buf = c.createBuffer(1, len, c.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
  const src = c.createBufferSource()
  src.buffer = buf
  const filter = c.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.value = freq
  filter.Q.value = q
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, start)
  g.gain.exponentialRampToValueAtTime(vol, start + 0.04)
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur)
  src.connect(filter).connect(g).connect(out)
  src.start(start)
}

const CALLS: Record<CallKind, (c: AudioContext, out: AudioNode, t: number) => void> = {
  yip: (c, o, t) => {
    tone(c, o, { type: 'triangle', from: 900, to: 1500, start: t, dur: 0.12 })
    tone(c, o, { type: 'triangle', from: 950, to: 1600, start: t + 0.18, dur: 0.12 })
  },
  grunt: (c, o, t) => {
    tone(c, o, { type: 'sawtooth', from: 110, to: 80, start: t, dur: 0.25, vol: 0.25 })
    noise(c, o, { start: t, dur: 0.25, freq: 300, vol: 0.2 })
  },
  hoot: (c, o, t) => {
    tone(c, o, { from: 420, to: 380, start: t, dur: 0.35 })
    tone(c, o, { from: 400, to: 360, start: t + 0.5, dur: 0.6 })
  },
  bell: (c, o, t) => {
    tone(c, o, { from: 196, start: t, dur: 2.2, vol: 0.35 })
    tone(c, o, { from: 392, start: t, dur: 1.6, vol: 0.15 })
    tone(c, o, { from: 588, start: t, dur: 1.2, vol: 0.08 })
  },
  chirp: (c, o, t) => {
    for (let i = 0; i < 3; i++) tone(c, o, { type: 'triangle', from: 1800, to: 2400, start: t + i * 0.09, dur: 0.06, vol: 0.25 })
  },
  hiss: (c, o, t) => noise(c, o, { start: t, dur: 0.6, freq: 4000, q: 0.7, vol: 0.25 }),
  rasp: (c, o, t) => {
    for (let i = 0; i < 4; i++) noise(c, o, { start: t + i * 0.07, dur: 0.06, freq: 2000, q: 2, vol: 0.3 })
  },
  chime: (c, o, t) => {
    ;[1046, 1318, 1568, 2093].forEach((f, i) => tone(c, o, { from: f, start: t + i * 0.12, dur: 1.4, vol: 0.12 }))
  },
}

/** A creature call coming from a point in the world. */
export function playCall(kind: CallKind, pos: Vector3, loud = 1) {
  const c = audio()
  if (!c || !master) return
  const panner = new PannerNode(c, {
    panningModel: 'HRTF',
    distanceModel: 'inverse',
    refDistance: 6 * loud,
    maxDistance: 200,
    rolloffFactor: 1.2,
    positionX: pos.x,
    positionY: pos.y + 0.5,
    positionZ: pos.z,
  })
  panner.connect(master)
  CALLS[kind](c, panner, c.currentTime + 0.02)
}

export type UiSound = 'throw' | 'catch' | 'miss' | 'bait' | 'buy' | 'discover' | 'tick'

export function playUi(kind: UiSound) {
  const c = audio()
  if (!c || !master) return
  const t = c.currentTime + 0.01
  const o = master
  switch (kind) {
    case 'throw':
      noise(c, o, { start: t, dur: 0.25, freq: 900, q: 0.5, vol: 0.25 })
      break
    case 'catch':
      ;[523, 659, 784, 1046].forEach((f, i) => tone(c, o, { type: 'triangle', from: f, start: t + i * 0.08, dur: 0.3, vol: 0.25 }))
      break
    case 'miss':
      tone(c, o, { type: 'square', from: 220, to: 110, start: t, dur: 0.3, vol: 0.12 })
      break
    case 'bait':
      noise(c, o, { start: t, dur: 0.15, freq: 500, vol: 0.2 })
      break
    case 'buy':
      tone(c, o, { type: 'triangle', from: 1318, start: t, dur: 0.1, vol: 0.2 })
      tone(c, o, { type: 'triangle', from: 1760, start: t + 0.08, dur: 0.2, vol: 0.2 })
      break
    case 'discover':
      tone(c, o, { from: 660, to: 990, start: t, dur: 0.25, vol: 0.18 })
      break
    case 'tick':
      tone(c, o, { type: 'square', from: 1200, start: t, dur: 0.03, vol: 0.06 })
      break
  }
}
