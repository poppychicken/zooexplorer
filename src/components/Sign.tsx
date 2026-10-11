import { useEffect, useMemo } from 'react'
import { CanvasTexture, SRGBColorSpace } from 'three'

interface SignProps {
  lines: { text: string; size?: number; color?: string; bold?: boolean }[]
  width?: number
  height?: number
  background?: string
  border?: string
  position?: [number, number, number]
  rotation?: [number, number, number]
  /** Draw wooden posts under the board. */
  posts?: boolean
}

/** Low-poly signboard with text drawn to a canvas texture (no font downloads needed). */
export function Sign({
  lines,
  width = 2.4,
  height = 1.2,
  background = '#e9d8b4',
  border = '#6b4a2e',
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  posts = true,
}: SignProps) {
  const key = JSON.stringify(lines) + background + border
  const texture = useMemo(() => {
    const px = 256
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(px * width)
    canvas.height = Math.round(px * height)
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = border
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = background
    ctx.fillRect(14, 14, canvas.width - 28, canvas.height - 28)
    const total = lines.reduce((s, l) => s + (l.size ?? 60) * 1.25, 0)
    let y = (canvas.height - total) / 2
    for (const l of lines) {
      const size = l.size ?? 60
      ctx.font = `${l.bold ? '700' : '500'} ${size}px system-ui, -apple-system, Segoe UI, sans-serif`
      ctx.fillStyle = l.color ?? '#2b1d10'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      y += size * 0.625
      ctx.fillText(l.text, canvas.width / 2, y, canvas.width - 40)
      y += size * 0.625
    }
    const tex = new CanvasTexture(canvas)
    tex.colorSpace = SRGBColorSpace
    tex.anisotropy = 4
    return tex
  }, [key, width, height])

  useEffect(() => () => texture.dispose(), [texture])

  // Posts run from the ground up to the board's centre.
  const postH = position[1]
  return (
    <group position={position} rotation={rotation}>
      <mesh castShadow>
        <boxGeometry args={[width, height, 0.08]} />
        <meshStandardMaterial color={border} flatShading />
      </mesh>
      {/* Emissive so the text stays readable when the face is turned away from the sun. */}
      <mesh position={[0, 0, 0.045]}>
        <planeGeometry args={[width, height]} />
        <meshStandardMaterial map={texture} emissiveMap={texture} emissive="#ffffff" emissiveIntensity={0.45} />
      </mesh>
      <mesh position={[0, 0, -0.045]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[width, height]} />
        <meshStandardMaterial map={texture} emissiveMap={texture} emissive="#ffffff" emissiveIntensity={0.45} />
      </mesh>
      {posts &&
        [-1, 1].map((s) => (
          <mesh key={s} position={[s * (width / 2 - 0.15), -postH / 2, -0.06]} castShadow>
            <boxGeometry args={[0.12, postH, 0.12]} />
            <meshStandardMaterial color={border} flatShading />
          </mesh>
        ))}
    </group>
  )
}
