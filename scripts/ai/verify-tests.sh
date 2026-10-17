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

CHANGED_STATUS=$(node scripts/ai/changed-source-files.mjs)
CHANGED=$(printf '%s\n' "$CHANGED_STATUS" | awk -F '\t' '{print $NF}')
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

ADDED_OR_RENAMED=$(echo "$CHANGED_STATUS" \
  | awk '$1 ~ /^A|^R/ {print $NF}' \
  | grep -E '^(server|client/src|shared)/.*\.(ts|tsx|js|jsx)$' \
  | grep -vE '\.(test|spec)\.' \
  | grep -vE '\.stories\.' \
  | grep -vE "$EXCLUDE_RE" \
  || true)

MISSING_REQUIRED=()
MISSING_WARN=()

# Inventory once and prune excluded trees before walking them. Filename-only
# matching remains a presence check; execution evidence comes from test runs.
if command -v rg >/dev/null; then
  COMPANION_NAMES=$(rg --files --hidden --no-ignore \
    -g '*.{test,spec}.*' \
    -g '!node_modules/**' -g '!dist/**' -g '!coverage/**' \
    -g '!_deprecated*/**' -g '!.worktrees/**' -g '!.ai/**' -g '!.git/**' \
    | awk -F / '{print $NF}' || true)
else
  COMPANION_NAMES=$(find . \( -path './node_modules' -o -path './dist' -o -path './coverage' \
    -o -path './_deprecated*' -o -path './.worktrees' -o -path './.ai' -o -path './.git' \) \
    -prune -o -type f \( -name '*.test.*' -o -name '*.spec.*' \) -print | awk -F / '{print $NF}')
fi

for file in $SRC_FILES; do
  base=$(basename "$file")
  name="${base%.*}"
  if ! awk -v name="$name" 'index($0,name ".test.")==1 || index($0,name ".spec.")==1 {found=1; exit} END {exit !found}' <<< "$COMPANION_NAMES"; then
    if echo "$ADDED_OR_RENAMED" | grep -qx "$file"; then
      MISSING_REQUIRED+=("$file")
    else
      MISSING_WARN+=("$file")
    fi
  fi
done

if (( ${#MISSING_WARN[@]} > 0 )); then
  echo "Warning: modified files without companion tests (non-blocking):"
  printf ' - %s\n' "${MISSING_WARN[@]}"
fi

if (( ${#MISSING_REQUIRED[@]} > 0 )); then
  echo "Missing corresponding tests for:"
  printf ' - %s\n' "${MISSING_REQUIRED[@]}"
  if [[ "${VERIFY_TESTS_STRICT:-false}" == "true" ]]; then
    exit 1
  fi
  echo "VERIFY_TESTS_STRICT is not enabled; continuing with warning-only mode."
fi

echo "Companion-file scan complete. This scan does not execute or qualify tests."
