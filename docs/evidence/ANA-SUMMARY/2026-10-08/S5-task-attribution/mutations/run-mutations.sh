#!/usr/bin/env bash
# S5 mutations: each plants one defect, runs the S5 tests, restores the file and checks it byte for byte.
# Run from the repository root. RLS_ENFORCE=off (CI has no .env).
set -u
OUT=docs/evidence/ANA-SUMMARY/2026-10-08/S5-task-attribution/mutations
EMIT=server/services/ana/turn-timeline-emitter.ts
DIFF=shared/ana/plan-diff.ts
ROWS=client/src/concept2cure/v2/turnSummaryRows.ts
SERVER_T=server/routes/ana-ri/__tests__/stream-task-attribution.test.ts
CLIENT_T=client/src/concept2cure/v2/__tests__/turnSummaryTasks.test.tsx

mutate() { # name file perl-expression test
  local name=$1 file=$2 expr=$3 test=$4
  local sum; sum=$(md5sum "$file" | cut -d' ' -f1)
  cp "$file" "/tmp/s5-mut.bak"
  perl -0pi -e "$expr" "$file"
  if cmp -s "$file" /tmp/s5-mut.bak; then echo "$name: MUTATION DID NOT APPLY" | tee "$OUT/$name.txt"; return; fi
  { echo "# $name: $file"; diff -u /tmp/s5-mut.bak "$file"; echo;
    RLS_ENFORCE=off npx vitest run --reporter=verbose "$test" 2>&1 | grep -E '^ +(✓|×)|Tests |AssertionError'; } > "$OUT/$name.txt"
  cp /tmp/s5-mut.bak "$file"
  [ "$(md5sum "$file" | cut -d' ' -f1)" = "$sum" ] && echo "restored: md5 OK" >> "$OUT/$name.txt" || echo "restored: MD5 MISMATCH" >> "$OUT/$name.txt"
  grep -E 'Tests |restored' "$OUT/$name.txt" | sed "s/^/$name: /"
}

mutate M1-first-of-several-in-progress "$EMIT" 's/return open\.length === 1 \?/return open.length >= 1 ?/' "$SERVER_T"
mutate M2-plan-step-attributed "$EMIT" 's/if \(tool === UPDATE_PLAN_TOOL_NAME\) return null;//' "$SERVER_T"
mutate M3-id-kept-after-removal "$DIFF" 's/this\.live\.delete\(title\.toLowerCase\(\)\);//' "$SERVER_T"
mutate M4-no-steps-reads-as-failure "$ROWS" 's/if \(n === 0\) return NO_TASK_STEPS;//' "$CLIENT_T"
mutate M5-any-failure-is-none-succeeded "$ROWS" 's/served\.every\(stepDidNotComplete\)/served.some(stepDidNotComplete)/' "$CLIENT_T"
mutate M6-task-steps-not-in-detail "$ROWS" 's/steps: served\.map\(\(s\) => stepRow\(s, ctx\.opts\.live\)\),/steps: [],/' "$CLIENT_T"
mutate M7-fact-on-every-task-row "$ROWS" 's/const fact = e\.change === .completed. \?/const fact = true ?/' "$CLIENT_T"
mutate M8-added-not-first "$DIFF" "s/return \[\.\.\.changes\.filter\(\(c\) => c\.change === 'added'\), \.\.\.changes\.filter\(\(c\) => c\.change !== 'added'\)\];/return changes;/" "$SERVER_T"
