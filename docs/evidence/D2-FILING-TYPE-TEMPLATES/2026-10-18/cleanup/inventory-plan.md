# CTD authoring cleanup: execution plan C5–C6 (D2 / W1)

This plan has 60 ordered slices. Slices S01 and S02 are expected to clear two gates that are already red on trunk, but I could not run either gate, so their red state is inferred from the gate code. About 30 slices are server-only and touch nothing owned by the client-journey session. Five slices wait on founder decisions, and twelve client retirements are handed to the client-journey session because they need edits in its files.

All paths are relative to `/home/user/ClinicalSageAI-2-replit`. Evidence for every slice goes in `/home/user/ClinicalSageAI-2-replit/docs/evidence/D2-FILING-TYPE-TEMPLATES/2026-10-18/cleanup/README.md`, with a red file named `sNN-red.txt` beside it.

## 0. Basis and rules for every slice

**State of the tree.** HEAD is `a9593ef98` and the working tree is clean. C4c (`900265097`) has landed, so two input items are already done:
- The stale "six-subsection" description at `legacy-import-tool-defs.ts:648` is fixed.
- The invented "2.4.4.1" in `nonclinical-m24-adapter.ts` is gone.

The verdicts' line numbers come from `805efa13d`, `79d9913f1` and `a9593ef98`. The following files changed since: `AnaToolExecutor.ts`, `m2-summary-builders.ts`, `clinical-overview-outline.ts`, `ind-module-authoring.ts`, `legacy-import-tool-defs.ts`, `evidence-literature-tool-defs.ts` and `nonclinical-m24-adapter.ts`. Find code by symbol (for example `registerToolHandler('<tool>')` or `router.post('<path>')`), not by line number.

**Two gates are already red on trunk.** I did not run either one; both conclusions come from reading the gate code.
- **`ci:unkeyed-request-tables`** (`ci.yml:693`). Its baseline entry `ectd.module_structure` (`scripts/ci/unkeyed-request-tables-baseline.json:43`) has no server reader since D1 (`3c394edb3`). `git grep module_structure -- server` returns nothing. The gate exits 1 on a stale entry (`check-unkeyed-request-tables.mjs:460-497`).
- **`ci:check-client-reachability`** (`ci.yml:937`). Its baseline count is 0. But `62a8d5e7f` (2026-10-23) moved `TemplatesSurface` out of `Workbench.tsx` into `mdx/workbench/TemplatesSurface.tsx` and created `mdx/hooks/useWorkbenchTemplates.ts`. Nothing outside tests imports either file.

**Done in every slice:**
1. **Rule 3.** Run `git log --all --diff-filter=D` on the names involved. Write the "What already exists" and P-47 parity sections into the README.
2. **Red first.** For a convergence, the new test must fail on the parent commit. For a deletion with a carry-over, the carried check must fail on the parent. For pure deletions, run `node scripts/ci/prove-module-unused.mjs <file> --controls` for each deleted module and file its output.
3. **Green.** Run:
   - `tsc` (0 errors);
   - every test file that imports or names the touched code (`git grep -l` the symbol over `tests server shared client/src`);
   - the gates named in the slice;
   - `ci:unreferenced-modules`;
   - the ESLint ratchet `--since origin/concept2cure-v2`.

   If a slice deletes a mount, also run `ci:audit-route-mounts:no-regression`, `ci:route-ownership-matrix:check` and `audit-requestdb-coverage.mjs --strict-no-regression`. If it touches the AnA drafting or editor path, also run `ci:canvas-path`.
4. **Commit message.** For each deletion, name the replacement file and the test or gate that proves it is reachable (working agreement). Commit to `concept2cure-v2` only (Rule 0).
5. **Files this plan never edits** (client-journey session `session_01JbQUvBxcGHdBgkgAydQKpx`):
   - `v2/surfaces/{ProjectHome,ProjectPlan,ProjectStages,PlanAssign,HomeSections}.tsx`
   - `v2/editor/IndDocumentLibrary.tsx`
   - `shared/navigation/**`
   - `shared/constants/ui-surface-registry.ts` and its spread `ui-surface-registry.ui-v2.ts`
   - client styles and `client/src/concept2cure/v2/fixtures/**`

   I also treat `client/src/concept2cure/v2/{registryModel.ts,surfaceViews.ts}` as theirs, because `d97388005` and `daeb5cab9` edit them. Edits needed in any of these files go to section 3.

---

## 1. Ordered slices

### Tier A: files nothing loads, and the two red gates

**S01 — Fix `ci:unkeyed-request-tables`: delete the stale `ectd.module_structure` baseline entry.**
- **Change:** in `scripts/ci/unkeyed-request-tables-baseline.json`, remove the `"ectd.module_structure"` entry and set `"total"` from 90 to 89.
- **Red:** run `npm run ci:unkeyed-request-tables` on `a9593ef98` and expect "Stale baseline entries … ectd.module_structure". If it is not red, record that and fold this change into S05.
- **Parity:** none needed; this corrects a baseline. The last readers were `ECTDScaffoldingService` (deleted in `7a7428755`) and `server/api/ectd/routes.ts` (deleted in `3c394edb3`).

**S02 — Delete the MDX `TemplatesSurface`, replaced by Authoring → New document → Start from.**
- **Delete:**
  - `client/src/concept2cure/mdx/workbench/TemplatesSurface.tsx`
  - `client/src/concept2cure/mdx/hooks/useWorkbenchTemplates.ts`
  - `mdx/workbench/__tests__/TemplatesSurface.test.tsx`
  - `mdx/hooks/__tests__/useWorkbenchTemplates.test.ts`
- **Change:**
  - `mdx/workbench/__tests__/workbenchNoFixtures.test.tsx`: drop the import (`:31`) and the `TemplatesSurface` case (`:83-88`).
  - `mdx/data/workbench.ts`: drop `interface Template` (`:98-105`). It holds interfaces only, not a fixture.
- **Leave:** `mdx/data/nav.ts:45` (navigation data; goes to H10).
- **Red:** `ci:check-client-reachability` lists the two files.
- **Replacement:** `client/src/concept2cure/v2/surfaces/AuthoringCreateExport.tsx` and `AuthoringTemplatePicker.tsx`, reading `GET /api/authoring/templates` (`server/services/authoring/builtin-authoring-templates.ts`). Proof: `authoringTemplateSearch.test.tsx`, `authoringTemplatePickerAssembly.test.tsx`, `authoringCreateExport.test.tsx`. Gate: `ci:check-client-reachability` back to count 0.
- **Parity:**
  - List org templates → picker search and list.
  - The "New template" prompt to AnA → any AnA turn; the real create is `TemplateLibrary.tsx` (`templateLibraryReal.test.tsx`).
  - Loading vs failed states → the picker's `TemplateCatalogState`.
  - No user ever reached this surface. The earlier generation, `mdx/surfaces/TemplatesSurface.tsx`, was deleted in `e5a74a4df`.

**S03 — Delete repo-root template, policy and data files that nothing loads. Each is replaced by the record or by the live engine named below.**
- **Delete:**
  - `templates/module2_summary.docx.j2`
  - `templates/forms/form1571.docx.j2`, `form1572.docx.j2`, `form3674.docx.j2`
  - `templates/workflows/ind-workflow.yaml`
  - `templates/ectd/fda_template.xml`, `ema_template.xml`, `hc_template.xml`, `pmda_template.xml`, `0000/index.xml`
  - `policy/reg/{fda,ema,pmda}.json`
  - `server/data/{regulatory-document-requirements-matrix,ich-guidelines-comprehensive,global-regulatory-authorities}.json`
- **Change:**
  - `tests/regulatory/fda-module1-numbering.test.ts`: delete `fdaTemplateModule1` (`:147-156`), the case "the reference FDA backbone template files Module 1 where FDA does" (`:268-272`) and header line `:16`. Keep `fs` and `path`, which `:113-118` still use.
  - `server/services/regulatory/registry/registryCoverage.ts:144`: rewrite the comment to name the packager (`server/services/ectd/regional-backbone-readiness.ts` `module1ShapeOf`). Keep the literal `Set`, because `Region` types differ between the two layers.
  - `server/services/market-specs/market-submission-specs.ts:6,115`: drop the mention of the deleted JSON.
  - `scripts/ci/check-image-runtime-assets.mjs:116-119`: trim the comment.
- **Replacements:**
  - Module 1: `shared/regulatory/regional-module1.ts` (`tests/regulatory/regional-module1-record.test.ts`, `fda-module1-numbering.test.ts`).
  - Modules 2–5: the record (`tests/regulatory/ich-m4-headings.test.ts`).
  - Backbones: the eCTD compile (`server/__tests__/services/submission-orchestrator.test.ts`).
  - Forms: `server/services/ind-forms/ind-form-fill-service.ts` (`ind-form-acroform-fill.test.ts`).
  - Q12 classification: `supac-classifier.ts` (`tests/supac-classifier.test.ts`).
  - Required sections: `required-sections.ts` (`required-sections-profile.test.ts`).
  - Guideline index: `ich-guideline-corpus.ts`.
  - Authorities: `market-submission-specs.ts`.
- **Parity:** no function was ever loaded. `policy/reg` lost its reader in `1b5bf1677`; the `server/data` JSON lost its reader in `64da63f28`; the `.j2` files and the YAML have no loader. Nothing needs carrying over.
- **Gates:** `prove-module-unused` per file; `tests/regulatory/registryCoverage.test.ts:90-94` stays green.

**S04 — Delete the laptop-only CTD seed scripts. The outlines are served by `builtin-authoring-templates.ts`.**
- **Delete:** `scripts/seed-ectd-templates.js`, `scripts/create-complete-ectd-templates.cjs`, `scripts/add-ind-templates.js`, `scripts/populate-ectd-modules.js`.
- **Change:** the header of `scripts/seed-mdx-templates.mjs:6-7`.
- **Parity:**
  - The IND template bodies never reached a deployed database: no npm script, workflow, hook, `.replit` or Makefile names them. Outlines come from `builtin-authoring-templates.test.ts`.
  - The module tree is the record.
  - `ectd_templates` stays live for tenant rows.
  - Their Module 1 contradicts FDA ("1.0 Cover Letter", "1.2 Introductory Statement").

**S05 — Delete off-applier CTD migrations, replaced by the record and by `builtin-authoring-templates.ts` (Rule 1: none of them is in `C2C_MIGRATION_FILES`, and no DROP is appended).**
- **Delete:**
  - `db/migrations/038_gcc_ectd_seeder_service.sql`
  - `db/migrations/_legacy/043_gcc_ectd_expanded_modules.sql`
  - `db/migrations/100_regulatory_templates.sql`, `101_complete_template_catalog.sql`, `102_load_all_templates.sql`, `103_load_complete_templates.sql`
  - `tests/schema-contract/regulatory-templates-cite-q2r2.contract.test.ts`
- **Change:**
  - `db/migrations/migrations_manifest.json` (the verdicts missed it): remove 038 and 043 from the "regulatory" group (`:256-257`), 038 from `executionOrder` (`:357`) and 100–103 (`:388-391`). Decrement `totalMigrations`.
  - `scripts/db/deploy-migrate.mjs:109,316`: correct the "43 files" comment to the real gcc count.
- **Carry over:** the Q2(R2) pin moves onto the record. Add a test in `tests/regulatory/` asserting that no `CTD_AUTHORING_GUIDANCE` entry cites "Q2(R1)" and that `3.2.S.4.2` and `3.2.S.4.3` cite Q2(R2). It is green on HEAD, so show it failing by planting "Q2(R1)" in a temporary copy, and file that output.
- **Leave:**
  - The `ectd.project_folders` row in `db/migrations/20260813_child_table_parent_scoped_rls.sql:629` (it is `to_regclass`-guarded).
  - `tests/db/child-table-parent-scoped-rls.cases.ts:439`.
  - `_legacy/015`.
- **Check:** `grep` shows that no other migration creates or uses the `ectd.` objects that 038 creates. 052 and 053 use `ectd_v4`, so the CI psql loops (`ci.yml:1248,1329,1488`) still apply cleanly.
- **Parity:** the 038 objects' readers were deleted in `7a7428755` and `3c394edb3`. Project outlines come from `scaffoldProjectDocuments` (`tests/schema-contract/c2c-filing-class-packs.contract.test.ts`); skeletons from `getRegistryDocumentTemplate` (`document-template-library.test.ts`); guidance from `CTD_AUTHORING_GUIDANCE` (`ctd-authoring-depth.test.ts`).
- **Hazard removed:** under the `scripts/db_migrate.sh` glob, 101–103 would `DELETE FROM ectd_templates WHERE organization_id IN (1,6,7)`.
- **Gates:** `ci:migration-drop-safety`, `ci:migration-set-order`, `check-duplicate-table-ddl`, `check-migration-reachability`, `check-journey-migration-reachability`, `ci:unkeyed-request-tables`.

**S06 — Delete dead server CTD modules (whole files). Each is replaced by the record path named below.**
- **Delete:**
  - `server/config/regulatory_config.js` and `regulatory_config.d.ts`
  - `server/utils/ichSchema.js`, `server/utils/validateZip.js` and `tests/unit/validate-ich-structure.js` (always together; deleting `validateZip.js` alone makes `ichSchema.js` newly unreferenced)
  - `server/services/documents/ArtifactSkeletonGenerator.ts`
  - `server/services/regulatory/registry/adapters/usIndFromExistingSections.ts`
- **Change:**
  - `server/config/index.ts`: delete lines `:18-21` and "regulatoryConfig" in the `:8` doc. Keep the `'@server/config'` literal; it is the barrel's only reference for `ci:unreferenced-modules`.
  - `server/services/index.ts`: delete the re-export (`:94-97`) and the `'documents.skeleton'` registry entry (`:149`).
  - `server/services/regulatory/registry/blueprints/usIndBlueprint.ts`: delete `getUSIndSectionBlueprint` (`:111-116`), the `buildUSIndBlueprint` import (`:14`) and header `:6-9`. Keep `US_IND_TASK_BLUEPRINT`, which `taskBlueprintCatalog.ts:86` and `routes-reach-the-bundle.test.ts:269-282` use.
  - `scripts/ci/unreferenced-modules-baseline.json`: remove `server/utils/validateZip.js` (`:79`) and regenerate the count.
  - Leave the `yup` dependency in `package.json` for a dependency pass.
- **Replacements:**
  - `ichHeadingTitle` (`tests/regulatory/ich-m4-headings.test.ts`), `normalizeCtdCode` (`shared/regulatory/__tests__/section-code.test.ts`), and vault-filing `TEXT_RULES` with `detectCTDSection` (`vault-filing.service.test.ts`, `ctd-registry-consistency.test.ts`).
  - eCTD validation: `ectd-structural-validator.ts` and `validateDtdConformance` (`submission-orchestrator.test.ts`, `regional-backbone-referenced.test.ts`).
  - Skeletons: builtin templates (`builtin-authoring-templates.test.ts`, `device-builtin-authoring-templates.test.ts`, `builtin-templates-carry-whole-outline.test.ts`).
  - US IND blueprint: the `ind:fda` pack scaffold (`c2c-project-scaffold.contract.test.ts`).
- **Parity:** every function has zero callers. `regulatory_config`'s regex is malformed and has never matched. Nothing needs carrying over.
- **Gate:** `server/services/__tests__/service-registry-names-only-existing-modules.test.ts`.

**S07 — Delete dead exports inside live CTD files, replaced by the record and the live exports named below.**
- **`server/services/regional-ctd-templates.ts`:** delete `getMultiAgencyCTDStructure` (`:319-350`), `getModule1Sections` (`:303`), `getAllRegionalTemplates` (`:296`), `getSupportedAgencies` (`:311`) and their default-export keys (`:354-357`).
- **`server/services/docx/templateRegistry.ts`:** delete `indTemplate` (`:441-476`) and `templates.set(indTemplate.id …)` (`:483`).
- **`server/services/templateService.ts`:** delete `initializeDefaultTemplates` (`:419-498`).
- **`services/regulatory/ind-ectd-sections.ts`:** delete `getAIDraftableSections` (`:2249`), `getSectionsForPyramidTask` (`:2270`) and `pyramidToECTDMap` (`:2278`). Remove `export` from `buildINDPackageDefinition` (`:2224`) and `INDPackageDefinition` (`:137`).
- **`services/regulatory/pyramids/ind-pyramid.ts`:** remove `export` from `IB_BINDINGS` (`:26`) if `git grep -w` shows no importer.
- **Replacements:**
  - CTD tree: `ctdRecordSubtree` (`tests/regulatory/ctd-component-outlines.test.ts`).
  - Module 1: `moduleOneTree` (`regional-module1-record.test.ts`).
  - IND DOCX: `ind:fda` pack plus the Authoring export (`authoring-footnotes-docx.test.ts`).
- **Parity:** zero callers for each (`git grep -nw` over `server shared client/src scripts tests services`). `template-default-text.test.ts` iterates `templateIds()` and still passes.

**S08 — Wire the existing single-copy gate and point it at the record (extending the gate, not adding one beside it).**
- **Change `scripts/ci/check-regulatory-reference-data-single-copy.mjs`:**
  - Extend `GUARDED` with `CTD_AUTHORING_GUIDANCE`, `ICH_M4_HEADINGS`, `REGIONAL_MODULE1`, `ICH_E3_GUIDANCE`, `ICH_M11_PROTOCOL_SECTIONS`, `PBRER_TEMPLATE` and `ICH_E2F_DSUR_SECTIONS`. Each has exactly one declaring module today.
  - Leave out `DOCUMENT_TEMPLATES`: two differently shaped exports carry that name (`market-specs`, `ana-ri`).
  - Widen the matcher to `export { NAME` and default exports, and add `services` to the roots.
  - Add `--selftest`: plant a second `export const ICH_M4_HEADINGS` in a temporary directory and require exit 1.
- **Wire:** `npm run ci:reg-reference-single-copy` and its selftest into the `ci.yml` lint job, beside `ci:unreferenced-modules` (`:188`).
- **Red:** the selftest output, filed.
- **Why now:** S09 deletes `fallbackTemplates`, which would leave the gate guarding nothing.

### Tier B: served or refused routes with no caller (delete, replaced by the named canonical path)

**S09 — Delete the misc-inline CTD template and drafting handlers and `ectd-fallback-templates.ts`. Replaced by `GET /api/authoring/templates`, `draft_authoring_document` and `batch_draft_sections`.**

This is urgent: `/api/v1/drafting/*` is served in production as infrastructure.
- **Delete from `server/routes/misc-inline-routes.ts`:**
  - `GET /templates` (`:48`; never runs, because `server/api/templates/routes.ts` is mounted first)
  - `GET /ectd/templates` (`:205`) and `/ectd/templates/:id` (`:269`)
  - `POST /v1/drafting/start_task` (`:348`) and `GET /v1/drafting/task_status/:task_id` (`:385`)
  - `generateDocumentContent` (`:24-42`), the `fallbackTemplates` import (`:3`), and any import left unused (`programInOrganization`, `templateService`)
  - Keep `vault/statistics`, `vault/list`, `ana/regulatory-intelligence`, `advisor/check-readiness` and `workflow/progression/create`.
- **Delete files:** `server/services/templates/ectd-fallback-templates.ts`; `server/routes/__tests__/drafting-task-object-authz.test.ts`.
- **Change tests:**
  - `server/routes/__tests__/misc-inline-routes.no-invented-content.test.ts`: drop the `start_task` describe (`:73-…`) and the `drafting_tasks` mock (`:22`).
  - `server/bootstrap/__tests__/regulatory-root-gate.test.ts:79-95`: change to assert both paths are not served (404).
  - `tests/db/drafting-tasks-tenant-scope.dbtest.ts`: drop the route cases and keep the RLS cases.
  - `server/services/submission-gateways/ectd-packager/__tests__/ich-headings.test.ts:21,183-205`: repoint the cross-validation onto the record. Every `ICH_M4_HEADINGS` and `CTD_AUTHORING_GUIDANCE` code in Modules 2–5 must resolve through `headingPathFor` into its own module.
- **Change baselines and scripts:**
  - `scripts/ci/unkeyed-request-tables-baseline.json`: remove `drafting_tasks` (`:42`) and decrement `total`.
  - `scripts/full-smoke-test.cjs:144`: remove `/api/ectd/templates`.
  - `check-regulatory-reference-data-single-copy.mjs`: drop `fallbackTemplates` from `GUARDED`.
  - Comments at `nonclinical-templates.ts:6-12`, `ind/ctd/ich-m4-headings.ts:10` and `tests/regulatory/ich-m4-headings.test.ts:10`.
- **Leave:** the `drafting_tasks` and `ectd_templates` tables (Rule 1).
- **Parity:**
  - Template list → `GET /api/authoring/templates` (`authoringTemplateStartFrom.test.ts`, `builtin-authoring-templates.test.ts`).
  - An org's eCTD template by id → `GET /api/templates/:id` until S22.
  - Drafting task → `draft_authoring_document` (`draft-authoring-document-tool.pglite.integration.test.ts`; `ci:canvas-path`) and `batch_draft_sections` (`batch-draft-sections.test.ts`).
  - Task status → the authoring document itself.
  - Nothing needs carrying over: the old "draft" was a placeholder fill recorded as COMPLETED.

**S10 — Delete `GET /api/submissions/document-templates[/:templateId]`, replaced by AnA `get_document_template` and `GET /api/authoring/templates`.**
- **Delete:** `server/routes/submissions.ts:517-547`; the types `DocumentTemplateStructure` and `DocumentTemplatesResponse` in `shared/types/submission-api.ts:522-541`.
- **Change:**
  - `server/services/market-specs/regulatory-capabilities-index.ts:39`: remove the `route` field and keep `anaTool`. Otherwise `submission-routes-registration.test.ts:34-37` fails.
  - `scripts/verify-submission-center.mjs:251-256`: remove these checks. They were already stale: they assert 6 sections where HEAD serves 7.
- **Parity:**
  - The family filter exists: `document-template-tool.ts:115` (`document-template-preparation.test.ts:112`).
  - One outline by id: `document-template-description.test.ts`, `document-template-pages-every-outline.test.ts`.

**S11 — Delete `server/api/ai/routes.ts`, replaced by `get_document_section_requirements` and the deficiency scan.**
- **Change:** in `server/bootstrap/register-core-routes.ts`, delete the import (`:6`) and the mount (`:42`). Keep `:41`, because `ai-assistance` and `ai-claims` mount under `/api/ai`.
- **Gates:** re-run the route-mount gates; update the `/api/ai` rows in `docs/reports/route-mount-audit-baseline.json` and `route-mount-owners.json` only if they flag.
- **Parity:**
  - Guidance for 3.2.S.4, 3.2.S.7, 3.2.P.2 and 3.2.P.5 → `CTD_AUTHORING_GUIDANCE` via `get_document_section_requirements` (`tests/regulatory/requirements-resolver.test.ts`).
  - 3.2.A.1 → `cmc-regulatory-record.json`.
  - `/analyze-compliance` → `POST /api/authoring/sections/:id/ai/deficiency-scan` (`authoringDeficiencyScan.test.ts`).
  - Not carried over, as defects under Rule 2 and fail-closed: the keyword score (an invented figure) and the hand-written boilerplate and regional asides (recall text with no basis).

**S12 — Delete `/api/biopharma/ctd` and its build-state helpers, replaced by AnA `get_ctd_module_home` and the governed outline.**
- **Delete:**
  - `server/routes/biopharma/ctd.ts` and its mount block (`register-inline-routes.ts:1063-1068`)
  - In `server/services/regulatory/ctd-module-structure.ts`: `annotateModuleBuildState`, `SectionStatusRow`, `ModuleBuildState`, `CtdSectionState`, `moduleReadiness`, `coerceStatus`
  - The cases at `tests/services/regulatory/ctd-module-structure.test.ts:46-80`
- **Change:**
  - `bla-biologics-tool-defs.ts:287`: drop the `/api/biopharma/ctd/build-state` sentence.
  - `scripts/ci/tenant-resolvers-baseline.json:32`: remove the entry.
  - Comment at `csr-workflow-routes.ts:44`.
- **Keep:** the `nda-cockpit` claim on `/api/biopharma`.
- **Parity:**
  - Structure → `get_ctd_module_home` (`tests/services/biologics/ana-tools.test.ts`).
  - Build state → `GET /api/c2c/documents/:id/outline` (`client/.../__tests__/filingOutline.test.ts`) and `list_authoring_outline` (`authoring-read-tools.test.ts`).

**S13 — Delete the request-body Module 2/CSR handlers in `submission-orchestrator.ts`, replaced by the run's m2.4/m2.5/m2.7/CSR/gateway steps and the AnA m2 tools.**
- **Delete:** `/m2/nonclinical`, `/m2/clinical`, `/m2/clinical-overview`, `/csr/tabulate` and `/validate/hardened` (`:918-1060`), plus any zod schemas only they use.
- **Change:** the comment at `submission-package-orchestrator.ts:1966`. The comment at `ui-surface-registry.ts:450-455` goes to H10.
- **Leave:** `csr-readiness-launch-claim.test.ts` (those paths stay unmapped).
- **Parity:**
  - Run steps: `server/__tests__/services/submission-orchestrator.test.ts`.
  - AnA tools: `nonclinical-clinpharm-tools.test.ts`, `new-tool-handlers.test.ts`.
  - CSR inputs: `orchestrator-csr-readiness.pglite.test.ts`.
  - Hardened validation: `submission-sign-release.ts`.
  - These handlers are the request-body defect that `/m2/qos` was already retired for.

**S14 — Delete dead drafting generators inside live routers, replaced by `draft_authoring_document`, `batch_draft_sections` and the record-briefed stream.**
- **Delete:**
  - `server/routes/deep-research.ts` `POST /document/generate` and its `sectionTemplates` (`:265-460`), with `deep-research-retrieval-status.test.ts`. The router stays; `DeepResearch.tsx` uses `/jobs` and `/connectors`.
  - `server/routes/ana-cortex-ft.ts` `/generate-section` (`:1212-1260`).
  - `server/routes/ana-intelligence.ts` `/draft`, `/draft/stream`, `/review`, `/gap-analysis`. Keep `/batch` (`BatchDraft.tsx`; see H2), `/health`, `/models`, `/vision`, `/quick`, `/agent` and `/tools`. Grep the tests for `/api/claude/(draft|review|gap-analysis)` and drop those cases.
  - `server/api/enterprise/routes.js` `/regulatory/generate`, `/regulatory/enhance` and `/regulatory/analyze` (the last reports a false "GPT-4o" provider). Keep the audit and health routes, which are outside this lens.
  - `server/routes/planner-routes.ts` (whole file) and `register-project-routes.ts:22,100`.
- **Change:**
  - `server/bootstrap/__tests__/routes-reach-the-bundle.test.ts:235`: a new representative for `register-project-routes.ts`.
  - Delete `planner-routes-5xx-containment.test.ts`.
  - `scripts/ci/check-pdf-runtime-canonicality.mjs:63`: remove the planner entry.
- **Parity:**
  - Generate a document → `draft_authoring_document` (`draft-persistence-authoring-doc.test.ts`; `ci:canvas-path`).
  - Section lists → `get_document_template` (`ctd-component-outlines.test.ts`; `csr-e3-overlay.test.ts`).
  - Generate a section → `/api/ana-ri/stream` (`stream-answer-sources.test.ts`).
  - Review and gap analysis → the deficiency scan.
  - SAP and protocol → class packs plus drafting.
  - Exports → the Authoring export (`authoringExportPdf.test.ts`).

**S15 — Delete the duplicate template listings, replaced by `GET /api/authoring/templates` and the one rule-pack read.**
- **Delete:**
  - `server/routes/coauthor.ts` `GET /templates` (`:1048-1063`)
  - `server/routes/concept2cure.ts` `TEMPLATES` (`:2194`), `GET /templates` (`:2482`), `GET /templates/:id` (`:2526`), and `server/routes/concept2cure-ib-template.ts`
  - The inline alias `GET /api/c2c/rule-packs` (`register-inline-routes.ts:825-845`)
- **Change tests:**
  - `tests/routes/concept2cure.test.ts:415,500`: first confirm that artifact create does not look up `TEMPLATES` (its only uses are `:2486` and `:2528`).
  - Comment at `tests/regulatory/ib-one-outline.test.ts:11`.
  - `rule-pack-provenance-exposure.test.ts` (`:33-45`, `:164+`): repoint to `/api/c2c/documents/rule-packs`.
- **Parity:**
  - Lists → the picker and `get_document_template`.
  - The IB → `ib-one-outline.test.ts`.
  - The IND cover letter → `POST /api/ind-lifecycle/cover-letter` (`cover-letter-type-from-the-submission-record.test.ts`).
  - Rule packs → `GET /api/c2c/documents/rule-packs`, kept.

**S16 — Delete the dead scaffolds and packagers, replaced by `scaffoldProjectDocuments`, the eCTD compile, the CMC lane and Submission Readiness.**
- **Delete:**
  - `server/routes/mission-control.ts` scaffold handler (`:1241-1330`) and `IND_IB_SCAFFOLD_ROWS` (`:1222-1239`).
  - The `'ectd-zip'` format: `server/routes/universal-packager.ts:51,217` and in the service `:30,165,177,809`. It is `generateZip` under a false eCTD label.
  - `server/src/routes/stability.router.ts` `/studies/:id/ai/draft-p8` (`:2088-2096`), its import (`:16`), and `server/src/services/ai/stability.ts` `aiDraftP8` (`:129-153`).
  - `server/routes/ana-features.ts` `/gap-analysis` (`:1390-1540`) and `ectdRequirements` (`:370-1388`), with `tests/routes/ana-gap-analysis.test.ts`.
- **Change:**
  - `tests/regulatory/ctd-registry-consistency.test.ts`: drop the import (`:52`) and use (`:160`).
  - `tests/regulatory/ctd-registry/m1-placement.consistency.test.ts:85-97`.
  - `scripts/uat-stability.mjs:152-157` and `docs/compliance/UAT_Stability.md:73`.
  - Correct the false reason in `unkeyed-request-tables-baseline.json:27`: `stability.router.ts` is mounted.
- **Parity:**
  - Scaffold → `c2c-project-scaffold.contract.test.ts`.
  - 510(k) → `projects-create-regional-devices.test.ts`.
  - IB at 1.14.4.1 → `soleModule1Placement`, kept.
  - P.8 → `composeProjectModule3` (`buildSectionCanonical.test.ts`, `composition-boundary-module3-os.test.ts`).
  - Gap analysis → `required-sections.ts` and `assess-dispatch-readiness` (`assess-dispatch-readiness.gates.test.ts`).
  - Not carried over: the invented `estimatedEffortDays` (Rule 2).

**S17 — Delete the `/api/predictive-sections` and `/api/project-sections` routers, replaced by the governed outline, c2c sections and c2c tasks.**
- **Delete:**
  - `server/routes/predictive-sections.ts` and `server/services/predictiveSectionService.ts`; `register-inline-routes.ts:31,154-155`; `predictive-sections-5xx-containment.test.ts`; `predictive-section-ai-availability.test.ts`; the entry at `unapproved-model-pins-baseline.json:24-27`.
  - `server/routes/project-sections.ts`; `register-document-routes.ts:212-213` and comment `:242-243`; `sql-interpolation-baseline.json:50`.
- **Change:**
  - `tests/db/actor-displays.dbtest.ts`: move the actor-display assertions to a c2c route.
  - `server/services/audit/domain-history-link.ts:197`: the owner string.
  - The note at `duplicate-table-ddl-baseline.json:68`.
- **Keep:** the `project_sections` and `project_milestones` tables. `ectd-compile.ts`, `compile-placement.ts` and dossier-map read the first.
- **Parity:**
  - Next or missing sections, completion → `document-outline.ts`, `required-sections.ts` and `assess-dispatch-readiness`.
  - Templates by section → the picker.
  - Status → `PATCH /api/c2c/documents/:id/sections/:key`.
  - Assign, due dates, dependencies and milestones → `server/routes/c2c/tasks.ts` (`dependsOn`, category `'milestone'`).
  - Comments → authoring and review threads.

**S18 — Delete the `/api/ectd-documents` and `/api/regulatory-submissions` routers, replaced by `/api/coauthor/documents`, Place into filing, c2c projects and the submissions spine.**
- **Delete:** `server/routes/ectd-documents.ts` (`register-document-routes.ts:18,102`); `server/routes/regulatorySubmissions.ts` (`register-inline-routes.ts:40,1169`) and `regulatory-submissions-workspace.test.ts`.
- **Change:**
  - `coauthorPutStatus.test.ts`: drop the `ectd-documents` halves (`:20,99,140,144` and the describes at `:437` and `:589`).
  - `coauthor-document-delete-audit.contract.test.ts:126`.
  - The mock key at `regulatory-risk-section-screen-removed.test.ts:45`.
  - `drizzle-tenant-scope-baseline.json:73-76,108-109`.
  - `tenant-resolvers-baseline.json:71`.
  - `verify-submission-center.mjs:367-370` and `full-smoke-test.cjs:191`.
- **Parity:**
  - CRUD → `/api/coauthor/documents` (`coauthorPutStatus.test.ts`).
  - Placement → `coauthorSnapshotFromSource.test.ts`.
  - Module titles → `MODULE_NAMES` (`required-sections.ts:68`).
  - Classify and extract → AnA tools.
  - Projects, sequences and granules → c2c projects (`projects-create-anchor.pglite.test.ts`), the submissions spine and outline sections.

**S19 — Delete GCC drafting and the GCC eCTD module, replaced by `batch_draft_sections` and the record.**
- **Delete:** `server/api/drafting/routes.ts` and `gcc-drafting-governance.test.ts`; `server/api/gcc/ectd/routes.js`.
- **Change:**
  - `server/api/gcc/index.ts:17,21,27,31`.
  - `server/api/gcc/modules.ts`: the `'ectd'` entry (`:54-61`) and the `'drafting'` entry (`:78`).
  - `tables-live-schema-baseline.json:96-106`, `unbacked-tables-baseline.json:42-46`, the `unapproved-model-pins-baseline` entry, and the `check-embedding-runtime-canonicality.mjs` entry.
  - `scripts/test-cognitive-fabric.ts:206`.
- **Parity:** cited drafting → `blueprint-grounded-drafting.test.ts`; entity extraction → `extract_submission_document`; module list → `MODULE_NAMES` and `ICH_M4_HEADINGS`. The `vault.*` tables were never provisioned.

**S20 — Delete `/api/ctd` onboarding and the project half of `ctd-ingestion-service.ts`, replaced by c2c create, the Vault and `required-sections.ts`.**
- **Delete:**
  - `server/routes/ctd-onboarding.ts` and `register-document-routes.ts:412-419`.
  - In `server/services/ctd-ingestion-service.ts`: `CreateCTDProjectParams`, `CTDDocumentUpload`, `ComplianceGap`, `REQUIRED_SECTIONS`, `DEFAULT_REQUIRED`, `createCTDProject`, `listCTDProjects`, `getCTDProjectStatus`, `uploadCTDDocument`, `validateCTDCompleteness`, `generateInitialGaps` and `recalculateCompletion` (`:30-270`, `:364-486`).
- **Keep:** `m1Section`, `SECTION_PATTERNS`, `NOT_CTD` and `detectCTDSection` (live via `vault-filing.service.ts:42`); `shared/schema/ctd-projects.ts` (the leaf resolvers read `ctdOnboardingDocuments`; see FD-12); `migrations/0007` (off the applier).
- **Parity:** projects → `projects-create-anchor.pglite.test.ts`; detection → stays (`m1-placement.consistency.test.ts:43`); completeness → `required-sections-profile.test.ts` and `ectd-readiness-boundaries.test.ts`. The client, `CTDProjectWizard.tsx`, was deleted in `8ba28dc0d`.

**S21 — Delete the CTD/IND/Module 3 generators in `knowledge-base.ts`, replaced by the CMC lane, `batch_draft_sections`, the Authoring export and File to Vault.**
- **Delete:** `/generate-docx` (`:898`), `/generate-ind-package` (`:936`), `/generate-ind-section` (`:1001`), `/generate-module3-docx` (`:1033`), `GET /cmc-project-data` (`:1417`), `/save-docx-as-artifact` (`:1479`), `/ind-autodraft/upload` (`:2300`) and `/ind-autodraft/generate` (`:2454`), plus helpers only they use.
- **Keep:** `/search-connectors`, `/upload`, `/context`, extract-pdf and ocr, and `/save-to-connector`. These are outside this lens; see GF-6.
- **Change:**
  - Drop the deleted endpoints' cases from `knowledge-base-*.test.ts`, `server/__tests__/routes/smoke.test.ts:147-215` and `recorded-downloads.contract.test.ts:84-87`.
  - Remove the route mocks at `tests/e2e/cmc-direct-open.spec.ts:59` and `workspace-hardening.spec.ts:138`.
  - Rerun and lower `drizzle-tenant-scope-baseline.json:90-98` (stale entries only).
  - `writerless-stores-baseline.json:22-24` `cmcProjects`: its only reader goes.
  - Comments at `connector-interface.ts:110` and `ind-generation-prompt.test.ts:5`.
- **Parity:** Module 3 → `composeProjectModule3` (`buildSectionCanonical.test.ts`, `composition-boundary-module3-os.test.ts`); CMC data → `cmc-route-uniqueness.contract.test.ts`; save → `authoringFileToVault.pglite.integration.test.ts`; IND → `blueprint-grounded-drafting.test.ts`.
- **Also closes a P-28 bypass:** `/generate-module3-docx` composed Module 3 for any program without `composition-scope`, and omitted S.5, S.6, P.4, P.6 and P.7.

**S22 — Delete `server/api/templates/routes.ts`, replaced by the picker, c2c templates and `POST /api/authoring/templates`. Runs after S02 and S09.**
- **Delete:** the file, `register-core-routes.ts:5,37`, and `routes.upload-safety.test.ts`.
- **Change:**
  - Drop this file's entries from `drizzle-tenant-scope-baseline.json` (`:5` and the rest).
  - Remove `/api/templates` from `ALLOWLIST.shadowPaths` in `audit-route-mounts.mjs:67` and from `full-smoke-test.cjs:141`.
  - The `/api/templates` claim in the surface registry goes to H10.
- **Keep:** `templateService.ts`, which AnA `fetch_template_and_fill` reads in-process (see S59).
- **Parity:** list and read → `document-template-pages-every-outline.test.ts`; org template CRUD and upload → `server/routes/c2c/__tests__/templates-list.test.ts`; "recent" and "featured" are orderings of the list. Its only client is the template list deleted in S02, which no router ever mounted.

**S23 — Delete `ai-editing.ts`'s endpoints that have canonical twins (all except `/ai/autocomplete`), replaced by the editor and AnA paths named below.**
- **Delete:** `/ai/edit-section`, `/ai/templates` and `/ai/templates/:id/generate` (with `PROMPT_TEMPLATES` `:637-1018`), `/ai/compliance-scan`, `/ai/citation-search`, `/ai/batch-edit`, `/ai/validate-references`, `/ai/check-inconsistency` and `/ai/extract-metadata`.
- **Keep:** `/ai/autocomplete` and the mount until FD-1(a).
- **Change:**
  - Delete `ai-editing-readiness-is-not-completeness.test.ts` and `ai-editing-retrieval-status.test.ts`.
  - `c2c-router.parity.test.ts:223-245`: assert the deleted paths are not answered.
  - `o01-ai-authoring-audits.pglite.test.ts`: the template cases (`:93-109`).
  - `tests/routes/concept2cure.test.ts:287,468,529`.
  - Rerun and lower `drizzle-tenant-scope-baseline.json:15-16` and `sql-interpolation-baseline.json:14`.
  - Comment at `rewrite-dispatcher.ts:308`.
- **Parity:**
  - Edits → AnA proposals in the editor (`stream-context-awareness.test.ts`) and `/sections/:id/ai/draft` (`authoringAiDraftStructured.test.ts`).
  - Templates → picker and `get_document_template`.
  - 2.5 → `draft_clinical_overview_m2_5`; 2.3 → `draft_quality_overall_summary_m2_3`; CSR synopsis → `get_csr_template`.
  - Safety narrative → `draft_safety_narrative`. It has no dedicated test, so add one in this slice.
  - IND cover letter → `/api/ind-lifecycle/cover-letter`.
  - Compliance → deficiency scan; citations → editor citations; batch → `batch_draft_sections`; inconsistency → `document_figure_consistency`; metadata → `extract_submission_document`.
  - `/ai/validate-references` → `check_ectd_cross_references` and `readCrossReferenceRegister` (`ind-program-findings.ts:80`). The old handler read `concept2cure_artifacts` by `project_id` with no org predicate.

**S24 — Carry the record's heading-coverage check into the deficiency scan, then delete `routes/ind.ts` and `indCopilot.js`. Replaced by the stream draft, `get_document_section_requirements`, c2c projects and the deficiency scan.**
- **Carry (same commit):**
  - Move `sectionRequirementCoverage` and `headingCodesIn` (`indCopilot.js:667`) into `server/services/ind/ctd/section-brief.ts` as an exported `sectionHeadingCoverage(code, content, family)`. Filter by `requiredFor.includes(family)`.
  - `authoring.router.ts` deficiency scan: add `record_heading_coverage` beside `record_requirements` (`:4414`). Pass the document's bound application family, or `not_assessed` when it has none.
  - Red: a scan of a section coded `2.7` whose body lacks a `2.7.3` heading must report it missing. Add this to `authoringDeficiencyScan.test.ts`; it fails on the parent commit because the field is absent. Move the unit assertions from `ind-copilot-coverage-is-deterministic-model-narrates.test.ts` to `server/services/ind/ctd/__tests__/`.
- **Delete:**
  - `server/routes/ind.ts`, `server/services/indCopilot.js`, `register-clinical-intel-routes.ts:15,50`
  - The four `server/services/__tests__/ind-copilot-*.test.ts`, `ind-copilot-guidance-failed-read-is-an-error.test.ts`, `ind-stream-error-is-a-static-message.test.ts`, `ind-applications-tenant-scope.test.ts` and `server/__tests__/security/ind-application-delete-audit.contract.test.ts`
- **Change:**
  - `routes-reach-the-bundle.test.ts:236`: a new representative for `register-clinical-intel-routes.ts`.
  - `cmc-js-model-task-types.contract.test.ts:46,69-70`.
  - `check-legacy-dep-quarantine.mjs:25` (`SUPABASE_ALLOWLIST`).
  - `check-image-runtime-assets.mjs:215-218` (`data/guidelines`). Delete that directory only if `grep` finds no other reader.
  - `full-smoke-test.cjs:205`.
  - Check `check-regulated-delete-audit.selftest.mjs`.
  - `requestdb-coverage-baseline.json:128,358` and the `/api/ind` rows of the route-mount baselines (rerun). Keep the `/api/ind` owner family at `audit-route-mounts.mjs:79`.
- **Parity:** draft and stream → `stream-answer-sources.test.ts`; guidance → `requirements-resolver.test.ts`; coverage → carried; CRUD → c2c projects; follow-up → AnA. Every Supabase read was dead without `SUPABASE_*`.

**S25 — Carry the unresolved-placeholder check into the deficiency scan, then delete `routes/ind-generation.ts`. Replaced by the dossier read, the outline, the stream and the scan.**
- **Carry:**
  - Move `UNRESOLVED_PLACEHOLDER_PATTERN` and its detector (`ind-generation.ts:52-75`) to `shared/authoring/unresolved-placeholders.ts`.
  - The deficiency scan returns `unresolved_placeholders`.
  - Red: a section containing `[NOAEL VALUE]` reports it (`authoringDeficiencyScan.test.ts`).
- **Delete:**
  - The file and `register-ai-routes.ts:3,50`.
  - `ind-generation-error-containment`, `-fail-closed`, `-no-fabrication` and `-status-counts-drafted-not-completed` tests.
  - The case at `smoke.test.ts:335`.
  - The `/api/ind-generation` cases in `device-chat-cer-per.test.ts` (`:39`, `:177-222`).
- **Change comments:** `register-clinical-intel-routes.ts:47`, `ind-generation-prompt.test.ts:4-5`, and `ind-tools-retired.test.ts:18`. A project-level roll-up now exists (`readDossier`, `b660daf1e`, 2026-10-22).
- **Keep:** `ind-section-registry.ts` (see S55).
- **Parity:**
  - Structure → `get_document_template`; lifecycle types → `lifecycle-document-types.ts`; guidance → `ctd-authoring-depth.test.ts`.
  - Status and device-status → `GET /api/c2c/projects/:id/dossier` (`server/routes/c2c/__tests__/projects-dossier.test.ts`; class documents count as one row).
  - Generate a section → `stream-context-awareness.test.ts`.
  - Placeholders → carried.

**S26 — Delete the legacy `POST /api/concept2cure/projects`, `bootstrap-preview` and `projectBootstrapFromRegistry.ts`, replaced by `POST /api/c2c/projects` and `scaffoldProjectDocuments`. Requires FD-1(b).**
- **Before deleting:** move the owner-grant and custom-role assertions from `o01-core-project-audits.pglite.test.ts:88-160` onto the c2c create. Show they pass there (`projects-authorization.test.ts`, `projects-create-anchor.pglite.test.ts`).
- **Delete:**
  - `concept2cure.ts` `router.post('/projects')` (`:1048-~1420`), including the legacy suggestion at `:1012`, and any helpers it leaves unused.
  - `router.post('/regulatory-catalog/bootstrap-preview')` (`:2646-2664`).
  - `getBootstrapPreview` (`globalDocumentRegistryService.ts:176`).
  - `server/services/regulatory/projectBootstrapFromRegistry.ts`.
  - `tests/regulatory/projectBootstrapFromRegistry.test.ts`; the describe at `tests/routes/concept2cure-regulatory-catalog.test.ts:137-165`; `tests/routes/concept2cure-project-bootstrap.test.ts`.
- **Change:**
  - `tests/e2e/golden-customer-journey.e2e.ts:110`: create through `/api/c2c/projects` and carry the anchor id into `:118+` (`tier5-browser-smoke.yml:130`).
  - The `vi.mock` lines in the o01 test and in `project-sharing-team-setup.dbtest.ts:16`.
  - `scripts/seed-demo-data.sh:66`.
  - Rerun `drizzle-tenant-scope-baseline.json:68-71`.
  - `server/services/regulatory/suggestedActionsCatalog.ts`: delete if it has no importer.
- **Parity:**
  - Create → `projects-create-anchor.pglite.test.ts`; scaffold → `c2c-project-scaffold.contract.test.ts`.
  - Intelligence profile → lazy `getOrCreateProfile`.
  - Preview → `projects-create-market-offer.test.ts`.
  - Default `customInstructions` → FD-1(b).

**S27 — Delete `section-generation-service.ts` and `POST /api/submissions/:id/sections/generate`, replaced by `askAnaToDraft.ts` → `/api/ana-ri/stream`.**
- **Confirm first:** the stream path writes an AI turn record for the drafting turn (`turn-record.ts`), and the author sees the ungrounded claims (`post-processing-answer-check.test.ts`). If either is missing, stop and escalate as FD-1(e).
- **Delete:**
  - `submissions.ts:64` import and `:1494-1532`.
  - The service and `server/services/ai-gateway/prompts/section-generation/{v1.0.md,v1.1.md,CHANGELOG.md}`.
  - `section-generation-requirements.test.ts` and `section-generation-figures.test.ts`. Move the latter's `plainTextToHtml` editor-parity assertion to a `shared/authoring` test.
  - `o01-ai-authoring-audits.pglite.test.ts:153-180`.
  - The `tests/ci/prompts-dir.test.ts:23` entry.
  - `shared/types/submission-api.ts:172-190` (`GenerateSection*`, no importer).
  - The entries in `submission-center.openapi.json:1530` and in `SUBMISSION_CENTER*.md` and `.http`.
- **Change comments:** `shared/authoring/plain-text-html.ts:25`; `docs/design/ANA_REGULATORY_RECORD.md:63,191,678,785,834`.
- **Parity:** `stream-answer-sources.test.ts`, `askAnaToDraftPrompt.test.ts`, `authoringConversationHandoff.test.tsx`, `draft-persistence-authoring-doc.test.ts`. Writes into `coauthor_documents` are deliberately not carried over.

**S28 — Delete the AnA command `draft_section`, replaced by `list_authoring_outline`, `read_authoring_section`, `batch_draft_sections` and `draft_authoring_document`.**
- **Delete:**
  - In `server/services/ana-ri/command-executor.ts`: `draftSection` (`:3546-3592`), its union member (`:4781`), its registry entry (`:5060-5065`) and its map entry (`:5483`).
  - `command-rbac.ts:234-236`.
  - `ana-launch-scope.inventory.json`: `commands.inScope` (`:1209`).
  - `draft-section-capture.pglite.test.ts`.
  - `'draft_section'` from `part11-governance.test.ts:30`.
- **Change:** the registry text names `batch_draft_sections` and `draft_authoring_document` for "draft section 2.5".
- **Keep:** the `doc_sections` table (Rule 1; `reachability-debt-cleared.contract.test.ts:123`). The display names go to H10.
- **Parity:** `authoring-read-tools.test.ts`, `batch-draft-sections.test.ts`, `draft-authoring-document-tool.pglite.integration.test.ts`. The command never drafted; every call answered "not found".

**S29 — Delete the second Module 3 compile path in `cmc-module3-compiler.ts`, replaced by `module3Composer.composeModule3FromCanonicalSources` and `cmc/section-drift.ts`.**
- **Delete:** `SECTION_MAP` (`:20-41`), `CmcSourceObject` and `CompiledSection` (`:3-18`), `compileModule3Sections` (`:67-91`) and `markStaleSections` (`:107-116`).
- **Keep:** `createSourceHash`, `stableHash`, `canonicalize`, `summarizeSectionDiff` and `canFinalizeExport`, all live.
- **Change tests:**
  - `tests/module3-e2e-journey.test.ts:618-650,812-843` and `tests/module3-workflow-convergence.test.ts:255-299,498-520`: repoint to `impactedSectionsForSourceType` and the composer, or delete. These cases pin a wrong source-to-section map.
  - Drop the compile and stale cases in `server/services/__tests__/cmc-module3-compiler.test.ts`.
- **Parity:** `module3Composer.test.ts`, `cmcWriteThroughOutcome.test.ts`, `section-signature-binding.pglite.test.ts`.

**S30 — Delete `AnaDocContext.tsx` and the write-only `detectedDocumentTemplate`, replaced by `AnaActivity`'s "Drafting {documentType}" line.**
- **Delete:** `client/src/concept2cure/v2/surfaces/AnaDocContext.tsx`.
- **Change:**
  - `ConversationThread.tsx`: the import (`:16`) and the two `turn.doc &&` blocks (`:400-405`). Rebase onto the client-journey session's latest version, which decision 12 touched.
  - `components/ana/useAnaChat.ts:2048`: stop storing the template; keep `detectedDocumentType`.
  - `useAnaChat.types.ts:24,489-495`.
- **Red:** add an assertion for `AnaActivity.tsx:610-611` in `anaActivity.test.tsx`. Today only the lens line is pinned.
- **Leave:** `CtTurn.doc` (`fixtures`) and the `.adc-*` CSS (H10).
- **Parity:** the chip is live; the outline card never rendered, because `toTurn` never sets `doc`.

### Tier C: converge live heading copies onto the record

**S31 — Extend the single-copy gate with a CTD heading-copy inventory ratchet. This finally delivers the inventory that `ANA_REGULATORY_RECORD.md:492` promised and nobody built.**
- **Change `check-regulatory-reference-data-single-copy.mjs`:** a second check counts, per non-test file under `server shared services client/src`, the literal CTD code/title pairs. Match `'2.5.1', title:` and `code: … title:` forms and `"2.5.1 Product Development Rationale"` strings.
- **Rules:**
  - The record files are exempt: `authoring-guidance.ts`, `ich-m4-headings.ts`, `regional-module1.ts`, `csr-e3-*.ts`, `lifecycle-document-types.ts`, `protocol-m11.ts`, `pbrer-outline.ts`.
  - Any other file with 3 or more pairs must be in `scripts/ci/ctd-heading-copies-baseline.json`, each with the slice that will remove it. The baseline may only shrink.
  - Add `--selftest` with a planted file.
- **Change comments:** `tests/regulatory/ctd-registry-consistency.test.ts:67` and `ANA_REGULATORY_RECORD.md:492` name this gate.
- **After this slice:** every slice from S32 on removes its file from the baseline.

**S32 — Export the record's filed-heading title and the composer helpers beside the record.**
- **Change:**
  - Move `headingTitle` (private at `server/services/ind/ctd/index.ts:288`) into `ich-m4-headings.ts` as `ichFiledHeadingTitle(code)`. `index.ts:315` imports it.
  - Move `heading`, `notComposed` and `notComposedGap` from `m2-summary-builders.ts:35-67` into `server/services/market-specs/ctd-component-outlines.ts`; `m2-summary-builders.ts` imports them.
- **Rule for later slices:** prompts, lists and pickers use `ichHeadingTitle`; filed headings and leaf labels use `ichFiledHeadingTitle`.
- **Red:** add pins in `tests/regulatory/ich-m4-headings.test.ts` for 2.1, 2.3, 2.6.1, 3.2.S.2, 3.2.S.7 and 3.2.A. These fail before the export exists. The strip removes "(Modules 2–5)" from 2.1 and "(QOS)" from 2.3; that is recorded for FD-7.
- **Gate:** `m2-composers-head-as-the-record.test.ts` is unchanged.

**S33 — Converge `lumen-context/sections.ts` `SECTION_PROMPTS` sub-heading lists onto `ctdRecordSubtree`.**
- **Change:** for the parent playbooks 2.6, 2.7, 3.2.S, 3.2.P, 4.2.1, 4.2.2 and 4.2.3, render "Sub-sections", "Full Structure" and "Required Studies" from `ctdRecordSubtree(key)`, one level below the key, as `- **${code}**: ${title}`.
- **Keep:** every prose block, the 5.3.5 E3 path, the non-CTD playbooks, the prefix fallback and `MODULE_GUIDES`.
- **Red:** in `tests/regulatory/ana-ctd-section-truth.test.ts`, check that each `**code**: title` line equals `ichHeadingTitle(code)`. It fails on HEAD for 3.2.P.4–3.2.P.8, 2.7.1, 2.6.1, 3.2.S.1–5, 3.2.S.7 and every 4.2.x line. The pin at `:116` still holds.
- **Unchanged pins:** `csr-e3-overlay.test.ts:137-140` and the stream test mocks.

**S34 — Converge AnA `advise_ctd_structure` (`server/services/ana/ctd-structure.ts`) and `get_ctd_module_home` (`server/services/regulatory/ctd-module-structure.ts` `M2_SECTIONS`) onto the record.**
- **Change:**
  - `ctd-structure.ts` m2–m5 `sections` become `${code} ${ichHeadingTitle(code)}` for 2.1–2.7; 3.1, 3.2.S, 3.2.P, 3.2.A, 3.2.R, 3.3; 4.1, 4.2.1–4.2.3, 4.3; 5.1, 5.2, 5.3.1–5.3.7, 5.4. Keep m1's prose, the labels and summaries, `placementCues`, `aliases` and the API.
  - `M2_SECTIONS` becomes `ctdComponentSections('2')` at depth 3. Keep a code-keyed overlay for `aiDraftable` and `regulatoryRef`. Take `sourceModules` from `reasoning-engine/rule-data.ts` `DEPENDENCIES`, so there is one map. Record the 2.5 difference (`[5]` vs `['4','5']`) in the README.
- **Red:** a title-equals-record pin in `server/services/ana/__tests__/ctd-structure.test.ts` (red on 5.3.3). Rewrite `tests/services/regulatory/ctd-module-structure.test.ts:33-40` to assert the record (red on 2.1 and 2.7.1, and on 2.6.5, 2.6.7, 2.7.5 and 2.7.6 being absent).
- **Out of lens:** the M1 trees belong to the Module 1 lens.

**S35 — Converge `medical-writing.ts`'s 2.5 and 2.7 `structure` onto `getDocumentTemplate('clinical_overview'|'clinical_summary')`.**
- **Change:** at `:155` and `:167`, use `(getDocumentTemplate(id)?.sections ?? []).map(s => `${s.number} ${s.heading}`)`. In `REGIONS.fda.dossierStandard` (`:362`), change "2.3.1 forms" to "1.1 forms".
- **Red:** `reviewMedicalWriting('clinical_summary', <draft headed as the served outline>)` returns `missingSections []`. HEAD reports 5 missing.
- **Tests:** `medical-writing*.test.ts`, `writing-gate-structure-status.test.ts`, and `tests/regulatory/{csr-e3-overlay,chat-protocol-m11,ib-one-outline,medical-writing-rmp,ana-submission-sequence-truth}.test.ts` stay green.

**S36 — Converge `ana-ri/document-routing.ts` onto the record, and point CTD document generation at `draft_authoring_document`.**
- **Change:**
  - Module 2–5 row titles become `ichHeadingTitle(code)`, with a load-time assertion that throws on an unheld code.
  - The 5.2 row becomes "Tabular Listing of All Clinical Studies". "nonclinical … tabulated summar" routes to 2.6.
  - Order the 5.3.x rows before the 4.2.x rows, or narrow the 4.2.x patterns.
  - `buildDocumentGenerationContext`: `ctd_section`, `csr_section` and `sap` types propose `draft_authoring_document`; memos keep the artifact proposal.
  - `command-executor.ts:4861-4866`: the `create_artifact` example becomes a non-document canvas, and the description names `draft_authoring_document` for CTD documents.
- **Red:** "draft the human pharmacokinetic study report" → 5.3.3, and "nonclinical tabulated summaries" → 2.6. Both fail on HEAD.
- **Tests:** keep a "person confirms" assertion in `action-prompts-propose-only.test.ts:91-94`. `ctd-registry-consistency.test.ts:125-143`, `m1-placement.consistency.test.ts`, `command-registry-consistency.test.ts` and `ci:canvas-path` stay green.

**S37 — Converge `in-text-references.ts` `ctdTree` onto both halves of the record.**
- **Change:** build `ctdTree` (`:422-439`) from `CTD_AUTHORING_GUIDANCE` plus `ICH_M4_HEADINGS`. Keep `CTD_M4_CHILD_COUNT` as an independent check, adding `'2.4': 6`, `'2.6.4': 10`, `'2.6.6': 10` and `'2.7.4': 7`, each with its basis noted.
- **Pins that move in `in-text-references.test.ts`:** `:173` ("Module 3.3" now resolves) and `:225-230` ("Module 2.5.7" now resolves). `:176-196` is unchanged.

**S38 — Point AnA's next actions only at canonical paths: `engine.ts` `buildSuggestedActions`, `assemble_ectd_module_from_artifacts` and `convene_drafting_council`.**
- **`engine.ts`:**
  - In the NDA and BLA flows, replace "Draft Quality Overall Summary (2.3)" with `draft_authoring_document` for 2.3, worded as `AUTHORED_INSTEAD`.
  - In the protocol, CSR, 510(k), CER and PMA flows, use `draft_authoring_document` with `get_document_template` instead of `generate_document`.
- **The assemble handler:**
  - Refuse a `module_number` starting with `3` or `2.3`, using `composition-scope` `AUTHORED_INSTEAD` text and pointing to `module3_build_all`.
  - Sort with `compareSectionCode`.
  - Take a missing title from `ichHeadingTitle`.
  - Drop "or submission" from the description at `legacy-import-tool-defs.ts:583-605`.
  - State in the result that it assembled only AI-output artifact rows. The source store is FD-10.
- **The council (`agentic-workflow-tools.ts:214`):** resolve the open program type and add `record_requirements: resolveSectionRequirements(type, sectionPath)`, passing "not indexed" text through.
- **Red:**
  - No NDA or BLA flow suggests a tool that `composition-scope` refuses.
  - `2.6.4.2` sorts before `2.6.4.10`.
  - A 3.2.S prefix is refused.
  - A 2.5.4 council session carries the 2.5.4 brief.
- **Tests:** `intelligence-flow-suggested-actions.test.ts`, `ind-tools-retired.test.ts:102-108`, `new-tool-handlers.test.ts:41,114,247`, `council-tool*.test.ts`.

**S39 — Converge `precedent-engine.ts`'s four RTF checklist rows onto the record.**
- **Change:** in `analyzeRTFTriggers` (`:1585-1690`), the four CTD rows read `section: 'Module '+code` and `item: ichHeadingTitle(code)`. The QOS moves from "Module 3" to "Module 2.3", and "ICH E1" becomes "ICH M4E(R2)".
- **Red:** QOS is filed under Module 2.3.
- **Tests:** `precedent-checklists-no-uncited-figures.test.ts`, `precedent-crl-store-fallback.test.ts`, `device-lenses.test.ts`.

**S40 — Converge `templates/nonclinical-templates.ts`'s headings onto `ctdRecordSubtree('2.6'|'4.2.1'|'4.2.2'|'4.2.3')`.**
- **Change:** generate the heading lines from the record. Keep the field placeholders (`STUDY_TITLE`, `GLP_STATUS`, `NOAEL/LOAEL/MTD`, `TK_DATA`, `SAFETY_MARGIN`) as a code-keyed overlay, and keep the FIH memo, the ids, the API and the tool contract. For the 4.2.x study reports, the text says "place under" rather than nesting headings.
- **Red:** every heading code is a record code with the record's title (`server/services/templates/__tests__/nonclinical-templates.test.ts`).
- **Also update:** `nonclinical-clinpharm-tools.test.ts:29,145-160`.

**S41 — Converge `templates/clinical-csr-templates.ts`'s protocol and synopsis onto ICH M11 and E3 §2.**
- **Change:** the protocol body comes from `ICH_M11_PROTOCOL_SECTIONS` level 1, with its basis named as M11. The synopsis fields come from `csr-e3-sections-plan.ts` §2 "contains". Keep the ids, `granule_ids`, `sectionCode`s and the API.
- **ISS and ISE:** label them as platform convention pending FD-6. Split the "Deaths, SAEs" merge into 2.7.4.2.1.2 and 2.7.4.2.1.3 wording.
- **Red:** protocol headings equal M11 level 1 (pattern from `chat-protocol-m11.test.ts`).
- **Tests:** `clinical-csr-templates.test.ts`, `csr-template-tool.test.ts`, `csr-e3-overlay.test.ts:32`, `tool-selection-tokenize.test.ts:168`.

**S42 — Converge `safety-reports/psur-dsur-service.ts` onto `PBRER_TEMPLATE` (ICH E2C(R2)) and `ICH_E2F_DSUR_SECTIONS` (ICH E2F).**
- **Change:** replace `PSUR_SECTIONS` (`:53-190`) and `DSUR_SECTIONS` (`:191-302`) with flattenings of the records. Keep the input validation, `reportingPeriod` and `status`.
- **Red:** rewrite `psur-dsur-service.test.ts` to assert equality with the records. It fails on HEAD: Executive Summary is numbered 1, PBRER §15 is missing, and DSUR §3, §4, §11 and §14–16 are missing.
- **Optional:** `pharmacovigilance.ts` `DELIVERABLES` titles.

**S43 — Converge `csr-builder.ts` `ICH_E3_STRUCTURE` onto `ICH_E3_GUIDANCE`.**
- **Change:** numbers and titles come from `e3TopLevel()` and `e3Children()`. Keep the §2 and §8 decomposition as a declared overlay, and keep `CSRSection`'s shape and `required` flags.
- **Red:** a structure-equals-record test (`csr-e3-overlay.test.ts` then holds one copy, not two).
- **Tests:** `csr-builder-{completeness,e3-brief,e3-outline}.test.ts`, the `m5-clinical-qc` tests and the csr-job-runner tests.

**S44 — Converge the 2.4 and 2.6 composers and the 2.6/Module 4 view onto the record, read recorded studies only (Rule 2), and delete `POST /api/nonclinical-summary/document`.**
- **Change:**
  - `m26-nonclinical-summaries.ts:110-160` uses `heading()` and `notComposedGap('2.6', …)` from S32.
  - `nonclinical/m26-m4-view.ts`: `M26_SUBSECTIONS` (`:105-111`) and `M4_GROUPS` (`:115-117`) labels come from `ichFiledHeadingTitle`.
  - The `draft_nonclinical_overview_m2_4` and `draft_nonclinical_summaries_m2_6` handlers load `loadNonclinicalStudiesForProject(ctx project)` and refuse `studies` or `findings` supplied in the call, in the style of `cmc-quality-summary-tool.ts` `MODEL_SUPPLIED_CMC_REFUSAL`.
  - Delete `nonclinical-summary.routes.ts` `POST /document` (`:94+`), which has no client. `GET /` stays for `Nonclinical.tsx`.
- **Red:** a supplied `studies[]` is refused; headings equal the record.
- **Tests:** `m26-nonclinical-summaries.test.ts`, `m26-m4-view.test.ts`, `m26-introduction-not-assumed-written.test.ts`, `nonclinical-clinpharm-tools.test.ts`, `nonclinical-m24-adapter.test.ts`, `nonclinical-summary-read.test.ts`.
- **Risk:** AnA answers `needs_data` where it used to draft from model-typed studies. State this in the commit.

**S45 — Converge `POST /api/authoring/sections/:id/ai/draft` onto the record brief.**
- **Change:** prepend `renderSectionBrief(code)` when `resolveSectionBriefSource` indexes the code, append the client's requirements, and record `requirementsSource` in the draft record (`:168`). Do not touch the registrations that `ci:canvas-path` pins.
- **Red:** a 2.5.4 section's prompt carries the 2.5.4 brief (`authoringAiDraftStructured.test.ts` or `authoring-ai-draft-record.pglite.test.ts`).
- **Keep green:** `authoringAiDraftAccept`, `-NoProvider`, `ai-draft-retrieval-honesty`, `authoringSelectedSources.pglite`, `authoringAssemblyDraftSafety.pglite`, `authoringDraftTerminationAccept.pglite`, `authoring-section-gate.contract`, and OQ `tests/validation/oq/authoring/run.mjs`.

**S46 — Converge `ctd-ingestion-service.ts` `SECTION_PATTERNS` titles onto the record.**
- **Change:** the heading rows (2.3, 2.4, 2.5, 3.2.S, 3.2.P, 3.2.P.8, 4.2.1–3, 5.3.1, 5.3.3, 5.3.5) get `title: ichHeadingTitle(section)`. Keep a separate document label for ISS, ISE, CSR, cover letter, forms, patent and RMP.
- **Red:** registry equality for those rows in `ctd-registry-consistency.test.ts`.

**S47 — Converge `coauthor.ts` validate and compliance rules onto `required-sections.ts`.**
- **Change:**
  - `ECTD_MODULE_STRUCTURE` (`:671-692`) becomes `resolveRequiredSections()` for a bound program, else `FALLBACK_REQUIRED_MODULES`, with titles from `MODULE_NAMES`.
  - `m4Rules` (`:975-990`) are derived from that set, so 2.5 and 2.7 are each required, Module 3 includes 3.2.R and Module 5 uses 5.3.5.1.
  - Response shapes are unchanged.
- **Red:** rule M4-004 fails a document with 2.5 but no 2.7. Grep the coauthor server tests for `M4-00` and `ECTD_MODULE_STRUCTURE`.

### Tier D: converge the outline sources (served outlines, readiness and packages change)

**S48 — Converge the `project-bootstrap.ts` component blueprints onto record-derived section blueprints.**
- **Change:**
  - In `sectionBlueprintCatalog.SECTION_BLUEPRINTS`, add `ICH_QOS` (2.3 plus 2.3.I front matter), `ICH_M3_DS` (3.2.S), `ICH_M3_DP` (3.2.P), `ICH_NONCLIN_OVERVIEW` (2.4), `ICH_CLIN_OVERVIEW` (2.5) and `ICH_CLIN_SUMMARY` (2.7), in the `nonclinicalSummaryBlueprint.ts` form.
  - Each row carries its old titles as `formerTitles` (`document-taxonomy.ts:233`), for example "Stability", "Drug Substance", "Introduction", "General Information (Nomenclature, Structure, Properties)".
  - In the same commit, delete from `project-bootstrap.ts` `QOS_SECTIONS` (`:174-180`), `M3_DS_SECTIONS` (`:183-191`), `M3_DP_SECTIONS` (`:194-203`) and the blueprint entries at `:755-757` and `:953-956`.
  - Add `ICH_TABULATED_SUMMARIES` to `BLUEPRINTS_REQUIRING_REVIEW` (`document-template-library.ts:129`), pending FD-5.
- **Red:** `getResolvedSectionBlueprint(id)` codes equal `getRegistryDocumentTemplate(id)` codes for the six ids. Today they differ: 5 vs 23, 7 vs 23, 8 vs 30, and 6 vs 14/49/6. Extend `section-blueprint-consistency.test.ts:11` with the six ids.
- **Pins that move:** `document-template-library.test.ts`, `document-template-description.test.ts`, the cross-sector builtin digest (re-record with a delta file), `blueprint-grounded-drafting.test.ts` (keeps "Stability" via `formerTitles`), `ib-one-outline.test.ts`, `readinessEvaluator.*`, and `projectBootstrapFromRegistry.test.ts` if S26 has not landed.
- **Keep:** `CTD_SECTIONS` fallback, the non-CTD blueprints, `MASTER_FILE_SECTIONS` and `BENEFIT_RISK_SECTIONS` (its local 1–6 codes vs 2.5.6.1–5 is a follow-up). Nothing in `client/src` calls these.

**S49 — Converge `ctdBlueprintNormalizer.ts` `CTD_COMMON_MODULES` onto the record and fix the ordering with `compareSectionCode`.**
- **Change:** codes and titles come from `ctdRecordSubtree` of each module root, filtered by the depth rule that reproduces today's set. Keep `contentType`, `required` and `guidance` as an overlay, with `formerTitles`. Replace the `localeCompare` at `:231` with `compareSectionCode`.
- **Red:** US_NDA Module 3 order is S before P and Appendices last, and Module 1 order is 1.1, 1.2, …, 1.14. Both fail on HEAD, along with the 19 title disagreements.
- **Pins:** `tests/regulatory/ctd-authoring-depth.test.ts:25`, `section-blueprint-consistency.test.ts`, the builtin digest, and the filing-class pack snapshots.

**S50 — Converge `templateCatalog.ts` `CTD_TEMPLATES` to a code-free overlay over `DOCUMENT_TEMPLATES`.**
- **Change:** keep `{id, format, aiDraftable, category, description}` and drop the title and `sectionCode`. Delete the test-only `getTemplatesForType`, `getTemplateCategories`, `TEMPLATE_SETS` and `REGISTRY_TO_TEMPLATE_SETS`; their test went in S26 (otherwise drop `tests/routes/concept2cure-project-bootstrap.test.ts:150-165` here). Update the strings at `market-submission-specs.ts:236,296,346`.
- **Red:** an overlay id with no `DOCUMENT_TEMPLATES` entry fails. The 2.6 `aiDraftable` question is FD-11.

**S51 — Converge the Module 3 labels onto the record: append 3.2.A.1–3 first, then the CMC sibling copies and the Module 3 seeds. Done with the CMC lane, because these labels are agency-visible.**
- **Append to `ich-m4-headings.ts` first:** 3.2.A.1 "Facilities and Equipment", 3.2.A.2 "Adventitious Agents Safety Evaluation", 3.2.A.3 "Excipients". Basis: ICH M4Q(R1) §3.2.A; `recall`, verbatim read owed (task 17); the parallel of the record's 2.3.A.1–3 (C1).
- **Then:**
  - `module3-convergence-service.ts` `SECTION_LABELS` (`:94-123`) becomes `ichFiledHeadingTitle`, plus a carried-over display rule that adds " (Drug Substance)" or " (Drug Product)", plus `...REGIONAL_SECTION_LABELS`.
  - `module3Composer.ts:2994-3008` "3.1 Table of Contents" rows.
  - `module3-extensions.ts:185` 3.2.A.2 title.
  - `template-seeds.ts` `ctd_m32s_drug_substance` and `ctd_m32p_drug_product` come from `getDocumentTemplate('drug_substance'|'drug_product')` with a `SEED_EXTRAS` overlay. `SEEDS_VERSION` becomes 1.2.0, with a row-count assertion in the seed.
  - Check `server/config/regulatory_config.js:75`-style dead config; the barrel is already gone (S06).
- **Red:** 3.2.P.1 is "Description and Composition of the Drug Product", 3.2.S.5 is "Reference Standards or Materials", 3.1 is "Table of Contents of Module 3".
- **Pins:**
  - `place-module3-into-submission.test.ts:452` keeps "Manufacture (Drug Product)" through the display rule.
  - `composition-boundary-callers.contract.test.ts:179`, `artifact-change-invalidates-bundles.contract.test.ts:113`, `module3-routes-act-as-the-session-user.test.ts:48`, `module3-convergence-build-status.test.ts`.
  - `cmcSuiteWrites.test.tsx:365-412` keeps the disambiguated form.
- **Risk:** the next placement replaces filed leaves under new titles.

**S52 — Converge the `template-seeds.ts` 2.5 and 2.7.3 seeds and `CTD_MODULE_OUTLINE` titles onto the record.**
- **Change:** `ctd_m25_clinical_overview` from `getDocumentTemplate('clinical_overview')`; `ctd_m273_summary_clinical_efficacy` from `ctdRecordSubtree('2.7.3')`. The `CTD_MODULE_OUTLINE` 2.x–5.x rows use `ichFiledHeadingTitle`; Module 1 is kept. Guidance defaults to the brief, with an overlay for criticality, `agencyQuirks` and `maxWords`. `SEEDS_VERSION` becomes 1.3.0.
- **Red:** each CTD seed's codes and titles equal the served outline (pattern from `ib-one-outline.test.ts:61`).
- **Tests:** `template-seeds-correct-themselves.pglite.test.ts`, `m1-placement-repo-wide.test.ts:218`, `ri-template-seed-needs-curator-standing.test.ts`.
- **Keep:** the seed rows; documents carry their `template_id`.

**S53 — Converge `services/regulatory/ind-ectd-sections.ts` titles onto the record and keep it as the IND overlay.**
- **Change:** Module 2–5 titles become `ichHeadingTitle(normalizeCtdCode(code))`. Module roots become `"Module N: "+ichHeadingTitle(N)`. Module 1 uses `module1Heading('US', code)?.title`, else the `CTD_AUTHORING_GUIDANCE` title, and throws on an unheld code. Move the IND framings into `description`. Keep the codes, flags and API.
- **Red:** in `ctd-registry-consistency.test.ts`, the "deep IND eCTD map" asserts equality (30 titles fail on HEAD).
- **Pins:**
  - `ind-document-catalog.test.ts:40` ("Form FDA 1571" becomes the record's 1.1.1 title).
  - The cross-sector digest (delta file).
  - `ind-template-outlines-m2-m3`, `-m4-m5` and `m1` tests.
  - Must stay green: `fda-module1-numbering.test.ts`, `ind-required-set-agrees-with-rule-pack.test.ts`, the ind-lifecycle tests.
- **Change comment:** `ich-m4-headings.ts:133-137`.
- **Notify:** the client-journey session, because the IND library shows these titles. The API shape is unchanged.

**S54 — Converge `ind-pyramid.ts` and `ind-annual-report-pyramid.ts` bindings onto the record.**
- **Change:**
  - `ind-pyramid.ts`: add `ctdBinding(code)` beside `m1Binding` and replace the 31 literal pairs. Give each subtask an explicit `deliverable` (its `name`) so the IND library's labels are kept.
  - `ind-annual-report-pyramid.ts`: the 5.3.5, 2.7.4, 3.2.S and 3.2.P "append" bindings at `:206`, `:239` and `:349-350`, and `:548`, become 1.13 bindings with `module1Heading('US','1.13')`, naming the lifecycle components (`annual.*`).
  - Register both pyramids in `ctd-registry-consistency.test.ts` `REGISTRIES`.
- **Red:** registry equality; no annual-report binding outside 1.13.
- **Tests:** `ind-document-catalog.test.ts:28-29`, the digest, `m1-placement.consistency.test.ts:101-116`, `ind-pyramid-knowledge-tool.test.ts`, `submissionPyramidEngine.test.ts:80-85`.

**S55 — Converge `server/services/ind/ind-section-registry.ts` `IND_SECTIONS` onto the record plus the IND overlay.**
- **Change:**
  - Each row's title, `contentType`, `guidance`, `wordCountRange`, `dependencies` and `generationPrompt` come from `CTD_AUTHORING_GUIDANCE` for the 11 exact codes. A small overlay covers the 8 container codes.
  - `required` comes from `ind-ectd-sections` and the `ind:fda` pack.
  - Delete the dead hand-written `generationPrompt` strings.
  - `getSectionsForSubmissionType`'s NDA and BLA overrides read `requiredSectionsFor`.
  - `authoring-plan-generator.ts:782` seed becomes `buildSectionGenerationPrompt(code)`.
- **Red:** registry equality in `ctd-registry-consistency.test.ts:72`.
- **Tests:** `ind-generation-prompt.test.ts`, `ctd-authoring-depth.test.ts:24`, `fda-module1-numbering.test.ts:53`, `ind-section-registry-module-completion-is-required-approved.test.ts`, `chat-path-parity.test.ts:147`, `one-normalize-ctd-code.contract.test.ts`.
- **Risk:** citation coverage and readiness figures move (2.5 and 3.2.A required).

**S56 — Converge the required sets onto `required-sections.ts`: `submission-requirements.ts` drug rows and `requiredArtifactMatrix.ts` US IND 2.5.**
- **Change:**
  - The `requiredModules` and CTD-backed `requiredDocuments` for ind, nda, bla, maa and jnda come from `requiredSectionProfileFor(type)`. ANDA and CTA answer "not assessed" with the reason.
  - Keep `requiredForms`, the device rows and the API.
  - `US_IND_ARTIFACTS` `clinical_overview.required` comes from `requiredSectionsFor('IND')`.
- **Red:** the IND answer omits 2.5 and 2.7, per `IND_M2_M5` (21 CFR 312.23(a)).
- **Tests:** `submission-requirements.test.ts`, `document-template-library.test.ts:15,152`, `submission-center-tools.test.ts:416`, `required-sections-profile.test.ts`, `ectd-readiness-boundaries.test.ts`, `verify-submission-center.mjs:177-181` (shape kept), `submission-package-project-scope`, `readinessEvaluator.unmodelled-artifacts`.

**S57 — Converge `reasoning-engine/rule-data.ts` `requiredSections` onto `required-sections.ts`.**
- **Change:** read `requiredSectionProfileFor`. 510k, pma, anda and cta are unsupported, so `buildSubmissionStructure` returns `supported:false`. Titles come from the record and Module 1 from `requiredModule1CodesForRegion`. Keep `ctdDependencies`, `granularityRule` and `reviewClock` as an overlay, and bump `PROFILE_VERSION`.
- **Red:** the marketing body includes 2.2 and 5.2; a 510(k) is not given a CTD body.
- **Tests:** `reasoning-engine.test.ts:47-126`, `region-proxy-disclosure.test.ts`, `submission-plan-deterministic.test.ts`, `kb-lookup-tools.test.ts`.

### Tier E: second stores

**S58 — Converge AnA `create_project` and `list_projects` (and `ana-platform-controller.ts:378`) onto `POST`/`GET /api/c2c/projects`.**
- **Change:** extract the `POST /` body of `server/routes/c2c/projects.ts` into one function under `server/services/c2c/` (intake, offer, `regulatory_programs` INSERT, anchor, scaffold). The router and `createProject` call it. `listProjects` runs the `GET /` query. The command asks for intake fields it lacks. Keep the confirm gate and RBAC.
- **Red:** a created project appears in `GET /api/c2c/projects`.
- **Tests:** rewrite `project-tools-use-the-real-projects-schema.test.ts`. Keep green: `ana-governance-fail-closed`, `command-rbac`, `propose-only-partition`, `projects-create*`, `project-intake-*`, `projects-list.test.ts`.

**S59 — Converge `fetch_template_and_fill` onto the c2c template store and `templateRenderAdapter.ts`, then delete `templateService.ts`.**
- **Change:** keep the tool's discovery and fill modes; update its case in `new-tool-handlers.test.ts`.
- **Red:** an org template uploaded through `/api/c2c/templates` is found and filled. On HEAD it is "not found", because nothing in production writes `ectd_templates`.
- **Delete:** `server/services/templateService.ts` (its other readers went in S09 and S22). The `ectd_templates` table stays (Rule 1).

**S60 — Extend `check-unreferenced-modules.mjs` (Rule 3: extend, never add beside).**
- **Change:** add the repo-root `services` to `SCAN_ROOTS` (`:71`), and add closure reachability from `ENTRY_POINTS` plus the bootstrap mount manifests, as `check-client-reachability.mjs` does for the client.
- **Red:** a selftest with a planted two-file island (validateZip and ichSchema are gone after S06).
- **Change:** regenerate the baseline and list each new entry in the README.

---

## 2. Slices waiting on a founder decision

| Slice | Delete or change | Decision |
|---|---|---|
| GF-1 | `ai-editing.ts` `/ai/autocomplete`, then the file and its mount (`register-concept2cure-routes.ts:11,37`) | FD-1(a) |
| GF-2 | `authoring-pdf.routes.ts` and its six services: carry the M2, M4 (GLP, 4.2.x placement) and M5 (E3, 5.3.x) QC rules into `assess-dispatch-readiness.ts` and `ind-program-findings.ts`, fed from governed stores, then delete the route, the renderers and the `ind-openapi.ts:17,42,58,99` entries (`ind-openapi.test.ts:27`) | FD-2 |
| GF-3 | `regulatory-intelligence.ts` `/templates*` (`:505-630`), `template-registry.ts`, `template-validator.ts` and its test; `sql-interpolation-baseline.json:161` | FD-1(d) |
| GF-4 | `server/templates/m3/` and `authoring.router.ts` `loadTemplates` / apply-template (`:5855-6056`). Merge mode has a twin (assembly preview/commit). Gate edits: `authoring-section-revision-gate.contract.test.ts:110-114` (`>= 2`), `coauthorSnapshotSeal.test.ts:196-275`, `check-image-runtime-assets.mjs:125-128`, `path-containment-baseline.json:4-9`, `seed-authoring.mjs:58-75` | FD-1(c) (overwrite mode) |
| GF-5 | `authoring-actions.ts` preflights: repoint `mdx-command-handlers.ts:585-620` to `assess-dispatch-readiness`, carry the decision records, replace `/section-expectations` with `get_document_section_requirements` | Claim at `ui-surface-registry.ts:255` (H10) |
| GF-6 | The rest of `knowledge-base.ts` (`/save-to-connector` and its siblings) | Connector (D8) owner; outside this lens |

---

## 3. Handoff to the client-journey session

These need edits in its files. Each item is one commit together with its server half.

- **H1. AuthoringEngine** (`AuthoringEngine.tsx`).
  - First carry the per-template help line into `AuthoringTemplatePicker` from the served `description` and `limitations` (`authoringTemplatePickerAssembly.test.tsx`).
  - Then delete it, `surfaceViews.ts:282,398`, `registryModel.ts:54,718`, `registryModel.surfaceCtx.ts:56`, `deferred-capability-inventory.ts:19`, `ui-surface-registry.ui-v2.ts:234-247`, `shared/navigation/index.ts:240` and `surface-actions.ts:1012-1038`.
  - Amend the catalog rows in place with a dated header: `20260810:190,288`, `20260823:138`, `20260814m:45`.
  - Tests: `catalog-module-claims.contract.test.ts:167`, `launch-scope.test.ts:137-141`.
- **H2. BatchDraft.**
  - Carry the 11 partial functions into `AuthoringAssemblyBuild` (`FUNCTION_PARITY.md:37-50`).
  - Then delete `BatchDraft.tsx`, `batch-draft-routes.ts` (`register-regulatory-routes.ts:386-390`), `/api/claude/batch` and the accept route that writes into `coauthor_documents`.
  - Update the tests and gates listed in the verdict (`check-lineage-save-gate.mjs:221-224`, `tenant-resolvers-baseline.json:29`, and others).
- **H3. RegulatoryWorkspace** (`BiopharmaProject.tsx:580-790`).
  - Delete it with `GET /api/regulatory-workspace` and the CONTEXTUAL entry at `check-surface-discoverability.mjs:84`.
  - Move `/api/csr-workflow` and `/api/clinical-regulatory-evidence/findings|outcome` onto the `csr-workflow` row (`ui-surface-registry.ts:757`).
- **H4/H5. DossierMap and Dossier.**
  - Repoint `Nonclinical.tsx:799`, `NdaCockpit.tsx:633,684`, `AgencyMeetings.tsx:662` and the BiopharmaJourney caps to `project-home`.
  - Delete both surfaces, `/api/dossier-map` and its seed (`105-dossier-map.mjs`).
  - Repoint OQ-SUBC-10 (`tests/validation/oq/submission-center/run.mjs:268-281`) to `/api/c2c/projects/:id/dossier`.
  - The dossier-map store migration is amended in place only if the table is retired.
- **H6. FilingsCatalog.**
  - Move `FILING_LOOP*` and `FILING_WF_*` into `shared/regulatory/filing-catalog.ts`.
  - Carry search, detail and Ask AnA into the RegistryPicker wizard.
  - Then delete it and the fixture; repoint OQ-PROJ-12.
- **H7. EctdCoauthor.** Blocked on FD-8, the `coauthor_documents` to `authoring_documents` migration. Then repoint `callable-apps.ts:72`, `message-intent.ts:103`, `app-registry.ts:83` and the prompt keys.
- **H8. pdev.** Blocked: 24–25 functions per workstream still need a home (`FUNCTION_PARITY.md:384-410`), and `programType === 'IND'` vs `'ind'` is unresolved.
- **H9. `SEGMENT_MODULES` and `getSegmentModules`.** Remove them and rebase `moduleCatalogReconciliation.test.ts` onto the real presenter.
- **H10. Leftovers in their files:**
  - `ui-surface-registry.ts:450-455` (S13 comment), `:255` (GF-5), and the `/api/templates` claim (S22).
  - `anaToolFamilies` `draft_section` (`ui-v2.ts:209,226,242,292,735`) and `mdx/data/nav.ts:119` (S28).
  - `nav.ts:45` (S02).
  - `fixtures/conversation-thread-data.ts:85` and the `.adc-*` CSS (S30).
- **H11. Picker entries for the same CTD component.** Merge the IND-lane entries with the GLOBAL `registry:` and `component:` entries (`builtin-authoring-templates.ts:170`), and the duplicate "Regulatory reference" seed entries. This needs a template-id migration.
- **H12. Catalogue folds under P-47:** TemplateLibrary into admin-console (15 functions to carry), NdaCockpit into submission-center (BLA workbench, RTF, M1 store), Nonclinical admission (IA slice 9).

---

## 4. Do not delete

These are live, in the launch catalog, or have no canonical replacement yet.

**The record, the projection and the readers that already use them:**
- `ind/ctd/authoring-guidance.ts`, `ich-m4-headings.ts`, `section-brief.ts`, `requirements-resolver.ts`, `csr-e3-*.ts`, `lifecycle-document-types.ts`
- `market-specs/ctd-component-outlines.ts`, `document-template-library.ts`, `lifecycle-record-outlines.ts`, `nonclinicalSummaryBlueprint.ts`
- `global-document-registry.ts`, `required-sections.ts`, `requiredArtifactMatrix.ts` (S56 changes one flag only)
- `ectd-packager/ich-headings.ts` (the DTD element tree), `vault-filing.service.ts` `TEXT_RULES`, `cmc/knowledge/cmc-regulatory-record.json`
- The CMC lane: `cmc/*`, the `module3*` routes and `CmcModule*.tsx`

**Already done:**
- `ana-ri/document-templates.ts` (C3), `ana/ind-module-authoring.ts` (C4a), `clinical-overview-outline.ts`, `m2-summary-builders.ts` (C4b/C4c), `ind-template-outlines-m2-m3.ts` (C1)
- Already deleted: `server/api/ectd/routes.ts`, `client/src/services/templates/ctdTemplates.json`, `sql/cmc_blueprints.sql`, `fda_pyramid_templates.xml`, `server/utils/templateRegistry.js`, `server/templates/regulatory_templates.js`

**Not duplicates (they hold their own data or method):**
- `workflow-orchestration.ts`, `skills/library/*.ts`, `nda-auditor.ts`, `gap-classifier.ts`, `ich-guideline-corpus.ts`, `base-system-prompt.ts`
- `document-template-tool.ts`, `builtin-template-reference.ts`, `ind-template-reference.ts`, `AnaDocumentDraftingService.ts`, `regulatory-knowledge-tools.ts`, `draft-submission-context.ts`, `open-document.ts`
- `cmc-quality-summary-tool.ts`, `module3-command-handlers.ts`, `cmc-knowledge-tools.ts`
- The demo seeds under `scripts/seed/ga-demo.d/*`

**The one editor and the live client:**
- `DocumentWorkbench.tsx`, `RichSectionEditor.tsx`, `useFilingOutline.ts`, `AuthoringCreateExport.tsx` and `AuthoringTemplatePicker.tsx`, the `Projects.tsx` wizard and RegistryPicker, `EctdCompile.tsx` `ORCH_STEP_LABELS`, CsrWorkflow, DocJourney, Pyramid, and the IND catalog API with `IndDocumentLibrary.tsx` (coordinate).

**No canonical replacement yet (founder decisions):**
- `authoring-plan-generator.ts` and `ana-features` `/authoring-plan*`: no plan-approval lifecycle exists elsewhere, and the DOCX ledger reads it (`docx-ledger-collector.ts:524-560`). FD-3.
- `Nonclinical.tsx` (GLP registry and SEND), `NdaCockpit.tsx`, `TemplateLibrary.tsx`, `pdev/**`, `EctdCoauthor.tsx` (H7, H8, H12).
- `mission-control.ts` router: a second program store, for another lens.
- `regulatory-digital-twin.ts`: Rule 2 gives it no sessions.
- `pyramid.routes.ts`: `/api/v1` serves it in production. Report that to the D2 API-scope owner.

**Other:**
- `ui_kits/**` (design reference).
- `skills/concept2cure/ectd-module-structure/SKILL.md` (part of the connector submission, `DIRECTORY_SUBMISSION.md:70`).
- The tables Rule 1 keeps: `drafting_tasks`, `ectd_templates`, `doc_sections`, `project_sections`, `project_milestones`, `ind_applications`, `ectd.*`.

---

## 5. Founder decisions

- **FD-1.** Approve dropping these functions. None has a canonical twin, and no user reached any of them at HEAD:
  - (a) ghost-text `/ai/autocomplete`;
  - (b) the legacy create's default `customInstructions` per submission type;
  - (c) apply-template overwrite mode;
  - (d) `compareAcrossAgencies`;
  - (e) section-generation's structured ungrounded list and AI_GENERATE audit, only if the S27 check fails.

  Recorded as defects, not as decisions: the `/api/ai` keyword score and boilerplate, and the `ana-features` effort days.
- **FD-2.** Carry the M2/M4/M5 QC rules into Submission Readiness (this changes dispatch verdicts, P-33), or drop them. Also the CTD readiness PDF.
- **FD-3.** Reach or retire the authoring-plan approval lifecycle.
- **FD-4 (noted).** The `ind:fda` pack is the IND required set. 2.5 and 3.2.A flags move in S55 and S56.
- **FD-5.** `ICH_TABULATED_SUMMARIES` (BP-W1-4) stays withheld (S48).
- **FD-6.** ISS and ISE templates: platform convention, or derived from 2.7.4 and 2.7.3.
- **FD-7.** The record owner on the filed-title strip for 2.1 and 2.3, and on the verbatim M4Q titles for 2.3.S, 2.3.P and 3.2.A.1–3 (task 17).
- **FD-8.** Schedule the EctdCoauthor store migration.
- **FD-9.** The catalogue folds: Nonclinical, NdaCockpit, TemplateLibrary, pdev, the Mission Control program store, and whether to retire the regulatory digital twin.
- **FD-10.** `assemble_ectd_module_from_artifacts`: whether its source store should be `authoring_documents`.
- **FD-11.** Whether `ICH_NONCLIN_SUMMARY` being a preparation worksheet (`aiDraftable` false) is intended.
- **FD-12.** What reads `ctdOnboardingDocuments` once nothing writes it (`leaf-document-resolver.ts`, `leaf-source-resolver.ts`, `submission-service.ts`).

---

## 6. Outside this plan

- **Module 1 lens:** `ctd-module-structure.ts` `M1_*`, `regional-ctd-templates.ts` `*_TEMPLATE`, and `ctdBlueprintNormalizer` `MODULE_1_TEMPLATES`.
- `sql/advanced_analytics_schema.sql` `analytics.dim_document_section` needs its own proof.
- The `knowledge-base` remainder.
- The `enterprise` audit routes.
- `ana-features` `/authoring-plan*`.

---

## 7. Where the input verdicts conflicted, and how this plan resolves them

1. **Line numbers.** HEAD is `a9593ef98`, not `c47af6fbb`. C4c already closed the stale 2.5 tool description and the invented "2.4.4.1".
2. **Missed by the verdicts:**
   - Both red trunk gates (S01, S02).
   - `db/migrations/migrations_manifest.json` entries for 038, 043 and 100–103 (S05).
   - Validate-references does have a twin (`check_ectd_cross_references`).
   - The IND project roll-up now has a twin: `readDossier` (F23, `b660daf1e`). `ind-tools-retired.test.ts:18` predates it.
3. **misc-inline tests:** only the `start_task` describe is dropped. The session-gate test becomes a 404 tombstone. `/api/templates` is removed from the smoke and shadow lists in S22, not S09, because the server router still answers until then.
4. **The single-copy gate after `fallbackTemplates` goes:** it is pointed at the record's exports in S08, so it is never left guarding nothing. `DOCUMENT_TEMPLATES` is not guarded, because two different-shaped exports carry that name.
5. **`indCopilot` coverage:** carried over (the stricter reading), because a heading scan of free text under an undivided node has no outline twin.
6. **Partial deletions instead of whole files:** the `knowledge-base` and `enterprise` routers lose only their CTD parts, because their other functions are outside this lens or have no twin.
7. **`/api/templates` router:** deleted in S22 after S09. `TemplateService` stays until S59.
8. **`registryCoverage`:** only the comment changes, because the two `Region` types differ.
9. **`ctd-module-structure` source modules:** take `rule-data`'s map, so there is one source.
10. **Nav model files:** `registryModel.ts` and `surfaceViews.ts` are treated as client-journey territory even though they are not on the listed set, because that session is editing them.
11. **Legacy create:** gated on FD-1(b). S48 and S50 note what to change if it has not landed.