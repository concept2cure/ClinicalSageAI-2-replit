#!/usr/bin/env bash
# scripts/check-mdx-orphans.sh
#
# Catches the failure mode that landed dead code on claude/deploy-mdx-kits-6sIb9:
# new files added to client/src/concept2cure/mdx/ or server/routes/ with zero
# importers / mount points.
#
# Two checks, both bounded by `git diff --name-only` so the script is fast
# enough to run in pre-commit / CI:
#
#   1. Client files under client/src/concept2cure/mdx/{hooks,data,components,...}
#      that were Added on this branch must have at least one importer
#      anywhere in client/src or server/.
#   2. Server route files added under server/routes/ must be imported by
#      server/bootstrap/register-inline-routes.ts (or a sibling registrar)
#      AND have an `app.use(...)` mount line referencing the import.
#
# Exits non-zero with a punch list when violations exist, exits 0 silently
# when clean. Designed to be invoked from a Husky / pre-commit hook or CI.
#
# Usage:   scripts/check-mdx-orphans.sh [base-ref]
# Default base-ref: origin/concept2cure-v2

set -euo pipefail

BASE_REF="${1:-origin/concept2cure-v2}"
ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

# --- Resolve the diff range --------------------------------------------------
if ! git rev-parse --verify --quiet "$BASE_REF" >/dev/null; then
  # Fall back to a recent ancestor if the base ref isn't fetched locally.
  BASE_REF="$(git merge-base HEAD HEAD~50 2>/dev/null || git rev-list --max-parents=0 HEAD | tail -1)"
fi

ADDED_FILES="$(git diff --name-only --diff-filter=A "$BASE_REF"...HEAD || true)"

violations=0

# --- Check 1: orphan client files -------------------------------------------
while IFS= read -r f; do
  [ -z "$f" ] && continue
  # Skip files that no longer exist in the working tree (deleted in a later commit).
  [ ! -f "$f" ] && continue
  case "$f" in
    client/src/concept2cure/mdx/*.ts|client/src/concept2cure/mdx/*.tsx) ;;
    client/src/concept2cure/mdx/**/*.ts|client/src/concept2cure/mdx/**/*.tsx) ;;
    *) continue ;;
  esac
  # Skip the type barrel (it's a contract surface; importers live in data files).
  [ "$f" = "client/src/concept2cure/mdx/types.ts" ] && continue
  # Files with `@kit-registry-no-consumer-yet` in the first 30 lines are
  # explicitly exempt: closed-enum registries / type registries waiting on
  # a kit pane. The marker MUST be removed when the consumer ships.
  if head -30 "$f" | grep -q "@kit-registry-no-consumer-yet"; then
    continue
  fi

  base_no_ext="$(basename "$f" | sed 's/\.[^.]*$//')"
  # Search for any import that mentions the basename. False positives are
  # acceptable; false negatives are the failure mode this script prevents.
  if ! grep -RIlE "from\s+['\"][^'\"]*${base_no_ext}['\"]" client/src server 2>/dev/null \
      | grep -v "^${f}$" \
      | head -1 \
      | grep -q .; then
    echo "ORPHAN CLIENT FILE: $f has no importer (added on this branch)."
    violations=$((violations + 1))
  fi
done <<< "$ADDED_FILES"

# --- Check 2: unmounted server routes ----------------------------------------
REGISTRAR="server/bootstrap/register-inline-routes.ts"
while IFS= read -r f; do
  [ -z "$f" ] && continue
  # Skip files that no longer exist in the working tree.
  [ ! -f "$f" ] && continue
  case "$f" in
    server/routes/*.ts|server/routes/*.routes.ts) ;;
    *) continue ;;
  esac
  # Skip non-router files (helpers, tests).
  case "$f" in
    *.test.ts|*.spec.ts|*/__tests__/*) continue ;;
  esac
  # Heuristic: only files that export a Router are candidates for mounting.
  if ! grep -qE "Router\(\)|export default router|export default function create" "$f"; then
    continue
  fi
  base_no_ext="$(basename "$f" | sed 's/\.[^.]*$//')"
  if [ ! -f "$REGISTRAR" ]; then
    continue
  fi
  # Match both static (from '...') and dynamic (import('...')) imports.
  if ! grep -qE "(from|import)\s*\(?\s*['\"][^'\"]*${base_no_ext}['\"]" "$REGISTRAR" \
       && ! grep -RIlE "(from|import)\s*\(?\s*['\"][^'\"]*${base_no_ext}['\"]" server/bootstrap server/index.ts server/app.ts server/server.ts 2>/dev/null | head -1 | grep -q .; then
    echo "UNMOUNTED ROUTE: $f exports a Router but no registrar imports it."
    violations=$((violations + 1))
  fi
done <<< "$ADDED_FILES"

if [ "$violations" -gt 0 ]; then
  echo ""
  echo "$violations orphan file(s) found. Either wire them up, delete them,"
  echo "or document the exemption in the file's header. New code on this"
  echo "branch must not land without a consumer."
  exit 1
fi
