#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
cd "$ROOT"

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

SRC_FILES=$(echo "$CHANGED" | grep -E '^(server|client/src|shared)/.*\.(ts|tsx|js|jsx)$' | grep -vE '\.(test|spec)\.' | grep -vE '\.stories\.' || true)
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
