# F18: readiness is one list, and its buttons do the job (D2, 2026-10-22)

Lane: `…session_01T2wooCZu46W7msw4TJuuzr`, continuing `…01DiJJAkasGVrccrxjhYyjxG`, who claimed F18 on 2026-10-08 and has been idle since. Spec: `docs/design/FILING_SPINE.md` §7.2 F18. Launch row D2.

Commits:
- `88b068b370`: two Builder tests follow the scoped leaves read. They had been red at head since `db0d0a2187`.
- `3eb8e0eab0`: F18 (1/3), the Submission Center door carries a Builder section.
- `0d39b20cb6`: F18 (2/3), Submission Readiness is the project's markets in one list.
- This commit: F18 (3/3), evidence and the records that describe the screen.

## What already exists

Inventoried at `e20c7b0901` before any design, by four read-only readers. Each claim below was then checked against the code.

| Piece | What it did | What it did not do |
|---|---|---|
| `surfaces/DispatchReadiness.tsx` | Gated one sequence: the submission of the program's own type, found in the organisation's unscoped `/api/submissions` (`useProgramSequence`). It drew the server's gate cards and named-rule findings. | It did not list the other markets. "Fix" and "Prepare governed transmit" called `onAsk(…)`, a sentence in the chat, and opened nothing. |
| `surfaces/ProjectMarkets.tsx` + `useProgramMarkets` (`programSequence.ts`) | One row per market from the scoped `GET /api/submissions?programId=`, each with its latest sequence's server verdict (F9). | It had no gate cards and no findings. It was mounted on the Submit tab only. |
| F10 door: `stashNavParamsForTarget` → `consumeNavParams` → `readSubmissionNavTarget` → `useOpenOnNavTarget` | Opened the Submission Center on a submission, sequence and tab. | It carried no section, so it could not open the Builder at the section a finding names. |
| Builder `AddLeafForm` (`SubmissionSeqWorkspaces.tsx`) | Places a leaf at a section, with reason and study tagging. | It always opened closed and empty. |
| Dispatch tab (`DispatchWorkspace`, `TransmitPanel`) | The governed dispatch and transmit, each behind its e-signature. Transmit is offered once the sequence is dispatched. | Nothing. It is reached unchanged. |
| `ValidationWorkspace` | The same findings for one sequence. | Nothing. It is the destination for findings a placement cannot change. |

`git log --all --diff-filter=D` on `*DispatchReadiness*`, `*dispatchReadiness*`, `*programSequence*` and `*SubmissionReadiness*` finds only the 2026-04..06 dead-code purges.

The work was a completion: the screen **converges** onto `useProgramMarkets`/`MarketsBody` and **reaches** the Builder, Validation and Dispatch through the F10 door. No second list, door or verdict was built.

## What changed

- **The list.** The screen lists every market of the project from the scoped list. Under each row are its gate cards, its structural findings and their acts. The organisation's unscoped list is never read.
- **Where each finding's act goes** (`readinessFindingActs.ts`, which routes and computes nothing):

| Error finding | Opens | Why |
|---|---|---|
| `MISSING_REQUIRED_SECTION`, `IND_MODULE3_REQUIRED` | The Builder's placement form, Section filled in | Nothing is placed there. A placement clears it. |
| `EMPTY_SEQUENCE` | The placement form, no section | Nothing is placed. |
| `UNRESOLVED_DOCUMENT`, `DOCUMENT_CONTENT_MISMATCH`, `UNPLACEABLE_DOCUMENT_TABLE`, `EXTERNAL_DOCUMENT_NOT_MATERIALIZABLE`, `INVALID_LIFECYCLE_OP`, `LIFECYCLE_OP_IN_ORIGINAL` | The Builder, with that placed leaf marked | The defect is on a placed leaf. A new placement would only add a second leaf. |
| `CROSS_REFERENCE_LOA_MISSING`, `SEQUENCE_NUMBER_FORMAT`, `JP_ECTD_V4_REQUIRED`, any unknown code | Validation | A placement does not change these. Sending them to the Builder would be a false fix. |

  Warnings and infos get no act, as before.
- **The arrival** (`builderSectionArrival.tsx`). On arrival a focused line says what was opened. For a frozen or dispatched sequence it says that no leaf can be placed; when the leaves could not be read it says the section was not opened. It is applied once per hand-off.
- **The dispatch door.** A cleared gate opens the sequence's Dispatch tab. The button reads "Open governed transmit" once the sequence is dispatched. Otherwise it reads "Open Dispatch for sequence 0000", with "Transmit opens once sequence 0000 is dispatched. Dispatch and transmit each take your Part 11 e-signature on the Dispatch tab." Nothing on this screen signs.
- **What AnA is told.** Each market. `cleared` and `blockers` appear only where the server stated a gate, and a market whose verdict was not read has `answered: false`.
- **A defect found on the way.** The markets read started only after the project read, so the list showed one commit of "No market for this project yet" before any read began. The two reads now start together. The test `the list is never "no market" before it has been read` covers this, and mutation 9 below shows it red.

## Red, then green

| Test | At head | Now |
|---|---|---|
| `__tests__/submissionCenterBuilderSection.test.tsx` (new) | 9/9 red (`red-builder-section-at-head.txt`) | 10/10 (`green-builder-section.txt`). The `m1.3.1` case was added after a mutation survived, see below. |
| `__tests__/dispatchReadinessActs.test.tsx` (new) | 13/13 red (`red-acts-at-head.txt`) | 13/13 |
| The seven readiness tests, re-pointed to the scoped list, plus the Acts test | — | 51/51 (`green-readiness-list.txt`) |
| Every client test that renders the Submission Center, the Builder or the nav target (31 files) | 5 red at head, the stale scoped-read assertions, fixed in `88b068b370` | 317/317 |
| Every client test that touches the readiness screen, ProjectMarkets or programSequence (25 files) | — | 210/210 |

**Mutations**, each applied alone with the file restored after:
- `mutations-builder-section.txt`: ten, all red. One, "row code compared as written", first survived because the fixture's leaf code was already canonical, so the `m1.3.1` case was added.
- `mutations-readiness-list.txt`: ten, all red. Among them:
  - a letter of authorization sent to a placement;
  - a leaf defect sent to a new placement;
  - warnings given an act;
  - the section not carried through the door;
  - the first market's sequence opened for the second;
  - transmit promised before dispatch;
  - the door shown on a blocked gate;
  - `cleared:false` published for an unanswered market;
  - the deferred markets read;
  - the old chat `ask`.

**Gates:** `ci:launch-scope`, `ci:launch-scope-api` (421 paths, none refused), `ci:phantom-tokens` (9, the baseline), `ci:design-system` and `ci:pushed-typecheck` (0 errors). The ESLint per-file ratchet is unchanged: `SubmissionSeqWorkspaces.tsx` has 7 warnings and `DispatchReadiness.tsx` 2, both the same as at head.

## Records changed with the screen

- `docs/validation/URS-005-SUBMISSION-READINESS.md`, URS-SRDY-007: the surface lists every market of the open project, each with its newest sequence and gate verdict. The code reference is updated.
- `docs/validation/OQ-005-SUBMISSION-READINESS.md` and `tests/validation/oq/submission-readiness/run.mjs`, OQ-SRDY-07: the note describes the scoped list. The step's check (`/0000/`) is unchanged, and so is its result.
- `shared/navigation/index.ts`: the `dispatch-readiness` description.
- **Not regenerated: `docs/validation/TM-001-TRACEABILITY-MATRIX.*`.** `npm run validation:traceability` (with `VALIDATION_RUN_DATE=2026-09-27`, the run it was last built from) exits 1 because URS-CMC-001…030 have no RA-001 row. That is the CMC lane's gap, and the matrix is not rebuilt over it. URS-SRDY-007's new wording reaches TM-001 at the next regeneration. `ci:validation-traceability` passes: every cited file resolves. It first failed on a relative citation in this change, which was then fixed.
- `docs/design/FILING_SPINE.md` §7.2: F18 status and its stale line references.

## Handed on

- **No client screen files a cross-reference letter of authorization.** `POST …/file-loa` (`server/routes/ind-lifecycle/registers.routes.ts`) has no caller, so the Validation destination for `CROSS_REFERENCE_LOA_MISSING` explains the finding but cannot close it. Owner: the IND lifecycle lane.
- **A gate blocked only by the release signature that dispatch itself applies** (`awaitingOwnSignature`, `SubmissionSeqWorkspaces.tsx`) gets no Dispatch door on this screen; it reads as blocked. The Dispatch tab handles it. Whether readiness should offer that door is a product question.
- **The scoped list deliberately sends no `meta.notOffered`.** `server/routes/__tests__/submissions-request-current-access.pglite.test.ts:96` pins its absence, so the submissions of projects the person cannot access are not counted to them. The client's "N submissions in this organisation are not recorded to this project" line (`ProjectMarkets.tsx` `notOfferedLine`) therefore never renders in production. Removing it belongs to the Submit tab's owner. No F18 test depends on it.
