# Direct derived-workbook dependency review

Date: 2026-10-07. Workstream W3, launch row D4. Canonical branch
`concept2cure-v2`; discovery source `3400f1f32f7bed7bfa041e390b67407420a30d2d`.
No new surface, store, dependency, integration or migration.

## Confirmed defect and realistic trigger

The existing `edit_spreadsheet` save preserves a workbook's parent file ID,
original byte digest, and available same-program parent source IDs in the new
capture's provenance (`server/services/ana/uploaded-file-access.ts`,
`saveSpreadsheetDerivation`). The edited bytes have a different digest.
The disposition impact currently expands equal-original-digest identities in
the target program (`document-data-disposition/impact.ts`, `readLinks`) and
its direct eligibility predicates match identity or equal digest; they do not
inspect an edited capture's named parent.

An investigator can curate an assay CSV from project A into an edited XLSX in
project B. The cross-project capture intentionally has an empty
`parentSourceIds`, but names the original upload ID and original digest.
Removing or superseding the invalid parent can currently succeed while the
edited capture, upload, extraction and filed Vault rendition remain eligible.
The original impact preview does not name the edited dependency.

A read-only in-memory PostgreSQL probe through the existing PGlite fixture
confirmed this for `remove_data` and `supersede`: the child capture remained
data/binary eligible, its upload remained readable, and its Vault rendition
remained data eligible. The same probe for `keep_data` preserved usable data,
as required. This is a repository reproduction, not a client dataset or
production qualification.

## Approved bounded contract

1. Read direct captured dependencies from the existing
   `public.cre_evidence_sources` store. A child must be owned by the same
   organization, be a non-deleted `client_document`, and remain eligible under
   existing `capturedDataEligibleSql`. The destination program can differ.
   Current and historical retained captures are included because either can
   still support governed content; `is_current=false` alone does not retire
   its extracted data.
2. A recorded child names the proven parent through `parentSourceIds`, or names
   its verified linked upload with `derivedFromFileId` and
   `derivedFromSha256`. Digest equality alone does not establish ancestry.
   Exact named parents with contradictory/missing digests or malformed lineage
   remain review dependencies. Malformed IDs are compared as JSON/text, never
   cast to integers; an unrelated malformed record does not implicate every
   source in the organization.
3. `readDerivedCaptureImpact(q, organizationId, linkedIds, sourceSha256)`
   returns actual eligible rows, a count, an unverified count, and a stable
   fingerprint of their complete recorded source rows. The root integration
   includes the count in `downstreamReferences` and the fingerprint in the
   existing preview snapshot. A child inserted, removed, or changed after
   preview makes that preview stale.
4. Derived dependencies require governed review before `remove_data` or
   `supersede`. They do not automatically withdraw, erase, rewrite, reparent,
   recalculate or replace children. The existing dialog presents the terminal
   choice restriction and review reason; only `keep_data` remains selectable
   when there is no other existing blocker.
5. `keep_data` remains allowed, preserving the original recorded extraction
   and all eligible child data while the original file becomes unavailable.
   A later terminal disposition stays restricted until eligible direct
   captured dependencies have been resolved through existing governed paths.
   Existing legal-hold, approval and terminal-state blockers remain binding.

## Transaction and ownership boundaries

The existing disposition confirmation takes a bounded program advisory lock,
then SHARE locks the impact tables, including `cre_evidence_sources` and
`file_uploads`, before re-reading and fingerprinting impact. The existing
spreadsheet save reserves ROW EXCLUSIVE on those tables before its final
organization-wide source eligibility read and writes. That ordering can
serialize direct captured edits against withdrawal even when the destination
program differs. No new table/lock order is needed by this read helper.
Single-instance PGlite tests do not establish independent-connection races.

The focused worker owns `derived-impact.ts`, its new actual-SQL tests, and
these derivation receipts. The root control tower owns integration in
`impact.ts`, `service.ts`, internal/shared types and the existing dialog.
All work stays in the shared canonical checkout. No worker commit/push.

## Falsifiable checks

The new focused test ran before service integration:

```sh
NODE_OPTIONS=--max-old-space-size=4096 npx vitest run --config vitest.config.ts server/services/document-data-disposition/__tests__/derived-impact.pglite.integration.test.ts --reporter=dot
```

RED: **5 failed / 10 passed**, 6.26 seconds. It failed on same-/cross-program
dependency impact, incorrectly allowed supersession, terminal choices after
retaining data, and a stale preview accepted after a late cross-program child.
The helper's actual-SQL controls passed for exact identity/hash handling,
malformed relevant lineage, tenant isolation, fingerprints, and eligibility
after a child's own retained/withdrawn-data decision.

The integrated GREEN result and final root gates must be recorded separately;
this plan does not claim them complete.
A repeat baseline run saved in `derivation-red.txt` reproduced the same
**5 failed / 10 passed** result in 3.98 seconds. Subsequent tests also require
fresh preview after a child's recorded metadata changes without a count change.

## Explicit limits

This is direct dependency containment, not transitive eligibility rewriting or
scientific dataset qualification. Original captured identity/provenance remains
unchanged. A Vault-only parent without a proved capture/upload bridge cannot
be connected to an edited upload by guessing its bytes. Same-byte evidence in
another program remains independent unless a recorded exact parent edge names
this target.
Already-terminal parent dispositions that predate this containment do not
retroactively withdraw or hold their retained descendants; reviewing those
historical dependencies remains separate work.

Conversation-only spreadsheet edits create no capture; their derivation edge
exists only in the existing `file_upload.derived` audit event. `audit_logs` is
not an existing disposition impact lock/fingerprint table. This bounded pass
does not claim containment for those uploads or later capture/adoption that
does not carry their derivation metadata. No audit scan or schema extension is
introduced here. That requires its own governed admission/ancestry contract.

No production RLS, independent-connection race, immutable filesystem,
audit-HMAC verification, scanner/provider or regional agency qualification is
claimed by these tests.
