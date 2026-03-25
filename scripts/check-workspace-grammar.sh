#!/usr/bin/env bash
# Workspace Grammar Compliance Check
# Counts bespoke layout patterns in core workflow files that should use canonical primitives.
#
# Usage: bash scripts/check-workspace-grammar.sh

set -euo pipefail

CORE_FILES=(
  "client/src/concept2cure/components/workflow/ProjectHomeDashboard.tsx"
  "client/src/concept2cure/components/workflow/DossierMap.tsx"
  "client/src/concept2cure/components/workflow/SectionWorkspace.tsx"
  "client/src/concept2cure/components/workflow/SubmissionReadiness.tsx"
  "client/src/concept2cure/components/home/PlatformHome.tsx"
)

echo "=== Workspace Grammar Compliance Check ==="
echo ""

violations=0

# Check for local STATUS_CONFIG definitions (should use WORKFLOW_STATUS_CONFIG)
echo "--- Local STATUS_CONFIG definitions (should use WORKFLOW_STATUS_CONFIG) ---"
for f in "${CORE_FILES[@]}"; do
  if [ -f "$f" ]; then
    count=$(grep -c "const STATUS_CONFIG" "$f" 2>/dev/null || true)
    if [ "$count" -gt 0 ]; then
      echo "  VIOLATION: $f defines local STATUS_CONFIG ($count)"
      violations=$((violations + count))
    fi
  fi
done

# Check for local STATUS_ICON definitions (should use STATUS_ICON_MAP)
echo "--- Local STATUS_ICON definitions (should use STATUS_ICON_MAP) ---"
for f in "${CORE_FILES[@]}"; do
  if [ -f "$f" ]; then
    count=$(grep -c "const STATUS_ICON:" "$f" 2>/dev/null || true)
    if [ "$count" -gt 0 ]; then
      echo "  VIOLATION: $f defines local STATUS_ICON ($count)"
      violations=$((violations + count))
    fi
  fi
done

# Check for inline header patterns (should use WorkspaceHeader or WorkspaceHeaderRich)
echo "--- Inline header h-11 patterns (should use WorkspaceHeader) ---"
for f in "${CORE_FILES[@]}"; do
  if [ -f "$f" ]; then
    count=$(grep -c 'className="flex items-center gap-3 px-4 h-11 border-b' "$f" 2>/dev/null || true)
    if [ "$count" -gt 0 ]; then
      echo "  VIOLATION: $f has inline h-11 header ($count)"
      violations=$((violations + count))
    fi
  fi
done

# Check for Loader2 + animate-spin (should use Spinner)
echo "--- Loader2 animate-spin (should use Spinner) ---"
for f in "${CORE_FILES[@]}"; do
  if [ -f "$f" ]; then
    count=$(grep -c "Loader2.*animate-spin\|animate-spin.*Loader2" "$f" 2>/dev/null || true)
    if [ "$count" -gt 0 ]; then
      echo "  VIOLATION: $f uses Loader2 animate-spin ($count)"
      violations=$((violations + count))
    fi
  fi
done

echo ""
echo "Total violations: $violations"
echo ""

if [ "$violations" -eq 0 ]; then
  echo "All core workflow files comply with canonical workspace grammar."
else
  echo "Some core workflow files still have bespoke layout patterns."
fi
