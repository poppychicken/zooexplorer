#!/usr/bin/env python3
"""Register this build's SBOM and deployment slot with app-summary.

Without both posts a selfserve app never appears in the vulnerability tracker:
the build-time grype gate protects the image at build time, but nothing
watches it afterwards as new CVEs are published against what it already ships.

The two posts MUST agree on the identifier:

  * release-data writes ServiceVersions.partner_envs.<partner>.<env> = <tag>
  * the scanner then looks the SBOM up by that same value

`_extract_short_id` preserves semver, and `_resolve_full_build_id` returns a
non-numeric slot id unchanged, so for a `vX.Y.Z` tag both sides are simply the
tag. Posting a different buildId to sbom-data leaves the slot resolving to
nothing, which renders as "unscanned" rather than as an error — a silent gap,
which is the failure mode this whole exercise exists to close.

Env: SERVICE, IMAGE_TAG, GITHUB_SHA, GITHUB_RUN_ID.
"""
import json
import os
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

BASE = "https://app-summary.shared-dev.swipejobs.com"
# 'infra' is the canonical partner lane for shared internal services
# (ci-templates partner_matrix). app-summary keeps no partner allowlist — the
# lane simply has to be stated consistently, and today no selfserve app states
# it at all, which is why none of them appear in the tracker.
PARTNER = "infra"
ENVIRONMENT = "dev"
ATTEMPTS = 3
RETRY_DELAY_S = 5

service = os.environ["SERVICE"]
tag = os.environ["IMAGE_TAG"]
sha = os.environ.get("GITHUB_SHA", "")
run_id = os.environ.get("GITHUB_RUN_ID", "")
now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

with open("sbom.json") as fh:
    sbom = json.load(fh)


def post(path, payload):
    body = json.dumps(payload).encode()
    last = None
    for attempt in range(1, ATTEMPTS + 1):
        try:
            req = urllib.request.Request(
                BASE + path, data=body,
                headers={"Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=30) as resp:
                print("%s -> HTTP %d" % (path, resp.status))
                return True
        except Exception as exc:  # noqa: BLE001 - report and retry regardless
            last = exc
            print("  attempt %d/%d failed: %s" % (attempt, ATTEMPTS, exc))
            if attempt < ATTEMPTS:
                time.sleep(RETRY_DELAY_S)
    print("::warning::app-summary %s failed after %d attempts: %s"
          % (path, ATTEMPTS, last))
    return False


ok = post("/api/v2/builds/sbom-data", {
    "service": service,
    "buildId": tag,
    "pipelineName": service,
    "pipelineLabel": tag,
    "sbomData": sbom,
    "uploadTime": now,
    "fileName": "sbom.json",
})

# type=backend deliberately: the slot-health collector only walks documents
# whose type is backend, so a selfserve app recorded as anything else is
# counted nowhere.
ok = post("/api/v2/builds/release-data", {
    "releaseId": "%s-%s-%s" % (service, tag, run_id or sha[:7]),
    "service": service,
    "partner": PARTNER,
    "env": ENVIRONMENT,
    "tag": tag,
    "type": "backend",
    "pipelineName": service,
    "pipelineLabel": tag,
}) and ok

if not ok:
    # Non-zero so the step shows amber via continue-on-error. The image is
    # already pushed and the deploy proceeds; this only means the tracker is
    # behind, and that should be visible rather than silent.
    sys.exit(1)

print("registered %s %s as %s/%s" % (service, tag, PARTNER, ENVIRONMENT))
