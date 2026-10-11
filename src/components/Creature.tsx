import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { BallCollider, RigidBody, type RapierRigidBody } from '@react-three/rapier'
import { Group, Vector3 } from 'three'
import { CreatureModel } from './CreatureModel'
import { CREATURE_BY_ID, type CreatureDef } from '../game/data/creatures'
import { BAIT } from '../game/data/shop'
import { useGame, useSession } from '../game/state/store'
import { playCall, playUi } from '../game/systems/audio'
import { isDown } from '../game/systems/input'
import { addTrack, baits, creatures, now, player, type CreatureRuntime } from '../game/systems/world'
import { startFlee } from '../game/systems/hunt'

interface Gait {
  walk: number
  run: number
}

const GAIT: Record<CreatureDef['placeholder']['shape'], Gait> = {
  quadruped: { walk: 1.5, run: 7 },
  bird: { walk: 1.2, run: 8 },
  tortoise: { walk: 0.5, run: 1.6 },
  lizard: { walk: 1, run: 4.5 },
  serpent: { walk: 2, run: 6.5 },
}

const DETECT: Record<CreatureDef['rarity'], number> = { common: 10, uncommon: 13, rare: 15, legendary: 16 }

export function detectionRadius(def: CreatureDef): number {
  const base = DETECT[def.rarity] * (def.placeholder.ears === 'huge' ? 1.3 : 1)
  // The buggy's engine carries furthest; sprinting footsteps come next.
  if (useSession.getState().driving) return base * 2
  const sprinting = isDown('ShiftLeft') || isDown('ShiftRight')
  return base * (sprinting ? 1.5 : 1)
}

const tmp = new Vector3()

function describeDirection(pos: Vector3): string {
  tmp.copy(pos).sub(player.position)
  const dist = Math.hypot(tmp.x, tmp.z)
  const angle = Math.atan2(tmp.x, tmp.z)
  const facing = Math.atan2(player.forward.x, player.forward.z)
  let rel = angle - facing
  rel = Math.atan2(Math.sin(rel), Math.cos(rel))
  const deg = (rel * 180) / Math.PI
  const dir = Math.abs(deg) < 35 ? 'ahead' : Math.abs(deg) > 145 ? 'behind you' : deg > 0 ? 'to your left' : 'to your right'
  const range = dist < 15 ? 'close by' : dist < 35 ? 'nearby' : 'in the distance'
  return `${dir}, ${range}`
}

const CALL_TEXT: Record<CreatureDef['call'], string> = {
  yip: 'sharp yips',
  grunt: 'snuffling grunts',
  hoot: 'a soft hoot',
  bell: 'a deep, bell-like bellow',
  chirp: 'high chirps',
  hiss: 'a dry hiss',
  rasp: 'a rasping hiss',
  chime: 'glassy chimes',
}

export function Creature({ uid, halfSize }: { uid: number; halfSize: number }) {
  const runtime = creatures.get(uid)!
  const def = CREATURE_BY_ID[runtime.creatureId]
  const gait = GAIT[def.placeholder.shape]
  const body = useRef<RapierRigidBody>(null)
  const visual = useRef<Group>(null)
  const motion = useRef({ speed: 0 })
  const captureT = useRef(0)
  const radius = def.placeholder.shape === 'serpent' ? 1.1 : Math.max(0.45, def.height * 0.55)

  const step = useMemo(() => makeStepper(runtime, def, gait, halfSize), [runtime, def, gait, halfSize])

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1)
    const c = runtime
    const g = visual.current
    if (!g) return
    if (c.mode === 'captured') {
      captureT.current += dt
      const s = Math.max(0.001, 1 - captureT.current / 0.8)
      g.scale.setScalar(s)
      g.position.y = captureT.current * 0.8
      return
    }
    if (useSession.getState().modal && c.mode !== 'struggling') {
      // Freeze the world while menus are open.
      motion.current.speed = 0
      return
    }
    const speed = step(dt)
    motion.current.speed = speed
    g.position.y = 0
    if (c.mode === 'struggling') {
      g.rotation.z = Math.sin(performance.now() / 60) * 0.12
    } else g.rotation.z = 0
    body.current?.setNextKinematicTranslation({ x: c.position.x, y: radius, z: c.position.z })
  })

  return (
    <>
      <RigidBody ref={body} type="kinematicPosition" colliders={false} position={[runtime.position.x, radius, runtime.position.z]} userData={{ creatureUid: uid }}>
        <BallCollider args={[radius]} sensor={false} />
      </RigidBody>
      <CreatureVisual runtime={runtime} groupRef={visual} def={def} motion={motion} />
    </>
  )
}

/** The model follows the runtime position directly (not the physics body) so it stays smooth. */
function CreatureVisual({
  runtime,
  groupRef,
  def,
  motion,
}: {
  runtime: CreatureRuntime
  groupRef: React.RefObject<Group | null>
  def: CreatureDef
  motion: React.MutableRefObject<{ speed: number }>
}) {
  const outer = useRef<Group>(null)
  useFrame(() => {
    const o = outer.current
    if (!o) return
    o.position.set(runtime.position.x, 0, runtime.position.z)
    o.rotation.y = runtime.heading
  })
  return (
    <group ref={outer}>
      <group ref={groupRef}>
        <CreatureModel def={def} motion={motion} />
      </group>
      {def.rarity === 'legendary' && <LegendaryAura color={def.placeholder.detail ?? '#fff'} size={def.placeholder.size} />}
    </group>
  )
}

function LegendaryAura({ color, size }: { color: string; size: number }) {
  const ref = useRef<Group>(null)
  useFrame(({ clock }) => {
    if (ref.current) ref.current.rotation.y = clock.elapsedTime * 0.6
  })
  return (
    <group ref={ref}>
      {Array.from({ length: 10 }, (_, i) => {
        const a = (i / 10) * Math.PI * 2
        const r = size * 0.6
        return (
          <mesh key={i} position={[Math.cos(a) * r, 0.4 + (i % 3) * 0.5, Math.sin(a) * r]} scale={0.06}>
            <icosahedronGeometry args={[1, 0]} />
            <meshBasicMaterial color={color} />
          </mesh>
        )
      })}
    </group>
  )
}

/** Builds the per-creature AI step. Returns the current ground speed. */
function makeStepper(c: CreatureRuntime, def: CreatureDef, gait: Gait, halfSize: number) {
  const legendary = def.rarity === 'legendary'
  let traveled = 0

  const pickWanderTarget = () => {
    const center = c.home ?? c.position
    const r = legendary ? 10 : 14
    c.target.set(center.x + (Math.random() - 0.5) * 2 * r, 0, center.z + (Math.random() - 0.5) * 2 * r)
    clampToBounds(c.target)
  }

  const clampToBounds = (v: Vector3) => {
    const lim = halfSize - 4
    v.x = Math.max(-lim, Math.min(lim, v.x))
    v.z = Math.max(-lim, Math.min(lim, v.z))
  }

  const moveToward = (tx: number, tz: number, speed: number, dt: number): number => {
    const dx = tx - c.position.x
    const dz = tz - c.position.z
    const d = Math.hypot(dx, dz)
    if (d < 0.05) return 0
    const stepLen = Math.min(d, speed * dt)
    c.position.x += (dx / d) * stepLen
    c.position.z += (dz / d) * stepLen
    clampToBounds(c.position)
    const target = Math.atan2(dx, dz)
    let diff = target - c.heading
    diff = Math.atan2(Math.sin(diff), Math.cos(diff))
    c.heading += diff * Math.min(1, dt * 6)
    traveled += stepLen
    const stride = Math.max(0.6, def.placeholder.size * 0.9)
    if (traveled > stride) {
      traveled = 0
      addTrack({ x: c.position.x, z: c.position.z, rot: c.heading, born: now(), size: Math.max(0.12, def.height * 0.35) })
    }
    return stepLen / dt
  }

  return (dt: number): number => {
    const t = now()
    const toPlayer = Math.hypot(player.position.x - c.position.x, player.position.z - c.position.z)

    // Discovery: get close enough to see it properly.
    if (toPlayer < 20 && useGame.getState().discover(c.creatureId)) {
      useSession.getState().toast(`New species spotted: ${def.name}! Added to your journal.`, legendary ? 'legendary' : 'info')
      playUi('discover')
    }

    // Calls let the player find creatures by ear.
    if (t > c.nextCallAt) {
      c.nextCallAt = t + (legendary ? 10 : 9) + Math.random() * 10
      if (toPlayer < 75) {
        playCall(def.call, c.position, legendary ? 2 : 1)
        const known = useGame.getState().discovered[c.creatureId]
        useSession.getState().logSound(`${capitalize(CALL_TEXT[def.call])} ${describeDirection(c.position)}${known ? ` (${def.name})` : ''}`)
      }
    }

    if (c.mode === 'struggling') return 0

    // Spooked by the player unless calmed by bait.
    const calm = c.mode === 'eating' || c.mode === 'calm'
    if (!calm && c.mode !== 'flee') {
      // Hungry creatures heading for bait are less wary.
      const detect = detectionRadius(def) * (c.mode === 'toBait' ? 0.4 : 1)
      if (toPlayer < detect) {
        startFlee(c, legendary ? 4 : 5)
        if (useGame.getState().discovered[c.creatureId]) useSession.getState().logSound(`The ${def.name} spotted you and bolted!`)
      }
    }

    switch (c.mode) {
      case 'flee': {
        if (t > c.modeUntil) {
          c.mode = 'wander'
          pickWanderTarget()
          return 0
        }
        let ax = c.position.x - player.position.x
        let az = c.position.z - player.position.z
        // Legendaries never stray far from their lair.
        if (c.home && c.home.distanceTo(c.position) > 22) {
          ax = c.home.x - c.position.x
          az = c.home.z - c.position.z
        }
        const len = Math.hypot(ax, az) || 1
        return moveToward(c.position.x + (ax / len) * 5, c.position.z + (az / len) * 5, gait.run, dt)
      }
      case 'toBait': {
        const bait = c.baitId != null ? baits.get(c.baitId) : undefined
        if (!bait) {
          c.mode = 'wander'
          pickWanderTarget()
          return 0
        }
        const d = Math.hypot(bait.position.x - c.position.x, bait.position.z - c.position.z)
        if (d < 0.9 + def.placeholder.size * 0.4) {
          c.mode = 'eating'
          c.calmUntil = t + BAIT[bait.premium ? 'premium' : 'basic'].calmSeconds
          useSession.getState().logSound(`The ${def.name} is eating the bait. It's calm now.`)
          return 0
        }
        return moveToward(bait.position.x, bait.position.z, gait.walk * 1.4, dt)
      }
      case 'eating':
      case 'calm': {
        if (t > c.calmUntil) {
          c.mode = 'wander'
          pickWanderTarget()
        }
        return 0
      }
      case 'wander':
      default: {
        // Bait draws creatures in.
        for (const b of baits.values()) {
          const reach = BAIT[b.premium ? 'premium' : 'basic'].attractRadius
          if (Math.hypot(b.position.x - c.position.x, b.position.z - c.position.z) < reach) {
            c.mode = 'toBait'
            c.baitId = b.id
            return 0
          }
        }
        if (t < c.modeUntil) return 0 // idle pause
        const d = Math.hypot(c.target.x - c.position.x, c.target.z - c.position.z)
        if (d < 0.5) {
          c.modeUntil = t + 1.5 + Math.random() * 4
          pickWanderTarget()
          return 0
        }
        return moveToward(c.target.x, c.target.z, gait.walk, dt)
      }
    }
  }
}

const capitalize = (s: string) => s[0].toUpperCase() + s.slice(1)
