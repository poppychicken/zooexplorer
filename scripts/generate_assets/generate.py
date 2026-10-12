#!/usr/bin/env python3
"""Generate creature assets with Replicate, ahead of time.

For each creature in manifest.json:
  1. text -> image: a clean reference picture in a consistent low-poly style
  2. reference -> icon: a square PNG for the journal
  3. image -> 3D: a GLB model
  4. optional: simplify + compress the GLB with gltf-transform (needs Node/npx)

Outputs land in public/assets/creatures/ as <id>.glb and <id>.png, and
public/assets/creatures/index.json is rewritten so the game picks them up.
Creatures without assets keep using the procedural placeholders.

The script is idempotent: creatures that already have both files are skipped
unless you pass --force. Intermediate files are cached in .cache/ so a failed
3D step doesn't re-pay for the reference image.

Usage:
  pip install -r scripts/generate_assets/requirements.txt
  cp .env.example .env   # add REPLICATE_API_TOKEN
  python scripts/generate_assets/generate.py               # everything missing
  python scripts/generate_assets/generate.py --only red_fox barn_owl
  python scripts/generate_assets/generate.py --force --only moss_antler_stag
  python scripts/generate_assets/generate.py --dry-run
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
OUT_DIR = ROOT / "public" / "assets" / "creatures"
CACHE_DIR = HERE / ".cache"
MANIFEST = HERE / "manifest.json"


def load_env() -> None:
    """Minimal .env loader so the token never needs to live in code."""
    env = ROOT / ".env"
    if not env.exists():
        return
    for line in env.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


API = "https://api.replicate.com/v1"


def api(method: str, url: str, body: dict | None = None) -> dict:
    """Call the Replicate HTTP API. urllib honours HTTPS_PROXY, which the replicate SDK does not."""
    req = urllib.request.Request(
        url if url.startswith("http") else f"{API}{url}",
        method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={
            "Authorization": f"Bearer {os.environ['REPLICATE_API_TOKEN']}",
            "Content-Type": "application/json",
            # Cloudflare in front of the API rejects urllib's default user agent.
            "User-Agent": "zoo-explorer-assets/1.0",
        },
    )
    for attempt in range(6):
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                return json.loads(resp.read())
        except urllib.error.HTTPError as e:
            detail = e.read().decode(errors="replace")
            # Accounts with under $5 credit are throttled to a handful of predictions a minute.
            if e.code == 429 and attempt < 5:
                try:
                    wait = float(json.loads(detail).get("retry_after", 10))
                except ValueError:
                    wait = 10
                print(f"    rate limited, retrying in {wait + 1:.0f} s")
                time.sleep(wait + 1)
                continue
            raise RuntimeError(f"Replicate API {e.code}: {detail[:500]}") from None
        except urllib.error.URLError as e:
            # Dropped connections happen on long runs; back off and try again.
            if attempt == 5:
                raise
            print(f"    connection error ({e.reason}), retrying")
            time.sleep(2**attempt)
    raise AssertionError("unreachable")


def run_model(ref: str, inputs: dict, timeout: float = 900) -> Any:
    """Start a prediction for `owner/name` (or `owner/name:version`) and poll until it finishes."""
    name, _, version = ref.partition(":")
    if not version:
        model = api("GET", f"/models/{name}")
        # Official models run by name; community models need their latest version id.
        version = None if model.get("is_official") else model["latest_version"]["id"]
    if version:
        pred = api("POST", "/predictions", {"version": version, "input": inputs})
    else:
        pred = api("POST", f"/models/{name}/predictions", {"input": inputs})
    deadline = time.monotonic() + timeout
    while pred["status"] not in ("succeeded", "failed", "canceled"):
        if time.monotonic() > deadline:
            api("POST", pred["urls"]["cancel"])
            raise RuntimeError(f"{ref} timed out after {timeout:.0f} s")
        time.sleep(3)
        pred = api("GET", pred["urls"]["get"])
    if pred["status"] != "succeeded":
        raise RuntimeError(f"{ref} {pred['status']}: {pred.get('error')}")
    return pred["output"]


def data_uri(path: Path, size: int = 512) -> str:
    """Inline the reference as a small JPEG: image-to-3D models downscale to ~512 px anyway,
    and a small request body is far more reliable than uploading the full PNG."""
    import io

    from PIL import Image

    img = Image.open(path).convert("RGB")
    img.thumbnail((size, size), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=92)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()


def read_output(output: Any, suffix: str | None = None) -> bytes:
    """Get file bytes from whatever a Replicate model returned.

    Handles FileOutput objects, URLs, lists of either, and dicts of named outputs
    (picking the first entry whose URL ends with `suffix` when given).
    """
    candidates: list[Any] = []

    def collect(o: Any) -> None:
        if o is None:
            return
        if isinstance(o, dict):
            for v in o.values():
                collect(v)
        elif isinstance(o, (list, tuple)):
            for v in o:
                collect(v)
        else:
            candidates.append(o)

    collect(output)

    def url_of(o: Any) -> str:
        return str(getattr(o, "url", o))

    if suffix:
        matching = [c for c in candidates if url_of(c).split("?")[0].lower().endswith(suffix)]
        if not matching:
            raise RuntimeError(f"No {suffix} file in model output: {[url_of(c) for c in candidates]}")
        candidates = matching
    if not candidates:
        raise RuntimeError(f"Model returned no files: {output!r}")

    first = candidates[0]
    if hasattr(first, "read"):
        return first.read()
    req = urllib.request.Request(url_of(first), headers={"User-Agent": "zoo-explorer-assets/1.0"})
    with urllib.request.urlopen(req, timeout=120) as resp:
        return resp.read()


def make_icon(reference: Path, dest: Path, size: int) -> None:
    from PIL import Image

    img = Image.open(reference).convert("RGB")
    side = min(img.size)
    left = (img.width - side) // 2
    top = (img.height - side) // 2
    img = img.crop((left, top, left + side, top + side)).resize((size, size), Image.LANCZOS)
    img.save(dest, "PNG", optimize=True)


def optimize_glb(src: Path, dest: Path, simplify_ratio: float, texture_size: int) -> bool:
    npx = shutil.which("npx")
    if not npx:
        print("    npx not found: skipping GLB optimisation (install Node to enable it)")
        return False
    cmd = [
        npx, "--yes", "@gltf-transform/cli", "optimize", str(src), str(dest),
        # Meshopt is decoded by three.js's bundled decoder (no CDN needed), unlike Draco.
        "--compress", "meshopt",
        "--texture-compress", "webp",
        "--texture-size", str(texture_size),
        "--simplify-ratio", str(simplify_ratio),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"    gltf-transform failed, using the unoptimised GLB:\n{result.stderr.strip()}")
        return False
    return True


def write_index(creatures: list[dict]) -> None:
    models = sorted(p.stem for p in OUT_DIR.glob("*.glb"))
    icons = sorted(p.stem for p in OUT_DIR.glob("*.png"))
    # Generated models face whichever way the 3D model chose; "yaw" in the manifest turns them to face +Z.
    yaw = {c["id"]: c["yaw"] for c in creatures if c.get("yaw") and c["id"] in models}
    data = {"models": models, "icons": icons, "yaw": yaw}
    (OUT_DIR / "index.json").write_text(json.dumps(data, indent=2) + "\n")
    print(f"Wrote index.json: {len(models)} models, {len(icons)} icons")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--only", nargs="+", metavar="ID", help="creature ids to generate")
    parser.add_argument("--force", action="store_true", help="regenerate even if assets exist (also ignores the cache)")
    parser.add_argument("--skip-3d", action="store_true", help="only make reference images and icons")
    parser.add_argument("--no-optimize", action="store_true", help="keep the raw GLB from the 3D model")
    parser.add_argument("--dry-run", action="store_true", help="show what would be generated")
    args = parser.parse_args()

    manifest = json.loads(MANIFEST.read_text())
    creatures = manifest["creatures"]
    if args.only:
        known = {c["id"] for c in creatures}
        unknown = set(args.only) - known
        if unknown:
            print(f"Unknown creature ids: {', '.join(sorted(unknown))}. Known: {', '.join(sorted(known))}")
            return 2
        creatures = [c for c in creatures if c["id"] in args.only]

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    todo = []
    for c in creatures:
        glb = OUT_DIR / f"{c['id']}.glb"
        png = OUT_DIR / f"{c['id']}.png"
        done = png.exists() and (args.skip_3d or glb.exists())
        if done and not args.force:
            print(f"✓ {c['id']}: already generated (use --force to redo)")
        else:
            todo.append(c)

    if args.dry_run:
        for c in todo:
            print(f"• would generate {c['id']}: {c['prompt']}, {manifest['style']}")
        return 0
    if not todo:
        write_index(manifest["creatures"])
        return 0

    load_env()
    if not os.environ.get("REPLICATE_API_TOKEN"):
        print("REPLICATE_API_TOKEN is not set. Copy .env.example to .env and add your token.")
        return 1

    image_model = manifest["image_model"]
    failures = []

    for c in todo:
        cid = c["id"]
        print(f"→ {cid}")
        cache = CACHE_DIR / cid
        cache.mkdir(parents=True, exist_ok=True)
        reference = cache / "reference.png"
        try:
            if args.force or not reference.exists():
                prompt = f"{c['prompt']}, {manifest['style']}"
                print(f"    reference image via {image_model['ref']}")
                out = run_model(image_model["ref"], {"prompt": prompt, **image_model.get("input", {})})
                reference.write_bytes(read_output(out))
            make_icon(reference, OUT_DIR / f"{cid}.png", manifest.get("icon_size", 256))
            print("    icon saved")

            if args.skip_3d:
                continue

            # A creature can swap in a different image-to-3D model (e.g. one that keeps thin antlers).
            model_3d = c.get("model_3d") or manifest["model_3d"]
            raw = cache / "raw.glb"
            if args.force or not raw.exists():
                print(f"    3D model via {model_3d['ref']} (this can take a few minutes)")
                image_value: Any = [data_uri(reference)] if model_3d.get("image_as_list") else data_uri(reference)
                out = run_model(model_3d["ref"], {model_3d["image_key"]: image_value, **model_3d.get("input", {})})
                raw.write_bytes(read_output(out, ".glb"))
            dest = OUT_DIR / f"{cid}.glb"
            if args.no_optimize or not optimize_glb(raw, dest, c.get("simplify_ratio", 0.5), manifest.get("texture_size", 1024)):
                shutil.copyfile(raw, dest)
            print(f"    model saved ({dest.stat().st_size / 1024:.0f} KB)")
        except Exception as e:  # keep going so one bad creature doesn't sink the batch
            print(f"    ✗ failed: {e}")
            failures.append(cid)

    write_index(manifest["creatures"])
    if failures:
        print(f"Failed: {', '.join(failures)}. Re-run to retry; finished steps are cached.")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
