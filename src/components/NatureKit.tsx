import { useLayoutEffect, useMemo, useRef } from 'react'
import { useGLTF } from '@react-three/drei'
import { Box3, Color, DoubleSide, InstancedMesh, Matrix4, Mesh, Quaternion, Vector3, type BufferGeometry, type Material, type MeshStandardMaterial, type Object3D } from 'three'
import type { PropKind } from '../game/data/biomes'
import type { PlacedProp } from './Props'
import { bakeGeometry } from './bakeGeometry'

/**
 * Scenery from Quaternius's Stylized Nature MegaKit (CC0), bundled into one file by
 * scripts/nature/build.mjs. Each model is a node named by its id (pine_1, rock_2, …).
 */
export const NATURE_URL = `${import.meta.env.BASE_URL}assets/nature/nature.glb`

interface KitSpec {
  ids: string[]
  /** Height in metres at prop scale 1. */
  height: number
  /** How far to sink it into the ground, as a share of its height, so it sits on slopes. */
  sink?: number
  /** Rocks pick up the biome's rock colour. */
  rocky?: boolean
}

const range = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}_${i + 1}`)

/** Prop kinds drawn from the kit; the rest keep their procedural shapes. */
export const KIT: Partial<Record<PropKind, KitSpec>> = {
  pine: { ids: range('pine', 5), height: 8, sink: 0.02 },
  snowpine: { ids: range('pine', 5), height: 7.5, sink: 0.02 },
  oak: { ids: range('tree', 5), height: 7, sink: 0.02 },
  deadtree: { ids: range('dead', 5), height: 5.5, sink: 0.02 },
  rock: { ids: range('rock', 3), height: 0.6, sink: 0.2, rocky: true },
  boulder: { ids: range('rock', 3), height: 1.9, sink: 0.15, rocky: true },
  coastrock: { ids: range('rock', 3), height: 1.3, sink: 0.15, rocky: true },
  pebble: { ids: range('pebble', 4), height: 0.15, sink: 0.3, rocky: true },
  bush: { ids: ['bush_1'], height: 1.1, sink: 0.05 },
  mushroom: { ids: range('mushroom', 2), height: 0.35 },
  spinifex: { ids: range('wispy', 2), height: 0.8 },
  dunegrass: { ids: ['grass_2', 'wispy_1'], height: 0.9 },
  fern: { ids: ['fern_1'], height: 0.7 },
  grass: { ids: ['grass_1', 'grass_2', 'clover_1'], height: 0.6 },
  flowers: { ids: [...range('flowers', 4), 'violets_1'], height: 0.7 },
  agave: { ids: ['agave_1'], height: 1.4, sink: 0.05 },
}

interface KitModel {
  parts: { geometry: BufferGeometry; material: Material }[]
  height: number
}

/** Bakes each model's node transforms into its geometry, with its base on y = 0. */
function useKitModels(): Map<string, KitModel> {
  const { scene } = useGLTF(NATURE_URL)
  return useMemo(() => {
    const models = new Map<string, KitModel>()
    const materials = new Map<Material, Material>()
    scene.updateMatrixWorld(true)
    for (const holder of scene.children) {
      const parts: KitModel['parts'] = []
      const box = new Box3().setFromObject(holder)
      const lift = new Matrix4().makeTranslation(0, -box.min.y, 0)
      holder.traverse((o: Object3D) => {
        const mesh = o as Mesh
        if (!mesh.isMesh) return
        const geometry = bakeGeometry(mesh.geometry, new Matrix4().multiplyMatrices(lift, mesh.matrixWorld))
        for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
          let material = materials.get(m)
          if (!material) {
            const mat = m.clone() as MeshStandardMaterial
            // glTF defaults to fully metallic, which renders near-black without an environment map.
            mat.metalness = 0
            if (mat.transparent) {
              // Foliage cards: cut out instead of blending, so they sort, write depth and cast leafy shadows.
              mat.transparent = false
              mat.alphaTest = 0.5
              mat.side = DoubleSide
            }
            material = mat
            materials.set(m, mat)
          }
          parts.push({ geometry, material })
        }
      })
      models.set(holder.name, { parts, height: box.max.y - box.min.y })
    }
    return models
  }, [scene])
}

const m4 = new Matrix4()
const q = new Quaternion()
const up = new Vector3(0, 1, 0)
const tmp = new Color()

function KitInstances({ geometry, material, props, spec, model, rockTint }: { geometry: BufferGeometry; material: Material; props: PlacedProp[]; spec: KitSpec; model: KitModel; rockTint?: string }) {
  const ref = useRef<InstancedMesh>(null)
  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    // The rock texture is mid-grey, so a tint is boosted to keep sandstone bright.
    const base = spec.rocky && rockTint ? new Color(rockTint).multiplyScalar(1.6) : new Color('#ffffff')
    const k = spec.height / Math.max(model.height, 0.01)
    props.forEach((p, i) => {
      const s = p.scale * k
      q.setFromAxisAngle(up, p.rot)
      m4.compose(new Vector3(p.x, (p.y ?? 0) - spec.height * p.scale * (spec.sink ?? 0), p.z), q, new Vector3(s, s, s))
      mesh.setMatrixAt(i, m4)
      const t = p.tint ?? 0
      mesh.setColorAt(i, tmp.copy(base).offsetHSL(t * 0.02, t * 0.04, t * 0.08))
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [props, spec, model, rockTint])
  return <instancedMesh ref={ref} args={[geometry, material, props.length]} castShadow receiveShadow />
}

/** Draws kit props, spreading each kind across its model variants. */
export function KitField({ byKind, rockTint }: { byKind: Map<PropKind, PlacedProp[]>; rockTint?: string }) {
  const models = useKitModels()
  const groups = useMemo(() => {
    const out: { key: string; spec: KitSpec; model: KitModel; props: PlacedProp[] }[] = []
    for (const [kind, list] of byKind) {
      const spec = KIT[kind]
      if (!spec) continue
      const ids = spec.ids.filter((id) => models.has(id))
      if (!ids.length) continue
      const buckets = ids.map(() => [] as PlacedProp[])
      // Deterministic per position, so a prop keeps its look between visits.
      list.forEach((p) => buckets[Math.abs(Math.floor(p.x * 7.13 + p.z * 3.71)) % ids.length].push(p))
      ids.forEach((id, i) => buckets[i].length && out.push({ key: `${kind}-${id}`, spec, model: models.get(id)!, props: buckets[i] }))
    }
    return out
  }, [byKind, models])
  return (
    <>
      {groups.flatMap(({ key, spec, model, props }) =>
        model.parts.map((part, j) => (
          <KitInstances key={`${key}-${j}`} geometry={part.geometry} material={part.material} props={props} spec={spec} model={model} rockTint={rockTint} />
        )),
      )}
    </>
  )
}
