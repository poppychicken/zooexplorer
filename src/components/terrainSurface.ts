import { BufferAttribute, type BufferGeometry } from 'three'

/**
 * Ground textures made by scripts/generate_assets/textures.py: seamless, hand-painted tiles that
 * the terrain blends per vertex (see TerrainMaterial).
 */
export type GroundTexture = 'grass' | 'forest_floor' | 'dirt' | 'rock' | 'desert_sand' | 'cracked_earth' | 'red_sand' | 'alpine_grass' | 'snow' | 'beach_sand' | 'gravel'

export const MAX_LAYERS = 8

/** Which ground textures a terrain uses, and how much of each goes where. */
export interface TerrainSurface {
  layers: GroundTexture[]
  /** Unnormalised weight of each layer at a point; `slope` is the ground's rise per metre. */
  weights: (x: number, z: number, h: number, slope: number) => number[]
  /** 3D grass clumps growing out of the ground (see GrassField). */
  grass?: GrassSpec
}

export interface GrassSpec {
  /** How much grass grows on each texture, from 0 (none) to 1 (thick). */
  on: Partial<Record<GroundTexture, number>>
  /** Clumps per square metre on fully grassy ground. */
  density: number
  /** Blade colour at the root and at the tip. */
  base: string
  tip: string
  /** Typical clump height in metres. */
  height: number
  /** Spots to keep clear, e.g. enclosure floors. */
  exclude?: (x: number, z: number) => boolean
}

/** How grassy a point is: the surface's layer weights, normalised, times how much grass each layer grows. */
export function grassiness(surface: TerrainSurface, x: number, z: number, h: number, slope: number): number {
  if (!surface.grass) return 0
  const w = surface.weights(x, z, h, slope)
  let sum = 0
  let grass = 0
  surface.layers.forEach((layer, i) => {
    const v = Math.max(0, w[i] ?? 0)
    sum += v
    grass += v * (surface.grass!.on[layer] ?? 0)
  })
  return sum > 0 ? grass / sum : 0
}

/** Smooth, cheap 2D noise in [0, 1] for patchy ground. */
export function patch(x: number, z: number, scale: number, seed = 0): number {
  const a = Math.sin(x * scale + seed * 1.7 + Math.sin(z * scale * 0.7 + seed) * 1.3)
  const b = Math.cos(z * scale * 1.1 - seed * 0.9 + Math.sin(x * scale * 0.6 - seed * 1.1) * 1.5)
  return 0.5 + 0.25 * (a + b)
}

export const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/**
 * How close a point is to the nearest of `points`, from 1 at a point to 0 at `radius` away.
 * Used for leaf litter under trees and rubble around rocks.
 */
export function proximity(points: { x: number; z: number }[], radius: number): (x: number, z: number) => number {
  const cell = radius
  const grid = new Map<string, { x: number; z: number }[]>()
  for (const p of points) {
    const key = `${Math.floor(p.x / cell)},${Math.floor(p.z / cell)}`
    const list = grid.get(key) ?? []
    list.push(p)
    grid.set(key, list)
  }
  return (x, z) => {
    const cx = Math.floor(x / cell)
    const cz = Math.floor(z / cell)
    let best = radius
    for (let i = -1; i <= 1; i++)
      for (let j = -1; j <= 1; j++)
        for (const p of grid.get(`${cx + i},${cz + j}`) ?? []) best = Math.min(best, Math.hypot(p.x - x, p.z - z))
    return 1 - best / radius
  }
}

/**
 * Adds the attributes TerrainMaterial reads to a non-indexed terrain mesh: per-vertex layer
 * weights (splatA/splatB) and a per-facet shade (tint) that keeps the faceted look.
 */
export function applySurface(geo: BufferGeometry, surface: TerrainSurface, height: (x: number, z: number) => number, rng: () => number) {
  const pos = geo.getAttribute('position')
  const a = new Float32Array(pos.count * 4)
  const b = new Float32Array(pos.count * 4)
  const tint = new Float32Array(pos.count)
  const e = 0.75
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const z = pos.getZ(i)
    const slope = Math.hypot(height(x + e, z) - height(x - e, z), height(x, z + e) - height(x, z - e)) / (2 * e)
    const w = surface.weights(x, z, pos.getY(i), slope)
    let sum = 0
    for (let k = 0; k < MAX_LAYERS; k++) sum += Math.max(0, w[k] ?? 0)
    for (let k = 0; k < MAX_LAYERS; k++) {
      const v = sum > 0 ? Math.max(0, w[k] ?? 0) / sum : k === 0 ? 1 : 0
      if (k < 4) a[i * 4 + k] = v
      else b[i * 4 + k - 4] = v
    }
  }
  for (let i = 0; i < pos.count; i += 3) {
    const t = 0.96 + rng() * 0.07
    tint[i] = tint[i + 1] = tint[i + 2] = t
  }
  geo.setAttribute('splatA', new BufferAttribute(a, 4))
  geo.setAttribute('splatB', new BufferAttribute(b, 4))
  geo.setAttribute('tint', new BufferAttribute(tint, 1))
}
