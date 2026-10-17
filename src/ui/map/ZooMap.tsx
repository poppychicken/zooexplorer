import { useMemo, useState, type KeyboardEvent, type ReactNode } from 'react'
import { BIOME_BY_ID } from '../../game/data/biomes'
import { useGame, useSession } from '../../game/state/store'
import { player } from '../../game/systems/world'
import { BUGGY_PARK, EDGES, ENTRANCE, NODES, PLOT_OFFSET, PLOT_SIZE, PRECINCTS, SHOP, SKY_SAFARI, SPAWN, WHARF, bushland } from '../../scenes/hub/layout'
import { MAP_AREA, zooRelief } from './zooRelief'

const TERRACE = PLOT_OFFSET + PLOT_SIZE / 2 + 1.5

/** Facing angles for arrivals: the player looks along -z at yaw 0. */
const FACE_DOWNHILL = Math.PI
const FACE_EAST = -Math.PI / 2

interface Spot {
  id: string
  label: string
  at: [number, number]
  /** Where to put the player, and which way they face. */
  arrive: [number, number, number]
  icon: ReactNode
  hidden?: boolean
  /** Which side of the marker the label sits on, so neighbouring markers don't overlap. */
  side?: 'below' | 'above' | 'left' | 'right'
}

const LABEL_AT = {
  below: { x: 0, y: 6.6, textAnchor: 'middle' },
  above: { x: 0, y: -4.4, textAnchor: 'middle' },
  left: { x: -4.2, y: 1, textAnchor: 'end' },
  right: { x: 4.2, y: 1, textAnchor: 'start' },
} as const

const icon = (paths: ReactNode) => (
  <g>
    <circle r={3.2} className="zoo-poi-badge" />
    <g transform="scale(0.11)">{paths}</g>
  </g>
)

/** A top-down map of the zoo. Click a precinct or landmark to go straight there. */
export function ZooMap({ onGo }: { onGo: (x: number, z: number, yaw: number) => void }) {
  const owned = useGame((s) => s.owned)
  const captured = useGame((s) => s.captured)
  const location = useSession((s) => s.location)
  const inZoo = location.kind === 'hub'
  const [hover, setHover] = useState<string | null>(null)
  const relief = useMemo(() => zooRelief(), [])
  const trees = useMemo(() => bushland().filter((p) => p.kind === 'oak' || p.kind === 'pine' || p.kind === 'bush'), [])

  const spots: Spot[] = [
    {
      id: 'entrance',
      label: 'Main Entrance',
      at: ENTRANCE,
      arrive: [SPAWN[0], SPAWN[1], FACE_DOWNHILL],
      side: 'above',
      icon: icon(<path d="M-18,14 L-18,-6 Q0,-22 18,-6 L18,14 L10,14 L10,-2 Q0,-10 -10,-2 L-10,14Z" fill="#fff" />),
    },
    { id: 'shop', label: 'Outfitter', at: SHOP, arrive: [SHOP[0] - 4, SHOP[1], FACE_EAST], side: 'right', icon: icon(<path d="M-14,-4 L14,-4 L11,16 L-11,16Z M-7,-4 Q-7,-16 0,-16 Q7,-16 7,-4" fill="#fff" stroke="#fff" strokeWidth={4} />) },
    {
      id: 'buggy',
      label: 'Buggy',
      at: BUGGY_PARK,
      arrive: [BUGGY_PARK[0] + 3, BUGGY_PARK[1], FACE_DOWNHILL],
      hidden: !owned.buggy,
      side: 'left',
      icon: icon(<path d="M-16,4 L-12,-8 L12,-8 L16,4Z M-12,10 a4,4 0 1 0 0.1,0 M12,10 a4,4 0 1 0 0.1,0" fill="#fff" />),
    },
    {
      id: 'wharf',
      label: 'Ferry Wharf',
      at: WHARF,
      arrive: [WHARF[0], WHARF[1] - 7, FACE_DOWNHILL],
      icon: icon(<path d="M0,-16 L0,12 M-12,4 Q0,20 12,4 M-7,-8 L7,-8" fill="none" stroke="#fff" strokeWidth={4.5} strokeLinecap="round" />),
    },
  ]

  const pick = (x: number, z: number, yaw: number) => onGo(x, z, yaw)
  const keyed = (go: () => void) => (e: KeyboardEvent) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), go())

  const w = MAP_AREA.maxX - MAP_AREA.minX
  const h = MAP_AREA.maxZ - MAP_AREA.minZ
  const heading = Math.atan2(player.forward.x, -player.forward.z) * (180 / Math.PI)

  return (
    <svg className="zoo-map" viewBox={`${MAP_AREA.minX} ${MAP_AREA.minZ} ${w} ${h}`} role="group" aria-label="Map of the zoo">
      <defs>
        <filter id="zoo-tree-shadow" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0.6" dy="0.8" stdDeviation="0.5" floodColor="#0f1f0a" floodOpacity="0.45" />
        </filter>
      </defs>
      <image href={relief} x={MAP_AREA.minX} y={MAP_AREA.minZ} width={w} height={h} preserveAspectRatio="none" />

      {/* Sky Safari cable car, drawn under everything else. */}
      <line x1={SKY_SAFARI.top[0]} y1={SKY_SAFARI.top[1]} x2={SKY_SAFARI.bottom[0]} y2={SKY_SAFARI.bottom[1]} className="zoo-cable" />

      {/* Footpaths. */}
      <g className="zoo-paths">
        {EDGES.map(([a, b]) => (
          <line key={`o${a}${b}`} x1={NODES[a][0]} y1={NODES[a][1]} x2={NODES[b][0]} y2={NODES[b][1]} className="zoo-path-edge" />
        ))}
        {EDGES.map(([a, b]) => (
          <line key={`p${a}${b}`} x1={NODES[a][0]} y1={NODES[a][1]} x2={NODES[b][0]} y2={NODES[b][1]} className="zoo-path" />
        ))}
        <circle cx={0} cy={-56} r={11} className="zoo-plaza" />
      </g>

      {/* Precincts: fenced exhibit plots around a central crossroads. */}
      {PRECINCTS.map((p) => {
        const biome = p.biome ? BIOME_BY_ID[p.biome] : null
        const species = biome ? biome.spawns.map((s) => s.creatureId).concat(biome.legendary.creatureId) : []
        const got = species.filter((id) => captured[id]).length
        const go = () => pick(p.center[0], p.center[1] + 4, 0)
        return (
          <g
            key={p.id}
            className={`zoo-precinct${hover === p.id ? ' hover' : ''}`}
            role="button"
            tabIndex={0}
            aria-label={`${p.name}: ${got} of ${species.length} species. Go there`}
            onMouseEnter={() => setHover(p.id)}
            onMouseLeave={() => setHover(null)}
            onClick={go}
            onKeyDown={keyed(go)}
          >
            <title>{`${p.name}: ${p.subtitle}`}</title>
            <rect x={p.center[0] - TERRACE} y={p.center[1] - TERRACE} width={TERRACE * 2} height={TERRACE * 2} rx={1.5} className="zoo-terrace" />
            {[
              [-1, -1],
              [1, -1],
              [-1, 1],
              [1, 1],
            ].map(([sx, sz], i) => {
              const id = species[i]
              return (
                <rect
                  key={i}
                  x={p.center[0] + sx * PLOT_OFFSET - PLOT_SIZE / 2}
                  y={p.center[1] + sz * PLOT_OFFSET - PLOT_SIZE / 2}
                  width={PLOT_SIZE}
                  height={PLOT_SIZE}
                  className={`zoo-plot${id && captured[id] ? ' open' : ''}`}
                  style={{ ['--plot' as string]: p.ground }}
                />
              )
            })}
            <g className="zoo-label" transform={`translate(${p.center[0]} ${p.center[1] - TERRACE - 2})`}>
              <text>{p.name}</text>
              <text y={3.6} className="zoo-sub">
                {got}/{species.length} species
              </text>
            </g>
          </g>
        )
      })}

      {/* Trees, with soft shadows. */}
      <g filter="url(#zoo-tree-shadow)" pointerEvents="none">
        {trees.map((t, i) => (
          <circle
            key={i}
            cx={t.x}
            cy={t.z}
            r={(t.kind === 'oak' ? 2.3 : t.kind === 'pine' ? 1.7 : 1) * t.scale}
            fill={t.kind === 'oak' ? '#4f8a3c' : t.kind === 'pine' ? '#2f5d34' : '#5d9a45'}
            stroke="rgba(20,40,15,0.5)"
            strokeWidth={0.25}
          />
        ))}
      </g>

      {/* Sky Safari stations. */}
      {[SKY_SAFARI.top, SKY_SAFARI.bottom].map(([x, z], i) => (
        <rect key={i} x={x - 1.6} y={z - 1.6} width={3.2} height={3.2} className="zoo-station" />
      ))}
      <text x={(SKY_SAFARI.top[0] + SKY_SAFARI.bottom[0]) / 2 - 3} y={(SKY_SAFARI.top[1] + SKY_SAFARI.bottom[1]) / 2} className="zoo-cable-label" transform={`rotate(84 ${(SKY_SAFARI.top[0] + SKY_SAFARI.bottom[0]) / 2 - 3} ${(SKY_SAFARI.top[1] + SKY_SAFARI.bottom[1]) / 2})`}>
        Sky Safari
      </text>

      {/* Landmarks. */}
      {spots
        .filter((s) => !s.hidden)
        .map((s) => {
          const go = () => pick(...s.arrive)
          return (
            <g
              key={s.id}
              className={`zoo-poi${hover === s.id ? ' hover' : ''}`}
              transform={`translate(${s.at[0]} ${s.at[1]})`}
              role="button"
              tabIndex={0}
              aria-label={`${s.label}: go there`}
              onMouseEnter={() => setHover(s.id)}
              onMouseLeave={() => setHover(null)}
              onClick={go}
              onKeyDown={keyed(go)}
            >
              <title>{`Go to the ${s.label}`}</title>
              {s.icon}
              <text {...LABEL_AT[s.side ?? 'below']} className="zoo-poi-label">
                {s.label}
              </text>
            </g>
          )
        })}

      <text x={-50} y={62} className="zoo-water-label">
        Sydney Harbour
      </text>

      {/* You are here. */}
      {inZoo && (
        <g transform={`translate(${player.position.x} ${player.position.z}) rotate(${heading})`} className="zoo-you">
          <circle r={3.6} className="zoo-you-ring" />
          <path d="M0,-3.2 L2.3,2.4 L0,1.2 L-2.3,2.4Z" />
        </g>
      )}

      {/* North arrow and scale bar. */}
      <g transform={`translate(${MAP_AREA.maxX - 9} ${MAP_AREA.minZ + 10})`} className="zoo-north">
        <circle r={5} />
        <path d="M0,-4 L2,1.5 L0,0.5 L-2,1.5Z" />
        <text y={-6}>N</text>
      </g>
      <g transform={`translate(${MAP_AREA.maxX - 32} ${MAP_AREA.maxZ - 6})`} className="zoo-scale">
        <line x1={0} y1={0} x2={20} y2={0} />
        <line x1={0} y1={-1.2} x2={0} y2={1.2} />
        <line x1={20} y1={-1.2} x2={20} y2={1.2} />
        <text x={10} y={-2}>
          20 m
        </text>
      </g>
    </svg>
  )
}
