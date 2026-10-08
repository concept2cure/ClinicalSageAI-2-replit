# QA 2026-10-08, second walk: intake facts, form completion, readiness context, review tasks

Five items from the second browser walk (`scratchpad/qa/findings-2/j1-projects.json`, `j7-readiness-ind.json`,
`j8-qms-reporting.json`). Four are fixed here, each red first. The fifth belongs to FILING_SPINE F23/F1 and is
reported with evidence, not built. Nothing is committed or staged.

| # | Finding | Outcome |
|---|---|---|
| 1 | The wizard saves the therapeutic area as the indication and records "biologic" from the tab | Fixed (P-21) |
| 2 | An unedited 1571/1572 upload marks the form COMPLETE | Fixed (Rule 2: the forms engine decides) |
| 3 | The readiness digest "records no registry context" for every program | Fixed at the source, plus a Rule 1 backfill |
| 4 | The Review tab lists nothing while a review is assigned | The write is fixed, plus a backfill. The Vault-version half is F7's read |
| 5 | Project home "No document sections yet" vs Authoring "92 sections" vs IND "1/18" | Belongs to F23 (with F1/F4). Not built |

## 1. The new-project wizard records only what the person stated

**Cause.**
- `Projects.tsx` sent the therapeutic-area label as the program's `indication`. The dropdown started on "Oncology
  (general)" (`useState('onc_general')`), and Form 1571 reads `regulatory_programs.indication`.
- The product type came from `SEG2PRODUCT[lane]`. The shared vocabulary also mapped every IND to `'biologic'`
  (`FILING_TYPE_PRODUCT_CLASS.ind`), and `cta`, `maa` and `jnda` to `'drug'`. None of those four filing types
  fixes the class.

**Fix.**
- `Projects.tsx`:
  - The therapeutic-area dropdown is gone. Nothing else read it.
  - Step 2 has a free-text **Indication**. When it is blank, no indication is sent.
  - For a filing type that does not fix the class, Step 2 asks **Product type**: "Not stated — choose", then Drug
    or Biologic. Continue and Create wait until one is chosen.
  - The review shows "Indication: Not stated" and "Recorded as IND · drug".
  - `SEG2PRODUCT` and `productTypeForSelection` are removed.
- `shared/constants/domain/product-types.ts`: `ind`, `cta`, `maa` and `jnda` resolve to `null`, so the person is
  asked. NDA and ANDA stay drug, and BLA stays biologic.
- `server/routes/c2c/project-intake.ts` `productTypeForIntake` refuses with 400:
  - an IND, CTA, MAA, J-NDA or DMF with no class stated;
  - one of those filings stated as a non-medicinal class.

  The existing device guard is unchanged.

**Red → green.**

| Test | Red (`red/`) | Green (`green/`) |
|---|---|---|
| Client wizard (`1-wizard-client.txt`) | 6 of 7 fail | 23/23, with the name and failure suites |
| Shared vocabulary (`1-product-types-shared.txt`) | 5 fail | 43/43 |
| Server create (`1-3-projects-create-stated-facts.txt`, against HEAD intake) | 2 refusals fail | 6/6 |

In the server red run, "records the stated class" and "records no indication" pass at HEAD. They are guards, not
fixes.

## 2. An attached form is an attachment, not a completion

**Cause.** `ind-checklist-view-assembler.ts` counted any sponsor-attached `rendered_leaf_files` row as a completed
form. The upload's only content check was a byte comparison with the blank vendored template. The product's own
render is not that blank, so the unedited 1571 and 1572 passed.

**Fix.**
- **The check.** `server/services/ind-forms/attached-form-check.ts` is the forms engine's verdict on an
  attachment. It takes the union of two things:
  - the build's `missingRequired` over the program record plus what the person stated (the same metadata Build &
    check uses);
  - the render's `requiredFieldsLeftBlank`, when the attached bytes are the platform's own render. Renders are
    byte-deterministic, which `scratchpad/det.ts` checked.
- **The upload** (`ind-forms.routes.ts`):
  - records the check on the file, in the new `rendered_leaf_files.required_fields_missing` column;
  - writes the check to its audit row;
  - answers `requiredFieldsMissing`, `complete` and `uneditedPlatformRender`;
  - still files the form. The placement listing carries the check.
- **The checklist** counts an attached form only when `required_fields_missing = '{}'`. A form with fields
  missing, NULL (no check recorded) or no column is never counted complete.
- **The panel** (`IndFormsPanel.tsx`):
  - sends the stated fields (phase, serial number) with the upload, and never the record's own facts;
  - after filing, says "filed …, and not counted as complete: N required field(s) missing — …";
  - gives each placement "completed form filed", "attached · not complete" with its missing fields, or
    "attached · not checked".
- **Migration** `20261008e`: `ADD COLUMN IF NOT EXISTS`, with no backfill. Earlier attachments were never checked,
  and in QA they are the two blank forms.

**Red → green.**

| Test | Red | Green |
|---|---|---|
| Upload contract (`2-forms-upload-contract.txt`) | Through the real route, the unedited 1572, the unedited 1571 with phase stated, and a 1571 with no phase each fail with "the checklist counts … as complete: expected true to be false" | 64/64 |
| Checklist (`2-checklist-assembler.txt`, against HEAD's assembler) | 2 fail | 36/36 |
| Panel (`2-forms-panel.txt`, against HEAD's panel) | 4 fail | 31/31 |

## 3. The digest can compute readiness

**Cause.** `report-os/orchestrator.ts` evaluates readiness only from `projects.metadata.registryId`, or from
`.submissionType`, on the project record. Nothing wrote either:
- intake put the wizard's `submissionTypeId` on `regulatory_programs.metadata` only;
- `ensureProgramProjectAnchor` inserted the project record with no metadata;
- the P-19 anchor backfill wrote none either.

In `c2c_qa`, 27 of 27 project records have NULL metadata.

**Fix: intake records the context.** `server/services/c2c/program-registry-context.ts`
(`registryContextForProgram`) takes, in order:
1. the wizard's choice, resolved by the submission-type bridge;
2. failing that, a filing type whose registry entry its agency fixes (`PROGRAM_TYPE_REGISTRY`, 13 pairs);
3. otherwise nothing.

`mdr` is deliberately unmapped: the bridge reads it as US_MDR_REPORT. `ensureProgramProjectAnchor` now writes the
result into `projects.metadata`.

**Fix: backfill.** `migrations/20261008c_projects_registry_context.sql` is an idempotent UPDATE over the program's
own organisation's record, and only where no context is recorded. It runs after 20261008 (the P-19 backfill). The
digest still never guesses.

**Red → green.**

| Test | Red | Green |
|---|---|---|
| `3-digest-readiness-e2e.txt` (POST /api/c2c/projects, then the real `computeInitialRun`, on PGlite) | Against HEAD intake, both programs read "records no registry context" | 2/2: evaluated against US_IND and US_510K |
| `3-registry-context-backfill.txt` | The migration is missing | 31/31 |

The backfill test covers:
- every `PROGRAM_TYPE_REGISTRY` pair, compared with the TypeScript rule;
- the QA shapes: wizard IND, seeded IND, MAA, J-NDA, 510K;
- what it leaves alone: IND/MFDS, CER, mdr, device, an existing context, a soft-deleted program, another
  organisation's row;
- a second run, which changes nothing.

**Deploy.** `deploy-migrate/run1.txt` and `run2.txt` are from `concept2cure-ri_qa_fresh2`:
- run 1: "registry context recorded on 2 project record(s)";
- run 2: 0. Both exit 0.

## 4. A review task records its project

**F7 first.** F7 ("The Review tab shows this filing's reviews", FILING_SPINE §7.2) changes the tab's READ to
`/api/review/board?programId=`. That board reads the authoring review store (`authoring_reviews`) by
`authoring_documents.client_program_id`. The walk's case has two halves:
- **(a) The write: fixed here.** The Authoring review assigned to Raj (`unified_tasks` 19, and 17 and 18 for
  Vorelinib) was written by Assign review through `POST /api/tasks/tasks`:
  - `sourceEntityType 'authoring_document'`, with `moduleData.programId` set and no `projectId`;
  - the editor holds the program UUID, but `unified_tasks.project_id` is the integer `projects.id`;
  - so the task was stored with `project_id` NULL, and today's Review tab reads work by project
    (`loadUnifiedWork`).

  F7 replaces the reader. The NULL column is still wrong for every other reader by project: My work, the task
  board filters and AnA's project context.
- **(b) The read: F7's.** The Vault version in review with Raj's open change request has no task at all. It is a
  regulated document at stage `in_review` plus a `request_changes` annotation. Listing Vault versions in review on
  the Review tab is a read on the Review tab: F7. F7's spec as written reads only the authoring board, so it would
  not list Vault versions either. See the decisions below.

**Fix.**
- `server/services/tasking/task-project.ts` (`projectForTaskSource`) reads the source document's own program, in
  the caller's organisation, and maps it to its project record. It uses the one anchor reader, on the request's
  RLS client.
- `POST /tasks` records it when the caller names no project. If the read fails, it answers 503
  `TASK_PROJECT_UNREADABLE` and writes nothing.
- `migrations/20261008d_unified_tasks_authoring_review_project.sql` uses the same rule, and only where
  `project_id IS NULL`. Replays are idempotent.

**Red → green.**

| Test | Red | Green |
|---|---|---|
| `4-task-project.txt` | Module and migration missing: 7 fail, including "the work view the Review tab reads lists the review" | 7/7 |
| `4-task-route.txt` | 2 fail | 4/4 |

## 5. Not built: FILING_SPINE F23 (with F1 and F4)

`item5/stores.txt` holds read-only queries on `c2c_qa`. Every screen reads the right id: the same `c2c_documents`
row, and the same program UUID. Each counts a different store:

| Screen | Counts | BX-256 | Vorelinib |
|---|---|---|---|
| Authoring tree header (`DocumentWorkbench.tsx:3359`) | Rule-pack outline nodes (`/api/c2c/documents/:id/outline` → `c2c_rule_packs.required_sections`) | 92 | 92 |
| Project home Module completion (`/workstreams`) | `c2c_document_sections` rows | 0 | 0 |
| IND lifecycle | `coauthor_documents` placed as sequence leaves | 1 of 1 complete | 4 of 4 complete |
| Author document list | `authoring_documents` | 0 | 4 |

This is FILING_SPINE §6 break 26, "Three readiness figures disagree", which F23 fixes. The section rows that
editor work never writes are break 1 (F1), and starting an unstarted section is F4. F23 is claimed by the
coordinating session and waits on F1, F9, F10 and F22. Nothing is built here.

## Verification

All runs below used `RLS_ENFORCE=off`, except the fresh-database runs.

- **Touched suites:**
  - Client and shared: 56 files, 419 tests (`green/client-and-shared-suites.txt`). One failure:
    `insightsReportsRunWhatTheyName`, a 5 s timeout under load, which passes alone (17/17).
  - Server and schema-contract: 360 files, 4271 tests (`green/server-suites.txt`). Two fail, both in
    `ectd/__tests__/lifecycle-rehearsal.pglite.test.ts`. Each is a 42P01 on `SELECT name FROM organizations`
    from the gateway/package worker's modified `assemble-from-core.ts` (with the untracked `package-identity.ts`).
    Neither touches a file of this change.
- **Golden journeys and tests/lineage** (`green/journeys-lineage.txt`): 11/12 files.
  - `tests/lineage` fails at hop 8 (transmit) with `409 PACKAGE_IDENTITY_MISSING`.
  - That refusal comes from `server/services/ectd/package-identity.ts` (untracked) and the modified
    `submission-service.ts`. Both are the gateway/package worker's in-flight work ("applicant/application number
    in packages"). Hops 1–7, including project creation, pass.
- **Fresh database** (`concept2cure-ri_qa_fresh2`, `RLS_ENFORCE=on`):
  - deploy-migrate twice, exit 0 both times;
  - 36 DB test files (projects, program, report-os, Vault, tasks), 285/285 (`green/db-tests-fresh2.txt`).
- **Gates** (`gates.txt`):
  - `ci:undefined-css-classes`, `ci:untracked-imports`, `ci:migration-set-order` (367, sweep last),
    `ci:migration-drop-safety` and its selftest (12/12), and the requestDb gate with `--strict-no-regression`
    (227 vs a baseline of 228) all exit 0.
  - `--all` names the three new modules only because nothing is committed yet. They must be committed with their
    importers.
- **tsc** (`tsc.txt`): 0 errors in the 27 changed TypeScript files.
- **ESLint** (`lint.txt`): no changed file gains a warning.
- **Mutations** (`mutations.txt`): each test fails when its fix is removed.
  - M7 first survived: the anchor reader's own organisation scope masked a missing `tenant_id` filter on the
    document read.
  - The test now includes another organisation's document that names this organisation's program, and M7b fails
    as it should.

Harnesses: none drive a browser. All evidence is vitest output, plus read-only SQL on `c2c_qa`.
