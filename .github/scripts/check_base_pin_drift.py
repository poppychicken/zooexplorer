#!/usr/bin/env python3
"""Detect (and optionally apply) drift between this repo's platform-base pins
and the newest tags in ECR.

The `ARG PLATFORM_BASE*_VERSION` pins in the Dockerfile are bare version
strings, not `image:tag@digest` refs, so Renovate's docker manager cannot see
them and nothing bumps them automatically. (renovate.json disables that package
outright, so the two never fight over the same lines.) Left alone they freeze at
whatever the scaffold shipped while platform-base keeps publishing patched
images — and the first symptom is the repo's own grype gate failing on an
inherited OS CVE that no change in this repo can fix.

This script is the missing half: it reads the pins and the variant suffixes
straight out of the Dockerfile (so py311/py312/py314 and jre17/21/25 apps all
work with no edit), asks ECR for the newest tag of each variant, and reports the
drift. With --apply it rewrites the ARG lines in place. Only the runtime pin is
required — a JVM app builds its jar in a gradle stage and has no -cg-dev pin.

Nothing here decides whether the newer image is *good* — the calling workflow
scans the candidate with the same gate the PR will face before proposing it.

Outputs (GITHUB_OUTPUT, when set): changed, has_dev, dev_current, dev_latest,
runtime_current, runtime_latest, candidate_image. The dev_* pair is "n/a" on a
Dockerfile with no -cg-dev stage.
"""
import argparse
import json
import os
import re
import subprocess
import sys
from pathlib import Path

DOCKERFILE = Path("Dockerfile")

# `ARG PLATFORM_BASE=<registry>/<repo>` — the repo half is what ECR is asked about.
BASE_RE = re.compile(r"^ARG\s+PLATFORM_BASE=(?P<registry>[^\s/]+)/(?P<repo>\S+)\s*$", re.M)
# Trailing whitespace is matched with [^\S\n] rather than \s: under re.M a
# greedy \s* runs past the end of the line and keeps one newline inside the
# match, so the replacement (which carries no newline) deletes the blank line
# that follows the pin block.
PIN_RE = "^ARG\\s+%s=(?P<version>\\S+)[^\\S\\n]*$"
# `FROM ${PLATFORM_BASE}:${PLATFORM_BASE_VERSION}-py313-cg-distroless`
FROM_RE = "\\$\\{%s\\}-(?P<variant>[a-z0-9.\\-]+)"

# The pins, and which FROM suffix each one feeds. `required` is what makes this
# script portable across the fleet: a Python app resolves wheels in a -cg-dev
# stage and so carries both pins, while a JVM app builds its jar in a gradle
# stage and has only the runtime one. Treating the dev pin as mandatory would
# make this script exit 1 on every JRE app rather than track it.
PINS = [
    ("dev", "PLATFORM_BASE_DEV_VERSION", False),
    ("runtime", "PLATFORM_BASE_VERSION", True),
]


def read_dockerfile():
    if not DOCKERFILE.is_file():
        sys.exit("no Dockerfile in %s" % Path.cwd())
    return DOCKERFILE.read_text()


def parse(text):
    """-> (image_repo_ref, {kind: {'arg', 'version', 'variant'}})"""
    m = BASE_RE.search(text)
    if not m:
        sys.exit("could not find `ARG PLATFORM_BASE=<registry>/<repo>`")
    out = {}
    for kind, arg, required in PINS:
        pin = re.search(PIN_RE % arg, text, re.M)
        if not pin:
            if required:
                sys.exit("could not find `ARG %s=`" % arg)
            continue
        # The variant suffix is not hardcoded: it is whatever this Dockerfile's
        # FROM line appends after the pin, so py311/py312/py314 and jre17/21/25
        # apps all work with no change here.
        frm = re.search(FROM_RE % arg, text)
        if not frm:
            # A declared-but-unused pin is a real defect, not an absent one:
            # bumping it would change nothing and the drift report would lie.
            sys.exit("no FROM line consumes ${%s}" % arg)
        out[kind] = {"arg": arg,
                     "version": pin.group("version"),
                     "variant": frm.group("variant")}
    return "%s/%s" % (m.group("registry"), m.group("repo")), out


def ecr_tags(repo):
    """Every tag in the ECR repo. Untagged manifests (the per-arch children of
    a multi-arch index) carry no imageTags and are filtered out by the query."""
    proc = subprocess.run(
        ["aws", "ecr", "describe-images",
         # Split once: this drops the registry host and keeps the rest, so a
         # namespaced repository (team/platform-base) survives intact. Taking
         # the last segment instead would query the wrong repository.
         "--repository-name", repo.split("/", 1)[-1],
         "--region", os.environ.get("AWS_REGION", "us-east-1"),
         "--query", "imageDetails[?imageTags].imageTags", "--output", "json"],
        capture_output=True, text=True)
    if proc.returncode != 0:
        sys.exit("aws ecr describe-images failed: %s" % proc.stderr.strip())
    return [t for group in json.loads(proc.stdout) for t in group]


def newest(tags, variant):
    """Newest `YYYY.MM.DD-<run>-<variant>` tag for one variant.

    Sorted on (date, run number), not lexically: run numbers are not
    zero-padded, so "2026.09.07-99" sorts above "2026.09.07-311" as a string.
    """
    pat = re.compile(r"^(?P<date>\d{4}\.\d{2}\.\d{2})-(?P<run>\d+)-%s$"
                     % re.escape(variant))
    best, best_key = None, None
    for tag in tags:
        m = pat.match(tag)
        if not m:
            continue
        key = (m.group("date"), int(m.group("run")))
        if best_key is None or key > best_key:
            best, best_key = m.group("date") + "-" + m.group("run"), key
    return best


def emit(pairs):
    path = os.environ.get("GITHUB_OUTPUT")
    if not path:
        return
    with open(path, "a") as fh:
        for key, value in pairs:
            fh.write("%s=%s\n" % (key, value))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true",
                    help="rewrite the ARG lines in place")
    # Supplied together by the workflow's apply step so the versions written
    # are the ones its grype gate actually scanned. Without them this second
    # invocation would re-query ECR and could pin a tag published since the
    # scan, which no gate has seen.
    ap.add_argument("--dev-version", help="skip the ECR lookup for the dev pin")
    ap.add_argument("--runtime-version",
                    help="skip the ECR lookup for the runtime pin")
    args = ap.parse_args()

    # --runtime-version is what puts the script in "supplied" mode. --dev-version
    # rides along with it and is required exactly when the Dockerfile has a dev
    # pin: supplying one for a JRE app would write a pin that has no FROM line,
    # and omitting one for a Python app would leave that stage un-bumped while
    # the PR body claimed otherwise.
    if args.dev_version and not args.runtime_version:
        sys.exit("--dev-version requires --runtime-version")

    text = read_dockerfile()
    image, pins = parse(text)

    if args.runtime_version:
        if ("dev" in pins) != bool(args.dev_version):
            sys.exit("--dev-version must be given iff the Dockerfile has "
                     "an `ARG PLATFORM_BASE_DEV_VERSION=` pin")
        latest = {"runtime": args.runtime_version}
        if args.dev_version:
            latest["dev"] = args.dev_version
        for kind, info in pins.items():
            print("%-8s %-24s %s -> %s  (supplied)" % (
                kind, info["variant"], info["version"], latest[kind]))
    else:
        tags = ecr_tags(image)
        latest = {}
        for kind, info in pins.items():
            found = newest(tags, info["variant"])
            if not found:
                sys.exit("no tags in ECR match variant %s" % info["variant"])
            latest[kind] = found
            print("%-8s %-24s %s -> %s%s" % (
                kind, info["variant"], info["version"], found,
                "" if found != info["version"] else "  (current)"))

    changed = any(latest[k] != pins[k]["version"] for k in pins)

    # The runtime pin is the one the gate scans: the -cg-dev stage only resolves
    # wheels and nothing but /build/deps is copied out of it.
    candidate = "%s:%s-%s" % (image, latest["runtime"], pins["runtime"]["variant"])

    # "n/a" rather than an empty string for an absent dev pin: an empty value is
    # indistinguishable from an output that failed to be set, and the workflow
    # decides whether to render the dev row from exactly this value.
    emit([("changed", str(changed).lower()),
          ("has_dev", str("dev" in pins).lower()),
          ("dev_current", pins["dev"]["version"] if "dev" in pins else "n/a"),
          ("dev_latest", latest.get("dev", "n/a")),
          ("runtime_current", pins["runtime"]["version"]),
          ("runtime_latest", latest["runtime"]),
          ("candidate_image", candidate)])

    if not changed:
        print("\npins are current — nothing to do")
        return

    print("\ncandidate runtime image: %s" % candidate)

    if args.apply:
        for kind, info in pins.items():
            text = re.sub(PIN_RE % info["arg"],
                          "ARG %s=%s" % (info["arg"], latest[kind]),
                          text, count=1, flags=re.M)
        DOCKERFILE.write_text(text)
        print("Dockerfile updated")


if __name__ == "__main__":
    main()
