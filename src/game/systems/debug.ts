import { useGame, useSession } from '../state/store'
import { debugInput } from './input'
import { creatures, player, vehicle } from './world'

/** window.__zoo: handy for poking at the game from the browser console and for automated smoke tests. */
export function exposeDebug() {
  ;(window as unknown as { __zoo: unknown }).__zoo = {
    game: useGame,
    session: useSession,
    input: debugInput,
    player,
    vehicle,
    creatures,
    /** Pretend the pointer is locked (headless browsers can't lock it). */
    fakeLock: () => {
      useSession.getState().closeModal()
      useSession.getState().setLocked(true)
    },
  }
}
