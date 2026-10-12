import { describe, expect, it } from 'vitest'
import { analyseRig } from '../creatureMotion'

/** A box-ish quadruped: four thin legs up to `legTop`, a body above, optionally a tail on the ground. */
function quadruped(legTop: number, tailOnGround = false): number[] {
  const pts: number[] = []
  const add = (x: number, y: number, z: number) => pts.push(x, y, z)
  for (const lx of [-0.15, 0.15])
    for (const lz of [-0.4, 0.4]) for (let y = 0; y <= legTop; y += 0.02) for (const d of [-0.02, 0.02]) add(lx + d, y, lz + d)
  for (let y = legTop; y <= 1; y += 0.02) for (let z = -0.5; z <= 0.5; z += 0.02) for (const x of [-0.2, 0, 0.2]) add(x, y, z)
  if (tailOnGround) for (let z = -1; z <= -0.6; z += 0.02) add(0, 0.01, z)
  return pts
}

describe('analyseRig', () => {
  it('finds where the legs end', () => {
    const rig = analyseRig(quadruped(0.4))
    expect(rig.height).toBeCloseTo(1, 1)
    expect(rig.legTop).toBeGreaterThan(0.33)
    expect(rig.legTop).toBeLessThan(0.47)
    expect(Math.abs(rig.zMid)).toBeLessThan(0.1)
  })

  it('is not fooled by a tail resting on the ground', () => {
    const rig = analyseRig(quadruped(0.4, true))
    expect(rig.legTop).toBeGreaterThan(0.33)
    expect(Math.abs(rig.zMid)).toBeLessThan(0.1)
  })

  it('copes with an empty mesh', () => {
    const rig = analyseRig([])
    expect(rig.height).toBeGreaterThan(0)
    expect(rig.legTop).toBe(0)
  })
})
