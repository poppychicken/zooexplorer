import { useMemo } from 'react'
import { CuboidCollider, RigidBody } from '@react-three/rapier'
import { BufferAttribute, Color, PlaneGeometry } from 'three'
import { mulberry32 } from '../game/systems/rng'

/** Flat physics floor with a faceted, vertex-coloured visual surface. */
export function Ground({ size, colors, seed, segments = 60 }: { size: number; colors: string[]; seed: number; segments?: number }) {
  const geometry = useMemo(() => {
    const rng = mulberry32(seed)
    const geo = new PlaneGeometry(size, size, segments, segments).toNonIndexed()
    geo.rotateX(-Math.PI / 2)
    const pos = geo.getAttribute('position')
    const palette = colors.map((c) => new Color(c))
    const col = new Float32Array(pos.count * 3)
    // Small vertical jitter for a faceted look; stays below the player's step so the flat collider still matches.
    const heights = new Map<string, number>()
    for (let i = 0; i < pos.count; i++) {
      const key = `${pos.getX(i).toFixed(2)},${pos.getZ(i).toFixed(2)}`
      let h = heights.get(key)
      if (h === undefined) {
        h = (rng() - 0.5) * 0.12
        heights.set(key, h)
      }
      pos.setY(i, h)
    }
    for (let i = 0; i < pos.count; i += 3) {
      const c = palette[Math.floor(rng() * palette.length)]
      for (let k = 0; k < 3; k++) col.set([c.r, c.g, c.b], (i + k) * 3)
    }
    geo.setAttribute('color', new BufferAttribute(col, 3))
    geo.computeVertexNormals()
    return geo
  }, [size, colors, seed, segments])

  return (
    <>
      <mesh geometry={geometry} receiveShadow>
        <meshStandardMaterial vertexColors flatShading />
      </mesh>
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[size / 2, 0.5, size / 2]} position={[0, -0.5, 0]} />
      </RigidBody>
    </>
  )
}
