import { describe, expect, it } from 'vitest'
import { OFFLINE_CAP_MS, incomePerMinute, offlineEarnings } from '../economy'

describe('economy', () => {
  it('pays for every animal in every exhibit', () => {
    expect(incomePerMinute({})).toBe(0)
    expect(incomePerMinute({ red_fox: 1, barn_owl: 1 })).toBe(2 + 5)
    expect(incomePerMinute({ red_fox: 3 })).toBe(6)
    expect(incomePerMinute({ moss_antler_stag: 2, barn_owl: 4 })).toBe(80 + 20)
  })

  it('pays offline earnings for the time away', () => {
    const r = offlineEarnings({ red_fox: 1 }, 0, 30 * 60 * 1000)
    expect(r.amount).toBeCloseTo(60)
    expect(r.capped).toBe(false)
  })

  it('caps offline earnings at 8 hours', () => {
    const r = offlineEarnings({ red_fox: 1 }, 0, OFFLINE_CAP_MS * 3)
    expect(r.amount).toBeCloseTo(2 * 60 * 8)
    expect(r.capped).toBe(true)
  })

  it('ignores clocks that went backwards', () => {
    expect(offlineEarnings({ red_fox: 1 }, 1000, 0).amount).toBe(0)
  })
})
