#!/bin/bash
# ============================================================================
# UI State Governance — Inline Pattern Ratchet Check
# ============================================================================
# This script counts inline loading/error anti-patterns in concept2cure/.
# Run in CI to prevent the count from increasing.
#
# Usage:
#   ./scripts/check-inline-state-patterns.sh          # Count and report
#   ./scripts/check-inline-state-patterns.sh --strict  # Fail if above baseline
#
# Baseline is stored in scripts/.inline-state-baseline
# Update baseline after each migration batch:
#   ./scripts/check-inline-state-patterns.sh --update-baseline
# ============================================================================

set -euo pipefail

SEARCH_DIR="client/src/concept2cure"
BASELINE_FILE="scripts/.inline-state-baseline"
STRICT_MODE="${1:-}"

echo "=== UI State Governance — Inline Pattern Audit ==="
echo ""

# Count each anti-pattern category
count_pattern() {
  local result
  result=$(eval "$1" 2>/dev/null | wc -l | tr -d '[:space:]')
  echo "${result:-0}"
}

LOADER2_COUNT=$(count_pattern "grep -rn 'Loader2' --include='*.tsx' '$SEARCH_DIR' | grep -v 'import'")
ANIMATE_SPIN_COUNT=$(count_pattern "grep -rn 'animate-spin' --include='*.tsx' '$SEARCH_DIR' | grep -v 'statesV2\|spinner\|states\.tsx'")
ISLOADING_INLINE=$(count_pattern "grep -rn 'isLoading &&' --include='*.tsx' '$SEARCH_DIR'")
ISLOADING_TERNARY=$(count_pattern "grep -rn 'isLoading ?' --include='*.tsx' '$SEARCH_DIR'")
RAW_FETCH=$(count_pattern "grep -rn 'await fetch(' --include='*.tsx' --include='*.ts' '$SEARCH_DIR' | grep -v 'apiRequest\|node_modules'")
GET_AUTH_HEADERS=$(count_pattern "grep -rn 'getAuthHeaders' --include='*.tsx' --include='*.ts' '$SEARCH_DIR' | grep -v 'import'")
SILENT_CATCH=$(count_pattern "grep -rn 'catch {' --include='*.tsx' --include='*.ts' '$SEARCH_DIR'")
DEPRECATED_IMPORT=$(count_pattern "grep -rn 'from.*components/ui/states'\'' ' --include='*.tsx' '$SEARCH_DIR' | grep -v 'statesV2'")

TOTAL=$((LOADER2_COUNT + ANIMATE_SPIN_COUNT + ISLOADING_INLINE + ISLOADING_TERNARY + RAW_FETCH + GET_AUTH_HEADERS + SILENT_CATCH + DEPRECATED_IMPORT))

echo "Pattern                    Count"
echo "─────────────────────────  ─────"
printf "%-27s %s\n" "Loader2 in JSX" "$LOADER2_COUNT"
printf "%-27s %s\n" "animate-spin (manual)" "$ANIMATE_SPIN_COUNT"
printf "%-27s %s\n" "{isLoading && ...}" "$ISLOADING_INLINE"
printf "%-27s %s\n" "{isLoading ? ...}" "$ISLOADING_TERNARY"
printf "%-27s %s\n" "Raw fetch() calls" "$RAW_FETCH"
printf "%-27s %s\n" "getAuthHeaders()" "$GET_AUTH_HEADERS"
printf "%-27s %s\n" "Silent catch {}" "$SILENT_CATCH"
printf "%-27s %s\n" "Deprecated states import" "$DEPRECATED_IMPORT"
echo "─────────────────────────  ─────"
printf "%-27s %s\n" "TOTAL" "$TOTAL"
echo ""

if [ "$STRICT_MODE" = "--update-baseline" ]; then
  echo "$TOTAL" > "$BASELINE_FILE"
  echo "Baseline updated to $TOTAL"
  exit 0
fi

if [ "$STRICT_MODE" = "--strict" ]; then
  if [ -f "$BASELINE_FILE" ]; then
    BASELINE=$(cat "$BASELINE_FILE")
    echo "Baseline: $BASELINE"
    echo "Current:  $TOTAL"
    if [ "$TOTAL" -gt "$BASELINE" ]; then
      echo ""
      echo "FAIL: Inline state pattern count increased ($BASELINE → $TOTAL)."
      echo "New inline loading/error patterns are banned."
      echo "Use components from @/components/ui/statesV2 instead."
      exit 1
    else
      DELTA=$((BASELINE - TOTAL))
      echo "PASS: Count reduced by $DELTA (or unchanged)."
      exit 0
    fi
  else
    echo "No baseline file found. Run with --update-baseline first."
    exit 1
  fi
fi
