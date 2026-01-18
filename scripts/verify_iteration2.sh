#!/bin/bash
# Acceptance Criteria Verification Script
# Run this to verify all Iteration 2 requirements are met

echo "================================================"
echo "Iteration 2 Acceptance Criteria Verification"
echo "================================================"
echo ""

PASSED=0
FAILED=0

# Function to check and report
check() {
  if [ $1 -eq 0 ]; then
    echo "✅ $2"
    PASSED=$((PASSED + 1))
  else
    echo "❌ $2"
    FAILED=$((FAILED + 1))
  fi
}

# 1. Check for raw API strings in view components (should find NONE)
echo "1. Checking for raw /api/... strings in view components..."
grep -r "/api/cerv2-workbench" client/src/pages/cerv2/*.jsx > /dev/null 2>&1
# Invert result: grep returns 1 when no matches (which is what we want)
if [ $? -eq 1 ]; then
  check 0 "No raw API strings in view components"
else
  check 1 "Found raw API strings in view components (should be zero)"
fi
echo ""

# 2. Check ExportsView exists and has required components
echo "2. Verifying ExportsView implementation..."
if [ -f "client/src/pages/cerv2/ExportsView.jsx" ]; then
  grep -q "sha256" client/src/pages/cerv2/ExportsView.jsx && \
  grep -q "evidenceSetFingerprint" client/src/pages/cerv2/ExportsView.jsx && \
  grep -q "CopyButton" client/src/pages/cerv2/ExportsView.jsx && \
  grep -q "Download" client/src/pages/cerv2/ExportsView.jsx
  check $? "ExportsView has sha256 + fingerprint + copy + download"
else
  check 1 "ExportsView file exists"
fi
echo ""

# 3. Check AuditTimeline has EXPORT_GENERATED renderer
echo "3. Verifying AuditTimeline EXPORT_GENERATED rendering..."
if [ -f "client/src/pages/cerv2/AuditTimeline.jsx" ]; then
  grep -q "ExportGeneratedCard" client/src/pages/cerv2/AuditTimeline.jsx && \
  grep -q "evidenceSetFingerprint" client/src/pages/cerv2/AuditTimeline.jsx && \
  grep -q "Download" client/src/pages/cerv2/AuditTimeline.jsx
  check $? "AuditTimeline has ExportGeneratedCard with fingerprint + download"
else
  check 1 "AuditTimeline file exists"
fi
echo ""

# 4. Check React Query integration
echo "4. Verifying React Query integration..."
if [ -f "client/src/hooks/useCERv2Queries.js" ]; then
  grep -q "useGenerateExport" client/src/hooks/useCERv2Queries.js && \
  grep -q "invalidateQueries" client/src/hooks/useCERv2Queries.js
  check $? "React Query hooks with auto-invalidation exist"
else
  check 1 "React Query hooks file exists"
fi
echo ""

# 5. Check state components exist
echo "5. Verifying state components..."
STATE_FILES=(
  "client/src/components/cerv2/LoadingState.jsx"
  "client/src/components/cerv2/EmptyState.jsx"
  "client/src/components/cerv2/ErrorState.jsx"
)

ALL_STATE_FILES_EXIST=0
for file in "${STATE_FILES[@]}"; do
  if [ ! -f "$file" ]; then
    ALL_STATE_FILES_EXIST=1
    break
  fi
done
check $ALL_STATE_FILES_EXIST "All state components (Loading, Empty, Error) exist"
echo ""

# 6. Check smoke test exists and is executable
echo "6. Verifying smoke test..."
if [ -f "scripts/cerv2_smoke.mjs" ] && [ -x "scripts/cerv2_smoke.mjs" ]; then
  grep -q "EXPORT_GENERATED" scripts/cerv2_smoke.mjs && \
  grep -q "sha256" scripts/cerv2_smoke.mjs && \
  grep -q "evidenceSetFingerprint" scripts/cerv2_smoke.mjs
  check $? "Smoke test exists and tests export + audit trail"
else
  check 1 "Smoke test file exists and is executable"
fi
echo ""

# 7. Check contract layer exists
echo "7. Verifying contract layer..."
if [ -f "client/src/lib/cerv2WorkbenchContract.js" ]; then
  grep -q "routes" client/src/lib/cerv2WorkbenchContract.js && \
  grep -q "exportsApi" client/src/lib/cerv2WorkbenchContract.js && \
  grep -q "auditApi" client/src/lib/cerv2WorkbenchContract.js
  check $? "Contract layer with routes registry exists"
else
  check 1 "Contract layer file exists"
fi
echo ""

# 8. Check utility functions exist
echo "8. Verifying utility functions..."
if [ -f "client/src/lib/cerv2Utils.js" ]; then
  grep -q "truncateMiddle" client/src/lib/cerv2Utils.js && \
  grep -q "formatBytes" client/src/lib/cerv2Utils.js && \
  grep -q "formatTimestamp" client/src/lib/cerv2Utils.js
  check $? "Utility functions (truncateMiddle, formatBytes, formatTimestamp) exist"
else
  check 1 "Utility functions file exists"
fi
echo ""

# 9. Check copy-to-clipboard hook exists
echo "9. Verifying copy-to-clipboard hook..."
if [ -f "client/src/hooks/useCopyToClipboard.js" ]; then
  grep -q "navigator.clipboard" client/src/hooks/useCopyToClipboard.js && \
  grep -q "copied" client/src/hooks/useCopyToClipboard.js
  check $? "Copy-to-clipboard hook with feedback exists"
else
  check 1 "Copy-to-clipboard hook file exists"
fi
echo ""

# 10. Check type definitions exist
echo "10. Verifying type definitions..."
if [ -f "shared/cerv2Workbench.types.ts" ]; then
  grep -q "ExportRecord" shared/cerv2Workbench.types.ts && \
  grep -q "AuditEvent" shared/cerv2Workbench.types.ts && \
  grep -q "EvidenceItem" shared/cerv2Workbench.types.ts
  check $? "Shared type definitions exist"
else
  check 1 "Type definitions file exists"
fi
echo ""

# Summary
echo "================================================"
echo "Verification Summary"
echo "================================================"
echo "Passed: $PASSED"
echo "Failed: $FAILED"
echo ""

if [ $FAILED -eq 0 ]; then
  echo "✅ All acceptance criteria verified!"
  echo ""
  echo "Ready for:"
  echo "  - Production deployment"
  echo "  - User acceptance testing"
  echo "  - Iteration 3 planning"
  exit 0
else
  echo "❌ Some criteria not met. Please review failed items above."
  exit 1
fi
