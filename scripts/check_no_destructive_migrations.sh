#!/usr/bin/env bash
# scripts/check_no_destructive_migrations.sh
#
# Prevents merging PRs that introduce destructive schema patterns.
# Run this in CI against migration files changed in the PR.
#
# Usage: bash scripts/check_no_destructive_migrations.sh

set -euo pipefail

echo "=== Destructive Migration Pattern Check ==="
echo ""

# Get list of migration files changed in this PR
FILES=$(git diff --name-only origin/main...HEAD | grep -E '^db/migrations/.*\.sql$' || true)

if [ -z "${FILES}" ]; then
  echo "✅ No migration files changed in this PR."
  exit 0
fi

echo "Checking migration files for destructive patterns:"
for f in $FILES; do
  echo "  - $f"
done
echo ""

# Patterns that indicate destructive operations
# These are blocked by default in regulated environments
BAD_PATTERNS=(
  # Schema destruction
  "DROP TABLE"
  "DROP SCHEMA"
  "DROP VIEW"
  "DROP FUNCTION"
  "DROP TYPE"
  "DROP INDEX"
  
  # Column removal
  "ALTER TABLE .* DROP COLUMN"
  
  # Data destruction in audit/truth tables
  "TRUNCATE"
  "DELETE FROM audit\."
  "DELETE FROM truth\."
  "DELETE FROM prose\.smart_fragment_versions"
  "DELETE FROM prose\.submission_snapshot"
  
  # Updates to immutable tables
  "UPDATE audit\.concomitant_audit_logs"
  "UPDATE audit\.e_signatures"
  "UPDATE audit\.config_bundles"
  "UPDATE prose\.smart_fragment_versions"
  "UPDATE prose\.submission_snapshot_exports"
  "UPDATE truth\.clinical_truth_store SET"
  
  # Disabling RLS
  "DISABLE ROW LEVEL SECURITY"
  "ALTER TABLE .* NO FORCE ROW LEVEL SECURITY"
  
  # Dropping immutability triggers
  "DROP TRIGGER.*trg_no_update_delete"
  "DROP TRIGGER.*trg_no_mutation"
  "DROP TRIGGER.*prevent.*mutation"
)

# Allowed patterns (exceptions that look destructive but are safe)
# These are intentionally designed patterns
ALLOWED_PATTERNS=(
  "DROP TRIGGER IF EXISTS.*BEFORE"  # Replacing triggers is OK
  "DROP POLICY IF EXISTS"           # Replacing RLS policies is OK
  "DROP VIEW IF EXISTS"             # Replacing views is OK (views are queryable, not data)
  "DROP INDEX IF EXISTS"            # Replacing indexes is OK
  "CREATE OR REPLACE"               # Replacing functions/views is OK
)

ERRORS=0
ERROR_DETAILS=""

for f in $FILES; do
  for pattern in "${BAD_PATTERNS[@]}"; do
    # Check if pattern exists in file
    if grep -Eiq "${pattern}" "$f" 2>/dev/null; then
      # Check if it's an allowed exception
      IS_ALLOWED=false
      for allowed in "${ALLOWED_PATTERNS[@]}"; do
        if grep -Eiq "${allowed}" "$f" 2>/dev/null; then
          # The bad pattern might be part of an allowed pattern, check context
          MATCHING_LINE=$(grep -Ein "${pattern}" "$f" | head -1)
          for allowed_check in "${ALLOWED_PATTERNS[@]}"; do
            if echo "${MATCHING_LINE}" | grep -Eiq "${allowed_check}"; then
              IS_ALLOWED=true
              break
            fi
          done
        fi
      done
      
      if [ "$IS_ALLOWED" = false ]; then
        ERRORS=$((ERRORS + 1))
        MATCHING_LINE=$(grep -Ein "${pattern}" "$f" | head -1)
        ERROR_DETAILS="${ERROR_DETAILS}\n  ❌ $f: ${pattern}\n     Line: ${MATCHING_LINE}"
      fi
    fi
  done
done

if [ $ERRORS -gt 0 ]; then
  echo "❌ DESTRUCTIVE PATTERNS DETECTED!"
  echo ""
  echo "The following potentially destructive operations were found:"
  echo -e "${ERROR_DETAILS}"
  echo ""
  echo "If this is intentional and approved, you must:"
  echo "  1. Add the pattern to ALLOWED_PATTERNS in this script"
  echo "  2. Document the reason in the migration file comments"
  echo "  3. Get explicit approval from a database admin"
  echo ""
  echo "For regulated systems, destructive operations require:"
  echo "  - Written justification"
  echo "  - Data migration/backup plan"
  echo "  - Stakeholder approval"
  exit 1
fi

echo "✅ No destructive migration patterns detected."
echo ""
echo "Checked ${#BAD_PATTERNS[@]} patterns across $(echo "$FILES" | wc -w | tr -d ' ') files."
exit 0
