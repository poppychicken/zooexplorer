import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { BufferAttribute, BufferGeometry, Color, DoubleSide, Group, InstancedMesh, Matrix4, MeshStandardMaterial, Quaternion, Vector3 } from 'three'
import { mulberry32 } from '../game/systems/rng'
import { grassiness, type TerrainSurface } from './terrainSurface'

/** Grass is drawn within this distance of the camera, fading out over the last quarter. */
const FAR = 34
const CHUNK = 10
const BLADES = 16

/** One clump: blades of varied height and lean, each a tapered strip that bends in the wind. */
function clumpGeometry(seed: number): BufferGeometry {
  const rng = mulberry32(seed)
  const pos: number[] = []
  const t: number[] = []
  const index: number[] = []
  for (let b = 0; b < BLADES; b++) {
    const angle = rng() * Math.PI * 2
    const r = Math.sqrt(rng()) * 0.28
    const ox = Math.cos(angle) * r
    const oz = Math.sin(angle) * r
    const facing = rng() * Math.PI
    const fx = Math.cos(facing)
    const fz = Math.sin(facing)
    const height = 0.6 + rng() * 0.5
    const width = 0.05 + rng() * 0.04
    const lean = 0.1 + rng() * 0.35
    const lx = Math.cos(angle) * lean
    const lz = Math.sin(angle) * lean
    const base = pos.length / 3
    // Two rows of two vertices and a tip, with the lean growing towards the top.
    for (const h of [0, 0.55]) {
      const w = width * (1 - h * 0.6)
      for (const side of [-1, 1]) {
        pos.push(ox + lx * h * h + fx * w * side, h * height, oz + lz * h * h + fz * w * side)
        t.push(h)
      }
    }
    pos.push(ox + lx, height, oz + lz)
    t.push(1)
    index.push(base, base + 1, base + 2, base + 1, base + 3, base + 2, base + 2, base + 3, base + 4)
  }
  const geo = new BufferGeometry()
  geo.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
  geo.setAttribute('bladeT', new BufferAttribute(new Float32Array(t), 1))
  // Lit like the ground beneath, so blades don't flicker dark as they turn away from the sun.
  geo.setAttribute('normal', new BufferAttribute(new Float32Array(pos.length).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3))
  geo.setIndex(index)
  geo.computeBoundingSphere()
  return geo
}

function grassMaterial(base: string, tip: string, time: { value: number }) {
  const mat = new MeshStandardMaterial({ side: DoubleSide, roughness: 0.9, metalness: 0 })
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time
    shader.uniforms.uBase = { value: new Color(base) }
    shader.uniforms.uTip = { value: new Color(tip) }
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute float bladeT;
uniform float uTime;
varying float vBladeT;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vBladeT = bladeT;
vec3 rootPos = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
// Gusts roll across the field; the tips sway most.
float gust = sin(uTime * 1.6 + rootPos.x * 0.32 + rootPos.z * 0.21) + 0.45 * sin(uTime * 2.9 + rootPos.x * 1.1 - rootPos.z * 0.7);
transformed.x += gust * 0.09 * bladeT * bladeT;
transformed.z += gust * 0.04 * bladeT * bladeT;
// Shrink into the ground towards the edge of the drawn area, so there's no visible line.
float fade = 1.0 - smoothstep(${(FAR * 0.72).toFixed(1)}, ${FAR.toFixed(1)}, distance(rootPos.xz, cameraPosition.xz));
transformed *= fade;`,
      )
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform vec3 uBase;
uniform vec3 uTip;
varying float vBladeT;`,
      )
      .replace('#include <color_fragment>', `#include <color_fragment>\ndiffuseColor.rgb *= mix(uBase, uTip, vBladeT);`)
      // Both faces of a blade are lit as if facing up; the default flips the back face's normal down, turning it black.
      .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>\nnormal = normalize(vNormal);`)
  }
  mat.customProgramCacheKey = () => 'grass-blades'
  return mat
}

interface Props {
  surface: TerrainSurface
  height: (x: number, z: number) => number
  /** Square area to fill, centred on the origin. */
  size: number
  seed: number
}

/**
 * 3D grass clumps over the grassy parts of a terrain. Clumps are placed once, in chunks; only
 * chunks near the camera are drawn, and blades shrink away with distance.
 */
export function GrassField({ surface, height, size, seed }: Props) {
  const spec = surface.grass!
  const time = useRef({ value: 0 })
  const group = useRef<Group>(null)
  const camera = useThree((s) => s.camera)

  const { chunks, geometry, material } = useMemo(() => {
    const geometry = clumpGeometry(seed)
    const material = grassMaterial(spec.base, spec.tip, time.current)
    const rng = mulberry32(seed + 7)
    const half = size / 2
    const n = Math.ceil(size / CHUNK)
    const m4 = new Matrix4()
    const q = new Quaternion()
    const up = new Vector3(0, 1, 0)
    const col = new Color()
    // The ground rules are the slow part, so they're evaluated once per square metre and shared by every clump in it.
    const cells = new Map<number, number>()
    const e = 0.75
    const grassAt = (x: number, z: number) => {
      const cx = Math.floor(x)
      const cz = Math.floor(z)
      const key = cx * 100003 + cz
      let g = cells.get(key)
      if (g === undefined) {
        const px = cx + 0.5
        const pz = cz + 0.5
        const h = height(px, pz)
        const slope = Math.hypot(height(px + e, pz) - height(px - e, pz), height(px, pz + e) - height(px, pz - e)) / (2 * e)
        g = grassiness(surface, px, pz, h, slope)
        cells.set(key, g)
      }
      return g
    }
    const chunks: { mesh: InstancedMesh; cx: number; cz: number }[] = []
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const x0 = -half + i * CHUNK
        const z0 = -half + j * CHUNK
        const placed: { x: number; y: number; z: number; s: number; r: number; c: number }[] = []
        const tries = Math.round(spec.density * CHUNK * CHUNK)
        for (let k = 0; k < tries; k++) {
          const x = x0 + rng() * CHUNK
          const z = z0 + rng() * CHUNK
          const roll = rng()
          if (spec.exclude?.(x, z)) continue
          if (roll > grassAt(x, z)) continue
          placed.push({ x, y: height(x, z) - 0.03, z, s: spec.height * (0.65 + rng() * 0.7), r: rng() * Math.PI * 2, c: rng() - 0.5 })
        }
        if (!placed.length) continue
        const mesh = new InstancedMesh(geometry, material, placed.length)
        placed.forEach((p, idx) => {
          q.setFromAxisAngle(up, p.r)
          m4.compose(new Vector3(p.x, p.y, p.z), q, new Vector3(p.s, p.s, p.s))
          mesh.setMatrixAt(idx, m4)
          mesh.setColorAt(idx, col.setRGB(1, 1, 1).offsetHSL(p.c * 0.03, p.c * 0.1, p.c * 0.12))
        })
        mesh.receiveShadow = true
        mesh.frustumCulled = false
        mesh.visible = false
        chunks.push({ mesh, cx: x0 + CHUNK / 2, cz: z0 + CHUNK / 2 })
      }
    }
    return { chunks, geometry, material }
  }, [surface, spec, height, size, seed])

  useEffect(() => {
    const g = group.current
    if (!g) return
    for (const c of chunks) g.add(c.mesh)
    return () => {
      for (const c of chunks) {
        g.remove(c.mesh)
        c.mesh.dispose()
      }
      geometry.dispose()
      material.dispose()
    }
  }, [chunks, geometry, material])

  const lastCull = useRef(0)
  useFrame((state, dt) => {
    time.current.value += dt
    if (state.clock.elapsedTime - lastCull.current < 0.2) return
    lastCull.current = state.clock.elapsedTime
    const reach = FAR + CHUNK * 0.75
    for (const c of chunks) c.mesh.visible = Math.hypot(c.cx - camera.position.x, c.cz - camera.position.z) < reach
  })

  return <group ref={group} />
}
