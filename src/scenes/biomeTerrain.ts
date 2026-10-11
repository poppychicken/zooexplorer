import type { BiomeDef } from '../game/data/biomes'

/**
 * Ground shape and colour for expedition biomes. Flat biomes keep height 0; the Mountain has
 * rolling hills rising to the peaks, and the Sea Coast has dunes, a shoreline and a lagoon.
 */

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/** The lagoon around the Sea Coast legendary's lair. */
export const LAGOON_RADIUS = 24
/** Water surface height for coastal biomes. */
export const WATER_LEVEL = 0

/** Where the player arrives. */
export function arrivalPoint(biome: BiomeDef): [number, number] {
  return [0, biome.halfSize - 10]
}

function flatten(h: number, x: number, z: number, cx: number, cz: number, radius: number, blend: number, target: number) {
  const w = 1 - smoothstep(radius, radius + blend, Math.hypot(x - cx, z - cz))
  return h * (1 - w) + target * w
}

function hills(biome: BiomeDef) {
  const half = biome.halfSize
  const raw = (x: number, z: number) => {
    const n = 0.5 * Math.sin(x * 0.045 + 1.3) * Math.cos(z * 0.05 - 0.7) + 0.3 * Math.sin(x * 0.09 + z * 0.07) + 0.2 * Math.cos(z * 0.13 - x * 0.05)
    // Valley floor in the middle, climbing towards the ring of peaks.
    const edge = smoothstep(half - 35, half + 15, Math.max(Math.abs(x), Math.abs(z))) * 16
    return 3.5 * (n + 1) + edge
  }
  const [sx, sz] = arrivalPoint(biome)
  const [lx, lz] = biome.legendary.lair
  const spawnH = raw(sx, sz)
  const lairH = raw(lx, lz)
  return (x: number, z: number) => {
    let h = raw(x, z)
    h = flatten(h, x, z, sx, sz, 12, 10, spawnH)
    h = flatten(h, x, z, lx, lz, 12, 8, lairH)
    return h
  }
}

function coast(biome: BiomeDef) {
  const half = biome.halfSize
  const [lx, lz] = biome.legendary.lair
  return (x: number, z: number) => {
    const dunes = 0.4 + 0.2 * Math.sin(x * 0.08) * Math.cos(z * 0.06) + 0.1 * Math.sin(z * 0.17 + x * 0.05)
    // The ocean lies beyond the far (north) edge.
    let h = -2.5 + (dunes + 2.5) * smoothstep(-half - 8, -half + 8, z)
    const w = 1 - smoothstep(LAGOON_RADIUS - 6, LAGOON_RADIUS + 4, Math.hypot(x - lx, z - lz))
    h = h * (1 - w) + -0.6 * w
    return h
  }
}

const flat = () => 0
const heightCache = new Map<string, (x: number, z: number) => number>()

/** Ground height function for a biome (stable identity per biome, so it can key memos). */
export function biomeHeight(biome: BiomeDef): (x: number, z: number) => number {
  let fn = heightCache.get(biome.id)
  if (!fn) {
    fn = biome.terrain === 'hills' ? hills(biome) : biome.terrain === 'coast' ? coast(biome) : flat
    heightCache.set(biome.id, fn)
  }
  return fn
}

export function biomeColor(biome: BiomeDef): (x: number, z: number, h: number, jitter: number) => string {
  const ground = biome.ground
  if (biome.terrain === 'hills') {
    return (_x, _z, h, j) => {
      if (h > 13 || (h > 9 && j > 0.6)) return j > 0.5 ? '#f2f5f7' : '#e6ecef'
      if (h > 8.5) return ['#8a8d92', '#9a9ca0', '#7d8086'][Math.floor(j * 3)]
      if (j > 0.94) return '#eef2f4' // snow patch
      return ground[Math.floor(j * ground.length) % ground.length]
    }
  }
  if (biome.terrain === 'coast') {
    const [lx, lz] = biome.legendary.lair
    return (x, z, h, j) => {
      if (h < -0.2) return j > 0.5 ? '#c9b98a' : '#bfae80'
      const nearWater = z < -biome.halfSize + 25 || Math.hypot(x - lx, z - lz) < LAGOON_RADIUS + 12
      if (nearWater || h < 0.32) return j > 0.5 ? '#e3d3a4' : '#ead9ab'
      return ['#8aa060', '#97ab6a', '#7f9757'][Math.floor(j * 3)]
    }
  }
  return (_x, _z, _h, j) => ground[Math.floor(j * ground.length) % ground.length]
}
