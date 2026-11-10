# D2: CSR draft control, slice 2. The engine figure gate on AnA's drafts in CSR results sections

Launch row D2, plan package L1, workstream W1 (Authoring). Spine step 5: AnA writes, citing each figure's source; a
number that is not from the engine is never accepted silently. Design: `docs/design/CSR_DRAFT_HUMAN_CONTROL_2026-10-29.md`,
"Slice 2", bound by its "Decisions on slice 1's questions" (3 and 6) and "Slices 3 and 4: status and decisions" (2 and 4).

This work **completes** the existing draft route and its accept, and the one review panel. It **reaches** the saved-CSR
verdict's figure step from them, by an export of that step and nothing else. It adds no route, mount, service, table,
migration, model, AnA tool, screen, card, banner or CSS.

## What already exists

Searches run on 2026-11-06 at `2d87b27fb` across `client/src`, `server` and `shared` (`*.ts`, `*.tsx`): `CSR_FIGURE`,
`csrFigures`, `csr_figures`, `NOT_FROM_ENGINE`, `optionSet`, `option_set`, `figureMarks`, `unclaimedFigures`,
`planSections`, `planSection`, `importedCsrEvidence`, `findUnclaimedNumbers`, `unverifiedFiguresAtSigning`,
`checkSectionFigures`, `engine figure`, `not from the engine`, `chose 2 of 3`, `of 3, concise`. Results are in
`searches.txt`. Deleted files: `git log --diff-filter=D --name-only` over `client`, `server` and `shared`, filtered on
`figure`, `unclaimed`, `claim`, `csr-saved`, `draft-alt` and `option-set`. This clone is shallow (history from
2026-10-22); the only hit is an unrelated Vault test (`VaultSurface.noUnbackedClaim.test.tsx`). The design's own
deletion search (2026-10-29, on a full-history clone) found nothing that gated a candidate's figures.

**The figure checks, which this work reuses and does not copy**

- `server/services/ana/csr-saved-evidence.ts` (CSR lane; this lane holds its exports only):
  - `importedCsrEvidence(provenance)` reads the claim receipts a CSR import carried, by section code
    (`importSource.kind === 'csr'`, `sectionOrigins[].csrEvidence`).
  - `planSections` / `planSection` (private before this work) is the verdict's **figure step**. For each section it runs
    `findUnclaimedNumbers` over the section's readable text against that section's claimed cell values and, outside
    §§10–13, its study-information numbers; in §2 it adds `unclaimedCsrSynopsisResults` (observed synopsis clauses,
    without the metadata exemption). Its `results` flag is the `RESULTS` rule (`^(?:2|1[0-3])(?:\.\d+)*$`), widened on
    2026-11-03 (`da5fc35c4`) to uncoded sections added in the editor.
  - `assessSavedCsrEvidence` turns those plans into `unclaimedFigures: [{ section, figure, blocking: results }]` and the
    document verdict. **It runs on the saved document only** (critique and release, `saved-document-critique.ts`, and the
    section review, `saved-section-writing-review.ts`). Nothing ran it on a candidate before accept.
  - The CSR lane's changes of 2026-11-03 to 11-05, read for what each decided: `ae56fc26d` and `d61c7bc48` (no metadata
    exemption for an observed result in §§10–13, at import and at saved review); `da5fc35c4` (an uncoded section's
    numbers block: no E3 code is no exemption); `31b3848bd` (§2's observed synopsis clauses are re-checked without the
    planned-size exemption); `30cf348d4` in `unsupplied-statistics.ts` (an unclaimed death figure is an unreconciled
    figure). Each of these is inside `planSection`, so a candidate checked by it inherits every one.
- `server/services/csr/unsupplied-statistics.ts` `findUnclaimedNumbers`: every number a prose text states that the
  supplied set does not carry, with cross-references ("Table 14.3.1", "§12.2.1") and structured identifiers ("LMN-201",
  "NCT…") excluded. Used here only through `planSection`.
- `server/services/authoring/draft-figure-check.ts`: `checkSectionFigures` (each figure of a drafted section against the
  excerpts it cites, at save) and the P-89 signing gate `unverifiedFiguresAtSigning` (`ae3681cb9`,
  `docs/evidence/D5-SIGNATURE-FIGURE-GATE/2026-11-01/`): an approval or seal is refused while the signed text states a
  figure its cited sources do not hold, unless each is acknowledged. **Both are about cited Data Room sources, not CSR
  engine cells**, and both run on saved text. This slice leaves them as they are; they still apply after accept.
- The draft route's own answer check: `POST /api/authoring/sections/:sectionId/ai/draft`
  (`server/routes/authoring.router.ts`) files each draft in a turn record and checks it against the excerpts the model
  was shown (`draftTurn.drafted` → `verifyTurnAnswer`, returned as `draft.check`, rendered by `AnswerCheckRows`). It
  names a figure no excerpt holds as "not found". **It does not** compare a figure with the CSR's engine cells, and it
  decides nothing.

**The doors this work completes**

- The draft route (above), with slice 3's `revise` (`draftRevisionFor`, a new candidate with `derivedFrom`) and
  slice 4's `passage` (`draftPassageFor`, never parked). Before this work its answer carried no CSR figure finding.
- `POST …/ai/draft/accept` consumes the single-use candidate in the section transaction, saves the content **the person
  sent** (`req.body.content`, their edits included), records lineage, the revision, the filing and the Part 11 audit row
  with the generator and `draft_modified_on_accept`. Before this work it accepted any figure, and its audit row did not
  name the option set the accepted text came from (slice 1's open question 3, decided by the lead: "alternative 2 of 3,
  concise").
- The panel: `surfaces/AuthoringAiDraft.tsx` (whole draft, "Draft three alternatives", the editable body, accept),
  `editor/DraftAlternatives.tsx` with `editor/draftAlternatives.ts` (picker, compare, revise, chosen paragraphs through
  `EditorBridge.propose`), `editor/DraftPassage.tsx` with `editor/draftPassage.ts` (passage alternatives through the same
  door), `editor/useAuthoringDraftReview.ts` and `editor/authoringDraftTransport.ts` (state, request, accept). Before
  this work none of them showed or acted on a CSR engine figure.
- Saved-CSR and P-89 gates after accept: the saved verdict at critique, section review and release
  (`assessSavedCsrEvidence`), and P-89 at approval and seal. They are unchanged and still apply to whatever is accepted.

**Slices 3–4 decision 4 (the assembly "Review" edge)**

- `onReviewSection` is `client/src/concept2cure/v2/editor/DocumentWorkbench.tsx:2327` (it calls
  `requestLeaveRef.current({ kind: 'section', id, mode: 'section', draftReview: true })`), and the passage state is
  `draftPassage` at `DocumentWorkbench.tsx:1395`, cleared on a section change (:1396) and on close (:1397). This lane
  does not hold `DocumentWorkbench.tsx`, so the fix is recorded below, not made.

## What this change does (the server half, and the accept's words in the panel)

1. **Each draft carries its CSR figures.** In a section of a document with CSR import receipts, every answer of
   `POST …/ai/draft` carries `csrFigures`. That covers the whole draft, each of the three alternatives, a revision
   (slice 3) and a passage alternative (slice 4). `csrFigures` holds `{ status: 'checked', basis:
   'csr_claim_receipts', results, figures: [{ figure, blocking }] }` from the verdict's own figure step
   (`planSections`, now exported from `csr-saved-evidence.ts` unchanged). It runs on the text as the verdict reads it
   once saved (`acceptedSectionText(renderSection(…))`). In §2 and §10–13 (the `RESULTS` rule) each figure blocks;
   elsewhere it is reported.
2. **Honest state with no receipts.** A results section of a CSR document with no receipts answers
   `{ status: 'not_checked', reason: 'no_csr_receipts' }`, never "passed" and never an empty list. Any other document
   answers `null`.
3. **The accept re-runs the gate on what the person accepts**, their edits included, never on the draft as generated.
   A blocking figure refuses the accept with 422 `CSR_FIGURE_NOT_FROM_ENGINE`, naming each figure in one sentence. The
   transaction rolls back, so nothing is written and the single-use draft stays available for a corrected accept.
4. **The option set** (slice 1, decision 3). The accept takes `optionSet`, as an alternative
   (`{ kind, position, count, approach }`) or a revision (`{ kind, revision, of }`). The server validates its shape,
   writes the label itself ("alternative 2 of 3, concise", "revision 2 of alternative 1") and records it on the Part 11
   audit row as `option_set`. A revision's set is refused unless the draft is a revision (`derivedFrom`). A malformed
   set is refused with 400 `OPTION_SET_INVALID`. No set means a single draft, and nothing is recorded.
5. **The panel's accept words.** A refused accept now shows the server's one sentence ("Not accepted: 17/305 in
   §11.4.1 is not a figure the study's engine produced …"), with the draft kept for correction. Before, it would have
   read "Not saved — Not accepted: …. The section is unchanged." (`AuthoringAiDraft.tsx`, `describeAcceptFailure`).

## Proof

- **Red.** `server/routes/__tests__/authoring-ai-draft-csr-figures.pglite.test.ts`, run over HTTP on PGlite, fails
  10 of 11 against the tree without this change. A §11.4.1 draft and a revision stating 17/305, where the receipts claim
  16/305, are accepted with 200, and a passage alternative carries no finding. The one that passes is the control (a
  single draft names no set). The lane's run is in `red-server.log.gz`; the lead re-ran it by setting the two source
  changes aside, in `red-lead-recheck.log.gz` (10 failed, 1 passed).
- **Green.** 11 of 11. With the slice 3 and slice 4 route tests: 25 of 25 (`green-server.log.gz`). The lane's
  regression run over the existing draft, accept and authoring suites: 52 of 52 in 5 files
  (`regression-server.log.gz`). Client: `authoringAiDraft`, `authoringDraftRevise` and `draftAlternatives` pass 49 of 49,
  with the new `describeAcceptFailure` case red before its one-line fix.
- **Mutations.** 6 of 6 killed, each restored and checked by SHA-256 (`mutate.py.txt`):
  - M1, skip the accept re-run: 3 failed;
  - M2, gate the model's text instead of the accepted text: 1 failed;
  - M3, drop the results rule: 1 failed;
  - M4, show no receipts as checked: 1 failed;
  - M5, drop the option set from the audit row: 2 failed;
  - M6, skip the revision check on the option set: 1 failed.
- **Gates.**
  - ESLint: no new warnings on any changed file (router 22 = HEAD, `csr-saved-evidence.ts` 0, `AuthoringAiDraft.tsx`
    2 = HEAD, the new test 0).
  - Pass: `ci:one-product`, `ci:canvas-path`, `ci:single-native-canvas`, `ci:check-editor-integrity`,
    `ci:sql-interpolation`.
  - `ci:launch-scope-api` is red on two client paths from other lanes: `ReviewThreads.tsx`'s
    `/api/concept2cure/:p/:p/reopen`, and R1's `/api/biostat-bridge/computation-runs/:p/reproduce` (`583b96271`). This
    change's routes are not among them.
  - `ci:lineage-save-gate` is red on the CSR lane's `server/services/csr/csr-section-review.ts`, which this change does
    not touch.

## The running app

Real drafting needs a model key, and this environment has none: the gateway refuses, and no draft is made. So the
figures on a draft, and the 422 at accept, could not be walked live. That walk would show:
- an imported CSR's §11.4.1 drafted with a figure its receipts do not claim;
- the accept refused, with that figure named in the panel;
- the person correcting it in the panel and accepting;
- the Part 11 audit row naming the option set.

It belongs to the session with the founder's model keys (COORDINATION.md, "Codespace setup").

## The panel half (second commit, 2026-11-06)

It completes the one review panel and adds no screen, card or CSS. A figure is named in quiet text with the draft, as
plan §2 asks.

- **Transport.** `authoringDraftTransport.ts` decodes `csrFigures` onto the draft. A malformed one is dropped, never
  guessed. The accept sends `optionSet`.
- **Pure helpers** (`editor/draftAlternatives.ts`):
  - `csrFigureHold(draft, text)` gives the gate's figures that still stand in the text as it now reads, the person's
    edits included;
  - `acceptOptionSet(state)` reads the panel's own list: the alternative shown ("alternative 2 of 3, concise"), or a
    revision with its depth and what it revises. A lone draft names no set.
- **What the person sees and can do:**
  - With each draft, `CsrFigureNote` (in `editor/DraftAlternatives.tsx`) says one of four things:
    - a figure the engine did not produce, named, with "Correct or remove it to accept";
    - a reported figure outside the results sections, which does not hold the accept;
    - "not checked against the study's engine output" when there are no receipts;
    - that every figure is one the engine claims.
  - The accept is held, `aria-describedby` that note, while a blocking figure still stands in the text. Correcting it
    in the panel releases the hold, and the server re-checks at accept.
  - A paragraph carrying a blocking figure is not offered for "Add chosen paragraphs". Its checkbox is disabled and
    the reason sits beneath it. The other paragraphs stay available.
  - A passage alternative carrying one is not offered for "Replace". The reason is given by `passageFigureHold`, in
    `editor/draftPassage.ts`.
- **Proof.**
  - Red: 12 new panel tests fail without the panel change (`red-panel.log.gz`).
  - Green: 70 of 70 in the four panel test files. Regression: every test file that imports the panel's modules or the
    workbench, 53 files and 728 tests (`regression-panel.log.gz`).
  - Mutations: 8 of 8 killed, each file restored by SHA-256 (`mutate-panel.py.txt`):
    - the accept not held;
    - the hold read on the model's text instead of the edited text;
    - a paragraph not held;
    - a passage not held;
    - no receipts reading as checked;
    - the option set not sent;
    - revision depth not counted;
    - the transport dropping the gate.
  - Gates: ESLint has no new warnings. `CsrFigureNote` sits in the editor's existing panel module, so
    `AuthoringAiDraft.tsx` stays under its line limit. The scoped tsc is clean. `ci:canvas-path`,
    `ci:single-native-canvas`, `ci:check-editor-integrity`, `ci:design-system`, `ci:one-product` and
    `ci:undefined-css-classes` pass.

## Not done

1. **The running-app walk.** It needs a model key, which this environment does not have.
2. **Slices 3–4 decision 4, the assembly "Review" edge.** It is in `DocumentWorkbench.tsx`, which this lane does not
   hold. The fix is to clear `draftPassage` in `onReviewSection` (`DocumentWorkbench.tsx:2327`), with an assembly-flow
   test. It is handed to D4's holder in COORDINATION.md.
