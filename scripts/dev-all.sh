#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# dev-all.sh — "Run Everything" local development launcher
#
# Starts all ClinicalSageAI services in the correct order:
#   1. PostgreSQL (via Docker or Neon connection)
#   2. Shadow Service (FastAPI on port 8001)
#   3. BFF + Vite (Express on port 5000)
#
# Usage:
#   chmod +x scripts/dev-all.sh
#   scripts/dev-all.sh              # interactive — logs to terminal
#   scripts/dev-all.sh --bg         # background — logs to /tmp
#
# Environment variables (auto-set if missing):
#   DATABASE_URL       — PostgreSQL connection string
#   REVIEW_ADMIN_TOKEN — Shared secret between BFF and Shadow
#   SHADOW_SERVICE_URL — BFF→Shadow URL (default http://localhost:8001)
#   JWT_SECRET         — JWT signing key for BFF
# ═══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "${BLUE}[dev-all]${NC} $1"; }
ok()  { echo -e "${GREEN}[  OK  ]${NC} $1"; }
warn(){ echo -e "${YELLOW}[ WARN ]${NC} $1"; }
err() { echo -e "${RED}[ERROR ]${NC} $1"; }

# ── Defaults ──────────────────────────────────────────────────────────────────

export SHADOW_SERVICE_URL="${SHADOW_SERVICE_URL:-http://localhost:8001}"
export REVIEW_ADMIN_TOKEN="${REVIEW_ADMIN_TOKEN:-dev-review-token-change-me}"
export JWT_SECRET="${JWT_SECRET:-trialsage-dev-secret-key-change-in-production}"

# Inherit DATABASE_URL from startup.sh if not already set
if [[ -z "${DATABASE_URL:-}" ]]; then
    if [[ -f "$SCRIPT_DIR/startup.sh" ]]; then
        source "$SCRIPT_DIR/startup.sh" 2>/dev/null || true
    fi
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
    err "DATABASE_URL is not set. Either:"
    err "  1) Create a .env file with DATABASE_URL=postgresql://..."
    err "  2) Run: source scripts/startup.sh first"
    err "  3) Set DATABASE_URL in your shell"
    exit 1
fi

ok "DATABASE_URL is set"
ok "SHADOW_SERVICE_URL=$SHADOW_SERVICE_URL"
ok "REVIEW_ADMIN_TOKEN is set (${#REVIEW_ADMIN_TOKEN} chars)"

# ── Cleanup on exit ──────────────────────────────────────────────────────────

SHADOW_PID=""
BFF_PID=""

cleanup() {
    log "Shutting down services..."
    [[ -n "$SHADOW_PID" ]] && kill "$SHADOW_PID" 2>/dev/null && log "Stopped Shadow Service (PID $SHADOW_PID)"
    [[ -n "$BFF_PID" ]]    && kill "$BFF_PID" 2>/dev/null    && log "Stopped BFF (PID $BFF_PID)"
    exit 0
}

trap cleanup EXIT INT TERM

# ── Step 1: Check Python environment ─────────────────────────────────────────

log "Checking Python environment..."
if ! command -v python3 &>/dev/null; then
    err "python3 not found. Install Python 3.10+."
    exit 1
fi

PYTHON_VER=$(python3 -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
ok "Python $PYTHON_VER found"

# Check Shadow Service dependencies
if ! python3 -c "import fastapi, uvicorn, asyncpg, fpdf2" 2>/dev/null; then
    warn "Missing Python packages — installing..."
    pip install fastapi uvicorn asyncpg fpdf2 pydantic-settings python-dotenv 2>/dev/null || {
        err "Failed to install Python dependencies"
        exit 1
    }
fi
ok "Python dependencies OK"

# ── Step 2: Check Node.js ────────────────────────────────────────────────────

log "Checking Node.js..."
if ! command -v node &>/dev/null; then
    err "node not found. Install Node.js 18+."
    exit 1
fi

NODE_VER=$(node -v)
ok "Node.js $NODE_VER found"

if [[ ! -d "$PROJECT_ROOT/node_modules" ]]; then
    warn "node_modules missing — running npm install..."
    cd "$PROJECT_ROOT" && npm install
fi
ok "Node dependencies OK"

# ── Step 3: Start Shadow Service (port 8001) ─────────────────────────────────

log "Starting Shadow Service on port 8001..."

cd "$PROJECT_ROOT/shadow_service"

# Create .env for Shadow if missing
if [[ ! -f .env ]]; then
    cat > .env <<ENVEOF
DATABASE_URL=$DATABASE_URL
REVIEW_ADMIN_TOKEN=$REVIEW_ADMIN_TOKEN
ENVEOF
    ok "Created shadow_service/.env"
fi

if [[ "${1:-}" == "--bg" ]]; then
    python3 -m uvicorn shadow_service.main:app --host 0.0.0.0 --port 8001 --reload \
        > /tmp/shadow-service.log 2>&1 &
    SHADOW_PID=$!
    ok "Shadow Service started in background (PID $SHADOW_PID, log: /tmp/shadow-service.log)"
else
    python3 -m uvicorn shadow_service.main:app --host 0.0.0.0 --port 8001 --reload &
    SHADOW_PID=$!
    ok "Shadow Service started (PID $SHADOW_PID)"
fi

# Wait for Shadow to be ready
log "Waiting for Shadow Service to be ready..."
for i in $(seq 1 20); do
    if curl -s "http://localhost:8001/health" >/dev/null 2>&1; then
        ok "Shadow Service is healthy"
        break
    fi
    if [[ $i -eq 20 ]]; then
        warn "Shadow Service not responding on :8001 (may still be starting)"
    fi
    sleep 1
done

# ── Step 4: Start BFF + Vite (port 5000) ─────────────────────────────────────

log "Starting BFF + Vite dev server on port 5000..."

cd "$PROJECT_ROOT"

if [[ "${1:-}" == "--bg" ]]; then
    npm run dev > /tmp/bff-dev.log 2>&1 &
    BFF_PID=$!
    ok "BFF started in background (PID $BFF_PID, log: /tmp/bff-dev.log)"
else
    npm run dev &
    BFF_PID=$!
    ok "BFF started (PID $BFF_PID)"
fi

# ── Summary ───────────────────────────────────────────────────────────────────

echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  ClinicalSageAI — All Services Running${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "  ${BLUE}Shadow Service:${NC}  http://localhost:8001"
echo -e "  ${BLUE}Shadow Health:${NC}   http://localhost:8001/health"
echo -e "  ${BLUE}BFF + UI:${NC}        http://localhost:5000"
echo -e "  ${BLUE}Render API:${NC}      http://localhost:8001/render/jobs"
echo ""
echo -e "  ${YELLOW}Press Ctrl+C to stop all services${NC}"
echo ""

# Wait for either process to exit
wait
