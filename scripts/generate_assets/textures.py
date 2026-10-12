#!/usr/bin/env python3
"""Generate seamless, tileable ground textures with Replicate.

For each texture in textures.json:
  1. text -> image: a top-down ground texture in the scenery's hand-painted style
  2. make it tile: flatten its lighting, then cross-fade it near the edges with a copy shifted by
     half its size, so opposite edges match up
  3. save public/assets/textures/<id>.webp

Finished steps are cached in .cache/textures/ so re-runs are cheap. Usage:
  python scripts/generate_assets/textures.py                 # everything missing
  python scripts/generate_assets/textures.py --only grass    # just some
  python scripts/generate_assets/textures.py --force --only dirt
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from generate import ROOT, load_env, read_output, run_model  # noqa: E402

HERE = Path(__file__).resolve().parent
MANIFEST = HERE / "textures.json"
CACHE = HERE / ".cache" / "textures"
OUT = ROOT / "public" / "assets" / "textures"


def flatten_lighting(img):
    """Removes vignettes and broad light gradients, which would show up as a grid when tiled."""
    import numpy as np
    from PIL import Image, ImageFilter

    arr = np.asarray(img, dtype=np.float32)
    blur = np.asarray(img.filter(ImageFilter.GaussianBlur(img.width / 10)), dtype=np.float32)
    flat = arr / np.maximum(blur, 1) * blur.mean(axis=(0, 1))
    return Image.fromarray(np.clip(flat, 0, 255).astype(np.uint8))


def make_seamless(img):
    """Makes the image tile by blending four copies of it, shifted by half in x, y and both.

    Each copy is weighted by sin^2 of its own original coordinates, which is zero along its edges
    (where it would show a seam) and sums to exactly one across the four copies. Blending softens
    contrast, so it's restored by rescaling the detail around the mean.
    """
    import numpy as np
    from PIL import Image

    a = np.asarray(img, dtype=np.float32)
    h, w = a.shape[:2]
    u = np.sin(np.pi * (np.arange(w) + 0.5) / w) ** 2
    v = np.sin(np.pi * (np.arange(h) + 0.5) / h) ** 2
    out = np.zeros_like(a)
    energy = np.zeros((h, w, 1), dtype=np.float32)
    for sy in (0, h // 2):
        for sx in (0, w // 2):
            copy = np.roll(a, (sy, sx), axis=(0, 1))
            weight = (np.roll(v, sy)[:, None] * np.roll(u, sx)[None, :])[..., None]
            out += copy * weight
            energy += weight * weight
    mean = a.mean(axis=(0, 1))
    out = mean + (out - mean) / np.sqrt(energy)
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--only", nargs="+", metavar="ID")
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    cfg = json.loads(MANIFEST.read_text())
    textures = cfg["textures"]
    if args.only:
        textures = [t for t in textures if t["id"] in args.only]
    load_env()
    if not os.environ.get("REPLICATE_API_TOKEN"):
        print("REPLICATE_API_TOKEN is not set. Copy .env.example to .env and add your token.")
        return 1
    from PIL import Image

    OUT.mkdir(parents=True, exist_ok=True)
    failures = []
    for t in textures:
        tid = t["id"]
        dest = OUT / f"{tid}.webp"
        if dest.exists() and not args.force:
            print(f"✓ {tid}: already generated")
            continue
        print(f"→ {tid}")
        cache = CACHE / tid
        cache.mkdir(parents=True, exist_ok=True)
        prompt = f"{t['prompt']}, {cfg['style']}"
        try:
            base = cache / "base.png"
            if args.force or not base.exists():
                model = cfg["image_model"]
                print(f"    texture via {model['ref']}")
                base.write_bytes(read_output(run_model(model["ref"], {"prompt": prompt, **model.get("input", {})})))
            tiled = cache / "tiled.png"
            if args.force or not tiled.exists():
                make_seamless(flatten_lighting(Image.open(base).convert("RGB"))).save(tiled)
            size = cfg.get("size", 1024)
            img = Image.open(tiled).convert("RGB").resize((size, size), Image.LANCZOS)
            if "saturation" in t:
                from PIL import ImageEnhance

                img = ImageEnhance.Color(img).enhance(t["saturation"])
            img.save(dest, "WEBP", quality=88, method=6)
            print(f"    saved {dest.relative_to(ROOT)} ({dest.stat().st_size // 1024} KB)")
        except Exception as e:  # keep going so one failure doesn't sink the batch
            print(f"    ✗ failed: {e}")
            failures.append(tid)
    if failures:
        print(f"Failed: {', '.join(failures)}. Re-run to retry; finished steps are cached.")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
