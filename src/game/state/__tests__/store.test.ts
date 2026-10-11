import { beforeEach, describe, expect, it } from 'vitest'
import { useGame } from '../store'

const state = () => useGame.getState()

describe('save store', () => {
  beforeEach(() => state().resetSave())

  it('starts with a little money and a Mk I net', () => {
    expect(state().money).toBe(50)
    expect(state().netTier).toBe(1)
  })

  it('opens an exhibit for a new species and adds repeat catches to it', () => {
    expect(state().capture('red_fox')).toEqual({ kind: 'new' })
    expect(state().discovered.red_fox).toBe(true)
    expect(state().capture('red_fox')).toEqual({ kind: 'added', count: 2 })
    expect(state().capture('red_fox')).toEqual({ kind: 'added', count: 3 })
    expect(state().captured.red_fox).toBe(3)
    // No cap on how many an exhibit holds.
    for (let i = 0; i < 50; i++) state().capture('red_fox')
    expect(state().captured.red_fox).toBe(53)
  })

  it('needs money to buy and Mk II before Mk III', () => {
    expect(state().canBuy('net_mk2')).toEqual({ ok: false, reason: 'Not enough money' })
    useGame.setState({ money: 2000 })
    expect(state().canBuy('net_mk3')).toEqual({ ok: false, reason: 'Needs Net Mk II' })
    expect(state().buy('net_mk2')).toBe(true)
    expect(state().netTier).toBe(2)
    expect(state().money).toBe(1850)
    expect(state().canBuy('net_mk2').reason).toBe('Owned')
    expect(state().buy('net_mk3')).toBe(true)
    expect(state().netTier).toBe(3)
  })

  it('stacks premium bait and unlocks the buggy once', () => {
    useGame.setState({ money: 1100 })
    expect(state().buy('premium_bait')).toBe(true)
    expect(state().premiumBait).toBe(5)
    expect(state().buy('buggy')).toBe(true)
    expect(state().owned.buggy).toBe(true)
    expect(state().buy('buggy')).toBe(false)
    expect(state().usePremiumBait()).toBe(true)
    expect(state().premiumBait).toBe(4)
  })

  it('credits income on tick and offline time', () => {
    state().capture('moss_antler_stag')
    const t0 = state().lastSeen
    state().tick(t0 + 3000)
    expect(state().money).toBeCloseTo(50 + 2)
    const r = state().collectOffline(t0 + 3000 + 60 * 60 * 1000)
    expect(r.amount).toBeCloseTo(40 * 60)
  })
})
