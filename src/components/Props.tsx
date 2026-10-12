import { Suspense, useLayoutEffect, useMemo, useRef } from 'react'
import { CuboidCollider, CylinderCollider, RigidBody } from '@react-three/rapier'
import {
  BoxGeometry,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  Object3D,
  Quaternion,
  Vector3,
} from 'three'
import type { PropKind } from '../game/data/biomes'
import { KIT, KitField } from './NatureKit'

export interface PlacedProp {
  kind: PropKind
  x: number
  z: number
  scale: number
  rot: number
  /** Ground height under the prop (defaults to 0 for flat scenes). */
  y?: number
  /** Optional per-instance tint jitter. */
  tint?: number
}

interface Part {
  geo: BufferGeometry
  color: string
  pos: [number, number, number]
  scale?: [number, number, number]
  rot?: [number, number, number]
}

const g = {
  trunk: new CylinderGeometry(0.18, 0.28, 1, 6),
  cone: new ConeGeometry(1, 1, 7),
  ico: new IcosahedronGeometry(1, 0),
  dodeca: new DodecahedronGeometry(1, 0),
  box: new BoxGeometry(1, 1, 1),
  cyl: new CylinderGeometry(1, 1, 1, 7),
  cylThin: new CylinderGeometry(0.5, 0.5, 1, 6),
  cap: new CylinderGeometry(0.1, 1, 0.45, 8),
}

export const PROP_PARTS: Record<PropKind, Part[]> = {
  pine: [
    { geo: g.trunk, color: '#5b3d26', pos: [0, 0.8, 0], scale: [1, 1.6, 1] },
    { geo: g.cone, color: '#2f5d34', pos: [0, 2.4, 0], scale: [1.6, 2.4, 1.6] },
    { geo: g.cone, color: '#38703e', pos: [0, 3.7, 0], scale: [1.2, 2, 1.2] },
    { geo: g.cone, color: '#41804a', pos: [0, 4.8, 0], scale: [0.8, 1.5, 0.8] },
  ],
  oak: [
    { geo: g.trunk, color: '#6a4a30', pos: [0, 1.1, 0], scale: [1.5, 2.2, 1.5] },
    { geo: g.ico, color: '#4f8a3c', pos: [0, 3, 0], scale: [2.1, 1.7, 2.1] },
    { geo: g.ico, color: '#5d9a45', pos: [0.9, 3.6, 0.4], scale: [1.2, 1.1, 1.2] },
    { geo: g.ico, color: '#477d36', pos: [-0.8, 3.4, -0.5], scale: [1.3, 1.1, 1.3] },
  ],
  bush: [
    { geo: g.ico, color: '#3f7a37', pos: [0, 0.35, 0], scale: [0.8, 0.6, 0.8] },
    { geo: g.ico, color: '#4b8a40', pos: [0.4, 0.3, 0.2], scale: [0.5, 0.45, 0.5] },
  ],
  rock: [{ geo: g.dodeca, color: '#8a8a86', pos: [0, 0.2, 0], scale: [0.6, 0.45, 0.5] }],
  boulder: [
    { geo: g.dodeca, color: '#b06a43', pos: [0, 0.6, 0], scale: [1.3, 1, 1.1] },
    { geo: g.dodeca, color: '#a35f3a', pos: [0.8, 0.35, 0.4], scale: [0.6, 0.5, 0.6] },
  ],
  cactus: [
    { geo: g.cylThin, color: '#4f8a4a', pos: [0, 1.2, 0], scale: [0.6, 2.4, 0.6] },
    { geo: g.cylThin, color: '#4a8345', pos: [0.45, 1.4, 0], scale: [0.35, 0.9, 0.35] },
    { geo: g.cylThin, color: '#4a8345', pos: [0.6, 1.9, 0], scale: [0.3, 0.8, 0.3] },
    { geo: g.cylThin, color: '#4a8345', pos: [-0.4, 1.0, 0], scale: [0.3, 0.7, 0.3] },
    { geo: g.cylThin, color: '#4a8345', pos: [-0.55, 1.5, 0], scale: [0.28, 0.8, 0.28] },
  ],
  mesa: [
    { geo: g.cyl, color: '#b5643a', pos: [0, 4, 0], scale: [9, 8, 7] },
    { geo: g.cyl, color: '#c9784a', pos: [0, 8.4, 0], scale: [8.5, 0.8, 6.6] },
    { geo: g.cyl, color: '#a8582f', pos: [0, 1.5, 0], scale: [10, 3, 8] },
  ],
  log: [{ geo: g.cylThin, color: '#6b4a2e', pos: [0, 0.3, 0], scale: [0.6, 3, 0.6], rot: [0, 0, Math.PI / 2] }],
  mushroom: [
    { geo: g.cylThin, color: '#efe6d2', pos: [0, 0.15, 0], scale: [0.12, 0.3, 0.12] },
    { geo: g.cap, color: '#c83c2c', pos: [0, 0.33, 0], scale: [0.25, 0.4, 0.25] },
  ],
  gum: [
    { geo: g.trunk, color: '#d8d2c4', pos: [0, 2, 0], scale: [1.1, 4, 1.1] },
    { geo: g.trunk, color: '#cfc8b8', pos: [0.6, 3.6, 0], scale: [0.5, 1.6, 0.5], rot: [0, 0, -0.6] },
    { geo: g.ico, color: '#7d8f5a', pos: [0, 4.6, 0], scale: [1.8, 0.9, 1.6] },
    { geo: g.ico, color: '#8a9b66', pos: [1.3, 4.3, 0.3], scale: [1.1, 0.6, 1] },
  ],
  spinifex: [
    { geo: g.cone, color: '#c9b061', pos: [0, 0.25, 0], scale: [0.6, 0.5, 0.6] },
    { geo: g.cone, color: '#b8a052', pos: [0.4, 0.2, 0.2], scale: [0.4, 0.4, 0.4], rot: [0, 0, -0.4] },
    { geo: g.cone, color: '#d4bc6c', pos: [-0.35, 0.2, -0.1], scale: [0.4, 0.4, 0.4], rot: [0, 0, 0.4] },
  ],
  termite: [
    { geo: g.cone, color: '#a8532e', pos: [0, 1.2, 0], scale: [0.9, 2.4, 0.9] },
    { geo: g.cone, color: '#9a4a28', pos: [0.4, 0.8, 0.2], scale: [0.5, 1.6, 0.5] },
  ],
  snowpine: [
    { geo: g.trunk, color: '#4a3424', pos: [0, 0.8, 0], scale: [1, 1.6, 1] },
    { geo: g.cone, color: '#2f4f3a', pos: [0, 2.4, 0], scale: [1.5, 2.4, 1.5] },
    { geo: g.cone, color: '#e8eef0', pos: [0, 3.7, 0], scale: [1.1, 1.6, 1.1] },
    { geo: g.cone, color: '#f4f8fa', pos: [0, 4.7, 0], scale: [0.7, 1.2, 0.7] },
  ],
  peak: [
    { geo: g.cone, color: '#7d8088', pos: [0, 22, 0], scale: [30, 44, 30] },
    { geo: g.cone, color: '#f2f5f7', pos: [0, 38, 0], scale: [12.5, 12, 12.5] },
  ],
  coastrock: [
    { geo: g.dodeca, color: '#5d6066', pos: [0, 0.5, 0], scale: [1.4, 0.9, 1.2] },
    { geo: g.dodeca, color: '#6b6e74', pos: [1, 0.3, 0.5], scale: [0.7, 0.5, 0.6] },
  ],
  dunegrass: [
    { geo: g.cone, color: '#a8b071', pos: [0, 0.3, 0], scale: [0.25, 0.6, 0.25], rot: [0.2, 0, 0.1] },
    { geo: g.cone, color: '#98a062', pos: [0.2, 0.25, 0.1], scale: [0.2, 0.5, 0.2], rot: [-0.2, 0, -0.2] },
    { geo: g.cone, color: '#b4bb80', pos: [-0.2, 0.25, -0.1], scale: [0.2, 0.5, 0.2], rot: [0.1, 0, 0.3] },
  ],
  pebble: [{ geo: g.dodeca, color: '#8a8a86', pos: [0, 0.05, 0], scale: [0.18, 0.1, 0.15] }],
  fern: [{ geo: g.cone, color: '#3f7a37', pos: [0, 0.25, 0], scale: [0.5, 0.5, 0.5] }],
  grass: [{ geo: g.cone, color: '#5d9a45', pos: [0, 0.25, 0], scale: [0.2, 0.5, 0.2] }],
  flowers: [
    { geo: g.cylThin, color: '#4f8a3c', pos: [0, 0.25, 0], scale: [0.05, 0.5, 0.05] },
    { geo: g.ico, color: '#e8c840', pos: [0, 0.55, 0], scale: [0.12, 0.1, 0.12] },
  ],
  agave: [{ geo: g.cone, color: '#7a9a5a', pos: [0, 0.6, 0], scale: [0.8, 1.2, 0.8] }],
  deadtree: [
    { geo: g.trunk, color: '#7a6450', pos: [0, 1.3, 0], scale: [0.9, 2.6, 0.9] },
    { geo: g.trunk, color: '#7a6450', pos: [0.5, 2.4, 0], scale: [0.4, 1.2, 0.4], rot: [0, 0, -0.8] },
    { geo: g.trunk, color: '#7a6450', pos: [-0.4, 2.1, 0.1], scale: [0.35, 1, 0.35], rot: [0.2, 0, 0.9] },
  ],
}

/** Collision shape per prop: cylinder [halfHeight, radius] at unit scale, or null for walk-through props. */
const PROP_COLLIDER: Record<PropKind, { halfHeight: number; radius: number } | null> = {
  pine: { halfHeight: 2, radius: 0.35 },
  oak: { halfHeight: 2, radius: 0.45 },
  bush: null,
  rock: null,
  boulder: { halfHeight: 0.8, radius: 1.1 },
  cactus: { halfHeight: 1.2, radius: 0.35 },
  mesa: { halfHeight: 4.5, radius: 8 },
  log: null,
  mushroom: null,
  deadtree: { halfHeight: 1.3, radius: 0.25 },
  gum: { halfHeight: 2, radius: 0.3 },
  spinifex: null,
  termite: { halfHeight: 1.2, radius: 0.6 },
  snowpine: { halfHeight: 2, radius: 0.35 },
  peak: { halfHeight: 22, radius: 24 },
  coastrock: { halfHeight: 0.6, radius: 1.2 },
  dunegrass: null,
  pebble: null,
  fern: null,
  grass: null,
  flowers: null,
  agave: null,
}

const m4 = new Matrix4()
const local = new Matrix4()
const obj = new Object3D()
const q = new Quaternion()
const tmpColor = new Color()

function PartInstances({ part, props }: { part: Part; props: PlacedProp[] }) {
  const ref = useRef<InstancedMesh>(null)
  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    obj.position.set(...part.pos)
    obj.rotation.set(...(part.rot ?? [0, 0, 0]))
    obj.scale.set(...(part.scale ?? [1, 1, 1]))
    obj.updateMatrix()
    local.copy(obj.matrix)
    const base = new Color(part.color)
    props.forEach((p, i) => {
      q.setFromAxisAngle(new Vector3(0, 1, 0), p.rot)
      m4.compose(new Vector3(p.x, p.y ?? 0, p.z), q, new Vector3(p.scale, p.scale, p.scale)).multiply(local)
      mesh.setMatrixAt(i, m4)
      const t = p.tint ?? 0
      mesh.setColorAt(i, tmpColor.copy(base).offsetHSL(t * 0.03, t * 0.05, t * 0.06))
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [part, props])
  return (
    <instancedMesh ref={ref} args={[part.geo, undefined, props.length]} castShadow receiveShadow>
      <meshStandardMaterial flatShading />
    </instancedMesh>
  )
}

function ProceduralProps({ byKind }: { byKind: Map<PropKind, PlacedProp[]> }) {
  return (
    <>
      {[...byKind.entries()].map(([kind, list]) =>
        PROP_PARTS[kind].map((part, j) => <PartInstances key={`${kind}-${j}`} part={part} props={list} />),
      )}
    </>
  )
}

export function PropField({ props, colliders: withColliders = true, rockTint }: { props: PlacedProp[]; colliders?: boolean; rockTint?: string }) {
  const [kit, procedural] = useMemo(() => {
    const kit = new Map<PropKind, PlacedProp[]>()
    const procedural = new Map<PropKind, PlacedProp[]>()
    for (const p of props) {
      const map = KIT[p.kind] ? kit : procedural
      const list = map.get(p.kind) ?? []
      list.push(p)
      map.set(p.kind, list)
    }
    return [kit, procedural]
  }, [props])

  const colliders = useMemo(
    () =>
      (withColliders ? props : []).flatMap((p, i) => {
        const c = PROP_COLLIDER[p.kind]
        if (!c) return []
        const hh = c.halfHeight * p.scale
        return [<CylinderCollider key={i} args={[hh, c.radius * p.scale]} position={[p.x, (p.y ?? 0) + hh, p.z]} />]
      }),
    [props, withColliders],
  )

  return (
    <>
      <ProceduralProps byKind={procedural} />
      {/* Scenery models load in the background; the procedural shapes stand in until they arrive. */}
      <Suspense fallback={<ProceduralProps byKind={kit} />}>
        <KitField byKind={kit} rockTint={rockTint} />
      </Suspense>
      {colliders.length > 0 && (
        <RigidBody type="fixed" colliders={false}>
          {colliders}
        </RigidBody>
      )}
    </>
  )
}

/** Invisible walls around a square play area. */
export function Bounds({ half, height = 6 }: { half: number; height?: number }) {
  return (
    <RigidBody type="fixed" colliders={false}>
      <CuboidCollider args={[half, height, 1]} position={[0, height, -half - 1]} />
      <CuboidCollider args={[half, height, 1]} position={[0, height, half + 1]} />
      <CuboidCollider args={[1, height, half]} position={[-half - 1, height, 0]} />
      <CuboidCollider args={[1, height, half]} position={[half + 1, height, 0]} />
    </RigidBody>
  )
}
