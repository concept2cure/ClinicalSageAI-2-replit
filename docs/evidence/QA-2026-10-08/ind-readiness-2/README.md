# QA 2026-10-08 — IND lifecycle and Submission Readiness, second pass

Source findings: the j7-readiness-ind QA walk (Vorelinib IND, program
`50c41bb6-5796-4dc6-a848-72e4d1246ebd`; BX-256; BX-301). Builds on 24048bd9a
(`../ind-readiness/`) and 0e50993c5 (`../submission-center/`). Product decisions
P-20, P-21 and P-22 (`docs/LAUNCH_DEFINITION_OF_DONE.md`) are applied as written.

Reproduction was on the QA database through the running app as raj.patel
(manager), read-only SQL only. The "before" readiness capture
(`before/00-dispatch-readiness-seq5-6-7-before-edit.json`) was taken on :5078
before any edit here. :5078 was restarted on the working tree at 06:27 by someone
else, so it stopped being a "before" for this change after that. The "after" checks
ran on a private instance on :5083, which has been stopped. The `before/qa-j7-*.txt`
files are the QA walk's own screen captures. No QA data was written: every after-check
is a GET, or a stateless build, classify or plan. Save to dossier, Assemble-and-File,
transitions and freezes were not exercised live.

Red = the new or changed tests run against HEAD's sources (only the product files
swapped back to HEAD; the tests unchanged). Green = the same tests on this change.

| | Red (HEAD sources) | Green (this change) |
|---|---|---|
| Server: 11 suites | 34 failed / 317 (`red/server-tests-against-HEAD-sources.txt`) | 317 / 317 (`green/server-tests.txt`) |
| Client: 5 suites | 15 failed / 61 (`red/client-tests-against-HEAD-surfaces.txt`) | 61 / 61 (`green/client-tests.txt`) |
| Broader server (182 files) | — | 2334 passed; 3 failed, all failing on HEAD too (below) |
| Broader client (47 files, incl. all 23 picker suites) | — | 523 / 523 |

Pre-existing failures, unchanged by this change (`green/broader-runs-summary.txt` shows them on
HEAD sources too):
- `tests/golden-journeys/drug-nda-ectd.journey.test.ts`, step
  "a-leaf-placed-after-signing-invalidates-the-signature". The journey places a leaf on a
  Validated sequence, and since 0e50993c5 that returns the sequence to Assembling, so freeze
  refuses for a different reason than the step expects.
- `server/services/submission-gateways/__tests__/transmit-guard-reports-checks.test.ts` (2).
  These fail closed on `[tenant-rls] … RLS_ENFORCE=on` and import none of the files changed here.

## 1. P-22: an unapproved Vault leaf is a warning at Validated and blocks the release

Before: `before/00-…json` seq 6 (Vorelinib 0000) reports `error DOCUMENT_NOT_APPROVED` ×3, so
Validated refuses the sequence (0e50993c5 pinned that as "an unapproved document blocks
Validated by name").

Cause: `server/services/ectd/dispatch-readiness.ts:384` (HEAD) emitted DOCUMENT_NOT_APPROVED as
`severity: 'error'`. `submission-service.ts:506` (HEAD) refuses Validated on any error.

Fix:
- The finding is now a warning that reads "not yet approved (…)" and is marked `blocksRelease`.
  The report counts these separately as `releaseBlockers`, never in `errors`.
- `dispatch-gate.ts` adds `evaluateReleaseApprovalGate`. `assess-dispatch-readiness.ts`
  merges it into the structural gate, so all three release verdicts (`freezeGate`, `gate`
  and `dispatchGateOnSigning`) carry their own blocker: "N leaf/leaves point at documents not
  yet approved … freeze, dispatch and transmit refuse". The structural gate's corpus rule
  title now says so.
- The Validated transition records the `notYetApproved` count.
- Release side, unchanged and now pinned:
  - freeze and dispatch read those verdicts, and the package gate still runs.
  - `transmitSequence` and the transmit precheck read `gate`.
  - governed-transmit (package-ops spine) refuses a package whose approval drifted since
    assembly. New test: `governed-transmit-unapproved.test.ts`. It was shown to fail when the
    assessment says `match`.

Tests:
- `dispatch-readiness.test.ts` (P-22 describe).
- `dispatch-gate.test.ts` (evaluateReleaseApprovalGate).
- `assess-dispatch-readiness.vault-leaf.pglite.test.ts`: every release verdict blocks, and the
  finding is a warning.
- `sequence-validated-honesty.pglite.test.ts`: Validated succeeds with `notYetApproved: 1`.
  The freeze precheck, dispatch precheck and transmit precheck each refuse by name.

After: `after/01-api-after-5083.json` seq 6 shows `warning [blocksRelease] DOCUMENT_NOT_APPROVED`
×3. The gate carries "3 leaves point at documents not yet approved". `after/screens/05-sc-validation-0000.txt`
shows WARNING DOCUMENT_NOT_APPROVED "… which is not yet approved (not reviewed)".

## 2. Dispatch gate "blocked, 2 blockers" while required Module 1 sections were only warnings

Before: `before/qa-j7-03-bx256-dispatch-readiness.txt` shows a one-leaf original IND with
"0 errors, 9 warnings". Structural gate: Satisfied. The 9 warnings were 1.1, 1.3, 1.12.14,
1.14.x and 1.20 missing. `before/00-…json` seq 7 (an amendment) reported 1.20, 1.14.4.1 and
1.12.14 as "required" too.

Cause: `dispatch-readiness.ts:583` (HEAD) made every missing required section a warning ("informative,
not provable"), and `assess-dispatch-readiness.ts:93` (HEAD) applied the application's list to every
sequence, original or not. The IND's own gate (`ind-dispatch-gate.ts:88`) called the same gaps hard
blockers. Two server gates disagreed, and the client reads the warn-only one.

Decision made here (the brief's rule, applied to the record the product already holds):
- An ORIGINAL sequence of a kind the regional Module 1 record models is held to what the record
  requires of that kind. Modelled kinds: US ind/nda/bla/anda, EU maa, JP jnda. The requirement
  comes from `requiredModule1`, leaf-most claims only. A missing section is an error that names
  the record.
- A CONTINUING sequence of a modelled kind is not held to the application's requirements. The
  record makes no per-sequence claim, so nothing is reported as missing.
- An unmodelled region or kind (510(k), CN, KR) keeps the profile list as warnings, which never
  block.

The gate counts errors from the engine's severity. Nothing re-labels a warning as a blocker.

Fix:
- `region-profile-service.regulationRequiredModule1` reads the record.
- `readinessOptionsForSequence` decides per sequence.
- `dispatch-readiness.requiredSectionFindings` emits an error or a warning, and never both for
  one section.
- The corpus rationale is updated.
- The golden NDA journey now places the six Module 1 sections an NDA requires. It pinned
  "Module-1 completeness is a WARNING, never a fabricated hard error", which is the stance this
  item reverses.

Tests:
- `dispatch-readiness.test.ts` (required sections describe).
- `assess-dispatch-readiness.gates.test.ts` (original IND, NDA, amendment and 510(k)/CN cases).
- `sequence-validated-honesty.pglite.test.ts`: an original IND missing them is not Validated
  ("found 7 errors … 1.1: Required section 1.1 …").

After: `after/01-…json` seq 5 (BX-256) shows `error MISSING_REQUIRED_SECTION` for 1.1, 1.3,
1.12.14, 1.14.4.1, 1.14.4.2 and 1.20, each "The regional Module 1 record (US) requires it in an
original IND application". The gate's first blocker is "7 open error-severity validation
finding(s)". Seq 7 (amendment) reports no missing section.

## 3. Sequence 0000 shows VALIDATED beside a dispatch-blocked gate

Before: `before/qa-j7-02-sc-vorelinib-sequences.txt` and `qa-j7-03-sc-vorelinib-validation.txt`
show "0000 original · VALIDATED". The row stored `status = validated` with
`validation_status` NULL. It was set before 0e50993c5 recorded a verdict with the stage.

Cause: the stage is a stored label. `SubmissionCenter.tsx:1622` and `SubmissionSeqWorkspaces.tsx:247`
(HEAD) print it as is, and nothing compared it with the validation the assessment runs.

Fix:
- The assessment returns `validatedStage` from the server, computed by the pure
  `validatedStageOf`. It is null for any other stage. It holds when the current validation finds
  no error, and it says whether a verdict was recorded. When it does not hold, a reason is given:
  "… recorded as Validated, but its validation now finds N errors[, and no validation verdict was
  recorded when it was marked]. … return it to Assembling …".
- The Sequences list and the working-sequence picker say "(no validation recorded)".
- The Validation and Dispatch tabs and the Dispatch readiness surface show the server's reason.

Tests:
- `assess-dispatch-readiness.gates.test.ts` (validatedStageOf).
- `sequence-validated-honesty.pglite.test.ts` (finding 20).
- `submissionValidatedStage.test.tsx`.

After: `after/screens/04-sc-sequences.txt` shows "VALIDATED | no validation recorded".
`05-sc-validation-0000.txt` and `06-sc-dispatch-0000.txt` carry the reason. The picker reads
"0000 · original · Validated (no validation recorded)".

## 4. P-20: safety report onset date and expectedness

Cause:
- `ind-safety-report-service.ts:197` (HEAD) accepted only a valid date for onset, and there was
  no way to state "unknown".
- `:249` returned NOT_REPORTABLE when expectedness was not recorded.
- The card (`IndLifecycle.tsx`) had no "unknown" control and printed the raw obligation enum.

Fix:
- `IndSafetyEvent.onsetDateUnknown`. The route maps `onsetDate: "unknown"` to it in
  `coerceEventDates`. A blank onset is refused as "onset date (a date, or stated as unknown)".
  Stating both a date and unknown is refused. The report prints "Onset: unknown (stated as
  unknown)."
- New `NOT_DETERMINED`. With expectedness not recorded the classification is "Not determined:
  expectedness not assessed …", with no window, no deadline and `unexpected: null`. There is no
  amendment intent. File and draft answer 422 `NOT_DETERMINED`, never NOT_REPORTABLE.
- The card adds an "Onset date unknown" checkbox. It shows "Expedited verdict: not determined:
  expectedness not assessed" and offers nothing to file.

Applied literally: P-20 says "When expectedness is not recorded … never 'not reportable'", so
NOT_DETERMINED applies even where suspectedness or seriousness alone would decide (see decisions).

Tests:
- `ind-safety-report-service.test.ts` (P-20 describe and the onset cases).
- `routes.contract.integration.test.ts` (unknown onset 200, blank 400, classify NOT_DETERMINED,
  file 422, draft 422).
- `indLifecycleDeliverables.test.tsx`.

After: `after/01-…json`:
- `safetyUnknownOnset`: 200, "Onset: unknown (stated as unknown)."
- `safetyBlankOnset`: 400.
- `safetyNoExpectedness`: NOT_DETERMINED.

## 5. P-21: regulated selects start unstated; the filing-target picker

Cause:
- `IndLifecycle.tsx:598` (HEAD) `sel()` sent a select's first option: meeting type at `:774`,
  LOA and right-of-reference file type at `:800` and `:820`, amendment category and change kind
  at `:742-743`.
- `IndFormsPanel.tsx:143` (HEAD) started Phase on `'Phase 1'`, from a hard-coded list at `:87`.
- `filingTarget.tsx:185` (HEAD) pre-selected the first open sequence.

Fix:
- Every one of these selects starts on "Not stated — choose" and sends nothing until chosen.
  `sel()` is replaced by `chosen()`, and a select now displays only what its field holds.
- `planIndAmendment` refuses an unstated category or change kind, or a change kind outside the
  vocabulary, with 400 `IND_AMENDMENT_UNSTATED`. It used to route the document to the cover
  letter as "unmapped".
- Phase and IND type options come from the registry's `formDefinitions`.
- The picker pre-selects a sequence only when exactly one is open.

Tests:
- `indLifecycleDeliverables.test.tsx`. The two tests that pinned the defaults (`meetingType:
  'pre_ind'` and `referencedFileType: 'DMF'` from untouched selects) now choose explicitly.
- `ind-amendment-placement.test.ts`. Its fixture used change kind `'new'`, which is a lifecycle
  operation and not a change kind, so it now uses `'added'`.
- `indFormsPanel.test.tsx`.
- `filingTargetPreselect.test.tsx`.

All 23 suites that use the picker pass: 350 tests before the change and 350 after.

After: `after/02-ui-after-5083.json` shows every regulated select "Not stated — choose", with
`value: ""`.

## 6. Finding 3c: no input for sponsor_address and ind_type with a program open

Store found: the 1571 build reads `meta.sponsor.address` and `meta.indType`.
`ind-forms.routes.ts` `metaForRequest` merges `programToFormMetadata(program)` (the program record:
sponsor name, product, indication and application number only) with the request body
(`statedFields`). Neither field has a program column. The sponsor master-data registry is read only
by `pdf-from-records` and is not linked to a program. So the request body is the one store the build
reads them from, which is where Phase and Serial number already go.

Fix: the forms panel adds Sponsor address (sent as `sponsor.address`) and IND type, with registry
options, in both modes.

Tests:
- `indFormsPanel.test.tsx`.
- `ind-forms.contract.integration.test.ts`: stated values satisfy `sponsor_address`, `ind_type`
  and `phase_of_study`; unstated ones stay missing. That server behaviour was already true on HEAD.

After: `after/01-…json` `build1571` shows unstated `["sponsor_address","ind_type","phase_of_study"]`
and stated `[]`.

## 7. A placed 356h marks the IND's Module 1.1 approved

Before: `before/qa-j7-01-vorelinib-ind-lifecycle.txt` shows m1.1 "FDA Forms" approved from leaf 61,
Form FDA 356h.

Cause: `ind-checklist-view-assembler.ts:433` and `:448` (HEAD). Any approved document at the bare
`1.1` heading set `m1.1` to approved, and the heading was listed as a section.

Fix: for an IND, `m1.1` is approved exactly when the IND's own forms (1571, 1572, 3674) are done. A
document at the bare heading is neither counted nor listed.

Test: `ind-checklist-view-assembler.pglite.integration.test.ts` (2 cases).

After: `after/01-…json` `checklist` shows m1.1 is a blocker for every IND until its forms are done.

## 8. Save to dossier dead end (finding 3e)

Cause: on the QA database Vorelinib has no `projects` row anchored to it (read-only SQL: 0 rows), so
`resolveProgramProjectAnchor` returns null and the route takes the audited-unplaced path. P-19 (another
fixer's change, `migrations/20261008_program_project_anchor_backfill.sql` and intake) gives every
program its record. The governed path for a program ident had never been exercised in a test:
`server/db/pglite-harness.ts:479` (HEAD) lacked `projects.client_workspace_id`, which
`readProgramAnchorRow` selects. The undefined column was read as "no anchor column", so even an
anchored program went unplaced.

Fix:
- The harness gets the nullable column. The contract test proves an anchored program's Save to
  dossier returns 201 with an artifact registered against that project row (red on the HEAD harness).
- The panel's unplaced answer is now an error, not a success-tone note. It names the missing
  project record and who can supply it, instead of "no legacy project row".

Not run live: it would write an audit row. See "not verified".

## 9. BX-301 (BLA) shown as an "Initial IND" by name

Before: `before/qa-j7-05-bx301-ind-lifecycle.txt`: "The BX-301 IND is 22% ready … Matched by name".

Cause: `IndLifecycle.tsx:203-208` (HEAD) matched a checklist row with no `programId` to the open program
by product name, title or code.

Fix: a row is the open program's IND only when its submission's `programId` is that program. There is
no name match. When none is anchored, the empty state reads the program's own type from
`GET /api/c2c/projects/:id` and says "… is a BLA program, and the IND lifecycle covers IND programs.
An IND submission is shown for a program only when its record names that program — it is never matched
to a program by name."

Test: `indLifecycleProgramScope.test.tsx`. The legacy name-match test is inverted, and a BLA case is
added.

After: `after/screens/01-bx301-ind-lifecycle.txt`.

## Checks

- ESLint, per file, HEAD → now: `lint.txt`. No file has more warnings than at HEAD.
- Scoped `tsc` over every changed file: no error in a changed file. The 13 errors it prints are
  ambient-declaration gaps of a scoped config, in untouched files: CSS modules, `import.meta.env`,
  Express request augmentation and `jsonwebtoken` types.
- CI gates run green: `ci:validation-traceability`, `ci:check-unrun-tests`,
  `ci:check-test-imports`, `ci:undefined-css-classes`, `ci:server-error-leaks`,
  `ci:unverified-verdicts`, `ci:check-chip-tones`, `ci:surface-text-ramp`, `ci:fixture-fallback`.
