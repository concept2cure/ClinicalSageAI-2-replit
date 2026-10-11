# F9: Submit shows one row per market, each with its own server verdict, and the header states them

Launch row **D2**. Slice F9 of `docs/design/FILING_SPINE.md` §7.2. §2 "Project header" and
"Submit", §6 row 12, slice-24 row of §7.1. Workflow: `docs/design/WORKFLOW_DECISION_2026-10-08.md`
§3 steps 2 and 6.

## What was wrong

- The Submit tab showed one dispatch verdict per project. The gate read only the submission
  of the project's own application type (`findProgramSubmission`, `surfaces/programSequence.ts`).
- A project filing an IND to FDA and an MAA to EMA had a verdict for the IND and none for the
  MAA. The MAA sat in a second panel, "Submissions", with no verdict.
- The two panels could contradict each other. Slice 24's review had to add words so the
  readiness panel did not say "no submission" over a list that showed one.
- The project header said nothing about where the filing stood. The design asks for one line:
  each market's verdict and the number of documents in review.

## What changed

- `client/src/concept2cure/v2/surfaces/programSequence.ts`
  - `useProgramMarkets` (`:578`). It reads the project's markets from the scoped list
    (`GET /api/submissions?programId=`), then each one's latest sequence, then that sequence's
    verdict from `GET /api/submissions/sequences/:seqId/dispatch-readiness` (`readMarket`, `:563`).
  - A sequence list with no body (a 204) is "No verdict", not "No sequence yet" (`:566`), the
    same rule `findLatestSequence` applies to the same endpoint.
  - Each market's reads succeed or fail alone. `retryMarket` reads one market again and
    leaves the others alone. An older answer is dropped when a newer read was asked.
  - The verdict is the server's composed gate (`serverGate`), never recomputed. A 200 with no
    gate is unanswered, not cleared.
  - `latestSequenceOf` (`:302`) is the one rule for "the latest sequence". The readiness
    screen's discovery (`findLatestSequence`) now uses it too.
  - `useProgramSequence` and `useSequenceDispatchReadiness` are unchanged; the readiness
    screen (`DispatchReadiness.tsx`) still uses them.
- `client/src/concept2cure/v2/surfaces/ProjectMarkets.tsx` (new). Generalised from slice 24's
  `ProjectSubmitStage`, `ProjectReadiness` and `ProjectSubmissions`, which are deleted from
  `ProjectHome.tsx` in the same change.
  - `ProjectMarkets` (`:299`): one row per market (`MarketRow`, `:193`).
  - Each row: application type and agency ("IND · FDA (US)"), submission status in words, its
    lifecycle stage ("original stage", `:214`, as slice 24's row showed it), title,
    "Sequence 0000 · Assembling · 14 leaves", the verdict in words, the server's
    blockers verbatim, what a cleared verdict did not assess, the structural counts, and the
    F19 support line (`MarketSupportLine`, reused).
  - Verdict words (`marketVerdict`, `:99`): "Dispatch blocked · 2 blockers", "Cleared to
    dispatch · 1 gate not assessed", "No sequence yet", "No verdict from the server",
    "No verdict · the readiness read failed" with a Retry on that row.
  - The announced verdict names its market (a visually hidden "IND · FDA (US):", `:222`), so a
    screen reader hears which market each verdict belongs to.
  - Retry moves focus to the row's verdict before it unmounts (`:204`), so focus does not fall
    to the page body. The header line's Retry buttons do the same, onto the line (`:380`).
  - Opening a row (`openSubmissionCenter`, `:175`; `marketTarget`, `:186`) stashes
    `{ submissionId, sequenceId, ws }` for `submission-center` and opens it. `ws` is
    `validation` when the server blocked dispatch, otherwise `sequences`. The Submission
    Center reads this through `submissionNavTarget.ts` (F10).
  - "Add a market" (primary, beside "Open Submission Center") stashes `{ ws: 'portfolio',
    newSubmission: '1' }` and opens the Submission Center, which opens New submission on
    arrival when a project is open (`SubmissionCenter.tsx`, `newOpen` initial state). The form
    takes the project's filing (F20). Landed with this slice, after the review removed a
    button that could not yet do its job.
  - A project with no market says "No market for this project yet" and, when the Submission
    Center is available, "Add a market to start one."
    When the server counts
    submissions the project scope left out (`meta.notOffered`), it says how many and that a
    submission is never matched to a project by name.
  - A 403 on the list is the person's role (`GET /api/submissions` requires
    `regulatory-author`; a viewer has none). The Submit tab says so in words with no retry;
    the header line shows nothing for markets and no alert (`marketsForbidden`, `:256`).
  - `ProjectStatusLine` (`:375`): the header line, a named group (`role="group"`, `:409`).
    Each market's verdict, and "N documents in review". N counts only the board rows still out
    for review (`:365`): waiting on the person, in review, or reviewers approved with sign-off
    pending. Approved, declined and changes-requested rows are on the board but are not
    counted. The rule is ProjectHome's `isOutForReview` (`ProjectHome.tsx:1053`), built on the
    Review tab's own `reviewGroupOf`, so the line and the tab cannot disagree. Loading and
    failures are stated, each with a retry. No figure is computed beyond counting rows the
    server returned.
  - "Open readiness" and "Compile and download" are kept where they were. F10 retargets "Open
    readiness"; F14 moves compile.
- `client/src/concept2cure/v2/surfaces/ProjectHome.tsx`
  - `useProgramMarkets(pid)` and `useProjectReviews(pid)` are called once in `ProjectHome`
    (`:1671-1672`). The header line (`:1934`), the Submit tab (`:1995`) and the Review tab use
    the same reads. The board was read by the Review tab (F7); it is now read once and shared,
    so the header does not read it a second time.
  - About 240 lines of slice-24 components are gone (`:238` keeps a pointer to where they went).
- `client/src/concept2cure/v2/styles/project-home-v2.css`: rules for the row verdict, blocker
  list, notes and the header line (`:451` on), a focus ring for the verdict and the line, and
  `.pj-sr` (visually hidden, `:476`). Each verdict has an icon and words, not colour
  alone. Regenerating the surface-text ramp produced no change, so these rules did not alter it.

## Shown

| Test | Before (red) | After (green) |
|---|---|---|
| `client/src/concept2cure/v2/__tests__/projectMarkets.test.tsx` (new, 11 cases): IND/FDA blocked by 2 blockers and MAA/EMA with no sequence on their own rows, with the lifecycle stage and the market named in the announced verdict; a 500 on one verdict is "No verdict" with a retry on that row only, never "Cleared", and Retry keeps focus on the row; a 204 sequence list is "No verdict", not "No sequence yet"; the row's open stashes `{submissionId:'61', sequenceId:'905', ws:'validation'}` and `{submissionId:'62', ws:'sequences'}`; "Add a market" stashes `{ws:'portfolio', newSubmission:'1'}` and "Open Submission Center" stashes `{ws:'portfolio'}` (as amended when the button landed); the empty state offers Add a market; a 403 is the role, with no retry and no header alert; a failed list read; the header is a named group with both verdicts and "3 documents in review" from five board rows, with one board read and one verdict read; ten approved documents are "No document in review"; a failed verdict in the header | `red/projectMarkets.txt`: 11 failed of 11 (HEAD sources) | `green/projectMarkets.txt`: 11 passed |
| The same file, with each review fix reverted alone (the fix's code put back as it was, then restored) | `red/review-fixes-mutations.txt`: every one of the 8 reversions fails at least one case: the count (2), "Add a market" (2), the 204 (1), the 403 (1), the focus (1), the lifecycle stage (1), the announced market name (1), the line's role (1) | `green/projectMarkets.txt` |
| `client/src/concept2cure/v2/__tests__/projectHomeSubmitStage.test.tsx` (slice 24, re-pointed onto the rows, 14 cases, none deleted) | `red/projectHomeSubmitStage.txt`: 12 failed, 2 passed | `green/projectHomeSubmitStage.txt`: 14 passed |
| Every `projectHome*` file, `projectMarkets`, `dispatchReadiness*`, `marketSupportLine`, `projectDocumentDisposition`, `conversationFilesAdopt`, `anaDrivesWave5`, `tests/ui/filing-path-reachability.test.ts` | — | `green/affected-suites.txt`: 30 files, 191 passed |

Also run: `npx eslint` on each changed file (ProjectHome.tsx 7 warnings, as at HEAD;
programSequence.ts 0; ProjectMarkets.tsx 0; both test files 0); `npx tsc --noEmit -p .`, no
error in any changed file; `npm run -s
ci:undefined-css-classes` OK; `node scripts/design/generate-surface-text-ramp.mjs` then `npm run
-s ci:surface-text-ramp` OK, no change to the generated sheets.

The F0 reachability gate (`placed-document-to-sequence`) reads `ProjectMarkets.tsx` and
requires every link to the Submission Center to carry a `sequenceId`. Both links go
through `openSubmissionCenter`, which names every key the Submission Center reads; a key
with no value is sent empty and `consumeNavParams` drops it.

## "Add a market", landed with the slice

| Test | Against HEAD `SubmissionCenter.tsx` | After |
|---|---|---|
| `submissionCenterNewFromProject.test.tsx` › "Add a market" opens New submission on arrival: with the project open, the form is open on arrival on the project's NDA · FDA filing; with no project open, nothing opens | the first fails: `Unable to find a label with the text of: /Title/` (`red/add-a-market-opens-new-submission.txt`); the second passes on both | 11 of 11 pass |
| `projectMarkets.test.tsx` › "Add a market" stashes `{ ws: 'portfolio', newSubmission: '1' }`; the empty state offers it | — | 11 of 11 pass |

Run after: every `projectHome*`, `projectMarkets`, `dispatchReadiness*`, `marketSupportLine`, `submissionCenter*`, `sequenceAssembleDryRun`, `review*` test, the reachability gate and `surface-registry-coverage`: 51 files, 349 of 349 pass. ESLint: `SubmissionCenter.tsx` 5 (HEAD 5), `ProjectHome.tsx` 7 (HEAD 7), the new files 0. `ci:undefined-css-classes` and `ci:surface-text-ramp` pass.


## Not done

- The header line does not yet carry the IND dates step 2 of the workflow names (30-day
  clock, annual report, open letters). Those come from the IND engines and are not in F9.
- Each market costs two reads (sequences, then verdict). A project with many markets makes
  that many reads on every visit to the project page. A server route that returns each
  market's latest sequence and verdict in one response would remove it (F22 territory).
- AnA's context for the page does not yet list the markets' verdicts.
- The review board read is not checked for a viewer's 403 the way the markets list now is.
  The board route was not traced for that role in this slice.
