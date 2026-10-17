import { useState } from 'react'
import { SPAWN } from '../../scenes/hub/layout'
import { RegionChart } from './RegionChart'
import { goToZooSpot, travelTo } from './travel'
import { ZooMap } from './ZooMap'

type Tab = 'chart' | 'zoo'

/** Remembered while the game is open, so the menu reopens on the map you last looked at. */
let lastTab: Tab = 'chart'

/** The pause menu's maps: the expedition chart and the zoo map, with tabs to switch between them. */
export function MapPanel() {
  const [tab, setTab] = useState<Tab>(lastTab)
  const choose = (t: Tab) => {
    lastTab = t
    setTab(t)
  }
  return (
    <div className="map-panel">
      <div className="map-tabs" role="tablist" aria-label="Maps">
        <button role="tab" aria-selected={tab === 'chart'} className={tab === 'chart' ? 'active' : ''} onClick={() => choose('chart')}>
          Expedition chart
        </button>
        <button role="tab" aria-selected={tab === 'zoo'} className={tab === 'zoo' ? 'active' : ''} onClick={() => choose('zoo')}>
          Zoo map
        </button>
        <span className="map-hint">{tab === 'chart' ? 'Click a region to sail there' : 'Click a precinct or landmark to go there'}</span>
      </div>
      <div role="tabpanel">{tab === 'chart' ? <RegionChart onTravel={(to) => travelTo(to, [SPAWN[0], SPAWN[1], Math.PI])} /> : <ZooMap onGo={goToZooSpot} />}</div>
    </div>
  )
}
