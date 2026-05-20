#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

# We enforce: no `new Pool(` (or `new pg.Pool(`) anywhere in runtime code,
# except the canonical DB module(s).
ALLOWLIST_FILES=(
  "server/db.ts"
  "server/db/pool.ts"
  "server/db/runtime.ts"
  "server/db/ensureCoreTables.ts"
  "server/utils/database.js"
)

# Search runtime-hot code only. (Avoid scripts, migrations, archives.)
SEARCH_DIRS=(
  "server/routes"
  "server/services"
  "server/workers"
  "server/api"
  "server/middleware"
  "server/repositories"
  "server/utils"
  "server/database"
  "server/db"
)

PATTERN="new[[:space:]]+([a-zA-Z0-9_]*\.)?Pool[[:space:]]*\("

HITS="$(rg -n --hidden --no-ignore-vcs \
  --glob '!**/node_modules/**' \
  --glob '!**/.venv/**' \
  --glob '!**/dist/**' \
  --glob '!**/build/**' \
  --glob '!**/.git/**' \
  --glob '!**/__tests__/**' \
  --glob '!**/*.test.ts' \
  --glob '!**/*.test.js' \
  --glob '!**/*.spec.ts' \
  --glob '!**/*.spec.js' \
  "$PATTERN" "${SEARCH_DIRS[@]}" || true)"

if [[ -z "${HITS}" ]]; then
  echo "✅ ban-new-pool: no direct Pool construction found in runtime code."
  exit 0
fi

BAD=()

while IFS= read -r line; do
  [[ -z "$line" ]] && continue
  file="${line%%:*}"

  allowed=false
  for a in "${ALLOWLIST_FILES[@]}"; do
    if [[ "$file" == "$a" ]]; then
      allowed=true
      break
    fi
  done

  if [[ "$allowed" == "false" ]]; then
    BAD+=("$line")
  fi
done <<< "$HITS"

if (( ${#BAD[@]} > 0 )); then
  echo "❌ ban-new-pool: found forbidden direct Pool construction:"
  printf '%s\n' "${BAD[@]}"
  echo ""
  echo "Fix: import the canonical singleton pool from server/db.ts (or db/pool.ts wrapper)."
  exit 1
fi

echo "✅ ban-new-pool: only allowlisted Pool constructions found."
