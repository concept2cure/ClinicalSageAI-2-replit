# eTMF convergence, slice E4: Store B retired, its callers converged — build plan

2026-11-10, session `…01KnUGoX3g` (the Vault parity lane). Scoped read-only at `64e4bcca0a`; nothing was edited
while it was written. Design: `docs/design/ETMF_CONVERGENCE_2026-10-30.md` (slice 4). Decisions: P-74, P-75 and
**P-124** (`docs/LAUNCH_DEFINITION_OF_DONE.md`), which settles this plan's open questions:

- **D-1** (stated statuses, "not applicable", a study's own expected set): the typed statuses retire; a record's
  state is its Vault document's lifecycle stage; **"not applicable", with a reason, is carried onto the deployed
  store before admission** (P-124 item 5).
- **D-2** (artifacts outside the catalog): not carried; the document stays in the Vault.
- **L-1**: `classify_tmf_artifact` is re-pointed (it files through the deployed store with the person's
  confirmation and reason). **L-2**: the migration is amended in place and its baseline entry kept. **L-3**: the
  pack keeps its type id; its label and scopes follow §5.3. **L-4**: `Plan: F1`,
  `Completes: server/routes/etmf.routes.ts` (or the file a step finishes).

Line numbers below are at `64e4bcca0a`; the design's own line numbers for `AnaToolExecutor.ts` and the report
provider are stale (corrected in §2). "The lead" below is the session that builds E4.

This is a **convergence and a retirement**, not a build. Nothing below adds a route file, a service file, a table,
a mount, an AnA tool name or a screen.

## 0. Findings that change the brief

1. **`etmf-logic.ts` is not wholly Store B.** `classifyArtifact`, `TMF_ZONES` and `zoneName` are the Vault's TMF
   filing classifier (`server/services/vault/vault-filing.service.ts:45,438`) and are pinned by
   `server/services/__tests__/vault-taxonomy-etmf.test.ts:42,82-83,100` and
   `server/services/vault/__tests__/vault-filing.service.test.ts:23`. Only its verdict
   (`evaluateCompleteness`, `CompletenessArtifact`, `CompletenessResult`, the unused `isPresent`, lines 126-198) is
   Store B. The file stays, trimmed. `migrations/20260823_vault_document_placement.sql:10` names "etmf-logic.ts zone
   rules"; with the file kept that comment stays true and the migration is not touched.
2. **The report seed is not `ON CONFLICT DO NOTHING`.** `migrations/20260930_report_type_registry_seed.sql` is
   generated and upserts every descriptive column (`ON CONFLICT (type_id) DO UPDATE SET …`, lines 137-150). A row is
   corrected by editing the code and regenerating; no new version row is minted (§5).
3. **The design asks two things of `20260610_etmf.sql` that one gate will not allow together**: "amended in place to
   create nothing" and "removed from the deploy-path baseline". A file that exists and is on no deploy path must be in
   the baseline (`scripts/ci/check-migration-deploy-path.mjs:53-61,128-153`). See §1.5 and R6.
4. **Two more Store B pieces the brief did not list**: the Drizzle schema `shared/schema/etmf.ts` (exported at
   `shared/schema/index.ts:536`) and the metrics module `server/services/etmf-metrics.ts` (rendered at
   `server/startup/inline-endpoints.ts:448-454`). `ci:orm-reachability` forces the schema and the migration to go in
   one commit.
5. **Three more callers**: two PGlite suites create their own `tmf_artifacts` for `search_all_documents`
   (`ana-vault-tools-project-scope.pglite.test.ts:504`, `artifact-disposition-tools.pglite.integration.test.ts:34`),
   and `seed_tmf` is the worked example in six confirm-tier suites, four of them outside `services/ana/__tests__`
   (§2.3, §4.4).
6. **A shipped defect E4 closes**: on every deploy-migrate database `tmf_artifacts` does not exist, so
   `search_all_documents` (an in-scope tool) answers `ok: false, unavailable_stores: ['tmf']` on every call, and a
   run of `etmf.completeness_pack` fails on `tmf_files` (42P01). Both are read from the code; neither was run here.

## 1. What already exists

Searches run: `etmf-service`, `etmf-logic`, `etmf-metrics`, `schema/etmf`, `routes/etmf`, `20260610_etmf`,
`tmf_files`, `tmf_artifacts`, `tmfFiles`, `tmfArtifacts`, `/api/etmf`, `etmf/files`, `completeness_pack`, the six tool
names, `computeDomainReport`, `seedArtifacts`, `etmf_files_created_total`, across `server/`, `shared/`, `client/`,
`scripts/`, `tests/`, `migrations/`, `db/`, `docs/validation`, `.github/`, `.husky/`, `.design/`; and
`git log --all --diff-filter=D` (§8).

### 1.1 Store B routes — `server/routes/etmf.ts` (177 lines), 8 routes

Mounted behind `authMiddleware` at `/api/etmf`. In the file: no role gate, no rate limit, no project check. Tenant
is the file's own `resolveOrgId` (`:40-45`, reads `tenantId ?? organizationId ?? user.organizationId ??
user.tenantId`; on `scripts/ci/tenant-resolvers-baseline.json:68`). Writes go through `governed()` (`:57-84`): `BEGIN`,
`setTenantContextTx`, the service call, `recordGovernedAction(domain 'etmf')`, `COMMIT`; reason ≥ 8 characters by a
local zod rule (`:55`). Reads use the shared `pool` (on `docs/reports/requestdb-coverage-baseline.json:96,309`).

| # | Method, path (line) | Reads / writes | Service call |
|---|---|---|---|
| 1 | `POST /files` (87) | INSERT `tmf_files`; governed-action row | `createTmfTx`; `recordTmfFileCreated` |
| 2 | `GET /files` (97) | SELECT `tmf_files` of the organization | `listTmfFiles` |
| 3 | `POST /files/:id/seed` (107) | INSERT `tmf_artifacts` placeholders; governed-action row | `seedReferenceModelTx` |
| 4 | `POST /files/:id/artifacts` (128) | INSERT `tmf_artifacts`; governed-action row | `addArtifactTx`; `recordTmfArtifact` |
| 5 | `GET /files/:id/artifacts` (140) | SELECT `tmf_artifacts` | `listArtifacts` |
| 6 | `PATCH /artifacts/:id/status` (149) | UPDATE `tmf_artifacts.status`; governed-action row | `setArtifactStatusTx` |
| 7 | `GET /files/:id/completeness` (160) | SELECT both tables | `getCompletenessInput` + `evaluateCompleteness` |
| 8 | `GET /classify?artifactName=` (171) | none (pure); no tenant read at all | `classifyArtifact` |

Production today: `/api/etmf` is claimed by the `etmf` surface (`shared/constants/ui-surface-registry.ui-v2.ts:72-87`),
which is outside `LAUNCH_APPS`, so with launch scope enforced every path answers 403 `LAUNCH_SCOPE`
(`server/middleware/moduleEntitlementGate.ts:98-136`). No client file calls any of the eight paths.

### 1.2 The mount, and which router wins

`server/bootstrap/register-inline-routes.ts:495-516`: one gateway router; Store A registered first (`:510`), Store B
second (`:511`), `app.use('/api/etmf', authMiddleware, etmfGateway)` (`:512`). A stale comment at `:772-775`.

| Store A — `server/routes/etmf.routes.ts` (8 routes, each `limiter` + `requireRole('regulatory-author')`) | Store B — `server/routes/etmf.ts` |
|---|---|
| `GET /reference-model` (90) | `POST /files`, `GET /files` |
| `POST /completeness` (101, stateless, basis `asserted_codes`) | `POST /files/:id/seed` |
| `POST /trials/:trialId/artifacts` (116) | `POST /files/:id/artifacts`, `GET /files/:id/artifacts` |
| `GET /trials/:trialId/artifacts` (136) | `GET /files/:id/completeness` |
| `GET /trials/:trialId/completeness` (147) | `PATCH /artifacts/:id/status` |
| `POST /trials/:trialId/artifacts/bulk` (202) | `GET /classify` |
| `GET /trials/:trialId/inspection-package` (259) | |
| `DELETE /artifacts/:id` (297) | |

The path sets are disjoint. The nearest pair is A's `DELETE /artifacts/:id` and B's `PATCH /artifacts/:id/status`
(different method and depth). Nothing collides today; were a path shared, Store A would win (first registered).

### 1.3 Store B service — `server/services/etmf/etmf-service.ts` (158 lines)

| Export | Callers |
|---|---|
| `EtmfError` (24) | `etmf.ts` (by `code`), `etmf-unmatched-artifact-is-unclassified.test.ts:15` |
| `createTmfTx` (31) | `etmf.ts:91`; `AnaToolExecutor.ts:14164` (`create_tmf`) |
| `ArtifactInput` (44), `addArtifactTx` (59) | `etmf.ts:134`; `AnaToolExecutor.ts:14193` (`classify_tmf_artifact`); the test above |
| `seedReferenceModelTx` (92) | `etmf.ts:113`; `AnaToolExecutor.ts:21752` (`seed_tmf`) |
| `setArtifactStatusTx` (124) | `etmf.ts:155`; `AnaToolExecutor.ts:21790` (`update_tmf_artifact_status`) |
| `listTmfFiles` (136) | `etmf.ts:100`; `AnaToolExecutor.ts:21517` (`get_tmf_view`); mocked in `etmf-error-containment.test.ts:25` |
| `listArtifacts` (141) | `etmf.ts:145`; `AnaToolExecutor.ts:21517` |
| `getCompletenessInput` (150) | `etmf.ts:166`; `AnaToolExecutor.ts:14224,21517` |

`createTmfTx` stores `study_id` → `clinical_studies(id)` with no same-organization check (`:31-37`).

### 1.4 `server/services/etmf/etmf-logic.ts` (198 lines) — split by owner

| Export | Whose | Callers |
|---|---|---|
| `TMF_ZONES` (21), `zoneName` (27) | shared classifier | `etmf-service.ts:16`; `AnaToolExecutor.ts:21518`; `vault-taxonomy-etmf.test.ts:42`; `etmf-logic.test.ts:7` |
| `Classification` (85), `classifyArtifact` (109) | shared classifier | `vault-filing.service.ts:45,438`; `etmf.ts:26,174`; `etmf-service.ts:16,65`; four test files |
| `CompletenessArtifact` (131), `CompletenessResult` (139), `evaluateCompleteness` (162) | **Store B's verdict** | `etmf.ts:167`; `AnaToolExecutor.ts:14225,21518`; `etmf-logic.test.ts:36-110` |

Its `import type { ArtifactStatus } from '../../../shared/schema/etmf'` (`:17`) is used only by the verdict.

### 1.5 The tables — `migrations/20260610_etmf.sql` (49 lines)

- `tmf_files`: `id serial PK`, `organization_id integer NOT NULL → organizations`, `study_id integer →
  clinical_studies`, `title text NOT NULL`, `tmf_model text DEFAULT 'dia_rm_v3'`, `status text CHECK
  (active|archived|locked)`, `created_by integer NOT NULL → users`, `created_at`, `updated_at`, `deleted_at`. Indexes
  `idx_tmf_files_org`, `idx_tmf_files_study`.
- `tmf_artifacts`: `id serial PK`, `organization_id integer NOT NULL → organizations`, `tmf_file_id integer NOT NULL
  → tmf_files`, `zone integer CHECK 1..11`, `section text`, `artifact_name text NOT NULL`, `expected boolean`,
  `completeness_required boolean`, `status text CHECK (expected|received|in_review|final|missing|not_applicable)`,
  `document_date date`, `created_by integer NOT NULL → users`, `created_at`, `updated_at`, `deleted_at`. Indexes
  `idx_tmf_artifacts_org`, `idx_tmf_artifacts_file`.
- The file creates no policy. Nothing else in `migrations/`, `db/migrations/` or the push surface creates either
  table: `shared/schema/etmf.ts` declares them, but `drizzle.config.ts` pushes only `shared/schema.ts`,
  `ana-intelligence.ts` and `report-os.ts`, and `shared/schema.ts` does not re-export it. Nothing references them by
  foreign key.

**Appliers.** The file is in none of `C2C_MIGRATION_FILES` (`scripts/db/migration-set.mjs`),
`AUTHORING_SUBSYSTEM_FILES`, the drizzle journal, or `install-fresh.mjs`'s named lists (0 matches each). It is
applied only by install-fresh's step-3 overlay, which reads the whole of `migrations/*.sql`
(`scripts/db/install-fresh.mjs:1098,1214`), once, on a new database. It is listed at line 61 of
`scripts/ci/migration-deploy-path-baseline.json`.

**Could a row exist in a deployed database?**
- A database that only ever had deploy-migrate: the tables do not exist. No row.
- A database created by install-fresh on or after 2026-06-10 (every new environment, CI, Codespace): the tables
  exist. Checked read-only on the local fixture `platform_ci_vault_fixture_s6v2`: both present, **0 rows each**, RLS
  enabled and forced with `tenant_isolation_policy` (from the tenant sweep), six outbound foreign keys, none inbound.
- A row needs a writer. In production with launch scope enforced the REST routes answer 403 and the six tools are
  withheld (`ana-launch-scope.inventory.json:66-80`, hiddenApp `etmf`). With launch scope off (development, a demo,
  a Codespace) both write. The demo packs write none (`scripts/demo/launch-demo/packs/*` do not name the tables).
- **Not determined:** how the production database was provisioned and whether it holds rows. Nothing here can reach
  it. One query answers it: `SELECT to_regclass('public.tmf_files'), (SELECT count(*) FROM tmf_files)`.

**What RULE 1 requires of this file.**
- No DROP, anywhere. The design leaves the tables on install-fresh databases untouched ("they hold asserted statuses
  with no documents and are not migrated into filings"), and P-74 says "the losing migration amended in place".
- Because the file is on no deploy path it never re-runs. An in-place amendment changes only what a **future
  install-fresh** creates; it registers no journal drift (the journal records set files only).
- The amendment documents itself: a dated header saying what was removed (both CREATE TABLEs and four indexes), why
  (P-74, P-75, slice E4), which change removed it, and that tables created by earlier installs are left as they are,
  hold no document, and are read by no code.
- The amended file must carry the `eCTD REGULATORY AUDIT CONTEXT` block in its first 40 lines:
  `scripts/ci/require-migration-headers.sh` checks every 2026-dated migration a change touches (`.github/workflows/
  ci.yml:82`), and this file has none today.
- The schema model goes in the same commit (`ci:orm-reachability`: a `pgTable` under `shared/schema/` must have a
  creator), and every reader must already be gone (`ci:migration-reachability`, `ci:unbacked-tables`).
- **The header must not contain the words `CREATE TABLE tmf_files` or `CREATE TABLE … tmf_artifacts`.**
  `check-orm-table-reachability.mjs:68-71` and `check-one-design-plan.mjs:181` search the raw SQL text, comments
  included, so a header that quotes the removed statement would count as a creator: the first gate would pass a
  model nothing creates, and the second would treat the table name as already existing. Name the tables in prose.
- The baseline entry **stays** if the file stays (R6).

### 1.6 Other Store B pieces

- `shared/schema/etmf.ts` (79 lines): `tmfFiles`, `tmfArtifacts`, types `TmfStatus`, `ArtifactStatus`, `TmfFile`,
  `NewTmfFile`, `TmfArtifact`, `NewTmfArtifact`. Imported only by `etmf-service.ts:18` and `etmf-logic.ts:17` (type
  `ArtifactStatus`). Exported at `shared/schema/index.ts:532-536`.
- `server/services/etmf-metrics.ts` (47 lines): three in-memory counters. Written only by `etmf.ts:92,135`; rendered
  at `server/startup/inline-endpoints.ts:448-454`. No dashboard, alert or test names the three metrics (searched the
  repository; one stale doc, `docs/research_compliance_grants_handoff.md:568`).
- `seedArtifacts`, `TmfSeedArtifact` in `server/services/etmf/tmf-completeness.ts:149-179` (Store A's file): the
  only non-test caller is `etmf-service.ts:108`.

### 1.7 Store A, as E4 finds it (the survivor; nothing to rebuild)

`server/services/etmf/tmf-artifact-persistence.ts` exports, each admitting the caller by the Vault's rule
(`requireCurrentProgramAccess` for a read, `requireCurrentVaultProgramWrite` for a write):

| Function (line) | Gives |
|---|---|
| `getTmfStudy(trialId, ctx)` (183) | the study (`TmfStudy`: `id, studyId, programId, protocolId, title, phase, indication, status`) or `STUDY_NOT_FOUND` |
| `recordTmfArtifactFiling({ trialId, artifactCode, documentRef?, reason }, ctx)` (418) | files or re-files; chained audit row in the same transaction |
| `listTmfArtifacts(trialId, ctx)` (547) | live filings, each with `document: { id, title, version, current } \| null` |
| `removeTmfArtifactFiling({ id, reason }, ctx)` (570) | marks removed, with reason; audit row |
| `readTrialTmf(trialId, ctx, scope)` (676) | `{ study, filings, completeness }` in one admitted read |
| `getTrialTmfCompleteness(trialId, ctx, scope)` (685) | `TmfCompletenessResult & { study }` |

`ctx` is `{ organizationId, userId, ipAddress?, userAgent? }`. `trialId` is `cdisc_prm_studies.study_id`.
Completeness (`tmf-completeness.ts:58-85`): `ready: true | false | null`, `basis`, `scope`, `zones[]` (`required`,
`present`, `missing`, `unverified[]`), `summary` (`zoneCount`, `zonesComplete`, `totalRequired`, `totalMissing`,
`totalUnverified`), `documentEvidence`.

**Store A has no function that lists studies.** The existing lister is
`listStudyDesigns(tenantId, { programId, limit, offset })` (`server/services/study-design/study-design-repository.ts:395`),
which `GET /api/study-design?program_id=` uses; it caps at 200 rows.

## 2. Every caller

### 2.1 Production code (11 call sites)

| # | Caller | Where |
|---|---|---|
| C1 | The 8 routes | `server/routes/etmf.ts` |
| C2 | The mount | `server/bootstrap/register-inline-routes.ts:505-513`, comments `:495-503`, `:772-775` |
| C3 | AnA `create_tmf` | handler `AnaToolExecutor.ts:14158-14184`; def `notifications-study-memory-tool-defs.ts:1477-1490` |
| C4 | AnA `classify_tmf_artifact` | handler `:14186-14218`; def `:1493-1509` (same defs file) |
| C5 | AnA `review_tmf_completeness` | handler `:14220-14241`; def `:1511-1520` |
| C6 | AnA `get_tmf_view` | handler `:21514-21548`; def `document-surface-tool-defs.ts:103-114` |
| C7 | AnA `seed_tmf` | handler `:21744-21780`; def `document-surface-tool-defs.ts:228-241` |
| C8 | AnA `update_tmf_artifact_status` | handler `:21782-21816`; def `:243-261` |
| C9 | AnA `search_all_documents`, TMF leg | SQL `:21843-21846`; store list `:21848`; message `:21860`; def text `document-surface-tool-defs.ts:266` |
| C10 | Report `etmf.completeness_pack` | provider `server/services/report-os/research-compliance-report-providers.ts:310-315` (the design says `:195-199`; that is now `computeDomainReport`'s signature); type `server/services/report-os/taxonomy.ts:363-378`; listed in `report-engine.ts:53` |
| C11 | Metrics | `server/startup/inline-endpoints.ts:448-454` |

A twelfth, **not** a Store B caller and not changed: the Vault's filing classifier
(`vault-filing.service.ts:45,438`), which keeps its import of `etmf-logic.ts`.

### 2.2 Registries and metadata the tools sit in

| File | Entries |
|---|---|
| `server/services/ana/AnaToolDefinitions.ts` | imports `:101,106,107,249-251`; `ALL_ANA_TOOLS_RAW` `:1874,1886,1887,2197-2199`. **Held by RIM** (COORDINATION row 107) |
| `server/services/ana/tool-authorization.register.json` | `classify_tmf_artifact` 2154 (conditional), `create_tmf` 2730 (confirm), `get_tmf_view` 4231 (read, `present`), `review_tmf_completeness` 6278 (read), `seed_tmf` 6903 (confirm, `present`), `update_tmf_artifact_status` 7440 (conditional); `search_all_documents` 6580 (read) |
| `server/services/ana/tool-authorization.ts` | `CONDITIONAL_RULES.classify_tmf_artifact` 111-114, `.update_tmf_artifact_status` 183-186 (`status === 'final'` → refuse) |
| `server/services/ana/stated-reason-input.ts` | `REASON_REQUIRED_TOOLS`: 129, 159, 184, 202 |
| `server/services/ana/ana-launch-scope.inventory.json` | hiddenApp group `etmf`, lines 66-80 (the six, plus three inspection tools that are not Store B) |
| `docs/ana-capability-manifest.json` | generated (`npm run manifest:ana`); six entries. No gate or test reads it |
| `docs/work-orders/README.md:192` | prose naming `seed_tmf` |

No tool allow-list, surface-context registry, eval set or snapshot names any of the six (the names occur in the
files of §2.2 and §2.3 only, and under `docs/`). `tool-selection.ts`, `step-presentation.ts` and
`shared/ana/step-verbs.ts` do not name them. No test pins an exact tool count (`tool-authorization.test.ts:39-41`
asserts more than 700).

### 2.3 Tests

| File | What it holds | E4 |
|---|---|---|
| `server/routes/__tests__/etmf-error-containment.test.ts` | `GET /api/etmf/files` 500 containment (2 cases) | delete with the route |
| `server/services/etmf/__tests__/etmf-logic.test.ts` | zones 1, classifier 4, `evaluateCompleteness` 8 | keep 5, delete 8 |
| `server/services/etmf/__tests__/etmf-unmatched-artifact-is-unclassified.test.ts` | classifier 2, `addArtifactTx` 3 | keep 2, delete 3 |
| `server/services/etmf/__tests__/etmf-classifier-classifies-its-own-catalog.test.ts` | classifier | keep |
| `server/services/__tests__/vault-taxonomy-etmf.test.ts` | imports `TMF_ZONES`, `zoneName` (42), scans `etmf-logic.ts` (100); `seedArtifacts` block 218-249 (4 cases) | keep; delete the `seedArtifacts` block and its import (43) |
| `server/services/vault/__tests__/vault-filing.service.test.ts` | classifier through Vault filing | keep |
| `server/services/ana/__tests__/etmf-tools.test.ts` | three tools registered; three input guards | rewrite for the tools that remain |
| `server/services/ana/__tests__/classify-tmf-artifact-tool-def-says-an-unmatched-name-needs-a-zone.test.ts` | the def's wording (4 cases) | rewrite or delete with L-1 |
| `server/services/ana/__tests__/ana-launch-scope.test.ts:95-97` | `create_tmf` as the hidden `etmf` example | name `get_tmf_view` instead |
| `server/services/ana/__tests__/tool-authorization.test.ts:84,106-107` | `seed_tmf` confirm; `update_tmf_artifact_status` conditional | remove three rows |
| `server/services/ana/__tests__/direct-mutator-confirm-gate.test.ts:11,44,60,74,77` | `seed_tmf` one of five | four tools; the unreadable-call case names another |
| `server/services/ana/__tests__/tool-plan-labels.test.ts:56` | `get_tmf_view` label | unchanged |
| `server/services/ana-ri/__tests__/confirm-tier.test.ts:105-106` | `seed_tmf` as the reason-tier example | another reason-tier tool (`update_vault_document`) |
| `server/routes/ana-ri/__tests__/governedActionConfirmTier.test.ts:256,357` | same | same |
| `server/routes/ana-ri/__tests__/governedActionApprovalTenantPinned.test.ts:194,235-240` | registers a stub handler named `seed_tmf` | same |
| `client/src/concept2cure/components/ana/__tests__/governed-action-signoff.test.tsx:229,252,268` | `command: 'seed_tmf'` in a fixture | same (a string in a fixture; it does not import the tool) |
| `server/services/ana/__tests__/ana-vault-tools-project-scope.pglite.test.ts:502-506` | creates `tmf_artifacts` for the search | fixture replaced by Store A rows |
| `server/services/ana/__tests__/artifact-disposition-tools.pglite.integration.test.ts:34-35` | creates `tmf_artifacts` | same |
| `server/services/report-os/scheduling/__tests__/worker-register-engine.test.ts:121-131` | `etmf.completeness_pack` in a four-type `it.each` asserting `computeDomainRun(typeId, 3, 'project', '11')` | check after step 1 (the call may gain an options argument) |
| `segment.test.ts:84-90`, `suggestion-service.test.ts:19,46`, `insights-canvas-catalog.test.ts:130` | the type id | unchanged while the id is kept |

### 2.4 Report packs, demo seeds, validation, CI, docs

- **Client.** `client/src/concept2cure/v2/surfaces/Insights.tsx:405` (the CRO "Sponsor oversight pack") and `:514`
  (a search boost) name the type id only. Fixtures `_insights-library-fixture.tsx:35` and
  `_insights-catalog-fixture.ts:40` carry an older label ("eTMF Completeness & Gap Pack"). None needs an edit while
  the id is kept. All held by Reporting analytics.
- **Demo.** `scripts/demo/launch-demo/packs/lumen.mjs:366` runs the pack at project scope through
  `POST /api/report-os/runs` and requires 201; `:400` describes a bundle as holding "eTMF completeness"; `:404`
  schedules it monthly. No edit needed if the run still answers 201. `lumen-qms-content.mjs` only mentions TMF in QMS
  prose.
- **Validation.** `docs/validation`, `tests/validation`, `scripts/validation`: one hit, `URS-002-VAULT.md:34`, a
  sentence about a "CTD/DHF/TMF-structured data room". Nothing names Store B, the six tools or the pack.
- **Baselines** listing Store B files: `scripts/ci/migration-deploy-path-baseline.json:61`,
  `scripts/ci/tenant-resolvers-baseline.json:68`, `docs/reports/requestdb-coverage-baseline.json:96,309`. Also
  `docs/reports/purge-coverage-baseline.json:668-669` (the two tables) and `docs/reports/repo-health-scan-latest.json:
  413-420` (machine-written by `repo-health-baseline-refresh.yml`).
- **Comments that name Store B** in files E4 keeps: `shared/schema/tmf-artifacts.ts:20-21`,
  `shared/schema/index.ts:459-460`, `shared/constants/domain/tmf-reference-model.ts:12,182`,
  `server/services/etmf/tmf-inspection-package.ts:13` (says `tmf_artifacts`; it means `tmf_artifact_filings`),
  `server/services/etmf/tmf-completeness.ts:163`, `shared/ana/dossier-consistency.ts:22`,
  `server/services/research-security-metrics.ts:4`, `server/services/effort-metrics.ts:4`. And two in migrations on
  the set, **left as they are** (an edit is journal drift for a comment): `migrations/20260615_tmf_artifact_filings.sql:3`,
  `migrations/20260823_vault_document_placement.sql:10`.
- **Docs not read by a gate**, left stale or corrected at the lead's choice: `docs/research_compliance_grants_handoff.md:547-582`,
  `docs/vault/VAULT_CROSS_CLIENT_TAXONOMY_2026-07-03.md:41-49`, `docs/handoff/HANDOFF_BIOTECH.md:1191`,
  `docs/audit-2026-07/**`, `docs/evaluation-2026-09/evidence/03-applier-reachability.json:1583`.

## 3. Per caller, a decision

### 3.1 The eight Store B endpoints

"Proof" is the test that shows the replacement answers. Reachable in the running app is a separate matter: the one
committed client (`Etmf.tsx`) types a trial id and sends no reason, so it gets 404 and 400 against Store A
(E2/E3 README, "Not done here"); the Vault's Trial master file section (`VaultTrialMasterFile.tsx`) is uncommitted
work in this tree; and production refuses `/api/etmf` until E6.

| Store B | Decision | Replacement, by path | Proof | What Store A cannot answer |
|---|---|---|---|---|
| `POST /files` | retire | None needed: a TMF belongs to a study and exists with it. The study is made in Protocol Development, `POST /api/study-design` (`server/routes/study-design.ts`) | `tests/db/etmf-study-binding.dbtest.ts` | A TMF with a title of its own; a TMF with no study; a TMF for a `clinical_studies` device trial (decided: P-75 item 1) |
| `GET /files` | retire | `GET /api/study-design?program_id=` (`study-design.ts:565`) lists a project's studies; each one's TMF is `/api/etmf/trials/:studyId/…` | `etmf-artifacts.routes.test.ts` | One list of every TMF in the organization |
| `POST /files/:id/seed` | retire | Nothing is stored. The expected set is the reference model: `GET /api/etmf/reference-model` (`etmf.routes.ts:90`) and `zones[].required` / `.missing` of the completeness read | `etmf.routes.test.ts`, `tmf-completeness.test.ts` | **A study's own expected set** (D-1) |
| `POST /files/:id/artifacts` | retire onto Store A | `POST /api/etmf/trials/:studyId/artifacts` (`:116`) and `/bulk` (`:202`) → `recordTmfArtifactFiling` | `tests/db/etmf-governed-filing.dbtest.ts` | **An artifact outside the 41 catalog codes**, a caller-chosen zone, a status, a document date (D-1, D-2) |
| `GET /files/:id/artifacts` | retire onto Store A | `GET /api/etmf/trials/:studyId/artifacts` (`:136`) → `listTmfArtifacts` | `tmf-study-binding.test.ts`, the dbtest | Rows for expected artifacts not yet filed (they are `zones[].missing`) |
| `PATCH /artifacts/:id/status` | **founder decision D-1** | **Nothing.** The only change of state in Store A is removal, `DELETE /api/etmf/artifacts/:id` (`:297`) | — | received, in review, final, missing, **not applicable** |
| `GET /files/:id/completeness` | retire onto Store A | `GET /api/etmf/trials/:studyId/completeness?scope=` (`:147`) → `getTrialTmfCompleteness` | `tmf-readiness-counts-only-verified-documents.test.ts` | A percentage, and the `minor_gaps` / `at_risk` bands (Store A gives `ready` and counts) |
| `GET /classify` | retire | No REST replacement and no caller. The classifier stays and is reached through Vault filing: `classifyForFiling` (`vault-filing.service.ts:268,438`) on the Vault's ingest path (`server/routes/c2c/project-vault.ts`) | `vault-filing.service.test.ts`, `etmf-classifier-classifies-its-own-catalog.test.ts` | A preview of a name's zone on request |

### 3.2 The other callers

| Caller | Decision |
|---|---|
| C2 mount | Re-point: mount `etmf.routes` alone at the same `/api/etmf` (no mount added; `ci:one-design-plan` compares mount paths). Delete both stale comments |
| C3 `create_tmf` | Retire. Replacement: the study (as `POST /files`), read with `get_tmf_view` |
| C4 `classify_tmf_artifact` | **Lead decision L-1**: re-point to `recordTmfArtifactFiling` (recommended), or retire onto the person's filing route |
| C5 `review_tmf_completeness` | Retire onto `get_tmf_view`, which already returns the same completeness (the precedent is `assess_benefit_risk` → `assess_benefit_risk_balance`, `assess-benefit-risk-retired-onto-the-balance.test.ts`) |
| C6 `get_tmf_view` | Re-point to `readTrialTmf` + `listTmfArtifacts`; name kept |
| C7 `seed_tmf` | Retire. Replacement: the reference model in the completeness read, shown by `get_tmf_view` |
| C8 `update_tmf_artifact_status` | Retire. **Nothing replaces it: D-1** |
| C9 search leg | Re-point to Store A filings of the projects in scope (§4.3) |
| C10 report | Re-point to Store A, actor-bound (§5) |
| C11 metrics | Retire with the routes. Nothing else writes the counters. No replacement: Store A has no counters; its record is the audit trail (`TMF_ARTIFACT_FILED`, `TMF_ARTIFACT_REMOVED`, `EXPORT_GENERATED`) |
| `shared/schema/etmf.ts` | Delete, with its export, in the migration's commit |
| `evaluateCompleteness` and its two types | Delete. Replacement: `assessTmfCompleteness` (`tmf-completeness.ts:109`) |
| `seedArtifacts`, `TmfSeedArtifact` | Delete (dead once the service goes) |
| Baselines | Shrink by the entries of the deleted route file (§6) |

### 3.3 Needs the founder — nothing in Store A or elsewhere delivers these

Facts first: none of these was reachable in production (403 `LAUNCH_SCOPE`; tools withheld), and none could work on
a deploy-migrate database. They worked with launch scope off on an install-fresh database. P-74 decides the
convergence and P-75 the study; neither names what is lost. The working agreement makes a capability with no
replacement the founder's call.

- **D-1. Stated status and "not applicable".** Store B let a person mark an artifact received, in review, final,
  missing or not applicable, and set per artifact whether it is expected and whether it counts. Store A has one
  fact, a filing against a document, and a fixed required set (26 essential, or all 41). So a study for which an
  essential artifact does not apply **can never read ready**, and there is no QC state. The design lists "a TMF QC
  workflow" under "What does not exist" and does not mention not-applicable.
  *Recommendation:* retire with Store B, and record it in one line, for example: "Store B's stated statuses, the
  not-applicable mark and a study's own expected set are retired with it; a study's readiness is its verified
  documents against the reference model. A not-applicable declaration with a reason is a later slice on Store A."
  It will come back at E6: OQ-009 cannot show a study reading ready unless all 26 are filed.
- **D-2. Artifacts outside the catalog.** Store B accepted any artifact name in any zone 1-11. Store A refuses a
  code that is not one of the 41 (`UNKNOWN_ARTIFACT`, `tmf-artifact-persistence.ts:419-422`).
  *Recommendation:* retire; a document outside the catalog is filed in the Vault and not in the TMF index. Record it
  with D-1.

Already decided, listed so nobody re-asks: a TMF for a device or CRO trial (P-75 item 1); Store B's rows are not
migrated (the design's Target shape; P-74 "converged").

### 3.4 For the lead (not the founder)

- **L-1. `classify_tmf_artifact`: re-point or retire.** §4.2.
- **L-2. `20260610_etmf.sql`: amend and keep the baseline entry, or delete the file.** R6.
- **L-3. The pack's label and scopes.** §5.3.
- **L-4. The package trailer.** E2 and E3 went as `Plan: F1`, `Completes: server/routes/etmf.routes.ts`. E4 fits the
  same (`Completes: server/services/etmf/tmf-artifact-persistence.ts` or `etmf.routes.ts`).

## 4. The AnA tools

All six sit in hiddenApp `etmf`: withheld in production until the surface joins the launch catalog (E6), offered
when launch scope is off. **E4 must land before E6**: on admission the six would be offered, and on a deploy-migrate
database each answers `relation "tmf_files" does not exist`.

### 4.1 As they are

| Tool | Description (short) | Input | Returns today | Register |
|---|---|---|---|---|
| `create_tmf` | "Open a Trial Master File (eTMF) for a study … Returns the TMF id" | `title`* string, `study_id` number ("clinical_studies.id"), `reason` | `{ ok, id, message }` | confirm; reason-required |
| `classify_tmf_artifact` | "File a TMF artifact into a DIA TMF Reference Model zone … an unmatched name is refused" | `tmf_file_id`* number, `artifact_name`* string, `zone` number, `status` enum, `document_date`, `reason` | `{ ok, artifactId, zone, classification, message }` | conditional (`status === 'final'` → refuse, else confirm); reason-required |
| `review_tmf_completeness` | "Run the deterministic TMF completeness gap-check (read-only): completeness %, …, inspection-readiness verdict" | `tmf_file_id`* number | `{ ok, completenessPct, verdict, gapCount, gaps[≤20], message }` | read |
| `get_tmf_view` | "View a Trial Master File's index and completeness … Omit tmf_file_id to list the organization's TMF files" | `tmf_file_id` number | list: `{ ok, count, tmf_files, message }`; view: `{ ok, tmf_file_id, zones, completeness }` | read; `present`: open "the Trial Master File", source project |
| `seed_tmf` | "Populate a Trial Master File with the expected-document skeleton" | `tmf_file_id`* number, `scope` essential\|all, `reason`* | `{ ok, tmf_file_id, seeded, skipped, …gov, message }` | confirm; reason-required; `present`: create "the Trial Master File structure" |
| `update_tmf_artifact_status` | "Move a TMF artifact through its lifecycle" | `tmf_artifact_id`* number, `status`* enum, `document_date`, `reason`* | `{ ok, tmf_artifact_id, status, …gov }` | conditional (`final` → refuse); reason-required |

### 4.2 After E4: two names kept, four retired, none added

RULE 6 and `ci:one-design-plan` (`check-one-design-plan.mjs:137-144,170-171`) refuse a name new to
`ana-launch-scope.inventory.json`. Removing names and keeping names both pass.

**`get_tmf_view` — re-point (name kept).**
- Input: `study_id` string (the study's own id, as `GET /api/study-design` lists it) replaces `tmf_file_id` number;
  optional `scope` `essential | all`.
- With `study_id`: `readTrialTmf(study_id, { organizationId, userId }, scope)` and `listTmfArtifacts` for each
  filing's document. Return the study, `ready` as Store A gives it (true, false, or null said as "not determined"),
  `basis`, the zones with required, present, missing and unverified, the summary counts, and the filings.
- Without: the studies of the projects the person can open (`programReadScope('get_tmf_view', ctx)`, as its
  neighbours `list_governed_documents` and `search_all_documents` do, `AnaToolExecutor.ts:21398,21824`), each through
  `listStudyDesigns(organizationId, { programId })`.
- Needs `ctx.userId` now (Store A admits a person). Absent: refuse with a code, as `resolveProjectReadScope` does
  (`PROJECT_ACTOR_REQUIRED`).
- Honest states: a study with no filing says so and is not ready; no study in the open project says the project has
  no protocol-design study and so no TMF; `STUDY_NOT_FOUND` and `STUDY_ACCESS_UNAVAILABLE` are passed on as errors
  with their codes, never as an empty list. No percentage is computed in the handler.
- Register entry: `writes` stays `none`; `present` stays. Description rewritten; it must stop naming `create_tmf`
  and `classify_tmf_artifact` unless L-1 keeps the latter.

**`review_tmf_completeness` — retire onto `get_tmf_view`.** Same engine, a subset of the same answer. The
retirement test also checks that a request it was selected for still selects `get_tmf_view`
(`selectToolsForTurn`), as the benefit-risk precedent does.

**`create_tmf`, `seed_tmf`, `update_tmf_artifact_status` — retire.** §3.2, D-1.

**`classify_tmf_artifact` — L-1.**
- *(a) Re-point, recommended.* Its stated purpose is "File a TMF artifact"; Store A's filing act is
  `recordTmfArtifactFiling`. Mapping: `tmf_file_id` → `study_id` (string); `artifact_name` →
  `classifyArtifact(name).code`, and when `code` is null (a keyword-only match, or unclassified) the tool refuses
  and names the catalog, because Store A files catalog codes only; new `document_id` → `documentRef: vault://<id>`
  (absent means a filing with no document, which the answer must say does not count toward readiness); `reason` →
  `reason`; `zone`, `status`, `document_date` are dropped. The conditional rule at `tool-authorization.ts:111-114`
  goes (there is no `final` to refuse) and the register entry becomes `confirm`, with `writes` naming
  `tmf_artifact_filings` and the chained audit row. Store A's own transaction still requires the Vault write role
  and the reason. Cost: four of six inputs change under an unchanged name, and the name says "classify".
- *(b) Retire.* Replacement: a person files at `POST /api/etmf/trials/:studyId/artifacts`, in the Vault's Trial
  master file section. AnA can then read a TMF and not file to it; bringing that back later is a new tool name, which
  needs the founder (`approvedAdditions`).

### 4.3 `search_all_documents`, the TMF leg

Today: `tmf_artifacts` of the whole organization by `artifact_name ILIKE`, not held to the person's projects (the
other two legs are, since F1-C). Hits are told to open with `get_tmf_view`.

Re-point: Store A's live filings of studies in `scope.programIds`, matched on the catalog artifact's name or code
(from `TMF_REFERENCE_MODEL`) and on the filed document's title. Each hit: `store: 'tmf'`, the filing id, `study_id`,
`artifact_code`, the catalog name, the zone, and the document's id and title when it has one. The hint stays "open
with get_tmf_view", now with a `study_id`.

Two ways, for the builder to choose with the lead:
- *Existing functions only:* for each study of the scope (`listStudyDesigns` per program), `listTmfArtifacts`, and
  filter in the handler. No new function; several queries per study.
- *One read in Store A's file:* an exported function in `tmf-artifact-persistence.ts` that takes the organization,
  the admitted program ids and the matching codes and returns the filings in one statement. A function added to an
  existing file is not a new file or service; it is still new code, so say it in the commit.

Either way: write the SQL literally with bind parameters (`AnaToolExecutor.ts` is frozen at 10 in
`scripts/ci/sql-interpolation-baseline.json:62`), and a failed TMF read stays in `unavailable_stores`, as today.

### 4.4 Gates and suites that watch the tools

| Gate or suite | What it requires after E4 |
|---|---|
| `tool-authorization.test.ts` "the register covers the registry exactly" (25-37) | Each retired handler's register entry removed in the same commit; each kept one present |
| same, "every conditional entry has its rule, and every rule an entry" (43-46) | `CONDITIONAL_RULES` and the register's `conditional` entries change together |
| `ana-launch-scope.test.ts` "classifies every enabled tool" (34) and "names only real tools" (44) | Retired names removed from the inventory; kept names stay under hiddenApp `etmf` until E6 moves them |
| `ci:one-design-plan` | No name added to the inventory; no new route or service file; trailers present |
| `ci:step-presentation` | Nothing now (the tools are hidden). At E6 every tool moved to `inScope` needs a `present` block; `get_tmf_view` has one, `classify_tmf_artifact` has none |
| `governed-reason-not-invented.test.ts:598-600` | It reads the handlers: every handler that carries a reason is in `REASON_REQUIRED_TOOLS`, and every entry is carried by a handler. So retired names leave the set (`stated-reason-input.ts`) in the same commit, and with L-1(a) the re-pointed handler must still take its reason through `gatedReason(input)` |
| The six suites that use `seed_tmf` as their example (§2.3) | Another reason-tier tool as the example, in the commit that retires `seed_tmf` |
| `docs/ana-capability-manifest.json` | No gate. Regenerate with `npm run manifest:ana`, or leave and say so |

## 5. The report pack `etmf.completeness_pack`

### 5.1 Where it is computed, and what it reads

`computeDomainReport` (`research-compliance-report-providers.ts:195`), case at `:310-315`: the count of `tmf_files`,
the count of `tmf_artifacts` by `status`, and `finalPct` (rows stated `final` over all rows). Organization-wide, no
actor, no project. Reached from `computeDomainRun` (`report-engine.ts:157`) through `computeRunForType`
(`compute-run.ts:195`) for `POST /api/report-os/runs` (`server/routes/report-os.ts:1760-1767`) and the schedule
worker (`scheduling/generate-deliver.ts:32-36`), and from the canvas's live render
(`canvas/render-report.ts:61`). Drawn by `domainSection` (`render/render.ts:300-342`): numbers as metrics, records
as count tables, arrays of rows as tables. It is not one of the briefing's extractors
(`research-compliance/compliance-briefing.ts`).

### 5.2 Re-pointing it

A study's TMF is a project's, and Store A admits a person. So the pack becomes actor-bound, the way
`lifecycle.obligation_calendar` and `compliance.audit_assurance_pack` already are.

- **Context.** Add the type to the two lists that pass `recordContext`: `server/routes/report-os.ts:1767` and
  `scheduling/generate-deliver.ts:34` (a scheduled run acts as its creator). With no actor, refuse as the calendar
  does (`lifecycle-calendar.ts:86`), so the live render says the report is not computed rather than drawing zeros;
  `compute-run.ts:197` maps the calendar's error by name and needs the same for this one.
- **Studies.** Account scope: every project the actor can open (`getCurrentAccessibleProgramScope`,
  `verifiedProgramAnchors`, as `computeQualityEvidenceReport` does at `:81-82`). Project scope: that project's
  anchor (`qualityAnchors`, `:43-52`). Then `listStudyDesigns` per program. If a program returns the 200-row cap,
  refuse rather than report a truncated set.
- **Each study.** `readTrialTmf(studyId, { organizationId, userId }, 'essential')`.
- **Summary** (deterministic; the renderer draws it as it stands): studies; studies with a filing; filings; filings
  by document evidence (`verified`, `no_document`, `unresolved`, `unverifiable`); essential artifacts required,
  present and missing; studies ready, not ready and not determined; and one row per study (study id, title, ready as
  yes, no or not determined, required, present, missing, filed without a verified document).
- **Not carried over.** `finalPct` and `byStatus` describe statuses a person stated. Store A has none. Do not reuse
  either key for a Store A number.
- **Empty and failed.** No study: provider `missing`, blocker "This project has no protocol-design study, so it has
  no Trial Master File." Studies and no filing: `missing`, "No Trial Master File filing is recorded." A refused or
  failed read is an error, not an empty register. `accessProjectIds` lists the projects read.
- **Scope label.** `computedScopeFor` (`report-engine.ts:86-89`) names the two types that compute a project, and
  `render.ts:305` says, for a project, "this project's recorded awards, proposals and their associated records". A
  project-narrowed TMF pack needs both to know it. The smaller choice is to keep `computedScope: 'organization'`
  over the admitted projects, as the calendar does, and say so in the section.
- **Fallback if the lead wants E4 smaller:** remove the id from `DOMAIN_REPORT_TYPE_IDS` (`report-engine.ts:53`).
  The run is then refused `REPORT_TYPE_NOT_COMPUTED`, an existing honest state. It breaks
  `lumen.mjs:366` (the demo requires 201) and the CRO pack in `Insights.tsx:405`, so it is not recommended.

### 5.3 Correcting the seed row in place

The row (`migrations/20260930_report_type_registry_seed.sql:75`) says label "eTMF Artifact Lifecycle Summary",
`data_dependencies ["tmf_files","tmf_artifacts"]`, scopes `["study","submission","project","account"]`.

The repository's own rule for this file, in its header (lines 21-36): it is **generated**; it upserts every
descriptive column on every deploy and never touches `enabled`; "Changing a type: edit it in code and regenerate
this file; the drift test fails until they match. Regenerating in place registers as `drift` in
c2c_migration_journal, which is expected for this file." So:

1. Edit the entry in `server/services/report-os/taxonomy.ts:363-378`: `dataDependencies` to what is read
   (`tmf_artifact_filings`, `cdisc_prm_studies`, the Vault's documents); the comment's "ICH E6 §8; C2C-08" to E6(R3)
   Appendix C; the label and `allowedScopes` per L-3.
2. `npx tsx scripts/db/generate-report-type-registry-seed.ts`; commit both files.
3. `server/services/report-os/__tests__/report-type-registry-seed.test.ts` (byte-identical to the generator) and
   `tests/db/report-os-registry-seed.dbtest.ts` (applies it).

An already-deployed row is updated by the next deploy. The corollary about minting a new version row applies to
`DO NOTHING` seeds and does not apply here. The type id stays: `report_runs` and `report_subscriptions` reference it
`ON DELETE RESTRICT`. Precedent beyond the header: the row's label already differs from the older one the client
fixtures still carry, so it has been relabelled in place before; the commit could not be found (shallow clone).

**L-3.** Label: "Artifact Lifecycle" names Store B's content. Recommend a label that names filings and readiness.
Scopes: `study` is not runnable anywhere (`report-engine.ts:102-104`) and `submission` would compute something wider
than its name; recommend `["project","account"]`. Tell Reporting analytics before either (their tests hold their
own fixtures and do not pin the label).

## 6. Ordered build steps

Each is one commit, red first on the unchanged source. `Plan:` and `Completes:` per L-4. Do not run `tsc` or the
dev server while another change is being pushed; the building session runs them.

**Step 0 — say it first.** A row in `.design/claude-convergence/COORDINATION.md` naming the files of steps 1-3
(§7), and D-1/D-2 put to the founder. No source change.

**Step 1 — the report pack reads Store A.**
- Change: `research-compliance-report-providers.ts` (the case), `taxonomy.ts` (the entry), the regenerated seed,
  `server/routes/report-os.ts:1767`, `scheduling/generate-deliver.ts:34`, `compute-run.ts:197`; `report-engine.ts`
  and `render/render.ts` only if the pack computes a project.
- Tests: a new PGlite or `*.dbtest.ts` suite beside `lifecycle-calendar.pglite.test.ts` /
  `quality-evidence-report-scope.pglite.test.ts`: a study with filings (verified, no document, unresolved) gives the
  counts; another project's study is not counted for a person who cannot open it; no actor is refused; no study and
  no filing each give their own blocker; a failed read is an error. Red on HEAD: the provider reads `tmf_files`.
  Then `report-type-registry-seed.test.ts`, `report-os-registry-seed.dbtest.ts`, `worker-register-engine.test.ts`,
  `report-engine.test.ts`, `report-os-run-engine.test.ts`.
- Gates: `ci:sql-interpolation` (no new interpolation), the header check on the regenerated seed (R7).

**Step 2 — AnA reads a study's TMF from Store A.**
- Change: `AnaToolExecutor.ts` (`get_tmf_view` handler; delete the `review_tmf_completeness` handler; the TMF leg
  and its two messages), `document-surface-tool-defs.ts` (`GET_TMF_VIEW`, the search description),
  `notifications-study-memory-tool-defs.ts` (delete `REVIEW_TMF_COMPLETENESS`), `AnaToolDefinitions.ts:251,2199`,
  the register and the inventory (one name out).
- Tests: `etmf-tools.test.ts` rewritten; a retirement test for `review_tmf_completeness` on the model of
  `assess-benefit-risk-retired-onto-the-balance.test.ts`; the two PGlite search suites given Store A rows, with a
  case that a filing of a project the person cannot open is not a hit, and a case that a failed TMF read is named in
  `unavailable_stores`. Red on HEAD: `get_tmf_view` asks for `tmf_file_id` and reads `tmf_files`.
- Gates: `tool-authorization.test.ts`, `ana-launch-scope.test.ts`, `ci:sql-interpolation`, ESLint ratchet.

**Step 3 — AnA's TMF writes.**
- Change: delete the handlers and definitions of `create_tmf`, `seed_tmf`, `update_tmf_artifact_status`; L-1 for
  `classify_tmf_artifact`; `AnaToolDefinitions.ts:106-107,249-250,1886-1887,2197-2198`; the register; the inventory;
  `stated-reason-input.ts`; `tool-authorization.ts:111-114,183-186`.
- Tests: a retirement test (no handler, not offered, not in the register, not in the inventory, the replacement
  answers); the six suites that use `seed_tmf` as their example (`confirm-tier`, `governedActionConfirmTier`,
  `governedActionApprovalTenantPinned`, `governed-action-signoff`, `direct-mutator-confirm-gate`,
  `tool-authorization`) moved off it; `ana-launch-scope.test.ts:97` names `get_tmf_view`. With L-1(a): a `*.dbtest.ts` that AnA's
  confirmed filing writes the filing and its audit row in one transaction, refuses without a reason, without the
  Vault write role, and for a name that identifies no catalog artifact.
- After this step nothing in `server/services/ana/` imports `etmf-service` or `evaluateCompleteness`.

**Step 4 — Store B's routes and metrics go.**
- Delete: `server/routes/etmf.ts`, `server/services/etmf-metrics.ts`,
  `server/routes/__tests__/etmf-error-containment.test.ts`.
- Change: `register-inline-routes.ts:495-516,772-775`; `inline-endpoints.ts:448-454`; the two comments in
  `research-security-metrics.ts:4` and `effort-metrics.ts:4`.
- Tests: a route test that each of the eight Store B paths answers 404 on the mounted router and each Store A path
  still answers (red on HEAD: `GET /api/etmf/files` answers).
- Baselines to shrink (the lead, one entry each, by hand, never regenerated): `tenant-resolvers-baseline.json:68`;
  `requestdb-coverage-baseline.json:96,309`. Neither gate fails on a stale entry; both say so.

**Step 5 — Store B's service, verdict, schema and migration go.**
- Delete: `server/services/etmf/etmf-service.ts`, `shared/schema/etmf.ts`.
- Change: `etmf-logic.ts` (lines 126-198 and the type import out; header rewritten to say it is the classifier);
  `tmf-completeness.ts:149-179` out; `shared/schema/index.ts:532-536` out; `migrations/20260610_etmf.sql` amended
  (§1.5); the comments of §2.4.
- Tests: `etmf-logic.test.ts` and `etmf-unmatched-artifact-is-unclassified.test.ts` trimmed;
  `vault-taxonomy-etmf.test.ts:43,218-249` out; a retirement test that the two files are gone, that
  `20260610_etmf.sql` creates no table, and that no file under `server/`, `shared/` or `client/src` names `tmf_files`
  or `tmf_artifacts` outside a comment. Red on HEAD.
- Verify the gate by failing it: with the migration amended and the schema kept, `npm run ci:orm-reachability`
  must fail; with a reader left, `ci:migration-reachability` must fail. Save both outputs.
- Gates: `ci:migration-deploy-path` (unchanged, R6), `ci:migration-drop-safety`, `ci:install-fresh-overlay-deps`,
  `ci:orm-reachability`, `ci:migration-reachability`, `ci:unbacked-tables`, `ci:column-reachability`,
  `ci:untracked-imports`, the header check. `docs/reports/purge-coverage-baseline.json` is **not** edited: its
  writer keeps tables absent from the database it ran on, and the tables still exist on older installs.
- If a provisioned database is at hand: install-fresh on a blank database, then
  `SELECT to_regclass('public.tmf_files')` is null and the install reports complete.

Order that cannot change: 1-3 before 5 (the service's callers), 4 before 5, and all of E4 before E6.

## 7. Who holds what — coordination before a step

Row numbers here are line numbers of `.design/claude-convergence/COORDINATION.md`. Row 102 gives this lane `server/routes/etmf.ts`,
`server/services/etmf/**` and the eTMF migrations, and `docs/work-orders/README.md:37` adds "the AnA TMF tools in
`AnaToolExecutor.ts`". Everything else below is another lane's or unheld.

| File | Holder | Step | Needed |
|---|---|---|---|
| `server/services/ana/AnaToolDefinitions.ts` | **RIM**, row 107 (F1, P-93, from 2026-11-09). Another RIM row records P-93 as landed with its running-app check owed, and row 107 is still in the table, so treat it as held | 2, 3 | A handoff, or RIM makes the removal (five or six imports and array entries). Not needed only if no tool is retired |
| `server/services/ana/AnaToolExecutor.ts` and the definition, register, inventory and reason files | No row today. The P-104 note (line 659) says the runtime lane owns the executor; its holds were released on 2026-11-08 (line 569). This lane edited it under a row on 2026-11-05 | 2, 3 | A row first: the six handlers and the search leg by line |
| `server/routes/ana-ri/__tests__/**`, `server/services/ana-ri/__tests__/confirm-tier.test.ts`, `client/src/concept2cure/components/ana/__tests__/governed-action-signoff.test.tsx` | Unheld; the runtime lane's suites | 3 | Name them in the same row |
| `server/services/report-os/**`, `server/routes/report-os.ts` | Unheld (Reporting analytics released on 2026-11-08; the CSR lane holds `report-os/device-portfolio.ts` only) | 1 | A note to Reporting analytics (`011HLkY…`): the pack's content, label and scopes change |
| `surfaces/Insights.tsx` and its tests | Reporting analytics, row 103 | none | Not edited while the type id is kept |
| `docs/validation/**`, `scripts/validation/**`, `tests/validation/**` | Validation for GA, row 72 | none | Not touched by E4. For E6: the design's "URS-008, OQ-009" is taken; URS-008 is now Reporting's (row 72) |
| `scripts/demo/launch-demo/packs/lumen.mjs` | Not determined | none | Not edited; re-run its report step after step 1 |
| The three baselines | The building session lowers them, by hand | 4 | Say the entries in the report |

## 8. Deleted before

`git log --all --diff-filter=D --oneline -- 'server/**/etmf*' 'server/**/tmf*' 'client/**/*Etmf*' 'client/**/*Tmf*'`
returns nothing. Widened to `'*etmf*' '*Etmf*' '*tmf*' '*Tmf*'` it returns one deletion:
`client/src/concept2cure/v2/fixtures/etmf.ts`, by E1 (`3fa2b6febc`, 2026-10-30), a client copy of the reference model
with a dead client `assessTmfCompleteness`. Removed on purpose; do not bring a client copy of the catalog back.

The clone is shallow (`git rev-parse --is-shallow-repository` is true), so this is not the whole history. The
design read earlier history through the GitHub API and found Store A created on 2026-06-15 (`5f696de4e`) "to avoid
collision with the richer etmf.ts registry". Nothing found here says a Store B piece was deleted and rebuilt.

## 9. Risks and open questions

- **R1. The search leg shows TMF filings before the eTMF is admitted.** `search_all_documents` is in scope in
  production; the re-pointed leg would return Store A filings while `/api/etmf` still answers 403.
  *Recommend:* run the leg only when `etmf` is a launch surface or launch scope is off (the check
  `ana-launch-scope.ts` already makes), or land step 2 with E6.
- **R2. Reports with no actor.** The live render (`canvas/render-report.ts:61`) passes none, so the pack reads "not
  computed" there after step 1. A schedule acts as its creator; if that person loses a project, the next run counts
  fewer studies. *Recommend:* accept both and say so in the section.
- **R3. A study can never read ready when an essential artifact does not apply** (D-1). *Recommend:* the founder's
  one-line record before step 3, and a not-applicable declaration as a later slice.
- **R4. Many queries.** The report and the list mode of `get_tmf_view` read each study in turn. *Recommend:* accept
  for E4; refuse at the 200-study cap rather than truncate.
- **R5. If L-1(a): the filing's own audit row does not say it came through AnA.** `recordTmfArtifactFiling` records
  the person, the reason and the document. The confirmation route writes its own sign-off row for the tool.
  *Recommend:* accept; do not widen Store A's input for it in E4.
- **R6. Design against gate.** With the migration amended and kept, its entry in the deploy-path baseline (line 61) must stay,
  so the design's "removed from the deploy-path baseline" cannot be done. Deleting the file removes the entry (the
  gate then requires it) but is not what P-74 says and loses the in-tree note about tables on older installs.
  *Recommend:* amend in place, keep the entry, and state the difference from the design in the evidence README.
- **R7. The header check and the generated seed.** `require-migration-headers.sh` (CI lint job; base `HEAD~1` on a
  push) checks every changed 2026-dated migration. The regenerated seed has no audit header and its generator writes
  none, so a push whose last commit regenerates it fails that job. How earlier regenerations passed was not
  determined. *Recommend:* never hand-edit the generated file; tell the lead before step 1; do not make step 1 the
  last commit of a push, or have the generator emit the header as a separate decision.
- **R8. Rows on older installs are left behind.** Tables stay with RLS and their rows; nothing reads them; a tenant
  purge still does not reach them (they remain in the purge baseline). The local fixture holds none; production was
  not checked. *Recommend:* run the one query of §1.5 on production before step 5 and file the answer.
- **R9. `etmf-logic.ts` keeps a name that no longer fits** and still returns `section`, which only Store B stored.
  *Recommend:* leave both; a rename would touch the Vault's imports and a migration comment for no behaviour.
- **R10. `docs/ana-capability-manifest.json`** goes stale. *Recommend:* regenerate in step 3's commit.
- **R11. The working tree is moving.** Another agent has uncommitted client changes (`Etmf.tsx`, `Vault.tsx`,
  `VaultTrialMasterFile.tsx`, three deleted eTMF client tests). E4 edits no client source and one client test
  fixture string.
- **Not determined:** production's provisioning path and Store B row counts; the commit that last relabelled the
  report type; history before the shallow boundary; who holds the Lumen demo pack.

## 10. Counts

Store B: 8 routes, 7 service functions (plus one error class and one interface), 1 verdict function, 2 tables, 4
indexes, 1 schema file, 1 metrics module. Store A: 8 routes, kept.
Callers: 11 production call sites (§2.1); 7 registry and metadata files (§2.2); 22 test files named (§2.3: 15
change, 1 to re-check, 6 unchanged); 3 baselines list Store B files in 4 entries, of which 3 entries in 2 baselines
shrink and the deploy-path entry stays under the recommended L-2.
AnA: 6 tools and 1 search leg. Recommended: 2 names kept and re-pointed (`get_tmf_view`, `classify_tmf_artifact`
under L-1), 4 retired, 0 added.
Founder: D-1, D-2. Lead: L-1 to L-4.
