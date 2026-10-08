#!/usr/bin/env bash
# Red for S5: the S5-changed sources swapped back to HEAD, the S5 tests (and the S4 Summary test) run,
# each file restored and checked byte for byte. Run from the repository root.
set -u
OUT=docs/evidence/ANA-SUMMARY/2026-10-08/S5-task-attribution/red/red-sources-at-HEAD.txt
FILES="shared/ana/turn-timeline.ts server/services/ana/turn-timeline-emitter.ts client/src/concept2cure/v2/turnSummaryRows.ts client/src/concept2cure/v2/TurnSummary.tsx"
mkdir -p /tmp/s5-red
for f in $FILES; do cp "$f" "/tmp/s5-red/$(echo "$f" | tr / _)"; md5sum "$f" >> /tmp/s5-red/sums; git show "HEAD:$f" > "$f"; done
{ echo "# HEAD $(git rev-parse --short HEAD); sources at HEAD: $FILES"; echo "# RLS_ENFORCE=off";
  RLS_ENFORCE=off npx vitest run --reporter=verbose \
    server/routes/ana-ri/__tests__/stream-task-attribution.test.ts \
    client/src/concept2cure/v2/__tests__/turnSummaryTasks.test.tsx \
    client/src/concept2cure/v2/__tests__/turnSummary.test.tsx 2>&1; } > "$OUT"
for f in $FILES; do cp "/tmp/s5-red/$(echo "$f" | tr / _)" "$f"; done
md5sum -c /tmp/s5-red/sums | sed 's/$/ (restored)/' >> "$OUT"
rm -rf /tmp/s5-red
