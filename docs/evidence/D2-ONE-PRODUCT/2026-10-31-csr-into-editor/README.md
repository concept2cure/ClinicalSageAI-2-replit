# D2 / RULE 4: a CSR's study data enters from its own document, in the one editor (2026-10-31)

**Row.** D2 (Authoring). **Rule.** CLAUDE.md RULE 4: one canvas and one document editor for every document type; a
document starts from its project. **Design.** `docs/design/CSR_END_TO_END_2026-10-29.md`, decision 1, convergence
plan: step 1 walked, step 2 designed and done here.

## What already exists

- **The one document start.** Project home → "Find or start a document in the editor" → **New document**
  (`AuthoringCreateExport.tsx`). The CSR is a template there, "GLOBAL · Clinical Study Report (CSR)", with 119 ICH
  E3 sections (`document-template-library.ts`, `clinical_study_report`).
- **The one editor.** `DocumentWorkbench.tsx` already shows a CSR "Build from the study's data" panel
  (`editor/StudyDataBuild.tsx`, `13612551d4`). That panel offered builds only on a Submission Center package run's
  tables.
- **The study's data.** It is a Vault document (`concept2cure.csr-source.v1`, or an ADaM bundle manifest), loaded
  by `withCsrVaultSource` with an exact version, its digest and lifecycle approval. Its tables were frozen only
  inside a package run (`submission_orchestrator_inputs`, whose run row needs a submission, an application number
  and a region) and chosen on Submission Center (`CsrSourceInputControls` on `OrchestratorRunControls`, and
  `clinicalSource` on `POST /runs/for-program`).
- **One reader serves the whole engine.** `readVerifiedRetainedStudies` (`services/csr/saved-clinical-tables.ts`):
  the build's evidence, the narratives, the assembly and the drafting context all read through it.

## Before (walked in the running app)

BX-512 → New document → Clinical Study Report → the editor (`1-…`, `2-…`). "Build from the study's data" said:
*"No saved run holds this study's data yet. Include the study's clinical source in a package run in Submission
Center first."* (`3-before-sent-to-submission-center.png`). A CSR could not use its own study's data until a filing
existed, and never from its own document.

## The change

- **Store.**
  - `migrations/20261031_csr_study_data.sql` adds `public.csr_study_data`: `organization_id INTEGER NOT NULL`,
    the project, and the authoring document it is a source of.
  - It is sealed with the run inputs' digest and seal, and is immutable.
  - It is in the deploy set before the isolation tail, and the sweep gives it its tenant policy (verified:
    RLS on, one policy).
  - Tenant purge records it as retained, with its reason.
- **Server.**
  - `services/csr/csr-study-data.ts`: freeze, which needs the document in the project, editor access and an
    approved exact source; and list, which returns receipts only, never subject rows.
  - `POST` and `GET /api/submission-orchestrator/csr/study-data`, with an audit row `csr_study_data_frozen`.
  - The one reader resolves an id against a package run's inputs, then against a document's study data, with the
    same verification. The build, narratives and assembly are unchanged.
- **Editor.**
  - `editor/StudyDataSource.tsx` holds the picker, the preview, the tables, the format and the freeze, moved from
    `CsrSourceInputControls`, not copied.
  - `StudyDataBuild.tsx` lists the document's study data, and earlier package runs whose builds stay reachable.
    It builds on the chosen one, and keeps the pivotal declarations.
- **Removed, in the same change (zero duplication).**
  - `surfaces/CsrSourceInputControls.tsx` is deleted. Its replacement is `editor/StudyDataSource.tsx` and
    `editor/StudyDataBuild.tsx`, mounted in `DocumentWorkbench.tsx`. Reachability is proven by
    `studyDataSource.test.tsx` and this walk.
  - Submission Center's run controls no longer offer or send a clinical source.
  - `POST /runs/for-program` is strict and refuses `clinicalSource` (400), so no caller is silently given a run
    without it.
- **Launch scope.** The four study-data endpoints are attributed to the editor's surface (`document-authoring`), and
  the three that moved are removed from submission-center's. `ci:launch-scope-api`: 593 paths, none refused. It was
  red (`/api/submission-orchestrator` unmapped) until this was done.

## After (walked in the running app, `walk.cjs`)

The CSR document in the editor:
1. "Build from the study's data" shows the study's clinical source input itself (`4-…`).
2. Choose the source, then preview its tables, protocol and data cut (`5-…`).
3. "Freeze as this document's study data". The study data is selected, and "Build CSR draft · SYN-001" is offered
   (`6-…`).
4. "Build CSR draft" queued build 1, which ran and drafted 37 of 119 E3 headings (`7-…`).

No package run, no Submission Center, no console error and no failed request.

**Declared shortcut.** The source was ingested through the real `POST /api/vault/ingest`. Its lifecycle approval was
recorded directly in the lane database (a `canonical_documents` row, `stage = approved`, at its exact hash), as the DB
suite's fixture does. The Vault approval ceremony is not part of this change.

## Proof

- **Reader** (`saved-clinical-tables.test.ts`). 20 of 20 pass.
  - A document's study data reads through the same verification.
  - An altered snapshot is refused.
  - An id held by neither store is a 404.
  - Removing the lookup turns 2 red.
- **Editor** (`studyDataSource.test.tsx`, ported from the deleted card's suite). 11 of 11 pass.
  - It previews the exact version and hash, and freezes only on an explicit action.
  - An unapproved source cannot be frozen.
  - A malformed preview is refused.
  - A failed list is not shown as an empty one.
  - Pagination and the source format work.
  - The CSR document builds on the frozen data with no package run.
  - Pivotal declarations are kept with the study data.
  - Submission Center takes no clinical source.
  - Restoring the previous panel turns 2 red.
- **Ported suites.** `csrCardReach.test.tsx` and `csrBuildProgress.test.tsx`: 26 of 26 with the above.
- **DB suite** (`tests/db/csr-vault-source-input.dbtest.ts`, real PostgreSQL, `app_service` under RLS). 7 of 7
  (`db-suite.txt`).
  - The freeze stores the sealed snapshot and receipt, with a chained audit row.
  - The list returns receipts only.
  - A run sent `clinicalSource` is refused 400.
  - A viewer is refused 403.
  - A draft source is refused 409, and no row is written.
- **Gates.** `ci:migration-set-order`, `ci:migration-drop-safety`, `ci:migration-reachability`,
  `ci:column-reachability`, `ci:purge-coverage` (on the lane database) and `ci:launch-scope-api` all pass.
- **Deploy.** `deploy-migrate` applied 460 of 460 on both lane databases.

## Found, not changed here

- **The CSR builder outruns the AI gateway's per-user limit.**
  - In the walk, 38 section drafts were refused "User rate limit exceeded: 31/30 requests per minute". The build
    then failed with `missing_section_outputs`, and kept what it drafted for a resume.
  - A 119-section build will meet this with real model keys too. The builder does not pace itself under the
    gateway's limit. That is a defect in the engine, for its own change.
- **Ten tests in five client files fail on trunk without this change.** The files are `registryModel`,
  `moduleCatalogReconciliation`, `clientNamesSlice1`, `projectFeatureBreadcrumb` and `csrWorkflowProgramScope`.
  They cover the rail and the catalog, which other work changed today.
- **Remaining convergence steps** (design, decision 1):
  - Step 3: a heading's draft is the editor's section draft, grounded in the engine tables.
  - Step 4: narratives and assembly become document actions.
  - Step 5: the build's own section review folds into the editor's review.
  - `BiopharmaProject.tsx` still mounts `CsrHeadingReview`, `CsrNarrativeBuild` and `CsrAssemblyControl`.
  - Submission Center still mounts `CsrNarrativeReadiness`.
