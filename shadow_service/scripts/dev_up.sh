#!/usr/bin/env bash
# =============================================================================
# dev_up.sh - One-command development environment setup
# =============================================================================
# Usage: ./scripts/dev_up.sh
# =============================================================================
set -euo pipefail

# === TERMINAL SAFETY ===
# Prevent pager from hijacking terminal (alternate screen buffer issues)
export PAGER="${PAGER:-cat}"
export LESS="${LESS:--FRSX}"
export PSQL_PAGER="${PSQL_PAGER:-cat}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="${SCRIPT_DIR}/.."

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_step() { echo -e "${BLUE}[STEP]${NC} $1"; }

echo -e "${BLUE}"
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║       Shadow Service Development Environment Setup         ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo -e "${NC}"

cd "$PROJECT_DIR"

# =============================================================================
# Step 1: Check prerequisites
# =============================================================================
log_step "1/6 Checking prerequisites..."

if ! command -v python3 &> /dev/null; then
    log_error "Python 3 is required but not installed"
    exit 1
fi

if ! command -v psql &> /dev/null; then
    log_warn "psql not found - database operations may fail"
fi

# Check for .env file
if [[ ! -f ".env" ]]; then
    if [[ -f ".env.example" ]]; then
        log_warn "No .env file found. Copying from .env.example..."
        cp .env.example .env
        log_warn "Please edit .env with your DATABASE_URL before continuing"
        exit 1
    else
        log_error "No .env or .env.example file found"
        exit 1
    fi
fi

# Load environment
set -a
source .env
set +a

if [[ -z "${DATABASE_URL:-}" ]]; then
    log_error "DATABASE_URL not set in .env file"
    exit 1
fi

log_info "Prerequisites OK"

# =============================================================================
# Step 2: Create virtual environment if needed
# =============================================================================
log_step "2/6 Setting up Python environment..."

if [[ ! -d ".venv" ]]; then
    log_info "Creating virtual environment..."
    python3 -m venv .venv
fi

source .venv/bin/activate
log_info "Virtual environment activated"

# =============================================================================
# Step 3: Install dependencies
# =============================================================================
log_step "3/6 Installing dependencies..."

pip install --quiet --upgrade pip
pip install --quiet -r requirements.txt
log_info "Dependencies installed"

# =============================================================================
# Step 4: Run migrations
# =============================================================================
log_step "4/6 Running database migrations..."

if command -v psql &> /dev/null; then
    chmod +x scripts/db_migrate.sh
    ./scripts/db_migrate.sh
    log_info "Migrations complete"
else
    log_warn "Skipping migrations (psql not available)"
fi

# =============================================================================
# Step 5: Verify database
# =============================================================================
log_step "5/6 Verifying database compliance..."

if command -v psql &> /dev/null; then
    if psql "$DATABASE_URL" -f scripts/db_verify.sql; then
        log_info "Database verification passed"
    else
        log_warn "Database verification had warnings (may be OK)"
    fi
else
    log_warn "Skipping verification (psql not available)"
fi

# =============================================================================
# Step 6: Start the service
# =============================================================================
log_step "6/6 Starting Shadow Service..."

echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                   Ready to Start!                         ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "Service will be available at:"
echo "  • API:     http://localhost:8001"
echo "  • Docs:    http://localhost:8001/docs"
echo "  • Health:  http://localhost:8001/health"
echo ""

python run_shadow_mvp.py
