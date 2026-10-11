export type NetTier = 1 | 2 | 3

export interface NetDef {
  tier: NetTier
  name: string
  /** Multiplies the base capture chance of non-legendary creatures. */
  multiplier: number
  /** Width of the green zone in the legendary mini-game, as a fraction of the bar. */
  greenZone: number
}

export const NETS: Record<NetTier, NetDef> = {
  1: { tier: 1, name: 'Net Mk I', multiplier: 1.0, greenZone: 0.18 },
  2: { tier: 2, name: 'Net Mk II', multiplier: 1.4, greenZone: 0.26 },
  3: { tier: 3, name: 'Net Mk III', multiplier: 1.9, greenZone: 0.36 },
}

/** One-off equipment you own once bought. */
export type GearId = 'tracker' | 'buggy' | 'nightvision' | 'climbing' | 'zodiac'
export const GEAR_IDS: GearId[] = ['tracker', 'buggy', 'nightvision', 'climbing', 'zodiac']

export type ShopItemId = 'net_mk2' | 'net_mk3' | 'premium_bait' | GearId

export interface ShopItem {
  id: ShopItemId
  name: string
  price: number
  description: string
  /** One-off purchases disappear from the shop once owned. */
  consumable: boolean
}

export const SHOP_ITEMS: ShopItem[] = [
  {
    id: 'net_mk2',
    name: 'Net Mk II',
    price: 150,
    description: 'Stronger mesh: ×1.4 capture chance and a wider green zone for legendaries.',
    consumable: false,
  },
  {
    id: 'net_mk3',
    name: 'Net Mk III',
    price: 600,
    description: 'Carbon-weave net: ×1.9 capture chance and the widest green zone. Needs Mk II.',
    consumable: false,
  },
  {
    id: 'premium_bait',
    name: 'Premium Bait ×5',
    price: 50,
    description: 'Draws creatures from twice as far and keeps them calm for twice as long.',
    consumable: true,
  },
  {
    id: 'tracker',
    name: 'Tracker',
    price: 300,
    description: 'Shows nearby creatures on a radar while on expedition.',
    consumable: false,
  },
  {
    id: 'buggy',
    name: 'Off-road Buggy',
    price: 1000,
    description: 'Rugged enough for the Arid Canyon. Drive it around the zoo and on expeditions.',
    consumable: false,
  },
  {
    id: 'nightvision',
    name: 'Night-Vision Goggles',
    price: 1500,
    description: 'Outback creatures come out at dusk. Unlocks the Outback Scrub.',
    consumable: false,
  },
  {
    id: 'climbing',
    name: 'Climbing Gear',
    price: 2500,
    description: 'Ropes, crampons and a warm coat. Unlocks the Mountain.',
    consumable: false,
  },
  {
    id: 'zodiac',
    name: 'Zodiac Boat',
    price: 4000,
    description: 'Reach the wild coast by sea. Unlocks the Sea Coast.',
    consumable: false,
  },
]

export const isGear = (id: ShopItemId): id is GearId => (GEAR_IDS as string[]).includes(id)

export const SHOP_ITEM_BY_ID = Object.fromEntries(SHOP_ITEMS.map((i) => [i.id, i])) as Record<ShopItemId, ShopItem>

/** Free basic bait handed out at the start of every expedition. */
export const BASIC_BAIT_PER_EXPEDITION = 5

export interface BaitDef {
  attractRadius: number
  calmSeconds: number
  lifetimeSeconds: number
}

export const BAIT: Record<'basic' | 'premium', BaitDef> = {
  basic: { attractRadius: 16, calmSeconds: 15, lifetimeSeconds: 35 },
  premium: { attractRadius: 32, calmSeconds: 30, lifetimeSeconds: 60 },
}

export const STARTING_MONEY = 50
