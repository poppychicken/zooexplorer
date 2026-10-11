import { CREATURE_BY_ID, VISITORS_PER_MINUTE } from '../data/creatures'

export const OFFLINE_CAP_MS = 8 * 60 * 60 * 1000

/** Admission price: every animal in the zoo adds its rarity's ticket value, so more and rarer animals cost more to see. */
export function ticketPrice(captured: Record<string, number>): number {
  let total = 0
  for (const [id, count] of Object.entries(captured)) {
    const def = CREATURE_BY_ID[id]
    if (def && count > 0) total += def.ticket * count
  }
  return total
}

/** Nobody visits an empty zoo. */
export function visitorsPerMinute(captured: Record<string, number>): number {
  return ticketPrice(captured) > 0 ? VISITORS_PER_MINUTE : 0
}

/** Ticket sales in $/min: visitors per minute × ticket price. */
export function incomePerMinute(captured: Record<string, number>): number {
  return visitorsPerMinute(captured) * ticketPrice(captured)
}

/** Money earned while the game was closed, capped at 8 hours. */
export function offlineEarnings(captured: Record<string, number>, lastSeen: number, now: number): {
  amount: number
  elapsedMs: number
  capped: boolean
} {
  const elapsed = Math.max(0, now - lastSeen)
  const counted = Math.min(elapsed, OFFLINE_CAP_MS)
  return {
    amount: (incomePerMinute(captured) * counted) / 60000,
    elapsedMs: counted,
    capped: elapsed > OFFLINE_CAP_MS,
  }
}

export function formatMoney(n: number): string {
  return `$${Math.floor(n).toLocaleString('en-US')}`
}

/** Prices keep their cents, e.g. $3.75. */
export function formatPrice(n: number): string {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function formatDuration(ms: number): string {
  const mins = Math.floor(ms / 60000)
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}
