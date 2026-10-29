# Engineering's design history and design changes, per product: complete P-60

Launch rows D2 (one AnA; the device folds) and D6 (tenant offboarding). Date 2026-10-29.

Founder decision P-60 (`docs/LAUNCH_DEFINITION_OF_DONE.md`, decided under the founder's delegation): a device or
diagnostics company runs several products, and their design history file and design changes are per product
(21 CFR 820.30(j), ISO 13485 §7.3.10). Change control has one register.

The work completes the narrowing of `GET /api/mdx/engineering/:programId` that
`docs/evidence/D2-ONE-ANA/2026-10-29/engineering-panels-keyed/` (07d0116f9) left at two panels, for the reasons that
README gives:

- **change requests**: fix the panel to read the change register, `qms_change_controls`, by a project key on it,
  and stop reading `change_requests`, which nothing writes;
- **DHF**: fix the panel to read the project's own document sections (`c2c_document_sections`), and stop showing the
  organization's one device kit (`cerv2_510k_sections`) under a project;
- both are reported `'program'`, so the existing screen draws them; its copy now says what the design history panel
  is and is not.

Built on the working tree over `267b91e70`, then merged by the lead onto `3830ae34d` (upstream `5e7bcdd27` had changed
`mdx-qms.ts`, `changeControl.service.ts` and both hand-written change-control DDLs). Red §1 was captured at
`267b91e70`; every other run is on the merged tree.

**Status: done**, with the items under "Not done" handed on.

## What already exists

Re-verified at `267b91e70` and again at `3830ae34d`. The clone is shallow (history from 2026-10-22), so `git log --all --diff-filter=D` sees
only that window; it found no deleted change-control writer, project picker for changes, or per-project DHF read.

### The route, the hook and the screen

| Piece | Path | What it does today | What it does not do |
|---|---|---|---|
| Engineering read | `server/routes/mdx-engineering.ts` | Admits the project (`admitProject`), reads seven panels, reports each one's scope in `meta.scopes` and each failed read in `meta.unavailable`. `risks`, `trace`, `issues` and `documents` are read by project. | Read `dhf` from `cerv2_510k_sections` and `ecrs` from `change_requests`, both by organization, and reported both `'organization'`. |
| Hook | `client/src/concept2cure/mdx/hooks/useEngineering.ts` | One fetch; each panel is a `DataState`; an unreported scope counts as not keyed. | — |
| Screen | `client/src/concept2cure/mdx/surfaces/EngineeringSurface.tsx` (`keyedToProject`, `NotKeyedNote`, `NotKeyedMetric`) | Draws a panel, its metric card and its blocker-feed rows only when the route reports it `'program'`. The DHF strip, the "DHF completion" card and `DHF §n` blockers come back with no client change once keyed. | Its DHF copy named the 510(k) kit ("Device-category sections … 510(k) section set") and called the figure "DHF completion". |
| AnA's context for the screen | `client/src/concept2cure/mdx/MdxSurfaceHost.tsx` (`withEngineeringPanels`), `surfaces/engineeringPanelsContext.ts` | Publishes `device-engineering` with the risk register's and the trace's own context. | It carries no DHF or change-request rows, so nothing about AnA's context changes here. |

### Change requests

**`qms_change_controls`, the change register.**

- Created by `db/migrations/20260724_qms_change_control_store.sql` (on the applier, `scripts/db/migration-set.mjs`). In
  `public`, `organization_id INTEGER NOT NULL`, so the tenant sweep polices it. Not in drizzle (`shared/schema.ts`).
- **No project column.** Every change was the organization's.
- **One writer:** `createChange` (`server/services/qms/changeControl.service.ts`), called by
  `POST /api/mdx/qms/changes` (`server/routes/mdx-qms.ts`, behind `requireEditorAccess`, audited) and by AnA
  `qms_change_create` (`server/services/ana/AnaToolExecutor.ts`; definition in `qms-labeling-analytics-tool-defs.ts`).
  The GA demo seed (`scripts/seed/ga-demo.d/123-qms-quality.mjs`) inserts its own rows.
- Readers: `GET /api/mdx/qms/changes`, `/summary`, `/:id` (same service); the controlled-documents compliance report
  (`server/services/audit/compliance-reports/queries/controlled-documents.ts`); IQ (`scripts/validation/run-iq.mjs`).
- The client register: `client/src/concept2cure/quality/ChangeControl.tsx`, whose "Raise change request" drawer
  (`C2CForm`) posts through `createQmsChange` (`quality/qmsWrites.ts`). **It had no project field.** The Quality
  screens already know the open project through `client/src/concept2cure/v2/shellProject.ts` (`useShellProject`,
  `shellProgramId`); the CAPA register raises in it (`quality/qmsCapaRegister.tsx`), and the controlled-document
  setup lists the organization's projects (`quality/ControlledDocumentDialogs.tsx`).
- The QMS routers' shared request context: `server/routes/mdx-qms-context.ts` (organization, user, pinned executor),
  split out of `mdx-qms.ts` on 2026-10-29 under the file-size ceiling. `mdx-qms.ts` is at 1499 lines at `3830ae34d`.
- The project's ownership answer: `server/lib/admit-project.ts` over `programInOrganization`
  (`server/services/c2c/program-access.ts`); AnA's `foreignProgramRefusal` (`server/services/ana/tool-record-scope.ts`)
  refuses any tool call whose `program_id` is not the organization's, before the handler runs.
- The program-key pattern: `migrations/20261029d_nonconforming_products_program_key.sql` (nullable uuid, a NOT VALID
  same-organization composite key ON DELETE SET NULL (program_id), a partial index, before
  `UUID_TENANT_ISOLATION_NONPUBLIC`).

**`change_requests`.**

- Created by `migrations/0000_sweet_joseph.sql:1358` and declared in `shared/schema.ts:14581` (`changeRequests`,
  `insertChangeRequestSchema`, `ChangeRequest`, `InsertChangeRequest`); `organization_id` nullable.
- **No writer** (07d0116f9 searched the whole tree; re-checked here).
- **Its one reader was this route.** After this change **nothing reads it**: a word-bounded search for
  `change_requests` over `server`, `shared`, `client/src`, `services` and `scripts` (tests aside) finds the route's
  header comment saying it is no longer read, the declaration in `shared/schema.ts`, and
  `services/ai/risk-factors/project-health-risks.ts`, where `'change_requests'` is a label in a risk factor's
  `dataRequirements` list, not a read. The table itself is created by `migrations/0000_sweet_joseph.sql`. `server/routes/c2c/reviews.ts`, `notifications.ts`, `VaultAnnotations.tsx` and
  `ReviewThreads.tsx` count review tasks of type `change_request`, another thing. `insertChangeRequestSchema` and the two
  types have no importer. The tenant purge does not name it; it is on the purge-coverage residue baseline
  (`docs/reports/purge-coverage-baseline.json`). Deleting it is a later, separate decision; not done here.

### DHF

**`cerv2_510k_sections`, the organization's device kit.**

- One kit per organization: unique `(organization_id, section_key)` (`migrations/20260506_kit_section_draft_provenance.sql`);
  writers `server/routes/cerv2-sections.ts`, `writeKitSectionTx` (`server/services/cerv2/kit-section-write.ts`, from AnA
  `write_kit_section` and the AnA-RI `section.update` command), the ga-demo seed.
- It stays the kit's store for the kit authoring path. It is only no longer shown under a project.

**`c2c_documents` and `c2c_document_sections`, the project's own documents.**

- Created by `migrations/20260528_phase9_document_schema.sql` (on the applier). `c2c_documents.project_id` is
  `uuid NOT NULL REFERENCES regulatory_programs(id)`: **the program key itself**. It is held to the document's
  organization by `c2c_documents_project_same_org_fk` (`migrations/20260926b_program_same_org_keys.sql`, NOT VALID,
  NO ACTION).
- So the task's suggested bridge (`projects.regulatory_program_id`, which the documents panel and the device Vault use
  for `concept2cure_artifacts`, whose `project_id` is the legacy integer `projects.id`) is **not needed** for
  `c2c_documents`; the read keys on `project_id` and repeats the organization.
- A section: `section_key`, `parent_key`, `label`, `path_order`, `mandatory`, `status`
  (`todo | drafted | review | approved | locked`), `version`, `updated_at`; unique `(document_id, section_key)`.
- Readiness is computed by the database: `c2c_document_counted_readiness` (20260528) counts every section except an
  empty heading (a `todo` section other sections are filed under), approved or locked over counted.
- Readers already keyed this way: `GET /api/c2c/documents?projectId=` (`server/routes/c2c/documents.ts`).
- Row-level security: `c2c_document_sections` is parent-scoped through `c2c_documents.org_id`
  (`db/migrations/20260813_child_table_parent_scoped_rls.sql`). The purge reaches both (`purge-referrers.ts`,
  `purge-parent-scope.ts`).

### The purge gate

- `ci:purge-coverage` (`scripts/ci/check-purge-coverage.mjs`, `scripts/ci/lib/purge-order.mjs`) fails on a key that
  would stop the purge part-way: NO ACTION or RESTRICT, or SET NULL / SET DEFAULT on a NOT NULL column. It reads
  `confdelsetcols`, so `ON DELETE SET NULL (program_id)` on a nullable column is not a stop. `qms_change_controls` and
  `change_requests` are both on its residue baseline (the purge does not erase them today).

### Searches run

- `qms_change_controls`, `createChange`, `qms_change_create`, `qms/changes`, `QMS_CHANGE_CREATE` across `server`,
  `shared`, `client/src`, `scripts`, `tests`, `migrations`, `db/migrations`.
- `change_requests` (word-bounded), `changeRequests`, `insertChangeRequestSchema`, `ChangeRequest` across the tree
  except `node_modules` and `docs`.
- `c2c_document_sections`, `c2c_documents`, `project_id`, `c2c_document_counted_readiness`,
  `c2c_documents_project_same_org_fk`, `regulatory_program_id` in `server/routes`, `migrations`, `db/migrations`.
- `cerv2_510k_sections`, `cerv2_sections_org_key_uniq`.
- `shellProgramId`, `useShellProject`, `programId` in `client/src/concept2cure/quality`.
- `mdx/engineering`, `EngineeringSurface`, `useEngineering`, `DHF`, `design history` in the client and its tests.
- `git log --all --diff-filter=D` over `client/**/quality/**`, `server/services/qms/**`, `server/routes/mdx-engineering*`.

**Nothing is built beside an existing piece.** The route, the register's one writer, its route, its AnA tool, its
form and the Engineering screen are extended in place. The key reuses 20261029d's form. The DHF read keys on the
column the document store already has, by the rule its readiness already counts by. The panel's UI moved into its own
module only because `EngineeringSurface.tsx` is at its length limit.

## What changed

### Change requests read the change register, by project

| File | Change |
|---|---|
| `migrations/20261029l_qms_change_controls_program_key.sql` (new) | `qms_change_controls.program_id UUID`, nullable. `idx_qms_change_org_program (organization_id, program_id, created_at DESC) WHERE program_id IS NOT NULL AND deleted_at IS NULL`. `regulatory_programs_id_org_uq` when absent. `qms_change_controls_program_same_org_fk` `(program_id, organization_id)` → `regulatory_programs (id, organization_id)` ON DELETE SET NULL (program_id) NOT VALID. The 20261029d form. |
| `scripts/db/migration-set.mjs` | One entry and its comment, lines 3606–3614: after `20261029d_nonconforming_products_program_key.sql`, so after its creator (`db/migrations/20260724`, line 738) and `20260926b` (line 2843), and before `UUID_TENANT_ISOLATION_NONPUBLIC`. Nothing else in the file is this change's. |
| `server/services/qms/changeControl.service.ts` | `createChange`, the register's one writer, takes `programId` and writes it as `program_id` (NULL when absent). `ChangeControlRow.program_id`. |
| `server/routes/mdx-qms-context.ts` | `admitBodyProject`, a middleware: a `programId` in the body must be the organization's live project (`admitProject`: 404 "Project not found" / 503 `VERIFICATION_UNAVAILABLE`), or the handler never runs and nothing is written. Absent, null or empty: nothing asked, the record is the organization's. `admittedProject(res)` hands the handler the admitted id. In the QMS routers' shared context module because `mdx-qms.ts` is at the line ceiling. |
| `server/routes/mdx-qms.ts` | `POST /api/mdx/qms/changes` runs `admitBodyProject` after `requireEditorAccess`, passes `admittedProject(res)` to `createChange`, and records the stamped project in the audit row's details. Four lines changed, none added: the file stays at 1499 lines (`wc -l`), the most the repo-health ceiling allows (it counts 1500 there and fails above 1500). `PATCH` does not take a project: a change's project is set when it is raised. |
| `server/services/ana/qms-labeling-analytics-tool-defs.ts`, `server/services/ana/AnaToolExecutor.ts` | `qms_change_create` offers `program_id` and stamps it; the audit row records it. The registry wrapper already refuses a foreign one before the handler (`foreignProgramRefusal`), pinned below. |
| `client/src/concept2cure/quality/ChangeControl.tsx`, `quality/qmsWrites.ts` | "Raise change request" offers the open project (`useShellProject` / `shellProgramId`, as the CAPA register does) beside "Organisation-wide", starting on organisation-wide; the chosen project is sent as `programId`. With no project open the field is not offered. |
| `server/routes/mdx-engineering.ts` | `ecrs` reads `qms_change_controls WHERE organization_id = $1 AND program_id = $2 AND deleted_at IS NULL`, every live change (the old read stopped at 50), newest first. The register's lifecycle maps onto the screen's four states: proposed → open, under assessment → review, approved / in implementation / verification → approved, closed / rejected / cancelled → closed. `openEcrs` stays "open or in review": the changes still awaiting a decision. `change_requests` is not read. |

### The DHF reads the project's own document sections

| File | Change |
|---|---|
| `server/routes/mdx-engineering.ts` | `dhf` reads `c2c_document_sections s JOIN c2c_documents d ON d.id = s.document_id WHERE d.org_id = $1 AND d.project_id = $2::uuid AND d.status <> 'archived'`, leaving out an empty heading by the readiness rule's own predicate, ordered by document then outline. Each row names its section key, label, version, status (approved/locked → ready, review → review, mandatory and todo → blocked, otherwise draft), its document (`documentId`, `document`) and, in `meta`, the document title and whether the section is mandatory. `summary.dhfCompletion` is the project's mandatory sections approved or locked over its mandatory sections. `cerv2_510k_sections` is not read. `meta.scopes.dhf` and `.ecrs` are `'program'`. The header's scope table says why each panel is read as it is. |
| `client/src/concept2cure/mdx/surfaces/EngineeringDesignHistory.tsx` (new) | The panel, moved out of `EngineeringSurface.tsx` (at its length limit): "Design history · this project's document sections", the sections grouped under their document, and the note it always shows. |
| `client/src/concept2cure/mdx/surfaces/EngineeringSurface.tsx` | Mounts the panel. The card is "Mandatory sections approved · Across this project's documents", not "DHF completion". A blocked or draft section reaches the blocker feed as `§<key>` with its document, not `DHF §<n>`. The blocker sources name "document sections" and "design history". 29 lines shorter (635 → 606). |
| `client/src/concept2cure/mdx/data/engineering.ts`, `hooks/useEngineering.ts` | `DhfRow.documentId` / `document`; the comments say what the figure and the scopes are now. |

**What the panel can claim, and what it cannot.** The panel says, every time it shows rows:

> The sections of this project's own documents and where each stands. This is not an inspected design history file
> index: it lists only what has been authored here as document sections, and a section is ready when it has been
> approved, not when the file has been found complete.

It can claim which sections exist in the project's live documents, each one's status and version, which document
holds it, and which mandatory sections have nothing written. It cannot claim that the design history file is complete
or inspected: the design plan, design reviews, verification and validation records, risk file and transfer records an
820.30(j) DHF holds appear here only if they were authored as sections of the project's documents (the risk file and
the design-controls trace have their own panels on the same screen). A section not yet instantiated from its rule pack
is not counted, as the documents' readiness does not count it either.

### Tests changed beside the code

- `mdx-engineering-panels-by-project.test.ts`, `mdx-engineering-trace-by-project.test.ts`: their last cases pinned
  `dhf` and `ecrs` as `'organization'`; they now pin every panel `'program'`.
- `mdx-engineering.contract.test.ts`, `tests/mdx-beta-surfaces-routes.test.ts`: the DHF-completion case feeds
  document-section rows (`section_key`, `mandatory`, `drafted`) instead of kit rows.
- `EngineeringSurface.projectKeyed.test.tsx`, `EngineeringSurface.unreadable.test.tsx`: the card label, the empty
  hint, the gate label and the blocker-source names, as above.
- `server/services/ana/__tests__/qms-change-tools.test.ts`, `server/services/qms/__tests__/changeControl.pglite.integration.test.ts`:
  their hand-written `qms_change_controls` DDL gains `program_id uuid`, as the deployed table now has, because the
  one writer now writes it.

New tests:

- `server/routes/__tests__/mdx-engineering-per-product.test.ts`
- `server/routes/__tests__/qms-change-project.test.ts`
- `server/services/ana/__tests__/change-tool-admits-program.test.ts`
- `tests/schema-contract/change-controls-program-key.pglite.test.ts`
- `client/src/concept2cure/mdx/surfaces/__tests__/EngineeringSurface.designHistory.test.tsx`
- `client/src/concept2cure/quality/__tests__/ChangeControlProject.test.tsx`

### Rule 1

- Replayed on every deploy. Every statement runs only when its object is absent (`to_regclass`, `pg_attribute`,
  `pg_constraint`), so a replay runs no DDL. The schema test deploys twice and replays a third time.
- No DROP, no backfill, no COMMENT; creates no table. In `public` with `organization_id INTEGER NOT NULL`, so the
  tenant sweep at the tail of the set polices it.
- Existing changes keep NULL: the organization's records, which the Quality register still lists and no project
  reads. A change names no product, and matching its title to one would be a guess.

## Red, green, mutations

| | Files | Result |
|---|---|---|
| Red §1 (`red.txt`, at `267b91e70`, before any product file was edited) | the 6 new test files and 5 amended ones | 37 tests failed in all 11 files; the schema file failed to load (the migration did not exist). Each failure is the defect: `dhf`/`ecrs` reported `'organization'`, `change_requests` and the kit read, no `program_id` written (`NOT WRITTEN`), a foreign or missing project answered 201, no project field on the form, the old copy. |
| Red §2 (`red.txt`, M0) | the route as at HEAD, under the 5 new and amended route files | 15 failed, the amended `tests/mdx-beta-surfaces-routes.test.ts` case among them. |
| Green (`green.txt`) | 6 new, 8 amended, 23 existing suites over the changed code | 37 files, 451 tests, all passing |
| Mutations (`mutations.txt`, `mutation-M*.txt`) | 28 mutations of product code and the applier, plus M18g on the database | every one red, every file restored byte for byte |

Cases that pass at HEAD by design, pinning behaviour the change must keep: a foreign project is refused before any
panel is read; AnA refuses a foreign `program_id` (the wrapper's job, pinned here for `qms_change_create`); `PATCH`
writes no `program_id`; the form sends no project for an organisation-wide change or when none is open.

## Real database

`db-probe.txt` (script `db-probe.mjs.txt`): on a deploy-shaped PostgreSQL 16.15 (install-fresh + deploy-migrate, then
deploy-migrate replayed; `20261029l` applied both times, the key unchanged), the two reads as the route sends them
(their SQL is read out of the route file) return the project's live document's sections without the empty heading,
the archived document, the sibling project's or the other organization's; and its live change controls without the
deleted one, the unscoped one, the sibling's or the other organization's. The key refuses a change naming another
organization's project (23503); deleting a project leaves its change with its organization and no project.

## Gates

`gates.txt`, on the finished tree.

| Gate | Result |
|---|---|
| `ci:migration-drop-safety`, `:selftest` | pass (450 migrations), 12/12 |
| `ci:migration-set-order` | pass: sweep last, no duplicates |
| `ci:migration-deploy-path`, `:selftest` | pass; **seen failing on its case**: M20g takes `20261029l` off the applier, `FAIL — 1 new migration(s) no deploy applies` |
| `ci:purge-coverage` (deploy-shaped database) | **the order question passes**: no key stops the purge, so `qms_change_controls_program_same_org_fk` (SET NULL on the nullable `program_id` only) is accepted. **Seen failing on its case**: M18g, the same key with a bare SET NULL, `✗ public.qms_change_controls (program_id, organization_id) → public.regulatory_programs, SET NULL on a NOT NULL column`. The gate exits 1 on the residue question for three tables this change does not touch (`csr_assembly_runs`, `csr_narrative_runs`, `qc_deviations`, from other changes); `qms_change_controls` and `change_requests` were residue before and stay on the baseline. |
| `ci:sql-interpolation`, `:selftest` | the gate exits 1 on three files of other workers (`server/services/tenant/held-records.ts`, `server/services/tenant-export/held-record-integrity.ts`, `server/services/vault/retention-period.ts`); no file of this change is listed (its new SQL is bound parameters only). Selftest 35 passed. |
| `ci:program-ownership-single-source`, `:selftest` | pass, run with a private git index: on the shared index it crashes reading `server/services/innovation/rlsBypassSession.ts`, which another worker deleted from the working tree but not the index. Selftest pass. This change asks ownership only through `admitProject` and the AnA wrapper. |
| `ci:tenant-isolation:no-regression` | exits 1 on one finding in `server/services/vault/vault-placement.service.ts` (not this change). Every new read here names `organization_id` / `org_id`. |
| `ci:tenant-column-types`, `ci:tenant-resolvers` | pass |
| `ci:tenant-entry-points` | exits 1 on `server/routes/mdx-admin.ts`'s changed digest (not this change) |

**Lint** (`eslint.txt`): 0 errors in every changed and new file; no file gains a warning.
**Type check** (`typecheck.txt`, `typecheck-tsconfig.json`): 0 errors over every changed and new file, given an ambient
CSS-module declaration the repository does not have (without it, three TS2307 in untouched `components/ana` files).

## Not done, handed on

1. **`change_requests` has no reader and no writer now.** Its deletion (the drizzle declaration, the base-migration
   table, its residue-baseline entry) is a later, separate decision, as the task says.
2. **Existing changes stay the organization's.** Nothing assigns a project to a change already raised: `PATCH` does
   not take one, and no backfill guesses one. Whether a change may be moved onto a project later, and under what
   record, is a product decision.
3. **The register's vocabulary has no `design` change type** (`CHANGE_TYPES`). An 820.30(i) design change is raised as
   `specification`, `document` or `other`. Adding one is a vocabulary decision with client labels to follow.
4. **The form offers the open project only**, as the CAPA register does; it does not list the organization's other
   projects. The register's rows do not yet show a change's project.
5. **The DHF figure is over instantiated sections.** A rule-pack section with no row yet is not counted, as the
   documents' own readiness does not count it; `GET /api/c2c/documents/:id/outline` is what shows a pack's missing
   sections. An empty project prints 0%, as the contract test pins.
6. **`docs/ana-capability-manifest.json`** is generated and not CI-gated; not regenerated, so it does not yet list
   `qms_change_create`'s `program_id`.
7. **`mdx-qms.ts` is at the ceiling** (1499 by `wc -l`). The next route added there needs the change-control routes
   moved into their own router, as the quality records were.
