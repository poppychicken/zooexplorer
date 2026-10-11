import { useMemo } from 'react'
import { HeightfieldCollider, RigidBody } from '@react-three/rapier'
import { BufferAttribute, Color, PlaneGeometry } from 'three'
import { mulberry32 } from '../game/systems/rng'

interface Props {
  /** Square size in metres, centred on the origin. */
  size: number
  segments: number
  height: (x: number, z: number) => number
  /** Face colour from the face centre; `jitter` is a stable random number in [0, 1). */
  color: (x: number, z: number, h: number, jitter: number) => string
  seed: number
}

/** Faceted ground mesh shaped by a height function, with a matching Rapier heightfield. */
export function HeightTerrain({ size, segments, height, color, seed }: Props) {
  const geometry = useMemo(() => {
    const rng = mulberry32(seed)
    const geo = new PlaneGeometry(size, size, segments, segments)
    geo.rotateX(-Math.PI / 2)
    const pos = geo.getAttribute('position')
    for (let i = 0; i < pos.count; i++) pos.setY(i, height(pos.getX(i), pos.getZ(i)))
    const flat = geo.toNonIndexed()
    const fp = flat.getAttribute('position')
    const col = new Float32Array(fp.count * 3)
    const c = new Color()
    for (let i = 0; i < fp.count; i += 3) {
      const cx = (fp.getX(i) + fp.getX(i + 1) + fp.getX(i + 2)) / 3
      const cz = (fp.getZ(i) + fp.getZ(i + 1) + fp.getZ(i + 2)) / 3
      const cy = (fp.getY(i) + fp.getY(i + 1) + fp.getY(i + 2)) / 3
      c.set(color(cx, cz, cy, rng()))
      for (let k = 0; k < 3; k++) col.set([c.r, c.g, c.b], (i + k) * 3)
    }
    flat.setAttribute('color', new BufferAttribute(col, 3))
    flat.computeVertexNormals()
    geo.dispose()
    return flat
  }, [size, segments, height, color, seed])

  // Rapier heightfields are column-major: heights[row + col * (rows + 1)], rows along Z and columns along X.
  const heights = useMemo(() => {
    const n = segments + 1
    // Rapier's WASM side needs a Float32Array, even though the prop is typed as number[].
    const out = new Float32Array(n * n)
    for (let col = 0; col < n; col++) {
      for (let row = 0; row < n; row++) {
        out[row + col * n] = height(-size / 2 + (col / segments) * size, -size / 2 + (row / segments) * size)
      }
    }
    return out as unknown as number[]
  }, [size, segments, height])

  return (
    <>
      <mesh geometry={geometry} receiveShadow>
        <meshStandardMaterial vertexColors flatShading />
      </mesh>
      <RigidBody type="fixed" colliders={false}>
        <HeightfieldCollider args={[segments, segments, heights, { x: size, y: 1, z: size }]} />
      </RigidBody>
    </>
  )
}
