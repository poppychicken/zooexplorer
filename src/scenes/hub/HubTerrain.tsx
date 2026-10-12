import { HeightTerrain } from '../../components/HeightTerrain'
import { HUB_SURFACE, hubColor, hubHeight } from './layout'

/** The zoo's hillside, from the Main Entrance down to the harbour. */
export function HubTerrain() {
  return <HeightTerrain size={280} segments={140} height={hubHeight} color={hubColor} seed={2042} surface={HUB_SURFACE} />
}
