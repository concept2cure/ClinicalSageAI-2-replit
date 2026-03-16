#!/usr/bin/env bash
# docs/rfi/inventory.sh
# Dumps raw evidence from the repo to docs/rfi/_evidence/
# Run from repo root: bash docs/rfi/inventory.sh

set -euo pipefail
ROOT="$(git rev-parse --show-toplevel)"
OUT="$ROOT/docs/rfi/_evidence"
mkdir -p "$OUT"

echo "==> Commit: $(git rev-parse HEAD)" | tee "$OUT/meta.txt"
echo "==> Date:   $(date -u)" | tee -a "$OUT/meta.txt"

echo ""
echo "--- [1] All server-side route definitions ---"
grep -rn "router\.\(get\|post\|put\|patch\|delete\)" \
  "$ROOT/server/" --include="*.ts" --include="*.js" \
  | grep -v node_modules \
  > "$OUT/routes.txt" 2>/dev/null
echo "  → $(wc -l < "$OUT/routes.txt") route definitions written to _evidence/routes.txt"

echo ""
echo "--- [2] All client-side API calls ---"
grep -rn "fetch(\|axios\.\|/api/" \
  "$ROOT/client/src/" --include="*.ts" --include="*.tsx" \
  | grep -v "node_modules\|\.d\.ts\|// " \
  > "$OUT/client_api_calls.txt" 2>/dev/null
echo "  → $(wc -l < "$OUT/client_api_calls.txt") client API calls written to _evidence/client_api_calls.txt"

echo ""
echo "--- [3] DB migration files ---"
find "$ROOT/db/migrations" -maxdepth 1 -name "*.sql" | sort \
  > "$OUT/migrations.txt"
echo "  → $(wc -l < "$OUT/migrations.txt") active migrations"
find "$ROOT/db/migrations/_legacy" -name "*.sql" 2>/dev/null | sort \
  >> "$OUT/migrations.txt"
TOTAL=$(wc -l < "$OUT/migrations.txt")
echo "  → $TOTAL total (including legacy)"

echo ""
echo "--- [4] Model/API key references in server code ---"
grep -rn "model:\|OPENAI_API_KEY\|ANTHROPIC_API_KEY\|gpt-4\|claude-3\|text-embedding" \
  "$ROOT/server/" --include="*.ts" \
  | grep -v "node_modules\|//\|interface\|type \|\.d\.ts" \
  > "$OUT/model_config.txt" 2>/dev/null
echo "  → $(wc -l < "$OUT/model_config.txt") model/key references written to _evidence/model_config.txt"

echo ""
echo "--- [5] Auth middleware references ---"
grep -rn "requireAuth\|ensureAuth\|isAuthenticated\|jwt\.verify\|tenantContext" \
  "$ROOT/server/" --include="*.ts" \
  | grep -v "node_modules" \
  > "$OUT/auth_middleware.txt" 2>/dev/null
echo "  → $(wc -l < "$OUT/auth_middleware.txt") auth references written to _evidence/auth_middleware.txt"

echo ""
echo "--- [6] Test files ---"
find "$ROOT" -name "*.test.ts" -o -name "*.spec.ts" -o -name "*.test.tsx" \
  | grep -v node_modules | sort \
  > "$OUT/test_files.txt"
echo "  → $(wc -l < "$OUT/test_files.txt") test files written to _evidence/test_files.txt"

echo ""
echo "--- [7] Direct LLM calls OUTSIDE the AI Gateway ---"
grep -rn "new OpenAI\|new Anthropic" "$ROOT/server/" --include="*.ts" \
  | grep -v "node_modules\|ai-gateway\|gateway.ts" \
  > "$OUT/direct_llm_calls.txt" 2>/dev/null
echo "  → $(wc -l < "$OUT/direct_llm_calls.txt") files with direct LLM client instantiation (bypass gateway)"

echo ""
echo "--- [8] RLS policy status (requires live DB) ---"
if command -v psql &>/dev/null && [ -n "${DATABASE_URL:-}" ]; then
  psql "$DATABASE_URL" -c \
    "SELECT relname, relrowsecurity FROM pg_class WHERE relrowsecurity = true ORDER BY relname;" \
    > "$OUT/rls_status.txt" 2>&1
  echo "  → RLS status written to _evidence/rls_status.txt"
else
  echo "  → SKIPPED: no psql or DATABASE_URL not set"
fi

echo ""
echo "Done. Evidence in: $OUT"
echo "Verify with: ls -la $OUT"
