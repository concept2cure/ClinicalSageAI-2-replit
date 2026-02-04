#!/usr/bin/env bash
# =============================================================================
# CI Guardrail: Require eCTD Regulatory Audit Headers on Migrations
# =============================================================================
# Ensures all SQL migrations in db/migrations/ contain the standard
# "eCTD REGULATORY AUDIT CONTEXT" header block for 21 CFR Part 11 compliance.
#
# SCOPE: Only checks migrations created in 2026+ (date-prefixed 2026MMDD_*.sql)
#        and the vault prerequisite (044c_gcc_vault_schema.sql).
#        Legacy numbered migrations (00X_*.sql) are grandfathered.
#
# Usage:
#   ./scripts/ci/require-migration-headers.sh
#
# Exit codes:
#   0 - All in-scope migrations have required headers
#   1 - One or more in-scope migrations missing headers
# =============================================================================
set -euo pipefail

MIGRATIONS_DIR="db/migrations"
HEADER_MARKER="eCTD REGULATORY AUDIT CONTEXT"

missing=0
checked=0

echo "🔍 Checking migrations for eCTD regulatory audit headers..."
echo "   (Scope: 2026+ date-prefixed migrations + vault prerequisite)"
echo ""

# Check date-prefixed migrations (Feb 2026+ only - when standard was established)
while IFS= read -r -d '' f; do
  checked=$((checked + 1))
  if ! head -40 "$f" | grep -q "$HEADER_MARKER"; then
    echo "❌ Missing eCTD header: $f"
    missing=1
  fi
done < <(find "$MIGRATIONS_DIR" -maxdepth 1 \( -name "202602*.sql" -o -name "202603*.sql" -o -name "202604*.sql" -o -name "202605*.sql" -o -name "202606*.sql" -o -name "202607*.sql" -o -name "202608*.sql" -o -name "202609*.sql" -o -name "20261*.sql" -o -name "2027*.sql" -o -name "2028*.sql" -o -name "2029*.sql" \) -print0 2>/dev/null || true)

# Check specific vault prerequisite migration
VAULT_PREREQ="$MIGRATIONS_DIR/044c_gcc_vault_schema.sql"
if [ -f "$VAULT_PREREQ" ]; then
  checked=$((checked + 1))
  if ! head -40 "$VAULT_PREREQ" | grep -q "$HEADER_MARKER"; then
    echo "❌ Missing eCTD header: $VAULT_PREREQ"
    missing=1
  fi
fi

echo ""

if [ "$missing" -eq 1 ]; then
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "REQUIRED: Add the standard eCTD audit header to the files listed above."
  echo ""
  echo "Template (paste at line 1 of migration):"
  echo ""
  echo "-- ============================================================================="
  echo "-- eCTD REGULATORY AUDIT CONTEXT"
  echo "-- System: Lumen Cortex — FDA Shadow Review + eCTD Integrity Layer"
  echo "-- Compliance: 21 CFR Part 11 (auditability, traceability), ALCOA+ principles"
  echo "-- Purpose: <ONE SENTENCE: what this migration enables>"
  echo "--"
  echo "-- eCTD/CTD Context:"
  echo "--   - Module(s): <e.g., Module 1 / Module 2 / Module 5>"
  echo "--   - Integrity Risk Addressed: <e.g., broken cross-refs, tenant isolation>"
  echo "--"
  echo "-- Determinism Contract:"
  echo "--   - Schema changes must not undermine deterministic evidence pointers."
  echo "--   - Any change impacting canonical schemas requires spec version bump."
  echo "--"
  echo "-- Notes:"
  echo "--   - RLS policies must enforce program_id isolation where applicable."
  echo "--   - Migration must be idempotent where possible (IF EXISTS / IF NOT EXISTS)."
  echo "-- ============================================================================="
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  exit 1
fi

echo "✅ Migration header check passed ($checked migrations checked)."
