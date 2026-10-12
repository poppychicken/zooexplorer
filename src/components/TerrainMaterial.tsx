import { useMemo } from 'react'
import { useTexture } from '@react-three/drei'
import { MeshStandardMaterial, RepeatWrapping, SRGBColorSpace, type Texture } from 'three'
import { MAX_LAYERS, type GroundTexture } from './terrainSurface'

const url = (id: GroundTexture) => `${import.meta.env.BASE_URL}assets/textures/${id}.webp`

const DECLARE_VERTEX = /* glsl */ `
attribute vec4 splatA;
attribute vec4 splatB;
attribute float tint;
varying vec4 vSplatA;
varying vec4 vSplatB;
varying float vTint;
varying vec3 vGroundPos;
`

const VERTEX = /* glsl */ `
vSplatA = splatA;
vSplatB = splatB;
vTint = tint;
vGroundPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
`

const DECLARE_FRAGMENT = /* glsl */ `
uniform sampler2D uLayer[${MAX_LAYERS}];
uniform float uTileSize;
varying vec4 vSplatA;
varying vec4 vSplatB;
varying float vTint;
varying vec3 vGroundPos;

float gHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float gNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(gHash(i), gHash(i + vec2(1, 0)), u.x), mix(gHash(i + vec2(0, 1)), gHash(i + vec2(1, 1)), u.x), u.y);
}

// Two samples at different scales and angles, mixed by slow noise, so the tile never visibly repeats.
vec3 groundSample(sampler2D tex, vec2 p, float mixer) {
  vec3 a = texture2D(tex, p / uTileSize).rgb;
  vec2 q = mat2(0.8, -0.6, 0.6, 0.8) * p / (uTileSize * 2.7) + 0.37;
  vec3 b = texture2D(tex, q).rgb;
  return mix(a, b, mixer);
}
`

// Sampler arrays need constant indices in GLSL ES, so the layers are unrolled.
const SAMPLE = Array.from({ length: MAX_LAYERS }, (_, i) => {
  const w = i < 4 ? `vSplatA[${i}]` : `vSplatB[${i - 4}]`
  return `  w = ${w} * (0.55 + 0.9 * gNoise(vGroundPos.xz * 0.35 + ${(i * 17.3).toFixed(1)}));
  if (w > 0.002) { ground += w * groundSample(uLayer[${i}], vGroundPos.xz, mixer); total += w; }`
}).join('\n')

const FRAGMENT = /* glsl */ `
{
  float mixer = smoothstep(0.25, 0.75, gNoise(vGroundPos.xz * 0.045));
  vec3 ground = vec3(0.0);
  float total = 0.0;
  float w;
${SAMPLE}
  ground /= max(total, 0.0001);
  // Broad light and dark patches, plus each facet's own shade, keep the faceted look.
  ground *= (0.88 + 0.24 * gNoise(vGroundPos.xz * 0.02 + 5.0)) * vTint;
  diffuseColor.rgb *= ground;
}
`

/** A MeshStandardMaterial that blends `layers` (up to eight) by the geometry's splat weights. */
export function TerrainMaterial({ layers, tileSize = 5 }: { layers: GroundTexture[]; tileSize?: number }) {
  const textures = useTexture(layers.map(url)) as Texture[]
  const material = useMemo(() => {
    for (const t of textures) {
      t.wrapS = t.wrapT = RepeatWrapping
      t.colorSpace = SRGBColorSpace
      t.anisotropy = 8
      t.needsUpdate = true
    }
    // Unused slots repeat the first texture; their weight is always zero.
    const slots = Array.from({ length: MAX_LAYERS }, (_, i) => textures[i] ?? textures[0])
    const mat = new MeshStandardMaterial({ flatShading: true, roughness: 0.95, metalness: 0 })
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uLayer = { value: slots }
      shader.uniforms.uTileSize = { value: tileSize }
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${DECLARE_VERTEX}`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>\n${VERTEX}`)
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${DECLARE_FRAGMENT}`)
        .replace('#include <map_fragment>', `#include <map_fragment>\n${FRAGMENT}`)
    }
    mat.customProgramCacheKey = () => 'terrain-splat'
    return mat
  }, [textures, tileSize])
  return <primitive object={material} attach="material" />
}
