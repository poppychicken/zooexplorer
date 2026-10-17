import { requestLock } from '../../App'
import type { BiomeId } from '../../game/data/creatures'
import { useSession } from '../../game/state/store'
import { unlockAudio } from '../../game/systems/audio'
import { player } from '../../game/systems/world'

export type Destination = 'hub' | BiomeId

function begin() {
  unlockAudio()
  useSession.setState({ started: true })
}

/** Puts the player at a spot in the zoo, travelling home first when out on an expedition. */
export function goToZooSpot(x: number, z: number, yaw: number) {
  begin()
  const s = useSession.getState()
  if (s.driving) s.setDriving(false)
  if (s.location.kind === 'hub') {
    s.closeModal()
    player.teleport(x, z, yaw)
    player.pitch = 0
  } else {
    // The zoo scene isn't loaded yet; the player is placed on its first frame.
    player.arrival = { x, z, yaw }
    s.goTo({ kind: 'hub' })
  }
  requestLock()
}

/** Travels to a region picked on the expedition chart. */
export function travelTo(to: Destination, zooArrival: [number, number, number]) {
  if (to === 'hub') return goToZooSpot(...zooArrival)
  begin()
  useSession.getState().goTo({ kind: 'biome', biome: to })
  requestLock()
}
