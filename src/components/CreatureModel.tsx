import { Suspense, useMemo, useRef, type MutableRefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { Box3, ConeGeometry, Group, IcosahedronGeometry, Mesh, SphereGeometry, Vector3, BoxGeometry, CylinderGeometry } from 'three'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import type { CreatureDef, PlaceholderStyle } from '../game/data/creatures'
import { useAssetIndex } from '../game/systems/assets'

/** Shared motion input: current ground speed in m/s, read every frame to drive the walk cycle. */
export type Motion = MutableRefObject<{ speed: number }>

const geo = {
  ico: new IcosahedronGeometry(1, 1),
  ico0: new IcosahedronGeometry(1, 0),
  cone: new ConeGeometry(1, 1, 5),
  box: new BoxGeometry(1, 1, 1),
  cyl: new CylinderGeometry(1, 1, 1, 5),
  sphere: new SphereGeometry(1, 8, 6),
}

function Mat({ color, glow, translucent }: { color: string; glow?: boolean; translucent?: boolean }) {
  return (
    <meshStandardMaterial
      color={color}
      flatShading
      emissive={glow ? color : '#000000'}
      emissiveIntensity={glow ? 1.2 : 0}
      transparent={translucent}
      opacity={translucent ? 0.62 : 1}
      roughness={translucent ? 0.15 : 0.85}
      metalness={translucent ? 0.2 : 0}
    />
  )
}

/** Walk-cycle helper: swings legs (front-left, front-right, back-left, back-right) in a diagonal gait. */
function useLegSwing(legs: MutableRefObject<(Group | null)[]>, motion: Motion, rate: number, amp: number) {
  const phase = useRef(Math.random() * 10)
  useFrame((_, dt) => {
    const s = motion.current.speed
    phase.current += dt * rate * Math.min(3, 0.6 + s)
    const a = Math.min(1, s / 1.5) * amp
    legs.current.forEach((leg, i) => {
      if (leg) leg.rotation.x = Math.sin(phase.current + (i === 0 || i === 3 ? 0 : Math.PI)) * a
    })
  })
}

function Quadruped({ s, height, motion }: { s: PlaceholderStyle; height: number; motion: Motion }) {
  const L = s.size
  const legH = height * 0.42
  const bodyY = legH + L * 0.13
  const legs = useRef<(Group | null)[]>([])
  const tail = useRef<Group>(null)
  useLegSwing(legs, motion, 9, 0.6)
  useFrame(({ clock }) => {
    if (tail.current) tail.current.rotation.y = Math.sin(clock.elapsedTime * 3) * 0.3
  })
  const legPos: [number, number][] = [
    [0.13, 0.3],
    [-0.13, 0.3],
    [0.13, -0.3],
    [-0.13, -0.3],
  ]
  const headY = bodyY + L * 0.16
  const headZ = L * 0.5
  return (
    <group>
      <mesh geometry={geo.ico} position={[0, bodyY, 0]} scale={[L * 0.2, L * 0.17, L * 0.42]} castShadow>
        <Mat color={s.body} />
      </mesh>
      <mesh geometry={geo.ico} position={[0, bodyY - L * 0.05, L * 0.2]} scale={[L * 0.15, L * 0.12, L * 0.18]}>
        <Mat color={s.accent} />
      </mesh>
      {legPos.map(([x, z], i) => (
        <group key={i} position={[x * L, legH, z * L]} ref={(g) => void (legs.current[i] = g)}>
          <mesh geometry={geo.box} position={[0, -legH / 2, 0]} scale={[L * 0.07, legH, L * 0.07]} castShadow>
            <Mat color={s.detail ?? s.body} />
          </mesh>
        </group>
      ))}
      <group position={[0, headY, headZ]}>
        <mesh geometry={geo.ico} scale={[L * 0.13, L * 0.12, L * 0.14]} castShadow>
          <Mat color={s.body} />
        </mesh>
        <mesh geometry={geo.cone} position={[0, -L * 0.03, L * 0.16]} rotation={[Math.PI / 2, 0, 0]} scale={[L * 0.06, L * 0.16, L * 0.06]}>
          <Mat color={s.accent} />
        </mesh>
        <mesh geometry={geo.sphere} position={[0, -L * 0.02, L * 0.25]} scale={L * 0.022}>
          <Mat color="#151010" />
        </mesh>
        {[1, -1].map((side) => (
          <mesh key={side} geometry={geo.sphere} position={[side * L * 0.07, L * 0.04, L * 0.1]} scale={L * 0.02}>
            <Mat color="#0d0d0d" />
          </mesh>
        ))}
        {s.ears !== 'none' &&
          [1, -1].map((side) => {
            const ear = s.ears === 'huge' ? [0.09, 0.28] : s.ears === 'round' ? [0.05, 0.06] : [0.05, 0.13]
            return (
              <mesh
                key={side}
                geometry={s.ears === 'round' ? geo.sphere : geo.cone}
                position={[side * L * 0.08, L * (0.1 + ear[1] / 2), -L * 0.02]}
                rotation={[0, 0, -side * 0.25]}
                scale={[L * ear[0], L * ear[1], L * ear[0] * 0.5]}
              >
                <Mat color={s.ears === 'huge' ? s.accent : s.body} />
              </mesh>
            )
          })}
        {s.antlers && <Antlers L={L} color={s.detail ?? '#7dff9a'} glow={s.glow} />}
      </group>
      {s.tail !== 'none' && (
        <group ref={tail} position={[0, bodyY + L * 0.04, -L * 0.4]}>
          <mesh
            geometry={s.tail === 'bushy' ? geo.ico : geo.cone}
            position={[0, 0, -L * (s.tail === 'bushy' ? 0.18 : 0.06)]}
            rotation={[-Math.PI / 2 - 0.3, 0, 0]}
            scale={s.tail === 'bushy' ? [L * 0.08, L * 0.2, L * 0.08] : [L * 0.05, L * 0.12, L * 0.05]}
          >
            <Mat color={s.body} />
          </mesh>
          {s.tail === 'bushy' && (
            <mesh geometry={geo.ico} position={[0, -L * 0.1, -L * 0.36]} scale={L * 0.06}>
              <Mat color={s.accent} />
            </mesh>
          )}
        </group>
      )}
    </group>
  )
}

function Antlers({ L, color, glow }: { L: number; color: string; glow?: boolean }) {
  const tines = useMemo(() => {
    const out: { p: [number, number, number]; r: [number, number, number]; len: number }[] = []
    for (const side of [1, -1]) {
      out.push({ p: [side * L * 0.07, L * 0.25, 0], r: [-0.2, 0, -side * 0.5], len: 0.3 })
      out.push({ p: [side * L * 0.16, L * 0.4, -L * 0.02], r: [-0.4, 0, -side * 0.9], len: 0.2 })
      out.push({ p: [side * L * 0.12, L * 0.45, L * 0.04], r: [0.5, 0, -side * 0.2], len: 0.18 })
      out.push({ p: [side * L * 0.21, L * 0.52, -L * 0.06], r: [-0.2, 0, -side * 0.2], len: 0.16 })
    }
    return out
  }, [L])
  return (
    <group>
      {tines.map((t, i) => (
        <mesh key={i} geometry={geo.cyl} position={t.p} rotation={t.r} scale={[L * 0.015, L * t.len, L * 0.015]}>
          <Mat color="#5a4430" />
        </mesh>
      ))}
      {tines.map((t, i) => (
        <mesh key={`m${i}`} geometry={geo.ico0} position={t.p} scale={L * 0.035}>
          <Mat color={color} glow={glow} />
        </mesh>
      ))}
      {glow && <pointLight color={color} intensity={3} distance={L * 5} position={[0, L * 0.4, 0]} />}
    </group>
  )
}

function Bird({ s, motion }: { s: PlaceholderStyle; motion: Motion }) {
  const L = s.size
  const wings = useRef<(Mesh | null)[]>([])
  const root = useRef<Group>(null)
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    const moving = motion.current.speed > 0.3
    wings.current.forEach((w, i) => {
      if (w) w.rotation.z = (i ? -1 : 1) * (moving ? 0.6 + Math.sin(t * 14) * 0.7 : 0.1)
    })
    if (root.current) root.current.position.y = moving ? 0.6 + Math.sin(t * 7) * 0.08 : 0
  })
  return (
    <group ref={root}>
      <mesh geometry={geo.ico} position={[0, L * 0.55, 0]} scale={[L * 0.36, L * 0.5, L * 0.32]} castShadow>
        <Mat color={s.body} />
      </mesh>
      <mesh geometry={geo.ico} position={[0, L * 0.55, L * 0.12]} scale={[L * 0.28, L * 0.38, L * 0.22]}>
        <Mat color={s.accent} />
      </mesh>
      <mesh geometry={geo.ico} position={[0, L * 1.0, L * 0.03]} scale={[L * 0.3, L * 0.27, L * 0.26]} castShadow>
        <Mat color={s.body} />
      </mesh>
      <mesh geometry={geo.cyl} position={[0, L * 1.0, L * 0.2]} rotation={[Math.PI / 2, 0, 0]} scale={[L * 0.24, L * 0.06, L * 0.22]}>
        <Mat color={s.accent} />
      </mesh>
      {[1, -1].map((side) => (
        <mesh key={side} geometry={geo.sphere} position={[side * L * 0.09, L * 1.03, L * 0.25]} scale={L * 0.045}>
          <Mat color="#0b0b0b" />
        </mesh>
      ))}
      <mesh geometry={geo.cone} position={[0, L * 0.95, L * 0.27]} rotation={[Math.PI / 2 + 0.4, 0, 0]} scale={[L * 0.03, L * 0.07, L * 0.03]}>
        <Mat color="#d6b98c" />
      </mesh>
      {[1, -1].map((side, i) => (
        <mesh
          key={side}
          ref={(m) => void (wings.current[i] = m)}
          geometry={geo.ico0}
          position={[side * L * 0.33, L * 0.62, -L * 0.03]}
          scale={[L * 0.09, L * 0.38, L * 0.24]}
        >
          <Mat color={s.detail ?? s.body} />
        </mesh>
      ))}
      {[1, -1].map((side) => (
        <mesh key={`f${side}`} geometry={geo.box} position={[side * L * 0.1, L * 0.06, L * 0.04]} scale={[L * 0.06, L * 0.12, L * 0.1]}>
          <Mat color="#a88f62" />
        </mesh>
      ))}
    </group>
  )
}

function Tortoise({ s, motion }: { s: PlaceholderStyle; motion: Motion }) {
  const L = s.size
  const legs = useRef<(Group | null)[]>([])
  useLegSwing(legs, motion, 4, 0.5)
  return (
    <group>
      <mesh geometry={geo.ico0} position={[0, L * 0.3, 0]} scale={[L * 0.42, L * 0.32, L * 0.5]} castShadow>
        <Mat color={s.body} />
      </mesh>
      <mesh geometry={geo.cyl} position={[0, L * 0.18, 0]} scale={[L * 0.44, L * 0.08, L * 0.52]}>
        <Mat color={s.detail ?? s.body} />
      </mesh>
      <mesh geometry={geo.ico} position={[0, L * 0.25, L * 0.58]} scale={[L * 0.12, L * 0.1, L * 0.14]} castShadow>
        <Mat color={s.accent} />
      </mesh>
      {[
        [0.3, 0.3],
        [-0.3, 0.3],
        [0.3, -0.3],
        [-0.3, -0.3],
      ].map(([x, z], i) => (
        <group key={i} position={[x * L, L * 0.18, z * L]} ref={(g) => void (legs.current[i] = g)}>
          <mesh geometry={geo.cyl} position={[0, -L * 0.08, 0]} scale={[L * 0.08, L * 0.18, L * 0.08]}>
            <Mat color={s.accent} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

function Lizard({ s, motion }: { s: PlaceholderStyle; motion: Motion }) {
  const L = s.size
  const legs = useRef<(Group | null)[]>([])
  const body = useRef<Group>(null)
  useLegSwing(legs, motion, 12, 0.8)
  useFrame(({ clock }) => {
    if (body.current) body.current.rotation.y = Math.sin(clock.elapsedTime * 10) * 0.12 * Math.min(1, motion.current.speed)
  })
  return (
    <group ref={body}>
      <mesh geometry={geo.ico} position={[0, L * 0.12, 0]} scale={[L * 0.13, L * 0.08, L * 0.32]} castShadow>
        <Mat color={s.body} />
      </mesh>
      {[-0.2, -0.05, 0.1, 0.22].map((z, i) => (
        <mesh key={i} geometry={geo.box} position={[0, L * 0.19, z * L]} scale={[L * 0.2, L * 0.02, L * 0.05]}>
          <Mat color={s.accent} />
        </mesh>
      ))}
      <mesh geometry={geo.ico} position={[0, L * 0.13, L * 0.38]} scale={[L * 0.09, L * 0.06, L * 0.12]}>
        <Mat color={s.detail ?? s.body} />
      </mesh>
      <mesh geometry={geo.cone} position={[0, L * 0.1, -L * 0.55]} rotation={[-Math.PI / 2, 0, 0]} scale={[L * 0.07, L * 0.5, L * 0.05]}>
        <Mat color={s.body} />
      </mesh>
      {[
        [0.14, 0.18],
        [-0.14, 0.18],
        [0.14, -0.16],
        [-0.14, -0.16],
      ].map(([x, z], i) => (
        <group key={i} position={[x * L, L * 0.1, z * L]} ref={(g) => void (legs.current[i] = g)}>
          <mesh geometry={geo.box} position={[0, -L * 0.04, 0]} scale={[L * 0.12, L * 0.04, L * 0.04]}>
            <Mat color={s.body} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

function Serpent({ s, motion }: { s: PlaceholderStyle; motion: Motion }) {
  const L = s.size
  const N = 16
  const segs = useRef<(Mesh | null)[]>([])
  const phase = useRef(0)
  useFrame((_, dt) => {
    phase.current += dt * (1.5 + motion.current.speed * 1.2)
    segs.current.forEach((m, i) => {
      if (!m) return
      const z = L * 0.5 - (i / (N - 1)) * L
      m.position.x = Math.sin(phase.current - i * 0.55) * L * 0.07 * (i / N + 0.3)
      m.position.z = z
    })
  })
  return (
    <group>
      {Array.from({ length: N }, (_, i) => {
        const r = L * 0.06 * (1 - (i / N) * 0.75)
        return (
          <mesh key={i} ref={(m) => void (segs.current[i] = m)} geometry={geo.ico0} position={[0, r, 0]} scale={[r, r * 0.9, r * 1.2]} castShadow>
            <Mat color={i % 3 === 0 ? s.accent : s.body} glow={s.glow && i % 3 === 0} translucent={s.translucent} />
          </mesh>
        )
      })}
      <mesh geometry={geo.cone} position={[0, L * 0.12, L * 0.5]} rotation={[0, 0, 0]} scale={[L * 0.03, L * 0.12, L * 0.03]}>
        <Mat color={s.detail ?? s.accent} glow={s.glow} />
      </mesh>
      {s.glow && <pointLight color={s.body} intensity={3} distance={L * 2.5} position={[0, L * 0.2, 0]} />}
    </group>
  )
}

export function PlaceholderModel({ def, motion }: { def: CreatureDef; motion: Motion }) {
  const s = def.placeholder
  switch (s.shape) {
    case 'quadruped':
      return <Quadruped s={s} height={def.height} motion={motion} />
    case 'bird':
      return <Bird s={s} motion={motion} />
    case 'tortoise':
      return <Tortoise s={s} motion={motion} />
    case 'lizard':
      return <Lizard s={s} motion={motion} />
    case 'serpent':
      return <Serpent s={s} motion={motion} />
  }
}

function GlbModel({ url, height }: { url: string; height: number }) {
  const { scene } = useGLTF(url)
  const object = useMemo(() => {
    const obj = cloneSkinned(scene)
    const box = new Box3().setFromObject(obj)
    const size = box.getSize(new Vector3())
    const scale = size.y > 0 ? height / size.y : 1
    obj.scale.setScalar(scale)
    // Sit the model on the ground, centred on its footprint.
    const center = box.getCenter(new Vector3())
    obj.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale)
    obj.traverse((o) => {
      if ((o as Mesh).isMesh) o.castShadow = true
    })
    return obj
  }, [scene, height])
  return <primitive object={object} />
}

/** Uses the generated GLB when the asset index lists it, otherwise the procedural placeholder. */
export function CreatureModel({ def, motion }: { def: CreatureDef; motion: Motion }) {
  const index = useAssetIndex()
  const placeholder = <PlaceholderModel def={def} motion={motion} />
  if (!index.models.has(def.id)) return placeholder
  return (
    <Suspense fallback={placeholder}>
      <GlbModel url={`${import.meta.env.BASE_URL}${def.asset}`} height={def.height} />
    </Suspense>
  )
}
