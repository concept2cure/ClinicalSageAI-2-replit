# Submission Builder study-tagging completion

Starting source: `e79626c0849f0f8c2338b32f85d4bc69bccef8f5`.
Contract: [design](../../../design/BUILDER_STUDY_TAGGING_COMPLETION_2026-10-20.md).
Execution inputs are pinned in `source-inputs.json`; final publication will
verify those bytes against the published source. Build and normal push gates
are pending at this implementation checkpoint.

## What already exists

- `shared/schema/submissions.ts` and the existing
  `migrations/20261012_submission_leaf_stf_study_tagging.sql`: both columns exist;
  no migration is needed.
  `shared/types/database.d.ts` carries the existing leaf interface and is
  completed with the corresponding optional nullable fields.
- `server/routes/submissions.ts`: governed author-only leaf PUT exists but drops
  the fields. `server/services/submission-service/submission-service.ts`: canonical
  writer/locks/state invalidation/audit exists but omits study persistence.
- `server/services/submission-service/submission-request-read.ts` and
  `server/services/ectd/core-to-packager.ts`: reads/projection already carry metadata.
- `server/services/ectd/{ectd4-validator,stf-generator}.ts`: existing coverage,
  filename and STF rendering rules; document tag recall remains unverified.
- `server/services/part11/signature-persistence.ts`: existing manifest binding
  omits study fields; it is extended rather than replaced.
- `client/src/concept2cure/v2/surfaces/SubmissionSeqWorkspaces.tsx`: existing Builder
  and history lack study controls. `SubmissionCenter.tsx` and
  `submissionScopedRead.ts` own current session/selection guards.
- Existing `VaultPlaceIntoSubmission.tsx` / `AuthoringPlaceIntoFiling.tsx` place
  leaves and `EctdCompile.tsx` displays package facts; no parallel path is added.

The design records current-code and deleted-history searches and each existing
piece's boundary. Scope is Builder metadata completion only; direct placement
fields, STF DTD conformance and the remainder of CAT2-04/MR-10 stay open.

## Completed behavior

The existing leaf PUT/writer persists the two fields. Builder edits compare the
reviewed current leaf snapshot and change only metadata/time, preserving the
placed source and its pin. Existing audit events carry before/after values;
validated sequences return to assembling. Both study values participate in the
existing signature/waiver digest; both-null legacy payloads remain compatible.

Builder displays stored values on immutable sequences. Its reason-required
editor checks exact receipts and separate leaf/transition audit outcomes.
Unknown outcomes require an explicit current-leaf read, retain entered values
and never replay automatically. Closing or confirming a no-op after recovery
refreshes current sequence/history while retaining earlier audit uncertainty.
Actor/selection generations and existing server read-selection guards apply.

## Automated verification

All commands used Node22, existing Vitest configuration and existing gates.
No new dependency, schema, baseline change, live provider or agency call.

| Evidence | Result |
|---|---|
| `logs/backend-red.log` | Before implementation:28 failed /11 passed,3 files |
| `logs/route-packager-red.log` | Before implementation:1 failed /1 passed; supplied fields stored as null; untagged 1789 refusal retained |
| `logs/ui-red.log` | Before implementation:14 failed, missing metadata controls/display |
| `logs/ui-recovery-red.log` / `ui-transition-audit-red.log` | Recovery/selection and independent transition-audit regressions fail before their fixes |
| `logs/backend-regression.log` | 150 passed /13 files; existing placement/source-pin/parent/tenant/section/state/audit controls |
| `logs/backend-final.log` | Final frozen metadata source:45 passed /3 files |
| `logs/route-packager-final.log` | Final frozen source:54 passed /5 files, including real PUT→SQL→existing projection/packager; exact `m5/.../stf-study-101.xml` emitted |
| `logs/ui-regression-refactored.log` | Final frozen source:80 passed /7 files,19 study-tagging cases and61 existing cases |
| `browser/result/result.json` | Fresh Vite process, actual Builder/real auth client with synthetic intercepted API:7 stages,4 deliberate PUTs, explicit read without replay, late receipt fenced, frozen display;20 source pins unchanged,0 page errors |

Cohorts overlap; these counts must not be added as distinct cases. Final scoped
lint has no errors; backend warnings11→11 and new metadata helpers/tests have
none. UI retains15 existing warnings after refactoring, without suppressions.

Screenshots cover a1440×1080 fixture host with the actual Submission Center CSS.
This is an automated browser fixture, not a native database browser execution
or human witnessing. Server behavior is separately tested on real PGlite SQL.
The packager run uses staging mode and does not establish DTD conformance.
See [HUMAN_CHECK.md](HUMAN_CHECK.md) for the unexecuted human scenario.
