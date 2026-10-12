import { MeshDepthMaterial, RGBADepthPacking, type Material, type WebGLProgramParametersWithUniforms } from 'three'
import type { Gait, PlaceholderShape } from '../game/data/creatures'

/**
 * Procedural animation for generated creature models.
 *
 * The GLBs from the asset pipeline are single static meshes with no skeleton, so instead of
 * rigging them we bend their vertices in the vertex shader. `analyseRig` works out where the legs,
 * head and tail are from the shape of the mesh, and the shader moves each region with a gait
 * suited to the animal: legs swinging in a walk/trot/gallop, a kangaroo's hop, a penguin's waddle,
 * a snake's slither, a seal's or whale's undulation, and a bird's wingbeat in flight.
 */

export type MotionStyle = 'walk' | 'hop' | 'waddle' | 'slither' | 'swim' | 'bird'

export const MOTION_STYLE: Record<PlaceholderShape, MotionStyle> = {
  quadruped: 'walk',
  tortoise: 'walk',
  lizard: 'walk',
  echidna: 'walk',
  kangaroo: 'hop',
  bird: 'bird',
  penguin: 'waddle',
  serpent: 'slither',
  seal: 'swim',
  whale: 'swim',
}

const STYLE_ID: Record<MotionStyle, number> = { walk: 0, hop: 1, waddle: 2, slither: 3, swim: 4, bird: 5 }

/** Where a model's body parts are, in model space: feet at y = 0, facing +Z, centred on X/Z. */
export interface Rig {
  height: number
  /** Height of the hips and shoulders: everything below is leg. */
  legTop: number
  zMin: number
  zMax: number
  /** Splits the front legs from the back legs. */
  zMid: number
  /** Half the model's width. */
  xHalf: number
}

const SLICES = 24

/**
 * Finds the legs from the gap under the belly. Between the front and back legs there's nothing
 * until you reach the underside of the body, so the lowest slice with plenty of geometry in that
 * middle band is where the legs end. `positions` is a flat xyz array in model space (see Rig).
 */
export function analyseRig(positions: ArrayLike<number>): Rig {
  let height = 0
  let zMin = Infinity
  let zMax = -Infinity
  let xHalf = 0
  const n = positions.length / 3
  for (let i = 0; i < n; i++) {
    height = Math.max(height, positions[i * 3 + 1])
    zMin = Math.min(zMin, positions[i * 3 + 2])
    zMax = Math.max(zMax, positions[i * 3 + 2])
    xHalf = Math.max(xHalf, Math.abs(positions[i * 3]))
  }
  if (!(height > 0) || !(zMax > zMin)) return { height: Math.max(height, 0.01), legTop: 0, zMin: -0.5, zMax: 0.5, zMid: 0, xHalf: Math.max(xHalf, 0.01) }
  const len = zMax - zMin

  // Front and back legs are split at the widest gap between footprints (a tail resting on the
  // ground behind just adds another cluster).
  const feet: number[] = []
  for (let i = 0; i < n; i++) if (positions[i * 3 + 1] < height * 0.06) feet.push(positions[i * 3 + 2])
  feet.sort((a, b) => a - b)
  let zMid = (zMin + zMax) / 2
  let gap = 0
  for (let i = 1; i < feet.length; i++) {
    if (feet[i] - feet[i - 1] > gap) {
      gap = feet[i] - feet[i - 1]
      zMid = (feet[i] + feet[i - 1]) / 2
    }
  }
  const bandHalf = Math.max(gap * 0.3, len * 0.04)

  const band = new Array<number>(SLICES).fill(0)
  for (let i = 0; i < n; i++) {
    if (Math.abs(positions[i * 3 + 2] - zMid) > bandHalf) continue
    band[Math.min(SLICES - 1, Math.floor((positions[i * 3 + 1] / height) * SLICES))]++
  }
  const busiest = Math.max(...band)
  let belly = 0
  while (belly < SLICES - 1 && band[belly] < busiest * 0.3) belly++
  const legTop = Math.min(0.6, Math.max(0.1, belly / SLICES)) * height
  return { height, legTop, zMin, zMax, zMid, xHalf }
}

/** Uniforms one animated model instance drives every frame. */
export interface MotionUniforms {
  uPhase: { value: number }
  uAmt: { value: number }
  uRun: { value: number }
  uAir: { value: number }
  uTime: { value: number }
  uStyle: { value: number }
  uDims: { value: [number, number, number, number] }
  uRig: { value: [number, number, number, number] }
}

export function makeUniforms(rig: Rig, style: MotionStyle): MotionUniforms {
  return {
    uPhase: { value: 0 },
    uAmt: { value: 0 },
    uRun: { value: 0 },
    uAir: { value: 0 },
    uTime: { value: Math.random() * 100 },
    uStyle: { value: STYLE_ID[style] },
    uDims: { value: [rig.height, rig.legTop, rig.zMin, rig.zMax] },
    uRig: { value: [rig.zMid, rig.xHalf, 0, 0] },
  }
}

const DECLARATIONS = /* glsl */ `
uniform float uPhase, uAmt, uRun, uAir, uTime, uStyle;
uniform vec4 uDims, uRig;
`

const DEFORM = /* glsl */ `
{
  float H = uDims.x, legTop = max(uDims.y, 0.001), zMin = uDims.z, zMax = uDims.w;
  float len = max(zMax - zMin, 0.001), zMid = uRig.x, xHalf = max(uRig.y, 0.001);
  vec3 p = transformed;
  float t = (zMax - p.z) / len;                       // 0 at the nose, 1 at the tail tip
  float legW = smoothstep(legTop, legTop * 0.1, p.y);  // 1 at the feet, 0 at the hips
  float bodyW = 1.0 - legW;
  float headW = smoothstep(0.7, 0.95, 1.0 - t) * smoothstep(legTop * 0.8, legTop * 1.2, p.y);
  float tailW = smoothstep(0.75, 1.0, t) * smoothstep(legTop * 0.5, legTop, p.y);
  float idle = 1.0 - uAmt;

  if (uStyle < 0.5 || (uStyle > 1.5 && uStyle < 2.5) || uStyle > 4.5) {
    // Legs: walk and trot move diagonal pairs together; a gallop moves front and back pairs.
    float side = clamp(p.x / (xHalf * 0.2), -1.0, 1.0);
    float fb = clamp((p.z - zMid) / (len * 0.06), -1.0, 1.0);
    float pair = mix(side * fb, fb * 0.7, uRun);
    float ph = uPhase + (1.0 - pair) * 1.5708;
    float stride = legTop * (0.45 + 0.35 * uRun);
    p.z += sin(ph) * stride * legW * uAmt * (1.0 - uAir);
    p.y += max(0.0, cos(ph)) * legTop * 0.3 * legW * legW * uAmt * (1.0 - uAir);
    // The body rises twice a stride, and pitches when galloping.
    p.y += (0.5 + 0.5 * cos(uPhase * 2.0)) * H * 0.025 * bodyW * uAmt;
    p.y += sin(uPhase) * (p.z - zMid) * 0.12 * uRun * bodyW;
  }

  if (uStyle > 0.5 && uStyle < 1.5) {
    // Hop: the whole animal bounds, legs kick back in the air and the tail counterbalances.
    float air = max(0.0, sin(uPhase));
    p.y += air * H * 0.3 * uAmt;
    p.z -= legW * legTop * 0.6 * air * uAmt;
    p.y += tailW * sin(uPhase - 1.0) * H * 0.08 * uAmt;
    p.y += (p.z - zMid) * 0.15 * cos(uPhase) * uAmt;
  }

  if (uStyle > 1.5 && uStyle < 2.5) {
    // Waddle: roll from foot to foot about the ground.
    float roll = sin(uPhase) * 0.14 * uAmt;
    float x = p.x;
    p.x = x * cos(roll) - p.y * sin(roll);
    p.y = x * sin(roll) + p.y * cos(roll);
  }

  if (uStyle > 2.5 && uStyle < 3.5) {
    // Slither: a sideways wave travels from head to tail.
    float k = 6.2832 * 1.5;
    p.x += sin(t * k - uPhase) * len * 0.07 * (0.25 + 0.75 * uAmt) * smoothstep(0.0, 0.3, t);
  }

  if (uStyle > 3.5 && uStyle < 4.5) {
    // Swim / galumph: an up-and-down wave that grows toward the tail.
    p.y += sin(uPhase - t * 3.0) * H * 0.18 * t * t * (0.3 + 0.7 * uAmt);
    p.y += sin(uPhase) * H * 0.03 * uAmt;
  }

  if (uStyle > 4.5) {
    // Wings: the outer flanks above the legs beat in flight and fold back on landing.
    float wingW = smoothstep(xHalf * 0.3, xHalf, abs(p.x)) * smoothstep(legTop, H * 0.6, p.y);
    float beat = sin(uTime * 16.0);
    p.x += sign(p.x) * wingW * H * 0.35 * uAir;
    p.y += beat * abs(p.x) * 0.9 * wingW * uAir;
    // Hopping about on the ground.
    p.y += max(0.0, sin(uPhase)) * H * 0.08 * uAmt * (1.0 - uAir);
  }

  // Heads nod with each step and look around when idle; tails sway, faster on the move.
  if (uStyle < 2.5 || uStyle > 4.5) {
    p.y += sin(uPhase * 2.0 + 0.6) * H * 0.02 * headW * uAmt;
    p.x += sin(uTime * 0.45) * len * 0.06 * headW * idle;
    p.x += sin(uTime * (2.0 + 5.0 * uAmt)) * len * 0.07 * tailW * tailW;
  }
  // Breathing.
  p.x *= 1.0 + sin(uTime * 2.2) * 0.02 * bodyW * idle;

  transformed = p;
}
`

function patch(shader: WebGLProgramParametersWithUniforms, uniforms: MotionUniforms) {
  Object.assign(shader.uniforms, uniforms)
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>\n${DECLARATIONS}`)
    .replace('#include <begin_vertex>', `#include <begin_vertex>\n${DEFORM}`)
}

/** Makes `material` (a per-instance clone) deform with `uniforms`. */
export function animateMaterial(material: Material, uniforms: MotionUniforms) {
  material.onBeforeCompile = (shader) => patch(shader, uniforms)
  material.customProgramCacheKey = () => 'creature-motion'
}

/** A matching depth material, so shadows move with the model. */
export function animatedDepthMaterial(uniforms: MotionUniforms): MeshDepthMaterial {
  const depth = new MeshDepthMaterial({ depthPacking: RGBADepthPacking })
  animateMaterial(depth, uniforms)
  return depth
}

/** Advances the gait from the creature's current speed. Call once per frame. */
export function stepMotion(u: MotionUniforms, rig: Rig, style: MotionStyle, gait: Gait, speed: number, airborne: boolean, dt: number) {
  u.uTime.value += dt
  const moving = speed > 0.05 ? 1 : 0
  u.uAmt.value += (moving - u.uAmt.value) * Math.min(1, dt * 6)
  const run = Math.min(1, Math.max(0, (speed - gait.walk * 1.5) / Math.max(0.01, gait.run - gait.walk * 1.5)))
  u.uRun.value += (run - u.uRun.value) * Math.min(1, dt * 4)
  const flying = airborne || (style === 'bird' && speed > gait.walk * 2) ? 1 : 0
  u.uAir.value += (flying - u.uAir.value) * Math.min(1, dt * 5)

  // One cycle per stride. Long-legged animals take longer strides; cap the cadence so a sprint
  // stays readable instead of a blur.
  const len = rig.zMax - rig.zMin
  const baseStride =
    style === 'hop' ? rig.height * 1.4 : style === 'slither' || style === 'swim' ? len * 0.7 : Math.max(rig.legTop * 2.4, rig.height * 0.5)
  const stride = Math.max(baseStride * (1 + u.uRun.value * 0.8), speed / 4.5)
  const idleRate = style === 'swim' || style === 'slither' ? 0.6 : 0
  u.uPhase.value += dt * (speed > 0.05 ? (speed / stride) * Math.PI * 2 : idleRate)
}
