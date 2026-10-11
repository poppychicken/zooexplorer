"""ASGI entrypoint.

One process serves both halves of the app: the API under /api and the built
React SPA at everything else. There is no nginx sidecar and no second
process — a single uvicorn is simpler to run as a non-root user, needs no
writable filesystem, and gives Kubernetes one PID to signal.

Auth: identity comes from the platform (X-Auth-Request-* / X-Forwarded-*
headers injected by envoy ext_authz from oauth2-proxy). No app-side session,
no JWT issuing, no /api/login. See app/api/me.py.
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException
from starlette.responses import Response
from starlette.types import Scope

from app.api.router import api_router
from app.config.settings import settings
from app.repositories import mongo_repository

logging.basicConfig(
    level=settings.logging.level.upper(),
    format=settings.logging.format,
)
logger = logging.getLogger("app")


@asynccontextmanager
async def lifespan(app: FastAPI):
    await mongo_repository.ensure_indexes()
    logger.info("Application started")
    yield
    await mongo_repository.close_client()
    logger.info("Application stopped")


app = FastAPI(
    title=settings.api_title,
    description="{{PROJECT_NAME}} API",
    version="1.0.0",
    lifespan=lifespan,
)

# Static assets compress well and the gateway does not do it for us.
app.add_middleware(GZipMiddleware, minimum_size=1024)

# No CORS middleware: the SPA is same-origin with the API in production
# (this process serves both) and in dev (Vite proxies /api — see
# frontend/vite.config.js). Add CORSMiddleware with an explicit origin
# list only if something off-origin ever needs to call this API; never
# `allow_origins=["*"]` together with credentials.

app.include_router(api_router, prefix=settings.api_prefix)


class SPAStaticFiles(StaticFiles):
    """Serve the built SPA, falling back to index.html so client-side routes
    (/items, /dashboard, …) survive a hard refresh or a deep link."""

    async def get_response(self, path: str, scope: Scope) -> Response:
        try:
            return await super().get_response(path, scope)
        except HTTPException as exc:
            # StaticFiles *raises* on a miss rather than returning a 404.
            if exc.status_code == 404:
                return await super().get_response("index.html", scope)
            raise


def mount_spa(target: FastAPI, directory: Path) -> None:
    """Mount the SPA as a catch-all. Call last: routes registered before it
    (/api, /docs) still win."""
    target.mount("/", SPAStaticFiles(directory=directory, html=True), name="spa")


if settings.static_dir.is_dir():
    mount_spa(app, settings.static_dir)
else:
    logger.info("No SPA build at %s — API only (Vite serves the UI in dev)", settings.static_dir)
