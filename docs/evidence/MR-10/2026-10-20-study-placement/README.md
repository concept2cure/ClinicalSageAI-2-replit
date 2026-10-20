# Complete existing study placement inputs

Starting source: `4282257ac`. Contract:
[STUDY_PLACEMENT_COMPLETION_2026-10-20.md](../../../design/STUDY_PLACEMENT_COMPLETION_2026-10-20.md).
W5/D7, MR-10 Stage 1 input portion. Implementation and verification pending.

## What already exists

- `shared/schema/submissions.ts`, existing migration and
  `shared/types/database.d.ts`: study fields already exist.
- `server/routes/submissions.ts` and canonical `submission-service.ts`: governed
  metadata persistence, locking, audit, source pins and signature-sensitive edits
  already work. No writer/store/migration is added.
- `server/services/ectd/{core-to-packager,stf-generator,ectd4-validator,ectd-regional-rules}.ts`:
  existing projection, filename and STF coverage/rendering rules; pure rules are
  reached by the browser with server re-exports preserved.
- `server/services/ana/{AnaToolDefinitions,AnaToolExecutor}.ts`: direct packaging
  accepts metadata but does not persist the human placement path.
- Existing `SubmissionSeqWorkspaces.tsx` Builder editor has controlled study
  fields; AddLeafForm does not. Existing `VaultPlaceIntoSubmission.tsx` and
  `AuthoringPlaceIntoFiling.tsx` lack metadata inputs. Extend these forms.
- Existing `filingTarget.tsx` field kit, reason/target controls and pointer receipt
  guard are reused/extended; existing viewer, history and scoped reads remain.

The contract records searches including deleted history, existing behavior and
explicit file ownership. DTD conformance, agency acceptance and human witnessing
remain open; this slice completes placement inputs, not all of CAT2-04/MR-10.
