import { useState, type KeyboardEvent, type ReactNode } from 'react'
import { BIOME_BY_ID } from '../../game/data/biomes'
import type { BiomeId } from '../../game/data/creatures'
import { SHOP_ITEM_BY_ID } from '../../game/data/shop'
import { useGame, useSession } from '../../game/state/store'
import { mulberry32 } from '../../game/systems/rng'
import type { Destination } from './travel'

const W = 640
const H = 420
/** End of the zoo's ferry wharf, where every route starts. */
const WHARF: [number, number] = [322, 334]

interface Island {
  id: BiomeId
  at: [number, number]
  size: [number, number]
  /** Land colours: light and dark ends of the fill gradient. */
  land: [string, string]
  seed: number
  art: ReactNode
}

/** A smooth, irregular closed outline through `n` jittered points. */
export function blob([cx, cy]: [number, number], [rx, ry]: [number, number], seed: number, n = 12, jitter = 0.28): string {
  const rng = mulberry32(seed)
  const pts = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2
    const k = 1 - jitter / 2 + rng() * jitter
    return [cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k] as const
  })
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n]
    const p1 = pts[i]
    const p2 = pts[(i + 1) % n]
    const p3 = pts[(i + 2) % n]
    d += ` C${(p1[0] + (p2[0] - p0[0]) / 6).toFixed(1)},${(p1[1] + (p2[1] - p0[1]) / 6).toFixed(1)} ${(p2[0] - (p3[0] - p1[0]) / 6).toFixed(1)},${(p2[1] - (p3[1] - p1[1]) / 6).toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`
  }
  return d + 'Z'
}

// --- Little illustrations, drawn around (0, 0) ------------------------------

const Pine = ({ x, y, s = 1, tone = 0 }: { x: number; y: number; s?: number; tone?: number }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`}>
    <ellipse cx={1.5} cy={1} rx={6} ry={1.8} fill="rgba(0,0,0,0.22)" />
    <rect x={-1} y={-3} width={2} height={4} fill="#5b3d26" />
    <path d="M0,-20 L7.5,-3 L-7.5,-3Z" fill={tone ? '#2b5530' : '#2f5d34'} />
    <path d="M0,-25 L5.5,-11 L-5.5,-11Z" fill={tone ? '#3a7240' : '#3f7a45'} />
    <path d="M0,-25 L5.5,-11 L0,-12Z" fill="rgba(0,0,0,0.15)" />
  </g>
)
const Oak = ({ x, y, s = 1 }: { x: number; y: number; s?: number }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`}>
    <ellipse cx={2} cy={1} rx={7} ry={2} fill="rgba(0,0,0,0.22)" />
    <rect x={-1.2} y={-6} width={2.4} height={7} fill="#6a4a30" />
    <circle cx={0} cy={-11} r={7} fill="#4f8a3c" />
    <circle cx={-3} cy={-13} r={3.5} fill="#64a04b" />
    <circle cx={3.5} cy={-9} r={4} fill="#447a34" />
  </g>
)
const Mesa = ({ x, y, s = 1 }: { x: number; y: number; s?: number }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`}>
    <ellipse cx={3} cy={1} rx={18} ry={3} fill="rgba(60,20,0,0.25)" />
    <path d="M-16,0 L-12,-15 L12,-15 L16,0Z" fill="#b5643a" />
    <path d="M4,-15 L12,-15 L16,0 L7,0Z" fill="#8f4826" />
    <path d="M-13.5,-9 L14,-9 M-14.7,-4.5 L15,-4.5" stroke="#c97a4f" strokeWidth={1.2} />
    <path d="M-12,-15 L12,-15 L11,-17 L-11,-17Z" fill="#d48a5c" />
  </g>
)
const Cactus = ({ x, y }: { x: number; y: number }) => (
  <g transform={`translate(${x} ${y})`} stroke="#3f7a3a" strokeWidth={2.2} strokeLinecap="round" fill="none">
    <path d="M0,0 L0,-11 M0,-6 L-3,-6 L-3,-9 M0,-4 L3,-4 L3,-8" />
  </g>
)
const Gum = ({ x, y, s = 1 }: { x: number; y: number; s?: number }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`}>
    <ellipse cx={2} cy={1} rx={8} ry={2} fill="rgba(60,20,0,0.25)" />
    <path d="M0,0 L-0.5,-12 M-0.5,-8 L4,-13 M-0.5,-10 L-4,-14" stroke="#efe9db" strokeWidth={1.8} strokeLinecap="round" />
    <ellipse cx={-1} cy={-15} rx={8} ry={3.6} fill="#7d8f5a" />
    <ellipse cx={4} cy={-13.5} rx={4.5} ry={2.4} fill="#8fa268" />
  </g>
)
const Termite = ({ x, y }: { x: number; y: number }) => <path transform={`translate(${x} ${y})`} d="M-3,0 Q-2,-9 0,-11 Q2,-9 3,0Z" fill="#9a4a28" />
const Peak = ({ x, y, s = 1 }: { x: number; y: number; s?: number }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`}>
    <path d="M-20,0 L0,-30 L20,0Z" fill="#848891" />
    <path d="M0,-30 L20,0 L4,0Z" fill="#666a73" />
    <path d="M-7.5,-19 L0,-30 L7.5,-19 L4,-16 L1,-19.5 L-3,-15.5Z" fill="#f4f7f9" />
    <path d="M0,-30 L7.5,-19 L4,-16 L1,-19.5Z" fill="#d6dde3" />
  </g>
)
const Whale = ({ x, y }: { x: number; y: number }) => (
  <g transform={`translate(${x} ${y})`}>
    <path d="M-3,0 Q0,-10 -6,-14 Q0,-12 2,-9 Q4,-12 10,-14 Q4,-10 3,0Z" fill="#2f4f7a" />
    <path d="M-12,2 q4,-3 8,0 t8,0 t8,0 t8,0" stroke="#e6f3ff" strokeWidth={1.2} fill="none" />
  </g>
)

const ISLANDS: Island[] = [
  {
    id: 'forest',
    at: [108, 246],
    size: [78, 56],
    land: ['#79a85a', '#4f7f3a'],
    seed: 11,
    art: (
      <>
        <ellipse cx={22} cy={14} rx={12} ry={6} fill="#6fa8c8" stroke="#e8f4fa" strokeWidth={1} />
        <Pine x={-38} y={6} s={0.9} />
        <Pine x={-24} y={-4} s={1.1} tone={1} />
        <Pine x={-10} y={8} />
        <Oak x={6} y={-6} s={1.05} />
        <Pine x={22} y={-10} s={0.95} tone={1} />
        <Pine x={38} y={2} s={0.85} />
        <Oak x={-6} y={22} s={0.8} />
        <Pine x={44} y={-16} s={0.7} />
      </>
    ),
  },
  {
    id: 'canyon',
    at: [176, 118],
    size: [70, 48],
    land: ['#e2b07a', '#c4824c'],
    seed: 23,
    art: (
      <>
        <Mesa x={-24} y={6} s={0.95} />
        <Mesa x={10} y={-4} s={1.25} />
        <Mesa x={34} y={14} s={0.75} />
        <Cactus x={-6} y={20} />
        <Cactus x={-40} y={18} />
        <path d="M-30,26 q10,-4 20,0 t20,0" stroke="#f0cc98" strokeWidth={1.2} fill="none" />
      </>
    ),
  },
  {
    id: 'outback',
    at: [332, 70],
    size: [78, 46],
    land: ['#d9845a', '#b45a34'],
    seed: 37,
    art: (
      <>
        <path d="M-14,10 Q-12,-2 0,-6 Q14,-6 18,10Z" fill="#a8482a" />
        <path d="M0,-6 Q14,-6 18,10 L6,10Z" fill="#8a3a22" />
        <Gum x={-42} y={10} s={0.95} />
        <Gum x={-28} y={-4} s={0.8} />
        <Gum x={34} y={-6} s={1.05} />
        <Termite x={28} y={18} />
        <Termite x={-16} y={22} />
        <Gum x={48} y={14} s={0.75} />
      </>
    ),
  },
  {
    id: 'mountain',
    at: [494, 122],
    size: [76, 52],
    land: ['#a5b28f', '#77856a'],
    seed: 51,
    art: (
      <>
        <Peak x={-26} y={10} s={0.9} />
        <Peak x={4} y={2} s={1.3} />
        <Peak x={32} y={12} s={0.85} />
        <Pine x={-44} y={20} s={0.6} tone={1} />
        <Pine x={-12} y={24} s={0.55} />
        <Pine x={20} y={26} s={0.6} tone={1} />
        <Pine x={46} y={22} s={0.55} />
      </>
    ),
  },
  {
    id: 'sea',
    at: [552, 262],
    size: [64, 52],
    land: ['#b9c98a', '#8aa060'],
    seed: 67,
    art: (
      <>
        <ellipse cx={-6} cy={4} rx={26} ry={16} fill="#e9d9a6" />
        <ellipse cx={-6} cy={4} rx={16} ry={9} fill="#5fb3cf" stroke="#d8f1f8" strokeWidth={1.2} />
        <Whale x={-6} y={8} />
        <path d="M24,-14 l4,-3 l3,2 l-2,4Z M30,10 l5,-2 l2,3 l-4,2Z" fill="#6b6e74" />
        <Pine x={28} y={-22} s={0.55} tone={1} />
      </>
    ),
  },
]

/** The zoo's stretch of harbour shore along the bottom of the chart. */
function ZooShore({ here, hover, onEnter, onLeave, onPick }: { here: boolean; hover: boolean; onEnter: () => void; onLeave: () => void; onPick: () => void }) {
  const key = (e: KeyboardEvent) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onPick())
  return (
    <g
      className={`chart-region${here ? ' here' : ''}${hover ? ' hover' : ''}`}
      role="button"
      tabIndex={0}
      aria-label={here ? 'Your Zoo: you are here' : 'Your Zoo: travel home'}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onClick={onPick}
      onKeyDown={key}
    >
      <title>{here ? 'Your Zoo: you are here (click to return to the entrance)' : 'Sail home to the zoo'}</title>
      <path d={`M0,${H} L0,372 C70,360 120,384 190,368 C240,356 270,352 300,350 L344,350 C380,352 420,366 470,372 C540,380 600,360 ${W},368 L${W},${H}Z`} className="chart-coast" fill="url(#chart-zoo-land)" />
      {/* Wharf and the zoo on its hillside. */}
      <rect x={WHARF[0] - 3} y={WHARF[1]} width={6} height={20} fill="#8a6a44" stroke="#5a3c24" strokeWidth={0.8} />
      <g transform="translate(322 388)">
        <ellipse cx={0} cy={0} rx={58} ry={18} fill="#6f9a4c" />
        <rect x={-30} y={-14} width={14} height={9} fill="#e7d3a6" stroke="#5a3c24" strokeWidth={0.7} />
        <path d="M-32,-14 L-23,-21 L-14,-14Z" fill="#b35a3a" />
        <rect x={14} y={-10} width={18} height={10} fill="#e7d3a6" stroke="#5a3c24" strokeWidth={0.7} />
        <path d="M12,-10 L23,-18 L34,-10Z" fill="#2f6b3a" />
        <path d="M-8,4 L-8,-8 Q0,-15 8,-8 L8,4" fill="none" stroke="#5a3c24" strokeWidth={2.4} />
        <rect x={-10} y={-11} width={20} height={4} rx={1} fill="#2f5a3a" />
        <Oak x={-46} y={6} s={0.7} />
        <Oak x={44} y={4} s={0.75} />
        <Pine x={-38} y={-4} s={0.55} />
      </g>
      {/* The Opera House and bridge across the water to the left. */}
      <g transform="translate(70 372)" opacity={0.85}>
        <path d="M-14,0 Q-10,-12 -4,-12 L-6,0Z M-6,0 Q-1,-15 6,-15 L3,0Z M3,0 Q8,-11 14,-10 L11,0Z" fill="#f4f1ea" stroke="#b9b2a2" strokeWidth={0.6} />
      </g>
      <path d="M120,370 Q150,342 180,368" fill="none" stroke="#9aa0a8" strokeWidth={2.2} opacity={0.8} />
      <path d="M118,370 L182,370" stroke="#9aa0a8" strokeWidth={1.4} opacity={0.8} />
      <g className="chart-banner" transform="translate(322 412)">
        <rect x={-46} y={-11} width={92} height={15} rx={3} />
        <text y={0}>Your Zoo</text>
      </g>
      {here && <Pin x={360} y={366} />}
    </g>
  )
}

const Pin = ({ x, y }: { x: number; y: number }) => (
  <g className="chart-pin" transform={`translate(${x} ${y})`}>
    <ellipse cx={0} cy={1} rx={5} ry={1.6} fill="rgba(0,0,0,0.3)" />
    <path d="M0,0 C-9,-10 -9,-23 0,-23 C9,-23 9,-10 0,0Z" fill="#e2483a" stroke="#fff" strokeWidth={1.6} />
    <circle cx={0} cy={-15} r={3.4} fill="#fff" />
  </g>
)

/** Where a ferry route meets an island: the edge facing the zoo's wharf. */
function dock(island: Island): [number, number] {
  const [cx, cy] = island.at
  const dx = WHARF[0] - cx
  const dy = WHARF[1] - cy
  const len = Math.hypot(dx / island.size[0], dy / island.size[1])
  return [cx + (dx / len) * 0.92, cy + (dy / len) * 0.92]
}

function route(island: Island): string {
  const [x1, y1] = dock(island)
  const [x0, y0] = WHARF
  // Bow each lane outwards so they fan from the wharf.
  const mx = (x0 + x1) / 2 + (x1 - x0) * 0.12
  const my = (y0 + y1) / 2 + Math.abs(x1 - x0) * 0.18
  return `M${x0},${y0} Q${mx.toFixed(1)},${my.toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}`
}

const Compass = () => (
  <g transform="translate(606 36)" className="chart-compass">
    <circle r={24} fill="rgba(243,230,196,0.85)" stroke="#7a5a30" strokeWidth={1} />
    <circle r={19} fill="none" stroke="#7a5a30" strokeWidth={0.5} />
    <path d="M0,-21 L4,0 L0,21 L-4,0Z" fill="#7a5a30" />
    <path d="M-21,0 L0,-4 L21,0 L0,4Z" fill="#a8885a" />
    <path d="M0,-21 L4,0 L0,0Z" fill="#c0392b" />
    <text y={-26} textAnchor="middle">
      N
    </text>
  </g>
)

/** The expedition chart: the zoo's harbour at the bottom, ferry routes out to each region. */
export function RegionChart({ onTravel }: { onTravel: (to: Destination) => void }) {
  const owned = useGame((s) => s.owned)
  const captured = useGame((s) => s.captured)
  const location = useSession((s) => s.location)
  const here: Destination = location.kind === 'hub' ? 'hub' : location.biome
  const [hover, setHover] = useState<Destination | null>(null)

  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H + 12}`} role="group" aria-label="Expedition chart: ferry routes from the zoo to each region">
      <defs>
        <radialGradient id="chart-sea" cx="50%" cy="45%" r="75%">
          <stop offset="0%" stopColor="#5fa3c6" />
          <stop offset="70%" stopColor="#3f7fa6" />
          <stop offset="100%" stopColor="#2c5f80" />
        </radialGradient>
        <pattern id="chart-waves" width="44" height="26" patternUnits="userSpaceOnUse">
          <path d="M4,14 q5,-4 10,0 t10,0" stroke="rgba(255,255,255,0.13)" strokeWidth={1.1} fill="none" />
          <path d="M26,4 q4,-3 8,0" stroke="rgba(255,255,255,0.1)" strokeWidth={1} fill="none" />
        </pattern>
        <linearGradient id="chart-zoo-land" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#e9dcb2" />
          <stop offset="18%" stopColor="#8db866" />
          <stop offset="100%" stopColor="#5e8a42" />
        </linearGradient>
        {ISLANDS.map((isl) => (
          <linearGradient key={isl.id} id={`land-${isl.id}`} x1="0" y1="0" x2="0.6" y2="1">
            <stop offset="0%" stopColor={isl.land[0]} />
            <stop offset="100%" stopColor={isl.land[1]} />
          </linearGradient>
        ))}
        <filter id="chart-shallows" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
        <filter id="chart-shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="2" dy="3" stdDeviation="2.5" floodColor="#0b2233" floodOpacity="0.45" />
        </filter>
        <filter id="chart-fog" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="5" />
        </filter>
        <filter id="chart-grey">
          <feColorMatrix type="saturate" values="0.25" />
        </filter>
      </defs>

      {/* Sea, waves and a faint chart grid. */}
      <rect width={W} height={H + 12} fill="url(#chart-sea)" />
      <rect width={W} height={H + 12} fill="url(#chart-waves)" />
      {[80, 160, 240, 320, 400, 480, 560].map((x) => (
        <line key={`v${x}`} x1={x} y1={0} x2={x} y2={H} className="chart-grid" />
      ))}
      {[70, 140, 210, 280].map((y) => (
        <line key={`h${y}`} x1={0} y1={y} x2={W} y2={y} className="chart-grid" />
      ))}

      {/* Ferry lanes. */}
      {ISLANDS.map((isl) => {
        const locked = !!BIOME_BY_ID[isl.id].requires && !owned[BIOME_BY_ID[isl.id].requires!]
        return <path key={`lane-${isl.id}`} id={`lane-${isl.id}`} d={route(isl)} className={`chart-lane${locked ? ' locked' : ''}${hover === isl.id ? ' active' : ''}`} />
      })}
      {hover && hover !== 'hub' && hover !== here && !(BIOME_BY_ID[hover].requires && !owned[BIOME_BY_ID[hover].requires!]) && (
        <g className="chart-ferry">
          <path d="M-7,-2 L7,-2 L5,3 L-5,3Z" fill="#f4f1ea" stroke="#3a2a1a" strokeWidth={0.8} />
          <rect x={-3} y={-6} width={6} height={4} fill="#c0392b" />
          <animateMotion dur="2.6s" repeatCount="indefinite" rotate="auto">
            <mpath href={`#lane-${hover}`} />
          </animateMotion>
        </g>
      )}

      {ISLANDS.map((isl) => {
        const biome = BIOME_BY_ID[isl.id]
        const locked = !!biome.requires && !owned[biome.requires]
        const species = biome.spawns.map((s) => s.creatureId).concat(biome.legendary.creatureId)
        const got = species.filter((id) => captured[id]).length
        const isHere = here === isl.id
        const outline = blob(isl.at, isl.size, isl.seed)
        const go = () => !locked && !isHere && onTravel(isl.id)
        const key = (e: KeyboardEvent) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), go())
        const detail = locked ? `Needs ${SHOP_ITEM_BY_ID[biome.requires!].name}` : `${got}/${species.length} species`
        const [bx, by] = [isl.at[0], isl.at[1] + isl.size[1] * 0.78]
        return (
          <g
            key={isl.id}
            className={`chart-region${locked ? ' locked' : ''}${isHere ? ' here' : ''}${hover === isl.id ? ' hover' : ''}`}
            role="button"
            tabIndex={locked ? -1 : 0}
            aria-disabled={locked || isHere}
            aria-label={`${biome.name}: ${isHere ? 'you are here' : detail}`}
            onMouseEnter={() => setHover(isl.id)}
            onMouseLeave={() => setHover(null)}
            onFocus={() => setHover(isl.id)}
            onBlur={() => setHover(null)}
            onClick={go}
            onKeyDown={key}
          >
            <title>{locked ? `${biome.name}: ${detail}` : isHere ? `${biome.name}: you are here` : `Take the ferry to ${biome.name}`}</title>
            <path d={outline} fill="#b8e6ef" opacity={0.75} filter="url(#chart-shallows)" transform={`translate(0 2)`} />
            <g filter={locked ? 'url(#chart-grey)' : undefined}>
              <path d={outline} fill={`url(#land-${isl.id})`} className="chart-coast" filter="url(#chart-shadow)" />
              <path d={blob(isl.at, [isl.size[0] * 0.7, isl.size[1] * 0.6], isl.seed + 1, 10, 0.3)} fill="rgba(255,255,255,0.08)" />
              <g transform={`translate(${isl.at[0]} ${isl.at[1] - 4})`}>{isl.art}</g>
            </g>
            {locked && (
              <g pointerEvents="none">
                <g filter="url(#chart-fog)" opacity={0.78}>
                  <ellipse cx={isl.at[0] - isl.size[0] * 0.3} cy={isl.at[1] - 4} rx={isl.size[0] * 0.5} ry={isl.size[1] * 0.42} fill="#f2f4f6" />
                  <ellipse cx={isl.at[0] + isl.size[0] * 0.25} cy={isl.at[1] + 6} rx={isl.size[0] * 0.55} ry={isl.size[1] * 0.4} fill="#e9edf0" />
                </g>
                <g transform={`translate(${isl.at[0]} ${isl.at[1] - 6})`} className="chart-lock">
                  <circle r={11} />
                  <rect x={-5} y={-1.5} width={10} height={8} rx={1.2} fill="#5a4630" />
                  <path d="M-3,-1.5 L-3,-4.5 A3,3 0 0 1 3,-4.5 L3,-1.5" fill="none" stroke="#5a4630" strokeWidth={1.8} />
                </g>
              </g>
            )}
            <g className="chart-banner" transform={`translate(${bx} ${by})`}>
              <path d="M-56,-12 L56,-12 L50,-2.5 L56,7 L-56,7 L-50,-2.5Z" />
              <text y={-1}>{biome.name}</text>
              <text y={18} className={`chart-sub${locked ? ' req' : ''}`}>
                {isHere ? 'You are here' : detail}
              </text>
            </g>
            {isHere && <Pin x={isl.at[0] + isl.size[0] * 0.6} y={isl.at[1] - isl.size[1] * 0.45} />}
          </g>
        )
      })}

      <ZooShore here={here === 'hub'} hover={hover === 'hub'} onEnter={() => setHover('hub')} onLeave={() => setHover(null)} onPick={() => onTravel('hub')} />
      <Compass />
      <g className="chart-cartouche" transform="translate(16 18)">
        <rect width={150} height={34} rx={4} />
        <text x={75} y={15}>
          Expedition Chart
        </text>
        <text x={75} y={28} className="chart-cartouche-sub">
          Ferry routes from the zoo
        </text>
      </g>
    </svg>
  )
}

/** Every destination on the chart. */
export const CHART_DESTINATIONS: Destination[] = ['hub', ...ISLANDS.map((i) => i.id)]
