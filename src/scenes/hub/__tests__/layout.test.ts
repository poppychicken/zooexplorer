import { describe, expect, it } from 'vitest'
import { EDGES, NODES, PLOT_OFFSET, PLOT_SIZE, PRECINCTS, hubHeight, precinctHeight, route } from '../layout'

/** Every exhibit plot, as [centre x, centre z]. */
const plots = PRECINCTS.flatMap((p) =>
  [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ].map(([sx, sz]) => [p.center[0] + sx * PLOT_OFFSET, p.center[1] + sz * PLOT_OFFSET] as const),
)

/** Inside a plot's fence, with a little margin for people's width. */
const inPlot = (x: number, z: number) => plots.some(([px, pz]) => Math.abs(x - px) < PLOT_SIZE / 2 + 0.4 && Math.abs(z - pz) < PLOT_SIZE / 2 + 0.4)

describe('zoo footpaths', () => {
  it.each(EDGES.map(([a, b]) => [`${a} → ${b}`, a, b] as const))('%s never crosses an enclosure', (_, a, b) => {
    const [ax, az] = NODES[a]
    const [bx, bz] = NODES[b]
    const steps = Math.ceil(Math.hypot(bx - ax, bz - az) / 0.25)
    for (let i = 0; i <= steps; i++) {
      const t = i / steps
      const x = ax + (bx - ax) * t
      const z = az + (bz - az) * t
      expect(inPlot(x, z), `(${x.toFixed(1)}, ${z.toFixed(1)})`).toBe(false)
    }
  })

  it('connects the entrance to every precinct and the wharf', () => {
    for (const target of ['nuraDiya', 'tigerTrek', 'rainforest', 'savannah', 'oceans', 'wharf']) {
      const r = route('entrance', target)
      expect(r[0]).toEqual(NODES.entrance)
      expect(r[r.length - 1]).toEqual(NODES[target])
    }
  })
})

describe('precinct terraces', () => {
  it.each(PRECINCTS.map((p) => [p.name, p] as const))('%s is flat under every fence, corners included', (_, p) => {
    const level = precinctHeight(p)
    const edge = PLOT_OFFSET + PLOT_SIZE / 2 + 0.5
    for (let x = -edge; x <= edge; x += 0.5) {
      for (const z of [-edge, edge]) {
        expect(hubHeight(p.center[0] + x, p.center[1] + z)).toBeCloseTo(level, 3)
        expect(hubHeight(p.center[0] + z, p.center[1] + x)).toBeCloseTo(level, 3)
      }
    }
  })
})
