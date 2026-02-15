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

# Determine base ref for changed-file scope
BASE_REF=""
if [[ -n "${GITHUB_BASE_REF:-}" ]] && git rev-parse --verify "origin/${GITHUB_BASE_REF}" >/dev/null 2>&1; then
  BASE_REF="origin/${GITHUB_BASE_REF}"
elif git rev-parse --verify origin/main >/dev/null 2>&1; then
  BASE_REF="origin/main"
elif git rev-parse --verify HEAD~1 >/dev/null 2>&1; then
  BASE_REF="HEAD~1"
fi

CHANGED_MIGRATIONS=""
if [[ -n "$BASE_REF" ]]; then
  CHANGED_MIGRATIONS=$(git diff --name-only "$BASE_REF"...HEAD -- "$MIGRATIONS_DIR"/*.sql 2>/dev/null || true)
else
  CHANGED_MIGRATIONS=$(git diff --name-only -- "$MIGRATIONS_DIR"/*.sql 2>/dev/null || true)
fi

if [[ -z "$CHANGED_MIGRATIONS" ]]; then
  echo "✅ No migration changes detected in current diff scope."
  exit 0
fi

while IFS= read -r f; do
  [[ -z "$f" ]] && continue

  file_name="$(basename "$f")"

  # In-scope: 2026+ date-prefixed migrations + vault prerequisite
  if [[ ! "$file_name" =~ ^2026 ]] && [[ ! "$file_name" =~ ^2027 ]] && [[ ! "$file_name" =~ ^2028 ]] && [[ ! "$file_name" =~ ^2029 ]] && [[ "$file_name" != "044c_gcc_vault_schema.sql" ]]; then
    continue
  fi

  if [[ ! -f "$f" ]]; then
    # Deleted/renamed-out files should not block header checks
    continue
  fi

  checked=$((checked + 1))
  if ! head -40 "$f" | grep -q "$HEADER_MARKER"; then
    echo "❌ Missing eCTD header: $f"
    missing=1
  fi
done <<< "$CHANGED_MIGRATIONS"

echo ""

if [ "$checked" -eq 0 ]; then
  echo "✅ No in-scope migration files changed; header guardrail not applicable."
  exit 0
fi

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

echo "✅ Migration header check passed ($checked in-scope migration(s) checked)."
