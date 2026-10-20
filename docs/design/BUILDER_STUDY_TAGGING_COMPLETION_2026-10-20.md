# Complete Submission Builder study tagging

Source inspected: `e79626c0849f0f8c2338b32f85d4bc69bccef8f5`.
Scope: MR-10 Stage 1 / CAT2-04 **Builder metadata portion**. The finding and
the work order remain open for direct placement dialogs and STF conformance.

## What already exists

- `shared/schema/submissions.ts` and
  `migrations/20261012_submission_leaf_stf_study_tagging.sql` already define
  nullable `study_id` and `stf_file_tag`; no schema change is needed.
  `shared/types/database.d.ts` carries the existing shared `SubmissionLeaf`
  interface; its missing optional nullable fields are completed to match schema.
- `server/routes/submissions.ts` already owns the author-only, governed-reason
  leaf PUT. Its schema drops study metadata today.
- `server/services/submission-service/submission-service.ts` already owns leaf
  writes, sequence locking, immutable-state refusals, tenant checks, validated
  state invalidation and audit outcomes. It does not persist either study field;
  ordinary updates also re-pin sources, so they cannot safely serve a metadata edit.
- `submission-request-read.ts` in that service directory already returns both
  fields. `server/services/ectd/core-to-packager.ts` already projects them.
- `server/services/ectd/ectd4-validator.ts` already owns STF coverage requirements;
  `stf-generator.ts` already checks filenames, writes STF XML and distinguishes
  verified dataset tags from advisory, unverified document-tag recall.
- `server/services/ana/{AnaToolDefinitions,AnaToolExecutor}.ts` already accepts
  and projects study metadata for `package_ectd_for_region`. That direct packaging
  tool does not persist human Builder leaf metadata; it is left unchanged.
- `server/services/part11/signature-persistence.ts` already binds sequence leaf
  manifests for signatures and waivers, but its explicit projection omits study
  metadata. Extend that digest rather than adding another binding.
- `client/src/concept2cure/v2/surfaces/SubmissionSeqWorkspaces.tsx` already lists
  leaves and supplies placement/removal, mutation outcomes and history. It has no
  study-tagging controls. `SubmissionCenter.tsx` and `submissionScopedRead.ts`
  already own actor/selection generations; reuse those guards.
- `VaultPlaceIntoSubmission.tsx` and `AuthoringPlaceIntoFiling.tsx` already place
  documents. Builder editing completes their placed leaves; direct study inputs
  in those dialogs remain outside this slice.
- `EctdCompile.tsx` already displays compiled hierarchy, file facts and validation.
  This work adds no viewer, placement engine, data store, migration or dependency.

Searches covered study identifier/id, file-tag/STF/1789, leaf metadata, routes,
services, schema/migrations, UI and AnA tools. Deleted-history searches for
`*Study*Tag*`, `*stf*`, `*STF*`, `*Leaf*Metadata*` found no relevant predecessor.

## Contract

1. Extend the existing PUT/input with optional nullable `studyId` and
   `stfFileTag`. Omitted fields preserve existing values on ordinary updates;
   explicit null clears. Inserts default to null. Explicit differing metadata
   on duplicate placement is refused, never silently answered unchanged.
2. A `studyTaggingEdit` object opts the same writer into a narrow update:
   `{ expectedStudyId: string|null, expectedStfFileTag: string|null,
   expectedUpdatedAt: ISO timestamp }`. Require leafId and explicit new values
   for both fields. Required sectionCode/title must match the locked row.
   Under the existing sequence and leaf lock compare timestamp and old metadata;
   stale state refuses with 409. Update only study metadata and updatedAt;
   preserve source pointer, content hash, pin time, parent, operation and section.
   No-op returns unchanged without audit or validation demotion. A real edit
   uses existing LEAF_UPDATED with before/after metadata and the human reason.
3. Validate non-null study IDs with existing `stfFileName()`, not a second naming
   policy. Tags are trimmed, nonempty, bounded to 128 and free of control chars.
   Do not turn the explicitly unverified document recall list into an enforced
   regulator enum. Packaging retains existing dataset enforcement and warnings.
   Neither field is inferred or populated by AI.
4. Extend the existing signature binding. When both fields are null omit both
   new keys from canonical payload to preserve old untagged bindings. When
   either is non-null include both: existing tagged-but-unbound signatures must
   fail current binding and require re-signing. Changes to either alter digest.
5. Display both fields in Builder and offer a reason-required editor on editable
   leaves. Use the narrow contract, exact leaf/sequence/metadata receipt checks,
   and distinguish unchanged, committed/audit-unconfirmed, refused and unknown.
   A successful bodyless PUT (including HTTP204) lacks the required exact row
   receipt and is unknown for this editor; the existing DELETE204 contract stays.
   Unknown writes require an explicit current-leaf reread before another save;
   no automatic retry. Preserve entered values during reconciliation.
6. Reuse the canonical submission session guard and scope generation so old
   reads, receipts and errors cannot reach another actor/project/sequence,
   including A→B→A. Refresh existing leaf/history/status after confirmed changes.
   Frozen/dispatched remain immutable. Do not remove any existing capability.
7. Carry known selected submission/program through the existing read-selection
   query guards on both leaf reads. A reconciliation may adopt the same leaf's
   current section/title and displays them before a deliberate save; the narrow
   writer checks that reviewed identity. A later confirmed no-op or explicit
   close after uncertainty refreshes existing leaf/history/sequence reads while
   retaining the earlier write/audit uncertainty. Independently check the leaf
   audit and any sequence-transition audit receipt.

## Verification and limits

Capture failing regression output before implementation, then focused route,
PGlite writer/binding, UI ownership/recovery and STF projection/coverage tests.
Exercise actual Builder in Chromium with a deterministic local API fixture;
run production build and normal pre-push gates before direct canonical push.
Record actual execution anchors and distinguish automated from human witnessing.
This does not establish DTD validity, agency acceptance, filing readiness or
completion of MR-10/CAT2-04. No external agency, AI or real regulated record writes.
