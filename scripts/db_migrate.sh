#!/bin/bash
# ============================================================================
# Concept2Cure "Global Command Center" - Database Migration Script
# Script: db_migrate.sh
# Purpose: Applies all migrations in lexical order to the target database
# ============================================================================
# Usage:
#   DATABASE_URL="postgresql://..." ./scripts/db_migrate.sh
#   or
#   DATABASE_NEON_NEW_SECRET="postgresql://..." ./scripts/db_migrate.sh
#
# NOTE: For DDL/migrations, prefer DATABASE_URL_DIRECT over pooled connections.
#       This script uses psql_safe.sh to prevent pager/terminal issues.
# ============================================================================

set -e  # Exit on error

# === TERMINAL SAFETY ===
# Prevent pager from hijacking terminal (alternate screen buffer issues)
export TERM="${TERM:-dumb}"
export PAGER="${PAGER:-cat}"
export LESS="${LESS:--FRSX}"
export PSQL_PAGER="${PSQL_PAGER:-off}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
MIGRATIONS_DIR="$PROJECT_ROOT/db/migrations"

echo -e "${BLUE}============================================================================${NC}"
echo -e "${BLUE}Concept2Cure Global Command Center - Database Migration${NC}"
echo -e "${BLUE}============================================================================${NC}"
echo ""

# Check for DATABASE_URL (try both env vars, prefer DIRECT for migrations)
if [ -n "$DATABASE_URL_DIRECT" ]; then
    DATABASE_URL="$DATABASE_URL_DIRECT"
    echo -e "${YELLOW}Using DATABASE_URL_DIRECT (recommended for migrations)${NC}"
elif [ -z "$DATABASE_URL" ]; then
    if [ -n "$DATABASE_NEON_NEW_SECRET" ]; then
        DATABASE_URL="$DATABASE_NEON_NEW_SECRET"
        echo -e "${YELLOW}Using DATABASE_NEON_NEW_SECRET as connection string${NC}"
    else
        echo -e "${RED}ERROR: DATABASE_URL or DATABASE_NEON_NEW_SECRET environment variable is required${NC}"
        echo ""
        echo "Usage:"
        echo "  DATABASE_URL=\"postgresql://...\" ./scripts/db_migrate.sh"
        echo "  or"
        echo "  source .env && ./scripts/db_migrate.sh"
        exit 1
    fi
fi

# Sanitize connection string (strip accidental leading 'psql ' and quotes)
DATABASE_URL="${DATABASE_URL#psql }"
DATABASE_URL="$(echo "$DATABASE_URL" | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//')"
DATABASE_URL="${DATABASE_URL#\"}"
DATABASE_URL="${DATABASE_URL%\"}"
DATABASE_URL="${DATABASE_URL#\'}"
DATABASE_URL="${DATABASE_URL%\'}"

# Mask password in URL for display
DISPLAY_URL=$(echo "$DATABASE_URL" | sed 's/:[^:@]*@/:***@/')
echo -e "${BLUE}Target: ${NC}$DISPLAY_URL"
echo ""

# Check if migrations directory exists
if [ ! -d "$MIGRATIONS_DIR" ]; then
    echo -e "${RED}ERROR: Migrations directory not found: $MIGRATIONS_DIR${NC}"
    exit 1
fi

# ============================================================================
# MIGRATION FILE DISCOVERY
# ============================================================================
# Find all migration files in proper order:
# 1. Bootstrap (000_gcc_bootstrap_core.sql) - MUST run first
# 2. Numbered GCC migrations (00X_gcc_*.sql where X is 0-9)
# 3. Higher numbered migrations (0XX_*.sql where XX >= 10)
# 4. Date-prefixed migrations (20YYMMDD_*.sql)
#
# Excludes: _legacy/, _consolidated/, *.md files
# ============================================================================

# Phase 1: Bootstrap core (must run first for core schema + auth stubs)
BOOTSTRAP_FILE="$MIGRATIONS_DIR/000_gcc_bootstrap_core.sql"

# Phase 2: Numbered migrations (001-099) - sorted numerically
NUMBERED_MIGRATIONS=$(find "$MIGRATIONS_DIR" -maxdepth 1 -name "0[0-9][0-9]_*.sql" -type f ! -name "000_gcc_bootstrap_core.sql" | sort)

# Phase 3: Three-digit migrations (100+) - sorted numerically
THREE_DIGIT_MIGRATIONS=$(find "$MIGRATIONS_DIR" -maxdepth 1 -name "1[0-9][0-9]_*.sql" -type f | sort)

# Phase 4: Date-prefixed migrations (YYYYMMDD_*.sql) - sorted by date
DATE_MIGRATIONS=$(find "$MIGRATIONS_DIR" -maxdepth 1 -name "20[0-9][0-9][0-9][0-9][0-9][0-9]_*.sql" -type f | sort)

# Combine all in order
MIGRATION_FILES=""
if [ -f "$BOOTSTRAP_FILE" ]; then
    MIGRATION_FILES="$BOOTSTRAP_FILE"
fi
MIGRATION_FILES="$MIGRATION_FILES $NUMBERED_MIGRATIONS $THREE_DIGIT_MIGRATIONS $DATE_MIGRATIONS"

# Trim whitespace and check if empty
MIGRATION_FILES=$(echo "$MIGRATION_FILES" | xargs)

if [ -z "$MIGRATION_FILES" ]; then
    echo -e "${YELLOW}No migration files found in $MIGRATIONS_DIR${NC}"
    exit 0
fi

echo -e "${BLUE}Found migrations:${NC}"
for file in $MIGRATION_FILES; do
    echo "  - $(basename "$file")"
done
echo ""

# Apply each migration
FAILED=0
APPLIED=0

for migration in $MIGRATION_FILES; do
    MIGRATION_NAME=$(basename "$migration")
    echo -e "${YELLOW}Applying: ${NC}$MIGRATION_NAME"

    # Run migration with safe psql settings (no pager, no .psqlrc, fail fast)
    # -X: skip .psqlrc, --no-psqlrc: extra safety, ON_ERROR_STOP: fail on errors
    if PAGER=cat psql -X --no-psqlrc -P pager=off "$DATABASE_URL" \
        -v ON_ERROR_STOP=1 \
        -f "$migration" \
        2>&1; then
        echo -e "${GREEN}✓ Applied: ${NC}$MIGRATION_NAME"
        ((APPLIED++))
    else
        echo -e "${RED}✗ FAILED: ${NC}$MIGRATION_NAME"
        FAILED=1
        break
    fi
    echo ""
done

# Summary
echo -e "${BLUE}============================================================================${NC}"
if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}SUCCESS: $APPLIED migration(s) applied successfully${NC}"
    echo ""
    echo -e "${BLUE}Next steps:${NC}"
    echo "  1. Run verification: psql \"\$DATABASE_URL\" -f scripts/db_verify.sql"
    echo "  2. Check schemas: psql \"\$DATABASE_URL\" -c \"\\dn\""
    echo "  3. Check tables: psql \"\$DATABASE_URL\" -c \"\\dt truth.* prose.* adversarial.* audit.*\""
    exit 0
else
    echo -e "${RED}FAILED: Migration stopped due to error${NC}"
    echo "Review the error above and fix before retrying."
    exit 1
fi
