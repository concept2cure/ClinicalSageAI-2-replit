#!/bin/bash
# Run tests against HEAD's version of the given source files, then restore the
# working copies byte for byte (md5 checked). New modules (absent at HEAD) stay.
# Usage: red-swap.sh <files-list> <out> <vitest args...>
set -u
cd /home/user/ClinicalSageAI-2-replit
LIST=$1; OUT=$2; shift 2
KEEP=$(mktemp -d)
while read -r f; do mkdir -p "$KEEP/$(dirname "$f")"; cp -p "$f" "$KEEP/$f"; md5sum "$f" >> "$KEEP/before.md5"; git show HEAD:"$f" > "$f"; done < "$LIST"
{ echo "# red: these files at HEAD ($(git rev-parse --short HEAD)), new modules present:"; sed 's/^/#   /' "$LIST"; } > "$OUT"
RLS_ENFORCE=off NODE_OPTIONS=--max-old-space-size=6000 timeout 1200 npx vitest run "$@" >> "$OUT" 2>&1
while read -r f; do cp -p "$KEEP/$f" "$f"; done < "$LIST"
md5sum -c "$KEEP/before.md5" > "$KEEP/after.txt" 2>&1 && echo "restored: md5 OK" || { echo "RESTORE MISMATCH"; cat "$KEEP/after.txt"; }
