import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { BallCollider, RigidBody, interactionGroups, type RapierRigidBody } from '@react-three/rapier'
import { Color, Group, InstancedMesh, Object3D, Vector3 } from 'three'
import { Ground } from '../components/Ground'
import { Player } from '../components/Player'
import { Bounds, PropField, type PlacedProp } from '../components/Props'
import { Sign } from '../components/Sign'
import { Creature } from '../components/Creature'
import { OwnedBuggy } from '../components/Buggy'
import { BIOME_BY_ID, type BiomeDef } from '../game/data/biomes'
import { CREATURE_BY_ID, type BiomeId } from '../game/data/creatures'
import { useSession } from '../game/state/store'
import { onKeyPress, onLockedClick } from '../game/systems/input'
import { useInteractable } from '../game/systems/interact'
import { dropBait, onNetThrown, resolveNetHit, throwNet, type NetShot } from '../game/systems/hunt'
import { updateListener } from '../game/systems/audio'
import { mulberry32, pickWeighted, range } from '../game/systems/rng'
import { TRACK_LIFETIME, baits, creatures, nextUid, now, player, resetWorld, tracks } from '../game/systems/world'

const SPAWN_CLEAR = 14
const LAIR_CLEAR = 10

function spawnPoint(biome: BiomeDef): [number, number, number] {
  return [0, 1.2, biome.halfSize - 10]
}

/** Seeded prop layout: identical on every visit, with clearings at the spawn and the lair. */
function scatterProps(biome: BiomeDef): PlacedProp[] {
  const rng = mulberry32(biome.seed)
  const [sx, , sz] = spawnPoint(biome)
  const [lx, lz] = biome.legendary.lair
  const out: PlacedProp[] = []
  for (const scatter of biome.props) {
    let placed = 0
    let attempts = 0
    while (placed < scatter.count && attempts++ < scatter.count * 20) {
      const x = range(rng, -biome.halfSize, biome.halfSize)
      const z = range(rng, -biome.halfSize, biome.halfSize)
      const big = scatter.kind === 'mesa' ? 14 : 0
      if (Math.hypot(x - sx, z - sz) < SPAWN_CLEAR + big) continue
      if (Math.hypot(x - lx, z - lz) < LAIR_CLEAR + big) continue
      if (scatter.kind === 'mesa' && Math.abs(x) < 20) continue
      out.push({ kind: scatter.kind, x, z, scale: range(rng, scatter.minScale, scatter.maxScale), rot: rng() * Math.PI * 2, tint: rng() - 0.5 })
      placed++
    }
  }
  // Boundary: a dense tree line or a ring of cliffs just outside the play area.
  const ring = biome.boundary === 'trees' ? 160 : 44
  for (let i = 0; i < ring; i++) {
    const side = i % 4
    const along = range(rng, -biome.halfSize - 6, biome.halfSize + 6)
    const depth = biome.halfSize + range(rng, 1, biome.boundary === 'trees' ? 8 : 6)
    const [x, z] = side === 0 ? [along, -depth] : side === 1 ? [along, depth] : side === 2 ? [-depth, along] : [depth, along]
    if (biome.boundary === 'trees') out.push({ kind: 'pine', x, z, scale: range(rng, 1.2, 1.8), rot: rng() * 6.28, tint: rng() - 0.5 })
    else out.push({ kind: 'mesa', x, z, scale: range(rng, 0.9, 1.4), rot: rng() * 6.28, tint: rng() - 0.5 })
  }
  return out
}

function spawnCreature(creatureId: string, x: number, z: number, home: boolean) {
  const uid = nextUid()
  const position = new Vector3(x, 0, z)
  creatures.set(uid, {
    uid,
    creatureId,
    position,
    heading: Math.random() * Math.PI * 2,
    speed: 0,
    mode: 'wander',
    modeUntil: now() + Math.random() * 3,
    target: position.clone(),
    baitId: null,
    calmUntil: 0,
    nextCallAt: now() + 3 + Math.random() * 12,
    lastTrack: position.clone(),
    home: home ? position.clone() : null,
  })
  return uid
}

/** Pick a spawn spot away from the player. */
function randomSpot(biome: BiomeDef, minFromPlayer: number): [number, number] {
  for (let i = 0; i < 30; i++) {
    const x = range(Math.random, -biome.halfSize + 8, biome.halfSize - 8)
    const z = range(Math.random, -biome.halfSize + 8, biome.halfSize - 8)
    if (Math.hypot(x - player.position.x, z - player.position.z) > minFromPlayer) return [x, z]
  }
  return [0, -biome.halfSize / 2]
}

function useCreaturePopulation(biome: BiomeDef): number[] {
  const [uids, setUids] = useState<number[]>([])
  useEffect(() => {
    resetWorld()
    const [sx, , sz] = spawnPoint(biome)
    player.position.set(sx, 0, sz)
    for (let i = 0; i < biome.population; i++) {
      const entry = pickWeighted(Math.random, biome.spawns)
      const [x, z] = randomSpot(biome, 30)
      spawnCreature(entry.creatureId, x, z, false)
    }
    const [lx, lz] = biome.legendary.lair
    spawnCreature(biome.legendary.creatureId, lx, lz, true)
    setUids([...creatures.keys()])

    // Top the population back up as creatures are captured.
    const id = setInterval(() => {
      const normal = [...creatures.values()].filter((c) => CREATURE_BY_ID[c.creatureId].rarity !== 'legendary')
      if (normal.length < biome.population) {
        const entry = pickWeighted(Math.random, biome.spawns)
        const [x, z] = randomSpot(biome, 45)
        spawnCreature(entry.creatureId, x, z, false)
      }
      setUids((prev) => {
        const next = [...creatures.keys()]
        return next.length === prev.length && next.every((u, i) => u === prev[i]) ? prev : next
      })
    }, 1000)
    return () => {
      clearInterval(id)
      resetWorld()
    }
  }, [biome])

  return uids
}

function Tracks() {
  const ref = useRef<InstancedMesh>(null)
  const obj = useMemo(() => new Object3D(), [])
  const MAX = 600
  useFrame(() => {
    const mesh = ref.current
    if (!mesh) return
    const t = now()
    let n = 0
    for (const tr of tracks) {
      const age = t - tr.born
      if (age > TRACK_LIFETIME) continue
      const fade = 1 - age / TRACK_LIFETIME
      // Two prints side by side per stride.
      for (const side of [-1, 1]) {
        if (n >= MAX) break
        obj.position.set(tr.x + Math.cos(tr.rot) * side * tr.size * 0.5, 0.06, tr.z - Math.sin(tr.rot) * side * tr.size * 0.5)
        obj.rotation.set(-Math.PI / 2, 0, tr.rot)
        const s = tr.size * (0.5 + fade * 0.5)
        obj.scale.set(s * 0.6, s, 1)
        obj.updateMatrix()
        mesh.setMatrixAt(n++, obj.matrix)
      }
    }
    mesh.count = n
    mesh.instanceMatrix.needsUpdate = true
  })
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, MAX]} frustumCulled={false}>
      <circleGeometry args={[0.5, 6]} />
      <meshBasicMaterial color="#2a1c10" transparent opacity={0.55} depthWrite={false} />
    </instancedMesh>
  )
}

function Baits() {
  const [list, setList] = useState<number[]>([])
  useEffect(() => {
    const id = setInterval(() => {
      const t = now()
      for (const [k, b] of baits) if (t > b.expiresAt) baits.delete(k)
      setList((prev) => {
        const next = [...baits.keys()]
        return next.length === prev.length && next.every((u, i) => u === prev[i]) ? prev : next
      })
    }, 250)
    return () => clearInterval(id)
  }, [])
  return (
    <>
      {list.map((id) => {
        const b = baits.get(id)
        if (!b) return null
        return (
          <group key={id} position={b.position}>
            <mesh position={[0, 0.12, 0]} castShadow>
              <dodecahedronGeometry args={[0.18, 0]} />
              <meshStandardMaterial color={b.premium ? '#ffcc4d' : '#c79a5b'} emissive={b.premium ? '#ff9a00' : '#000'} emissiveIntensity={0.6} flatShading />
            </mesh>
            <mesh position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[0.35, 0.45, 12]} />
              <meshBasicMaterial color={b.premium ? '#ffcc4d' : '#f2e2c2'} transparent opacity={0.6} />
            </mesh>
          </group>
        )
      })}
    </>
  )
}

/** Nets collide with everything except the player (group 0). */
const NET_GROUPS = interactionGroups(1, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15])

function NetProjectile({ shot, onDone }: { shot: NetShot; onDone: (id: number) => void }) {
  const body = useRef<RapierRigidBody>(null)
  const mesh = useRef<Group>(null)
  const done = useRef(false)
  const born = useRef(performance.now())
  const finish = () => {
    if (done.current) return
    done.current = true
    onDone(shot.id)
  }
  useEffect(() => {
    const t = setTimeout(() => {
      done.current = true
      onDone(shot.id)
    }, 3000)
    return () => clearTimeout(t)
  }, [onDone, shot.id])
  useFrame((_, dt) => {
    if (mesh.current) {
      const age = (performance.now() - born.current) / 1000
      mesh.current.scale.setScalar(Math.min(1, 0.3 + age * 3))
      mesh.current.rotation.y += dt * 8
    }
  })
  return (
    <RigidBody
      ref={body}
      position={shot.origin}
      linearVelocity={shot.velocity}
      colliders={false}
      ccd
      gravityScale={0.9}
      onCollisionEnter={({ other }) => {
        const data = other.rigidBody?.userData as { creatureUid?: number } | undefined
        if (data?.creatureUid != null) {
          resolveNetHit(data.creatureUid)
          finish()
        } else if (performance.now() - born.current > 250) {
          // Hit the ground or scenery: the net falls flat and is gone.
          setTimeout(finish, 400)
        }
      }}
    >
      <BallCollider args={[0.45]} collisionGroups={NET_GROUPS} />
      <group ref={mesh}>
        <mesh>
          <icosahedronGeometry args={[0.55, 1]} />
          <meshBasicMaterial color="#f5f0dc" wireframe />
        </mesh>
        <mesh>
          <torusGeometry args={[0.55, 0.04, 4, 10]} />
          <meshStandardMaterial color="#5b4630" flatShading />
        </mesh>
      </group>
    </RigidBody>
  )
}

function Nets() {
  const [shots, setShots] = useState<NetShot[]>([])
  useEffect(() => onNetThrown((s) => setShots((prev) => [...prev, s])), [])
  const remove = useCallback((id: number) => setShots((prev) => prev.filter((s) => s.id !== id)), [])
  return (
    <>
      {shots.map((s) => (
        <NetProjectile key={s.id} shot={s} onDone={remove} />
      ))}
    </>
  )
}

function Lair({ biome }: { biome: BiomeDef }) {
  const [x, z] = biome.legendary.lair
  const def = CREATURE_BY_ID[biome.legendary.creatureId]
  const ring = useRef<Group>(null)
  useFrame(({ clock }) => {
    if (ring.current) ring.current.rotation.y = clock.elapsedTime * 0.2
  })
  const stones = biome.id === 'forest' ? '#7d8a78' : '#e8d9b8'
  return (
    <group position={[x, 0, z]}>
      <group ref={ring}>
        {Array.from({ length: 9 }, (_, i) => {
          const a = (i / 9) * Math.PI * 2
          return (
            <mesh key={i} position={[Math.cos(a) * 9, 1.2, Math.sin(a) * 9]} rotation={[0, -a, 0.05]} castShadow>
              <boxGeometry args={[0.8, 2.4 + (i % 3) * 0.6, 0.6]} />
              <meshStandardMaterial color={stones} flatShading />
            </mesh>
          )
        })}
      </group>
      <mesh position={[0, 0.07, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[6, 6.4, 24]} />
        <meshBasicMaterial color={def.placeholder.detail ?? '#fff'} transparent opacity={0.5} />
      </mesh>
      <pointLight color={def.placeholder.detail ?? '#fff'} intensity={6} distance={18} position={[0, 3, 0]} />
    </group>
  )
}

function ReturnSign({ biome }: { biome: BiomeDef }) {
  const goTo = useSession((s) => s.goTo)
  const [sx, , sz] = spawnPoint(biome)
  // Ahead and to the right of where you arrive, angled to face you.
  const pos: [number, number, number] = [sx + 5, 1.3, sz - 2]
  useInteractable(`return-${biome.id}`, pos, 4, 'Return to the zoo', () => goTo({ kind: 'hub' }))
  return <Sign lines={[{ text: '← ZOO', size: 90, bold: true }, { text: 'Press E to head home', size: 40, color: '#5a4630' }]} position={pos} rotation={[0, -1.19, 0]} />
}

function HuntControls() {
  useEffect(() => {
    const offKey = onKeyPress((code) => {
      const s = useSession.getState()
      if (code === 'KeyQ' && s.locked && !s.modal) {
        if (s.driving) s.toast('Get out of the buggy (E) to place bait.', 'info')
        else dropBait()
      }
    })
    const offClick = onLockedClick(() => {
      const s = useSession.getState()
      if (s.modal) return
      if (s.driving) s.toast('Get out of the buggy (E) to throw a net.', 'info')
      else throwNet()
    })
    return () => {
      offKey()
      offClick()
    }
  }, [])
  useFrame(() => updateListener(player.eye, player.forward))
  return null
}

export function Biome({ biomeId }: { biomeId: BiomeId }) {
  const biome = BIOME_BY_ID[biomeId]
  const props = useMemo(() => scatterProps(biome), [biome])
  const uids = useCreaturePopulation(biome)
  const spawn = spawnPoint(biome)
  const sky = useMemo(() => new Color(biome.sky), [biome])
  const [sunX, sunY, sunZ] = biome.sun.position
  const h = biome.halfSize

  useLayoutEffect(() => {
    useSession.getState().toast(`Arrived at the ${biome.name}. Follow tracks and listen for calls.`, 'info')
  }, [biome])

  return (
    <>
      <color attach="background" args={[sky.getStyle()]} />
      <fog attach="fog" args={[biome.sky, biome.fog[0], biome.fog[1]]} />
      <hemisphereLight args={[biome.ambient.sky, biome.ambient.ground, biome.ambient.intensity]} />
      <directionalLight
        position={[sunX, sunY, sunZ]}
        intensity={biome.sun.intensity}
        color={biome.sun.color}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-h}
        shadow-camera-right={h}
        shadow-camera-top={h}
        shadow-camera-bottom={-h}
        shadow-camera-far={300}
      />
      <Ground size={h * 2 + 60} colors={biome.ground} seed={biome.seed} segments={80} />
      <PropField props={props} />
      <Bounds half={h} />
      <Lair biome={biome} />
      <ReturnSign biome={biome} />
      {/* Parked facing into the biome, next to where you arrive. */}
      <OwnedBuggy position={[spawn[0] - 4.5, 0.2, spawn[2] - 1]} heading={Math.PI} />
      <Tracks />
      <Baits />
      <Nets />
      {uids.map((uid) => (
        <Creature key={uid} uid={uid} halfSize={h} />
      ))}
      <HuntControls />
      <Player spawn={spawn} yaw={0} />
    </>
  )
}
