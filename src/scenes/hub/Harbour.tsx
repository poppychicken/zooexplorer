import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Group } from 'three'
import { Sign } from '../../components/Sign'
import { useSession } from '../../game/state/store'
import { useInteractable } from '../../game/systems/interact'
import { mulberry32, range } from '../../game/systems/rng'
import { WHARF, padHeight } from './layout'

/** Stylised Sydney Opera House: a podium and three pairs of white sail shells. */
function OperaHouse() {
  const shells: { x: number; s: number }[] = [
    { x: -14, s: 1 },
    { x: -2, s: 0.85 },
    { x: 8, s: 0.6 },
  ]
  return (
    <group position={[-150, -0.6, 175]} rotation={[0, 0.5, 0]}>
      <mesh position={[0, 2.5, 0]} receiveShadow>
        <boxGeometry args={[48, 5, 22]} />
        <meshStandardMaterial color="#c9b49a" flatShading />
      </mesh>
      {shells.map(({ x, s }, i) =>
        [-1, 1].map((side) => (
          <mesh key={`${i}${side}`} position={[x + side * 3 * s, 5 + 9 * s, side * 3]} rotation={[0, 0, side * 0.5]} scale={[7 * s, 18 * s, 6 * s]}>
            <coneGeometry args={[1, 1, 4]} />
            <meshStandardMaterial color="#f4f1ea" flatShading />
          </mesh>
        )),
      )}
    </group>
  )
}

/** Stylised Sydney Harbour Bridge: steel arch, deck and granite pylons, spanning north–south. */
function HarbourBridge() {
  return (
    <group position={[-265, -0.6, 120]}>
      {/* The arch springs from the water by the pylons and rises above the deck. */}
      <mesh position={[0, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
        <torusGeometry args={[62, 2.2, 4, 24, Math.PI]} />
        <meshStandardMaterial color="#5b6670" flatShading />
      </mesh>
      {/* Hangers from the arch down to the deck */}
      {[-48, -36, -24, -12, 12, 24, 36, 48].map((z) => {
        const top = Math.sqrt(62 * 62 - z * z)
        return (
          <mesh key={z} position={[0, top > 26 ? (top + 26) / 2 : 26, z]}>
            <boxGeometry args={[0.6, Math.abs(top - 26), 0.6]} />
            <meshStandardMaterial color="#5b6670" />
          </mesh>
        )
      })}
      <mesh position={[0, 26, 0]}>
        <boxGeometry args={[10, 1.6, 170]} />
        <meshStandardMaterial color="#4b555e" flatShading />
      </mesh>
      {[-66, 66].map((z) =>
        [-6, 6].map((x) => (
          <mesh key={`${z}${x}`} position={[x, 22, z]}>
            <boxGeometry args={[6, 44, 8]} />
            <meshStandardMaterial color="#b9a88c" flatShading />
          </mesh>
        )),
      )}
    </group>
  )
}

/** City towers and far shores across the water. */
function Skyline() {
  const towers = useMemo(() => {
    const rng = mulberry32(2000)
    return Array.from({ length: 34 }, () => ({
      x: range(rng, -400, -260),
      z: range(rng, 230, 300),
      w: range(rng, 8, 16),
      h: range(rng, 15, 60),
      c: ['#8fa0ad', '#a9b5bd', '#7d8f9c', '#c4cbd0'][Math.floor(rng() * 4)],
    }))
  }, [])
  return (
    <group>
      {/* Far shores */}
      <mesh position={[-260, 0.4, 260]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[400, 160]} />
        <meshStandardMaterial color="#7d8c6a" flatShading />
      </mesh>
      <mesh position={[-380, 0.4, 40]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[160, 400]} />
        <meshStandardMaterial color="#6f8a5c" flatShading />
      </mesh>
      {towers.map((t, i) => (
        <mesh key={i} position={[t.x, t.h / 2, t.z]}>
          <boxGeometry args={[t.w, t.h, t.w]} />
          <meshStandardMaterial color={t.c} flatShading />
        </mesh>
      ))}
      <OperaHouse />
      <HarbourBridge />
    </group>
  )
}

/** Green-and-gold harbour ferry, gently bobbing at the wharf. */
function Ferry() {
  const ref = useRef<Group>(null)
  useFrame(({ clock }) => {
    if (!ref.current) return
    ref.current.position.y = -0.3 + Math.sin(clock.elapsedTime * 0.9) * 0.12
    ref.current.rotation.z = Math.sin(clock.elapsedTime * 0.7) * 0.02
  })
  return (
    <group position={[WHARF[0] - 7, 0, WHARF[1] + 20]}>
      <group ref={ref}>
        <mesh position={[0, 0.6, 0]} castShadow>
          <boxGeometry args={[18, 1.6, 6]} />
          <meshStandardMaterial color="#1f6b3a" flatShading />
        </mesh>
        <mesh position={[0, 2.3, 0]} castShadow>
          <boxGeometry args={[14, 1.8, 5]} />
          <meshStandardMaterial color="#f1e2b0" flatShading />
        </mesh>
        <mesh position={[0, 3.35, 0]}>
          <boxGeometry args={[15, 0.3, 5.6]} />
          <meshStandardMaterial color="#1f6b3a" flatShading />
        </mesh>
        <mesh position={[0, 4.1, 0]}>
          <boxGeometry args={[4, 1.2, 3]} />
          <meshStandardMaterial color="#f1e2b0" flatShading />
        </mesh>
        {/* Windows */}
        {Array.from({ length: 6 }, (_, i) => (
          <mesh key={i} position={[-5.5 + i * 2.2, 2.4, 2.52]}>
            <boxGeometry args={[1.4, 0.8, 0.05]} />
            <meshStandardMaterial color="#2c4a5a" />
          </mesh>
        ))}
      </group>
    </group>
  )
}

/** Expeditions leave from the ferry wharf at the bottom of the hill. */
function Wharf() {
  const openModal = useSession((s) => s.openModal)
  const y = padHeight(WHARF[0], WHARF[1] - 2)
  useInteractable('gate', [WHARF[0], y + 1.5, WHARF[1] + 2], 6, 'Board the expedition ferry', () => openModal('gate'))
  const deckY = y + 0.15
  return (
    <group>
      {/* Pier out over the water */}
      <mesh position={[WHARF[0], deckY, WHARF[1] + 10]} castShadow receiveShadow>
        <boxGeometry args={[5, 0.3, 24]} />
        <meshStandardMaterial color="#8d6a48" flatShading />
      </mesh>
      {Array.from({ length: 7 }, (_, i) =>
        [-2.2, 2.2].map((x) => (
          <mesh key={`${i}${x}`} position={[WHARF[0] + x, deckY - 2, WHARF[1] + 1 + i * 3.6]}>
            <cylinderGeometry args={[0.18, 0.18, 4, 6]} />
            <meshStandardMaterial color="#5a4330" flatShading />
          </mesh>
        )),
      )}
      {/* Waiting shelter */}
      <group position={[WHARF[0], deckY, WHARF[1]]}>
        {[
          [-2.6, -1.6],
          [2.6, -1.6],
          [-2.6, 1.6],
          [2.6, 1.6],
        ].map(([x, z], i) => (
          <mesh key={i} position={[x, 1.4, z]}>
            <boxGeometry args={[0.2, 2.8, 0.2]} />
            <meshStandardMaterial color="#1f6b3a" />
          </mesh>
        ))}
        <mesh position={[0, 2.95, 0]} castShadow>
          <boxGeometry args={[6.2, 0.25, 4]} />
          <meshStandardMaterial color="#1f6b3a" flatShading />
        </mesh>
        <Sign
          lines={[
            { text: 'FERRY WHARF', size: 70, bold: true, color: '#fff2d4' },
            { text: 'Expeditions depart here', size: 40, color: '#fff2d4' },
          ]}
          position={[0, 3.7, -2]}
          rotation={[0, Math.PI, 0]}
          width={4.2}
          height={1}
          background="#1f6b3a"
          border="#134526"
          posts={false}
        />
      </group>
      <Ferry />
    </group>
  )
}

export function Harbour() {
  return (
    <>
      <mesh position={[0, -0.6, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[1400, 1400]} />
        <meshStandardMaterial color="#2f6f8e" roughness={0.35} metalness={0.15} />
      </mesh>
      <Skyline />
      <Wharf />
    </>
  )
}
