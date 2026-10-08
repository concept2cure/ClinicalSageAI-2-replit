# QA 2026-10-08 — IND follow-ups on P-20, reporting follow-ups on P-26 (third pass)

Decisions applied as written in `docs/LAUNCH_DEFINITION_OF_DONE.md`: "Follow-up decisions on P-20" (from
`d155ef099`, evidence `../ind-readiness-2/`) and P-26 (from `4ac15bdd1`, evidence `../reporting/`). Launch-catalog
surfaces only: the IND lifecycle and forms, Submission Readiness, the project page's Submit stage, and Reporting &
analytics. Row moved: **D2** (the launch catalog does what it says). No surface, module or engine is added.

Method, per item: a test that fails on HEAD's code, then the fix, then the same test green. **Red** is every new or
changed test run against HEAD's version of each source file this change touches, served by
`vitest.head.config.ts.txt` (`git show HEAD:<path>`). The shared working tree was never swapped, because three other
fixers were editing it at the same time. **Green** is the same test files on this change. Every run used
`RLS_ENFORCE=off`. A local, ignored `.env` turns it on, and CI has none.

| # | Decision | Red on HEAD → green | Status |
|---|---|---|---|
| 1 | "Not determined" only where expectedness decides the outcome | 6 → 0 (3 files) | done |
| 2 | A continuing IND sequence is held to its 1.1 form (Form FDA 1571) | 1 → 0 | done |
| 3 | Save to dossier for a program with no project record answers 409 | 3 → 0 (2 files) | done |
| 4 | No screen matches a program to an application by name | 2 → 0 (2 files; 3 more suites' fixtures anchored) | done |
| 5 | Sponsor address and IND type stored on the program (additive columns) | 9 → 0 (3 files) | done |
| 6 | Packs list only types an engine computes; engine-less types listed once | 3 → 0 | done |
| 7 | Registers are organisation-wide: not on a program's canvas, in Audit & compliance reports | — | **blocked, nothing changed** (below) |
| 8 | The evidence & provenance trace's confidence is lineage's measured provenance completeness | 20 → 0 (4 files) | done |

Totals: `red/new-tests-against-HEAD-sources.txt` **44 failed / 376** (15 of 19 files). `green/new-tests.txt`
**376 / 376** (19 files).

## 1. A safety event recorded as non-serious, or as not suspected, is not expedited on those facts

Cause: `server/services/ind-lifecycle/ind-safety-report-service.ts:275` (HEAD) ran the "expectedness not recorded"
gate before every other one. Any event with no expectedness was therefore `NOT_DETERMINED`, including an AE recorded as
non-serious and an event recorded as unrelated. Neither can be an individual expedited report, whatever the IB says.
The HEAD test "expectedness not recorded is NOT_DETERMINED whatever else was stated" pinned that behaviour.

Fix:
- A not-suspected or non-serious event is `NOT_REPORTABLE` "on the stated facts". The rationale names the fact, for
  example "causality stated as unrelated: not a suspected adverse reaction" or "the event is recorded as
  non-serious", and adds "Expectedness is not recorded; it does not change this verdict."
- Nothing is inferred about expectedness: `unexpected` stays `null`.
- `NOT_DETERMINED` remains only for a serious, suspected event with expectedness unrecorded.
- The code is the helper `notExpeditedOnStatedFacts`. A recorded "suspected, unexpected, non-serious" event keeps its
  312.33 wording.
- The card's unassessed option now reads "Not assessed — decides the verdict only for a serious, suspected event"
  (`IndLifecycle.tsx`).

Tests:
- `ind-safety-report-service.test.ts`: the P-20 describe is narrowed, and a "P-20 follow-up" describe is added.
- `routes.contract.integration.test.ts`: classify answers NOT_REPORTABLE, and file answers 422 NOT_REPORTABLE.
- `indLifecycleDeliverables.test.tsx`: the option label.

## 2. Every IND submission carries a Form 1571; a continuing sequence is held to its 1.1 form

Cause: `server/services/ectd/assess-dispatch-readiness.ts:123` (HEAD). `d155ef099` exempted continuing sequences in
`readinessOptionsForSequence`: an original was held to the regional Module 1 record, and anything else got `{}`. An
IND amendment with no 1571 therefore cleared the structural gate.

Fix:
- A continuing **US IND** sequence gets `requiredByRegulation: { codes: ['1.1'] }`. Its basis reads: "Every IND
  submission carries a Form FDA 1571 (21 CFR 312), filed under 1.1 (Forms), so this sequence cannot be validated,
  frozen or dispatched without it."
- It is held to nothing else, so there is no "1.20 missing" on an amendment.
- Continuing NDA, BLA and ANDA sequences are unchanged.

Tests:
- `assess-dispatch-readiness.gates.test.ts` (3 cases).

Consequence found by the broader run: `withdrawal-approval-binding.pglite.test.ts` seeds five IND amendments, each
withdrawing a CMC document, and none carried a 1571. Readiness now reports the missing form, so 4 of its cases failed.
The fixture now gives each amendment a Form 1571 leaf at `m1.1`. Each case still asserts the same thing: the
withdrawal itself produces no readiness error. 16 / 16.

## 3. Save to dossier for a program with no project record answers 409

Cause: `server/routes/ind-forms.routes.ts:674-740` (HEAD). An unanchored program took the "audited-unplaced" path:
the route built the form, wrote an audit row, and answered **200** `{ governed: false, audited: true, artifactId: null }`.
The panel then had to turn that success status into an error (`IndFormsPanel.tsx`, the `governed === false` branch).

Fix:
- The route answers **409 `PROGRAM_NOT_ANCHORED`**: "This program has no project record, so it has no dossier to save
  the form into. Nothing was saved. An administrator can give the program its project record."
- Nothing is written: no artifact and no "unplaced" audit row.
- The anchor lookup is now `strict`. A lookup that could not complete is a 500, never read as "no project record".
- The panel reports a 409 as "FDA 1571 was not saved to the dossier. <server's sentence>", in error tone. The
  `governed:false` branch is deleted. An old-shaped 200 with no artifact id falls to the refusal path and is never
  described as a save.

The brief named `server/routes/ind-lifecycle/filing.routes.ts`. The handler is in `server/routes/ind-forms.routes.ts`
(`POST /api/ind-forms/:formId/artifact`).

Tests:
- `ind-forms.contract.integration.test.ts`: 409, no artifact row, no unplaced audit.
- `indFormsPanel.test.tsx`: two cases.

## 4. No screen matches a program to an application by name

Cause: `client/src/concept2cure/v2/surfaces/programSequence.ts:203-209` (HEAD). `submissionBelongsToProgram` returned
`'legacy-name'` for a same-type submission with no recorded program whose product name or title matched the program's.
`DispatchReadiness.tsx:302` printed the verdict for that submission ("submission matched by name"). So did Project
home's Submit stage (`ProjectHome.tsx:282, 309, 448, 494, 506`): both read the same discovery.

Fix:
- A submission is the program's only when it is of the program's type and records the program (`programId`). The
  `match` field, the `legacy-name` value and every "matched by name" sentence are gone from all three files.
- The not-ready state counts, and never names, same-type submissions with no program recorded: "1 IND submission in
  this organisation has no program recorded. A submission is never matched to a program by name: one is gated here
  only once the Submission Center records it to <program>."
- Anchoring a submission is the Submission Center's job (P-14). Another fixer is building that control at the same time
  (`SubmissionProgramAnchor.tsx`, untracked at the time of writing).

Tests:
- `dispatchReadinessProgramScope.test.tsx`: the name-match case is inverted.
- `projectHomeSubmitStage.test.tsx`: the legacy case is inverted.
- Fixtures anchored (`programId`), because the readiness screen now reads the anchor only:
  `dispatchReadinessNotAssessed`, `dispatchReadinessServerGate` and `dispatchReadinessNamedRules`. 35 / 35 across the six
  dispatch and project suites.

## 5. The sponsor address and IND type are stored on the program

Check first, as the brief requires: `regulatory_programs` is `public`, with `organization_id INTEGER NOT NULL`
(`migrations/20260524_program_workbench_schema.sql:26-28`). Additive columns are therefore allowed, and the tenant
sweeps already cover the table.

Cause: no column held either value. The panel sent them with every build (`IndFormsPanel.tsx:214-218`, HEAD), so the
program record never knew them, and a 1571 built anywhere else had neither.

Fix:
- **Migration** `migrations/20261008b_regulatory_programs_sponsor_address_ind_type.sql`:
  - `ADD COLUMN IF NOT EXISTS` for `sponsor_address TEXT` and `ind_type TEXT`, both nullable.
  - No CHECK: the IND type is validated against the forms registry by the route that writes it. No DROP.
  - It is registered in `C2C_MIGRATION_FILES` after `20261008_program_project_anchor_backfill.sql` and before the
    final sweep trio (`UUID_TENANT_ISOLATION_NONPUBLIC`, `CHILD_TABLE_PARENT_SCOPE`, `TENANT_ISOLATION_SWEEP`).
  - `shared/schema/programs.ts` has the two columns. The PGlite harness DDL mirrors them.
- **Reads**:
  - `resolveProgramIdent` selects both columns.
  - `programToFormMetadata` maps them to where the 1571 build reads them: `sponsor.address`, and `indType` (IND programs
    only).
  - `GET /api/ind-forms/?projectIdent` returns both, and `formMetadata` shows what the builders receive.
  - A value stated in a build request still wins over the record.
- **Write**: `PUT /api/ind-forms/program-facts` takes `{ projectIdent, sponsorAddress?, indType? }`.
  - An absent field is unchanged. `null` or a blank clears it.
  - The IND type must be one of the registry's `FDA_1571.ind_type` options, and only an IND program has one.
  - It is org-scoped (another organisation's program is 404) and audited (`ind_form.program_facts.update`, with the
    field names).
- **Panel**:
  - With a program open, it shows the recorded pair.
  - "Save to program" saves an edit and re-reads the record.
  - An unsaved edit says "Not saved. The forms read the program's recorded sponsor address and IND type until you save
    these to the program."
  - A build sends neither value: the record is the one source.
  - Standalone (no program open), the panel still sends both as typed.
  - A non-IND program has no IND type field.

Tests:
- `form-context-assembler.test.ts`: 2 cases.
- `ind-forms.contract.integration.test.ts`: 3 cases (round trip with audit, the refusals, and stated-wins).
- `indFormsPanelProgramFacts.test.tsx`: new, 4 cases.
- `indFormsPanel.test.tsx`: the HEAD test "the sponsor address and IND type … go up where the build reads them" pinned
  the reversed behaviour. It is replaced by the new file.

Fresh database (`green/db-tier.txt`):
- Before: only `application_number`.
- `deploy-migrate` was run twice. Both runs logged "✓ applied: migrations/20261008b_…" and "Schema migration complete".
- After: both columns are nullable `text`, and RLS is on with one policy.
- `c2c_migration_journal` shows `apply_count 2` with one hash: unchanged, no drift.

## 6. Packs list only types an engine computes

Cause: `client/src/concept2cure/v2/surfaces/Insights.tsx` (HEAD):
- `roPresetsForSeg` (`:299`) offered a pack if *any* member ran.
- `RODashboard` drew every other member as a locked "Not computed in this release" tile (`:910`).
- The pack button counted every member ("3 governed reports", `:1579`).

Fix:
- `roPresetsForSeg` keeps only computed members, and drops a pack left with none.
- The pack grid filters to runnable types. The not-computed tile branch is deleted.
- The button counts what runs, with correct singular and plural.
- The program's engine-less types are listed once, on the canvas: section "Not computed in this release",
  `data-testid="ro-not-computed"`.

No server change was needed: packs exist only on the client, and the server catalog already says which types are
`runnable` (`report-engine.ts`). "Find a report" (`a90c14db6`) is untouched. All 15 Insights client suites pass:
82 / 82.

Test: `insightsReportsRunWhatTheyName.test.tsx` §1. The HEAD case that pinned not-computed tiles inside a pack is
replaced by 3 cases.

## 7. Registers are organisation-wide — BLOCKED, nothing changed

The decision assumes the registers "live in Audit & compliance reports". They do not:
- Audit & compliance reports runs the eight Part 11 reports in
  `server/services/audit/compliance-reports/catalog.ts:62-71`: access review, authentication events, administrative
  changes, electronic signatures, audit-trail integrity, retention and legal holds, controlled documents, and the full
  audit trail.
- The 16 research-compliance registers (FCOI, IRB, IACUC, IBC, SEND, grants, RIM grid, inspection pack, DEA ledger,
  obligation calendar, eTMF pack, training, effort, research security, scorecard) are reachable only from the program
  canvas (`report-engine.ts DOMAIN_REPORT_TYPE_IDS`).

Removing them from the canvas would therefore delete a user-facing capability with no reachable replacement. The
working agreement in `CLAUDE.md` makes that a founder decision, not a cleanup.

Building the replacement is not a small change:
- Running a register organisation-wide through report-os needs an organisation-level scope.
- 9 of the 16 registry rows allow none: `fcoi`, `ha`, `iacuc`, `irb`, `ibc`, `nonclinical`, `inspection`, `lifecycle`
  and `etmf` have only submission, project, program or study scopes.
- So it needs a registry change. `report_type_registry` has no version rows: `type_id` is unique, and
  `20260930_report_type_registry_seed.sql` upserts in place. The brief's rule, "a registry change is a new version row,
  never an edit in place", cannot be met without a versioning design.

Decisions needed are listed below.

## 8. The evidence & provenance trace's confidence is lineage's measured provenance completeness

What lineage computes:
- **Found**: `summarizeDocumentAttribution` (`server/services/clinical-regulatory-evidence/span-lineage.service.ts:1384`).
  - It partitions every character of a document's current text by the provenance its span lineage records
    (`document_span_lineage`): from a cited source, asserted by an author, machine-drafted and accepted, or
    machine-drafted and not accepted.
  - It returns `attributedChars` out of `contentLength`.
  - Authoring's attribution bar shows the same figure: "N% of this document has a recorded origin"
    (`DocumentAttributionBar.tsx:231`).
  - Governed writers record spans against `concept2cure_artifacts` under its numeric id, which is the row the trace
    covers.
  - It is deterministic and needs no model.
- **Not used**:
  - `computeLineageConfidence` (`lineage-trace-report.ts:59-81`, HEAD) was a count of which records exist: 30, +25 for a
    version, +15 for a decision, +10 for a provenance event, +10 for a lineage row, +5 for a signature, clamped to 30-95.
    An ordinary document cleared 70 with nothing traced. The red route test shows HEAD giving **95** to a document whose
    text is 64% traced.
  - `getLineageCoverage` (`data-lineage-service.ts:388`) divides sections-with-lineage by sections-with-lineage, so it
    is always 0 or 100.

Fix:
- `lineage-dossier-completeness.ts` is a new module beside `lineage-dossier-holds.ts`, kept separate so the dossier file
  does not grow past the lint limit. It provides `measureProvenanceCompleteness` and the loader.
  - The figure is attributed characters over the text, **floored**, so it is never rounded up past the finalize
    threshold.
  - It is `null` for a document with no text.
  - A failed read gives `provenanceCompleteness: null`: not measured, never 0.
- `buildDocumentLineageDossier` carries the result.
- `lineageTraceConfidence(dossier)` replaces `computeLineageConfidence`, which is deleted along with its one caller.
  - It returns the measured percent.
  - It returns `null` when the measure is missing, or when the decision read failed. That keeps the earlier protection:
    an unmeasured dossier must not seal.
  - Because the type requires a confidence, a `null` run stays below final.
- `report-os.ts` POST /runs uses it.
- The rendered trace gains a "Provenance completeness" section: the figure, the characters behind it and their
  partition, linked to `document_span_lineage`. It also gains a gap line: "N of M characters have no recorded origin".
- **No registry change.** The type's rule stays `requireConfidence: true`, and the threshold stays 70
  (`DEFAULT_FINAL_CONFIDENCE_THRESHOLD`), so no row is touched. The registry has no version column, so there is no
  version row to mint.

Tests:
- `lineage-trace-report.test.ts`: 12 cases, replacing the HEAD tests of the record count.
- `lineage-dossier-decisions-unavailable.test.ts`: 2 cases.
- `lineage-dossier-provenance-completeness.test.ts`: new, 4 cases. They check the builder reads the artifact's numeric
  id and org, that a failed read is null, and that empty text is null.
- `report-os-run-engine.test.ts`: 2 cases. The run's recorded confidence is 64, not 95, and is null when not measured.

## Broader runs (this change, RLS_ENFORCE=off) — `green/broader-runs.txt`

- Server, golden journeys and lineage: every golden journey, `tests/lineage`, ectd, submission-service,
  ind-lifecycle (services and routes), ind-forms, report-os, clinical-regulatory-evidence, and the report-os and
  insights-canvas route suites. **2873 passed, 2 skipped, 0 failed** (241 files).
- The full client v2 suite (`client/src/concept2cure/v2/__tests__`): **4793 / 4793** (456 files).
- Both runs were on the final tree, after the lint refactors.
- During the work, a run of ectd, submission-service, ind-lifecycle and the golden journeys showed 41 failures with
  `signatureSpentBy is not defined`. That was another fixer's file in mid-edit. They did not reproduce when the same
  files ran again with this change's sources at HEAD, nor later on the full tree. The 4 failures that were this
  change's are the withdrawal fixture under item 2.

## Checks

- **Lint** (`lint.txt`): ESLint per file, HEAD vs now, for all 37 files. No file has more warnings than at HEAD.
  - Three new files are at 0.
  - To get there, `classifyIndSafetyReport`, the program-facts route, the panel's new conditionals and the trace's gap
    list were factored into helpers.
  - The completeness code moved to its own module.
  - The item-5 panel tests moved to their own file.
- **tsc** (`tsc.txt`): scoped `tsc -p` over the 36 TypeScript files among them. There is no error in any changed file. The 13 it prints are
  ambient-declaration gaps of a scoped config, in untouched files.
- **Gates** (`gates.txt`), all exit 0:
  - `ci:undefined-css-classes`, `ci:untracked-imports`, `ci:migration-set-order` (364 migrations, sweep last),
    `ci:migration-drop-safety` and its selftest (12/12), `ci:check-client-api-calls`, `ci:launch-scope-api`,
    `ci:server-error-leaks`.
  - `ci:untracked-imports` reads only the committed push range. It was therefore also run with `--all`, against the
    real index and against a temporary copy with the four new files intent-to-add. It names this change's import only
    in the first case.
- **DB tier** (`green/db-tier.txt`): fresh CI-shaped database, `RLS_ENFORCE=on`. `deploy-migrate` was run twice, and
  10 DB test files (report-os ×3, compliance-reports ×2, program-ownership, c2c-project-persistence,
  lifecycle-signature-binding, provisioned-tenant-tables-rls, rls-tenant-isolation) passed **116 / 116**.

No credentials, connection strings or tokens are in this folder. The only "secret" text is the test runner's warning
that `AUDIT_HMAC_SECRET` is unset, and it is not reproduced here.

## Not verified

- No browser walk or live after-check: nothing here was exercised in a running app, and there are no screenshots.
- `PUT /api/ind-forms/program-facts` ran only against PGlite (contract tests). On the real fresh database only the
  columns, the RLS state and the replay were checked.
- The provenance-completeness loader ran against a mocked pool. Its SQL is the span-lineage service's own, already
  covered by `document-attribution-summary.pglite.integration.test.ts`. It was not read against real
  `document_span_lineage` rows in Postgres.
- `ci:untracked-imports` in its push mode cannot see uncommitted files. It was exercised on a temporary index instead.
- The full repository test suite was not run. Only the suites listed above were.

## Decisions needed

1. **Item 7: where the 16 registers live.** Audit & compliance reports does not hold them today. Removing them from the
   program canvas needs a reachable replacement. Choose one:
   - (a) A Registers section in Audit & compliance reports, run through report-os at an organisation scope. This needs
     `account` added to the allowed scopes of 9 registry rows, and the registry has no version rows, so a versioning
     design comes first.
   - (b) Each register as a compliance-report definition, sealed and chained like the other eight.
   - (c) Keep them on the canvas, stated as organisation-wide, until (a) or (b) exists.
2. **Item 8: the threshold, and what counts as "recorded".**
   - A trace finalizes at 70% provenance completeness, because the threshold is unchanged. Should a sealed trace
     require 100%?
   - Machine-drafted text that nobody accepted counts as having a recorded origin, as it does on Authoring's bar.
     Should it count toward completeness?
   - The trace floors and the Authoring bar rounds, so they can differ by 1 point at x.5 and above.
3. **Item 6: pack copy.** Packs now hold only computed reports, but their static descriptions still name reports that
   are not computed. Examples:
   - The Pre-approval command pack "pairs the readiness digest with safety-signal alignment and the audit assurance"
     but now holds only the digest.
   - The "510(k) clearance pack" and "IVD performance & clearance pack" now hold only the inspection pack.

   Renaming or recomposing packs is product copy, so it is not changed here.
4. **Item 2: scope of "every submission carries its form".** The decision was taken for IND and Form 1571 only.
   Continuing NDA, BLA and ANDA sequences are still held to no Module 1 heading, although they carry Form 356h.

