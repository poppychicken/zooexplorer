import { describe, expect, it } from 'vitest'
import { OFFLINE_CAP_MS, formatPrice, incomePerMinute, offlineEarnings, ticketPrice, visitorsPerMinute } from '../economy'

describe('visitors and tickets', () => {
  it('keeps an empty zoo closed', () => {
    expect(ticketPrice({})).toBe(0)
    expect(visitorsPerMinute({})).toBe(0)
    expect(incomePerMinute({})).toBe(0)
  })

  it('charges more for more animals', () => {
    expect(ticketPrice({ red_fox: 1 })).toBe(0.5)
    expect(ticketPrice({ red_fox: 4 })).toBe(2)
  })

  it('charges more for rarer animals', () => {
    expect(ticketPrice({ barn_owl: 1 })).toBe(1.25)
    expect(ticketPrice({ moss_antler_stag: 1 })).toBe(10)
    expect(ticketPrice({ red_fox: 2, barn_owl: 1, glassdune_serpent: 1 })).toBe(1 + 1.25 + 10)
  })

  it('earns visitors × ticket price', () => {
    expect(visitorsPerMinute({ red_fox: 1 })).toBe(4)
    expect(incomePerMinute({ red_fox: 2, barn_owl: 1 })).toBe(4 * (1 + 1.25))
  })

  it('formats prices with cents', () => {
    expect(formatPrice(3.5)).toBe('$3.50')
    expect(formatPrice(1234)).toBe('$1,234.00')
  })
})

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
