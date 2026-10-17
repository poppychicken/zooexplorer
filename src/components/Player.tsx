import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { CapsuleCollider, RigidBody, interactionGroups, useRapier, type RapierRigidBody } from '@react-three/rapier'
import { Euler, Vector3 } from 'three'
import { consumeLook, isDown, onKeyPress } from '../game/systems/input'
import { findFocus } from '../game/systems/interact'
import { player, terrain, vehicle } from '../game/systems/world'
import { useGame, useSession } from '../game/state/store'

const WALK = 5
const SPRINT = 8.5
const JUMP = 5.5
const EYE = 0.75
const LOOK_SPEED = 0.0022

const euler = new Euler(0, 0, 0, 'YXZ')
const move = new Vector3()
const fwd = new Vector3()
const right = new Vector3()

export function Player({ spawn, yaw = 0 }: { spawn: [number, number, number]; yaw?: number }) {
  const body = useRef<RapierRigidBody>(null)
  const camera = useThree((s) => s.camera)
  const { rapier, world } = useRapier()
  const jumpQueued = useRef(false)

  useEffect(() => {
    player.yaw = yaw
    player.pitch = 0
    consumeLook()
    player.teleport = (x, z, newYaw) => {
      body.current?.setTranslation({ x, y: terrain.height(x, z) + 1.2, z }, true)
      if (newYaw !== undefined) player.yaw = newYaw
    }
  }, [yaw])

  /** Step out on the driver's side of the buggy. */
  const exitVehicle = () => {
    const side = new Vector3(Math.cos(vehicle.heading), 0, -Math.sin(vehicle.heading)).multiplyScalar(1.9)
    body.current?.setTranslation({ x: vehicle.seat.x + side.x, y: vehicle.seat.y, z: vehicle.seat.z + side.z }, true)
    useSession.getState().setDriving(false)
  }

  useEffect(
    () =>
      onKeyPress((code) => {
        const s = useSession.getState()
        if (s.modal || !s.locked) return
        if (code === 'Space') jumpQueued.current = true
        if (code === 'KeyE') {
          if (s.driving) exitVehicle()
          else findFocus(player.eye, player.forward)?.onInteract()
        }
      }),
    [],
  )

  useFrame(() => {
    const rb = body.current
    if (!rb) return
    if (player.arrival) {
      // Applied on the first frame, once the scene has set up its ground.
      const { x, z, yaw } = player.arrival
      player.arrival = null
      player.teleport(x, z, yaw)
    }
    const session = useSession.getState()
    const active = session.locked && !session.modal

    const [dx, dy] = consumeLook()
    // The view turns with the buggy while driving.
    if (session.driving) player.yaw += vehicle.turned
    if (active) {
      const sens = LOOK_SPEED * useGame.getState().mouseSensitivity
      player.yaw -= dx * sens
      player.pitch = Math.max(-1.45, Math.min(1.45, player.pitch - dy * sens))
    }

    euler.set(player.pitch, player.yaw, 0)
    camera.quaternion.setFromEuler(euler)
    camera.getWorldDirection(player.forward)

    fwd.set(-Math.sin(player.yaw), 0, -Math.cos(player.yaw))
    right.set(-fwd.z, 0, fwd.x)
    move.set(0, 0, 0)
    if (active) {
      if (isDown('KeyW') || isDown('ArrowUp')) move.add(fwd)
      if (isDown('KeyS') || isDown('ArrowDown')) move.sub(fwd)
      if (isDown('KeyD') || isDown('ArrowRight')) move.add(right)
      if (isDown('KeyA') || isDown('ArrowLeft')) move.sub(right)
    }
    const speed = isDown('ShiftLeft') || isDown('ShiftRight') ? SPRINT : WALK
    if (move.lengthSq() > 0) move.normalize().multiplyScalar(speed)

    if (session.driving) {
      // Ride along in the driver's seat.
      rb.setTranslation(vehicle.seat, true)
      rb.setLinvel({ x: 0, y: 0, z: 0 }, true)
      player.position.copy(vehicle.seat)
      camera.position.set(vehicle.seat.x, vehicle.seat.y + EYE, vehicle.seat.z)
      player.eye.copy(camera.position)
      session.setPrompt(active ? 'Get out of the buggy' : null)
      return
    }

    const vel = rb.linvel()
    let vy = vel.y
    if (jumpQueued.current) {
      jumpQueued.current = false
      const pos = rb.translation()
      const ray = new rapier.Ray({ x: pos.x, y: pos.y - 0.95, z: pos.z }, { x: 0, y: -1, z: 0 })
      const hit = world.castRay(ray, 0.2, true, undefined, undefined, undefined, rb)
      if (hit) vy = JUMP
    }
    rb.setLinvel({ x: move.x, y: vy, z: move.z }, true)

    const p = rb.translation()
    if (p.y < -20) rb.setTranslation({ x: spawn[0], y: spawn[1] + 2, z: spawn[2] }, true)
    // Safety net: if we ever slip under the ground, pop back on top of it.
    const ground = terrain.height(p.x, p.z)
    if (p.y < ground - 0.5) {
      rb.setTranslation({ x: p.x, y: ground + 1, z: p.z }, true)
      rb.setLinvel({ x: 0, y: 0, z: 0 }, true)
    }
    player.position.set(p.x, p.y, p.z)
    camera.position.set(p.x, p.y + EYE, p.z)
    player.eye.copy(camera.position)

    const focus = active ? findFocus(player.eye, player.forward) : null
    session.setPrompt(focus ? focus.label : null)
  })

  return (
    <RigidBody
      ref={body}
      position={spawn}
      colliders={false}
      enabledRotations={[false, false, false]}
      canSleep={false}
      friction={0}
      ccd
    >
      <CapsuleCollider args={[0.55, 0.4]} friction={0} collisionGroups={interactionGroups(0)} />
    </RigidBody>
  )
}
