#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

# ─────────────────────────────────────────────────────────────────────────────
# WHY THIS SCRIPT NO LONGER USES ripgrep
#
# It used to run `rg ... || true`. The `|| true` is needed because rg exits 1
# when it matches nothing and `set -e` would abort a clean run — but it swallows
# EVERY rg failure identically, including "rg is not installed", which produces
# an empty result set and the cheerful "✅ no direct Pool construction found".
#
# That is not hypothetical. ripgrep is NOT installed on this repo's Lint runner:
#
#   Run scripts/ci/ban-new-pool.sh
#   ✅ ban-new-pool: no direct Pool construction found in runtime code.
#
# was printed on every build while `server/db/bootstrap/index.ts:38` had been
# constructing a Pool since #1307 — a violation the same script reports
# immediately when run on a machine that has rg. The guard was not enforcing
# anything; it was printing a checkmark.
#
# So the dependency is gone rather than asserted: `find` + `grep` are POSIX and
# present wherever bash is. A guard whose prerequisites can be absent will
# eventually run somewhere they are, and the failure mode of the old version was
# to pass. The one remaining prerequisite (grep) is checked below and is fatal —
# never again may this script report success for a scan that did not execute.
# ─────────────────────────────────────────────────────────────────────────────

if ! command -v grep >/dev/null 2>&1; then
  echo "❌ ban-new-pool: grep is unavailable — the scan cannot run."
  echo "   Refusing to report success for a check that did not execute."
  exit 1
fi

# We enforce: no `new Pool(` (or `new pg.Pool(`) anywhere in runtime code,
# except the canonical DB module(s).
ALLOWLIST_FILES=(
  "server/db.ts"
  # "server/db/pool.ts" removed — deleted in 85616c46f. This script's own header
  # records the same shape (an allowlisted "server/repositories" that did not
  # exist); a dead entry here pre-approves a raw `new Pool(` in any future file
  # at that very plausible path.
  "server/db/runtime.ts"
  "server/db/ensureCoreTables.ts"
  "server/utils/database.js"
  # The OWNER connection, which is a different role from the runtime pool this
  # guard steers everything else toward. When APP_DATABASE_URL splits the two,
  # ensureAuthTables must connect as the owner to create tables the
  # non-superuser app_service role is deliberately not allowed to create.
  # server/db/runtime.ts cannot supply that — it is the runtime role by
  # definition — so this is the same kind of exception as ensureCoreTables.ts
  # above, not an unconverted call site.
  "server/db/bootstrap/index.ts"
)

# Scan ALL of server/ and exclude what is not runtime, rather than listing the
# directories to include.
#
# The pre-2026-08 version named ten directories. `server/` has ~35, so
# server/src (which holds live routers such as stability.router.ts),
# server/bootstrap, server/startup, server/lib, server/controllers, server/jobs,
# server/pipelines, server/events and server/integrations were all outside the
# guard — a `new Pool(` in any of them passed. It also listed
# `server/repositories`, which does not exist, so every run printed an error to
# stderr while still reporting success; guard output that is routinely noisy is
# guard output nobody reads.
#
# An include-list silently fails to cover new directories. A deny-list covers
# them by default and has to be widened deliberately.
SEARCH_DIRS=("server")

PATTERN="new[[:space:]]+([a-zA-Z0-9_]*\.)?Pool[[:space:]]*\("

# Candidate files: everything under server/ except vendored trees, test code,
# type declarations, and hand-run CLI utilities. Pruned during traversal rather
# than filtered afterwards so node_modules is never walked.
FILES="$(find "${SEARCH_DIRS[@]}" \
  \( -type d \( \
       -name node_modules -o -name .venv -o -name dist -o -name build \
    -o -name .git -o -name __tests__ -o -name _archive -o -name _deprecated \
  \) -prune \) -o \
  -type f \( -name '*.ts' -o -name '*.js' -o -name '*.mts' -o -name '*.cts' -o -name '*.mjs' -o -name '*.cjs' \) -print \
  | grep -vE '\.(test|spec)\.(ts|js|mts|cts|mjs|cjs)$' \
  | grep -vE '\.d\.ts$' \
  | grep -vE '^server/(tests|test)/' \
  `# One-off CLI utilities (import/export, run-sql). They are invoked by hand,` \
  `# never on a request path, and legitimately open their own connection.` \
  | grep -vE '^server/scripts/' \
  || true)"

if [[ -z "${FILES}" ]]; then
  echo "❌ ban-new-pool: no source files matched under ${SEARCH_DIRS[*]}."
  echo "   That is a broken scan, not a clean tree — refusing to pass."
  exit 1
fi

# `grep -n` over the file list. Exit status 1 means "no matches", which is the
# good case here; any other non-zero status is a real failure and must not be
# mistaken for a clean run.
set +e
HITS="$(printf '%s\n' "${FILES}" | xargs grep -nE "${PATTERN}" 2>/dev/null)"
GREP_STATUS=$?
set -e

if (( GREP_STATUS > 1 )); then
  echo "❌ ban-new-pool: grep exited ${GREP_STATUS} — the scan did not complete."
  exit 1
fi

if [[ -z "${HITS}" ]]; then
  echo "✅ ban-new-pool: no direct Pool construction found in runtime code."
  echo "   (scanned $(printf '%s\n' "${FILES}" | wc -l | tr -d ' ') files)"
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
echo "   (scanned $(printf '%s\n' "${FILES}" | wc -l | tr -d ' ') files)"
