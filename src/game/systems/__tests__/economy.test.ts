import { describe, expect, it } from 'vitest'
import { OFFLINE_CAP_MS, incomePerMinute, offlineEarnings, rehomingFee } from '../economy'

describe('economy', () => {
  it('sums one exhibit per captured species', () => {
    expect(incomePerMinute({})).toBe(0)
    expect(incomePerMinute({ red_fox: 1, barn_owl: 1 })).toBe(2 + 5)
    // Duplicates don't add a second exhibit.
    expect(incomePerMinute({ red_fox: 3 })).toBe(2)
    expect(incomePerMinute({ moss_antler_stag: 1 })).toBe(40)
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

  it('pays a re-homing fee for duplicates', () => {
    expect(rehomingFee('red_fox')).toBe(30)
    expect(rehomingFee('nope')).toBe(0)
  })
})
