# QA 2026-10-08 — j7 Submission Readiness and IND lifecycle: fixes

Source findings: the j7-readiness-ind QA walk (Vorelinib IND, program
`50c41bb6-5796-4dc6-a848-72e4d1246ebd`). Reproduced on http://localhost:5078 as
raj.patel (manager) through the real sign-in form. DB reads were read-only
(`SET default_transaction_read_only=on`). No UI action that writes was taken
during reproduction: Assemble is a preview, and Build & check is stateless.

## Fixed (red before, green after)

### 1. Safety report asserted seriousness, causality, outcome and event type nobody stated (blocker), 500 with no onset date, "undefined" patient and country

Reproduced: `before/safety-report-api.log`, `before/01-r1-A-nothing-entered.txt`,
`before/02-r1-B-dates-only.txt`. The selects showed SAE / death / definite /
recovered. An untouched card POSTed
`{"eventType":"SAE","seriousnessCriteria":"death","causality":"definite","outcome":"recovered"}`.
With no dates the route answered 500 "Request failed." With dates only, the
report read "Case (de-identified patient): undefined. Country of occurrence:
undefined", "Seriousness criterion: death", "Causality (WHO-UMC): definite",
"Outcome: recovered", and "Expectedness: expected" although expectedness was not
recorded.

Causes:
- `client/src/concept2cure/v2/surfaces/IndLifecycle.tsx` `sel()` sent the first
  option of an untouched select. The select rendered that option with no
  placeholder.
- `server/services/ind-lifecycle/ind-safety-report-service.ts` classified and
  printed whatever arrived. `toIsoDate(undefined)` threw (500). An absent
  awareness date fell through to `calculateReportingDeadline`'s
  `reportDate = new Date()` default. The identifiers were interpolated raw.
  Expectedness printed "expected" when unrecorded.

Fix:
- Engine: `unstatedSafetyReportFields()` and `IndSafetyReportIncompleteError`
  (code `VALIDATION`, so 400). `classifyIndSafetyReport` refuses before
  classifying, naming each unstated or out-of-enum field: event type, seriousness
  criterion (not required for a non-serious AE), causality, outcome, onset date,
  sponsor awareness date. The classify, assemble, PDF, file and draft routes share
  this one engine. Absent identifiers render as `[to be completed]`. An
  unrecorded expectedness reads "not recorded".
- Card: the four regulated selects start on "Not stated — choose", and an
  untouched select is never sent. The server's named refusal is what the card
  shows. A refusal thrown by the request layer no longer ends with "..".

After: `after/safety-report-api.log` shows `{"event":{}}` getting a 400 that names
all six fields, and dates only getting a 400 that names the four determinations.
The `after/*.txt` captures predate the double-period fix; the test pins that fix.

Tests:
- `server/services/ind-lifecycle/__tests__/ind-safety-report-service.test.ts`:
  7 new tests, red against HEAD, green now.
- `server/routes/ind-lifecycle/__tests__/routes.contract.integration.test.ts`:
  1 new test (400 on all four routes, never 500). It answered 200 against the
  HEAD service and passes now.
- `client/src/concept2cure/v2/__tests__/indLifecycleDeliverables.test.tsx`: 2 new
  tests, red against HEAD's surface, green now. The existing test pinned the
  defaults (`seriousnessCriteria: 'death'` from an untouched select); it now
  states every value.

### 2. Completed 1571 and 1572 filed into the newest sequence 0001 (draft amendment), not 0000, with no choice (blocker)

Reproduced (read-only SQL): leaves 66 (`form_1571`) and 67 (`form_1572`) are in
sequence 7 (0001 amendment, draft). Sequence 6 (0000 original) has no 1.1 leaf.
`before/01-r2-forms-panel.txt`: the panel's only select is Phase. There is no
target control.

Cause: `server/routes/ind-forms.routes.ts` official-upload filed into
`spine.sequence`, which `resolveSubmissionSpine` picks as
`ORDER BY sequence_number DESC LIMIT 1`.

Fix:
- Route: `sequenceId` is required (400 `SEQUENCE_REQUIRED`). The sequence must
  belong to the program's submission (409 `SEQUENCE_NOT_IN_PROGRAM`) and must
  not be frozen or dispatched (409 `SEQUENCE_LOCKED`). Every refusal comes before
  any bytes are stored. "One leaf per form" is now per chosen sequence. The
  listing reports placements from every sequence of the submission, each with its
  `sequenceId` and `sequenceNumber`.
- Panel: reuses the shared `useFilingTarget` and `FilingTargetFields`
  (`filingTarget.tsx`) unchanged. Attach is disabled until a sequence is chosen,
  sends the chosen `sequenceId`, and lists the placements in every sequence.

Tests:
- `server/routes/__tests__/ind-forms.contract.integration.test.ts`: 4 new tests,
  red against the pre-fix route, green now. Existing upload tests now name their
  sequence.
- `client/src/concept2cure/v2/__tests__/indFormsPanel.test.tsx`: 5 filing tests
  fail against HEAD's panel and pass now.

### 3a. 1572 Build & check said "required fields present" with zero investigators

Reproduced: `before/forms-panel-api.log`. `POST /api/ind-forms/FDA_1572/build`
returned `[]`, and the row showed REQUIRED FIELDS PRESENT.

Fix: with no investigator recorded, the build route returns the
empty-investigator build that the PDF route renders (`buildFormById`). Build and
PDF now give the same verdict from one engine: investigator_name, facility_name
and irb_name are missing.

Test: `ind-forms.contract.integration.test.ts`, "one verdict from one engine".
It was red before the fix and is green now. The build's missing list equals the
PDF's `X-Form-Missing-Required`.

### 3d. Module 1 forms offered without regard to application type (356h for an IND)

Reproduced: `before/01-r2-forms-panel.txt` lists "FDA 356h — NDA / ANDA / BLA
application" for the IND.

Fix: `GET /api/ind-forms/?projectIdent` offers only the forms that the registry's
one applicability model (`FDAFormsRegistry.applicabilityOf`) applies to the
program's type. The rest are returned in `formsNotApplicable` with a reason.
Official-upload of an inapplicable form is refused (409 `FORM_NOT_APPLICABLE`).

Tests: 3 new tests, red before the fix, green now.

## Not done

- 3b. Phase defaults to "Phase 1". Not started.
- 3c. No input for sponsor_address or ind_type. Not started.
- 3e. Save to dossier dead end. Started and then reverted: it needs a column in
  the shared PGlite harness and client work.
- 4. The dispatch gate counts warnings as blockers. Not started.
- 5. The dispatch-readiness screen does not show the server's one readiness
  verdict. Not started.
- The IND checklist counts a placed 356h as approving m1.1 (the second half of
  3d, in `ind-checklist-view-assembler.ts`). Not started.
