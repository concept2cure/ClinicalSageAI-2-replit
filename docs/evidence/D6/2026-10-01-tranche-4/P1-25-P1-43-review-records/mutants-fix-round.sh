#!/usr/bin/env bash
# Fix round (DP-69): undo one piece of the fix at a time on the fixed code, run the fix-round suite, and
# restore the file byte for byte from a copy. Run from the repository root with TEST_DATABASE_URL and
# APP_DATABASE_URL set.
set -u
: "${TEST_DATABASE_URL:?owner URL}"; : "${APP_DATABASE_URL:?app_service URL}"
SVC=server/services/audit/compliance-reviews.ts
REC=server/services/audit/compliance-reports/queries/review-record.ts
SUITE=tests/db/compliance-review-fix-round.dbtest.ts
run() { RLS_ENFORCE=on npx vitest run --config vitest.db.config.ts "$SUITE" -t "$1" 2>&1 | sed -E 's/\x1b\[[0-9;]*m//g' | grep -E "✓|×|Tests " ; }
mutate() { # file, perl expression, test filter, label
  cp "$1" "$1.mutant-bak"
  perl -0pi -e "$2" "$1"
  if cmp -s "$1" "$1.mutant-bak"; then echo "!! mutant did not apply: $4"; fi
  echo "=== $4"
  run "$3"
  mv "$1.mutant-bak" "$1"
}
mutate "$SVC" "s/await assertReviewable\(client, orgId, storedDraft\(row\), 'sign'\);/void storedDraft;/" \
  "signing checks the record again" "M1: signing no longer re-checks the record"
mutate "$REC" "s/\\\$\{nextDueSql\('r\.period_end'\)\}/((r.signed_at AT TIME ZONE 'UTC')::date + interval '3 months')::date/g;s/ORDER BY r\.period_end DESC, r\.signed_at DESC/ORDER BY r.signed_at DESC/" \
  "the clock runs from the end of the period" "M2: the clock runs from the signing time again"
mutate "$SVC" "s/readMembers\(client, orgId, CURRENT_MEMBERSHIPS\)/readMembers(client, orgId, new Date(Date.now() - 86_400_000).toISOString().slice(0, 10))/" \
  "completeness is decided on current roles" "M3: completeness read as of yesterday (an earlier period end) instead of now"
mutate "$SVC" "s/const problems = await lineProblems\(client, orgId, members\.rows, lines\);/const problems: LineProblem[] = [];/" \
  "a reduce or remove is recorded once|a line for an account that is not a member|states a role" "M4: decision lines no longer checked"
mutate "$SVC" "s/  await assertReportRun\(client, orgId, d, stage\);\n//" \
  "export id|other report|data hash|another organisation" "M5: the named run is no longer looked up"
mutate "$SVC" "s/  if \(parsed\.success\) return parsed\.data;\n/  return (parsed.success ? parsed.data : row) as ReviewDraft;\n/" \
  "no longer meets the draft rules" "M6: the stored draft is signed without being read back through the draft schema"
echo "=== restored: $(git diff --stat -- "$SVC" "$REC" | tail -1)"
run "DP-69|DP-70"
