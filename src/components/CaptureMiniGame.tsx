import { useEffect, useRef, useState } from 'react'
import { CREATURE_BY_ID } from '../game/data/creatures'
import { NETS } from '../game/data/shop'
import { useGame } from '../game/state/store'
import { MINIGAME, resolveRelease, type MiniGameState } from '../game/systems/capture'
import { finishLegendary } from '../game/systems/hunt'
import { playUi } from '../game/systems/audio'

/** Ignore taps shorter than this so a stray click doesn't cost a strike. */
const MIN_CHARGE = 0.12

interface View extends MiniGameState {
  marker: number
  zoneCenter: number
  holding: boolean
  flash: 'hit' | 'miss' | null
  over: 'won' | 'lost' | null
}

/**
 * Legendary capture: hold to wind in the net (fills the capture meter) while the creature thrashes,
 * and release while its struggle marker is inside the green zone to bank the progress.
 */
export function CaptureMiniGame({ uid, creatureId }: { uid: number; creatureId: string }) {
  const def = CREATURE_BY_ID[creatureId]
  const netTier = useGame((s) => s.netTier)
  const zoneWidth = NETS[netTier].greenZone
  const view = useRef<View>({ progress: 0, strikes: 0, charge: 0, marker: 0.5, zoneCenter: 0.5, holding: false, flash: null, over: null })
  const [, render] = useState(0)

  useEffect(() => {
    let raf = 0
    let last = performance.now()
    const seed = Math.random() * 100
    let flashUntil = 0

    const release = () => {
      const v = view.current
      v.holding = false
      if (v.over || v.charge < MIN_CHARGE) {
        v.charge = 0
        return
      }
      const { state, hit } = resolveRelease(v, v.marker, v.zoneCenter, zoneWidth)
      Object.assign(v, state)
      v.flash = hit ? 'hit' : 'miss'
      flashUntil = performance.now() + 450
      playUi(hit ? 'tick' : 'miss')
      // Move the green zone after each attempt.
      v.zoneCenter = zoneWidth / 2 + 0.05 + Math.random() * (0.9 - zoneWidth)
      if (v.progress >= 1) {
        v.over = 'won'
        playUi('catch')
        setTimeout(() => finishLegendary(uid, true), 1100)
      } else if (v.strikes >= MINIGAME.maxStrikes) {
        v.over = 'lost'
        setTimeout(() => finishLegendary(uid, false), 1300)
      }
    }

    const loop = (t: number) => {
      raf = requestAnimationFrame(loop)
      const dt = Math.min(0.05, (t - last) / 1000)
      last = t
      const v = view.current
      if (!v.over) {
        // Erratic struggle: layered sines that speed up as the creature tires of being caught.
        const s = t / 1000
        const agitation = 1 + v.progress * 0.8
        const n =
          Math.sin(s * 1.3 * agitation + seed) * 0.55 +
          Math.sin(s * 2.4 * agitation + seed * 2) * 0.3 +
          Math.sin(s * 4.6 * agitation + seed * 3) * 0.15
        v.marker = 0.5 + n * 0.48
        if (v.holding) {
          v.charge = Math.min(1, v.charge + dt / MINIGAME.fillSeconds)
          // Holding at full strain forces a release.
          if (v.charge >= 1) release()
        }
      }
      if (v.flash && t > flashUntil) v.flash = null
      render((n) => n + 1)
    }
    raf = requestAnimationFrame(loop)

    const down = () => {
      if (!view.current.over) view.current.holding = true
    }
    const onMouseDown = (e: MouseEvent) => e.button === 0 && down()
    const onMouseUp = (e: MouseEvent) => e.button === 0 && view.current.holding && release()
    const onKeyDown = (e: KeyboardEvent) => e.code === 'Space' && !e.repeat && down()
    const onKeyUp = (e: KeyboardEvent) => e.code === 'Space' && view.current.holding && release()
    window.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mouseup', onMouseUp)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mouseup', onMouseUp)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [uid, zoneWidth])

  const v = view.current
  const inZone = Math.abs(v.marker - v.zoneCenter) <= zoneWidth / 2
  return (
    <div className="overlay minigame">
      <div className={`panel mg ${v.flash ?? ''}`}>
        <div className="mg-title">
          <span className="legendary-tag">LEGENDARY</span>
          <h2>{def.name}</h2>
          <p className="muted">The net holds, but the {def.name} is fighting it!</p>
        </div>

        <div className="mg-label">Capture progress</div>
        <div className="bar progress">
          <div className="fill" style={{ width: `${v.progress * 100}%` }} />
        </div>

        <div className="mg-label">
          Struggle <span className="muted">(release while the marker is in the green)</span>
        </div>
        <div className="bar struggle">
          <div className="zone" style={{ left: `${(v.zoneCenter - zoneWidth / 2) * 100}%`, width: `${zoneWidth * 100}%` }} />
          <div className={`marker ${inZone ? 'in' : ''}`} style={{ left: `${v.marker * 100}%` }} />
        </div>

        <div className="mg-label">Net tension</div>
        <div className="bar charge">
          <div className="fill" style={{ width: `${v.charge * 100}%` }} />
        </div>

        <div className="mg-footer">
          <div className="strikes">
            {Array.from({ length: MINIGAME.maxStrikes }, (_, i) => (
              <span key={i} className={i < v.strikes ? 'used' : ''}>
                ◆
              </span>
            ))}
          </div>
          <div className="mg-help">
            {v.over === 'won' ? (
              <b className="good">Captured!</b>
            ) : v.over === 'lost' ? (
              <b className="bad">It broke free…</b>
            ) : (
              <>
                Hold <kbd>Left mouse</kbd> or <kbd>Space</kbd> to wind in, then release in the green. {NETS[netTier].name}: green zone{' '}
                {Math.round(zoneWidth * 100)}%.
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
