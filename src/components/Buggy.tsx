import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { CoefficientCombineRule, CuboidCollider, RigidBody, interactionGroups, type RapierRigidBody } from '@react-three/rapier'
import { Group, Quaternion, Vector3 } from 'three'
import { useGame, useSession } from '../game/state/store'
import { isDown } from '../game/systems/input'
import { interactables } from '../game/systems/interact'
import { player, vehicle } from '../game/systems/world'

/** Arcade handling, in m/s and m/s². */
const MAX_SPEED = 16
const BOOST_SPEED = 24
const REVERSE_SPEED = 6
const ACCEL = 10
const BRAKE = 22
const COAST_DRAG = 5
const STEER_RATE = 1.9

/** Driver's seat (hip height) in the buggy's local space; forward is +z. */
const SEAT = new Vector3(0, 1.25, -0.25)

/** The buggy never touches the player's capsule (group 0), which rides along in the seat. */
const BUGGY_GROUPS = interactionGroups(2, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15])

const up = new Vector3(0, 1, 0)
const q = new Quaternion()
const tmp = new Vector3()

function BuggyModel({ wheels }: { wheels: React.MutableRefObject<(Group | null)[]> }) {
  return (
    <group>
      {/* Chassis, hood and seat */}
      <mesh position={[0, 0.85, 0]} castShadow>
        <boxGeometry args={[1.8, 0.45, 3]} />
        <meshStandardMaterial color="#e0702c" flatShading />
      </mesh>
      <mesh position={[0, 1.05, 1.05]} rotation={[-0.25, 0, 0]} castShadow>
        <boxGeometry args={[1.6, 0.25, 0.9]} />
        <meshStandardMaterial color="#c95f22" flatShading />
      </mesh>
      <mesh position={[0, 1.15, -0.45]}>
        <boxGeometry args={[0.7, 0.2, 0.6]} />
        <meshStandardMaterial color="#2b2b2b" flatShading />
      </mesh>
      <mesh position={[0, 1.45, -0.75]}>
        <boxGeometry args={[0.7, 0.6, 0.12]} />
        <meshStandardMaterial color="#2b2b2b" flatShading />
      </mesh>
      {/* Steering wheel */}
      <mesh position={[0, 1.45, 0.25]} rotation={[-0.9, 0, 0]}>
        <torusGeometry args={[0.18, 0.03, 4, 10]} />
        <meshStandardMaterial color="#1b1b1b" />
      </mesh>
      {/* Roll cage */}
      {[
        [-0.8, 0.45],
        [0.8, 0.45],
        [-0.8, -1.2],
        [0.8, -1.2],
      ].map(([x, z], i) => (
        <mesh key={i} position={[x, 1.7, z]}>
          <boxGeometry args={[0.08, 1.3, 0.08]} />
          <meshStandardMaterial color="#333" />
        </mesh>
      ))}
      <mesh position={[0, 2.35, -0.38]}>
        <boxGeometry args={[1.7, 0.08, 1.75]} />
        <meshStandardMaterial color="#333" />
      </mesh>
      {/* Headlights */}
      {[-0.55, 0.55].map((x) => (
        <mesh key={x} position={[x, 0.95, 1.52]}>
          <boxGeometry args={[0.3, 0.18, 0.05]} />
          <meshStandardMaterial color="#fff6cc" emissive="#fff6cc" emissiveIntensity={0.6} />
        </mesh>
      ))}
      {/* Wheels */}
      {[
        [-1, 1],
        [1, 1],
        [-1, -1],
        [1, -1],
      ].map(([x, z], i) => (
        <group key={i} position={[x, 0.45, z]} ref={(g) => void (wheels.current[i] = g)}>
          <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
            <cylinderGeometry args={[0.45, 0.45, 0.35, 8]} />
            <meshStandardMaterial color="#222" flatShading />
          </mesh>
          <mesh rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.2, 0.2, 0.37, 6]} />
            <meshStandardMaterial color="#9a9a9a" flatShading />
          </mesh>
        </group>
      ))}
    </group>
  )
}

/** A buggy you can climb into with E and drive around. */
export function Buggy({ position, heading = 0 }: { position: [number, number, number]; heading?: number }) {
  const body = useRef<RapierRigidBody>(null)
  const visual = useRef<Group>(null)
  const wheels = useRef<(Group | null)[]>([])
  const st = useRef({ heading, speed: 0, spin: 0 })

  // While parked, the buggy is something to interact with; it moves, so keep its position live.
  useEffect(() => {
    const id = 'buggy'
    const it = {
      position: new Vector3(...position),
      radius: 4.5,
      label: 'Drive the buggy',
      onInteract: () => {
        useSession.getState().setDriving(true)
        // Face forward in the driver's seat.
        player.yaw = st.current.heading + Math.PI
        player.pitch = -0.1
      },
    }
    interactables.set(id, it)
    const unsub = useSession.subscribe((s) => {
      if (s.driving) interactables.delete(id)
      else interactables.set(id, it)
    })
    return () => {
      unsub()
      interactables.delete(id)
      useSession.getState().setDriving(false)
    }
  }, [position])

  useFrame((_, rawDt) => {
    const rb = body.current
    if (!rb) return
    const dt = Math.min(rawDt, 0.05)
    const s = st.current
    const session = useSession.getState()
    const driving = session.driving
    const active = driving && session.locked && !session.modal

    // Measure how fast we are really going along our heading, so crashes kill the speed.
    const v = rb.linvel()
    const fx = Math.sin(s.heading)
    const fz = Math.cos(s.heading)
    s.speed = v.x * fx + v.z * fz

    let throttle = 0
    let steer = 0
    if (active) {
      if (isDown('KeyW') || isDown('ArrowUp')) throttle += 1
      if (isDown('KeyS') || isDown('ArrowDown')) throttle -= 1
      if (isDown('KeyA') || isDown('ArrowLeft')) steer += 1
      if (isDown('KeyD') || isDown('ArrowRight')) steer -= 1
    }
    const top = isDown('ShiftLeft') || isDown('ShiftRight') ? BOOST_SPEED : MAX_SPEED
    if (throttle > 0) s.speed = s.speed < 0 ? s.speed + BRAKE * dt : Math.min(top, s.speed + ACCEL * dt)
    else if (throttle < 0) s.speed = s.speed > 0 ? s.speed - BRAKE * dt : Math.max(-REVERSE_SPEED, s.speed - ACCEL * 0.6 * dt)
    else s.speed = Math.sign(s.speed) * Math.max(0, Math.abs(s.speed) - COAST_DRAG * dt)

    // Steering needs some speed, and flips when reversing like a real car.
    const grip = Math.min(1, Math.abs(s.speed) / 4)
    const dh = steer * STEER_RATE * grip * Math.sign(s.speed) * dt
    s.heading += dh
    vehicle.turned = driving ? dh : 0

    rb.setRotation(q.setFromAxisAngle(up, s.heading), true)
    rb.setLinvel({ x: Math.sin(s.heading) * s.speed, y: v.y, z: Math.cos(s.heading) * s.speed }, true)

    const p = rb.translation()
    tmp.copy(SEAT).applyAxisAngle(up, s.heading)
    vehicle.seat.set(p.x + tmp.x, p.y + tmp.y, p.z + tmp.z)
    vehicle.heading = s.heading
    vehicle.speed = s.speed
    const it = interactables.get('buggy')
    if (it) it.position.set(p.x, 1, p.z)

    s.spin += (s.speed / 0.45) * dt
    wheels.current.forEach((w, i) => {
      if (!w) return
      w.rotation.x = s.spin
      // Front wheels turn with the steering.
      w.rotation.y = i < 2 ? steer * 0.4 : 0
    })
    // A little body roll in corners.
    if (visual.current) visual.current.rotation.z = -steer * grip * 0.04
  })

  return (
    <RigidBody
      ref={body}
      position={position}
      rotation={[0, heading, 0]}
      colliders={false}
      enabledRotations={[false, false, false]}
      canSleep={false}
      friction={0}
      ccd
    >
      {/* Frictionless: speed is read back from the physics body to feel crashes, so ground friction would eat the throttle. */}
      <CuboidCollider args={[0.95, 0.5, 1.55]} position={[0, 0.85, 0]} collisionGroups={BUGGY_GROUPS} friction={0} frictionCombineRule={CoefficientCombineRule.Min} />
      <CuboidCollider args={[0.5, 0.1, 0.5]} position={[0, 0.1, 0]} collisionGroups={BUGGY_GROUPS} friction={0} frictionCombineRule={CoefficientCombineRule.Min} />
      <group ref={visual}>
        <BuggyModel wheels={wheels} />
      </group>
    </RigidBody>
  )
}

/** Only rendered once the player owns one. */
export function OwnedBuggy(props: { position: [number, number, number]; heading?: number }) {
  const owned = useGame((s) => s.owned.buggy)
  return owned ? <Buggy {...props} /> : null
}
