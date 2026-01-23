#!/usr/bin/env bash
# =============================================================================
# db_migrate.sh - Deterministic migration runner for Shadow Service
# =============================================================================
# Usage: DATABASE_URL="..." ./scripts/db_migrate.sh [--dry-run]
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATIONS_DIR="${SCRIPT_DIR}/../../../db/migrations"
DRY_RUN="${1:-}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Check DATABASE_URL
if [[ -z "${DATABASE_URL:-}" ]]; then
    log_error "DATABASE_URL environment variable is required"
    exit 1
fi

# Create schema_migrations table if not exists
log_info "Ensuring schema_migrations table exists..."
psql "$DATABASE_URL" -q <<EOF
CREATE SCHEMA IF NOT EXISTS core;

CREATE TABLE IF NOT EXISTS core.schema_migrations (
    id SERIAL PRIMARY KEY,
    filename TEXT NOT NULL UNIQUE,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    checksum TEXT,
    applied_by TEXT DEFAULT current_user
);

COMMENT ON TABLE core.schema_migrations IS 
    'Tracks which migrations have been applied to this database';
EOF

# Get list of applied migrations
log_info "Checking applied migrations..."
APPLIED=$(psql "$DATABASE_URL" -t -A -c "SELECT filename FROM core.schema_migrations ORDER BY filename;")

# Get list of available GCC migrations (sorted)
AVAILABLE=$(ls "${MIGRATIONS_DIR}"/*gcc*.sql 2>/dev/null | sort | xargs -n1 basename)

# Count stats
APPLIED_COUNT=$(echo "$APPLIED" | grep -c . || echo 0)
AVAILABLE_COUNT=$(echo "$AVAILABLE" | grep -c . || echo 0)

log_info "Found $AVAILABLE_COUNT migrations, $APPLIED_COUNT already applied"

# Apply pending migrations
PENDING_COUNT=0
for migration in $AVAILABLE; do
    if echo "$APPLIED" | grep -qx "$migration"; then
        continue
    fi
    
    PENDING_COUNT=$((PENDING_COUNT + 1))
    MIGRATION_PATH="${MIGRATIONS_DIR}/${migration}"
    
    if [[ "$DRY_RUN" == "--dry-run" ]]; then
        log_warn "[DRY-RUN] Would apply: $migration"
        continue
    fi
    
    log_info "Applying: $migration"
    
    # Calculate checksum
    CHECKSUM=$(sha256sum "$MIGRATION_PATH" | cut -d' ' -f1)
    
    # Apply migration in a transaction
    if psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$MIGRATION_PATH"; then
        # Record successful application
        psql "$DATABASE_URL" -q -c \
            "INSERT INTO core.schema_migrations (filename, checksum) VALUES ('$migration', '$CHECKSUM');"
        log_info "Successfully applied: $migration"
    else
        log_error "Failed to apply: $migration"
        exit 1
    fi
done

if [[ $PENDING_COUNT -eq 0 ]]; then
    log_info "All migrations already applied!"
else
    if [[ "$DRY_RUN" == "--dry-run" ]]; then
        log_info "Dry run complete. $PENDING_COUNT migrations would be applied."
    else
        log_info "Successfully applied $PENDING_COUNT migrations."
    fi
fi

# Show current state
log_info "Current migration state:"
psql "$DATABASE_URL" -c "SELECT filename, applied_at FROM core.schema_migrations ORDER BY filename;"
