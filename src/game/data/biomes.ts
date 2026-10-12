import type { BiomeId } from './creatures'
import type { GearId } from './shop'

export type PropKind =
  | 'pine'
  | 'oak'
  | 'bush'
  | 'rock'
  | 'boulder'
  | 'cactus'
  | 'mesa'
  | 'log'
  | 'mushroom'
  | 'deadtree'
  | 'gum'
  | 'spinifex'
  | 'termite'
  | 'snowpine'
  | 'peak'
  | 'coastrock'
  | 'dunegrass'
  | 'pebble'
  | 'fern'
  | 'grass'
  | 'flowers'
  | 'agave'

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
  requires?: GearId
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
  /** What rings the play area: a tree line, red cliffs, snowy peaks or open ocean. */
  boundary: 'trees' | 'cliffs' | 'peaks' | 'ocean'
  /** Ground shape: flat, rolling hills, or a coast with a lagoon around the legendary's lair. */
  terrain?: 'flat' | 'hills' | 'coast'
  /** Colour multiplied into the grey scenery rocks, e.g. red for desert sandstone. */
  rockTint?: string
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
      { kind: 'pine', count: 300, minScale: 0.8, maxScale: 1.6 },
      { kind: 'oak', count: 130, minScale: 0.8, maxScale: 1.4 },
      { kind: 'bush', count: 260, minScale: 0.6, maxScale: 1.3 },
      { kind: 'rock', count: 50, minScale: 0.5, maxScale: 1.4 },
      { kind: 'log', count: 20, minScale: 0.8, maxScale: 1.2 },
      { kind: 'mushroom', count: 80, minScale: 0.6, maxScale: 1.2 },
      { kind: 'fern', count: 220, minScale: 0.7, maxScale: 1.5 },
      { kind: 'grass', count: 260, minScale: 0.7, maxScale: 1.3 },
      { kind: 'flowers', count: 140, minScale: 0.6, maxScale: 1.1 },
      { kind: 'pebble', count: 60, minScale: 1, maxScale: 3 },
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
      { kind: 'agave', count: 40, minScale: 0.6, maxScale: 1.3 },
      { kind: 'spinifex', count: 90, minScale: 0.6, maxScale: 1.1 },
    ],
    rockTint: '#e0a070',
    population: 10,
    spawns: [
      { creatureId: 'fennec_fox', weight: 5 },
      { creatureId: 'desert_tortoise', weight: 5 },
      { creatureId: 'gila_monster', weight: 2.5 },
    ],
    legendary: { creatureId: 'glassdune_serpent', lair: [10, -72] },
    boundary: 'cliffs',
  },
  {
    id: 'outback',
    name: 'Outback Scrub',
    blurb: 'Red sand, spinifex and ghost gums at dusk, when the outback wakes up. You will want night-vision goggles.',
    requires: 'nightvision',
    halfSize: 95,
    seed: 777,
    sky: '#e9a27a',
    fog: [30, 140],
    ground: ['#c8693c', '#d27646', '#bd5f36', '#d9814e'],
    sun: { color: '#ffc08a', intensity: 2.1, position: [-70, 26, -30] },
    ambient: { sky: '#ffd9b8', ground: '#7a4a4a', intensity: 1.15 },
    props: [
      { kind: 'gum', count: 70, minScale: 0.8, maxScale: 1.4 },
      { kind: 'spinifex', count: 260, minScale: 0.6, maxScale: 1.4 },
      { kind: 'termite', count: 45, minScale: 0.6, maxScale: 1.3 },
      { kind: 'rock', count: 60, minScale: 0.5, maxScale: 1.3 },
      { kind: 'boulder', count: 25, minScale: 0.6, maxScale: 1.6 },
      { kind: 'deadtree', count: 15, minScale: 0.7, maxScale: 1.1 },
      { kind: 'pebble', count: 60, minScale: 1, maxScale: 3 },
    ],
    rockTint: '#d98a62',
    population: 10,
    spawns: [
      { creatureId: 'red_kangaroo', weight: 5 },
      { creatureId: 'short_beaked_echidna', weight: 5 },
      { creatureId: 'thorny_devil', weight: 2.5 },
    ],
    legendary: { creatureId: 'opal_backed_thylacine', lair: [-15, -75] },
    boundary: 'cliffs',
    terrain: 'flat',
  },
  {
    id: 'mountain',
    name: 'Mountain',
    blurb: 'High Himalayan valleys of rock, snow and pine, ringed by peaks. Bring climbing gear.',
    requires: 'climbing',
    halfSize: 90,
    seed: 9090,
    sky: '#b9d4ea',
    fog: [40, 170],
    ground: ['#7d8f62', '#8a9a6c', '#6f7f58', '#9aa58a'],
    sun: { color: '#ffffff', intensity: 2.4, position: [30, 80, 40] },
    ambient: { sky: '#e6f0ff', ground: '#5a6066', intensity: 1.0 },
    props: [
      { kind: 'snowpine', count: 160, minScale: 0.8, maxScale: 1.5 },
      { kind: 'rock', count: 80, minScale: 0.5, maxScale: 1.5 },
      { kind: 'boulder', count: 40, minScale: 0.6, maxScale: 1.8 },
      { kind: 'bush', count: 50, minScale: 0.4, maxScale: 0.8 },
      { kind: 'grass', count: 180, minScale: 0.6, maxScale: 1.1 },
      { kind: 'flowers', count: 60, minScale: 0.5, maxScale: 0.9 },
      { kind: 'pebble', count: 80, minScale: 1, maxScale: 3 },
    ],
    population: 9,
    spawns: [
      { creatureId: 'himalayan_tahr', weight: 6 },
      { creatureId: 'red_panda', weight: 3 },
      { creatureId: 'snow_leopard', weight: 1.2 },
    ],
    legendary: { creatureId: 'aurora_ibex', lair: [0, -70] },
    boundary: 'peaks',
    terrain: 'hills',
  },
  {
    id: 'sea',
    name: 'Sea Coast',
    blurb: 'A wild southern coastline of dunes, rock and a glowing lagoon. Only reachable by Zodiac.',
    requires: 'zodiac',
    halfSize: 90,
    seed: 3131,
    sky: '#a8d4ef',
    fog: [40, 180],
    ground: ['#e3d3a4', '#ead9ab', '#8aa060', '#97ab6a'],
    sun: { color: '#fff4e0', intensity: 2.4, position: [40, 60, 60] },
    ambient: { sky: '#dff0ff', ground: '#6a7a5a', intensity: 1.0 },
    props: [
      { kind: 'coastrock', count: 70, minScale: 0.6, maxScale: 1.8 },
      { kind: 'dunegrass', count: 240, minScale: 0.6, maxScale: 1.4 },
      { kind: 'bush', count: 50, minScale: 0.5, maxScale: 1 },
      { kind: 'rock', count: 60, minScale: 0.5, maxScale: 1.3 },
      { kind: 'log', count: 15, minScale: 0.7, maxScale: 1.2 },
      { kind: 'pebble', count: 80, minScale: 1, maxScale: 3 },
    ],
    rockTint: '#b8b0a0',
    population: 10,
    spawns: [
      { creatureId: 'little_penguin', weight: 6 },
      { creatureId: 'australian_sea_lion', weight: 5 },
      { creatureId: 'leopard_seal', weight: 1.5 },
    ],
    legendary: { creatureId: 'aurora_leviathan', lair: [0, -62] },
    boundary: 'ocean',
    terrain: 'coast',
  },
]

export const BIOME_BY_ID = Object.fromEntries(BIOMES.map((b) => [b.id, b])) as Record<BiomeId, BiomeDef>
