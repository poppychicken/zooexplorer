/** Global keyboard/mouse state for the first-person controller. */

const keys = new Set<string>()
let lookX = 0
let lookY = 0

type Handler = (code: string) => void
const pressHandlers = new Set<Handler>()
const clickHandlers = new Set<() => void>()

export function isDown(code: string): boolean {
  return keys.has(code)
}

/** Mouse movement accumulated since the last call. */
export function consumeLook(): [number, number] {
  const out: [number, number] = [lookX, lookY]
  lookX = 0
  lookY = 0
  return out
}

export function onKeyPress(h: Handler): () => void {
  pressHandlers.add(h)
  return () => void pressHandlers.delete(h)
}

/** Left-click while the pointer is already locked. */
export function onLockedClick(h: () => void): () => void {
  clickHandlers.add(h)
  return () => void clickHandlers.delete(h)
}

let installed = false

export function installInput(): void {
  if (installed) return
  installed = true
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Tab') e.preventDefault()
    if (!e.repeat) pressHandlers.forEach((h) => h(e.code))
    keys.add(e.code)
  })
  window.addEventListener('keyup', (e) => keys.delete(e.code))
  window.addEventListener('blur', () => keys.clear())
  document.addEventListener('mousemove', (e) => {
    if (!document.pointerLockElement) return
    lookX += e.movementX
    lookY += e.movementY
  })
  document.addEventListener('mousedown', (e) => {
    if (e.button === 0 && document.pointerLockElement) clickHandlers.forEach((h) => h())
  })
}

/** Inject input from tests / the debug console. */
export const debugInput = {
  press: (code: string) => pressHandlers.forEach((h) => h(code)),
  hold: (code: string) => keys.add(code),
  release: (code: string) => keys.delete(code),
  click: () => clickHandlers.forEach((h) => h()),
  look: (dx: number, dy: number) => {
    lookX += dx
    lookY += dy
  },
}
