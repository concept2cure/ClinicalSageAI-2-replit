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
export PAGER="${PAGER:-cat}"
export LESS="${LESS:--FRSX}"
export PSQL_PAGER="${PSQL_PAGER:-cat}"

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

# Mask password in URL for display
DISPLAY_URL=$(echo "$DATABASE_URL" | sed 's/:[^:@]*@/:***@/')
echo -e "${BLUE}Target: ${NC}$DISPLAY_URL"
echo ""

# Check if migrations directory exists
if [ ! -d "$MIGRATIONS_DIR" ]; then
    echo -e "${RED}ERROR: Migrations directory not found: $MIGRATIONS_DIR${NC}"
    exit 1
fi

# Find GCC migration files (001-009 prefixes) and sort them
MIGRATION_FILES=$(find "$MIGRATIONS_DIR" -name "00[1-9]_gcc_*.sql" -type f | sort)

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
    if PAGER=cat psql -X --no-psqlrc "$DATABASE_URL" \
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
