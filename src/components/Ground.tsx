import { Suspense, useMemo } from 'react'
import { CuboidCollider, RigidBody } from '@react-three/rapier'
import { BufferAttribute, Color, PlaneGeometry, type BufferGeometry } from 'three'
import { mulberry32 } from '../game/systems/rng'
import { AssetBoundary } from './AssetBoundary'
import { GrassField } from './GrassField'
import { TerrainMaterial } from './TerrainMaterial'
import { applySurface, type TerrainSurface } from './terrainSurface'

const flatHeight = () => 0

/** Flat physics floor with a faceted, vertex-coloured visual surface. */
export function Ground({ size, colors, seed, segments = 60, surface }: { size: number; colors: string[]; seed: number; segments?: number; surface?: TerrainSurface }) {
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
        // Textured ground keeps it subtle, or each facet's shading reads as a seam in the texture.
        h = (rng() - 0.5) * (surface ? 0.03 : 0.12)
        heights.set(key, h)
      }
      pos.setY(i, h)
    }
    for (let i = 0; i < pos.count; i += 3) {
      const c = palette[Math.floor(rng() * palette.length)]
      for (let k = 0; k < 3; k++) col.set([c.r, c.g, c.b], (i + k) * 3)
    }
    geo.setAttribute('color', new BufferAttribute(col, 3))
    if (surface) applySurface(geo, surface, flatHeight, rng)
    geo.computeVertexNormals()
    return geo
  }, [size, colors, seed, segments, surface])

  return (
    <>
      {surface ? (
        // Plain colours stand in until the ground textures load, or if they can't.
        <AssetBoundary fallback={<FlatColours geometry={geometry} />}>
          <Suspense fallback={<FlatColours geometry={geometry} />}>
            <mesh geometry={geometry} receiveShadow>
              <TerrainMaterial layers={surface.layers} />
            </mesh>
          </Suspense>
        </AssetBoundary>
      ) : (
        <FlatColours geometry={geometry} />
      )}
      {surface?.grass && <GrassField surface={surface} height={flatHeight} size={size - 4} seed={seed} />}
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[size / 2, 0.5, size / 2]} position={[0, -0.5, 0]} />
      </RigidBody>
    </>
  )
}

function FlatColours({ geometry }: { geometry: BufferGeometry }) {
  return (
    <mesh geometry={geometry} receiveShadow>
      <meshStandardMaterial vertexColors flatShading />
    </mesh>
  )
}
