import { Suspense, useEffect } from 'react'
import { Canvas } from '@react-three/fiber'
import { Physics } from '@react-three/rapier'
import { ZooHub } from './scenes/ZooHub'
import { Biome } from './scenes/Biome'
import { Hud } from './ui/Hud'
import { Modals } from './ui/Modals'
import { useGame, useSession } from './game/state/store'
import { onKeyPress } from './game/systems/input'
import { formatDuration, formatMoney } from './game/systems/economy'
import { exposeDebug } from './game/systems/debug'
import { unlockAudio } from './game/systems/audio'

export function requestLock() {
  const canvas = document.querySelector('canvas')
  if (!canvas || document.pointerLockElement) return
  try {
    const p = canvas.requestPointerLock() as unknown as Promise<void> | undefined
    p?.catch?.(() => {})
  } catch {
    // Browsers refuse a re-lock for ~1s after Esc; the click-to-play overlay covers that.
  }
}

function useGameLoop() {
  useEffect(() => {
    const result = useGame.getState().collectOffline(Date.now())
    if (result.amount >= 1) {
      useSession
        .getState()
        .toast(`Welcome back! Your exhibits earned ${formatMoney(result.amount)} in ${formatDuration(result.elapsedMs)}${result.capped ? ' (8h cap)' : ''}.`, 'good')
    }
    const id = setInterval(() => useGame.getState().tick(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    const onChange = () => {
      const locked = !!document.pointerLockElement
      const s = useSession.getState()
      s.setLocked(locked)
      if (!locked && !s.modal) s.openModal('pause')
    }
    document.addEventListener('pointerlockchange', onChange)
    return () => document.removeEventListener('pointerlockchange', onChange)
  }, [])

  useEffect(
    () =>
      onKeyPress((code) => {
        const s = useSession.getState()
        if (code === 'Tab') {
          if (s.modal === 'journal') {
            s.closeModal()
            requestLock()
          } else if (!s.modal || s.modal === 'pause') s.openModal('journal')
        }
        if (code === 'Escape' && s.modal && s.modal !== 'pause' && typeof s.modal === 'string') s.closeModal()
      }),
    [],
  )
}

export function App() {
  const location = useSession((s) => s.location)
  const visit = useSession((s) => s.visit)
  useGameLoop()
  useEffect(exposeDebug, [])

  return (
    <div className="app">
      <Canvas
        shadows
        dpr={[1, 1.75]}
        camera={{ fov: 70, near: 0.1, far: 400 }}
        onPointerDown={() => {
          unlockAudio()
          if (!useSession.getState().modal) requestLock()
        }}
      >
        <Suspense fallback={null}>
          <Physics gravity={[0, -20, 0]} timeStep="vary">
            {location.kind === 'hub' ? <ZooHub key={visit} /> : <Biome key={visit} biomeId={location.biome} />}
          </Physics>
        </Suspense>
      </Canvas>
      <Hud />
      <Modals />
    </div>
  )
}
