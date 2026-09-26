#!/usr/bin/env bash
# Verifies docs/security/PEN_TEST_SCOPE_2026-09-26.md against the working tree.
#
# Check 1 — every `path:line` citation in the document names a file that exists
#           and a line that exists in it.
# Check 2 — every mount named in routes-to-verify.txt (route<TAB>file<TAB>line[-line])
#           appears verbatim within the cited line range of that file.
#
# Usage: verify-scope-citations.sh [routes-file]   (default: routes-to-verify.txt beside this script)
# Exit 0 when every check passes, 1 otherwise. Prints one line per failure and a summary.
set -u
here="$(cd "$(dirname "$0")" && pwd)"
root="$(git -C "$here" rev-parse --show-toplevel)"
doc="$root/docs/security/PEN_TEST_SCOPE_2026-09-26.md"
routes="${1:-$here/routes-to-verify.txt}"
fail=0; cites=0; mounts=0

# Check 1: citations of the form file.ext:NN or file.ext:NN-MM or file.ext:NN,MM (first number checked; every number checked)
while IFS= read -r cite; do
  file="${cite%%:*}"; nums="${cite#*:}"
  cites=$((cites+1))
  if [ ! -f "$root/$file" ]; then echo "CITATION FILE MISSING  $cite"; fail=$((fail+1)); continue; fi
  total=$(wc -l < "$root/$file")
  for n in $(echo "$nums" | tr ',-' '  '); do
    if [ "$n" -gt "$total" ] 2>/dev/null; then echo "CITATION LINE BEYOND EOF ($total)  $cite"; fail=$((fail+1)); fi
  done
done < <(grep -oE '\b(server|shared|client|scripts|terraform|db|docs|migrations)/[A-Za-z0-9_./-]+\.(ts|tsx|js|mjs|tf|sql|md|json):[0-9]+([,-][0-9]+)*' "$doc" | sort -u)

# Check 2: mounts
while IFS=$'\t' read -r route file range; do
  [ -z "${route:-}" ] && continue; case "$route" in \#*) continue;; esac
  mounts=$((mounts+1))
  if [ ! -f "$root/$file" ]; then echo "MOUNT FILE MISSING     $route  $file"; fail=$((fail+1)); continue; fi
  start="${range%%-*}"; end="${range##*-}"
  if ! sed -n "${start},${end}p" "$root/$file" | grep -qF -- "$route"; then
    echo "MOUNT NOT AT CITED LINE  $route  $file:$range"; fail=$((fail+1))
  fi
done < "$routes"

echo "citations checked: $cites  mounts checked: $mounts  failures: $fail"
[ "$fail" -eq 0 ] && { echo "exit=0"; exit 0; } || { echo "exit=1"; exit 1; }
