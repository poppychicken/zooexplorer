import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { CuboidCollider, RigidBody } from '@react-three/rapier'
import { Group } from 'three'
import { Sign } from './Sign'
import { useGame } from '../game/state/store'
import { formatPrice, ticketPrice, visitorsPerMinute } from '../game/systems/economy'
import { mulberry32, range } from '../game/systems/rng'

/**
 * Cosmetic crowd for the zoo hub. Visitors walk in from the south entrance, pay at the
 * ticket booth and wander between open exhibits. Money itself is credited by the economy
 * tick (visitors/min × ticket price) so offline earnings stay consistent; each visitor
 * shows the ticket price as they pay, at the same average rate.
 */

export interface ViewingSpot {
  x: number
  z: number
  /** Direction to face while looking into the enclosure. */
  facing: number
}

const ENTRANCE_Z = 58
const BOOTH: [number, number] = [-2.6, 51]
const SKIN = ['#f1c9a5', '#e0ac69', '#c68642', '#8d5524', '#ffdbac']
const SHIRT = ['#d84c3c', '#3c7ad8', '#e2b04a', '#5aa469', '#9b59b6', '#f2efe6', '#e67e22', '#2c3e50']
const PANTS = ['#2c3e50', '#4a4a4a', '#6b4a2e', '#34495e', '#7f8c8d']
const HAIR = ['#2b1d10', '#5a3d28', '#d9b380', '#111111', '#a0522d']

interface Plan {
  points: [number, number][]
  /** Seconds to linger at each point (0 = walk straight on). */
  pauses: number[]
  /** Facing while lingering, or null to keep the walking direction. */
  faces: (number | null)[]
}

/** Walk lane down the main path, stepping round the fountain in the plaza. */
function laneTo(from: [number, number], toZ: number, laneX: number): [number, number][] {
  const out: [number, number][] = []
  const crosses = (from[1] > 3 && toZ < 3) || (from[1] < -3 && toZ > -3)
  if (crosses) {
    const side = laneX >= 0 ? 1 : -1
    const dir = toZ < from[1] ? -1 : 1
    out.push([side * 4.6, -dir * 3.5], [side * 4.6, dir * 3.5])
  }
  out.push([laneX, toZ])
  return out
}

function makePlan(rng: () => number, spots: ViewingSpot[], startInside: boolean): Plan {
  const laneX = range(rng, -2.4, 2.4)
  const points: [number, number][] = []
  const pauses: number[] = []
  const faces: (number | null)[] = []
  const add = (p: [number, number], pause = 0, face: number | null = null) => {
    points.push(p)
    pauses.push(pause)
    faces.push(face)
  }
  if (!startInside) {
    add([range(rng, -1.5, 1.5), ENTRANCE_Z])
    add([BOOTH[0] + 1.3, BOOTH[1]], 1.6, -Math.PI / 2) // facing the booth window (west)
  }
  let at: [number, number] = startInside ? [laneX, range(rng, -30, 40)] : [laneX, BOOTH[1]]
  if (startInside) add(at)
  const stops = 1 + Math.floor(rng() * 3)
  for (let i = 0; i < stops && spots.length; i++) {
    const spot = spots[Math.floor(rng() * spots.length)]
    for (const p of laneTo(at, spot.z, laneX)) add(p)
    add([spot.x, spot.z + range(rng, -3.5, 3.5)], range(rng, 4, 9), spot.facing)
    add([laneX, spot.z])
    at = [laneX, spot.z]
  }
  for (const p of laneTo(at, ENTRANCE_Z - 4, laneX)) add(p)
  add([range(rng, -1.5, 1.5), ENTRANCE_Z + 1])
  return { points, pauses, faces }
}

function Visitor({
  seed,
  spots,
  startInside,
  onPay,
  onLeave,
}: {
  seed: number
  spots: ViewingSpot[]
  startInside: boolean
  onPay: () => void
  onLeave: () => void
}) {
  const look = useMemo(() => {
    const rng = mulberry32(seed)
    const pick = <T,>(a: T[]) => a[Math.floor(rng() * a.length)]
    return {
      skin: pick(SKIN),
      shirt: pick(SHIRT),
      pants: pick(PANTS),
      hair: pick(HAIR),
      hat: rng() < 0.25 ? pick(SHIRT) : null,
      scale: rng() < 0.2 ? range(rng, 0.6, 0.75) : range(rng, 0.92, 1.08),
      speed: range(rng, 1.1, 1.6),
    }
  }, [seed])
  const plan = useMemo(() => makePlan(mulberry32(seed * 31 + 7), spots, startInside), [seed, spots, startInside])
  const root = useRef<Group>(null)
  const legs = useRef<(Group | null)[]>([])
  const arms = useRef<(Group | null)[]>([])
  const st = useRef({ i: 1, x: plan.points[0][0], z: plan.points[0][1], heading: Math.PI, wait: 0, phase: 0, done: false })

  useFrame((_, rawDt) => {
    const s = st.current
    const g = root.current
    if (!g || s.done) return
    const dt = Math.min(rawDt, 0.1)
    let moving = false
    if (s.wait > 0) {
      s.wait -= dt
      const face = plan.faces[s.i - 1]
      if (face !== null && face !== undefined) {
        let diff = face - s.heading
        diff = Math.atan2(Math.sin(diff), Math.cos(diff))
        s.heading += diff * Math.min(1, dt * 4)
      }
    } else if (s.i >= plan.points.length) {
      s.done = true
      onLeave()
      return
    } else {
      const [tx, tz] = plan.points[s.i]
      const dx = tx - s.x
      const dz = tz - s.z
      const d = Math.hypot(dx, dz)
      if (d < 0.15) {
        s.wait = plan.pauses[s.i]
        // The booth stop is where the ticket is paid.
        if (!startInside && s.i === 1) onPay()
        s.i++
      } else {
        const step = Math.min(d, look.speed * dt)
        s.x += (dx / d) * step
        s.z += (dz / d) * step
        let diff = Math.atan2(dx, dz) - s.heading
        diff = Math.atan2(Math.sin(diff), Math.cos(diff))
        s.heading += diff * Math.min(1, dt * 8)
        moving = true
      }
    }
    s.phase += dt * (moving ? look.speed * 6 : 0)
    const swing = moving ? Math.sin(s.phase) * 0.6 : 0
    legs.current.forEach((l, k) => l && (l.rotation.x = k ? -swing : swing))
    arms.current.forEach((a, k) => a && (a.rotation.x = k ? swing * 0.7 : -swing * 0.7))
    g.position.set(s.x, 0, s.z)
    g.rotation.y = s.heading
  })

  return (
    <group ref={root} scale={look.scale}>
      {[-0.12, 0.12].map((x, k) => (
        <group key={k} position={[x, 0.85, 0]} ref={(el) => void (legs.current[k] = el)}>
          <mesh position={[0, -0.42, 0]} castShadow>
            <boxGeometry args={[0.16, 0.85, 0.18]} />
            <meshStandardMaterial color={look.pants} flatShading />
          </mesh>
        </group>
      ))}
      <mesh position={[0, 1.2, 0]} castShadow>
        <boxGeometry args={[0.46, 0.65, 0.26]} />
        <meshStandardMaterial color={look.shirt} flatShading />
      </mesh>
      {[-0.3, 0.3].map((x, k) => (
        <group key={k} position={[x, 1.48, 0]} ref={(el) => void (arms.current[k] = el)}>
          <mesh position={[0, -0.3, 0]}>
            <boxGeometry args={[0.12, 0.6, 0.14]} />
            <meshStandardMaterial color={look.shirt} flatShading />
          </mesh>
          <mesh position={[0, -0.64, 0]}>
            <boxGeometry args={[0.1, 0.1, 0.1]} />
            <meshStandardMaterial color={look.skin} flatShading />
          </mesh>
        </group>
      ))}
      <mesh position={[0, 1.7, 0]} castShadow>
        <icosahedronGeometry args={[0.17, 0]} />
        <meshStandardMaterial color={look.skin} flatShading />
      </mesh>
      <mesh position={[0, 1.8, -0.03]} scale={[1, 0.6, 1]}>
        <icosahedronGeometry args={[0.18, 0]} />
        <meshStandardMaterial color={look.hat ?? look.hair} flatShading />
      </mesh>
      {look.hat && (
        <mesh position={[0, 1.82, 0.08]} rotation={[0.2, 0, 0]}>
          <cylinderGeometry args={[0.24, 0.24, 0.03, 8]} />
          <meshStandardMaterial color={look.hat} flatShading />
        </mesh>
      )}
    </group>
  )
}

interface Popup {
  id: number
  text: string
}

function TicketBooth({ popups }: { popups: Popup[] }) {
  const captured = useGame((s) => s.captured)
  const price = ticketPrice(captured)
  const open = price > 0
  return (
    <group position={[BOOTH[0], 0, BOOTH[1]]}>
      <mesh position={[-0.6, 1.3, 0]} castShadow>
        <boxGeometry args={[1.8, 2.6, 2.2]} />
        <meshStandardMaterial color="#e7d3a6" flatShading />
      </mesh>
      {/* Service window and counter facing the path. */}
      <mesh position={[0.31, 1.45, 0]}>
        <boxGeometry args={[0.04, 0.8, 1.3]} />
        <meshStandardMaterial color="#2a3a44" flatShading />
      </mesh>
      <mesh position={[0.45, 1.0, 0]}>
        <boxGeometry args={[0.35, 0.08, 1.5]} />
        <meshStandardMaterial color="#8d6440" flatShading />
      </mesh>
      <mesh position={[-0.6, 2.75, 0]} rotation={[0, 0, 0.12]} castShadow>
        <boxGeometry args={[2.3, 0.15, 2.6]} />
        <meshStandardMaterial color="#b35a3a" flatShading />
      </mesh>
      <Sign
        lines={open ? [{ text: 'TICKETS', size: 64, bold: true, color: '#fff2d4' }, { text: formatPrice(price), size: 80, bold: true, color: '#ffe7a0' }] : [{ text: 'CLOSED', size: 70, bold: true, color: '#fff2d4' }, { text: 'No animals yet', size: 44, color: '#fff2d4' }]}
        position={[0.36, 2.25, 0]}
        rotation={[0, Math.PI / 2, 0]}
        width={1.5}
        height={0.62}
        background="#3c7a5a"
        border="#234a36"
        posts={false}
      />
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[0.9, 1.3, 1.1]} position={[-0.6, 1.3, 0]} />
      </RigidBody>
      {popups.map((p) => (
        <Html key={p.id} position={[1.4, 2.4, 0]} center style={{ pointerEvents: 'none' }}>
          <div className="pay-popup">{p.text}</div>
        </Html>
      ))}
    </group>
  )
}

function EntranceArch() {
  return (
    <group position={[0, 0, 54.5]}>
      {[-4.4, 4.4].map((x) => (
        <mesh key={x} position={[x, 2.2, 0]} castShadow>
          <boxGeometry args={[0.7, 4.4, 0.7]} />
          <meshStandardMaterial color="#6e4c2f" flatShading />
        </mesh>
      ))}
      <Sign
        lines={[{ text: 'WELCOME TO THE ZOO', size: 70, bold: true, color: '#fff2d4' }]}
        position={[0, 4.4, 0]}
        width={7}
        height={0.8}
        background="#2f5d34"
        border="#20401f"
        posts={false}
      />
    </group>
  )
}

let nextVisitorId = 1

export function Visitors({ spots }: { spots: ViewingSpot[] }) {
  const captured = useGame((s) => s.captured)
  const rate = visitorsPerMinute(captured)
  const [crowd, setCrowd] = useState<{ id: number; startInside: boolean }[]>([])
  const [popups, setPopups] = useState<Popup[]>([])
  const spotsKey = spots.map((s) => `${s.x},${s.z}`).join('|')
  // Only restart the crowd when the set of open exhibits changes, not on every render.
  const stableSpots = useMemo(() => spots, [spotsKey])

  useEffect(() => {
    if (rate <= 0 || stableSpots.length === 0) {
      setCrowd([])
      return
    }
    // A few people are already looking around when you arrive.
    setCrowd((c) => (c.length ? c : Array.from({ length: 3 }, () => ({ id: nextVisitorId++, startInside: true }))))
    const id = setInterval(() => setCrowd((c) => (c.length >= 14 ? c : [...c, { id: nextVisitorId++, startInside: false }])), (60 / rate) * 1000)
    return () => clearInterval(id)
  }, [rate, stableSpots])

  const pay = () => {
    const id = nextVisitorId++
    setPopups((p) => [...p, { id, text: `+${formatPrice(ticketPrice(useGame.getState().captured))}` }])
    setTimeout(() => setPopups((p) => p.filter((x) => x.id !== id)), 1600)
  }

  return (
    <>
      <EntranceArch />
      <TicketBooth popups={popups} />
      {crowd.map((v) => (
        <Visitor
          key={v.id}
          seed={v.id * 9973}
          spots={stableSpots}
          startInside={v.startInside}
          onPay={pay}
          onLeave={() => setCrowd((c) => c.filter((x) => x.id !== v.id))}
        />
      ))}
    </>
  )
}
