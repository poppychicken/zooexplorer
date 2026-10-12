# Zoo Explorer

A first-person, low-poly creature-collecting game that runs in the browser. You live in a zoo, head out into the wild to track and net creatures, and every species you bring home opens an exhibit that earns money. Money buys better nets, bait, a tracker and an off-road buggy, which open up rarer creatures and a new biome.

Built with Vite, React, TypeScript, React Three Fiber, Rapier physics and zustand. Saves are kept in `localStorage`, so it's a fully static site.

The design notes and decisions are in [`HANDOVER.md`](HANDOVER.md).

## Play

```sh
npm install
npm run dev        # http://localhost:5173
```

| Key | Action |
|---|---|
| WASD / arrows | Move (Shift to sprint, Space to jump) |
| Mouse | Look (click the game to capture the pointer) |
| E | Interact: expedition ferry, outfitter, buggy, return sign |
| Q | Drop bait (premium bait is used first) |
| Left click | Throw net |
| Tab | Field journal |
| E at the buggy | Get in or out of the Off-road Buggy (W/S drive, A/D steer, Shift boost) |
| Esc | Pause menu: back to the entrance (or home from an expedition), sensitivity, reset save |

### Loop

1. **Zoo hub.** A hillside zoo modelled loosely on Taronga Zoo Sydney: you arrive at the Main Entrance on the hilltop, and the paths wind down past the precincts to the ferry wharf on the harbour, with the Sky Safari overhead and the city across the water. Each expedition biome is exhibited in its own precinct (Temperate Forest → Rainforest Trail, Arid Canyon → African Savannah, Outback Scrub → Nura Diya Australia, Mountain → Tiger Trek, Sea Coast → Great Southern Oceans), and its species' plots fill in as you capture them. Visitors pay for tickets around the clock, including while you're away (capped at 8 hours).
2. **Expedition ferry.** Board it at the wharf at the bottom of the hill and pick a biome. Five biomes, each unlocked by gear from the outfitter: Temperate Forest (open), Arid Canyon (Off-road Buggy), Outback Scrub at dusk (Night-Vision Goggles), Mountain with real hills (Climbing Gear) and Sea Coast with a lagoon (Zodiac Boat). The Arid Canyon needs the Off-road Buggy.
3. **Track.** Follow footprints, and listen for spatialised calls. The sound log tells you roughly where each came from. Creatures spot you inside their detection radius, which is larger when you sprint and largest for the big-eared fennec fox.
4. **Lure.** Drop bait and back off. Creatures nearby walk over, eat and stay calm, and a calm creature won't flee.
5. **Net.** Capture chance is `base(rarity) × net multiplier × (baited ? 1.5 : 1)`, capped at 95%. The journal shows your current odds.
6. **Drive.** Once you own the Off-road Buggy, it's parked by the Main Entrance and wherever you arrive in a biome. Press E to hop in. It's much faster than walking, but the engine scares creatures from twice as far, so park and walk the last stretch.
7. **Legendaries.** Each biome has one in a lair at the far end. Netting it starts a mini-game: hold to wind in, then release while the struggle marker is in the green zone. Better nets widen the zone. Three misses and it breaks free.

**Visitors pay to get in.** Once your zoo has an animal, about 4 visitors a minute buy a ticket at the booth by the entrance. The ticket price is the sum over every animal: common +$0.50, uncommon +$1.25, rare +$3, legendary +$10, so more and rarer animals mean pricier tickets. Your income is visitors × ticket price, and it keeps coming while you're away. Exhibits hold any number of animals. Every extra catch of a species joins its enclosure and adds that species' income. Creatures that can fly (the barn owl) live in a roofed aviary.

Balance values live in `src/game/data/` (`creatures.ts`, `shop.ts`, `biomes.ts`) and `src/game/systems/capture.ts`.

## Scripts

```sh
npm run dev         # dev server
npm test            # vitest unit tests (capture odds, mini-game, economy, save store)
npm run typecheck
npm run build       # production build into dist/
```

## Project layout

```
src/
  game/
    data/          creatures, biomes, shop items: all balance and content
    state/store.ts persisted save (zustand + localStorage) and session UI state
    systems/       economy, capture odds, hunt actions, input, audio, world runtime, asset index
  scenes/          ZooHub, Biome (data-driven from biomes.ts)
    hub/           zoo layout (precincts, paths, terrain), harbour + skyline, Sky Safari
  components/      Player (FPS controller), Creature (AI), CreatureModel (GLB or placeholder),
                   Props, Ground, Sign, CaptureMiniGame
  ui/              HUD, radar, panels (pause, gate, shop), journal
public/assets/creatures/   generated GLBs/PNGs and index.json
scripts/generate_assets/   Replicate asset pipeline
```

Debugging: `window.__zoo` in the browser console exposes the stores, the player (`__zoo.player.teleport(x, z, yaw)`), live creatures and simulated input.

## Generating creature assets (Replicate)

All 20 creatures have generated models and journal icons in `public/assets/creatures/`, made with the pipeline below. `CreatureModel` loads `<id>.glb` whenever `index.json` lists it, scales it to the creature's height and sits it on the ground. Any creature without one falls back to its procedural placeholder.

The script is meant to be run **locally**, never from the browser. Your token only ever lives in `.env`, which is git-ignored.

```sh
pip install -r scripts/generate_assets/requirements.txt   # just Pillow
cp .env.example .env                    # then add REPLICATE_API_TOKEN=r8_...
python scripts/generate_assets/generate.py --dry-run
python scripts/generate_assets/generate.py --only red_fox   # try one first
python scripts/generate_assets/generate.py                  # everything still missing
python scripts/generate_assets/generate.py --force --only barn_owl   # redo one you don't like
```

For each creature in `scripts/generate_assets/manifest.json`, the script:

1. makes a reference image with the image model (`black-forest-labs/flux-schnell`, about $0.003 each), using one shared low-poly style prompt;
2. crops it into a 256 px journal icon;
3. sends it to the image-to-3D model (`firtoz/trellis`, roughly 20 s each) for a GLB;
4. if Node is installed, simplifies the GLB and compresses it with `gltf-transform` (meshopt + WebP textures, about 100 KB per creature);
5. rewrites `index.json`.

It's idempotent: creatures that already have assets are skipped unless you pass `--force`, and finished steps are cached in `scripts/generate_assets/.cache/` so a failed run can be retried cheaply. Commit the files it writes to `public/assets/creatures/`.

It talks to Replicate's HTTP API directly (no SDK), honours `HTTPS_PROXY`, and retries when Replicate throttles you (accounts with under $5 credit are limited to about 6 predictions a minute) or a connection drops. The image model occasionally flags a harmless prompt as NSFW; just run it again.

Per-creature settings in the manifest:

- `"yaw": -90` turns a model that came out facing the wrong way (degrees about the vertical axis; creatures walk towards +Z). It's written into `index.json` and applied in the game.
- `"model_3d": {...}` swaps in a different image-to-3D model for that creature only, with the same shape as the top-level `model_3d`.

Known limits: generated models are static (no walk cycle), and TRELLIS drops thin structures, so the Moss-Antler Stag has lost its antlers. Hunyuan3D 2.1 (`ndreca/hunyuan3d-2.1`) did worse on it. TRELLIS.2 or Rodin are the next things to try.

**Check the model names first.** Replicate's catalogue changes often. Model refs and input keys are settings in `manifest.json` (`image_model`, `model_3d.ref`, `model_3d.image_key`, `model_3d.input`).

## Scenery (Stylized Nature MegaKit)

Trees, rocks, ferns, grass, flowers and mushrooms come from Quaternius's [Stylized Nature MegaKit](https://quaternius.com) (CC0, no attribution required). The 39 models the game uses are bundled into one file, `public/assets/nature/nature.glb` (about 1.3 MB, sharing 12 WebP textures), by:

```sh
node scripts/nature/build.mjs <folder with the pack's .glb files>
```

The pick list (model id → pack file) is at the top of that script, and `src/components/NatureKit.tsx` maps prop kinds to model ids (`KIT`) with a target height for each. Props spread across a kind's variants, so the forest mixes five pines and five broadleaf trees. Kinds not in the kit (cactus, mesa, termite mound, ghost gum, peak, log) keep their procedural shapes, and those shapes also stand in while the scenery file loads. Each biome can tint the grey kit rocks with `rockTint` in `biomes.ts`, which turns them into red sandstone in the canyon and outback.

## Ground textures

The ground is textured with 11 seamless, hand-painted tiles in `public/assets/textures/`: grass, forest floor, dirt, rock, desert sand, cracked earth, red sand, alpine grass, snow, beach sand and gravel. `scripts/generate_assets/textures.py` generates them from the prompts in `textures.json`:

```sh
python scripts/generate_assets/textures.py                       # anything missing
python scripts/generate_assets/textures.py --force --only gravel  # redo one
```

1. FLUX 1.1 Pro paints a top-down texture (about $0.04 each).
2. The script removes its lighting gradients.
3. It blends four half-shifted copies so the texture tiles with no seams.

An optional `saturation` per texture tones down colours that come out too strong.

`TerrainMaterial` blends up to eight textures per vertex. Each texture is sampled at two scales, with noise-broken borders, so the repeat doesn't show.

Where each texture goes is set per biome in `biomeSurface` (`biomeTerrain.ts`) and for the zoo in `HUB_SURFACE` (`hub/layout.ts`):
- **Forest:** leaf litter gathers under trees.
- **Canyon:** rubble around rocks and mesas.
- **Mountain:** rock on steep slopes and snow up high.
- **Sea Coast:** sand along the water.
- **Zoo:** gravel paths, with each precinct on its biome's ground.

Each texture has a real-world tile size (`TILE_METRES` in `TerrainMaterial.tsx`), so grass blades, pebbles and leaves come out life-sized.

**3D grass.** `GrassField` grows instanced grass clumps out of the ground. Each surface's `grass` spec sets how much grows on each texture, plus density, colours and height. So the forest, mountain meadow and zoo lawns are thick with it, the outback and canyon get sparse dry tufts, and none grows on paths, sand, snow or inside enclosures. Clumps are placed once, in 10 m chunks. Only chunks within about 34 m of the camera are drawn, and blades shrink into the ground near that edge and sway in the wind.

Until the textures load, or if they fail, the ground falls back to its flat colours.

## Deploying (GitHub Pages)

`.github/workflows/deploy.yml` runs the tests, builds and publishes `dist/` on every push to `main`. In the repo, open **Settings → Pages** and set **Source** to **GitHub Actions**. Production builds use the base path `/zooexplorer/` (see `vite.config.ts`). Change it there if you rename the repo or use a custom domain.
