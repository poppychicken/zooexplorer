import type { Rarity } from '../data/creatures'
import { NETS, type NetTier } from '../data/shop'

export const BASE_CHANCE: Record<Exclude<Rarity, 'legendary'>, number> = {
  common: 0.6,
  uncommon: 0.35,
  rare: 0.15,
}

export const BAIT_MULTIPLIER = 1.5
export const MAX_CHANCE = 0.95

/** base(rarity) × netMultiplier × (baited ? 1.5 : 1), capped at 95%. Legendaries use the mini-game instead. */
export function captureChance(rarity: Rarity, netTier: NetTier, baited: boolean): number {
  if (rarity === 'legendary') return 0
  const chance = BASE_CHANCE[rarity] * NETS[netTier].multiplier * (baited ? BAIT_MULTIPLIER : 1)
  return Math.min(MAX_CHANCE, chance)
}

export function rollCapture(chance: number, rng: () => number = Math.random): boolean {
  return rng() < chance
}

// --- Legendary mini-game -------------------------------------------------

export const MINIGAME = {
  /** Seconds of holding to fill the capture meter from empty. */
  fillSeconds: 1.6,
  /** Progress lost when releasing outside the green zone. */
  missPenalty: 0.2,
  maxStrikes: 3,
} as const

export interface MiniGameState {
  progress: number
  strikes: number
  charge: number
}

/**
 * Resolve a release: the charge built while holding is banked if the struggle marker is
 * inside the green zone, otherwise the creature thrashes and claws back some progress.
 */
export function resolveRelease(
  state: MiniGameState,
  marker: number,
  zoneCenter: number,
  zoneWidth: number,
): { state: MiniGameState; hit: boolean } {
  const hit = Math.abs(marker - zoneCenter) <= zoneWidth / 2
  if (hit) {
    return { hit, state: { ...state, progress: Math.min(1, state.progress + state.charge * 0.5), charge: 0 } }
  }
  return {
    hit,
    state: {
      progress: Math.max(0, state.progress - MINIGAME.missPenalty),
      strikes: state.strikes + 1,
      charge: 0,
    },
  }
}
