#!/usr/bin/env bash
# Scoped tsc for S5, run from the repository root. The repo tsconfig cannot be narrowed to a few files without
# losing some of its ambient declarations, so a narrowed run reports errors in files S5 never touched. This script
# therefore runs each half three times and compares: (1) now; (2) with the S5 sources swapped back to HEAD (restored
# and md5-checked after); (3) now, with one planted type error in an S5 file (restored and md5-checked after).
# S5 adds no type error when (1) and (2) list the same errors; the check reaches S5's files when (3) adds the plant.
set -u
D=docs/evidence/ANA-SUMMARY/2026-10-08/S5-task-attribution
HALF=$1            # server | client
PLANT=$2           # an S5 source file to plant the error in
SWAP=$3            # the S5 sources of this half, space-separated
export NODE_OPTIONS=--max-old-space-size=6000
run() { npx tsc -p "$D/scoped-tsc-$HALF.json" 2>&1 | grep -E '^[a-zA-Z].*error TS' | sort; }
run > "$D/tsc-$HALF-now.txt"
mkdir -p /tmp/s5-tsc; : > /tmp/s5-tsc/sums
for f in $SWAP; do cp "$f" "/tmp/s5-tsc/$(echo "$f" | tr / _)"; md5sum "$f" >> /tmp/s5-tsc/sums; git show "HEAD:$f" > "$f"; done
run > "$D/tsc-$HALF-head.txt"
for f in $SWAP; do cp "/tmp/s5-tsc/$(echo "$f" | tr / _)" "$f"; done
md5sum -c /tmp/s5-tsc/sums > "$D/tsc-$HALF-restored.txt"
sum=$(md5sum "$PLANT" | cut -d' ' -f1); cp "$PLANT" /tmp/s5-tsc/plant.bak
printf '\nexport const s5Planted: number = "not a number";\n' >> "$PLANT"
run > "$D/tsc-$HALF-planted.txt"
cp /tmp/s5-tsc/plant.bak "$PLANT"
[ "$(md5sum "$PLANT" | cut -d' ' -f1)" = "$sum" ] && echo "$PLANT: plant removed, md5 OK" >> "$D/tsc-$HALF-restored.txt"
rm -rf /tmp/s5-tsc
{ echo "now: $(wc -l < "$D/tsc-$HALF-now.txt") errors; HEAD sources: $(wc -l < "$D/tsc-$HALF-head.txt") errors"
  echo "diff now vs HEAD sources (empty = S5 adds none):"; diff "$D/tsc-$HALF-head.txt" "$D/tsc-$HALF-now.txt"
  echo "diff now vs planted (the plant must appear):"; diff "$D/tsc-$HALF-now.txt" "$D/tsc-$HALF-planted.txt"; } > "$D/tsc-$HALF-summary.txt"
cat "$D/tsc-$HALF-summary.txt"
