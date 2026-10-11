# D4 — edited spreadsheet lineage and Data Room capture

Date: 2026-10-07. Base: `16bbf5b070ecfc186d7addaa1b6b96e384d6fe87`.
Existing confirmed `edit_spreadsheet` tool, `saveDerivedUpload`, evidence spine,
tenant upload loader, project resolver and chained audit; no new data store.

## Outcome

An edited workbook remains a NEW upload; its original bytes/source are not
updated, retired or automatically superseded. The existing upload helper now
accepts optional spreadsheet derivation metadata. Existing authoring-image
callers without it retain their save contract.

The derivation receipt names the original file ID, original byte SHA-256,
integrity assessment, all requested applied edits, newly created sheets, new
file ID/hash, and resolved program/capture identity. It is a
`file_upload.derived` event written through `writeChainedAuditRow`, on the same
transaction as the upload and any new capture. The returned audit reference
is a resource type/ID, NOT an invented audit-row ID or hash-chain verdict.

With a valid open program, canonical `resolveOpenProgram` establishes live
ownership, including an explicitly anchored legacy integer project. The new
file is captured through `createSource(..., client)`, which owns its capture
and `data_room.capture` audit. The capture retains available same-program
parent source IDs and is visible to existing Data Room queries. An unresolved
requested program fails before bytes/rows are written. Without an open project,
the edit retains its lineage event but honestly remains a conversation upload.

The tool now exposes capture status, parent hash, audit resource reference,
`scientificQualification: unassessed`, and `formulaResults: not_recalculated`.
Output names always identify XLSX bytes, including CSV inputs. Captures start
with extraction pending; canonical Vault filing/extraction remains explicit.

## Source eligibility and transaction ordering

The helper re-reads the original through the canonical scoped/integrity loader
and compares it with the digest of the exact buffer edited. Inside BEGIN it
resolves the program, takes the existing destination-program advisory lock
when applicable, and reserves ROW EXCLUSIVE on `cre_evidence_sources` then
`file_uploads` BEFORE rechecking eligibility or writing records. These are the
same tables this operation mutates, in `disposition.apply`'s impact-lock order.
Its SHARE locks therefore serialize a withdrawal with the eligibility read
even for a different destination project or a conversation-only edit. No
dispositions-table lock is taken first, which would invert the impact-write
order. Lock waits are bounded to five seconds.

This was a concrete review finding: locking only the destination program was
insufficient because upload eligibility checks dispositions organization-wide.
Two lock-order regressions failed on that implementation before the reservation
fix. Actual independent-connection concurrency remains an execution obligation;
the checks below do not claim to be that test.

Pre-COMMIT capture/audit failure rolls back every new database record and removes
only this invocation's derived file. An ambiguous COMMIT retains bytes, since
a committed source might name them. Originals are never cleanup targets.

## Falsifiable checks

Before production changes, `derived-spreadsheet-capture.test.ts` demonstrated
**8 failed / 1 passed**: no capture/receipt, foreign project not refused, changed
source not refused, no eligibility recheck or capture/audit rollback, and missing
actor accepted. The untouched authoring-image control passed. Before the lock
reservation fix, its two new lock-order checks failed (12 other tests skipped).

```sh
NODE_OPTIONS=--max-old-space-size=4096 npx vitest run --config vitest.config.ts server/services/ana/__tests__/derived-spreadsheet-capture.test.ts server/services/ana/__tests__/derived-spreadsheet-sql.test.ts --reporter=dot
```

GREEN: **19 passed / 2 files**, 4.08 seconds. Fourteen unit cases cover lineage,
project/conversation status, actor/tenant/source refusal, lock order, rollback,
unverifiable legacy integrity and ambiguous COMMIT. Five PGlite cases execute
actual ownership/eligibility/upload/parent-selection SQL and transaction
rollback: complete capture linkage, both failure seams, withdrawn original and
foreign project. Capture/audit persistence seams and filesystem are explicit
test doubles; PGlite is not two independently concurrent connections.

Earlier integration regression: **58 passed / 4 files** for the derivation unit
cases plus existing tenant-loader, tool-registration, and authoring figure
reference contracts. Combined final checks/publication are in this folder's
control-tower README.

## Limits and next obligations

Durable provenance is not scientific qualification, formula evaluation,
purpose approval, normalized clinical/CMC mapping, or automatic propagation of
every later parent withdrawal to derived hashes. The parent link is preserved
for review; dependency eligibility/drift propagation still requires an explicit
governed contract. Existing upload storage is unchanged; this is not a live
multi-task durable-storage qualification. No scanner/provider, production RLS,
real audit-HMAC verifier, independent-connection race, or agency acceptance is
claimed by these tests.
