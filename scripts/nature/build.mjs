#!/usr/bin/env node
/**
 * Builds public/assets/nature/nature.glb from Quaternius's Stylized Nature MegaKit (CC0).
 *
 * Picks the models the game uses, gives each a stable id (the node names the game looks up),
 * merges them into one file so they share textures, then shrinks textures to WebP and compresses
 * geometry with meshopt.
 *
 * Usage:
 *   node scripts/nature/build.mjs <folder with the pack's .glb files>
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { Document, NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { dedup, mergeDocuments, prune, unpartition } from '@gltf-transform/functions'

/** id → source file name (without .glb) in the pack. */
const PICKS = {
  pine_1: 'Pine',
  pine_2: 'Pine-699sFuLCN2',
  pine_3: 'Pine-79gmlLnweB',
  pine_4: 'Pine-Zt62gceKXZ',
  pine_5: 'Pine-rfnxJv0Rqa',
  tree_1: 'Tree',
  tree_2: 'Tree-QVOop92WmG',
  tree_3: 'Tree-aVOxaHRPWe',
  tree_4: 'Tree-qZtx0AHhcy',
  tree_5: 'Tree-t9KbsfYdXz',
  dead_1: 'Dead Tree',
  dead_2: 'Dead Tree-CD4edbPSGm',
  dead_3: 'Dead Tree-Mcd2zYqyww',
  dead_4: 'Dead Tree-MlmK5488ou',
  dead_5: 'Dead Tree-n8FhMgMldD',
  rock_1: 'Rock Medium',
  rock_2: 'Rock Medium-JQxF95498B',
  rock_3: 'Rock Medium-s1OJ3bBzqc',
  pebble_1: 'Pebble Round',
  pebble_2: 'Pebble Round-KYtJ6JNXh2',
  pebble_3: 'Pebble Square',
  pebble_4: 'Pebble Square-2YtLzwgsWp',
  bush_1: 'Bush with Flowers',
  plant_1: 'Plant',
  agave_1: 'Plant Big-MbhbP7JrTI',
  fern_1: 'Fern',
  grass_1: 'Grass',
  grass_2: 'Tall Grass',
  wispy_1: 'Grass Wispy',
  wispy_2: 'Grass Wispy-Msr9zx66VU',
  clover_1: 'Clover',
  clover_2: 'Clover-u5SOgBFiut',
  flowers_1: 'Flower Group',
  flowers_2: 'Flower Group-LqTljN6Wg2',
  flowers_3: 'Flower Single',
  flowers_4: 'Flower Single-GvfHo0roi3',
  violets_1: 'Plant-xH5gNlQxAZ',
  mushroom_1: 'Mushroom',
  mushroom_2: 'Mushroom Laetiporus',
}

const src = process.argv[2]
if (!src || !existsSync(src)) {
  console.error('Usage: node scripts/nature/build.mjs <folder with the Stylized Nature MegaKit .glb files>')
  process.exit(2)
}
const outDir = resolve('public/assets/nature')
mkdirSync(outDir, { recursive: true })
const merged = join(outDir, 'nature.raw.glb')
const out = join(outDir, 'nature.glb')

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
const doc = new Document()
doc.createBuffer()
const scene = doc.createScene('Nature')
for (const [id, file] of Object.entries(PICKS)) {
  const part = await io.read(join(src, `${file}.glb`))
  const map = mergeDocuments(doc, part)
  // Wrap each model's scene under one node named by its id.
  const holder = doc.createNode(id)
  for (const s of part.getRoot().listScenes()) for (const child of s.listChildren()) holder.addChild(map.get(child))
  scene.addChild(holder)
}
// mergeDocuments brings each file's scenes along; keep only ours.
for (const s of doc.getRoot().listScenes()) if (s !== scene) s.dispose()
doc.getRoot().setDefaultScene(scene)
await doc.transform(prune(), dedup(), unpartition())
await io.write(merged, doc)

const cli = (...args) => execFileSync('npx', ['--yes', '@gltf-transform/cli', ...args], { stdio: 'inherit' })
cli('resize', merged, out, '--width', '512', '--height', '512')
cli('webp', out, out)
cli('meshopt', out, out)
execFileSync('rm', [merged])
console.log(`Wrote ${out} (${(statSync(out).size / 1024 / 1024).toFixed(2)} MB, ${Object.keys(PICKS).length} models)`)
