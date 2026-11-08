# 3b slice 3 (c): a project that is not an application is not compiled as an eCTD sequence, and keeps what it filed (P-97, 2026-11-08)

The last half of 3b slice 3, "a project that is not an application never becomes one" (`../README.md` §i). Half (a)
is `9c05a6ac8` and half (b) is `63e51b02e`.

The filing types session (011Fyq) wrote edits 4–9 and the doors' cases, in
`docs/evidence/RIM/2026-11-08-designs/filing-types-3b-slice3-handoff.md`. The RIM session applied them under founder
decision **P-97** (`docs/LAUNCH_DEFINITION_OF_DONE.md`, 2026-11-02, "Keep filed state regardless"):

- compile, status and validate refuse a filing-class or regional device project with 422 `ECTD_NOT_APPLICABLE`;
- a project with any dispatched sequence keeps its filed-state view, read-only;
- the deployed-row query is not a precondition.

## What already exists (RULE 3)

- `refuseRegionalDeviceEctd` (`server/routes/ectd-compile.ts`) refused only a regional device project, at the compile,
  status, validate and filed-state doors.
  - A CSR or PAS project passed all four.
  - Compile built a draft backbone against the ICH CTD baseline, labelled "not this document's requirement set", and
    inserted an `ectd_compilations` row. Status, validate and filed-state all answered.
- `classNotSequencedReason`, `filingDocumentClassOf` and `filingTypeInSentence`
  (`shared/regulatory/filing-document-classes.ts`) already give the class sentence. `createSubmission` and
  `add-project-market.ts` already refuse with it.
- `resolveSubmissionSpine` resolves a spine only for a drug application type, so a class project's filed state read
  nothing unless a sequence was named. `resolveSequenceSpine` already resolves a named sequence of any project.
- `FILED_DISPATCH_STATUSES` (`server/services/submission-service/filed-dispatch.ts`) is the one filed rule.
- Client:
  - `EctdCompile.tsx` read status, compile and validate through `readJson`, which drops a refusal's body, so a 422
    read as "could not be read", "HTTP 0" or "HTTP 422".
  - `readJsonKeepingError` already exists beside it and keeps the body.
  - `EctdModuleReadiness.tsx` and `EctdFiledState.tsx` had no state for "not compiled as an eCTD sequence".

## The change

**Server (`server/routes/ectd-compile.ts`)**
- Edits 4–9, verbatim: `refuseRegionalDeviceEctd` becomes `refuseNonApplicationEctd`, which also refuses a filing
  document class with the class sentence. The regional sentence and the four call sites are unchanged.
- The sentence is factored into `nonApplicationEctdMessage` so the filed-state door can reuse it.
- **P-97 at the filed-state door.**
  - For a project that is not an application, `dispatchedSequenceOfProject` reads the latest sequence of any
    submission anchored to the project that was dispatched: `status = 'dispatched'`, or a filed `dispatch_status`.
    A program anchor is matched by its id, a numeric one by the program its project names.
  - None: 422 with the sentence.
  - One: the filed state is read. If no sequence is named, the submission that holds that sequence is folded, since
    the type resolves no spine. Nothing filed is hidden.
  - A failed read of that question is 503 `FILED_STATE_UNAVAILABLE`, never a refusal or an empty answer.

**Client (behaviour and words only; no layout or class change)**
- `EctdCompile.tsx`: status, compile and validate read through `readJsonKeepingError`.
  - A 422 `ECTD_NOT_APPLICABLE` puts readiness in a `not_applicable` state, holding the server's reason.
  - Compile and validate show that reason, never "HTTP 0" or "HTTP 422".
  - The conversation's summary says it in words, and the set-region action answers with it.
  - Those sentences are small helpers, so no function's complexity grew and the file's ESLint warning count is HEAD's.
- `EctdModuleReadiness.tsx`: shows "Not compiled as an eCTD sequence", with the reason, using the existing
  `EmptyState`.
- `EctdFiledState.tsx`: shows "Nothing is on file for this project", with the reason. It is not "didn't respond" and
  offers no retry.

There is no migration, no new non-test file, and no new route, token or screen.

## Proof

| File | What it shows |
|---|---|
| `red.txt` | `class-project-never-an-application.test.ts` before the server change: 13 of 18 fail. The creators' 4 and the regional sentence pass |
| `red-client.txt` | the three client cases before the client change: 3 fail |
| `red-db.txt` | real PostgreSQL 16, as `app_service` under RLS: the two P-97 cases fail against the route at HEAD |
| `green.txt` | after: 30 files, 351 tests. These are that file, all 16 `ectd-compile` route test files, every eCTD client test and `clientCopyNoProgram` |
| `green-db.txt` | real PostgreSQL: 7/7. A CSR project that filed shows what is on file; one that never filed is refused by name |
| `mutation-1…4` | server: a class project compiles; a filed project refused anyway; filed-state never refused; no spine for the dispatched sequence. Each is red on its own cases |
| `mutation-c1…c3` | client: the readiness reason ignored; the filed-state reason ignored; the validate reason ignored. Each is red |
| `gates.txt` | `ci:one-product`, `ci:sql-interpolation`, `ci:class-vocabulary`, `ci:undefined-css-classes`, `check:catalog-copy`, `ci:drizzle-tenant-scope`, `ci:session-scoped-rls-bypass`, `ci:json-operator-types`, `ci:discarded-audit-write`: all exit 0 |

Every mutation file records the restored file's sha256 against the original.

## Not covered

From the handoff, unchanged:
- Submissions already anchored to a class project keep their sequences: assemble, freeze, dispatch and transmit key on
  the submission.
- `GET /history` is not refused.
- Non-regional device projects (510(k), PMA) are still not refused.

Found here, pre-existing:
- A numeric (legacy) anchor resolves no spine for any project type, so its filed state reads nothing. That is
  unchanged.
- If a project's dispatched sequences span two submissions, the latest one's submission is read when no sequence is
  named. Naming a sequence reads its own.
