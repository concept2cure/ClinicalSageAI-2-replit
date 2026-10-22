# MR-12 Stage 2 (CAT2-18): an effective SOP stays in force while it is revised

Gap analysis against Veeva QualityDocs: `docs/design/VEEVA_GAP_2026-10-22.md`. This was ranked first there because it is a correctness defect, not a missing feature.

## Found at `9e77eca23`

`reviseControlledQmsDocument` turns the register row into the next version's draft. It sets `status = 'draft'` and clears `approver_id`, `approved_at` and `effective_date`. Every reader of "in force" asked that row, so from the moment a revision opened until its successor was signed:

- training coverage dropped the SOP (`training-compliance.ts`);
- a member could not acknowledge it;
- readiness and review-due stopped counting it;
- the register showed only "Draft 2.0".

Yet the approved v1.0 still governed the work. Found on real Postgres as well: a member could not even open the SOP's training page (403 `QMS_DOCUMENT_VIEW_DENIED`). Access was decided on the v2.0 draft's editing copy, not on the v1.0 release being read.

The approved version was never lost. Approval writes it, exactly as approved, to the immutable `qms_document_versions`, and a revision of a pre-authoring entry retains it as a `legacy-registry` version. What was missing was one reader of "in force".

## Fix

`server/services/qms/in-force-release.ts` is the one resolver. The release in force is:

- the row, while it is effective;
- while a revision is open (draft or in review, opened by revise, which records `metadata.lastRevision`), the latest retained version;
- nothing for a retired document, or for one never signed.

A retained version that does not reconcile with its row refuses: another document, another organization, or not effective. Whether its approval signature still stands is decided by the existing release check (`current-release-approval.ts`), unchanged.

Readers moved onto the resolver:

- **Training context and acknowledgement** (`training.ts`). The row stays locked, and access is decided on the release read.
- **Training coverage** (`training-compliance.ts`). Receipts are matched to the exact version and digest in force.
- **Readiness** (`/qms/readiness`). The counts are now:
  - `effective`: documents in force;
  - `underRevision`: in force, with a successor open;
  - `draft`: working copies with nothing in force.
  The endpoint has no client consumer, so the new meaning breaks no screen.
- **Review-due.** A revision of an in-force SOP stays due; a first draft is not.
- **The register list.** Each row carries `in_force`.
- **The Quality register** (`SopRegister.tsx`):
  - it shows "v1.0 in force" beside the draft;
  - it dates the row by the in-force version;
  - it counts the row as effective.

The successor takes over when its own signed approval makes the row effective again. No row is rewritten: the immutable store stays immutable.

## Files

- `01-red.txt`: at `9e77eca23`.
  - Real Postgres: all 5 cases fail, 4 on the defect and the hand-over on setup.
  - The register test fails.
- `02-green.txt`:
  - real Postgres: 38/38 across this test and the three existing QMS dbtests, as `app_service` with `RLS_ENFORCE=on`;
  - unit and PGlite: 521/528.
  - The 7 failures fail identically on trunk with this change reverted (7 there, 7 here, none added).
- `03-mutation.txt`: with the resolver returning nothing for a row under revision, the four in-revision cases fail.

Two tests that pinned implementation rather than behaviour were updated:

- `mdx-qms-readiness.test.ts`. It fed the documents block an aggregate row; it now feeds register rows, and the new counts are asserted.
- `qms-document-content-access.test.ts`. Its review-due case used a first draft, which is not due; it now uses one in review. Its subject, that authored text is stripped, is unchanged.

## Found, not changed

- **Training reach depends on manual sharing.** An authored SOP version is readable only by the people its editing copy is shared with. After v2.0 is approved, trainees must be shared onto it to read it; the dbtest shares the trainee through `grantAuthoringPermission`, as the product does. Whether an effective SOP should be readable by every member is a product decision for MR-12 Stage 4 (training assignment).
- **Not covered yet.** The compliance report's controlled-documents register (`audit/compliance-reports/queries/controlled-documents.ts`) still lists the working row. It shows a document under revision as its draft, without the version in force.
