# Recorded workbook lineage — W3 / D4 scoped handoff

Repository: `concept2cure/ClinicalSageAI-2-replit`. Branch: `concept2cure-v2`.
Starting source: `40697292af6b813dcfcaba8881e12c250dab69ef`.
This receipt covers the approved recorded-lineage repair in `PLAN.md`. The
control tower owns final integration, cached-reader inheritance, publication
and release CI. This scoped result does not close D4 or D1–D10.

## Existing defect and resulting behavior

A conversation-only spreadsheet edit already records its immediate source file
identity/digest and child identity/digest in `file_upload.derived`. It creates
no evidence capture. Project adoption previously verified the child bytes but
lost that recorded ancestry. The original canonical eligibility predicates also
allowed legacy captured/upload descendants after an exact recorded ancestor was
terminally withdrawn. The initial actual-SQL/route RED precedes production edits.

Adoption now carries the existing immediate derivation fields into capture
provenance and marks edited content `scientificQualification: unassessed` and
`formulaResults: not_recalculated`. Existing admission reservation ordering is
preserved. Adoption and a further edited-save admission refuse a known
`remove_data`/`supersede` ancestor. `keep_data` ancestors remain usable.

Canonical captured-data, captured-binary and upload-availability projections
consume one shared recorded-lineage SQL implementation. They refuse exact known
legacy, cross-project and transitive descendants of terminal withdrawal, and
refuse contradictory, cyclic or unresolved named ancestry. Historical rows and
audit events are preserved. The derived-impact preview includes recorded
captured grandchildren, fingerprints them for fresh review, and keeps named
unverified dependencies in the review projection even when consumer eligibility
is false. An uncaptured conversation file remains outside qualified capture
impact; its later adoption preserves its existing recorded ancestry.

## Canonical data contract

- Edges come only from exact existing capture provenance or same-tenant
  `file_upload.derived` audit events. Matching bytes alone create no edge.
  Existing direct disposition rules are preserved; unrelated/manual controls
  remain usable where that existing own-disposition policy permits them.
- An audit edge binds action, resource/table, record, target, operation, child
  file identity and digest, and named parent identity/digest. Duplicate or
  contradictory claims refuse eligibility. Deployed audit `new_values` is
  `json`; SQL explicitly converts it with `to_jsonb` before JSONB operators.
- Each walk starts in the row's own organization and resolves named parents
  within that organization. Parent upload paths must have the organization's
  namespace and cannot contain `.`/`..` segments or end in a slash. This checks
  recorded namespace identity; it does not prove a parent's live bytes.
- A capture's own `fileUploadId` is an association. It imports upload ancestry
  only when a recorded derivation edge exists. An ordinary retained capture
  remains data eligible if the old original upload/bytes are unavailable or the
  association is dangling. Empty `parentSourceIds: []` alone adds no dependency.
- Capture/upload bridges consume no ancestry hop. Traversal follows normalized
  file ancestry while validating named captures as leaves, avoiding duplicate
  normal capture/file paths. A cycle or reaching 64 recorded ancestor hops is
  an explicit refusal, never a silently truncated claim.
- The helper executes set-based SQL in one statement. It adds no JavaScript
  query-per-row walk, store, graph, migration, production index or dependency.
  Admission retains the existing program/table reservation ordering.

## Regression and execution receipts

| Receipt | Actual result and interpretation |
|---|---|
| `LINEAGE-RED.txt` | Before production edits: 2 files, 7 failed / 16 passed (23), process exit 1. Lost adoption provenance, terminal legacy/cross-project descendants, a two-hop descendant, and malformed/unresolved named ancestry. |
| `LINEAGE-ADDITIONAL-ORIGINAL-RED.txt` | Added after production edits: isolated exact starting-source predicates compared with repaired predicates. Namespace traversal, an actual lineage cycle and depth exhaustion each fail the required original refusal; 3 original assertions failed / 3 repaired controls passed, process exit 1. This is explicitly not the initial pre-edit RED. |
| `LINEAGE-FIXTURE-SETUP-RED.txt` | First broader run: 1 failed suite / 28 passed; 350 tests passed / 7 skipped (357). The citation fixture repeated an `ADD COLUMN client_program_id` already supplied by the shared fixture at the starting source. Only that redundant setup statement was removed; assertions were preserved. |
| `LINEAGE-RUNNER-EMPTY.txt` | Exit 0 with no Vitest verdict or result manifest. Preserved as an invalid execution receipt; it supplies no GREEN evidence. |
| `LINEAGE-GREEN.txt` | Manifest-backed pre-cached-reader-extension run: 29 physical files, 366 passed / 0 failed / 0 skipped, 115.27 s, exit 0. Collection did not include the control tower's downstream probe. |
| `LINEAGE-GREEN-OWNED-SCOPE.txt` | Explicit 29-file manifest excluding the control tower's downstream suite: 366 passed / 0 failed / 0 skipped, 119.27 s, exit 0. This run started before the final admission-guard extraction and during control-tower eligibility edits; it does not qualify final integrated eligibility. |
| `LINEAGE-GREEN-ADMISSION-GUARD.txt` | After a structural admission-row guard extraction: 5 files, 96 passed / 0 failed / 0 skipped, 25.08 s, exit 0. SQL, semantics and refusal strings were preserved. |
| `LINEAGE-LINT.txt` | 21 worker-owned files: zero errors / 7 warnings. Six warnings are inherited; one new admission-function complexity warning required correction. |
| `LINEAGE-LINT-ADMISSION-GUARD.txt` | Final 21 worker-owned files: zero errors / 6 inherited warnings / zero new warnings, exit 0. The helper has zero warnings. Root-owned `eligibility.ts` is excluded after ownership handoff. |

`LINEAGE-SCOPE.json` lists all 29 exercised physical files, the 21 worker-owned
changed files, and `eligibility.ts` released to the control tower. Vitest uses
one fork with a 4096-MiB heap. The JSON reporter's suite count includes nested
`describe` groups; physical file counts above come from `testResults`.

The final positive adoption control uses the actual canonical no-project
`saveDerivedUpload` writer followed by the actual adoption route against SQL:
its audit has `parentSourceIds: []` and it produces no capture until adoption.
The initial RED used an existing recorded-event fixture; the final positive
control additionally proves the writer-to-adoption contract. Controls cover
actual disposition preview/apply blocking and stale review, admission rollback,
`keep_data`, unrelated/manual same-byte records, row-tenant isolation, malformed
bindings, audit duplicates, SQL alias collision names, cycles, depth and retained
data whose original association is unavailable.

## Fixed-size SQL timing

The first receipt `LINEAGE-PERFORMANCE.txt` is preserved unchanged. Its fixed
single-PGlite dataset has 201 ordinary/manual captures, 201 ordinary uploads,
a 16-hop recorded upload chain and 800 unrelated foreign-tenant audit rows.
Five measured repetitions returned identical eligibility counts for original
and repaired predicates. Median milliseconds were 1.089 → 33.602 for ordinary
captures, 1.304 → 104.602 for all 217 uploads, and 1.468 → 8.608 for the deepest
single upload.

`LINEAGE-PERFORMANCE-RETAINED-GUARDS.txt` is a separate rerun after retained-data
guards, with 800 same-tenant unrelated audit rows added. Both receipts declare
the actual indexes: existing primary keys and the deployed audit lookup key
order `(table_name, record_id)`, without an alternate index or migration.

| Rerun projection | Original median ms | Repaired median ms | Relative increase | Repaired max ms |
|---|---:|---:|---:|---:|
| 201 ordinary/manual capture data rows | 1.476 | 22.812 | 15.5× | 24.844 |
| 217 uploads including the 16-hop chain | 2.231 | 202.416 | 90.7× | 230.320 |
| Deepest single-chain upload | 1.065 | 21.315 | 20.0× | 27.371 |

The observed overhead is material relative to the original simple predicate and
was reported to the control tower before handoff. It is descriptive fixed-size
local timing on a shared host, with no performance acceptance threshold. It
qualifies neither deployed latency nor large tenants, branching-graph cost,
planner behavior on production distributions, independent-connection scheduling
or RLS. No production index or planner-scope expansion is approved by this repair.

## Fixture scope and remaining qualification

A shared test-only minimum-store helper completes existing omitted
`file_uploads`/`audit_logs` tables in eight evidence-spine suites and two AnA
suites. It models deployed audit JSON types and the existing audit index order.
The disposition fixture now includes that same existing audit shape. These
changes add no production stores and weaken no assertions.

The worker owned three production files: `recorded-lineage.ts`,
`derived-impact.ts`, and project adoption in `projects.ts`. The original
canonical predicate extension in `eligibility.ts` was released to the control
tower before cached-reader inheritance edits. That independent extension has
its own `DOWNSTREAM-*` receipts and requires final combined integration.

Missing/archived derivation events remain unknown history: absence is not proof
of independent origin, and this repair cannot reconstruct it. Local PGlite and
route seams do not establish deployed runtime privileges, parent live bytes,
audit-HMAC/seal integrity, filesystem symlink containment, scientific or formula
qualification, complete intended-use validation or independent-connection race
qualification. Production index/schema changes, a universal inferred graph and
concurrent admission/disposition protocol redesign are outside this contract.

Whole-tree semantic TypeScript was not run locally on the 8-GiB host. The
control tower owns the 24-GiB GitHub gate, final combined regressions, warning
ratchet, build, branch gates and actual release CI verdict. No commit or push
was made by this worker.
