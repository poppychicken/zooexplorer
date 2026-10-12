import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { CuboidCollider, RigidBody } from '@react-three/rapier'
import { CanvasTexture, DoubleSide, Group, RepeatWrapping } from 'three'
import { Player } from '../components/Player'
import { PropField, type PlacedProp } from '../components/Props'
import { Sign } from '../components/Sign'
import { CreatureModel } from '../components/CreatureModel'
import { Visitors, type ViewingSpot } from '../components/Visitors'
import { OwnedBuggy } from '../components/Buggy'
import { CREATURES, type CreatureDef, type Rarity } from '../game/data/creatures'
import { BIOME_BY_ID } from '../game/data/biomes'
import { useGame, useSession } from '../game/state/store'
import { useInteractable } from '../game/systems/interact'
import { mulberry32, range } from '../game/systems/rng'
import { terrain } from '../game/systems/world'
import { HubTerrain } from './hub/HubTerrain'
import { Harbour } from './hub/Harbour'
import { SkySafari } from './hub/SkySafari'
import {
  BOUNDS,
  BUGGY_PARK,
  NODES,
  PLOT_OFFSET,
  PLOT_SIZE,
  PRECINCTS,
  SHOP,
  SPAWN,
  hubHeight,
  isOpenGround,
  padHeight,
  precinctHeight,
  type Precinct,
} from './hub/layout'

const PLOT = PLOT_SIZE

/** Darker rarity colours that read well on a light signboard. */
const RARITY_INK: Record<Rarity, string> = { common: '#4d6358', uncommon: '#2a78c2', rare: '#7a3fc0', legendary: '#b07a00' }

/** Corners of a precinct's 2×2 plot grid, as [x sign, z sign]. */
const CORNERS: [1 | -1, 1 | -1][] = [
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
]

interface Plot {
  creatureId: string
  precinct: Precinct
  /** Plot centre in world space. */
  x: number
  z: number
  y: number
  /** Which side of the precinct crossroads the plot is on. */
  sx: 1 | -1
  sz: 1 | -1
}

/** Each biome's four species fill the plots of the precinct it maps to. */
export const PLOTS: Plot[] = PRECINCTS.flatMap((p) => {
  if (!p.biome) return []
  const y = precinctHeight(p)
  return CREATURES.filter((c) => c.biome === p.biome).map((c, i) => {
    const [sx, sz] = CORNERS[i % 4]
    return { creatureId: c.id, precinct: p, x: p.center[0] + sx * PLOT_OFFSET, z: p.center[1] + sz * PLOT_OFFSET, y, sx, sz }
  })
})

/** The node in the path network that serves a precinct. */
const PRECINCT_NODE: Record<string, string> = {
  'rainforest-trail': 'rainforest',
  'african-savannah': 'savannah',
  'nura-diya': 'nuraDiya',
  'tiger-trek': 'tigerTrek',
  'great-southern-oceans': 'oceans',
}

function Fence({ x, z, size, openSide }: { x: number; z: number; size: number; openSide: 1 | -1 }) {
  const h = size / 2
  const posts: [number, number][] = []
  for (let i = -h; i <= h + 0.01; i += 2) {
    posts.push([i, -h], [i, h])
    if (Math.abs(i) < h) posts.push([-h, i], [h, i])
  }
  // Leave a gap in the side facing the path so the player can look in (but not walk in).
  const gateX = openSide * h
  return (
    <group position={[x, 0, z]}>
      {posts.map(([px, pz], i) => (
        <mesh key={i} position={[px, 0.55, pz]} castShadow>
          <boxGeometry args={[0.15, 1.1, 0.15]} />
          <meshStandardMaterial color="#7a5636" flatShading />
        </mesh>
      ))}
      {[0.45, 0.9].map((y) => (
        <group key={y}>
          <mesh position={[0, y, -h]}>
            <boxGeometry args={[size, 0.08, 0.06]} />
            <meshStandardMaterial color="#8d6440" flatShading />
          </mesh>
          <mesh position={[0, y, h]}>
            <boxGeometry args={[size, 0.08, 0.06]} />
            <meshStandardMaterial color="#8d6440" flatShading />
          </mesh>
          <mesh position={[-gateX, y, 0]}>
            <boxGeometry args={[0.06, 0.08, size]} />
            <meshStandardMaterial color="#8d6440" flatShading />
          </mesh>
          <mesh position={[gateX, y, 0]}>
            <boxGeometry args={[0.06, 0.08, size]} />
            <meshStandardMaterial color="#8d6440" flatShading />
          </mesh>
        </group>
      ))}
      {/* Reach a metre below the pad too, so a dip in the ground can't open a gap underneath. */}
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[h, 2, 0.15]} position={[0, 1, -h]} />
        <CuboidCollider args={[h, 2, 0.15]} position={[0, 1, h]} />
        <CuboidCollider args={[0.15, 2, h]} position={[-h, 1, 0]} />
        <CuboidCollider args={[0.15, 2, h]} position={[h, 1, 0]} />
      </RigidBody>
    </group>
  )
}

/** How many animals are drawn per exhibit; the sign shows the full count and all of them earn. */
const MAX_VISIBLE_RESIDENTS = 12

/** Perches inside an aviary: [x, y, z] relative to the plot centre. */
const PERCHES: [number, number, number][] = [
  [-3.5, 2.1, -3],
  [3.2, 2.1, 2.8],
  [0, 0, 0],
  [-2, 0, 3.5],
  [3.5, 0, -3],
]

/** A captured creature pottering around its enclosure. Flyers hop between perches and loop around the aviary. */
function ExhibitResident({ def, half, seed }: { def: CreatureDef; half: number; seed: number }) {
  const group = useRef<Group>(null)
  const motion = useRef({ speed: 0, airborne: false })
  const flies = !!def.flies
  // Swimmers stay in the pool along the far side of the sea enclosures.
  const minZ = def.placeholder.shape === 'whale' ? 1.8 : -half
  const state = useRef(
    (() => {
      const rng = mulberry32(seed)
      const x = range(rng, -half, half)
      const z = range(rng, minZ, half)
      return { x, y: 0, z, tx: x, ty: 0, tz: z, heading: rng() * Math.PI * 2, wait: rng() * 3, perched: true }
    })(),
  )
  useFrame((_, dt) => {
    const s = state.current
    const g = group.current
    if (!g) return
    dt = Math.min(dt, 0.1)
    const dx = s.tx - s.x
    const dy = s.ty - s.y
    const dz = s.tz - s.z
    const d = Math.hypot(dx, dy, dz)
    if (s.wait > 0) {
      s.wait -= dt
      motion.current.speed = 0
      if (s.wait <= 0) pickTarget(s)
    } else if (d < 0.2) {
      if (s.perched || !flies) s.wait = 2 + Math.random() * 4
      else pickTarget(s)
    } else {
      const speed = flies ? 3 : def.rarity === 'legendary' ? 1.2 : 1
      const step = Math.min(d, speed * dt)
      s.x += (dx / d) * step
      s.y += (dy / d) * step
      s.z += (dz / d) * step
      if (Math.hypot(dx, dz) > 0.05) {
        const target = Math.atan2(dx, dz)
        let diff = target - s.heading
        diff = Math.atan2(Math.sin(diff), Math.cos(diff))
        s.heading += diff * Math.min(1, dt * 5)
      }
      motion.current.speed = speed
    }
    motion.current.airborne = flies && s.y > 0.3
    g.position.set(s.x, s.y, s.z)
    g.rotation.y = s.heading
  })

  function pickTarget(s: typeof state.current) {
    if (flies && Math.random() < 0.6) {
      // Loop through the air under the aviary roof.
      s.perched = false
      s.tx = range(Math.random, -half, half)
      s.ty = range(Math.random, 1.2, AVIARY_HEIGHT - 1.6)
      s.tz = range(Math.random, -half, half)
    } else if (flies) {
      const [px, py, pz] = PERCHES[Math.floor(Math.random() * PERCHES.length)]
      s.perched = true
      s.tx = px + range(Math.random, -0.4, 0.4)
      s.ty = py
      s.tz = pz
    } else {
      s.tx = range(Math.random, -half, half)
      s.ty = 0
      s.tz = range(Math.random, minZ, half)
    }
  }

  return (
    <group ref={group}>
      <CreatureModel def={def} motion={motion} />
    </group>
  )
}

const AVIARY_HEIGHT = 5.5

/** Transparent wire-mesh texture for the aviary walls and roof. */
function useMeshTexture() {
  return useMemo(() => {
    const c = document.createElement('canvas')
    c.width = c.height = 64
    const ctx = c.getContext('2d')!
    ctx.strokeStyle = '#3a3a36'
    ctx.lineWidth = 3
    ctx.strokeRect(0, 0, 64, 64)
    const tex = new CanvasTexture(c)
    tex.wrapS = tex.wrapT = RepeatWrapping
    tex.repeat.set(PLOT * 2, PLOT * 2)
    tex.anisotropy = 8
    return tex
  }, [])
}

/** Roofed wire cage over a plot, so flying creatures can't escape. */
function AviaryCage() {
  const mesh = useMeshTexture()
  const h = PLOT / 2
  const H = AVIARY_HEIGHT
  const frame = '#4a4a44'
  const walls: { pos: [number, number, number]; rot: [number, number, number]; size: [number, number] }[] = [
    { pos: [0, H / 2, -h], rot: [0, 0, 0], size: [PLOT, H] },
    { pos: [0, H / 2, h], rot: [0, Math.PI, 0], size: [PLOT, H] },
    { pos: [-h, H / 2, 0], rot: [0, Math.PI / 2, 0], size: [PLOT, H] },
    { pos: [h, H / 2, 0], rot: [0, -Math.PI / 2, 0], size: [PLOT, H] },
    { pos: [0, H, 0], rot: [-Math.PI / 2, 0, 0], size: [PLOT, PLOT] },
  ]
  return (
    <group>
      {walls.map((w, i) => (
        <mesh key={i} position={w.pos} rotation={w.rot}>
          <planeGeometry args={w.size} />
          <meshStandardMaterial map={mesh} transparent alphaTest={0.3} side={DoubleSide} />
        </mesh>
      ))}
      {/* Steel frame: corner and mid posts, top beams and a ridge. */}
      {[-h, 0, h].flatMap((x) =>
        [-h, 0, h]
          .filter((z) => Math.abs(x) === h || Math.abs(z) === h)
          .map((z) => (
            <mesh key={`${x},${z}`} position={[x, H / 2, z]} castShadow>
              <boxGeometry args={[0.18, H, 0.18]} />
              <meshStandardMaterial color={frame} flatShading />
            </mesh>
          )),
      )}
      {[
        { p: [0, H, -h], s: [PLOT, 0.15, 0.15] },
        { p: [0, H, h], s: [PLOT, 0.15, 0.15] },
        { p: [-h, H, 0], s: [0.15, 0.15, PLOT] },
        { p: [h, H, 0], s: [0.15, 0.15, PLOT] },
        { p: [0, H, 0], s: [PLOT, 0.12, 0.12] },
        { p: [0, H, 0], s: [0.12, 0.12, PLOT] },
      ].map((b, i) => (
        <mesh key={i} position={b.p as [number, number, number]}>
          <boxGeometry args={b.s as [number, number, number]} />
          <meshStandardMaterial color={frame} flatShading />
        </mesh>
      ))}
      {/* Raised perches for the birds. */}
      {PERCHES.filter(([, y]) => y > 0).map(([x, y, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh position={[0, y / 2, 0]} castShadow>
            <cylinderGeometry args={[0.08, 0.1, y, 6]} />
            <meshStandardMaterial color="#6b4a2e" flatShading />
          </mesh>
          <mesh position={[0, y, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
            <cylinderGeometry args={[0.06, 0.06, 1.6, 6]} />
            <meshStandardMaterial color="#6b4a2e" flatShading />
          </mesh>
        </group>
      ))}
    </group>
  )
}

const HABITAT_FLOOR: Record<CreatureDef['biome'], string> = { forest: '#4a6b34', canyon: '#d6a46c', outback: '#b5532e', mountain: '#8a8f86', sea: '#e3d3a4' }

/** Scenery inside each biome's enclosures. */
const HABITAT_PROPS: Record<CreatureDef['biome'], PlacedProp['kind'][]> = {
  forest: ['bush', 'rock', 'mushroom', 'log', 'bush'],
  canyon: ['rock', 'bush', 'rock', 'cactus'],
  outback: ['spinifex', 'spinifex', 'termite', 'rock'],
  mountain: ['rock', 'boulder', 'bush', 'rock'],
  sea: ['coastrock', 'dunegrass', 'dunegrass', 'rock'],
}

function Habitat({ def, seed }: { def: CreatureDef; seed: number }) {
  const props = useMemo<PlacedProp[]>(() => {
    const rng = mulberry32(seed)
    const kinds = HABITAT_PROPS[def.biome]
    // Sea animals get a pool in half the enclosure, so keep decor to the dry half.
    const maxZ = def.biome === 'sea' ? -0.5 : 4.5
    return Array.from({ length: 8 }, () => ({
      kind: kinds[Math.floor(rng() * kinds.length)],
      x: range(rng, -4.5, 4.5),
      z: range(rng, -4.5, maxZ),
      scale: range(rng, 0.4, 0.7),
      rot: rng() * Math.PI * 2,
      tint: rng() - 0.5,
    }))
  }, [def.biome, seed])
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.08, 0]} receiveShadow>
        <planeGeometry args={[PLOT - 0.4, PLOT - 0.4]} />
        <meshStandardMaterial color={HABITAT_FLOOR[def.biome]} flatShading />
      </mesh>
      {def.biome === 'sea' && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.12, 2.8]}>
          <planeGeometry args={[PLOT - 1, 5]} />
          <meshStandardMaterial color="#3fa5b8" roughness={0.2} metalness={0.1} />
        </mesh>
      )}
      {/* Walk-through decor: the fence already keeps the player out. */}
      <PropField props={props} colliders={false} />
    </>
  )
}

function Exhibit({ creatureId, x, z, y, sx, sz }: Plot) {
  const count = useGame((s) => s.captured[creatureId] ?? 0)
  const discovered = useGame((s) => !!s.discovered[creatureId])
  const def = CREATURES.find((c) => c.id === creatureId)!
  const open = count > 0
  const lines = open
    ? [
        { text: def.name, size: 64, bold: true },
        { text: `${def.flies ? 'AVIARY · ' : ''}${def.rarity.toUpperCase()} · ×${count}`, size: 38, color: RARITY_INK[def.rarity], bold: true },
        { text: `Ticket +$${(def.ticket * count).toFixed(2)}`, size: 46, color: '#2e6b2e' },
      ]
    : [
        { text: discovered ? def.name : '???', size: 64, bold: true },
        { text: 'Exhibit coming soon', size: 40, color: '#6b5a44' },
        { text: `Found in: ${BIOME_BY_ID[def.biome].name}`, size: 34, color: '#6b5a44' },
      ]
  return (
    <group position={[0, y, 0]}>
      <Fence x={x} z={z} size={PLOT} openSide={sx} />
      {/* On the walkway side, towards the outer corner so it doesn't block the view in. */}
      <Sign lines={lines} position={[x + sx * 4.2, 1.1, z - sz * (PLOT / 2 + 0.5)]} rotation={[0, sz > 0 ? Math.PI : 0, 0]} width={2} height={1} />
      <group position={[x, 0, z]}>
        {open ? (
          <>
            <Habitat def={def} seed={creatureId.length * 97 + Math.round(x)} />
            {def.flies && <AviaryCage />}
            {Array.from({ length: Math.min(count, MAX_VISIBLE_RESIDENTS) }, (_, i) => (
              <ExhibitResident key={i} def={def} half={PLOT / 2 - 1.5} seed={i * 7919 + creatureId.length} />
            ))}
          </>
        ) : (
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.08, 0]} receiveShadow>
            <planeGeometry args={[PLOT - 0.4, PLOT - 0.4]} />
            <meshStandardMaterial color="#8a7a5c" flatShading />
          </mesh>
        )}
      </group>
    </group>
  )
}

/** Precinct centrepiece: a timber arch over the crossroads, plus benches. Unbuilt precincts get site hoardings. */
function PrecinctHub({ precinct }: { precinct: Precinct }) {
  const [cx, cz] = precinct.center
  const y = precinctHeight(precinct)
  const building = precinct.biome === null
  return (
    <>
    <group position={[cx, y, cz]}>
      {[-3.4, 3.4].map((dx) => (
        <mesh key={dx} position={[dx, 2, 0]} castShadow>
          <boxGeometry args={[0.5, 4, 0.5]} />
          <meshStandardMaterial color="#5e4128" flatShading />
        </mesh>
      ))}
      <Sign
        lines={[
          { text: precinct.name.toUpperCase(), size: 64, bold: true, color: '#fff2d4' },
          { text: precinct.subtitle, size: 36, color: '#fff2d4' },
        ]}
        position={[0, 4.1, 0]}
        width={6.2}
        height={1.1}
        background={building ? '#8a5a1c' : '#2f5d34'}
        border={building ? '#5c3a10' : '#20401f'}
        posts={false}
      />
      {building && <Hoardings />}
    </group>
      {!building && (
        <>
          <Bench x={cx - 2.2} z={cz + 6} rot={Math.PI / 2} />
          <Bench x={cx + 2.2} z={cz - 6} rot={-Math.PI / 2} />
        </>
      )}
    </>
  )
}

/** Construction-site hoardings ringing a precinct that's still being built. */
function Hoardings() {
  const R = 15
  const panels: { p: [number, number, number]; r: number }[] = []
  for (let t = -R + 2.5; t < R; t += 5) {
    panels.push({ p: [t, 1.1, -R], r: 0 }, { p: [t, 1.1, R], r: 0 }, { p: [-R, 1.1, t], r: Math.PI / 2 }, { p: [R, 1.1, t], r: Math.PI / 2 })
  }
  return (
    <>
      {panels.map((h, i) => (
        <mesh key={i} position={h.p} rotation={[0, h.r, 0]} castShadow>
          <boxGeometry args={[5, 2.2, 0.15]} />
          <meshStandardMaterial color={i % 2 ? '#e2b04a' : '#f2efe6'} flatShading />
        </mesh>
      ))}
      {/* Nobody gets onto the building site. */}
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[R, 2, R]} position={[0, 2, 0]} />
      </RigidBody>
      {[
        [4, 6],
        [-6, 7],
        [7, -5],
      ].map(([x, z], i) => (
        <mesh key={`c${i}`} position={[x, 0.4, z]} rotation={[0, i, 0]} castShadow>
          <boxGeometry args={[1.6, 0.8, 1.2]} />
          <meshStandardMaterial color="#9a9a94" flatShading />
        </mesh>
      ))}
    </>
  )
}

/** Visitors look into every open exhibit from the walkway beside it. */
function ZooVisitors() {
  const captured = useGame((s) => s.captured)
  const spots: ViewingSpot[] = PLOTS.filter((p) => (captured[p.creatureId] ?? 0) > 0).map((p) => ({
    x: p.x,
    z: p.precinct.center[1] + p.sz * 1.8,
    // Face into the plot (towards +z or −z from the walkway).
    facing: p.sz > 0 ? 0 : Math.PI,
    node: PRECINCT_NODE[p.precinct.id],
  }))
  return <Visitors spots={spots} />
}

/** Bushland on the slopes between precincts, with a dense tree line beyond the walls. */
function Bushland() {
  const props = useMemo<PlacedProp[]>(() => {
    const rng = mulberry32(99)
    const out: PlacedProp[] = []
    let tries = 0
    while (out.length < 170 && tries++ < 4000) {
      const x = range(rng, BOUNDS.minX, BOUNDS.maxX)
      const z = range(rng, BOUNDS.minZ, BOUNDS.maxZ)
      if (!isOpenGround(x, z)) continue
      const r = rng()
      out.push({ kind: r < 0.45 ? 'oak' : r < 0.7 ? 'pine' : 'bush', x, z, y: hubHeight(x, z) - 0.05, scale: range(rng, 0.7, 1.3), rot: rng() * 6.28, tint: rng() - 0.5 })
    }
    // Tree line beyond the north and east walls (the harbour bounds the south and west).
    for (let i = 0; i < 90; i++) {
      const north = rng() < 0.55
      const x = north ? range(rng, BOUNDS.minX - 10, BOUNDS.maxX + 12) : BOUNDS.maxX + range(rng, 2, 14)
      const z = north ? BOUNDS.minZ - range(rng, 2, 14) : range(rng, BOUNDS.minZ - 10, BOUNDS.maxZ)
      out.push({ kind: rng() < 0.5 ? 'pine' : 'oak', x, z, y: hubHeight(x, z) - 0.05, scale: range(rng, 1, 1.6), rot: rng() * 6.28, tint: rng() - 0.5 })
    }
    return out
  }, [])
  return <PropField props={props} />
}

function ShopKiosk() {
  const openModal = useSession((s) => s.openModal)
  const y = padHeight(SHOP[0], SHOP[1])
  useInteractable('shop', [SHOP[0] - 1.5, y + 1.5, SHOP[1]], 5, 'Browse the outfitter', () => openModal('shop'))
  return (
    <group position={[SHOP[0], y, SHOP[1]]} rotation={[0, -Math.PI / 2, 0]}>
      <mesh position={[0, 0.6, 0]} castShadow>
        <boxGeometry args={[4, 1.2, 1.4]} />
        <meshStandardMaterial color="#b35a3a" flatShading />
      </mesh>
      <mesh position={[0, 1.26, 0]}>
        <boxGeometry args={[4.2, 0.12, 1.6]} />
        <meshStandardMaterial color="#e7d3a6" flatShading />
      </mesh>
      {[-1.9, 1.9].map((x) => (
        <mesh key={x} position={[x, 1.8, -0.5]} castShadow>
          <boxGeometry args={[0.15, 2.4, 0.15]} />
          <meshStandardMaterial color="#5a3c24" flatShading />
        </mesh>
      ))}
      {Array.from({ length: 6 }, (_, i) => (
        <mesh key={i} position={[-1.75 + i * 0.7, 3.05, 0]} rotation={[0.35, 0, 0]} castShadow>
          <boxGeometry args={[0.7, 0.1, 2]} />
          <meshStandardMaterial color={i % 2 ? '#f2efe6' : '#3c7a5a'} flatShading />
        </mesh>
      ))}
      <Sign
        lines={[{ text: 'OUTFITTER', size: 80, bold: true, color: '#fff2d4' }]}
        position={[0, 3.55, -0.3]}
        width={3.2}
        height={0.6}
        background="#3c7a5a"
        border="#234a36"
        posts={false}
      />
      {/* Crates of gear */}
      <mesh position={[-1, 1.5, 0.1]} castShadow>
        <boxGeometry args={[0.5, 0.4, 0.4]} />
        <meshStandardMaterial color="#c9a45c" flatShading />
      </mesh>
      <mesh position={[0.8, 1.45, 0.2]} castShadow>
        <cylinderGeometry args={[0.18, 0.18, 0.3, 6]} />
        <meshStandardMaterial color="#d84c3c" flatShading />
      </mesh>
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[2, 1, 0.8]} position={[0, 1, 0]} />
      </RigidBody>
    </group>
  )
}

function Bench({ x, z, rot }: { x: number; z: number; rot: number }) {
  return (
    <group position={[x, padHeight(x, z), z]} rotation={[0, rot, 0]}>
      <mesh position={[0, 0.45, 0]} castShadow>
        <boxGeometry args={[1.8, 0.1, 0.5]} />
        <meshStandardMaterial color="#8d6440" flatShading />
      </mesh>
      <mesh position={[0, 0.8, -0.22]} castShadow>
        <boxGeometry args={[1.8, 0.5, 0.08]} />
        <meshStandardMaterial color="#8d6440" flatShading />
      </mesh>
      {[-0.75, 0.75].map((bx) => (
        <mesh key={bx} position={[bx, 0.22, 0]}>
          <boxGeometry args={[0.1, 0.45, 0.45]} />
          <meshStandardMaterial color="#3d3d3d" flatShading />
        </mesh>
      ))}
    </group>
  )
}

export function ZooHub() {
  useMemo(() => {
    terrain.height = hubHeight
  }, [])
  const spawnY = padHeight(SPAWN[0], SPAWN[1])
  const { minX, maxX, minZ, maxZ } = BOUNDS
  const cx = (minX + maxX) / 2
  const cz = (minZ + maxZ) / 2
  return (
    <>
      <color attach="background" args={['#bfe0f0']} />
      <fog attach="fog" args={['#cfe3ee', 90, 420]} />
      <hemisphereLight args={['#dff1ff', '#4b5d33', 1.0]} />
      <directionalLight
        position={[-40, 60, 50]}
        intensity={2.3}
        color="#fff3dc"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-90}
        shadow-camera-right={90}
        shadow-camera-top={90}
        shadow-camera-bottom={-90}
        shadow-camera-far={300}
      />
      <HubTerrain />
      <Harbour />
      <SkySafari />
      <ShopKiosk />
      <OwnedBuggy position={[BUGGY_PARK[0], padHeight(BUGGY_PARK[0], BUGGY_PARK[1]) + 0.4, BUGGY_PARK[1]]} heading={Math.PI} />
      <ZooVisitors />
      {PRECINCTS.map((p) => (
        <PrecinctHub key={p.id} precinct={p} />
      ))}
      {PLOTS.map((p) => (
        <Exhibit key={p.creatureId} {...p} />
      ))}
      <Bench x={-4.5} z={-46} rot={Math.PI / 2} />
      <Bench x={4.5} z={-46} rot={-Math.PI / 2} />
      <Sign
        lines={[
          { text: 'ZOO MAP', size: 72, bold: true },
          { text: 'Nura Diya ↖ · Tiger Trek ↗ · Savannah ← · Rainforest →', size: 28, color: '#5a4630' },
          { text: 'Great Southern Oceans ↘ · Expedition ferry ↓ at the wharf', size: 28, color: '#5a4630' },
        ]}
        position={[6.5, spawnY + 1.5, NODES.plaza[1] + 4]}
        rotation={[0, Math.PI + 0.7, 0]}
        width={3}
        height={1.4}
      />
      <Bushland />
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[(maxX - minX) / 2, 20, 1]} position={[cx, 10, minZ - 1]} />
        <CuboidCollider args={[(maxX - minX) / 2, 20, 1]} position={[cx, 10, maxZ + 1]} />
        <CuboidCollider args={[1, 20, (maxZ - minZ) / 2]} position={[minX - 1, 10, cz]} />
        <CuboidCollider args={[1, 20, (maxZ - minZ) / 2]} position={[maxX + 1, 10, cz]} />
      </RigidBody>
      {/* Arrive at the Main Entrance, looking down the hill towards the harbour. */}
      <Player spawn={[SPAWN[0], spawnY + 1.2, SPAWN[1]]} yaw={Math.PI} />
    </>
  )
}
