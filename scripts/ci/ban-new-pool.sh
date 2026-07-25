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

# Scan ALL of server/ and exclude what is not runtime, rather than listing the
# directories to include.
#
# The previous version named ten directories. `server/` has ~35, so
# server/src (which holds live routers such as stability.router.ts),
# server/bootstrap, server/startup, server/lib, server/controllers, server/jobs,
# server/pipelines, server/events and server/integrations were all outside the
# guard — a `new Pool(` in any of them passed. It also listed
# `server/repositories`, which does not exist, so every run printed an rg error
# to stderr while still reporting success; guard output that is routinely noisy
# is guard output nobody reads.
#
# An include-list silently fails to cover new directories. A deny-list covers
# them by default and has to be widened deliberately.
SEARCH_DIRS=("server")

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
  --glob '!server/tests/**' \
  --glob '!server/test/**' \
  --glob '!**/_archive/**' \
  --glob '!**/_deprecated/**' \
  --glob '!**/*.d.ts' \
  `# One-off CLI utilities (import/export, run-sql). They are invoked by hand,` \
  `# never on a request path, and legitimately open their own connection.` \
  --glob '!server/scripts/**' \
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
