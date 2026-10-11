import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Group, Quaternion, Vector3 } from 'three'
import { Sign } from '../../components/Sign'
import { PRECINCTS, SKY_SAFARI, hubHeight } from './layout'

const STATION_HEIGHT = 7
const CABINS = 7
const TRIP_SECONDS = 70

/** The Sky Safari cable car from the harbour wharf up to the Main Entrance. Scenery for now. */
export function SkySafari() {
  const { top, bottom } = SKY_SAFARI
  const a = useMemo(() => new Vector3(top[0], hubHeight(top[0], top[1]) + STATION_HEIGHT, top[1]), [top])
  const b = useMemo(() => new Vector3(bottom[0], hubHeight(bottom[0], bottom[1]) + STATION_HEIGHT, bottom[1]), [bottom])
  const dir = useMemo(() => b.clone().sub(a), [a, b])
  const length = dir.length()
  const heading = Math.atan2(dir.x, dir.z)
  // Up and down lines run side by side.
  const side = useMemo(() => new Vector3(Math.cos(heading), 0, -Math.sin(heading)).multiplyScalar(1.4), [heading])

  const towers = useMemo(() => {
    const out: Vector3[] = []
    for (let t = 0.15; t < 0.9; t += 0.18) {
      const p = a.clone().lerp(b, t)
      // Don't plant a tower inside an exhibit precinct.
      if (PRECINCTS.some((pr) => Math.hypot(p.x - pr.center[0], p.z - pr.center[1]) < 17)) continue
      out.push(p)
    }
    return out
  }, [a, b])

  const cabins = useRef<(Group | null)[]>([])
  useFrame(({ clock }) => {
    cabins.current.forEach((c, i) => {
      if (!c) return
      const phase = (clock.elapsedTime / TRIP_SECONDS + i / CABINS) % 1
      // First half of the loop goes down one line, second half comes back up the other.
      const down = phase < 0.5
      const t = down ? phase * 2 : 1 - (phase - 0.5) * 2
      c.position.copy(a).lerp(b, t).addScaledVector(side, down ? 1 : -1)
      c.position.y -= 1.6
    })
  })

  const midpoint = a.clone().lerp(b, 0.5)
  // Cables run straight down the hill between the stations.
  const cableTilt = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), dir.clone().normalize())
  return (
    <group>
      {[a, b].map((p, i) => (
        <group key={i} position={[p.x, p.y - STATION_HEIGHT, p.z]}>
          <mesh position={[0, STATION_HEIGHT / 2, 0]} castShadow>
            <boxGeometry args={[6, STATION_HEIGHT, 6]} />
            <meshStandardMaterial color="#e7d3a6" flatShading />
          </mesh>
          <mesh position={[0, STATION_HEIGHT + 0.4, 0]}>
            <boxGeometry args={[7, 0.8, 7]} />
            <meshStandardMaterial color="#b35a3a" flatShading />
          </mesh>
          <Sign
            lines={[{ text: 'SKY SAFARI', size: 80, bold: true, color: '#fff2d4' }]}
            position={[0, STATION_HEIGHT - 1.4, 3.05]}
            rotation={[0, i === 0 ? 0 : Math.PI, 0]}
            width={4}
            height={0.7}
            background="#b35a3a"
            border="#7a3a22"
            posts={false}
          />
        </group>
      ))}
      {towers.map((p, i) => {
        const ground = hubHeight(p.x, p.z)
        const h = p.y - ground + 0.6
        return (
          <group key={i} position={[p.x, ground, p.z]} rotation={[0, heading, 0]}>
            <mesh position={[0, h / 2, 0]} castShadow>
              <boxGeometry args={[0.6, h, 0.6]} />
              <meshStandardMaterial color="#6b7680" flatShading />
            </mesh>
            <mesh position={[0, h, 0]}>
              <boxGeometry args={[3.6, 0.3, 0.4]} />
              <meshStandardMaterial color="#6b7680" flatShading />
            </mesh>
          </group>
        )
      })}
      {[1, -1].map((s) => (
        <mesh key={s} position={midpoint.clone().addScaledVector(side, s)} quaternion={cableTilt}>
          <boxGeometry args={[0.06, 0.06, length]} />
          <meshStandardMaterial color="#2b2b2b" />
        </mesh>
      ))}
      {Array.from({ length: CABINS }, (_, i) => (
        <group key={i} ref={(g) => void (cabins.current[i] = g)}>
          <mesh position={[0, 0.8, 0]}>
            <boxGeometry args={[0.08, 1.6, 0.08]} />
            <meshStandardMaterial color="#333" />
          </mesh>
          <mesh castShadow>
            <boxGeometry args={[1.6, 1.4, 1.6]} />
            <meshStandardMaterial color={i % 2 ? '#e2b04a' : '#d84c3c'} flatShading />
          </mesh>
        </group>
      ))}
    </group>
  )
}
