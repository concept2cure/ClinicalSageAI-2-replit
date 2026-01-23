#!/usr/bin/env bash
# =============================================================================
# psql_safe.sh - Safe psql wrapper that prevents pager/terminal issues
# =============================================================================
# This script wraps psql with settings that prevent:
# - Alternate screen buffer issues (pager mode)
# - Terminal state corruption
# - Session-based DDL problems with connection poolers
#
# Usage:
#   ./scripts/psql_safe.sh -At -c "SELECT now();"
#   ./scripts/psql_safe.sh -f db/migrations/039_gcc_*.sql
#   DATABASE_URL_DIRECT="..." ./scripts/psql_safe.sh -c "CREATE TABLE..."
# =============================================================================
set -euo pipefail

# Use DATABASE_URL_DIRECT if available (preferred for DDL), otherwise DATABASE_URL
if [[ -n "${DATABASE_URL_DIRECT:-}" ]]; then
    DB_URL="$DATABASE_URL_DIRECT"
elif [[ -n "${DATABASE_URL:-}" ]]; then
    DB_URL="$DATABASE_URL"
elif [[ -n "${DATABASE_NEON_NEW_SECRET:-}" ]]; then
    DB_URL="$DATABASE_NEON_NEW_SECRET"
else
    echo "ERROR: DATABASE_URL, DATABASE_URL_DIRECT, or DATABASE_NEON_NEW_SECRET is required" >&2
    exit 1
fi

# Disable pager completely - prevents alternate screen buffer issues
export PAGER="${PAGER:-cat}"

# Safe less settings if pager is somehow invoked
export LESS="${LESS:--FRSX}"

# Disable colors in psql output for cleaner scripting
export PSQL_PAGER="${PSQL_PAGER:-cat}"

# Execute psql with safe options:
#   -X          : Skip .psqlrc file (prevents custom pager settings)
#   --no-psqlrc : Extra safety for strange environments
#   --set       : ON_ERROR_STOP ensures we fail fast on errors
exec psql -X --no-psqlrc --set=ON_ERROR_STOP=1 "$DB_URL" "$@"
