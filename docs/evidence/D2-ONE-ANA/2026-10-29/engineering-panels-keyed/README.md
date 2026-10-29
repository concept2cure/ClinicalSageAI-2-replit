# Engineering's organization-wide panels, keyed to the project: complete two, explain two, fix the purge

Launch rows D2 (one AnA; the device folds) and D6 (tenant offboarding). Date 2026-10-29.

The work:

- complete the narrowing of `GET /api/mdx/engineering/:programId` (`server/routes/mdx-engineering.ts`) for two of the four panels it still read by organization;
- record why the other two cannot be narrowed honestly;
- fix `PURGE_CHILD_TABLES`, which aborted the purge of any tenant with a hazard filed under a project.

Read and built on the working tree over `8b3ee4b57`. The freeze for the `8b3ee4b57` push fell after the new tests were written and before any product file was edited.

**Status:**

- **done:** non-conformances and documents are read by project and reported `'program'`; the purge fix.
- **left `'organization'`, with the reason:** DHF and change requests.

The screen needs no change for either. `EngineeringSurface.tsx` (`keyedToProject`) draws a panel only when the route reports it `'program'`.

## What already exists

Re-verified at head. The clone is shallow (history from 2026-10-22), so `git log --all --diff-filter=D` sees only that window. It found no deleted writer for any of the tables below.

### The route and the screen

| Piece | Path | What it does today | What it does not do |
|---|---|---|---|
| Engineering read | `server/routes/mdx-engineering.ts` | Admits the project (`admitProject`), then reads each panel. It reports each panel's scope in `meta.scopes` and each failed read in `meta.unavailable`. `risks`, `trace` and the IEC 62304 rows are read by project. | Read `dhf`, `ecrs`, `issues` and the artifact half of `documents` by organization, and reported those four `'organization'`. |
| Engineering screen | `client/src/concept2cure/mdx/surfaces/EngineeringSurface.tsx` (`keyedToProject`, `NotKeyedNote`, `NotKeyedMetric`) | Hides the rows and the metric cards of any panel not reported `'program'`. | Nothing; not edited here. |
| The ownership answer | `server/lib/admit-project.ts` over `server/services/c2c/program-access.ts` `programInOrganization` | 404 "Project not found" or 503 `VERIFICATION_UNAVAILABLE`. The caller reads and writes nothing. | — |
| AnA's program check | `server/services/ana/tool-record-scope.ts` `foreignProgramRefusal`, run by the `registerToolHandler` wrapper | Refuses a tool call whose `program_id` / `programId` is not this organization's live project, before the handler runs. | — |
| Program key pattern | `migrations/20261029_hf_engineering_files_program_key.sql`, `migrations/20261029c_design_controls_and_risk_items_program_keys.sql` | Nullable uuid, a NOT VALID same-organization composite key ON DELETE SET NULL (program_id), a partial index, placed before `UUID_TENANT_ISOLATION_NONPUBLIC`. | — |

### The four stores, their writers and their links to a project

**DHF: `cerv2_510k_sections`.**

- Created by `migrations/0000_sweet_joseph.sql:1288` and drizzle (`shared/schema.ts` `cerv2510kSections`). `server/db/ensureCoreTables.ts` has a fallback.
- **Unique key `(organization_id, section_key)`** (`cerv2_sections_org_key_uniq`, `migrations/20260506_kit_section_draft_provenance.sql`).
- Its only path to a project is the optional `document_id` → `fda_510k_documents.project_id` → `fda_510k_projects.project_id` → `projects.regulatory_program_id`. Only the redirect in `server/routes/cerv2-sections.ts` and `server/routes/c2c/documents.ts` (`by-legacy`) use it.
- Writers:
  - `POST` / `PATCH` / `DELETE /api/cerv2-sections` (`server/routes/cerv2-sections.ts`). Only the POST takes a `document_id`, from the body, unchecked.
  - `writeKitSectionTx` (`server/services/cerv2/kit-section-write.ts`), called by AnA `write_kit_section` and the AnA-RI `section.update` command (`server/services/ana-ri/mdx-command-handlers.ts`). It addresses a row by `(organization_id, section_key)` or by id.
  - The ga-demo seed (`scripts/seed/ga-demo.d/60-mdx-aggregates.mjs`), one row per section key per organization.
- Two files already record the same gap: `server/routes/mdx-ana-drafts.ts` ("carries organization_id but NO program_id") and `server/services/regulatory-programs.service.ts` ("cerv2_510k_sections has no program link").

**Change requests: `change_requests`.**

- Created by `migrations/0000_sweet_joseph.sql:1358` and drizzle (`shared/schema.ts` `changeRequests`); `organization_id` is nullable.
- **No writer anywhere.** Searched across `server`, `shared`, `services`, `scripts` (including the seeds) and `migrations`: no INSERT, no drizzle `.insert(changeRequests)`, no route, no AnA tool. `insertChangeRequestSchema` has no importer.
- Its one reader is this route.
- The governed change register is `qms_change_controls` (`db/migrations/20260724_qms_change_control_store.sql`; `server/services/qms/changeControl.service.ts`; `/api/mdx/qms/changes`; AnA `qms_change_create`). It is organization-wide and has no project column.

**Non-conformances: `qms_nonconforming_products`.**

- Created by `migrations/20260511_qms_and_labeling.sql:141` and drizzle (`shared/schema.ts` `qmsNonconformingProducts`). In `public`, `organization_id INTEGER NOT NULL`. No project column.
- Writers:
  - `POST /api/mdx/qms/nonconforming` and `PATCH /api/mdx/qms/nonconforming/:id/disposition` (`server/routes/mdx-qms.ts`). Both are already behind `requireEditorAccess` and audited.
  - AnA `log_nonconforming_product` (`server/services/ana/AnaToolExecutor.ts`, class `confirm`).
- Readers:
  - `GET /api/mdx/qms/nonconforming`;
  - QMS readiness (`mdx-qms.ts`);
  - this route;
  - the client Quality register (`client/src/concept2cure/quality/qmsRecordRegisters.tsx`, whose create form has no project field) and `ChangeLinkForm.tsx`.
- Nothing references the table by FK.

**Documents: `concept2cure_artifacts`, plus `software_lifecycle_items`.**

- `concept2cure_artifacts.project_id` is the legacy integer `projects.id` (`migrations/0000_sweet_joseph.sql:1846`).
- `projects.regulatory_program_id` anchors a project to a program (`migrations/20260814_projects_regulatory_program_anchor.sql`). It is held to the project's organization by `migrations/20260926b_program_same_org_keys.sql`, NOT VALID.
- **The device Vault already reads artifacts by program through that bridge:** `server/routes/mdx-vault.ts`, an EXISTS over `projects` with the organization repeated.
- `software_lifecycle_items` (`migrations/20260507_mdx_beta_surfaces.sql`) has `program_id`, and this route already read it by project.

### The purge

- `PURGE_CHILD_TABLES` (`server/services/tenant/tenant-offboarding.ts`) runs `DELETE … WHERE organization_id = $1` per entry, in order, inside one transaction. It skips only 42P01/42703 and rethrows anything else.
- It deletes `regulatory_programs` and named neither `risk_items` nor `risk_controls`.
- `risk_items.program_id REFERENCES regulatory_programs(id)` is NO ACTION (`20260507`). Since `20261029c`, `risk_items_program_same_org_fk` is NO ACTION on that lineage too.
- `risk_controls.risk_item_id` cascades from `risk_items`. `new_risk_item_id` has no delete action.

### Searches run

- `cerv2_510k_sections`, `cerv2510kSections`, `section_key`, `document_id`, `fda_510k_documents`, `fda_510k_projects`, `cerv2_sections_org_key_uniq`, across `server`, `shared`, `client/src`, `scripts`, `migrations` and `db/migrations`.
- `change_requests` (word-bounded, so `doc_change_requests` is excluded), `changeRequests`, `insertChangeRequestSchema`, `ChangeRequest`, across the whole tree except `node_modules` and `docs`.
- `qms_nonconforming`, `qmsNonconformingProducts`, `qms/nonconforming`, `log_nonconforming_product`, across `server`, `client/src`, `shared`, `tests` and `scripts`.
- `concept2cure_artifacts` with `program`, and `regulatory_program_id`, in `server/routes`.
- `PURGE_CHILD_TABLES`, `risk_items`, `risk_controls`, `REFERENCES risk_items`, `REFERENCES qms_nonconforming_products`.
- `git log --all -G "(^|[^_a-z])change_requests"` and `-S changeRequests --diff-filter=D` over `server`, `shared` and `scripts`: no deleted writer in the visible history.

**Nothing is built beside an existing piece:**

- The route, the Quality write and the AnA tool are extended in place.
- The documents panel reuses the device Vault's bridge, adding no column.
- The ownership answer, the AnA wrapper and the key pattern are reused as they are.

## What changed

| File | Change |
|---|---|
| `server/routes/mdx-engineering.ts` | Non-conformances read `WHERE organization_id = $1 AND program_id = $2`. Artifacts read through `EXISTS (SELECT 1 FROM projects p WHERE p.id = a.project_id AND p.organization_id = a.organization_id AND p.regulatory_program_id = $2::uuid)`, the device Vault's predicate. `scopes.issues` and `scopes.documents` are `'program'`. The header's scope table now gives the reason `dhf` and `ecrs` stay `'organization'`. |
| `migrations/20261029d_nonconforming_products_program_key.sql` (new) | `qms_nonconforming_products.program_id UUID`, nullable. `idx_qms_nc_org_program (organization_id, program_id, detected_at DESC) WHERE program_id IS NOT NULL`. `regulatory_programs_id_org_uq` when absent. `qms_nonconforming_products_program_same_org_fk` `(program_id, organization_id)` → `regulatory_programs (id, organization_id)` ON DELETE SET NULL (program_id) NOT VALID. |
| `scripts/db/migration-set.mjs` | One entry, after `20261029c`, before `UUID_TENANT_ISOLATION_NONPUBLIC`. |
| `shared/schema.ts` | `qmsNonconformingProducts.programId: uuid('program_id')`, so drizzle push on a fresh install lays down the same column. The migration then skips its ADD COLUMN and adds the key and the index. |
| `server/routes/mdx-qms.ts` | `POST /qms/nonconforming` takes an optional `programId`, admitted with `admitProject` before the INSERT (404 / 503, nothing written). It is stamped as `program_id` and recorded in the audit row's details. With no project named, the INSERT carries NULL as before. The route was already behind `requireEditorAccess`. |
| `server/services/ana/AnaToolExecutor.ts`, `server/services/ana/qms-labeling-analytics-tool-defs.ts` | `log_nonconforming_product` offers `program_id` and stamps it. The registry wrapper already refuses a foreign one before the handler (pinned below). |
| `server/services/tenant/tenant-offboarding.ts` | `risk_controls`, `risk_items` and `qms_nonconforming_products`, before `regulatory_programs`, with the reason. |
| `server/routes/__tests__/mdx-engineering-trace-by-project.test.ts` | Its last case pinned `issues` and `documents` as `'organization'`. It now pins the new scopes. |

New tests:

- `server/routes/__tests__/mdx-engineering-panels-by-project.test.ts`
- `server/routes/__tests__/mdx-qms-nonconforming-project.test.ts`
- `server/services/ana/__tests__/nonconforming-tool-admits-program.test.ts`
- `tests/schema-contract/nonconforming-products-program-key.pglite.test.ts`
- `server/services/tenant/__tests__/tenant-purge-device-records.pglite.test.ts`

### Rule 1

- The migration is replayed on every deploy. Every statement runs only when its object is absent (`to_regclass`, `pg_attribute`, `pg_constraint`), so a replay runs no DDL.
- No DROP, no backfill, no COMMENT. Creates no table.
- The table is in `public` with `organization_id INTEGER NOT NULL`, so the tenant sweep at the tail of the set polices it.
- Existing records keep NULL: the organization's unscoped records, which the Quality register still lists and no project reads. A record names only a free-text product, and matching that to a project would be a guess.
- The schema test runs the real creators (`20260524`, `20260511`), writes a legacy row, deploys twice and replays a third time. It pins the shape, the legacy row, the refusals (another organization's project, a missing one, a key change: 23503) and the delete behaviour.

## Panels left `'organization'`, and why

**DHF (`cerv2_510k_sections`).**

- The store holds one device kit per organization: its unique key is `(organization_id, section_key)`, and every writer addresses a section by organization and key, or by id.
- A program column would let one project hold each section, and no other project could ever hold its own.
- The `document_id` chain is real for a row that has it, but only the `POST /api/cerv2-sections` body sets it, unchecked. The seed and both AnA writers never do.
- Narrowing needs per-project kit sections: a change to the kit store's identity and to every writer listed above. The alternative is to converge the panel onto the canonical per-project sections (`c2c_document_sections` under the program's `c2c_documents` row, which phase 9 backfilled). Either is a change to the device-kit authoring path, not to this read. Handed on.

**Change requests (`change_requests`).**

- Nothing writes it.
- A key no writer stamps would turn a hidden panel into an always-empty one, which the screen would render as "this project has no change requests" while changes are recorded in `qms_change_controls`.
- The defect underneath is that the panel reads a writerless table instead of the governed change register.
- Converging the panel onto `qms_change_controls`, with a project key there, is the honest fix. That register's vocabulary has no `design` change type (`CHANGE_TYPES`). Handed on, as a decision for main.

## The purge fix

**The defect is real.** `red.txt` §2 (the migration in place, the list unchanged):

> `update or delete on table "regulatory_programs" violates foreign key constraint "risk_items_program_id_fkey" on table "risk_items"` (23503), `query: 'DELETE FROM regulatory_programs WHERE organization_id = $1'`

The purge rolled back. So the purge of any tenant with one hazard filed under a project failed. It was not only residue.

**The test.** `tenant-purge-device-records.pglite.test.ts`:

- runs the real `risk_items`, `risk_controls` and `qms_nonconforming_products` statements, then `20261029c` and `20261029d`;
- files a hazard with a control and a nonconformance under each of two tenants' projects;
- purges one tenant through the real list in its real order, narrowed to the tables present (as `tenant-purge-regulated-retention.pglite.test.ts` narrows it).

The purged tenant's rows go. The other tenant keeps all of its own. A second case pins the order: controls, then hazards, then the nonconformance log, all before `regulatory_programs`.

## Red, green, mutations

| | Files | Result |
|---|---|---|
| Red (`red.txt` §1, at head) | the 5 new test files | 16 tests failed across the three route and tool files (7 of 9, 6 of 6, 3 of 4). The purge file's 2 tests failed and the schema file failed to load, both because the migration did not exist yet. |
| Red (`red.txt` §2) | the purge and schema files, with the migration in place and the purge list unchanged | The purge's real failure: 23503 on `risk_items_program_id_fkey`, then rollback. The schema file fails only its applier-position case. |
| Red (`red.txt` §3–4) | the final engineering test (refined after §1) and the amended trace-test case, against `mdx-engineering.ts` as at HEAD | 7 of 9 and 1 of 6 failed. |
| Green (`green.txt`) | the 5 new files and 23 existing files over the changed code | 28 files, all passing (counts in the file) |
| Mutations (`mutations.txt`, `mutation-M*.txt`) | 17 product-code mutations plus one gate run (M17g) | every one red, every one restored byte for byte |

Three new tests pass at head, by design. They pin behaviour the change must keep:

- a store without the key is a failed panel, not an empty one;
- a foreign project is refused before any panel read;
- AnA refuses a foreign `program_id`. That is the wrapper's job, and this file pins it for this tool.

The mutation table is in `mutations.txt`. Each mutation was applied alone, its test run, and the file restored only if it still held exactly the mutated bytes, then sha256-checked.

## Gates

`gates.txt`. Each run on the finished tree.

- `ci:migration-drop-safety` and its selftest;
- `ci:migration-set-order`;
- `ci:migration-deploy-path` and its selftest;
- `ci:sql-interpolation` and its selftest;
- `ci:program-ownership-single-source` and its selftest;
- `ci:tenant-isolation:no-regression`, `ci:tenant-column-types` and `ci:tenant-entry-points`.

All pass.

- `ci:migration-deploy-path` was seen failing on the case it exists to catch: M17g takes the new file off the applier (`mutation-M17g.txt`).
- One `ci:sql-interpolation` run failed while another worker's edit to `server/routes/artifacts-center-routes.ts` (not part of this change) was ahead of its baseline entry. It passed once that worker's baseline edit landed; `gates.txt` records both. This change adds no interpolation.

**Lint** (`eslint.txt`): 0 errors on every changed file. The warnings are file and function length, on files already over the limits; none falls in an edited range of `AnaToolExecutor.ts` or `shared/schema.ts`.

**Type check** (`typecheck.txt`, `typecheck-tsconfig.json`): 0 errors. A scoped tsconfig lists the changed and new files and the files that declare the Express `Request` augmentations; the whole-tree check is not run under parallel load.

## Not done, handed on

1. **DHF per project.** A kit-store change or a convergence onto `c2c_document_sections`; see above.
2. **Change requests.** Converge the panel onto `qms_change_controls` with a project key, or retire `change_requests`. A decision for main.
3. **A project field on the Quality register's "Record nonconformance" form** (`client/src/concept2cure/quality/qmsRecordRegisters.tsx`), or a record action on the Engineering screen. Until then a record gets a project only from AnA or an API caller that names one. Both are client slices; no client file was edited here.
4. **The same purge abort, other tables (D6).** A static scan of the CREATE TABLE statements on `C2C_MIGRATION_FILES` finds more program keys with no delete action whose tables `PURGE_CHILD_TABLES` does not name:
   - `udi_records` and `software_lifecycle_items` (`20260507`);
   - `labeling_documents` (`20260511`; its translations and symbols cascade);
   - `ivdr_classifications`, `ivdr_per_documents`, `ivd_analytical_performance`, `ivd_clinical_performance`, `ivd_clia_categorization` and `cdx_pairings` (`20260508`; the IVD family has NO ACTION children in `migrations/001_create_ivdr_tables.sql`);
   - `c2c_documents`.

   Each would abort a purge the same way once a row names a project. Not verified table by table on a database; not changed here.
5. **`docs/ana-capability-manifest.json`** is generated and not CI-gated. It is not regenerated here, so it does not yet list the tool's `program_id` input.
