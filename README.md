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
| E | Interact: expedition gate, outfitter, return sign |
| Q | Drop bait (premium bait is used first) |
| Left click | Throw net |
| Tab | Field journal |
| Esc | Pause menu: return to zoo, sensitivity, reset save |

### Loop

1. **Zoo hub.** Eight empty exhibit plots fill in as you capture each species. Exhibits earn money every second, and while you're away too (capped at 8 hours).
2. **Expedition gate.** Pick a biome. The Arid Canyon needs the Off-road Buggy.
3. **Track.** Follow footprints, and listen for spatialised calls. The sound log tells you roughly where each came from. Creatures spot you inside their detection radius, which is larger when you sprint and largest for the big-eared fennec fox.
4. **Lure.** Drop bait and back off. Creatures nearby walk over, eat and stay calm, and a calm creature won't flee.
5. **Net.** Capture chance is `base(rarity) × net multiplier × (baited ? 1.5 : 1)`, capped at 95%. The journal shows your current odds.
6. **Legendaries.** Each biome has one in a lair at the far end. Netting it starts a mini-game: hold to wind in, then release while the struggle marker is in the green zone. Better nets widen the zone. Three misses and it breaks free.

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
  components/      Player (FPS controller), Creature (AI), CreatureModel (GLB or placeholder),
                   Props, Ground, Sign, CaptureMiniGame
  ui/              HUD, radar, panels (pause, gate, shop), journal
public/assets/creatures/   generated GLBs/PNGs and index.json
scripts/generate_assets/   Replicate asset pipeline
```

Debugging: `window.__zoo` in the browser console exposes the stores, the player (`__zoo.player.teleport(x, z, yaw)`), live creatures and simulated input.

## Generating creature assets (Replicate)

The game ships with procedural placeholder creatures. The pipeline swaps in real models without any code changes: `CreatureModel` loads `public/assets/creatures/<id>.glb` whenever `index.json` lists it, and scales it to the creature's height automatically.

The script is meant to be run **locally**, never from the browser. Your token only ever lives in `.env`, which is git-ignored.

```sh
python -m venv .venv && source .venv/bin/activate
pip install -r scripts/generate_assets/requirements.txt
cp .env.example .env                    # then add REPLICATE_API_TOKEN=r8_...
python scripts/generate_assets/generate.py --dry-run
python scripts/generate_assets/generate.py --only red_fox   # try one first
python scripts/generate_assets/generate.py                  # everything still missing
```

For each creature in `scripts/generate_assets/manifest.json`, the script:

1. makes a reference image with the image model (default `black-forest-labs/flux-schnell`), using one shared low-poly style prompt;
2. crops it into a 256 px journal icon;
3. sends it to the image-to-3D model (default `firtoz/trellis`) for a GLB;
4. if Node is installed, simplifies the GLB and compresses it with `gltf-transform` (meshopt + WebP textures);
5. rewrites `index.json`.

It's idempotent: creatures that already have assets are skipped unless you pass `--force`, and finished steps are cached in `scripts/generate_assets/.cache/` so a failed run can be retried cheaply. Commit the files it writes to `public/assets/creatures/`.

**Check the model names first.** Replicate's catalogue changes often. Model refs and input keys are settings in `manifest.json` (`image_model`, `model_3d.ref`, `model_3d.image_key`, `model_3d.input`), so you can switch to, say, TRELLIS.2 or Hunyuan3D by editing that file.

## Deploying (GitHub Pages)

`.github/workflows/deploy.yml` runs the tests, builds and publishes `dist/` on every push to `main`. In the repo, open **Settings → Pages** and set **Source** to **GitHub Actions**. Production builds use the base path `/zooexplorer/` (see `vite.config.ts`). Change it there if you rename the repo or use a custom domain.
