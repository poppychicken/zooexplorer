import { CREATURE_BY_ID } from '../data/creatures'

export const OFFLINE_CAP_MS = 8 * 60 * 60 * 1000

/** Total exhibit income in $/min. Exhibits hold any number of animals and each one earns its species' rate. */
export function incomePerMinute(captured: Record<string, number>): number {
  let total = 0
  for (const [id, count] of Object.entries(captured)) {
    const def = CREATURE_BY_ID[id]
    if (def && count > 0) total += def.income * count
  }
  return total
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

export function formatDuration(ms: number): string {
  const mins = Math.floor(ms / 60000)
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}
