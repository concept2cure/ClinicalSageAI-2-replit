#!/bin/bash
# ============================================================================
# Concept2Cure v3.0 Migration Runner
# Purpose: Execute all eCTD v4.0 architecture migrations
# ============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATIONS_DIR="$SCRIPT_DIR/db/migrations"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo ""
echo "╔══════════════════════════════════════════════════════════════════════════╗"
echo "║  Concept2Cure v3.0 - Enterprise Architecture Migration Runner            ║"
echo "║  eCTD v4.0 | Multi-Tenant RLS | Part 11 Audit                            ║"
echo "╚══════════════════════════════════════════════════════════════════════════╝"
echo ""

# Check for DATABASE_URL
if [ -z "$DATABASE_URL" ]; then
    echo -e "${YELLOW}DATABASE_URL not set, attempting to load from .env${NC}"
    if [ -f "$SCRIPT_DIR/.env" ]; then
        source "$SCRIPT_DIR/.env"
        # Try different env var names
        if [ -n "$DATABASE_NEON_NEW_SECRET" ]; then
            # Extract just the URL part (remove 'psql ' prefix if present)
            DATABASE_URL=$(echo "$DATABASE_NEON_NEW_SECRET" | sed "s/^psql '//g" | sed "s/'$//g")
        fi
    fi
fi

if [ -z "$DATABASE_URL" ]; then
    echo -e "${RED}Error: DATABASE_URL is required${NC}"
    echo "Set DATABASE_URL environment variable or create .env file"
    exit 1
fi

echo -e "${BLUE}Database:${NC} $(echo $DATABASE_URL | sed 's/:[^@]*@/:*****@/g')"
echo ""

# Migrations to run (in order)
MIGRATIONS=(
    "050_gcc_ectd_v4_domain_registry.sql"
    "051_gcc_multi_tenant_identity.sql"
    "052_gcc_ectd_v4_cou_graph.sql"
    "053_gcc_rls_policies.sql"
    "054_gcc_part11_audit.sql"
    "055_gcc_test_scenarios.sql"
)

# Run each migration
for migration in "${MIGRATIONS[@]}"; do
    migration_path="$MIGRATIONS_DIR/$migration"
    
    if [ ! -f "$migration_path" ]; then
        echo -e "${RED}✗ Migration not found: $migration${NC}"
        continue
    fi
    
    echo -e "${YELLOW}Running:${NC} $migration"
    
    # Execute migration
    if psql "$DATABASE_URL" -f "$migration_path" 2>&1; then
        echo -e "${GREEN}✓ Completed:${NC} $migration"
    else
        echo -e "${RED}✗ Failed:${NC} $migration"
        echo "Stopping migration sequence"
        exit 1
    fi
    
    echo ""
done

echo ""
echo "═══════════════════════════════════════════════════════════════════════════"
echo -e "${GREEN}All migrations completed successfully!${NC}"
echo "═══════════════════════════════════════════════════════════════════════════"
echo ""

# Ask to run test suite
read -p "Run test suite? (y/n) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo ""
    echo "Running Test Suite..."
    echo ""
    psql "$DATABASE_URL" -f "$MIGRATIONS_DIR/056_gcc_test_runner.sql"
fi
