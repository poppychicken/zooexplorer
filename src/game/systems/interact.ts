import { useEffect, useRef } from 'react'
import { Vector3 } from 'three'

export interface Interactable {
  position: Vector3
  radius: number
  label: string
  onInteract: () => void
}

export const interactables = new Map<string, Interactable>()

/** Register something the player can press E on while standing nearby and looking at it. */
export function useInteractable(id: string, position: [number, number, number], radius: number, label: string, onInteract: () => void) {
  const handler = useRef(onInteract)
  handler.current = onInteract
  const [x, y, z] = position
  useEffect(() => {
    interactables.set(id, { position: new Vector3(x, y, z), radius, label, onInteract: () => handler.current() })
    return () => {
      interactables.delete(id)
    }
  }, [id, x, y, z, radius, label])
}

const tmp = new Vector3()

/** Nearest interactable in range that the player is roughly facing. */
export function findFocus(eye: Vector3, forward: Vector3): Interactable | null {
  let best: Interactable | null = null
  let bestScore = Infinity
  for (const it of interactables.values()) {
    tmp.copy(it.position).sub(eye)
    tmp.y = 0
    const dist = tmp.length()
    if (dist > it.radius) continue
    const facing = dist < 1.2 ? 1 : (tmp.x * forward.x + tmp.z * forward.z) / (dist * Math.hypot(forward.x, forward.z) || 1)
    if (facing < 0.6) continue
    const score = dist - facing
    if (score < bestScore) {
      bestScore = score
      best = it
    }
  }
  return best
}
