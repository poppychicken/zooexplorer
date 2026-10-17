import type { GroundTexture } from '../../components/terrainSurface'
import { HUB_SURFACE, hubHeight } from '../../scenes/hub/layout'

/** The area the zoo map covers, in world metres (x right, z down the hill towards the harbour). */
export const MAP_AREA = { minX: -74, maxX: 90, minZ: -84, maxZ: 68 }

/** Flat colours for each ground texture, as a cartographer would paint them. */
const PAINT: Record<GroundTexture, [number, number, number]> = {
  grass: [122, 164, 84],
  alpine_grass: [147, 169, 108],
  forest_floor: [109, 127, 62],
  gravel: [222, 208, 170],
  dirt: [160, 128, 88],
  desert_sand: [220, 178, 108],
  red_sand: [191, 111, 69],
  beach_sand: [232, 216, 168],
  rock: [150, 150, 145],
  cracked_earth: [200, 120, 70],
  snow: [240, 244, 246],
}

let cached: string | null = null

/**
 * A shaded-relief picture of the zoo hillside: each pixel takes the ground's real blend of
 * textures, lit from the north-west by its slope, with the harbour shaded by depth.
 */
export function zooRelief(pixelsPerMetre = 2): string {
  if (cached) return cached
  const w = Math.round((MAP_AREA.maxX - MAP_AREA.minX) * pixelsPerMetre)
  const h = Math.round((MAP_AREA.maxZ - MAP_AREA.minZ) * pixelsPerMetre)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  const img = ctx.createImageData(w, h)
  const e = 0.6
  // Light from the north-west and above.
  const L = [-0.45, 0.75, -0.48]
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const x = MAP_AREA.minX + (px + 0.5) / pixelsPerMetre
      const z = MAP_AREA.minZ + (py + 0.5) / pixelsPerMetre
      const y = hubHeight(x, z)
      let rgb: [number, number, number]
      if (y < -0.2) {
        // Water: shallows near the shore, deeper blue further out.
        const depth = Math.min(1, (-0.2 - y) / 3)
        rgb = [104 - 46 * depth, 168 - 50 * depth, 196 - 36 * depth]
        if (y > -0.45) rgb = [176, 214, 224]
      } else {
        const wts = HUB_SURFACE.weights(x, z, y, 0)
        let sum = 0
        rgb = [0, 0, 0]
        HUB_SURFACE.layers.forEach((layer, i) => {
          const v = Math.max(0, wts[i] ?? 0)
          sum += v
          rgb[0] += PAINT[layer][0] * v
          rgb[1] += PAINT[layer][1] * v
          rgb[2] += PAINT[layer][2] * v
        })
        rgb = rgb.map((c) => c / Math.max(sum, 1e-6)) as [number, number, number]
        // Hill shading from the slope.
        const dx = (hubHeight(x + e, z) - hubHeight(x - e, z)) / (2 * e)
        const dz = (hubHeight(x, z + e) - hubHeight(x, z - e)) / (2 * e)
        const n = [-dx, 1, -dz]
        const len = Math.hypot(n[0], n[1], n[2])
        const lit = (n[0] * L[0] + n[1] * L[1] + n[2] * L[2]) / len
        const shade = 0.72 + 0.42 * lit
        rgb = rgb.map((c) => c * shade) as [number, number, number]
      }
      const i = (py * w + px) * 4
      img.data[i] = Math.max(0, Math.min(255, rgb[0]))
      img.data[i + 1] = Math.max(0, Math.min(255, rgb[1]))
      img.data[i + 2] = Math.max(0, Math.min(255, rgb[2]))
      img.data[i + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  cached = canvas.toDataURL('image/png')
  return cached
}
