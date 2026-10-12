import { BufferAttribute, BufferGeometry, type InterleavedBufferAttribute, type Matrix4 } from 'three'

/**
 * Copies `geometry` with `matrix` baked into it. Compressed GLBs store positions and normals as
 * normalised 16-bit integers, which can only hold values in [-1, 1]; transforming them in place
 * would clamp everything outside that range, so every attribute is expanded to floats first.
 */
export function bakeGeometry(geometry: BufferGeometry, matrix: Matrix4): BufferGeometry {
  const out = new BufferGeometry()
  for (const [name, attr] of Object.entries(geometry.attributes) as [string, BufferAttribute | InterleavedBufferAttribute][]) {
    const size = attr.itemSize
    const data = new Float32Array(attr.count * size)
    for (let i = 0; i < attr.count; i++) {
      data[i * size] = attr.getX(i)
      if (size > 1) data[i * size + 1] = attr.getY(i)
      if (size > 2) data[i * size + 2] = attr.getZ(i)
      if (size > 3) data[i * size + 3] = attr.getW(i)
    }
    out.setAttribute(name, new BufferAttribute(data, size))
  }
  if (geometry.index) out.setIndex(geometry.index.clone())
  for (const group of geometry.groups) out.addGroup(group.start, group.count, group.materialIndex)
  out.applyMatrix4(matrix)
  return out
}
