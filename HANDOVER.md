# Zoo Explorer — Project Handover

Handover notes for restarting this project from scratch in a new Claude Code session. Nothing has been built yet: this document captures the concept, the decisions already made, and the agreed plan for the first playable slice.

---

## 0. Status (October 2026)

The vertical slice from section 4 is built (see `README.md` to run it). All four milestones are done: hub and FPS controller, forest and capture loop, shop and economy, canyon and legendary mini-game. The Replicate pipeline (`scripts/generate_assets/generate.py`) has been written but not yet run, because the user runs it locally, so the game still uses procedural placeholder creatures. Tuning still to do in real playtests: detection radii, mini-game speed and the prices.

---

## 1. Concept

A **first-person explorer game playable in the browser**.

- The player lives in a zoo.
- They travel out into biomes around the zoo to find creatures.
- Capturing a creature opens a new exhibit in the zoo, and exhibits earn money.
- Money buys exploring equipment and machines, which let the player explore further and find rarer creatures.

## 2. Decisions already made

| Topic | Decision |
|---|---|
| Platform | Web, in the browser. Desktop keyboard and mouse only for now (no mobile/touch). |
| Rendering | Stylized **low-poly 3D** with **Three.js** via **React Three Fiber** (React + Vite). |
| Controls | Pointer-lock first-person: WASD to move, mouse to look, E to interact, Q for bait, left-click to throw the net, Tab for the journal. |
| Assets | Generate with **Replicate** (replicate.com) **ahead of time** and commit the GLB/PNG files to the repo. No runtime AI calls. |
| Until assets exist | Use procedural low-poly placeholder creatures, so the game runs without any assets generated. |
| Creature theme | **Mix**: real animals for common and uncommon tiers, plus one **fantastical legendary** per biome. |
| Capture mechanic | **Track → lure → net** for normal creatures. Each biome's **legendary** needs a **capture mini-game** instead. |
| First deliverable | A **playable vertical slice** (scope in section 4). |

## 2a. Confirmed before restart (overrides anything above)

| Topic | Decision |
|---|---|
| Repo | Keep using `poppychicken/zooexplorer`. It was created from the SwipeJobs selfserve template (FastAPI + MongoDB + SSO). **Strip all of it** (`backend/`, `frontend/`, `Dockerfile`, `.dockerignore`, `.grype.yaml`, `config-sample.yaml`, `start.sh`, `renovate.json`, `docs/TEMPLATE_BOOTSTRAP.md`, template `.github/` workflows/scripts/issue templates, template README) and scaffold a plain static Vite app at the repo root. |
| Language | **TypeScript** throughout. |
| Physics | **Use `@react-three/rapier`** for collisions and the net throw. |
| Hosting | **GitHub Pages via GitHub Actions**: add a deploy workflow, Vite `base: '/zooexplorer/'`. |
| Asset script | **Python** (`scripts/generate_assets/generate.py` + `manifest.json`, using the `replicate` Python client). The user runs it **locally** with their own token. The cloud session never calls Replicate, and the game uses procedural placeholders until GLBs are committed. |
| Pace | Build the **full vertical slice**, committing and pushing after each milestone: (1) scaffold + FPS controller in the zoo hub, (2) forest biome + capture loop, (3) shop + economy, (4) canyon + legendary mini-game. |

## 3. Starting fresh — setup checklist

1. ~~Create a new personal GitHub repo~~ Superseded: see 2a (reuse `poppychicken/zooexplorer`, strip the template).
2. Scaffold it: `npm create vite@latest` (React), then add `three`, `@react-three/fiber`, `@react-three/drei` and, optionally, `@react-three/rapier` for physics and collisions.
3. Hosting: since all assets are pre-generated, the game can be a **static site** on GitHub Pages, Netlify, Vercel or Cloudflare Pages.
4. Saves: use **localStorage** for the slice. A backend for cloud saves (e.g. Supabase or a small API) can come later.
5. Replicate:
   - Create an API token at replicate.com.
   - Keep it in a local `.env` file and add `.env` to `.gitignore`.
   - **Never put it in frontend code.** Only the offline asset script uses it.
6. Not needed (see 2a, the script runs locally only). If that changes, Claude Code on the web needs a token and network access to call Replicate:
   - add `REPLICATE_API_TOKEN` as an environment secret;
   - allow `api.replicate.com` and `replicate.delivery` in the environment's network policy.

## 4. Vertical slice scope

### Game loop
1. **Zoo hub (first-person).**
   - Walk around the zoo.
   - Empty exhibit plots fill in as you capture creatures.
   - Each exhibit earns money over time, including while offline (capped).
2. **Expedition gate.** Choose a biome. Locked biomes show which equipment they need.
3. **Biomes.** Two in the slice:
   - **Temperate Forest:** the starter biome.
   - **Arid Canyon:** needs the Off-road Buggy.
4. **Capture.**
   - Follow tracks and sounds to find a creature.
   - Place bait to calm it.
   - Throw a net. The chance of success depends on your net tier versus the creature's rarity.
5. **Legendary capture mini-game.** Hold to fill a capture meter while the creature struggles; release when its struggle bar is in the green zone. A better net widens the zone.
6. **Shop.** Buy nets, bait, a tracker and vehicles.
7. **Journal.** Discovered and captured creatures, with rarity and how much each one earns.

### Creature roster (draft)

| Biome | Creature | Rarity |
|---|---|---|
| Temperate Forest | Red fox | Common |
| Temperate Forest | European badger | Common |
| Temperate Forest | Barn owl | Uncommon |
| Temperate Forest | **Moss-Antler Stag** (glowing moss antlers) | Legendary |
| Arid Canyon | Fennec fox | Common |
| Arid Canyon | Desert tortoise | Common |
| Arid Canyon | Gila monster | Uncommon |
| Arid Canyon | **Glassdune Serpent** (translucent, sand-glass scales) | Legendary |

### Economy (starting values, tune in playtesting)

| Item | Value |
|---|---|
| Exhibit income | Common $2/min · Uncommon $5/min · Rare $12/min · Legendary $40/min |
| Offline earnings | Capped at 8 hours |
| Net Mk II | $150 |
| Net Mk III | $600 |
| Premium Bait (×5) | $50 |
| Tracker (creatures on radar) | $300 |
| Off-road Buggy (unlocks Canyon) | $1,000 |

**Capture chance (non-legendary):** `base(rarity) × netMultiplier × (baited ? 1.5 : 1)`, capped at 95%. Suggested base values: common 0.6, uncommon 0.35, rare 0.15.

### Out of scope for the slice
- Mobile and touch controls
- Multiplayer and leaderboards
- Cloud saves
- More than 2 biomes
- Sound design beyond basic cues

## 5. Suggested architecture

```
src/
  game/
    data/creatures.ts     # roster: id, name, biome, rarity, income, asset path, placeholder style
    data/shop.ts          # equipment, prices, effects
    state/store.ts        # zustand store: money, inventory, captured, exhibits, lastSeen; persisted to localStorage
    systems/economy.ts    # income tick + offline earnings
    systems/capture.ts    # capture odds, bait, net throw
  scenes/
    ZooHub.tsx
    Biome.tsx             # biome is data-driven: terrain, props, spawn table
  components/
    Player.tsx            # pointer-lock FPS controller
    Creature.tsx          # loads GLB if present, else procedural placeholder
    CaptureMiniGame.tsx
    Hud.tsx / Shop.tsx / Journal.tsx
public/assets/creatures/  # generated GLBs + icons land here
scripts/generate_assets/
  manifest.json           # per creature: prompt, style notes, target poly count
  generate.py             # Replicate: text→image (reference) → image→3D (GLB); also icon PNGs
```

Notes:
- `Creature.tsx` should check whether the creature's GLB exists and fall back to the placeholder. Running the asset script then upgrades the game's visuals without any code changes.
- Asset script steps:
  1. Generate a clean reference image per creature (one image model, consistent low-poly style prompt, plain background).
  2. Feed it to an image-to-3D model on Replicate (e.g. TRELLIS or Hunyuan3D-2) to produce a GLB.
  3. Optionally decimate or compress the GLB (e.g. with `gltf-transform`) to keep downloads small.
  4. Save it as `public/assets/creatures/<id>.glb`.
- **Check the current model names and versions on replicate.com before using them.** Replicate's model catalogue changes often.
- Make the script **idempotent**: skip creatures that already have assets unless you pass `--force`.

## 5a. Zoo layout and future biomes

The hub is laid out like Taronga Zoo Sydney (`src/scenes/hub/layout.ts`): Main Entrance at the top of the hill, ferry wharf (expeditions) on the harbour at the bottom, Sky Safari between them. Each expedition biome is exhibited in one precinct:

| Precinct | Biome | Status |
|---|---|---|
| Rainforest Trail | Temperate Forest | Open |
| African Savannah | Arid Canyon | Open |
| Nura Diya Australia | Outback Scrub (proposed) | Under construction |
| Tiger Trek | Asian Jungle (proposed) | Under construction |
| Great Southern Oceans | Southern Ocean Coast (proposed) | Under construction |

Adding a biome = a `BIOMES` entry, four `CREATURES`, and setting `biome` on its precinct in `PRECINCTS`; the plots, signs and visitor routes follow automatically. Proposed rosters are in the session notes and the PR that introduced this layout.

## 6. Ideas for after the slice

- More biomes: wetlands, tundra, rainforest canopy, deep cave, coral reef (needs a submarine).
- More equipment: drone (scouting), climbing gear, diving gear, night-vision for nocturnal creatures.
- Zoo management: visitor happiness, exhibit upgrades, habitat matching bonuses.
- Rare variants (shiny or mutant colorations), possibly generated at runtime later.
- Mobile controls and cloud saves.

## 7. Kickoff prompt for the new session

> I'm building a browser-based first-person explorer game called Zoo Explorer. The full design and decisions are in `HANDOVER.md` at the repo root — read it first. Please build the vertical slice described in section 4 using the architecture in section 5: Vite + React + React Three Fiber, localStorage saves, procedural placeholder creatures, and a `scripts/generate_assets` Replicate pipeline that I'll run with my own token. Start by scaffolding the project and the FPS controller in the zoo hub, then the forest biome and capture loop, then the shop and economy, then the canyon and the legendary mini-game. Commit as you go.
