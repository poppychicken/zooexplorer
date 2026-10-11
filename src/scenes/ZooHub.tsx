import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { CuboidCollider, CylinderCollider, RigidBody } from '@react-three/rapier'
import { CanvasTexture, DoubleSide, Group, RepeatWrapping } from 'three'
import { Ground } from '../components/Ground'
import { Player } from '../components/Player'
import { PropField, type PlacedProp } from '../components/Props'
import { Sign } from '../components/Sign'
import { CreatureModel } from '../components/CreatureModel'
import { CREATURES, type CreatureDef, type Rarity } from '../game/data/creatures'
import { BIOME_BY_ID } from '../game/data/biomes'
import { useGame, useSession } from '../game/state/store'
import { useInteractable } from '../game/systems/interact'
import { mulberry32, range } from '../game/systems/rng'

const HALF = 60
const PLOT = 12

/** Darker rarity colours that read well on a light signboard. */
const RARITY_INK: Record<Rarity, string> = { common: '#4d6358', uncommon: '#2a78c2', rare: '#7a3fc0', legendary: '#b07a00' }

/** Exhibit plots: forest species on the west side of the main path, canyon species on the east. */
export const PLOTS: { creatureId: string; x: number; z: number; facing: 1 | -1 }[] = (() => {
  const forest = CREATURES.filter((c) => c.biome === 'forest')
  const canyon = CREATURES.filter((c) => c.biome === 'canyon')
  const zs = [-27, -9, 9, 27]
  return [
    ...forest.map((c, i) => ({ creatureId: c.id, x: -20, z: zs[i], facing: 1 as const })),
    ...canyon.map((c, i) => ({ creatureId: c.id, x: 20, z: zs[i], facing: -1 as const })),
  ]
})()

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
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[h, 1, 0.1]} position={[0, 1, -h]} />
        <CuboidCollider args={[h, 1, 0.1]} position={[0, 1, h]} />
        <CuboidCollider args={[0.1, 1, h]} position={[-h, 1, 0]} />
        <CuboidCollider args={[0.1, 1, h]} position={[h, 1, 0]} />
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
  const motion = useRef({ speed: 0 })
  const flies = !!def.flies
  const state = useRef(
    (() => {
      const rng = mulberry32(seed)
      const x = range(rng, -half, half)
      const z = range(rng, -half, half)
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
      s.tz = range(Math.random, -half, half)
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

const HABITAT_FLOOR: Record<CreatureDef['biome'], string> = { forest: '#4a6b34', canyon: '#d6a46c' }

function Habitat({ def, seed }: { def: CreatureDef; seed: number }) {
  const props = useMemo<PlacedProp[]>(() => {
    const rng = mulberry32(seed)
    const kinds = def.biome === 'forest' ? (['bush', 'rock', 'mushroom', 'log', 'bush'] as const) : (['rock', 'bush', 'rock', 'cactus'] as const)
    return Array.from({ length: 8 }, () => ({
      kind: kinds[Math.floor(rng() * kinds.length)],
      x: range(rng, -4.5, 4.5),
      z: range(rng, -4.5, 4.5),
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
      {/* Walk-through decor: the fence already keeps the player out. */}
      <PropField props={props} colliders={false} />
    </>
  )
}

function Exhibit({ creatureId, x, z, facing }: (typeof PLOTS)[number]) {
  const count = useGame((s) => s.captured[creatureId] ?? 0)
  const discovered = useGame((s) => !!s.discovered[creatureId])
  const def = CREATURES.find((c) => c.id === creatureId)!
  const open = count > 0
  const signX = x + facing * (PLOT / 2 + 0.6)
  const lines = open
    ? [
        { text: def.name, size: 64, bold: true },
        { text: `${def.flies ? 'AVIARY · ' : ''}${def.rarity.toUpperCase()} · ×${count}`, size: 38, color: RARITY_INK[def.rarity], bold: true },
        { text: `+$${def.income * count}/min`, size: 46, color: '#2e6b2e' },
      ]
    : [
        { text: discovered ? def.name : '???', size: 64, bold: true },
        { text: 'Exhibit coming soon', size: 40, color: '#6b5a44' },
        { text: `Found in: ${BIOME_BY_ID[def.biome].name}`, size: 34, color: '#6b5a44' },
      ]
  return (
    <group>
      <Fence x={x} z={z} size={PLOT} openSide={facing} />
      {/* Off to one side of the viewing spot so it doesn't block the enclosure. */}
      <Sign lines={lines} position={[signX, 1.1, z + 4.2]} rotation={[0, (facing * Math.PI) / 2, 0]} width={2} height={1} />
      <group position={[x, 0, z]}>
        {open ? (
          <>
            <Habitat def={def} seed={creatureId.length * 97 + x} />
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

function Paths() {
  const tiles: [number, number, number, number][] = [
    [0, -6, 8, 96], // main north-south path
    [-10.5, -27, 7, 8],
    [-10.5, -9, 7, 8],
    [-10.5, 9, 7, 8],
    [-10.5, 27, 7, 8],
    [10.5, -27, 7, 8],
    [10.5, -9, 7, 8],
    [10.5, 9, 7, 8],
    [10.5, 27, 7, 8],
  ]
  return (
    <>
      {tiles.map(([x, z, w, d], i) => (
        <mesh key={i} position={[x, 0.07, z]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[w, d]} />
          <meshStandardMaterial color="#cdb894" flatShading />
        </mesh>
      ))}
      <mesh position={[0, 0.075, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[7, 10]} />
        <meshStandardMaterial color="#d8c6a2" flatShading />
      </mesh>
    </>
  )
}

function Fountain() {
  return (
    <group>
      <mesh position={[0, 0.35, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[2.6, 2.8, 0.7, 10]} />
        <meshStandardMaterial color="#9a9a94" flatShading />
      </mesh>
      <mesh position={[0, 0.66, 0]}>
        <cylinderGeometry args={[2.3, 2.3, 0.05, 10]} />
        <meshStandardMaterial color="#5fb0d6" flatShading transparent opacity={0.85} />
      </mesh>
      <mesh position={[0, 1.4, 0]} castShadow>
        <cylinderGeometry args={[0.3, 0.45, 1.6, 8]} />
        <meshStandardMaterial color="#a8a8a2" flatShading />
      </mesh>
      <mesh position={[0, 2.3, 0]} castShadow>
        <icosahedronGeometry args={[0.55, 0]} />
        <meshStandardMaterial color="#e2b04a" flatShading metalness={0.4} roughness={0.4} />
      </mesh>
      <RigidBody type="fixed" colliders={false}>
        <CylinderCollider args={[0.6, 2.8]} position={[0, 0.6, 0]} />
      </RigidBody>
    </group>
  )
}

function ExpeditionGate() {
  const openModal = useSession((s) => s.openModal)
  useInteractable('gate', [0, 1.5, -46], 6, 'Plan an expedition', () => openModal('gate'))
  return (
    <group position={[0, 0, -48]}>
      {[-4, 4].map((x) => (
        <mesh key={x} position={[x, 3, 0]} castShadow>
          <boxGeometry args={[1.2, 6, 1.2]} />
          <meshStandardMaterial color="#6e4c2f" flatShading />
        </mesh>
      ))}
      <mesh position={[0, 6.3, 0]} castShadow>
        <boxGeometry args={[10, 1, 1.4]} />
        <meshStandardMaterial color="#5a3c24" flatShading />
      </mesh>
      <Sign
        lines={[{ text: 'EXPEDITIONS', size: 84, bold: true, color: '#fff2d4' }]}
        position={[0, 6.3, 0.75]}
        width={6}
        height={0.8}
        background="#2f5d34"
        border="#20401f"
        posts={false}
      />
      {/* The gate itself: a closed wooden door you can't walk through. */}
      <mesh position={[0, 2.6, 0]}>
        <boxGeometry args={[6.8, 5.2, 0.3]} />
        <meshStandardMaterial color="#8d6440" flatShading />
      </mesh>
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[5, 3.5, 0.8]} position={[0, 3.5, 0]} />
      </RigidBody>
      <mesh position={[0, 0.05, 3]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1.6, 8]} />
        <meshStandardMaterial color="#e2b04a" emissive="#e2b04a" emissiveIntensity={0.4} flatShading />
      </mesh>
    </group>
  )
}

function ShopKiosk() {
  const openModal = useSession((s) => s.openModal)
  useInteractable('shop', [9, 1.5, 32], 5, 'Browse the outfitter', () => openModal('shop'))
  return (
    <group position={[10.5, 0, 32]} rotation={[0, -Math.PI / 2, 0]}>
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

function Perimeter() {
  const props = useMemo<PlacedProp[]>(() => {
    const rng = mulberry32(99)
    const out: PlacedProp[] = []
    for (let i = 0; i < 110; i++) {
      const side = Math.floor(rng() * 4)
      const along = range(rng, -HALF - 4, HALF + 4)
      const depth = HALF + range(rng, 1, 9)
      const [x, z] = side === 0 ? [along, -depth] : side === 1 ? [along, depth] : side === 2 ? [-depth, along] : [depth, along]
      out.push({ kind: rng() < 0.6 ? 'pine' : 'oak', x, z, scale: range(rng, 0.9, 1.4), rot: rng() * 6.28, tint: rng() - 0.5 })
    }
    // Decorative planting along the main path.
    for (const z of [-40, -20, 20, 40]) {
      for (const x of [-6, 6]) out.push({ kind: 'oak', x, z, scale: 0.7, rot: rng() * 6.28, tint: rng() - 0.5 })
    }
    for (let i = 0; i < 30; i++) {
      out.push({ kind: 'bush', x: range(rng, -HALF, HALF), z: range(rng, 42, HALF - 2), scale: range(rng, 0.6, 1.1), rot: rng() * 6, tint: rng() - 0.5 })
    }
    return out
  }, [])
  return <PropField props={props} />
}

function Bench({ x, z, rot }: { x: number; z: number; rot: number }) {
  return (
    <group position={[x, 0, z]} rotation={[0, rot, 0]}>
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
  return (
    <>
      <color attach="background" args={['#bfe0f0']} />
      <fog attach="fog" args={['#bfe0f0', 40, 140]} />
      <hemisphereLight args={['#dff1ff', '#4b5d33', 1.0]} />
      <directionalLight
        position={[30, 50, 20]}
        intensity={2.3}
        color="#fff3dc"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-70}
        shadow-camera-right={70}
        shadow-camera-top={70}
        shadow-camera-bottom={-70}
      />
      <Ground size={HALF * 2 + 40} colors={['#6a9a4a', '#73a352', '#629045', '#7aab58']} seed={7} />
      <Paths />
      <Fountain />
      <ExpeditionGate />
      <ShopKiosk />
      <Bench x={-4.5} z={14} rot={Math.PI / 2} />
      <Bench x={4.5} z={14} rot={-Math.PI / 2} />
      <Bench x={-4.5} z={-14} rot={Math.PI / 2} />
      <Bench x={4.5} z={-14} rot={-Math.PI / 2} />
      <Sign
        lines={[
          { text: 'ZOO EXPLORER', size: 72, bold: true },
          { text: 'Gate north · Outfitter right', size: 36, color: '#5a4630' },
        ]}
        position={[-3.5, 1.4, 38]}
        rotation={[0, 0.4, 0]}
        width={2.6}
      />
      {PLOTS.map((p) => (
        <Exhibit key={p.creatureId} {...p} />
      ))}
      <Perimeter />
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[HALF, 4, 1]} position={[0, 4, -HALF - 1]} />
        <CuboidCollider args={[HALF, 4, 1]} position={[0, 4, HALF + 1]} />
        <CuboidCollider args={[1, 4, HALF]} position={[-HALF - 1, 4, 0]} />
        <CuboidCollider args={[1, 4, HALF]} position={[HALF + 1, 4, 0]} />
      </RigidBody>
      <Player spawn={[0, 1.2, 44]} yaw={0} />
    </>
  )
}
