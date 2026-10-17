import { Vector3 } from 'three'

/**
 * Mutable per-frame world state shared between the 3D scene and the HUD.
 * Kept out of React state so frame updates don't trigger re-renders.
 */

export const player = {
  position: new Vector3(),
  eye: new Vector3(),
  forward: new Vector3(0, 0, -1),
  yaw: 0,
  pitch: 0,
  /** Set by the active Player; moves the physics body. */
  teleport: (_x: number, _z: number, _yaw?: number) => {},
  /** Where to put the player once the next scene is ready (e.g. a spot picked on the zoo map). */
  arrival: null as { x: number; z: number; yaw: number } | null,
}

/** Ground height lookup for the current scene; the hillside zoo hub replaces the flat default. */
export const terrain = {
  height: (_x: number, _z: number): number => 0,
}

/** The drivable buggy in the current scene, if there is one. */
export const vehicle = {
  /** Where the driver sits, in world space. */
  seat: new Vector3(),
  heading: 0,
  /** Change in heading during the last frame, so the driver's view turns with the car. */
  turned: 0,
  speed: 0,
}

export type CreatureMode = 'wander' | 'flee' | 'toBait' | 'eating' | 'calm' | 'captured' | 'struggling'

export interface CreatureRuntime {
  uid: number
  creatureId: string
  position: Vector3
  heading: number
  speed: number
  mode: CreatureMode
  modeUntil: number
  target: Vector3
  baitId: number | null
  calmUntil: number
  nextCallAt: number
  lastTrack: Vector3
  /** Legendaries stay near their lair. */
  home: Vector3 | null
}

export const creatures = new Map<number, CreatureRuntime>()

export interface Bait {
  id: number
  position: Vector3
  premium: boolean
  expiresAt: number
}

export const baits = new Map<number, Bait>()

export interface Track {
  x: number
  z: number
  rot: number
  born: number
  size: number
}

export const TRACK_LIFETIME = 90
export const tracks: Track[] = []

export function addTrack(t: Track) {
  tracks.push(t)
  if (tracks.length > 600) tracks.splice(0, tracks.length - 600)
}

export function resetWorld() {
  creatures.clear()
  baits.clear()
  tracks.length = 0
}

let ids = 1
export const nextUid = () => ids++

/** Seconds since page load, shared clock for AI timers. */
export const now = () => performance.now() / 1000
