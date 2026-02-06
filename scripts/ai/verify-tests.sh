#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
cd "$ROOT"

# ── Label-based skip ─────────────────────────────────────────────────────────
# If the PR has `ci:skip-test-check` label, skip entirely.
# GITHUB_EVENT_PATH is set by Actions; parse labels from the event JSON.
if [[ -n "${GITHUB_EVENT_PATH:-}" ]] && command -v jq &>/dev/null; then
  LABELS=$(jq -r '.pull_request.labels[]?.name // empty' "$GITHUB_EVENT_PATH" 2>/dev/null || true)
  if echo "$LABELS" | grep -qx 'ci:skip-test-check'; then
    echo "Label ci:skip-test-check found — skipping test presence check."
    exit 0
  fi
fi

BASE_REF=${GITHUB_BASE_REF:-}
if [[ -n "$BASE_REF" ]]; then
  BASE="origin/$BASE_REF"
elif git rev-parse --verify origin/main >/dev/null 2>&1; then
  BASE="origin/main"
else
  BASE="HEAD~1"
fi

CHANGED=$(git diff --name-only "$BASE"...HEAD || true)
if [[ -z "$CHANGED" ]]; then
  echo "No changes detected."
  exit 0
fi

# ── Path exclusions ──────────────────────────────────────────────────────────
# Files matching these patterns are infrastructure / config / setup and
# do not require companion test files.
EXCLUDE_PATTERNS=(
  '^server/db/'                         # DB setup / pool init files
  '^server/routes/.*deprecated'         # deprecated route files
  '^server/routes/510k-'                # legacy 510(k) routes (deprecated)
  '/middleware\.'                        # middleware wiring
  '/config\.'                           # config files
  '/types\.'                            # type-only files
  '\.d\.ts$'                            # TypeScript declaration files
)

# Build a single grep -E pattern from the exclusions
EXCLUDE_RE=$(IFS='|'; echo "${EXCLUDE_PATTERNS[*]}")

SRC_FILES=$(echo "$CHANGED" \
  | grep -E '^(server|client/src|shared)/.*\.(ts|tsx|js|jsx)$' \
  | grep -vE '\.(test|spec)\.' \
  | grep -vE '\.stories\.' \
  | grep -vE "$EXCLUDE_RE" \
  || true)

if [[ -z "$SRC_FILES" ]]; then
  echo "No source files requiring test verification."
  exit 0
fi

MISSING=()
for file in $SRC_FILES; do
  base=$(basename "$file")
  name="${base%.*}"
  if ! find . \
    -type f \
    \( -name "${name}.test.*" -o -name "${name}.spec.*" \) \
    -not -path "./node_modules/*" \
    -not -path "./dist/*" \
    -not -path "./coverage/*" \
    -not -path "./_deprecated*" \
    -not -path "./.worktrees/*" \
    -not -path "./.ai/*" \
    | grep -q .; then
    MISSING+=("$file")
  fi
done

if (( ${#MISSING[@]} > 0 )); then
  echo "Missing corresponding tests for:"
  printf ' - %s\n' "${MISSING[@]}"
  exit 1
fi

echo "Test presence verified for changed source files."
