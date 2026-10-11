# Existing biotech workflow qualification follow-through

2026-10-07 · W3 / D4 · `concept2cure/ClinicalSageAI-2-replit` ·
`concept2cure-v2` only. Starting source:
`40697292af6b813dcfcaba8881e12c250dab69ef`.

The approved [PLAN.md](PLAN.md) bounds this increment to existing CMC assessment,
Module 3 propagation, edited-workbook adoption, source withdrawal and cached
evidence consumers. It adds no surface, dependency, model, statistical engine,
store, production index or migration. Historical evidence and audit identities
remain intact. This increment does not close D4 or D1–D10.

The latest published stability-summary fix and its exact-source remote results
are recorded in [QOS-REMOTE-GATES-RESULTS.md](QOS-REMOTE-GATES-RESULTS.md).
Its [83-file / 1,511-case regression](QOS-INTEGRATED-MANIFEST.json) preserves
both materials' complete existing qualification narratives. Remote compiler,
scanner and other job verdicts are pinned to their actual source commits;
broader/native-database and release qualification remain independent gates.

## Resulting behavior

| Existing workflow boundary | Qualified software behavior |
|---|---|
| Single-study CMC claim | Any unestimable recorded parameter/condition or unnamed measured row withholds the aggregate shelf-life claim. Valid per-series estimates and named refusal reasons remain available. |
| Module 3 stability support and trending | Unnamed measured results carry their source/row refusal into qualification and narrative; raw rows and point comparisons remain visible. |
| Conversation edit → project adoption | Existing exact `file_upload.derived` ancestry is carried into capture provenance. Scientific qualification remains unassessed and formula results are not recalculated. |
| Admission, canonical capture and upload readers | Same-tenant recorded terminal ancestor withdrawal, contradictory identities, unresolved named parents, cycles or depth exhaustion refuse eligibility/admission. Retained ancestor data remains usable. |
| Cached atom, RAG and artifact readers | Exact existing normalized associations inherit canonical recorded-lineage eligibility. Data retention remains distinct from original-file availability. Equal bytes alone create no ancestry. |
| Withdrawal impact and review freshness | Known captured grandchildren are included, fingerprinted and require review; named unverified dependencies remain visible for review rather than becoming qualified evidence. |

Detailed contracts, RED/GREEN controls and limits are in
[CMC-RESULTS.md](CMC-RESULTS.md), [LINEAGE-RESULTS.md](LINEAGE-RESULTS.md) and
[DOWNSTREAM-RESULTS.md](DOWNSTREAM-RESULTS.md). The initial CMC and lineage REDs
precede their production edits. The separately approved downstream extension
has its own three-failure RED against the pending canonical lineage repair.
Later isolated-original controls and fixture/runner failures are explicitly
labeled; no failed or empty execution is represented as GREEN.

## First publication integration evidence

- [Combined regression](COMBINED-REGRESSION.txt): **69 physical files,
  1341/1341 cases passed, zero skipped/todo, exit 0, 224.99 seconds**. Runs use
  the repository Vitest configuration, one fork and a 4096-MiB heap.
  [Requested files](COMBINED-REQUESTED-FILES.txt) and the
  [executed manifest](COMBINED-EXECUTION-MANIFEST.json) verify that every
  requested file executed, with no missing or additional file.
- [Qualified source blobs](QUALIFIED-SOURCE-BLOBS.json) pin all 27 changed
  TypeScript source/test/fixture files on which integration was run.
- [Server build](BUILD-SERVER-FINAL.txt) and [client build](BUILD-CLIENT.txt)
  completed successfully. The client retains its existing chunk-size warning;
  builds are not semantic TypeScript proof.
- [Final lint](LINT-FINAL-SUMMARY.json): **27 files, zero errors, 30 inherited
  warnings**. [Warning ratchet](WARNING-RATCHET.txt): no file gained a warning
  against the exact starting source. No suppression or baseline changed.
- The repository pre-commit security check and all pre-push gates preceding
  whole-tree TypeScript are executed before canonical publication; their
  actual receipt is filed as `BRANCH-GATES.txt`.

The prior exact-source full TypeScript gate is independently verified in
[PRIOR-TYPECHECK-GREEN.txt](PRIOR-TYPECHECK-GREEN.txt): source `40697292`, zero
errors, compiler exit 0 and baseline 0. It does not qualify this new source.
The local host has 8 GiB while the canonical compiler requires a 24-GiB heap.
Under the user's continuing authorization, this publication's full semantic
gate is verified in GitHub after publication. That verdict is pending when
this receipt is filed; the exact-source GitHub job, not local tests or builds,
supplies its final result.

## Broad CI fixture follow-up

The prior broad CI artifacts later identified 54 failed assertions across
eleven physical suites, including the citation fixture setup failure already
repaired by the first publication. The remaining ten suites reproduced all
54 failures on current source before any follow-up test edit. The bounded
[CI-FOLLOWUP-PLAN.md](CI-FOLLOWUP-PLAN.md) approves fixture/prerequisite and
stale test-contract corrections while preserving production refusal gates.
Original forbidden inputs remain explicit refusal controls.

[CI-FOLLOWUP-RESULTS.md](CI-FOLLOWUP-RESULTS.md) records the corrections and
limits. The final expanded regression passed **80 physical files / 1470 cases,
zero failed/pending/skipped/todo, exit 0, 275.21 seconds**, including all first
publication suites, all ten corrected suites and the existing migration-list
closure contract. [CI-COMBINED-EXECUTION-MANIFEST.json](CI-COMBINED-EXECUTION-MANIFEST.json)
verifies requested and executed files, actual assertion statuses and the ten
changed test blobs. Scoped lint has zero errors and one unchanged inherited
warning; the per-file warning ratchet passed. Production source and all 27
earlier qualified blobs are unchanged, so existing build receipts apply.
`CI-BRANCH-GATES.txt` supplies the follow-up's actual local publication gates.

These results qualify the scoped existing contracts. The exact final GitHub
semantic TypeScript, scanner and broad CI verdicts remain pending at filing;
queued jobs are not passes. Full release/intended-use qualification remains
open.

## Exact-source remote gate follow-through

The first expanded publication's actual GitHub compiler measured three
fixture `TS2322` errors; its main lint also found a SQL-inventory parser
mismatch for a recursive CTE with declared columns. Its blank-database
live-schema gate separately exposed statements assembled across SQL literals.
All executed REDs are preserved. [REMOTE-GATES-RESULTS.md](REMOTE-GATES-RESULTS.md)
records the narrow repair: two fixture annotations preserve byte-identical
emitted JavaScript and all original inputs/assertions; the CI parser recognizes
column-list CTEs while continuing to reject real missing storage; two existing
production files bind their complete recursive query in each statement. All
ancestry, tenant, identity, withdrawal, depth and transaction policies remain.
The adoption mock fixture follows that query shape and its injected rollback
cases additionally prove they reach the capture seam. No baseline grows.

The final fresh regression passes **80 physical files / 1470 cases**, zero
failed/pending/skipped/todo, exit 0, **299.97 seconds**. Its
[execution manifest](REMOTE-INTEGRATED-GREEN-MANIFEST.json) pins all eight
changed code blobs and confirms they remained unchanged during the run.
All **13 Node parser/binding controls** pass, both repository inventories pass,
all five changed TypeScript files have zero lint errors/warnings, and the
production server builds. The first 1466-pass/four-failure integration is
preserved as RED; it does not qualify the corrected adoption fixture.

The same descriptive timing dataset now measures medians of 524.03 ms for
203 atoms, 159.71 ms for 201 RAG rows and 137.96 ms for 201 artifacts, with
all ordinary positive rows eligible. These separate runs do not isolate the
assembly wrapper's cost. Relative overhead remains material, and production
performance remains unqualified.

The qualified code publication is
[`a5dc3f3d84ba62a06806f8455897fe0554ae654d`](https://github.com/concept2cure/ClinicalSageAI-2-replit/commit/a5dc3f3d84ba62a06806f8455897fe0554ae654d).
[Verified publication results](REMOTE-PUBLICATION-RESULTS.md) now record both
full GitHub compilers with zero errors, all 214 Node CI guard controls passed,
the live provisioned-schema gate with zero new missing relations, and successful
security scans, authenticated browser, RLS boot and production image sign-in.
Actual compiler/live-schema/count excerpts are preserved alongside their job
links. Broad integration, tests and coverage remain in progress at that snapshot;
queued or running jobs supply no pass. Earlier pending-at-filing statements are
historical snapshots. D4 and D1–D10 remain open.

## Continued review: Module 2 stability propagation

The next bounded review reproduced a remaining downstream CMC defect: fixed
500-character QOS excerpts could discard the existing Module 3 stability hold
and named refusal/trend reasons. [QOS-RESULTS.md](QOS-RESULTS.md) records the
pre-edit RED and narrow two-expression repair. Both drug substance and drug
product QOS stability paragraphs now retain the upstream qualification intact;
all other excerpts, assessment rules, data, tables and metadata remain.

The new combined regression passes **83 physical suites / 1511 cases**, zero
failed/pending/skipped/todo, exit 0, with all eleven source blobs frozen through
the execution. The original unchanged 14-case reproducer and all 214 Node CI
guard controls also pass. Scoped lint has zero errors and no warning growth;
the production server builds.

The same increment adds a separate always-uploaded JSON result for the existing
unmocked real-database CI step, preserving all database/RLS bindings and failure
status. The preceding broader integration failure remains unexplained; its
successful mocked-stage artifact cannot qualify the later failing database
step. Nine additional read-only lineage controls found no new defect. Exact new
source compiler and broad/database release CI remain independent publication
gates. D4 and D1–D10 remain open.

## Evidence scanner correction

The prior Semgrep blocking differential scan found three synthetic opaque
preview-token strings in two RED receipts. [EVIDENCE-SCAN-RED.json](EVIDENCE-SCAN-RED.json)
records the exact rule, source, job, paths and counts. Those three strings are
replaced with a synthetic-token redaction marker; assertions, SQL, failure
counts and verdicts are preserved. New receipts are checked for the same token
shape. No scanner rule, ignore list or baseline is weakened. The exact qualified
publication's Semgrep and full-history secret scans completed successfully,
as recorded in [REMOTE-PUBLICATION-RESULTS.md](REMOTE-PUBLICATION-RESULTS.md).

## Remaining qualification

Fixed-size local SQL timings are descriptive, not performance acceptance.
The first cached-reader timing exposed seconds of avoidable lookup cost;
candidate-bounded normalization reduced final medians to 312.32 ms for 203
atoms, 110.12 ms for 201 RAG rows and 92.64 ms for 201 artifacts. The final
relative overhead remains material. Earlier timings are preserved separately.
Production volume, latency/plans, RLS and independent-connection scheduling
remain unqualified; no production index or schema redesign was added.

Archived/missing audit events and unmapped historical associations remain
unknown history. This repair does not reconstruct them or prove parent live
bytes, audit-seal integrity, filesystem symlink containment or scientific
identity/unit/criteria completeness. Scoped SQL/route controls do not establish
deployed intended use, provider PQ, narrative-refinement semantic preservation,
accountable scientific acceptance or signed validation.

[Prior CI snapshot](PRIOR-CI-SUMMARY.json) records the actual preceding source:
main lint/typecheck, security contracts, production image/RLS boot and several
other jobs passed; broad tests/coverage/integration were still running. The
full-history secret scanner failed during pinned dependency installation, and
JavaScript CodeQL failed after analysis/SARIF processing without a proven
precise cause. No new-source release verdict is inferred from that snapshot.
Broad release CI, live/staging execution, complete customer-data/intended-use
qualification, model/provider PQ and signed human validation remain owed.
