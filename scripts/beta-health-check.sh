#!/bin/bash
#
# Beta Health Check — pre-flight verification for beta environments
#
# Usage: ./scripts/beta-health-check.sh [base_url]
# Default base_url: http://localhost:5000
#
# Checks:
#   1. App is reachable
#   2. Health endpoint responds
#   3. Auth endpoint responds
#   4. Concept2Cure API responds
#   5. AnA RI health responds
#   6. Client build artifacts exist
#   7. Beta-critical tests pass
#

set -e

BASE_URL="${1:-http://localhost:5000}"
PASS=0
FAIL=0
WARN=0

green() { echo -e "\033[32m✓ $1\033[0m"; PASS=$((PASS + 1)); }
red()   { echo -e "\033[31m✗ $1\033[0m"; FAIL=$((FAIL + 1)); }
yellow(){ echo -e "\033[33m⚠ $1\033[0m"; WARN=$((WARN + 1)); }

echo "═══════════════════════════════════════════════════"
echo " Concept2Cure Beta Health Check"
echo " Base URL: $BASE_URL"
echo " Date: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "═══════════════════════════════════════════════════"
echo

# 1. App reachable
echo "── Network ──"
if curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$BASE_URL" | grep -qE "^(200|301|302)$"; then
  green "App is reachable at $BASE_URL"
else
  red "App is NOT reachable at $BASE_URL"
fi

# 2. Health endpoint
if curl -s --max-time 5 "$BASE_URL/api/health" | grep -qi "ok\|healthy\|status"; then
  green "Health endpoint responds"
else
  yellow "Health endpoint did not return expected response"
fi

# 3. Auth endpoint
AUTH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$BASE_URL/api/auth/login" -X POST -H "Content-Type: application/json" -d '{}')
if [ "$AUTH_STATUS" != "000" ]; then
  green "Auth endpoint responds (HTTP $AUTH_STATUS)"
else
  red "Auth endpoint is unreachable"
fi

# 4. Concept2Cure API
C2C_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$BASE_URL/api/concept2cure/projects" -H "Authorization: Bearer invalid")
if [ "$C2C_STATUS" = "401" ] || [ "$C2C_STATUS" = "403" ]; then
  green "Concept2Cure API responds (auth enforced, HTTP $C2C_STATUS)"
elif [ "$C2C_STATUS" != "000" ]; then
  yellow "Concept2Cure API responds but unexpected status: $C2C_STATUS"
else
  red "Concept2Cure API is unreachable"
fi

# 5. AnA RI health
ANA_HEALTH=$(curl -s --max-time 5 "$BASE_URL/api/ana-ri/health" 2>/dev/null)
if echo "$ANA_HEALTH" | grep -qi "healthy\|degraded\|status"; then
  green "AnA RI health endpoint responds"
else
  yellow "AnA RI health endpoint did not return expected response"
fi

echo
echo "── Build Artifacts ──"

# 6. Client build
if [ -d "dist/public" ] && [ "$(ls -A dist/public/assets/*.js 2>/dev/null | wc -l)" -gt 5 ]; then
  JS_COUNT=$(ls dist/public/assets/*.js 2>/dev/null | wc -l)
  green "Client build exists ($JS_COUNT JS chunks)"
else
  yellow "No client build found — run 'npm run build' for production"
fi

echo
echo "── Beta-Critical Tests ──"

# 7. Contract tests
if npx vitest run tests/routes/ai-entry-point-contract.test.ts --reporter=dot 2>&1 | grep -q "passed"; then
  green "AI entry-point contract tests pass"
else
  red "AI entry-point contract tests failed"
fi

# 8. Guided demo contract
if npx vitest run tests/guided-demo-path.test.ts --reporter=dot 2>&1 | grep -q "passed"; then
  green "Guided demo path contract tests pass"
else
  red "Guided demo path contract tests failed"
fi

# 9. Auth tests
if npx vitest run tests/services/roleBasedAccess.test.ts tests/services/mfaService.test.ts --reporter=dot 2>&1 | grep -q "passed"; then
  green "Auth (RBAC + MFA) tests pass"
else
  red "Auth tests failed"
fi

# 10. AnA RI health tests
if npx vitest run tests/routes/ana-ri-health.test.ts --reporter=dot 2>&1 | grep -q "passed"; then
  green "AnA RI health tests pass"
else
  red "AnA RI health tests failed"
fi

echo
echo "═══════════════════════════════════════════════════"
echo " Results: $PASS passed, $FAIL failed, $WARN warnings"
echo "═══════════════════════════════════════════════════"

if [ "$FAIL" -gt 0 ]; then
  echo
  echo "❌ Beta health check FAILED — fix red items before proceeding"
  exit 1
else
  echo
  echo "✅ Beta health check PASSED"
  exit 0
fi
