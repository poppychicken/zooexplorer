import type { KeyboardEvent, ReactNode } from 'react'
import { BIOME_BY_ID } from '../game/data/biomes'
import type { BiomeId } from '../game/data/creatures'
import { SHOP_ITEM_BY_ID } from '../game/data/shop'
import { useGame, useSession } from '../game/state/store'
import { mulberry32 } from '../game/systems/rng'

export type Destination = 'hub' | BiomeId

interface Region {
  id: Destination
  /** Centre of the region on the map. */
  at: [number, number]
  /** Half-width and half-height of its blob. */
  size: [number, number]
  fill: string
  icon: ReactNode
}

const W = 520
const H = 280

/** A wobbly closed outline, so regions look hand-drawn rather than like ovals. */
function blob([cx, cy]: [number, number], [rx, ry]: [number, number], seed: number): string {
  const rng = mulberry32(seed)
  const n = 9
  const pts = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2
    const k = 0.82 + rng() * 0.3
    return [cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k] as const
  })
  // Catmull-Rom through the points, as cubic Béziers.
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n]
    const p1 = pts[i]
    const p2 = pts[(i + 1) % n]
    const p3 = pts[(i + 2) % n]
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`
  }
  return d + 'Z'
}

const pine = (x: number, y: number, s = 1) => (
  <g key={`p${x},${y}`} transform={`translate(${x} ${y}) scale(${s})`}>
    <rect x={-1.2} y={0} width={2.4} height={5} fill="#5b3d26" />
    <path d="M0,-14 L7,0 L-7,0Z" fill="#2f5d34" />
    <path d="M0,-19 L5,-8 L-5,-8Z" fill="#3f7a45" />
  </g>
)
const mesa = (x: number, y: number, s = 1) => (
  <path key={`m${x},${y}`} transform={`translate(${x} ${y}) scale(${s})`} d="M-14,0 L-10,-12 L10,-12 L14,0Z" fill="#a8582f" stroke="#7a3a1c" strokeWidth={0.8} />
)
const gum = (x: number, y: number, s = 1) => (
  <g key={`g${x},${y}`} transform={`translate(${x} ${y}) scale(${s})`}>
    <path d="M0,0 L-1,-11 M-1,-8 L4,-13" stroke="#e8e2d4" strokeWidth={2} />
    <ellipse cx={-1} cy={-14} rx={8} ry={4} fill="#7d8f5a" />
  </g>
)
const peak = (x: number, y: number, s = 1) => (
  <g key={`k${x},${y}`} transform={`translate(${x} ${y}) scale(${s})`}>
    <path d="M-16,0 L0,-24 L16,0Z" fill="#7d8088" />
    <path d="M-5.5,-16 L0,-24 L5.5,-16 L2,-14 L-1,-17Z" fill="#f2f5f7" />
  </g>
)
const wave = (x: number, y: number) => <path key={`w${x},${y}`} d={`M${x - 10},${y} q5,-5 10,0 t10,0`} stroke="#e6f3ff" strokeWidth={1.6} fill="none" opacity={0.85} />

const REGIONS: Region[] = [
  { id: 'forest', at: [100, 82], size: [82, 52], fill: '#5a8742', icon: [pine(-30, 6), pine(-8, -2, 1.2), pine(16, 8), pine(36, -2, 0.9)] },
  { id: 'canyon', at: [262, 70], size: [76, 46], fill: '#d39a62', icon: [mesa(-22, 4), mesa(10, -4, 1.3), mesa(34, 8, 0.8)] },
  { id: 'mountain', at: [428, 78], size: [74, 54], fill: '#9aa58a', icon: [peak(-22, 10), peak(4, 2, 1.35), peak(30, 12, 0.9)] },
  { id: 'outback', at: [290, 182], size: [84, 50], fill: '#c8693c', icon: [gum(-30, 6), gum(4, 0, 1.2), gum(34, 8, 0.9)] },
  { id: 'sea', at: [448, 214], size: [62, 48], fill: '#4f8fbf', icon: [wave(-14, -4), wave(12, 6), wave(-6, 16)] },
  {
    id: 'hub',
    at: [104, 212],
    size: [70, 46],
    fill: '#79a35a',
    icon: (
      <g>
        <rect x={-14} y={-8} width={28} height={14} fill="#e7d3a6" stroke="#5a3c24" strokeWidth={0.8} />
        <path d="M-17,-8 L0,-20 L17,-8Z" fill="#b35a3a" />
        <path d="M-6,6 L-6,-2 Q0,-8 6,-2 L6,6" fill="#5a3c24" />
      </g>
    ),
  },
]

const HUB = REGIONS.find((r) => r.id === 'hub')!

/**
 * A map of the expedition regions around the zoo. Click a region to travel straight there; locked
 * regions show the gear they need.
 */
export function RegionMap({ onTravel }: { onTravel: (to: Destination) => void }) {
  const owned = useGame((s) => s.owned)
  const captured = useGame((s) => s.captured)
  const location = useSession((s) => s.location)
  const here: Destination = location.kind === 'hub' ? 'hub' : location.biome

  return (
    <svg className="region-map" viewBox={`0 0 ${W} ${H}`} role="group" aria-label="Map of expedition regions">
      <defs>
        <pattern id="map-paper" width="6" height="6" patternUnits="userSpaceOnUse">
          <rect width="6" height="6" fill="#e8dcb8" />
          <circle cx="1" cy="1" r="0.6" fill="#d8c99e" />
        </pattern>
        <filter id="map-locked">
          <feColorMatrix type="saturate" values="0.15" />
        </filter>
      </defs>
      {/* Land and the harbour that the zoo's ferry sails from. */}
      <rect width={W} height={H} rx={10} fill="#8fc0dc" />
      <path d={blob([250, 130], [250, 130], 3)} fill="url(#map-paper)" stroke="#b9a676" strokeWidth={1.5} />
      {/* Ferry routes from the wharf. */}
      {REGIONS.filter((r) => r.id !== 'hub').map((r) => {
        const [x0, y0] = [HUB.at[0] + 30, HUB.at[1] - 10]
        const [x1, y1] = r.at
        const mx = (x0 + x1) / 2
        const my = (y0 + y1) / 2 - 24
        return <path key={`route-${r.id}`} d={`M${x0},${y0} Q${mx},${my} ${x1},${y1}`} className="map-route" />
      })}
      {REGIONS.map((r, i) => {
        const biome = r.id === 'hub' ? null : BIOME_BY_ID[r.id]
        const locked = !!biome?.requires && !owned[biome.requires]
        const species = biome ? biome.spawns.map((s) => s.creatureId).concat(biome.legendary.creatureId) : []
        const got = species.filter((id) => captured[id]).length
        const name = biome ? biome.name : 'Your Zoo'
        const detail = locked ? `Needs ${SHOP_ITEM_BY_ID[biome!.requires!].name}` : biome ? `${got}/${species.length} species` : 'Home'
        const go = () => !locked && r.id !== here && onTravel(r.id)
        const key = (e: KeyboardEvent) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), go())
        return (
          <g
            key={r.id}
            className={`map-region${locked ? ' locked' : ''}${r.id === here ? ' here' : ''}`}
            role="button"
            tabIndex={locked ? -1 : 0}
            aria-disabled={locked || r.id === here}
            aria-label={`${name}: ${r.id === here ? 'you are here' : detail}`}
            onClick={go}
            onKeyDown={key}
          >
            <title>{locked ? `${name}: ${detail}` : r.id === here ? `${name}: you are here` : `Travel to ${name}`}</title>
            <g filter={locked ? 'url(#map-locked)' : undefined}>
              <path className="map-blob" d={blob(r.at, r.size, i * 11 + 5)} fill={r.fill} />
              <g transform={`translate(${r.at[0]} ${r.at[1] - 8})`}>{r.icon}</g>
            </g>
            <text x={r.at[0]} y={r.at[1] + r.size[1] * 0.45} className="map-label">
              {name}
            </text>
            <text x={r.at[0]} y={r.at[1] + r.size[1] * 0.45 + 13} className={`map-detail${locked ? ' req' : ''}`}>
              {locked ? `🔒 ${detail}` : detail}
            </text>
            {r.id === here && (
              <g className="map-pin" transform={`translate(${r.at[0] + r.size[0] * 0.55} ${r.at[1] - r.size[1] * 0.55})`}>
                <path d="M0,0 C-8,-9 -8,-20 0,-20 C8,-20 8,-9 0,0Z" fill="#e2483a" stroke="#fff" strokeWidth={1.5} />
                <circle cx={0} cy={-13} r={3} fill="#fff" />
              </g>
            )}
          </g>
        )
      })}
      <text x={W / 2 - 40} y={H - 9} className="map-compass">
        Click a region to travel
      </text>
    </svg>
  )
}

/** Every destination on the map, in map order. */
export const MAP_DESTINATIONS: Destination[] = REGIONS.map((r) => r.id)
