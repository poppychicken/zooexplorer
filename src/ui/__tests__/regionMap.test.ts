import { describe, expect, it } from 'vitest'
import { BIOMES } from '../../game/data/biomes'
import { CHART_DESTINATIONS as MAP_DESTINATIONS } from '../map/RegionChart'

describe('region map', () => {
  it('the chart shows the zoo and every expedition biome exactly once', () => {
    expect([...MAP_DESTINATIONS].sort()).toEqual(['hub', ...BIOMES.map((b) => b.id)].sort())
  })
})
