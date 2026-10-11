import { describe, expect, it } from 'vitest'
import { BANK_RATE, MINIGAME, captureChance, resolveRelease } from '../capture'

describe('captureChance', () => {
  it('uses base × net × bait', () => {
    expect(captureChance('common', 1, false)).toBeCloseTo(0.6)
    expect(captureChance('uncommon', 1, true)).toBeCloseTo(0.35 * 1.5)
    expect(captureChance('uncommon', 2, false)).toBeCloseTo(0.35 * 1.4)
    expect(captureChance('rare', 3, true)).toBeCloseTo(0.15 * 1.9 * 1.5)
  })

  it('caps at 95%', () => {
    expect(captureChance('common', 3, true)).toBe(0.95)
    expect(captureChance('common', 2, true)).toBe(0.95)
  })

  it('never auto-rolls legendaries', () => {
    expect(captureChance('legendary', 3, true)).toBe(0)
  })
})

describe('legendary mini-game', () => {
  const start = { progress: 0, strikes: 0, charge: 1 }

  it('banks charge when released in the green zone', () => {
    const { state, hit } = resolveRelease(start, 0.5, 0.5, 0.2)
    expect(hit).toBe(true)
    expect(state.progress).toBeCloseTo(BANK_RATE)
    expect(state.charge).toBe(0)
    expect(state.strikes).toBe(0)
  })

  it('counts the zone edges as inside', () => {
    expect(resolveRelease(start, 0.6, 0.5, 0.2).hit).toBe(true)
    expect(resolveRelease(start, 0.61, 0.5, 0.2).hit).toBe(false)
  })

  it('costs a strike and progress on a miss', () => {
    const { state, hit } = resolveRelease({ progress: 0.5, strikes: 1, charge: 0.8 }, 0.1, 0.5, 0.2)
    expect(hit).toBe(false)
    expect(state.progress).toBeCloseTo(0.5 - MINIGAME.missPenalty)
    expect(state.strikes).toBe(2)
  })

  it('needs two full clean pulls to win', () => {
    let s = start
    s = resolveRelease(s, 0.5, 0.5, 0.2).state
    expect(s.progress).toBeLessThan(1)
    s = resolveRelease({ ...s, charge: 1 }, 0.5, 0.5, 0.2).state
    expect(s.progress).toBe(1)
  })
})
