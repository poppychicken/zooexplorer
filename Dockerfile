# syntax=docker/dockerfile:1
#
# One process, no root, no writable filesystem needed.
#
# uvicorn serves the API under /api and the built SPA everywhere else, so
# there is no nginx and no shell wrapper juggling two PIDs. The runtime
# stage carries no compiler, no npm, and no package manager state.
#
# Both Python stages come from platform-base (Chainguard): wheels resolve in
# the -cg-dev stage, which has pip and a shell, and the runtime is its
# distroless twin. Debian's python:*-slim was shipping ~15 Critical/High OS
# CVEs — perl, glibc, sqlite3, none of them reachable from this app and none
# of them fixable here — that a platform-base image simply does not carry.
ARG PLATFORM_BASE=936610309108.dkr.ecr.us-east-1.amazonaws.com/platform-base
# The -cg-dev and -cg-distroless lineages are versioned independently, so the
# two pins can drift apart even though both build from the same pinned
# upstream python digest. Keep them explicit, not :latest.
#
# RENOVATE DOES NOT BUMP THESE. They are a bare version string, not an
# `image:tag@digest` ref, so Renovate's docker manager cannot see them, and
# renovate.json disables the platform-base package outright so it never tries
# to pin a digest onto the FROM lines below. `.github/workflows/base-pin-drift.yml`
# owns them instead — weekly, via this repo's OIDC role, and it scans the
# candidate tag before proposing it. platform-base itself IS auto-bumped daily
# — Renovate moves its pinned Chainguard digests and the merge rebuilds it —
# so the base gets its CVE fixes while these pins stay frozen wherever they
# were scaffolded. That drift is what turns the grype gate below red: the
# advisory is fixed upstream and fixed in platform-base, just not in the tag
# we point at. When the gate reports a fixed-in CVE for an OS package, bump
# these first; a .grype.yaml exception is the wrong tool for it.
#
#   aws ecr describe-images --repository-name platform-base --region us-east-1 \
#     --query 'imageDetails[?imageTags].imageTags[0]' --output text \
#     | tr '\t' '\n' | grep py313 | sort -r | head
ARG PLATFORM_BASE_DEV_VERSION=2026.09.14-419
ARG PLATFORM_BASE_VERSION=2026.09.14-419

# ── Stage 1 — build the SPA (native arch: emitting static files) ───────────
# Stays on node: platform-base publishes jre and py variants only. Nothing
# from this stage reaches the runtime image — only /build/dist is copied out
# — so its OS packages are not part of the shipped attack surface.
FROM --platform=$BUILDPLATFORM node:24-alpine AS frontend

WORKDIR /build
COPY frontend/package.json frontend/package-lock.json frontend/.npmrc ./
# The registry token arrives as a BuildKit secret, never an ARG or ENV: an ARG
# is recorded in `docker history` and an ENV persists into the layer, so either
# would ship a live credential inside every image. The mount exists only for
# the duration of this RUN and leaves nothing on disk.
#
# frontend/.npmrc is committed and contains no secret — it references
# ${NPM_TOKEN}, which npm expands from the environment at install time.
#
# The `|| true` keeps a build without the secret working for anything that
# resolves straight from the lockfile; only @swipejobs/* packages actually
# require the token, and those fail loudly with a 401 if it is missing.
RUN --mount=type=secret,id=npm_token \
    NPM_TOKEN="$(cat /run/secrets/npm_token 2>/dev/null || true)" npm ci
COPY frontend/ ./
RUN npm run build

# ── Stage 2 — resolve Python deps into a relocatable tree ──────────────────
FROM ${PLATFORM_BASE}:${PLATFORM_BASE_DEV_VERSION}-py313-cg-dev AS python-deps

ENV PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /build
COPY backend/requirements.txt .
# --target rather than a venv: a venv records the absolute interpreter path
# of the stage that created it, which is not the path the distroless image
# uses, so its console scripts break once copied across.
RUN python -m pip install --target=/build/deps -r requirements.txt

# ── Stage 3 — runtime ──────────────────────────────────────────────────────
FROM ${PLATFORM_BASE}:${PLATFORM_BASE_VERSION}-py313-cg-distroless

ENV PYTHONPATH=/deps:/app \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    STATIC_DIR=/app/static

WORKDIR /app
# /deps stays root-owned and world-readable: nothing writes there, and
# PYTHONDONTWRITEBYTECODE keeps the interpreter from trying.
COPY --from=python-deps /build/deps /deps
# /app is chowned because the compileall below writes __pycache__ into it.
# Unlike Debian, the distroless base already defaults to the nonroot user, so
# a RUN here has no write access to a root-owned tree.
COPY --chown=65532:65532 backend/ /app/
COPY --chown=65532:65532 --from=frontend /build/dist /app/static

# Bytecode is compiled at build time: readOnlyRootFilesystem means the
# process cannot write __pycache__ at import time. Exec form because the
# distroless image has no shell for RUN's default form.
RUN ["python", "-m", "compileall", "-q", "/app"]

# platform-base's distroless variants already run as uid/gid 65532
# ("nonroot"), which is what the platform chart's runAsUser expects. Restated
# so the image behaves identically under a bare `docker run` with no --user.
USER 65532:65532

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8080/api/health').read()"]

# `python -m uvicorn`, not the `uvicorn` console script: pip --target puts
# scripts in /deps/bin, which is not on PATH, but the package itself is
# importable via PYTHONPATH.
#
# Exec form: uvicorn is PID 1 and gets SIGTERM straight from the kubelet.
CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
