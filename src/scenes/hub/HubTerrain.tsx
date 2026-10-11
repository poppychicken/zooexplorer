import { useMemo } from 'react'
import { HeightfieldCollider, RigidBody } from '@react-three/rapier'
import { BufferAttribute, Color, PlaneGeometry } from 'three'
import { mulberry32 } from '../../game/systems/rng'
import { hubColor, hubHeight } from './layout'

const SIZE = 280
const SEGMENTS = 140

/** Faceted hillside mesh plus a matching Rapier heightfield. */
export function HubTerrain() {
  const geometry = useMemo(() => {
    const rng = mulberry32(2042)
    const geo = new PlaneGeometry(SIZE, SIZE, SEGMENTS, SEGMENTS)
    geo.rotateX(-Math.PI / 2)
    const pos = geo.getAttribute('position')
    for (let i = 0; i < pos.count; i++) pos.setY(i, hubHeight(pos.getX(i), pos.getZ(i)))
    const flat = geo.toNonIndexed()
    const fp = flat.getAttribute('position')
    const col = new Float32Array(fp.count * 3)
    const c = new Color()
    for (let i = 0; i < fp.count; i += 3) {
      const cx = (fp.getX(i) + fp.getX(i + 1) + fp.getX(i + 2)) / 3
      const cz = (fp.getZ(i) + fp.getZ(i + 1) + fp.getZ(i + 2)) / 3
      const cy = (fp.getY(i) + fp.getY(i + 1) + fp.getY(i + 2)) / 3
      c.set(hubColor(cx, cz, cy, rng()))
      for (let k = 0; k < 3; k++) col.set([c.r, c.g, c.b], (i + k) * 3)
    }
    flat.setAttribute('color', new BufferAttribute(col, 3))
    flat.computeVertexNormals()
    geo.dispose()
    return flat
  }, [])

  // Rapier heightfields are column-major: heights[row + col * (rows + 1)], rows along Z and columns along X.
  const heights = useMemo(() => {
    const n = SEGMENTS + 1
    // Rapier's WASM side needs a Float32Array, even though the prop is typed as number[].
    const out = new Float32Array(n * n)
    for (let col = 0; col < n; col++) {
      for (let row = 0; row < n; row++) {
        const x = -SIZE / 2 + (col / SEGMENTS) * SIZE
        const z = -SIZE / 2 + (row / SEGMENTS) * SIZE
        out[row + col * n] = hubHeight(x, z)
      }
    }
    return out as unknown as number[]
  }, [])

  return (
    <>
      <mesh geometry={geometry} receiveShadow>
        <meshStandardMaterial vertexColors flatShading />
      </mesh>
      <RigidBody type="fixed" colliders={false}>
        <HeightfieldCollider args={[SEGMENTS, SEGMENTS, heights, { x: SIZE, y: 1, z: SIZE }]} />
      </RigidBody>
    </>
  )
}
