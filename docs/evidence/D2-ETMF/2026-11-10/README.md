# eTMF convergence, slices E2 and E3: a TMF belongs to a study, and filing is governed

Row D2. Decisions P-74 and P-75 (`docs/LAUNCH_DEFINITION_OF_DONE.md`). Design
`docs/design/ETMF_CONVERGENCE_2026-10-30.md` (E1 landed as `3fa2b6febc`; E2 and E3 are here; E4 to E6 are not).
Base: `bb17f97b77`. Server only. Not committed by this session.

This completes Store A (`server/routes/etmf.routes.ts`, `server/services/etmf/tmf-artifact-persistence.ts`,
`server/services/etmf/tmf-inspection-package.ts`, `shared/schema/tmf-artifacts.ts`, table `tmf_artifact_filings`).
Nothing new was built: no route file, service file, table, mount or tool.

## The decision

The founder, 2026-11-10: "I don't see the TMF on the vault UI anywhere." The store was deployed, and a trial in it
was a string a person typed, bound to nothing.

**E2. The defect.** `tmf_artifact_filings.trial_id` was free text. Any member of the organization read and wrote any
trial name, for any project or none. The one project check was on the Vault document a filing referenced, and that
document could belong to any project the caller could open.

**E3. The defect.** A filing committed, and its audit row was attempted afterwards on another connection
(`recordAuditRow`), without the document. When that write was lost the filing stood, with a header saying so. A
removal was a `DELETE` with no reason. The inspection package was sent with nothing recorded
(`recorded-downloads.contract.test.ts` listed it as "not served").

## What already exists

Searched: `etmf`, `tmf`, `trial master`, `tmf_artifact_filings`, `tmfArtifactFilings`, `TMF_ARTIFACT_`, `api/etmf`,
`cdisc_prm_studies`, `study_ref`, `authorizeAuthoringProgram`, `requireCurrentProgramAccess`, `writeChainedAuditRow`,
`sendAuditedDownload`, `governed-reason`, `transaction(` across `server/`, `shared/`, `migrations/`, `db/migrations/`,
`scripts/`, `tests/` and `client/src/`; and `git log --all --diff-filter=D -- '*etmf*' '*Etmf*' '*tmf*' '*Tmf*'`
(one deleted file, `client/src/concept2cure/v2/fixtures/etmf.ts`, removed by E1; the clone is shallow).

| Piece | Path | What it did at `bb17f97b77` | What it did not |
|---|---|---|---|
| The table | `migrations/20260615_tmf_artifact_filings.sql` (deployed, `scripts/db/migration-set.mjs:2984`), `shared/schema/tmf-artifacts.ts` | One row per (organization, `trial_id`, artifact code) | No study, no project, no record of a removal |
| The service | `server/services/etmf/tmf-artifact-persistence.ts` | File, list, remove, readiness from verified Vault documents; organization-scoped | Any trial name accepted; audit after commit, without the document; hard delete |
| The package | `server/services/etmf/tmf-inspection-package.ts` | Builds the index ZIP | Not bound to a study |
| The assessor | `server/services/etmf/tmf-completeness.ts` | Deterministic assessment | Unchanged here |
| The routes | `server/routes/etmf.routes.ts`, mounted at `/api/etmf` (`server/bootstrap/register-inline-routes.ts:495-514`) | `requireRole('regulatory-author')`, rate limit | No reason, no study, package unrecorded |
| The study | `cdisc_prm_studies` (`shared/schema.ts:13140`); `GET /api/study-design?program_id=` (`server/routes/study-design.ts:565`, `listStudyDesigns`, `server/services/study-design/study-design-repository.ts:395`) | Lists a project's studies as `studyId` (the row's `study_id` string), `programId`, `title`, `phase`, `indication`, `status` | Does not return the row id |
| The precedent | `migrations/20261008d_cre_source_study_ref.sql` | `study_ref`, a unique `(id, tenant_id)` index, a NOT VALID same-organization key, `ON DELETE SET NULL (study_ref)` | For `cre_evidence_sources` only |
| Project admission | `server/services/c2c/current-program-access.ts:129` (`requireCurrentProgramAccess`), `server/services/vault/vault-write-authority.ts:59` (`requireCurrentVaultProgramWrite`); also `server/services/authoring/authoring-program-access.ts` (`authorizeAuthoringProgram`), which Store A called for the document's project | The Vault's read and write rules | Reused, not copied |
| Chained audit | `server/services/auditService.ts:285` (`writeChainedAuditRow`); used by `recordVaultDownload` and `recordVaultArchive` (`server/routes/c2c/project-vault.ts:449,553`) | One sealed row on the caller's transaction | Reused |
| Transaction | `server/db/runtime.ts:202` (`transaction`) | BEGIN, COMMIT, ROLLBACK, evicts a broken connection | Reused |
| Reason | `server/routes/governed-reason.ts:30` (`requireGovernedReason`), `shared/constants/governed-reason.ts` (8 to 2000 characters) | The one reason rule | Reused |
| Recorded download | `server/services/export/governedExportConsequence.ts:344` (`sendAuditedDownload`) | Writes `EXPORT_GENERATED` with the SHA-256, then sends | Reused |
| Store B | `server/routes/etmf.ts`, `server/services/etmf/etmf-service.ts`, `etmf-logic.ts`, `migrations/20260610_etmf.sql` | On no deploy path | Not touched: slice E4 |
| The screens | `client/src/concept2cure/v2/surfaces/Etmf.tsx` (types a trial id); the Vault's Trial master file section (`VaultTrialMasterFile.tsx`, another session, in progress) | | Not touched |

## What changed

### E2

- **Migration** `migrations/20261110_tmf_filings_study_ref.sql`, in `C2C_MIGRATION_FILES` before the isolation tail.
  `study_ref INTEGER`; the unique index `cdisc_prm_studies (id, tenant_id)` when absent; the key
  `tmf_artifact_filings_study_same_org_fk (study_ref, organization_id) → cdisc_prm_studies (id, tenant_id)`, NOT
  VALID, `ON DELETE SET NULL (study_ref)`; an index on `study_ref`. Every statement runs only when its object is
  absent. No DROP. The three removal columns and their CHECK (E3) are in the same file.
- **The trial is a study.** In `/api/etmf/trials/:trialId/…` the trial is the study's own id string: the `studyId`
  that `GET /api/study-design?program_id=` lists (`cdisc_prm_studies.study_id`). The list does not return the row
  id, so the string is the only name a client holds. The study must be the caller's organization's, have a
  project, and that project must be one the caller can open, by the Vault's rule: `requireCurrentProgramAccess`
  for a read, `requireCurrentVaultProgramWrite` for a write, on the writer's transaction. Anything else is 404
  `STUDY_NOT_FOUND`, and no filing is read or written. A check that could not run is 503
  `STUDY_ACCESS_UNAVAILABLE`.
- **A filing stores its study.** `study_ref` is the study's row id; `trial_id` is the study's id string, so
  `tmf_artifact_filings_unique` holds one row per study and artifact.
- **A row with no study** (filed before this) is read by `study_ref`, so it is served as no study's filing, counted
  in no assessment and removable by no route, even when its free text equals a study's id. A filing made for the
  study under the same key takes that row's place.
- **The document is the study's project's.** A `vault://` reference must be a live document of the study's own
  project. One refusal, 409 `DOCUMENT_NOT_IN_PROJECT`, covers a document that is absent, deleted, another
  project's or another organization's; its message does not carry the id. Readiness verifies a reference against
  the study's project too. `DOCUMENT_ACCESS_DENIED` and `DOCUMENT_ACCESS_UNAVAILABLE` are gone: the caller is
  admitted to the study's project before a document is looked at.
- **Completeness** keeps its shape and gains `study`: `{ id, studyId, programId, protocolId, title, phase,
  indication, status }`, the names the study list uses, with the row id and the protocol id.
- **Refusals** of this router answer `{ success: false, error: <CODE>, message }`.

### E3

- **A reason.** Filing, bulk filing (one reason for the batch) and removing each need a reason of 8 to 2000
  characters after trimming (`requireGovernedReason`). Otherwise 400 `REASON_REQUIRED`, before anything is read.
- **The audit row is the change's own.** `writeChainedAuditRow` runs on the transaction's client, after the write
  and before COMMIT. Its details name the study (`id`, `studyId`, `protocolId`, `title`), the project, the
  artifact code and zone, the document filed, the reason, and `outcome`:
  `filed`; `refiled` with `replacedDocumentRef`; `filed_after_removal` with `clearedRemoval`;
  `filed_over_unlinked` with `replacedUnlinkedFiling`. A removal's row names the document that was filed.
- **A removal keeps the row.** `removed_at`, `removed_by`, `removal_reason`, guarded columns, with
  `tmf_artifact_filings_removal_recorded_chk`: a removed row carries a reason of at least 8 characters, a live row
  none of the three. Every reader filters `removed_at IS NULL`. Filing the artifact again updates the same row
  under its lock and clears the three, so the unique key is unchanged.
- **The inspection package is recorded.** `sendAuditedDownload` writes `EXPORT_GENERATED` (resource
  `tmf_inspection_package`, the study's row id, the SHA-256 of the bytes) and then sends. When that row does not
  persist, 503 `UNAUDITED_EXPORT_REFUSED` and nothing is sent. The file name is made of safe characters only. The
  stale "not served" entry is removed from `recorded-downloads.contract.test.ts`.

### E3b: the list says what each filing's document is

`GET /api/etmf/trials/:studyId/artifacts` gives each live filing a `document`. When the filing's `documentRef` is a
`vault://<id>` of a live document of the study's project it is `{ id, title, version, current }`: `title` is the
document's `document_title`, or its `file_name` when the title is blank, or null when it has neither; `current` is
false when a live later version has replaced it. Any other reference (none, off-platform, a path, a document that
is deleted, another project's or another organization's) gives `document: null`; no title is made from the
reference. The documents are read once for the whole list (`filedDocuments` in
`server/services/etmf/tmf-artifact-persistence.ts`), bound to the organization and the study's project; a failed
read is an error, not a list without documents. "Current" is the Vault's one link rule (`VALID_LINK` in
`server/services/vault/vault-version-family.ts`) written out literally, as that file's `readSuccessors` does:
`supersededSql` would be a new interpolation in this file, which `ci:sql-interpolation` refuses. The other
responses are unchanged.

### Tests changed, and why

| File | Change |
|---|---|
| `server/services/etmf/__tests__/tmf-document-ref-guard.test.ts` | To the study's project and the transaction seam; 9 → 11 |
| `server/services/etmf/__tests__/tmf-readiness-counts-only-verified-documents.test.ts` | Reads through the study; 8 |
| `server/services/etmf/__tests__/tmf-inspection-package.test.ts` | One read (`readTrialTmf`); the file name; 3 → 4 |
| `server/routes/__tests__/etmf-artifacts.routes.test.ts` | The new contract on PGlite, with the real migration applied from disk; 6 → 12 (one is E3b's) |
| `server/routes/__tests__/tmf-assessment-audit-outcomes.test.ts` | TMF half reversed: it pinned "the filing stands when its audit row is lost"; 11 |
| `tests/db/tmf-assessment-audit-outcomes.dbtest.ts` | The same reversal on PostgreSQL, against a real study; 11 → 10 |
| `server/services/export/__tests__/recorded-downloads.contract.test.ts` | One "not served" entry removed; 36 → 35 |
| `server/routes/__tests__/_etmf-pglite-fixture.ts` (new, not a test) | The PGlite database the two route suites share |

## Evidence

| File | What it shows | Result |
|---|---|---|
| `e2-01-red.txt` | The E2 tests on the unchanged source | Unit 20 failed of 20. PostgreSQL 12 failed, 1 passed of 13. The one that passed is held by the database (the migration is applied in every run); the file ends with it seen failing with the key absent, in a rolled-back transaction |
| `e2-02-green.txt` | The E2 tests on the source when E2 was done and E3 not begun, then on the final source | Unit 20 of 20 and PostgreSQL 13 of 13, both times |
| `e3-01-red.txt` | The E3 tests on the unchanged source, then on the source with E2 only | HEAD: unit 21 failed, 1 passed of 22; PostgreSQL 13 failed of 13. E2 only: unit 21 failed, 1 passed; PostgreSQL 12 failed, 1 passed. The unit case that passes is "an unknown artifact code is still refused first", true before. The PostgreSQL case that passes with E2 only is "served by no reader once removed": a deleted row is not served either; the case before it fails. The removal CHECK is seen failing with the constraint absent at the end of the file |
| `e3-02-green.txt` | The E3 tests on the final source | Unit 22 of 22. PostgreSQL 13 of 13 |
| `e3b-01-red.txt` | The E3b cases (7 unit, 2 PostgreSQL, added to the two study-binding suites) on the source with E2 and E3 done | Unit 6 failed, 1 passed of the 7 (the one that passes: nothing is read for a study the caller cannot open, true before). PostgreSQL 2 failed of 2. Every earlier case passes |
| `e3b-02-green.txt` | The same on the final source | Unit 27 of 27 (7 new). PostgreSQL 15 of 15 (2 new). The PGlite route suite, with its one new case, 12 of 12 |
| `03-suites.txt` | Suites over these files, on the final tree | After E3b (last section of the file): eTMF units and routes 14 files, 153 passed; eTMF on PostgreSQL 3 files, 38 passed. Before E3b: eTMF units and routes: 14 files, 145 passed. Reused helpers and the downloads contract: 3 files, 45 passed. eTMF on PostgreSQL: 3 files, 36 passed. Vault and study suites on the same database: 3 files, 32 passed. Migration set contracts: 4 files, 46 passed. Applier manifest: 8 passed, 2 failed, both naming other files and both failing with HEAD's set. Gates: each exit 0 |
| `04-migration-run1-apply.txt` | `deploy-migrate` on the fixture database, first run | Exit 0. Seven catalog rows added by one transaction |
| `05-migration-run2-replay.txt` | The same command again | Exit 0. No NOTICE on the file's line. Every column, constraint and index row keeps its `xmin`. The file alone, by `psql`, changes no catalog row |

How the main claims are proved on PostgreSQL 16 as `app_service` with `RLS_ENFORCE=on`:

- One transaction: the filing row and its audit row carry the same `xmin`, for a filing, a re-filing and a removal
  (`tests/db/etmf-governed-filing.dbtest.ts`). With the audit INSERT rejected on the transaction's connection,
  PostgreSQL keeps neither the filing nor the removal (`tests/db/tmf-assessment-audit-outcomes.dbtest.ts`).
- The chain: `verifyAuditChain` for the test organization after filings, a removal, a re-filing and a download:
  `ok`, no legacy row.
- Admission: a member shared on project A reads and files study A and gets 404 for study B of the same
  organization; another organization gets 404 (`tests/db/etmf-study-binding.dbtest.ts`).

ESLint: 0 warnings before and after on each of the four source files and on every test file changed or created.
`ci:sql-interpolation`: no new interpolation; the baseline count is unchanged (1048). Both were run again after E3b,
with the ESLint ratchet (`--since HEAD`: no file changed its warning count).

## Not done here

- **Not committed by this session.** The lead commits, and names the plan package. `server/routes/etmf.routes.ts`
  and `server/services/etmf/**` are in no `paths` of package S6 in `docs/design/one-design-plan.json`; the plan was
  not changed here.
- **`tsc` not run** (left to the lead). **The dev server was not started**: the routes were exercised over the
  mounted router with supertest, on PostgreSQL and on PGlite, not in the running app.
- **Store B** (`server/routes/etmf.ts`, `etmf-service.ts`, `etmf-logic.ts`) is untouched: slice E4.
- **The client** is untouched. `surfaces/Etmf.tsx` sends a typed trial id and no reason, so against these routes it
  now gets 404 and 400. It is outside `LAUNCH_APPS`. Slices E5 and E6.
- **Rows with no study** stay in the table. No route lists or removes them, and nothing was backfilled or
  inferred. The fixture database held none before this work; the red runs on the unchanged source, and the suites'
  own unlinked rows, left 23 there, kept as test residue. How many a deployed database holds was not counted.
- **A deleted study design detaches its filings** (`ON DELETE SET NULL (study_ref)`, the 20261008d shape). They
  stay on record and no route serves them. `DELETE /api/study-design/:id` does not say so.
- **`document` is on the list only.** The 201 answer of a filing and the completeness answer do not carry it.
- **The filing reason** is on the audit row only. The removal reason is on the row and the audit row.
- **`server/db/pglite-harness.ts`** still lays `tmf_artifact_filings` in its 20260615 shape. The two route suites
  add the columns by applying the real migration through `_etmf-pglite-fixture.ts`.
- **`scripts/db/program-same-org-preflight.mjs`** was not extended to list a filing that names a foreign or missing
  study. Every existing row has `study_ref` NULL, and the key is enforced for new rows.
- **Bulk filing** still reports an item whose transaction failed as `TMF_ARTIFACT_WRITE_UNCONFIRMED`, including
  when the rollback is known to have succeeded.
- **HMAC seal.** The two new PostgreSQL suites ran with no `AUDIT_HMAC_KEY`, so their rows are chained and
  unsealed. `tests/db/tmf-assessment-audit-outcomes.dbtest.ts` sets a key and asserts the seal on a TMF row.
- **URS and OQ** for the regulated function: slice E6.
