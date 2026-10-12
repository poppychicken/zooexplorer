import type { BiomeId } from '../../game/data/creatures'
import { patch, smoothstep, type GroundTexture, type TerrainSurface } from '../../components/terrainSurface'

/**
 * Zoo hub layout, loosely modelled on Taronga Zoo Sydney: a hillside running down to the harbour.
 * North (−z) is the top of the hill with the Main Entrance; the ferry wharf sits on the harbour
 * at the bottom (+z), and the city skyline is across the water to the south-west.
 */

/** Walkable area; walls stop the player at these lines. */
export const BOUNDS = { minX: -60, maxX: 76, minZ: -76, maxZ: 54 }
/** Where land meets the harbour on the west and south. */
const SHORE_X = -62
const SHORE_Z = 56
const HILL_TOP = 14

export interface Precinct {
  id: string
  name: string
  /** One-line flavour shown on the precinct sign. */
  subtitle: string
  center: [number, number]
  /** Biome whose species are exhibited here, or null for a future precinct still under construction. */
  biome: BiomeId | null
  ground: string
}

/** Each expedition biome is exhibited in one precinct; the rest are reserved for future biomes. */
export const PRECINCTS: Precinct[] = [
  { id: 'rainforest-trail', name: 'Rainforest Trail', subtitle: 'Temperate Forest expeditions', center: [36, -2], biome: 'forest', ground: '#3f6a32' },
  { id: 'african-savannah', name: 'African Savannah', subtitle: 'Arid Canyon expeditions · harbour views', center: [-32, 6], biome: 'canyon', ground: '#b9a064' },
  { id: 'nura-diya', name: 'Nura Diya Australia', subtitle: 'Outback Scrub expeditions', center: [-30, -42], biome: 'outback', ground: '#a9643a' },
  { id: 'tiger-trek', name: 'Tiger Trek', subtitle: 'Mountain expeditions · Himalayan highlands', center: [32, -42], biome: 'mountain', ground: '#7d8a74' },
  { id: 'great-southern-oceans', name: 'Great Southern Oceans', subtitle: 'Sea Coast expeditions', center: [26, 38], biome: 'sea', ground: '#cdbf96' },
]

/** Exhibit plots sit in a 2×2 grid around each precinct's central crossroads. */
export const PLOT_SIZE = 12
export const PLOT_OFFSET = 9

export const ENTRANCE: [number, number] = [0, -64]
export const BOOTH: [number, number] = [-3.6, -58]
export const SPAWN: [number, number] = [0, -52]
export const SHOP: [number, number] = [11, -55]
export const WHARF: [number, number] = [-8, 50]
export const BUGGY_PARK: [number, number] = [-9, -50]
export const SKY_SAFARI = { top: [-15, -60] as [number, number], bottom: [-24, 44] as [number, number] }

// --- Footpaths -----------------------------------------------------------

/** Path network: visitors route along it and the terrain is painted with it. */
/** Junctions of the path network. Precinct nodes sit on the crossroads in the middle of each precinct. */
const JUNCTIONS: Record<string, [number, number]> = {
  entrance: ENTRANCE,
  plaza: [0, -50],
  nuraDiya: [-30, -42],
  tigerTrek: [32, -42],
  mid: [0, -14],
  rainforest: [36, -2],
  savannah: [-32, 6],
  lower: [2, 26],
  oceans: [26, 38],
  wharf: [-6, 46],
}

const ROUTES: [string, string][] = [
  ['entrance', 'plaza'],
  ['plaza', 'nuraDiya'],
  ['plaza', 'tigerTrek'],
  ['plaza', 'mid'],
  ['mid', 'rainforest'],
  ['mid', 'savannah'],
  ['mid', 'lower'],
  ['rainforest', 'lower'],
  ['savannah', 'lower'],
  ['lower', 'oceans'],
  ['lower', 'wharf'],
]

/** How far a precinct's walkway arms reach from its crossroads: just past the outer fences. */
const ARM_REACH = 18

/**
 * Exhibit plots fill the four corners of each precinct, so paths must not cut diagonally out
 * of the crossroads. Each route into a precinct leaves along the walkway arm that faces the
 * other end, and only turns towards it once clear of the fences.
 */
function buildNetwork() {
  const nodes: Record<string, [number, number]> = { ...JUNCTIONS }
  const edges: [string, string][] = []
  const precinctNodes = new Set(PRECINCTS.map((p) => Object.keys(JUNCTIONS).find((k) => JUNCTIONS[k][0] === p.center[0] && JUNCTIONS[k][1] === p.center[1])))
  const armOf = (from: string, toward: string) => {
    const [cx, cz] = JUNCTIONS[from]
    const [tx, tz] = JUNCTIONS[toward]
    const dx = tx - cx
    const dz = tz - cz
    const [ax, az] = Math.abs(dx) >= Math.abs(dz) ? [Math.sign(dx), 0] : [0, Math.sign(dz)]
    const name = `${from}:${ax},${az}`
    if (!nodes[name]) {
      nodes[name] = [cx + ax * ARM_REACH, cz + az * ARM_REACH]
      edges.push([from, name])
    }
    return name
  }
  for (const [a, b] of ROUTES) {
    const ea = precinctNodes.has(a) ? armOf(a, b) : a
    const eb = precinctNodes.has(b) ? armOf(b, a) : b
    edges.push([ea, eb])
  }
  return { nodes, edges }
}

const NETWORK = buildNetwork()

/** Path network: visitors route along it and the terrain is painted with it. */
export const NODES: Record<string, [number, number]> = NETWORK.nodes
export const EDGES: [string, string][] = NETWORK.edges

const PATH_WIDTH = 3.2

/** Keep scenery this far from a precinct's centre (terrace plus its slope). */
const PRECINCT_CLEAR = 26

/** Shortest node-to-node route (by distance) through the path network. */
export function route(from: string, to: string): [number, number][] {
  const dist: Record<string, number> = {}
  const prev: Record<string, string | null> = {}
  const open = new Set(Object.keys(NODES))
  for (const k of open) dist[k] = Infinity
  dist[from] = 0
  prev[from] = null
  while (open.size) {
    let u = ''
    for (const k of open) if (!u || dist[k] < dist[u]) u = k
    open.delete(u)
    if (u === to) break
    for (const [a, b] of EDGES) {
      const v = a === u ? b : b === u ? a : null
      if (!v || !open.has(v)) continue
      const d = dist[u] + Math.hypot(NODES[u][0] - NODES[v][0], NODES[u][1] - NODES[v][1])
      if (d < dist[v]) {
        dist[v] = d
        prev[v] = u
      }
    }
  }
  const out: [number, number][] = []
  for (let k: string | null = to; k; k = prev[k] ?? null) out.unshift(NODES[k])
  return out
}

function distToSegment(px: number, pz: number, a: [number, number], b: [number, number]): number {
  const dx = b[0] - a[0]
  const dz = b[1] - a[1]
  const t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (pz - a[1]) * dz) / (dx * dx + dz * dz)))
  return Math.hypot(px - (a[0] + t * dx), pz - (a[1] + t * dz))
}

/** Distance from the edge of the nearest path (negative on the path). */
function pathEdgeDistance(x: number, z: number): number {
  let best = Infinity
  for (const [a, b] of EDGES) best = Math.min(best, distToSegment(x, z, NODES[a], NODES[b]))
  return best - PATH_WIDTH / 2
}

export function onPath(x: number, z: number, margin = 0): boolean {
  for (const [a, b] of EDGES) if (distToSegment(x, z, NODES[a], NODES[b]) < PATH_WIDTH / 2 + margin) return true
  return false
}

// --- Terrain -------------------------------------------------------------


/** The bare hillside: high in the north, falling to the harbour in the south and the west. */
function hillside(x: number, z: number): number {
  const slope = HILL_TOP * (1 - smoothstep(-70, SHORE_Z, z))
  const gentle = Math.sin(x * 0.07) * 0.6 + Math.cos(z * 0.09 + x * 0.03) * 0.5
  const land = slope + gentle
  // Harbour cliffs: drop to below the waterline past the shore.
  const shoreDist = Math.min(x - SHORE_X, SHORE_Z - z)
  if (shoreDist <= 0) return -2.5
  return land * smoothstep(0, 10, shoreDist) + -2.5 * (1 - smoothstep(0, 10, shoreDist))
}

interface Pad {
  x: number
  z: number
  radius: number
  blend: number
  height: number
}

/** Round flat spots for plazas, the shop and the wharf. */
const PADS: Pad[] = [
  { x: 0, z: -56, radius: 12, blend: 16, height: hillside(0, -56) },
  { x: SHOP[0], z: SHOP[1], radius: 4, blend: 4, height: hillside(0, -56) },
  { x: WHARF[0], z: WHARF[1] - 2, radius: 6, blend: 6, height: 0.6 },
]

/**
 * Square terraces under the precincts, matching the 2×2 grid of plots so every fence, corners
 * included, stands on level ground, with a short slope down to the hillside around each.
 */
const TERRACE_HALF = PLOT_OFFSET + PLOT_SIZE / 2 + 1.5
// Must not exceed the gap between neighbouring terraces (7 m), so each stays exactly level.
const TERRACE_BLEND = 7
const TERRACES = PRECINCTS.map((p) => ({ x: p.center[0], z: p.center[1], height: hillside(p.center[0], p.center[1]) }))

export function padHeight(x: number, z: number): number {
  for (const t of TERRACES) if (Math.max(Math.abs(x - t.x), Math.abs(z - t.z)) <= TERRACE_HALF) return t.height
  for (const p of PADS) if (Math.hypot(x - p.x, z - p.z) <= p.radius) return p.height
  return hubHeight(x, z)
}

/** Ground height of the zoo hub at (x, z). */
export function hubHeight(x: number, z: number): number {
  let h = hillside(x, z)
  for (const p of PADS) {
    const d = Math.hypot(x - p.x, z - p.z)
    const w = 1 - smoothstep(p.radius, p.radius + p.blend, d)
    if (w > 0) h = h * (1 - w) + p.height * w
  }
  // Blend smoothly between overlapping terrace slopes; inside a terrace only its own weight is non-zero.
  let total = 0
  let weighted = 0
  let strongest = 0
  for (const t of TERRACES) {
    const w = 1 - smoothstep(TERRACE_HALF, TERRACE_HALF + TERRACE_BLEND, Math.max(Math.abs(x - t.x), Math.abs(z - t.z)))
    if (w <= 0) continue
    total += w
    weighted += w * t.height
    strongest = Math.max(strongest, w)
  }
  return total > 0 ? h * (1 - strongest) + (weighted / total) * strongest : h
}

export function precinctHeight(p: Precinct): number {
  return padHeight(p.center[0], p.center[1])
}

/** Ground colour: footpaths, precinct ground, sandy shore and bushland elsewhere. */
export function hubColor(x: number, z: number, h: number, jitter: number): string {
  if (h < -0.2) return '#6b6650'
  if (onPath(x, z)) return jitter > 0.5 ? '#cdb894' : '#c6b08a'
  for (const p of PRECINCTS) {
    if (Math.abs(x - p.center[0]) < 3 || Math.abs(z - p.center[1]) < 3) {
      if (Math.hypot(x - p.center[0], z - p.center[1]) < 16) return jitter > 0.5 ? '#d2be98' : '#cab48c'
    }
    if (Math.max(Math.abs(x - p.center[0]), Math.abs(z - p.center[1])) < 16) return p.ground
  }
  if (Math.hypot(x, z + 56) < 12) return jitter > 0.5 ? '#d8c6a2' : '#d0bd98'
  if (h < 0.8) return '#d9c79c'
  const greens = ['#5e8a42', '#679449', '#557f3c', '#6f9c4f']
  return greens[Math.floor(jitter * greens.length) % greens.length]
}

/** Each precinct's ground echoes its biome. */
const PRECINCT_GROUND: Record<BiomeId, GroundTexture> = {
  forest: 'forest_floor',
  canyon: 'desert_sand',
  outback: 'red_sand',
  mountain: 'alpine_grass',
  sea: 'beach_sand',
}

const HUB_LAYERS: GroundTexture[] = ['grass', 'gravel', 'forest_floor', 'desert_sand', 'red_sand', 'alpine_grass', 'beach_sand', 'dirt']

/** Ground textures for the zoo: gravel paths and plazas, precinct grounds, sand at the shore, grass elsewhere. */
export const HUB_SURFACE: TerrainSurface = {
  layers: HUB_LAYERS,
  grass: {
    on: { grass: 1, alpine_grass: 0.8, forest_floor: 0.3, desert_sand: 0.08, red_sand: 0.1, beach_sand: 0.03 },
    density: 4.5,
    base: '#4a6a2a',
    tip: '#9cbc55',
    height: 0.36,
    // Enclosures have their own floors, and the entrance plaza is paved.
    exclude: (x, z) => PRECINCTS.some((p) => Math.max(Math.abs(x - p.center[0]), Math.abs(z - p.center[1])) < 17) || Math.hypot(x, z + 56) < 13,
  },
  weights: (x, z, h) => {
    const w = new Array<number>(HUB_LAYERS.length).fill(0)
    const add = (t: GroundTexture, v: number) => (w[HUB_LAYERS.indexOf(t)] += v)
    if (h < -0.2) {
      add('dirt', 1)
      return w
    }
    const path = smoothstep(0.8, -0.2, pathEdgeDistance(x, z))
    add('gravel', path * 3)
    let inPrecinct = 0
    for (const p of PRECINCTS) {
      const d = Math.max(Math.abs(x - p.center[0]), Math.abs(z - p.center[1]))
      const inside = smoothstep(17, 15, d)
      if (!inside) continue
      inPrecinct = Math.max(inPrecinct, inside)
      const plaza = (Math.abs(x - p.center[0]) < 3 || Math.abs(z - p.center[1]) < 3) && Math.hypot(x - p.center[0], z - p.center[1]) < 16
      if (plaza) add('gravel', inside * 2)
      else if (p.biome) add(PRECINCT_GROUND[p.biome], inside * 2)
      else add('dirt', inside * 2)
    }
    add('gravel', smoothstep(13, 11, Math.hypot(x, z + 56)) * 3)
    const open = 1 - inPrecinct
    const shore = smoothstep(1.1, 0.6, h)
    add('beach_sand', shore * 2 * open)
    add('grass', open * (1 - shore) * (0.7 + patch(x, z, 0.05, 2)))
    add('forest_floor', open * (1 - shore) * smoothstep(0.62, 0.78, patch(x, z, 0.04, 8)))
    add('dirt', open * smoothstep(0.75, 0.88, patch(x, z, 0.07, 3)) * 0.8)
    return w
  },
}

/** Is this spot free for scattering bushland trees? */
export function isOpenGround(x: number, z: number): boolean {
  if (x < BOUNDS.minX + 1 || x > BOUNDS.maxX - 1 || z < BOUNDS.minZ + 1 || z > BOUNDS.maxZ - 1) return false
  if (onPath(x, z, 2.5)) return false
  for (const p of PRECINCTS) if (Math.max(Math.abs(x - p.center[0]), Math.abs(z - p.center[1])) < PRECINCT_CLEAR) return false
  if (Math.hypot(x, z + 56) < 15) return false
  if (Math.hypot(x - SHOP[0], z - SHOP[1]) < 7) return false
  if (Math.hypot(x - WHARF[0], z - WHARF[1]) < 10) return false
  if (Math.hypot(x - BUGGY_PARK[0], z - BUGGY_PARK[1]) < 6) return false
  // Keep the Sky Safari line clear of trees.
  if (distToSegment(x, z, SKY_SAFARI.top, SKY_SAFARI.bottom) < 4) return false
  return true
}
