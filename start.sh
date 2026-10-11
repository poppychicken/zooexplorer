#!/usr/bin/env bash

# Local development launcher
# Starts the FastAPI backend (background) and the Vite frontend (foreground).
# Backend: http://localhost:8080   Frontend: http://localhost:5173
# Vite proxies /api to the backend, so the browser only ever talks to :5173.

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

BACKEND_PORT=8080
FRONTEND_PORT=5173
HEALTH_URL="http://localhost:${BACKEND_PORT}/api/health"

print_status()  { echo -e "${GREEN}[INFO]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARN]${NC} $1"; }
print_error()   { echo -e "${RED}[ERROR]${NC} $1"; }
print_header()  { echo -e "${BLUE}================================${NC}"; echo -e "${BLUE}$1${NC}"; echo -e "${BLUE}================================${NC}"; }

# Run from repo root
cd "$(dirname "$0")"

if [ ! -d backend ] || [ ! -d frontend ]; then
    print_error "Run this script from the project root (expected backend/ and frontend/ directories)."
    exit 1
fi

check_port() {
    lsof -Pi :"$1" -sTCP:LISTEN -t >/dev/null 2>&1
}

kill_port() {
    local port=$1
    local pids
    pids=$(lsof -ti :"$port" 2>/dev/null || true)
    if [ -n "$pids" ]; then
        print_warning "Killing processes on port $port: $pids"
        echo "$pids" | xargs kill -9 2>/dev/null || true
        sleep 2
    fi
}

wait_for_service() {
    local url=$1
    local name=$2
    local max_attempts=30
    local attempt=1

    print_status "Waiting for $name to be ready..."
    while [ $attempt -le $max_attempts ]; do
        if curl -s --max-time 2 "$url" >/dev/null 2>&1; then
            print_status "$name is ready!"
            return 0
        fi
        echo -n "."
        sleep 2
        attempt=$((attempt + 1))
    done
    echo
    print_error "$name failed to start within $((max_attempts * 2)) seconds"
    return 1
}

check_dependencies() {
    print_header "Pre-flight Checks"

    local missing=0
    for cmd in node npm python3 lsof curl; do
        if ! command -v "$cmd" >/dev/null 2>&1; then
            print_error "$cmd is not installed."
            missing=1
        fi
    done
    [ $missing -eq 0 ] || exit 1

    # Python 3.12+ (the image builds on 3.13; the app uses PEP 604 unions)
    local py_minor
    py_minor=$(python3 -c 'import sys; print(sys.version_info.minor)')
    if [ "$(python3 -c 'import sys; print(sys.version_info.major)')" -lt 3 ] || [ "$py_minor" -lt 12 ]; then
        print_warning "Python 3.12+ recommended (found $(python3 --version))"
    fi

    # Vite 8 requires Node 20.19+/22.12+; the image builds on 24.
    local node_major
    node_major=$(node -p 'process.versions.node.split(".")[0]')
    if [ "$node_major" -lt 22 ]; then
        print_warning "Node 22.12+ recommended (found $(node --version))"
    fi

    # config.yaml is optional: without it the backend falls back to
    # mongodb://localhost:27017 (and env vars still win over both).
    if [ ! -f config.yaml ]; then
        print_warning "No config.yaml — using built-in defaults (mongodb://localhost:27017). Copy config-sample.yaml if you need to override."
    elif grep -q '{{[A-Z_]\+}}' config.yaml 2>/dev/null; then
        print_error "config.yaml still contains {{PLACEHOLDER}} values. Fill them in manually or re-run the bootstrap workflow."
        exit 1
    fi

    if [ ! -f backend/requirements-dev.txt ]; then
        print_error "backend/requirements-dev.txt not found."
        exit 1
    fi

    if [ ! -f frontend/package.json ]; then
        print_error "frontend/package.json not found."
        exit 1
    fi

    print_status "All pre-flight checks passed"
}

setup_backend() {
    print_header "Setting up Backend"

    pushd backend >/dev/null

    if [ ! -d .venv ]; then
        print_status "Creating Python virtual environment (.venv)..."
        python3 -m venv .venv
    fi

    # shellcheck disable=SC1091
    source .venv/bin/activate

    print_status "Installing Python dependencies..."
    pip install --quiet --upgrade pip
    pip install --quiet -r requirements-dev.txt

    deactivate
    popd >/dev/null
    print_status "Backend setup complete"
}

setup_frontend() {
    print_header "Setting up Frontend"

    pushd frontend >/dev/null

    if [ ! -d node_modules ] || [ package.json -nt node_modules ]; then
        print_status "Installing Node.js dependencies..."
        npm install
    else
        print_status "node_modules up to date — skipping npm install (use --force-install to override)"
    fi

    popd >/dev/null
    print_status "Frontend setup complete"
}

start_backend() {
    print_header "Starting Backend"

    kill_port "$BACKEND_PORT"
    if check_port "$BACKEND_PORT"; then
        print_error "Port $BACKEND_PORT is still in use after attempting to free it."
        exit 1
    fi

    pushd backend >/dev/null
    # shellcheck disable=SC1091
    source .venv/bin/activate

    print_status "Starting FastAPI on port $BACKEND_PORT (with --reload)..."
    nohup uvicorn app.main:app --host 0.0.0.0 --port "$BACKEND_PORT" --reload > ../backend.log 2>&1 &
    BACKEND_PID=$!

    deactivate
    popd >/dev/null

    echo "$BACKEND_PID" > .backend_pid

    if ! wait_for_service "$HEALTH_URL" "Backend API"; then
        print_error "Backend failed to start. Tail backend.log:"
        tail -n 30 backend.log || true
        stop_services
        exit 1
    fi

    print_status "Backend running (PID: $BACKEND_PID, logs: backend.log)"
}

start_frontend() {
    print_header "Starting Frontend"

    kill_port "$FRONTEND_PORT"
    if check_port "$FRONTEND_PORT"; then
        print_error "Port $FRONTEND_PORT is still in use after attempting to free it."
        return 1
    fi

    # Vite watches lots of files; raise fd limit so chokidar doesn't EMFILE.
    if [ "$(ulimit -n)" -lt 8192 ]; then
        ulimit -n 65536 2>/dev/null || ulimit -n 8192 2>/dev/null || true
        print_status "Raised file-descriptor limit to $(ulimit -n)"
    fi

    pushd frontend >/dev/null

    print_status "Starting Vite dev server on port $FRONTEND_PORT (with HMR)..."
    print_status "Frontend runs in foreground. Press Ctrl+C to stop everything."
    npm run dev -- --port "$FRONTEND_PORT" --host

    popd >/dev/null
}

stop_services() {
    print_header "Stopping Services"

    if [ -f .backend_pid ]; then
        local pid
        pid=$(cat .backend_pid)
        if kill -0 "$pid" 2>/dev/null; then
            print_status "Stopping backend (PID: $pid)..."
            kill "$pid" 2>/dev/null || true
            wait "$pid" 2>/dev/null || true
        else
            print_warning "Backend process $pid not found"
        fi
        rm -f .backend_pid
    fi

    # Best-effort: free the ports anyway
    kill_port "$BACKEND_PORT"
}

cleanup() {
    echo
    print_status "Cleaning up..."
    stop_services
    exit 0
}

trap cleanup SIGINT SIGTERM

usage() {
    cat <<EOF
Usage: $0 [OPTIONS]

Starts the FastAPI backend (background) and the Vite frontend (foreground).

Options:
  --skip-setup      Skip dependency installation (venv create + pip/npm install)
  --backend-only    Start only the backend, then exit (foreground)
  --frontend-only   Start only the frontend (assumes backend is already running)
  --stop            Stop a running backend started by this script
  --help            Show this help

Services:
  Backend:  http://localhost:${BACKEND_PORT}        (logs: ./backend.log)
  Frontend: http://localhost:${FRONTEND_PORT}        (Ctrl+C to stop everything)
EOF
}

main() {
    local skip_setup=false
    local backend_only=false
    local frontend_only=false

    while [ $# -gt 0 ]; do
        case "$1" in
            --skip-setup)    skip_setup=true; shift ;;
            --backend-only)  backend_only=true; shift ;;
            --frontend-only) frontend_only=true; shift ;;
            --stop)          stop_services; exit 0 ;;
            --help|-h)       usage; exit 0 ;;
            *) print_error "Unknown option: $1"; usage; exit 1 ;;
        esac
    done

    print_header "Local Development Server"

    check_dependencies

    if [ "$skip_setup" = false ]; then
        [ "$frontend_only" = false ] && setup_backend
        [ "$backend_only" = false ] && setup_frontend
    else
        print_status "Skipping setup as requested"
    fi

    if [ "$frontend_only" = true ]; then
        start_frontend
        return
    fi

    start_backend

    if [ "$backend_only" = true ]; then
        print_status "Backend is running in the background. Use '$0 --stop' to stop it."
        print_status "Tail logs with: tail -f backend.log"
        return
    fi

    start_frontend

    print_status "Frontend stopped, cleaning up..."
    stop_services
}

main "$@"
