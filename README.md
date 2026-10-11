# {{PROJECT_NAME}}

> **Creating a new app from this template?** Easiest path is `selfserve create <name>` — the CLI handles repo creation, registry PR, OpenBao role provisioning, ArgoCD wiring, and Mongo cred minting. After the CLI finishes and the registry PR merges, your app is live at `https://<name>.shared-dev.swipejobs.com/` with SSO already in front of it.
>
> Manually `Use this template` from GitHub still works (opens a `[setup]` issue → bootstrap renders placeholders + opens PR), but that path skips the platform's chart wiring; only do that if you know why.

Full-stack template — FastAPI + React + MongoDB. Identity comes from the platform's SSO layer (envoy ext_authz + oauth2-proxy → Google). No app-side login UI, no JWTs, no session store.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Backend** | FastAPI 0.141, Python 3.13, Pydantic v2 |
| **Frontend** | React 19, Vite 8, Ant Design 6, TailwindCSS 4 |
| **Auth** | Platform SSO — read `X-Auth-Request-Email` |
| **Database** | MongoDB via pymongo's async driver (`AsyncMongoClient`) — credentials minted per-app by OpenBao |
| **Serving** | One uvicorn: `/api` plus the built SPA. No nginx, no sidecar |
| **Container** | Multi-stage build, runs as uid 65532 on a read-only rootfs, listens on **8080** |
| **CI/CD** | GitHub Actions (PR validation + Docker build + ECR push) |

## What the Platform Provides

The chart that ArgoCD applies for every selfserve app gives you all of these with no per-app config in this repo:

| What | How your app gets it |
|---|---|
| **SSO identity** | Headers on every request: `X-Auth-Request-Email`, `X-Auth-Request-User`, `X-Auth-Request-Preferred-Username` (the template's `/api/me` also accepts the legacy `X-Forwarded-*` family as a fallback) |
| **MongoDB connection** | Env vars on the pod: `MONGODB_URI`, `MONGODB_DATABASE`, `MONGODB_USERNAME`, `MONGODB_PASSWORD` — synced from OpenBao via ExternalSecret, rotated every 20 min |
| **Public hostname + TLS** | Auto: `https://<name>.shared-dev.swipejobs.com/` via shared envoy Gateway with wildcard cert |
| **Image pulls** | Auto: cluster IRSA on `936610309108.dkr.ecr.us-east-1.amazonaws.com/<name>` |
| **Pod restarts on cred rotation** | Stakater Reloader watches the Secret and rolls the Deployment |

Your code reads env vars + headers; the chart does the rest.

## Identity (Reading the SSO User)

The platform's envoy gateway gates every inbound request behind SSO. Authenticated requests reach this app with these headers:

| Header | What it carries |
|---|---|
| `X-Auth-Request-Email` | The user's `@swipejobs.com` email |
| `X-Auth-Request-User` | Google subject id (stable per-user) |
| `X-Auth-Request-Preferred-Username` | Display name if known |

The platform's selfserve chart forwards these (oauth2-proxy emits them with `--set-xauthrequest=true`). The template's `/api/me` ALSO accepts the legacy `X-Forwarded-Email` / `X-Forwarded-User` / `X-Forwarded-Preferred-Username` family — so the same app code works if a future ext-auth backend on this platform emits the older header style.

**Trusted because** the chart's NetworkPolicy allows ingress to the app pod ONLY from the envoy-gateway namespace — no other pod in the cluster can spoof these headers.

**Frontend usage:**

```jsx
import { useCurrentUser, logout } from './api/me';

function Profile() {
  const { user, loading } = useCurrentUser();
  if (loading) return <Spin />;
  return <div>Hi {user.email}! <button onClick={logout}>Logout</button></div>;
}
```

**Backend usage:**

```python
from fastapi import Depends
from app.api.me import current_user, CurrentUser

@router.get("/things")
async def list_things(user: CurrentUser = Depends(current_user)):
    return await things_service.list_for(user.email)
```

**Logout** redirects to `/oauth2/sign_out`, which clears the SSO cookie cluster-wide.

**Do not:** add an app-side `/login` route, store passwords, issue JWTs, or maintain user sessions. The platform owns all of that — this template no longer ships any of it.

## Run Locally

**Backend:**

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
uvicorn app.main:app --host 0.0.0.0 --port 8080 --reload
pytest -q          # no database required
```

**Frontend:**

```bash
cd frontend
npm ci
npm run dev
```

Frontend on `http://localhost:5173`; Vite proxies `/api` to the backend on
`http://localhost:8080`, so dev is same-origin exactly like production. That
is why there is no CORS middleware anywhere in this repo — if you find
yourself adding one, the proxy is misconfigured.

Local dev runs without SSO, so `/api/me` returns `{email: null, ...}`. The `useCurrentUser()` hook tolerates this — UI renders a generic "Signed in" placeholder. To test with a real identity locally, set the headers manually via `curl -H 'X-Auth-Request-Email: you@swipejobs.com' ...`.

Or use the bundled launcher:

```bash
./start.sh
```

## Run with Docker

```bash
docker build -t {{PROJECT_NAME}} .

# Run it the way Kubernetes will: non-root, read-only rootfs, no capabilities.
docker run -p 8080:8080 \
  --user 65532:65532 --read-only --cap-drop ALL --security-opt no-new-privileges \
  -e MONGODB_URI=mongodb://host.docker.internal:27017 \
  -e MONGODB_DATABASE=app_db \
  {{PROJECT_NAME}}
```

The image serves the API and the SPA from a single uvicorn on **8080**. Prefer
env vars over mounting `config.yaml` — the platform injects the Mongo ones and
`.dockerignore` deliberately keeps any local `config.yaml` out of the build.

> **Platform note:** the selfserve chart's `containerPort` default is `80`
> (`platform-gitops-github/charts/app/values.yaml`). A non-root process cannot
> bind a privileged port with `capabilities: drop: [ALL]`, so that value must
> be `8080` for this image. The Service targets the named port `http`, so the
> chart's one-line change is the whole migration — nothing else moves.

## Project Structure

```
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app entry point
│   │   ├── config/settings.py   # YAML + env var configuration
│   │   ├── api/
│   │   │   ├── router.py        # API router (me + items + health)
│   │   │   ├── me.py            # /api/me — surfaces SSO headers
│   │   │   └── items.py         # Example CRUD endpoints
│   │   ├── models/models.py     # Pydantic models (Item, ItemCreate, ItemUpdate)
│   │   └── repositories/
│   │       └── mongo_repository.py  # Generic async MongoDB repository
│   ├── tests/test_api.py        # Runs without a database
│   ├── requirements.txt
│   └── requirements-dev.txt
├── frontend/
│   ├── src/
│   │   ├── api/                 # fetch wrapper + useCurrentUser() hook
│   │   ├── assets/              # SJ logo + any other static assets
│   │   ├── components/          # Reusable components
│   │   ├── layouts/             # MainLayout — sidebar with SJ logo + SSO identity header
│   │   └── pages/
│   │       ├── DashboardPage.jsx  # Welcome page — replace with your own
│   │       └── ItemsPage.jsx      # Working CRUD example (keep as reference)
│   └── package.json
├── Dockerfile                   # Multi-stage, non-root, single process
├── .github/workflows/           # PR validation, Build & Deploy, base-pin drift
└── config-sample.yaml          # Configuration template
```

## Adding a New Resource

1. **Model**: Add the stored model plus its `…Create` / `…Update` shapes in `backend/app/models/models.py`. Keep server-owned fields (ids, timestamps, owner) out of the create model — that is what stops a client setting them.
2. **API**: Create `backend/app/api/your_routes.py`, hold a `MongoRepository(YourModel, "collection")` at module level, and take `user: CurrentUser = Depends(current_user)` when you need the caller. Add a service module only once a handler has logic worth testing on its own.
3. **Register**: Add the router to `backend/app/api/router.py`
4. **Indexes**: Add them to `ensure_indexes()` in `backend/app/repositories/mongo_repository.py`
5. **Frontend API**: Create `frontend/src/api/your_resource.js` on top of `api` from `./api`
6. **Page**: Create `frontend/src/pages/YourPage.jsx`
7. **Route**: Add route in `frontend/src/routes.jsx`
8. **Nav**: Add menu item in `frontend/src/components/MainNavigation.jsx`

## Environment Variables

All YAML values can be overridden via env. The platform's chart sets the Mongo ones automatically; you only set the rest if you need to deviate from defaults.

| Variable | Set by | Description |
|---|---|---|
| `CONFIG_PATH` | you (optional) | Path to YAML config file |
| `MONGODB_URI` | **platform (auto)** | Full Mongo URI, dynamic creds, rotated by OpenBao |
| `MONGODB_DATABASE` | **platform (auto)** | App's database (e.g. `my_app_6_db`) |
| `MONGODB_USERNAME` | **platform (auto)** | Dynamic Mongo user |
| `MONGODB_PASSWORD` | **platform (auto)** | Dynamic Mongo password |
| `APP_URL` | you (optional) | Application dashboard URL (informational) |
| `LOG_LEVEL` | you (optional) | Root log level, default `INFO` |
| `STATIC_DIR` | image (set) | Where the built SPA lives; unset locally so Vite serves it |
| `VITE_API_URL` | you (optional) | Frontend API base path, default `/api` |

There are **no auth-related env vars** any more — identity comes from request headers, not config.

## CI/CD

Three workflows in `.github/workflows/` (plus `bootstrap.yml`, which the platform runs once at scaffold time):

**`pr.yml` — PR validation.** Runs on every `pull_request`. Three parallel jobs: frontend lint+build, backend `pytest`, and a docker build that then boots the image non-root with a read-only rootfs and curls `/api/health`, `/` and a deep link. No secrets required; works on forks.

**`ci.yml` — Build & deploy.** Runs on `push` to `main` or `develop`. Project name, deployment regions, and target environments are read from `.platform/setup.json`:

- **Preflight**: gates the rest of the workflow on `.platform/setup.json` existence; emits `project_name`, `regions`, `environments`, and owner metadata as job outputs.
- **Build**: matrix over `deployment.targets[].region` — builds the Docker image with owner/project/region labels, pushes to that region's ECR.

After the image lands in ECR, the platform's chart picks up the new tag (via ArgoCD Image Updater, when installed) and rolls the pod. Until Image Updater is wired, bump `image.tag` in `platform-gitops/3-platform/selfserve/<name>.yaml` once after the first build.

**`base-pin-drift.yml` — platform-base pin drift.** Runs weekly (Mondays 06:17 UTC) and on demand. The two `ARG PLATFORM_BASE*_VERSION` pins in the `Dockerfile` are bare version strings, so Renovate cannot see them; this job compares them against the newest tags in ECR, scans the candidate with the *same* grype settings `pr.yml` applies, and opens a bump PR only if the candidate comes back clean. It never proposes a bump that would land red. Needs `AWS_ROLE_ARN`, which `bootstrap.yml` sets.

Required GitHub secret:

| Secret | Description |
|---|---|
| `AWS_ROLE_ARN` | IAM role ARN for OIDC authentication |

## Dependency updates

`renovate.json` puts this repo under the org-wide Renovate app. The split of responsibility matters:

| What | Owned by | Auto-merged? |
|---|---|---|
| `platform-base` runtime pins (`ARG PLATFORM_BASE*_VERSION`) | `base-pin-drift.yml` | no — PR, gated on a clean grype scan |
| `node:` build-stage digest | Renovate | **yes** |
| npm / pip patch releases, Action digests | Renovate | **yes** |
| npm / pip minor releases, docker version tags | Renovate | no — PR for a human |
| npm / pip major releases | Renovate | no — held on the Dependency Dashboard |

Renovate is deliberately barred from the `platform-base` package: tracking an ECR tag would need AWS credentials it does not hold, and a `docker:pinDigests` rewrite of those `FROM` lines would break the regexes `check_base_pin_drift.py` parses them with.

The auto-merges are the point, not a convenience. A pinned digest with nobody bumping it is *worse* than a floating tag — it freezes that day's vulnerabilities in place. Merging to the default branch is what makes `ci.yml` rebuild and push, so the merge is what actually delivers the patch to a running pod.
