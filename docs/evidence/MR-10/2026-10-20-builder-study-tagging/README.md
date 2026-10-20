# Submission Builder study-tagging completion

Starting source: `e 79626c 0849f 0f 8c 2338b 32f 85d 4bc 69bccef 8f 5`.
Contract: [design](../../../design/BUILDER_STUDY_TAGGING_COMPLETION_2026-10-20.md).
Implementation: `db 0d 0a 218`; bodyless-receipt correction: `b 97d 28acb`;
null-revision correction and final build: `cf 9a 57ec 1f 0c 5efb 73ada 50d 2805786d 87aefe 11`.
All 34 execution pin checks (14 implementation/test + 20 browser) match that
Git tree. See `source-inputs.json`, `browser/result/result.json` and
`qualification.json`. Corrected source compiler/push gates are pending.

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
- `server/services/ectd/{ectd 4-validator,stf-generator}.ts`: existing coverage,
  filename and STF rendering rules; document tag recall remains unverified.
- `server/services/part 11/signature-persistence.ts`: existing manifest binding
  omits study fields; it is extended rather than replaced.
- `client/src/concept 2cure/v 2/surfaces/SubmissionSeqWorkspaces.tsx`: existing Builder
  and history lack study controls. `SubmissionCenter.tsx` and
  `submissionScopedRead.ts` own current session/selection guards.
- Existing `VaultPlaceIntoSubmission.tsx` / `AuthoringPlaceIntoFiling.tsx` place
  leaves and `EctdCompile.tsx` displays package facts; no parallel path is added.

The design records current-code and deleted-history searches and each existing
piece's boundary. Scope is Builder metadata completion only; direct placement
fields, STF DTD conformance and the remainder of CAT 2-04/MR-10 stay open.

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

All commands used Node 22, existing Vitest configuration and existing gates.
No new dependency, schema, baseline change, live provider or agency call.

| Evidence | Result |
|---|---|
| `logs/backend-red.log` | Before implementation:28 failed / 11 passed,3 files |
| `logs/route-packager-red.log` | Before implementation:1 failed / 1 passed; supplied fields stored as null; untagged 1789 refusal retained |
| `logs/ui-red.log` | Before implementation:14 failed, missing metadata controls/display |
| `logs/ui-recovery-red.log` / `ui-transition-audit-red.log` | Recovery/selection and independent transition-audit regressions fail before their fixes |
| `logs/backend-regression.log` | Earlier broader cohort:150 passed / 13 files; existing placement/source-pin/parent/tenant/section/state/audit controls |
| `logs/backend-final.log` | Earlier metadata source:45 passed / 3 files |
| `logs/backend-null-revision-red.log` / `backend-compiler-fix-green.log` | Null revision refusal fails before fix; corrected final metadata 46 passed / 3 files |
| `logs/route-packager-qualified.log` | Corrected final source:54 passed / 5 files,  including real PUT→SQL→existing projection/packager; exact `m 5/.../stf-study-101.xml` emitted |
| `logs/ui-regression-refactored.log` | Initial refactored source:80 passed / 7 files |
| `logs/ui-bodyless-red.log` / `ui-bodyless-green.log` | PUT 204 red,200null control green; after fix both pass,19 unrelated cases skipped |
| `logs/ui-bodyless-final-regression.log` | Corrected final UI:82 passed / 7 files, 21 study-tagging cases and 61 existing cases |
| `browser/result/result.json` | Corrected final source, fresh Vite process, actual Builder/real auth client with synthetic intercepted API:7 stages,4 deliberate PUTs, explicit read without replay, late receipt fenced, frozen display;20 source pins unchanged,0 page errors |

Cohorts overlap; these counts must not be added as distinct cases. Final scoped
lint has no errors; backend warnings 11→11 and new metadata helpers/tests have
none. UI retains 15 existing warnings after refactoring, without suppressions.

Screenshots cover a 1440×1080 fixture host with the actual Submission Center CSS.
This is an automated browser fixture, not a native database browser execution
or human witnessing. Server behavior is separately tested on real PGlite SQL.
The packager run uses staging mode and does not establish DTD conformance.
See [HUMAN_CHECK.md](HUMAN_CHECK.md) for the unexecuted human scenario.

The final production client, server and audit-chain verifier build passed at
`cf 9a 57ec 1`. Both client/server embed that anchor; output hashes are recorded
in `qualification.json`. The earlier build log remains historical. Existing bundle-size warnings remain. The evidence
directory secret scan reports 0 leaks with the unchanged repository config.
The normal compiler and pushed-files warning ratchet must pass before publication.

The initial full compiler rejected publication with two diagnostics (nullable
revision timestamp and a Supertest helper argument). Both were corrected without
a baseline change. The new null-revision regression refuses unverifiable rows
without write, audit or demotion. The initial rejected push is retained in
`logs/initial-compiler-rejected-push.log`; the corrected build passes and final compiler/push evidence is pending.
