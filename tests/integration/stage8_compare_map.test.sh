#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="$ROOT_DIR/scripts/integration/stage8_compare_map.sh"

TMP_DIR="$(mktemp -d)"
cleanup() { rm -rf "$TMP_DIR"; }
trap cleanup EXIT

cd "$TMP_DIR"
git init -q
git config user.email "stage8@test.local"
git config user.name "stage8-test"

echo "base" > shared.txt
git add shared.txt
git commit -q -m "base"
git branch concept2cure-v2

git checkout -q -b cursor/critical-files-management-f38a concept2cure-v2
echo "cleanup" >> shared.txt
echo "cleanup" > cleanup-only.txt
git add shared.txt cleanup-only.txt
git commit -q -m "cleanup change"

git checkout -q concept2cure-v2
echo "base" > base-only.txt
git add base-only.txt
git commit -q -m "base change"

OUTPUT="$($SCRIPT concept2cure-v2 cursor/critical-files-management-f38a)"

echo "$OUTPUT" | grep -q "# Stage 8 compare"
echo "$OUTPUT" | grep -q "## ahead/behind"
echo "$OUTPUT" | grep -q "base-only.txt"
echo "$OUTPUT" | grep -q "cleanup-only.txt"
echo "$OUTPUT" | grep -q "shared.txt"

echo "stage8_compare_map.test.sh: PASS"
