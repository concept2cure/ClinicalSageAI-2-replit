# F14: compile carries the sequence

Launch row **D2**. This is slice F14 of `docs/design/FILING_SPINE.md` §7.2, and step 5 of the proposed `docs/design/WORKFLOW_DECISION_2026-10-08.md`. It depended on F10 (`8bbb3101`) and was claimed on the board by `…session_011DpxUyQmE1enma4gTjcfBy`.

## What was wrong

- **One submission per project.** eCTD compile resolved one submission per project: the one whose application type is the project's program type (`server/services/cmc/submission-spine.ts`, `findProgramSubmission`).
- **The MAA could never be compiled.** An NDA project that also files an MAA could never compile the MAA. The MAA's sequence, opened in the Submission Center (F10), had no way onto the compile screen, and the screen compiled the NDA's latest sequence instead.
- **The same held for every read.** The status, validate and eValidator-import routes all read through the same rule.

## What changed

- **`submission-spine.ts` `resolveSequenceSpine`.** It resolves a named sequence joined to its submission, which must be anchored to the program (`submissions.program_id`).
  - Another project's sequence, a deleted one, or no such id is null.
  - A failed lookup throws. It is not "not found".
- **`server/routes/ectd-compile.ts` `spineForRequest`.** It is the one path for compile, status, validate and the eValidator import.
  - With a `sequenceId` (in the body or the query) it uses that sequence, and the route answers 404 `SEQUENCE_NOT_FOUND` when the project does not own it.
  - A malformed id is 400.
  - A named sequence with nothing placed in it is 409 `SEQUENCE_EMPTY` for compile and validate. The program's section store is not that sequence, and falling back to it would answer for something else.
  - With no sequence named, the existing spine rule stands.
  - The status response's `sequence` now carries its `id`.
- **`SubmissionSeqWorkspaces.tsx`, the Dispatch tab.** It has a new door, "Validate and compile this sequence". The door hands the sequence id to the compile screen (`stashNavParamsForTarget('ectd-compile', { sequenceId })`) and is offered only where compile is available.
- **`EctdCompile.tsx`.** It reads the sequence once, on mount, as the Submission Center reads its own (F10). Every read and write it makes then names that sequence: status, validate, compile and the eValidator import.
  - The region is the sequence's recorded one, shown instead of a selector, as it already was for the spine's sequence.
- **`ProjectMarkets.tsx`.** Its comment now says what the project-level "Compile and download" does after F14: it compiles the submission of the project's own application type, and each Dispatch tab opens compile on its own sequence. The button is unchanged.

## Red, then green

| File | Result |
|---|---|
| `red/server-red.txt` | `tests/routes/ectd-compile-sequence.test.ts` before the change: **5 of 6 fail**. The MAA id compiled the NDA, another project's id was not 404, a malformed id was not 400, the empty sequence was not refused, and the status read did not name the sequence. The no-sequence control passes. |
| `red/client-red.txt` | `ectdCompileCarriesSequence.test.tsx` before the change: **2 of 3 fail**. The screen ignored the sequence, and the Dispatch tab had no door. The no-sequence control passes. |

`tests/routes/ectd-compile-spine.test.ts` pinned the status `sequence` object exactly. It is amended to include `id`, with a dated note.

The green runs are in `green/`: the two new suites (**9 passed**: 6 server, 3 client); the affected suites (**1505 passed, 0 failed**, 101 files); `npm run typecheck`, **0 errors**. The first typecheck found one error, TS2345 at the eValidator import, and narrowing the helper's anchor to `SpineAnchor` fixed it.

## Merged with trunk (26 commits, the same day)

Trunk's `b86baf55` made a compile assemble only when the record names the application and the applicant (`server/services/ectd/package-identity.ts`).
- The two F14 cases that compile failed after the merge, because the suite's program recorded no agency number and its organization no name. The suite now records both, with a dated note. All 6 pass.
- Every package path (export, transmit, compile) reads that identity from the submission's project. F14 compiles a sequence only when its submission is anchored to the open project, so the compiled MAA names what its export and transmit would. **Open, for the package-identity rule's owner:** a project records one application number, so a second market's package (the MAA here) carries the project's number on all three paths. This merge does not change that rule.

One trunk test was red before this change: `submissionCenterLifecycleQa`, "never a placeholder". It fails on trunk's own surfaces too (`red/merge-lifecycle-red.txt`).
- The cause is F10's Test package note, which printed the dry-run token: "the server writes the application number and sponsor as UNASSIGNED".
- The note now says what that means without printing the token: "its application number and applicant are placeholders, not the ones on record". F10's own suite pins "carries no agency identifiers", and that phrase stays.

After the merge, in `green/merged-vitest.txt`: the compile routes, the compile screen, the Submission Center and the test-package suites pass. `npm run typecheck`: 0 errors. `ci:eslint-ratchet:since origin/concept2cure-v2`: no file changed its count.
