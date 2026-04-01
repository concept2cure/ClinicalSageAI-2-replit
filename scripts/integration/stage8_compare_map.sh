#!/usr/bin/env bash
set -euo pipefail

BASE_REF="${1:-concept2cure-v2}"
CLEANUP_REF="${2:-cursor/critical-files-management-f38a}"

if ! git rev-parse --verify "$BASE_REF" >/dev/null 2>&1; then
  echo "ERROR: missing ref '$BASE_REF'" >&2
  exit 2
fi

if ! git rev-parse --verify "$CLEANUP_REF" >/dev/null 2>&1; then
  echo "ERROR: missing ref '$CLEANUP_REF'" >&2
  exit 3
fi

MERGE_BASE="$(git merge-base "$BASE_REF" "$CLEANUP_REF")"

echo "# Stage 8 compare"
echo "base=$BASE_REF"
echo "cleanup=$CLEANUP_REF"
echo "merge_base=$MERGE_BASE"
echo
echo "## ahead/behind (base cleanup)"
git rev-list --left-right --count "$BASE_REF...$CLEANUP_REF"
echo
echo "## changed files (name-status)"
git diff --name-status "$BASE_REF...$CLEANUP_REF"
echo
echo "## files changed only on base since merge-base"
git diff --name-only "$MERGE_BASE..$BASE_REF" | sort -u
echo
echo "## files changed only on cleanup since merge-base"
git diff --name-only "$MERGE_BASE..$CLEANUP_REF" | sort -u
echo
echo "## files changed on both branches since merge-base"
comm -12 \
  <(git diff --name-only "$MERGE_BASE..$BASE_REF" | sort -u) \
  <(git diff --name-only "$MERGE_BASE..$CLEANUP_REF" | sort -u)
