# F10: the Submission Center opens on the sequence, and the Dispatch tab assembles a test package

Launch row **D2**. Slice F10 of `docs/design/FILING_SPINE.md` §7.2, with F11 (assemble dry run) merged in.
§2 "Submit". Workflow: `docs/design/WORKFLOW_DECISION_2026-10-08.md` §3 step 6.

## What was wrong

- After placing a document into a sequence, "Open in Submission Center" called
  `onNav('submission-center')` and carried nothing (`AuthoringPlaceIntoFiling.tsx`, then `:387`).
- The Submission Center read no nav params. It opened on the portfolio, on whichever
  submission came first, and the person had to find the sequence again.
- The F0 gate held this as red: `placed-document-to-sequence` in
  `tests/ui/filing-path-reachability.baseline.json`.
- `POST /api/submissions/sequences/:seqId/assemble` (`server/routes/submissions.ts:1674`)
  had no client caller. The Dispatch tab could not show what an assembled package
  would contain or what would stop it being transmitted.

## What changed

- `client/src/concept2cure/v2/surfaces/AuthoringPlaceIntoFiling.tsx`
  - The placement records the submission it went into (`:312`, `:353`).
  - "Open in Submission Center" stashes `{ submissionId, sequenceId, ws: 'builder' }`
    for `submission-center` before `onNav` (`:562`). "Check filing status" (an
    unconfirmed placement) carries the sequence it was placing into.
- `client/src/concept2cure/v2/surfaces/SubmissionCenter.tsx`
  - Reads `consumeNavParams('submission-center')` once on mount (`:615`) and hands it to
    `useOpenOnNavTarget` (`:618`), after the effect that clears the sequence on a change
    of submission. Shows the hook's line under the tab bar (`:1236`). 14 lines added;
    `runGoverned` and the flow kinds are untouched.
- `client/src/concept2cure/v2/surfaces/submissionNavTarget.ts` (new)
  - `readSubmissionNavTarget` (`:37`) keeps the ids as strings and drops an unknown tab.
  - `useOpenOnNavTarget` (`:133`) opens the named submission, then the named sequence, then
    the named tab, against the rows the server returned. Nothing is guessed:
    - a submission not in the list: the list, with "The submission this link named is not
      in this list, so the list is shown.";
    - a sequence not in the submission: that submission's Sequences tab, with "The sequence
      this link named was not found in …";
    - a failed read: says the read failed, never "not found".
  - The line describes the screen it was written on. It is cleared once the person picks
    another submission, tab or sequence, and does not come back (`:175-181`).
  - `useLiveData` keeps the last submission's rows until the new read settles. In a test
    run those stale rows arrived with `loading: false` on the new submission, and a first
    version said "not found" for a sequence that was there. The hook now records the read
    as it stood on the first render on the target submission (its read cannot have started
    yet) and judges only a read that has moved on from it (`sequenceStep`, `:104`).
- `client/src/concept2cure/v2/surfaces/SequenceAssembleTestPackage.tsx` (new)
  - "Assemble a test package" posts `{}` to the sequence's assemble route through
    `mutateVerbatim` (`:123`).
  - Before the click it says this is a test package, it is discarded, nothing is sent,
    and it carries no agency identifiers: the server writes the application number and
    sponsor as UNASSIGNED (`submissions.ts:1690-1692`).
  - The result shows the server's `transmitBlockers` verbatim, one per line, and the
    counts it sent (materialized, skipped, unresolved, not approved), format, size and
    the start of the hash, labelled "test package SHA-256".
  - An empty blocker list is not an all-clear. The server checks only the placed leaves
    (`assembledTransmitBlockers`, `assemble-from-core.ts:116-146`), so the line has no ok
    tone and no check icon, and it says: "The server found nothing in the placed leaves
    that would stop transmission. The package used placeholder agency identifiers, and the
    dispatch gate on this tab still applies." (`AssembleResult`, `:76`).
  - A definite refusal (422 `ECTD_ASSEMBLE_BLOCKED`, 409, 403, …) shows the server's words
    after "No test package was assembled —" (`:152`). A blocked assembly's own audit
    outcome is read from the refusal body and shown when the row was not persisted.
    A role or validation refusal writes no such row, so nothing is said of one.
  - An outcome the client cannot judge (a 5xx, a dropped connection, an OK with no body:
    `MutateResult.unconfirmed`) says "Whether the test package was assembled could not be
    confirmed", with the server's words when it sent any, and "Check the sequence's audit
    trail before assembling again." (`:158`). It never says "not assembled": the server
    may have built the package and written its audit row.
  - An audit entry the server did not persist on a success is shown in its words
    (`auditLine`, `:60`).
  - The button is disabled and relabelled while the request runs.
- `client/src/concept2cure/v2/surfaces/SubmissionSeqWorkspaces.tsx`
  - The Dispatch tab renders the control above "Package and transmit" (`:1847`). The
    transmit sentence is untouched.
  - `MutateResult` gains `body` (`:127`): a refusal's parsed body, set on both failure
    paths (`:155`, `:178`). Additive; every existing caller ignores it. It is how the
    refusal's audit outcome reaches the control.
- `tests/ui/filing-path-reachability.baseline.json`: the `placed-document-to-sequence`
  entry is removed. No other entry was changed by this slice. The test has no ceiling to
  adjust.

## Shown

Red: `SubmissionCenter.tsx`, `SubmissionSeqWorkspaces.tsx` and `AuthoringPlaceIntoFiling.tsx`
reverted to `HEAD` with `git show`, restored after (each was checked unchanged before
restore). The tests, the baseline and the new files as in this change. Green: this change.

| Test | Before (red) | After (green) |
|---|---|---|
| `__tests__/submissionCenterOpensOnSequence.test.tsx` (8) | 7 fail: Builder not selected after placing into sequence 7; no not-found lines | 8 pass |
| `__tests__/sequenceAssembleDryRun.test.tsx` (9) | 9 fail: no "test package" text, no "Assemble a test package" button | 9 pass |
| `tests/ui/filing-path-reachability.test.ts` (21) | `placed-document-to-sequence` fails: "the Submission Center does not read a sequenceId from consumeNavParams('submission-center')" | 21 pass |

Files: `red/{submissionCenterOpensOnSequence,sequenceAssembleDryRun,filing-path-reachability}.txt`
(17 failed, 21 passed) and the same names under `green/` (38 passed).

Review round. Reviewers found that a 5xx or dropped connection read "No test package was
assembled — We cannot confirm whether the change was recorded…", that an empty blocker
list showed a green check and "Nothing in the test package stops transmission", that a
refusal's own audit outcome was dropped, and that the link's not-found line never cleared.
`red/review-round.txt` is the two test files run with `SequenceAssembleTestPackage.tsx` and
`submissionNavTarget.ts` put back to the first version: 6 of 17 fail, and the failures quote
the defects ("No test package was assembled — The service is temporarily unavailable.",
"Nothing in the test package stops transmission."). The role-refusal test passes there too;
it guards the new refusal-audit line from being said where no row is written.

Also run, in one vitest invocation (50 files, 551 tests, all passing): every test file that
imports or mocks `SubmissionCenter`, `SubmissionSeqWorkspaces`, `AuthoringPlaceIntoFiling`,
`submissionNavTarget` or `SequenceAssembleTestPackage`, `navParams.test.ts`,
`tests/ci/no-ghost-globals.contract.test.ts` and the reachability test.
`npx eslint` on each changed file: the same warning count as `HEAD`
(SubmissionCenter 5, SubmissionSeqWorkspaces 8, AuthoringPlaceIntoFiling 2); the new
files and tests have none. `npm run -s ci:undefined-css-classes` and
`npm run -s ci:canvas-path` pass. A scoped `tsc` over the changed and new files reports no
error in them.

## Not done

- F9: the project page's market row and the "Open readiness" retarget
  (`ProjectHome.tsx`). Another workflow owns that file. When the market row lands, it
  stashes the same three params and the reachability check covers it
  (`ProjectMarkets.tsx` is already in its list).
- The Submission Center does not yet read `followUp` (F15). The
  `respond-to-response-sequence` hop stays in the baseline.
- The test package is not downloadable. The route discards the staged files by design;
  the inspection download on the same tab (`PackageDownload`) is the way to get bytes.
- The test package carries no agency identifiers. The route uses
  `parsed.data.applicationId ?? UNASSIGNED-SEQ-…` and never looks up the recorded
  application number, while the inspection download resolves it (`ectd-compile.ts:992`,
  `applicationIdFor`). So the test package's hash is not the hash of anything the person can
  download; the tab labels it as the test package's own. The fix is server-side: have the
  assemble route resolve the recorded identifiers the way `ectd-compile` does.
- An unresolved leaf is named by table and row id ("vault_documents:12"), because
  `assembledTransmitBlockers` (`assemble-from-core.ts:123-126`) writes it so and
  `UnresolvedLeaf` carries no section code or title. The client shows the server's
  sentence verbatim. The fix is server-side: carry the leaf's section code and title.
