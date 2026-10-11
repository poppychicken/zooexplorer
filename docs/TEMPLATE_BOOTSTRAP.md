# Template Bootstrap (manual)

> The recommended path is the GitHub Issue Form bootstrap described at the top of [../README.md](../README.md). This file is for users who want to render placeholders manually without triggering the workflow.
>
> **Note:** the manual path does **not** generate `.platform/setup.json`. CI's preflight job will skip the build until that file exists, so manual users get a working local dev environment but not automated build/deploy. If you need both, use the issue-form bootstrap.

## 1. Replace placeholders

The bootstrap workflow renders only the two placeholders below. Everything else (Mongo URI, Google OAuth credentials, etc.) is supplied at runtime — either from the shared `tco-internal-*` cluster Secrets in production, or by editing `config.yaml` for local dev.

| Placeholder | Description | Example |
|---|---|---|
| `{{PROJECT_NAME}}` | Project name (lowercase, hyphenated) | `my-awesome-app` |
| `{{MONGODB_DATABASE}}` | MongoDB database name (derived from project name with underscores) | `my_awesome_app_db` |

Quick find-and-replace (substitute `my-awesome-app` and `my_awesome_app_db` for your values):

```bash
grep -rl '{{PROJECT_NAME}}' . \
  --include='*.py' --include='*.js' --include='*.jsx' \
  --include='*.yml' --include='*.yaml' --include='*.html' \
  --include='*.md' --include='*.json' \
  | xargs sed -i 's/{{PROJECT_NAME}}/my-awesome-app/g'

grep -rl '{{MONGODB_DATABASE}}' . \
  --include='*.py' --include='*.js' --include='*.jsx' \
  --include='*.yml' --include='*.yaml' --include='*.html' \
  --include='*.md' --include='*.json' \
  | xargs sed -i 's/{{MONGODB_DATABASE}}/my_awesome_app_db/g'
```

## 2. Auth — nothing to do

There is no per-app OAuth client, no `VITE_GOOGLE_CLIENT_ID`, and no token
verification in this app. The platform gateway (envoy ext_authz →
oauth2-proxy → Google) authenticates every request before it reaches your
pod and passes the caller on `X-Auth-Request-*` headers. `/api/me` reads
them; that is the entire auth story.

Locally there is no gateway, so `/api/me` returns nulls and the UI renders a
generic signed-in placeholder. To test with an identity:

```bash
curl -H 'X-Auth-Request-Email: you@swipejobs.com' http://localhost:8080/api/me
```

## 3. Create configuration

```bash
cp config-sample.yaml config.yaml
# Edit config.yaml and point `mongodb.uri` at your local Mongo. There is no
# OAuth section: identity comes from the platform gateway, never from the app.
```

## 4. Run locally

**Backend:**

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
uvicorn app.main:app --host 0.0.0.0 --port 8080 --reload
```

**Frontend:**

```bash
cd frontend
npm ci
npm run dev
```

The frontend runs on `http://localhost:5173` and Vite proxies `/api` to `http://localhost:8080` — same-origin in dev, same as production.

Or use the bundled launcher to start both at once:

```bash
./start.sh
```

## 5. Run with Docker

```bash
docker build -t my-awesome-app .
docker run -p 8080:8080 \
  --user 65532:65532 --read-only --cap-drop ALL --security-opt no-new-privileges \
  -e MONGODB_URI=mongodb://host.docker.internal:27017 -e MONGODB_DATABASE=app_db \
  my-awesome-app
```
