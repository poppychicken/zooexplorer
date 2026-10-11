import { describe, expect, it } from 'vitest'
import { BIOMES } from '../biomes'
import { CREATURES, CREATURE_BY_ID } from '../creatures'
import { GEAR_IDS, SHOP_ITEM_BY_ID } from '../shop'
import { PRECINCTS } from '../../../scenes/hub/layout'
import { biomeHeight } from '../../../scenes/biomeTerrain'

describe('biome data', () => {
  it.each(BIOMES.map((b) => [b.id, b] as const))('%s has four species, one of them its legendary', (_, biome) => {
    const roster = CREATURES.filter((c) => c.biome === biome.id)
    expect(roster).toHaveLength(4)
    expect(roster.filter((c) => c.rarity === 'legendary').map((c) => c.id)).toEqual([biome.legendary.creatureId])
  })

  it.each(BIOMES.map((b) => [b.id, b] as const))('%s only spawns its own non-legendary species', (_, biome) => {
    for (const s of biome.spawns) {
      const c = CREATURE_BY_ID[s.creatureId]
      expect(c, s.creatureId).toBeDefined()
      expect(c.biome).toBe(biome.id)
      expect(c.rarity).not.toBe('legendary')
    }
  })

  it('locks biomes behind gear sold at the outfitter', () => {
    for (const b of BIOMES) {
      if (!b.requires) continue
      expect(GEAR_IDS).toContain(b.requires)
      expect(SHOP_ITEM_BY_ID[b.requires]).toBeDefined()
    }
  })

  it('exhibits every biome in exactly one zoo precinct', () => {
    const mapped = PRECINCTS.map((p) => p.biome).filter(Boolean)
    expect(new Set(mapped).size).toBe(mapped.length)
    expect([...mapped].sort()).toEqual(BIOMES.map((b) => b.id).sort())
  })

  it('keeps the arrival point and lairs above water', () => {
    for (const b of BIOMES) {
      const h = biomeHeight(b)
      expect(h(0, b.halfSize - 10), b.id).toBeGreaterThan(-0.1)
      if (b.terrain === 'coast') expect(h(...b.legendary.lair)).toBeLessThan(0)
    }
  })
})
