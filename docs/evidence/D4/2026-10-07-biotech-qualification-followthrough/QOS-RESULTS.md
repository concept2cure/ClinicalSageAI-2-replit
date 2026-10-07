# QOS stability propagation results

2026-10-07 · W3 / D4 · `concept2cure-v2` only.
Starting head: `d46fca15b9454c89ea3eb56351488df1ff3ee1a7`.
Scope and the separate CI diagnostic change were filed before production edits
in [QOS-PROPAGATION-PLAN.md](QOS-PROPAGATION-PLAN.md).

## Resulting behavior

Module 2 QOS sections 2.3.S.7 and 2.3.P.8 now retain their existing Module 3
stability narratives intact. Long recorded study descriptions no longer discard
an explicit “NOT established” hold, a source/row refusal or a named trend
qualification. Valid studies retain their existing positive point comparisons
and trend assessment. The production change is exactly two consumer expressions;
it adds no scientific inference, model, engine, criteria grammar or policy.

The existing missing-section placeholders, other excerpts, headline tables,
input section keys, gaps and completeness remain unchanged. Source objects and
upstream Module 3 sections are not mutated.

## Actual RED and GREEN

- [Original pre-edit RED](QOS-RED.txt): 14 actual public-composer controls,
  four passed and ten failed, exit 1. Both materials lose a monthly schedule's
  hold after the fixed prefix; shorter holds lose their source/row reason.
  Criterion disagreement, unestimable Water trend and later-study reasons also
  disappear. All actual point comparisons remain within their recorded limits.
- [Exact unchanged reproducer](QOS-RED-REPRODUCER.ts.txt) now passes
  [all 14 controls](QOS-ORIGINAL-CONTROLS-GREEN.txt), exit 0, without changing
  any input or assertion.
- The permanent existing builder suite's
  [pre-production RED](QOS-PERMANENT-TEST-RED.json) has 12 failures / 16 passes
  in 28 cases. Its two additional failures check complete valid-trend
  preservation; they are distinct from the original 14-case reproducer.
- [Final focused regression](QOS-FOCUSED-GREEN.txt) passes six physical files /
  93 cases, zero failed/pending/skipped/todo, exit 0. Its
  [manifest](QOS-FOCUSED-MANIFEST.json) pins the final two source blobs.
- [Combined execution](QOS-INTEGRATED-GREEN.txt) passes **83 physical files /
  1511 cases**, zero failed/pending/skipped/todo, exit 0, **305.99 seconds**
  actual wrapper time (Vitest reports 303.80 seconds). It includes all prior
  80 workflow suites plus existing M2 builder, renderer and feed-forward QC
  suites. [Requested files](QOS-INTEGRATED-REQUESTED-FILES.txt) and the
  [manifest](QOS-INTEGRATED-MANIFEST.json) verify exact execution, actual
  assertion statuses, no missing/additional file, and eleven frozen code blobs
  unchanged throughout. The eight previously qualified code blobs and all
  protected guards/baselines remain unchanged. Local runtime is Node v24.19.0,
  one fork, 4096-MiB heap; canonical GitHub uses its declared Node 22 runtime.
- [Scoped lint](QOS-SCOPED-LINT.json): two files, zero errors, zero test
  warnings and eight unchanged inherited production warnings. The
  [paired original-source lint](QOS-SCOPED-LINT-BASELINE.json) verifies no
  growth. Initial test-layout/global-name warnings were structurally corrected
  before source freeze; no suppression or baseline was added.
- [All 214 existing Node CI controls](QOS-CI-GUARDS-GREEN.txt) pass with no
  failures, skips or todo after the workflow diagnostic edit.
- [Server build](QOS-SERVER-BUILD.txt) completes exit 0. Client source is
  unchanged. Build and local tests are separate from full semantic TypeScript.

## Existing real-database CI reporting

The same unmocked real-database test command now emits a separate JSON report.
The existing pinned upload action preserves that artifact after a success or
failure. The original database URLs, application role, RLS enforcement,
Vitest project, tests and exit status remain. Parsed workflow comparison
verifies every other job/step/environment/policy unchanged
([QOS-CI-DIAGNOSTIC-CHECK.txt](QOS-CI-DIAGNOSTIC-CHECK.txt)).

The [expected failure control](QOS-CI-REPORTER-FAILURE-CONTROL.txt) runs one
existing database-harness file against an explicit task-owned unreachable
endpoint. The new reporters create a report with `success: false`, preserve
process exit 1 and record one failed physical file with seven assertions
skipped because setup cannot connect. This is a qualified reporter failure
path, **not a successful database execution or native PostgreSQL proof**.
No local native PostgreSQL runtime is available.

[Earlier broad CI triage](QOS-PREVIOUS-BROAD-CI-TRIAGE.json) pins downloaded
artifacts to preceding source `d46df5e1c406b0e8347385bcc0963dc02fd3e513` and
their ZIP/member digests. The broad Test job completed success: Vitest has
3563 physical files, 43509 passed cases, zero failed, 53 skipped and 52 pending;
Jest has seven physical files / 40 passed cases. Its separate Integration job's
broad mocked step passed (43494 cases, 120 skipped), then the unmocked
real-database step failed after successful provisioning. That broad artifact
was uploaded before the failing step and contains no real-database report.
The later preceding-source coverage job also completed success.
The oversized complete job-log retrieval failed with “Transport closed”.
The failing database assertion's cause remains unknown; no production repair
or current-source failure/pass is inferred from it.

## Read-only lineage review and remaining gates

Nine additional actual PGlite lineage controls pass
([QOS-LINEAGE-AUDIT-GREEN.txt](QOS-LINEAGE-AUDIT-GREEN.txt)): normalized cached
string/numeric identities and invalid audit table/target/operation/child
bindings. [The manifest](QOS-LINEAGE-AUDIT-MANIFEST.json) pins nine reviewed
code/fixture/migration hashes against A5. The
[exact probe](QOS-LINEAGE-AUDIT-REPRODUCER.ts.txt) and initial
[runner IPC failure](QOS-LINEAGE-AUDIT-RUNNER-FAILURE.txt) are preserved
separately. No new lineage defect was proven, and no lineage code changed.

[QOS-QUALIFIED-SOURCE-BLOBS.json](QOS-QUALIFIED-SOURCE-BLOBS.json) pins the three
changed code files, all eleven integrated source blobs and unchanged scientific
engine/composer, guard and baseline blobs. [QOS-BRANCH-GATES.txt](QOS-BRANCH-GATES.txt)
records normal pre-commit and every unchanged pre-push gate before the full
compiler: both process exits 0, zero security-pattern violations, tracked imports
resolve, pushed lint has zero errors and the warning ratchet has no growth.
Two generated prior-version lint copies are verified against the starting
source and moved outside source/test roots; no extra source file is published
([QOS-RATCHET-COPY-CLEANUP.json](QOS-RATCHET-COPY-CLEANUP.json)).

The prior A5 source's two full compilers, live schema, security scans, browser
and production boot/sign-in passed as recorded in
[REMOTE-PUBLICATION-RESULTS.md](REMOTE-PUBLICATION-RESULTS.md). Those verdicts
do not replace this new source's full semantic compiler or broad/database CI.
No full local TypeScript compiler runs on the 8-GiB host; the exact published
source must receive its actual 24-GiB GitHub verdict. Broader tests, native
database execution, coverage and release evidence remain independent gates.

D4 and D1–D10 remain open. Complete intended use, scientific identity/unit/
criteria completeness, historical ancestry, production performance/races,
provider/transport PQ and accountable signed human/scientific acceptance
remain separately owed. Longer stability paragraphs preserve existing
qualification content; they do not establish those qualifications.
