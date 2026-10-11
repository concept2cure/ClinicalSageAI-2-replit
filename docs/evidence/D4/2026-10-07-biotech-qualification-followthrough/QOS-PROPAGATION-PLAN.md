# QOS stability propagation — W3 / D4

Only repository: `concept2cure/ClinicalSageAI-2-replit`.
Only branch: `concept2cure-v2`.
Starting canonical head: `d46fca15b9454c89ea3eb56351488df1ff3ee1a7`,
an evidence-only descendant of qualified code `a5dc3f3d84ba62a06806f8455897fe0554ae654d`.

## Proven existing propagation defect

The existing QOS builder says it mirrors upstream Module 3 content. Its drug
substance and drug product stability paragraphs instead take a fixed
500-character prefix. Existing deterministic assessment holds and reasons come
later in the source narrative and are discarded.

[QOS-RED.txt](QOS-RED.txt) records a genuine pre-edit execution of the actual
public Module 3 and Module 2 composers: 14 controls, four passed and ten failed,
exit 1. A recorded monthly 0–36-month schedule has 37 passing named Assay
results and one passing unnamed measurement at month 36. Upstream correctly
withholds the conclusion and identifies source 41 / row 38. QOS retains the
within-criteria point comparison and truncates before “NOT established” at
offset 516 (substance) or 532 (product). Shorter inputs retain the hold but
lose its complete source/row reason. Existing criterion disagreement,
unestimable Water trend and later-study source/row reasons are also lost.
Valid monthly controls remain positive and create no hold. All raw source
objects, upstream sections and point-comparison tables are unchanged.

## Bounded repair and ownership

The CMC implementation session exclusively owns
`server/services/m2-summary-builders.ts` and
`server/services/__tests__/m2-summary-builders.test.ts`.

Carry each existing upstream stability narrative intact into QOS sections
2.3.S.7 and 2.3.P.8. Preserve its deterministic verdicts, source/row refusal
reasons and trend qualifications without deriving new science from prose.
Keep every other summary's excerpt behavior, input keys, completeness/gaps,
tables and missing-section behavior unchanged. Do not change the upstream
assessment, criteria grammar, model, engine, storage, approval or export policy.
Regressions cover both materials, long and short recorded schedules, unnamed
observations, conflicting criteria, unestimable trends, multiple sources and
positive controls. Preserve the original RED and its exact reproducer.

## Real-database CI diagnostic evidence

The preceding source `d46df5e1c406b0e8347385bcc0963dc02fd3e513` has a successful
broad Test job, but its Integration job 112929192952 failed specifically at
the unmocked real-database step after provision and the broad mocked test step
succeeded. Its uploaded integration artifact precedes that real-database step
and contains no real-database report. Fetching the oversized complete job log
failed with “Transport closed”; the underlying assertion cause is unknown.
The current qualified code's broader jobs are still running. Do not attribute
this earlier failure to the current code or infer a production repair.

The control tower exclusively owns the existing real-database step in
`.github/workflows/ci.yml`. Add a separate JSON report and always-uploaded
artifact for that same existing test execution. Preserve the command's exit
status, unmocked PostgreSQL project, RLS enforcement, tests, timeouts and
refusals. This is diagnostic evidence, not a green verdict or a workaround.
Use the existing pinned upload action, add no dependency, job, database,
migration, ignore or baseline. Verify workflow parsing and the existing
database-test-isolation guard; do not simulate real PostgreSQL with PGlite.

## Integration and limits

The control tower owns all QOS/CI receipts, integration and canonical
publication. Combine the prior 80-file regression with existing M2 builder,
renderer and feed-forward QC suites, inspect actual case statuses and source
hashes, run scoped lint/ratchet, server build and unchanged branch gates.
No full local compiler runs on this 8-GiB host; exact-source full semantic
TypeScript remains the 24-GiB GitHub publication gate.

D4 and D1–D10 remain open. Complete intended use, scientific identity/unit/
criteria completeness, production performance/races, provider/transport PQ
and signed accountable human/scientific acceptance remain separate work.
