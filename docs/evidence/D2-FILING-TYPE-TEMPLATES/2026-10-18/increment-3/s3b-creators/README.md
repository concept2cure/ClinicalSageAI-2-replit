# 3b slice 3 (b): no creator writes a submission into a project that is not an application (2026-11-08)

Part of 3b slice 3, "a project that is not an application never becomes one" (`../README.md` §i). The filing types
session (011Fyq) wrote the edits and the red cases; the RIM session applied them inside its hold on
`submission-service.ts`, after F1 slice 2 (`eac69256c`). The cases and edits are those in
`docs/evidence/RIM/2026-11-08-designs/filing-types-3b-slice3-handoff.md` (edits 1–3). Half (a) is `9c05a6ac8`; half (c),
the eCTD doors and the client's handling of their 422, follows as its own change.

## What already exists (RULE 3)

- `refuseDocumentClassProject` (`server/services/submission-service/submission-service.ts`, 2026-10-29) refused a
  filing document class project, but only from `createSubmission`.
- `createSubmissionTx`, the transactional creator `ensureSubmissionSpine` uses, called only `refuseForeignProgram`, so
  it wrote a submission into a CSR project.
- Neither creator read a regional device project's `program_type`. `insertSubmissionRow` refuses only a regional
  device application *type*, so `POST /api/submissions` anchored an IND to a shonin project. That is reachable from
  `SubmissionCenter.tsx` `postNewSubmission` with no project open.
- `add-project-market.ts` already refuses a market for both kinds (`DEVICE_PROGRAM`, `NOT_AN_APPLICATION`).

## The change

- `refuseDocumentClassProject` is extended in place and renamed `refuseNonApplicationProject`. It also refuses a
  regional device preparation project (`DEVICE_PREPARATION_ONLY`, 422, already mapped), and `createSubmissionTx` calls
  it on the caller's client, so a project inserted earlier in the same uncommitted transaction is seen.
- Nothing else changes. Neither name is referenced outside the file (`git grep`). The code-to-status map is the
  existing `SUBMISSION_ERROR_STATUS`. There is no migration and no new non-test file.

## Proof

| File | What it shows |
|---|---|
| `red.txt` | `class-project-never-an-application.test.ts` before the edits: 3 of 4 fail; the IND control passes |
| `green.txt` | after: that file, `regional-device-preparation-creation.test.ts` and `document-class-not-an-application.pglite.test.ts`, 71/71 |
| `mutation-1-transactional-creator-does-not-ask.txt` | the transactional creator's call removed: its two cases fail |
| `mutation-2-regional-device-project-not-refused.txt` | the regional device branch removed: both shonin cases fail |
| `pre-existing.txt` | `projects-create.test.ts` (1) and `irb-ibc-create-tools-record-unstated-as-null.test.ts` (4) fail identically without this change |

Every test that names `createSubmission`, `createSubmissionTx` or `ensureSubmissionSpine` (16 files) was run: 375 pass,
and the 5 failures are the pre-existing ones above.

## Not covered (from the handoff, unchanged)

- Submissions already anchored to a class project keep their sequences: assemble, freeze, dispatch and transmit key on
  the submission.
- `assertMayAnchorTo` still admits a legacy 'csr'-typed submission into a CSR project.
- Non-regional device projects (510(k), PMA) are still not refused a drug submission.
- Cost: intake and Add a market each make one extra indexed SELECT per spine creation. Neither reaches the refusal,
  since intake makes spines only for drug application types and add-project-market refuses both kinds first.
