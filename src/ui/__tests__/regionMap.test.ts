import { describe, expect, it } from 'vitest'
import { BIOMES } from '../../game/data/biomes'
import { MAP_DESTINATIONS } from '../RegionMap'

describe('region map', () => {
  it('shows the zoo and every expedition biome exactly once', () => {
    expect([...MAP_DESTINATIONS].sort()).toEqual(['hub', ...BIOMES.map((b) => b.id)].sort())
  })
})
