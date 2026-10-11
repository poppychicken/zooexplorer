import type { BiomeId } from './creatures'
import type { ShopItemId } from './shop'

export type PropKind = 'pine' | 'oak' | 'bush' | 'rock' | 'boulder' | 'cactus' | 'mesa' | 'log' | 'mushroom' | 'deadtree'

export interface PropScatter {
  kind: PropKind
  count: number
  minScale: number
  maxScale: number
}

export interface SpawnEntry {
  creatureId: string
  weight: number
}

export interface BiomeDef {
  id: BiomeId
  name: string
  blurb: string
  requires?: ShopItemId
  /** Half-width of the square play area in metres. */
  halfSize: number
  seed: number
  sky: string
  fog: [near: number, far: number]
  ground: string[]
  sun: { color: string; intensity: number; position: [number, number, number] }
  ambient: { sky: string; ground: string; intensity: number }
  props: PropScatter[]
  /** Normal creatures alive at once. */
  population: number
  spawns: SpawnEntry[]
  legendary: { creatureId: string; lair: [number, number] }
  /** Tall boundary cliffs (canyon) instead of a tree wall. */
  boundary: 'trees' | 'cliffs'
}

export const BIOMES: BiomeDef[] = [
  {
    id: 'forest',
    name: 'Temperate Forest',
    blurb: 'Mossy woodland of oak and pine. Foxes, badgers and, at dusk, owls.',
    halfSize: 90,
    seed: 1337,
    sky: '#a9c9d8',
    fog: [25, 120],
    ground: ['#4f7a3a', '#5a8742', '#476f35', '#628f48'],
    sun: { color: '#fff1d6', intensity: 2.2, position: [40, 60, 20] },
    ambient: { sky: '#cfe6ff', ground: '#3a4a2a', intensity: 0.9 },
    props: [
      { kind: 'pine', count: 140, minScale: 0.8, maxScale: 1.5 },
      { kind: 'oak', count: 70, minScale: 0.8, maxScale: 1.3 },
      { kind: 'bush', count: 120, minScale: 0.6, maxScale: 1.2 },
      { kind: 'rock', count: 50, minScale: 0.5, maxScale: 1.4 },
      { kind: 'log', count: 20, minScale: 0.8, maxScale: 1.2 },
      { kind: 'mushroom', count: 40, minScale: 0.6, maxScale: 1.2 },
    ],
    population: 10,
    spawns: [
      { creatureId: 'red_fox', weight: 5 },
      { creatureId: 'european_badger', weight: 5 },
      { creatureId: 'barn_owl', weight: 2.5 },
    ],
    legendary: { creatureId: 'moss_antler_stag', lair: [0, -70] },
    boundary: 'trees',
  },
  {
    id: 'canyon',
    name: 'Arid Canyon',
    blurb: 'Red rock, hot sand and long shadows. Needs something sturdier than boots.',
    requires: 'buggy',
    halfSize: 90,
    seed: 4242,
    sky: '#f2c79a',
    fog: [35, 150],
    ground: ['#d39a62', '#c98d58', '#dba872', '#c4824c'],
    sun: { color: '#ffe0b0', intensity: 2.8, position: [-30, 70, 30] },
    ambient: { sky: '#ffe4c2', ground: '#7a4426', intensity: 0.85 },
    props: [
      { kind: 'cactus', count: 70, minScale: 0.7, maxScale: 1.6 },
      { kind: 'boulder', count: 60, minScale: 0.6, maxScale: 2.2 },
      { kind: 'rock', count: 80, minScale: 0.4, maxScale: 1.2 },
      { kind: 'mesa', count: 10, minScale: 0.8, maxScale: 1.4 },
      { kind: 'deadtree', count: 20, minScale: 0.7, maxScale: 1.2 },
      { kind: 'bush', count: 40, minScale: 0.4, maxScale: 0.8 },
    ],
    population: 10,
    spawns: [
      { creatureId: 'fennec_fox', weight: 5 },
      { creatureId: 'desert_tortoise', weight: 5 },
      { creatureId: 'gila_monster', weight: 2.5 },
    ],
    legendary: { creatureId: 'glassdune_serpent', lair: [10, -72] },
    boundary: 'cliffs',
  },
]

export const BIOME_BY_ID = Object.fromEntries(BIOMES.map((b) => [b.id, b])) as Record<BiomeId, BiomeDef>
