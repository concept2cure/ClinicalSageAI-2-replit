# Document-Assembly Build Plans — Five Implementation-Ready Plans

**Date:** 2026-04-27
**Branch:** concept2cure-v2
**Companion to:**
- `docs/reports/DOCUMENT_ASSEMBLY_ECTD_BIOTECH_AUDIT_2026-04-27.md` (gap audit)
- `docs/reports/PROJECTS_CONTEXT_ISOLATION_AUDIT_2026-04-22.md` (tenant-isolation rules every plan honors)

**Constraints (from `CLAUDE.md`) every plan honors:**
- Org + project dual-scoping on every query
- AI gateway only (`server/services/ai-gateway/`) — no direct OpenAI/Anthropic
- All mutations auditable (21 CFR Part 11) via append-only events
- `apiRequest()`, `sendSuccess()`/`sendError()` envelopes, Drizzle ORM (no raw SQL)
- Reuse existing infrastructure (auth, AI gateway, memory, kernel, RIM)
- Conventional commits

---

## Plan 1 — eCTD Validator Hardening (FDA ESG / DTD Conformance)

### Scope
**In:** DTD validation against `ich-ectd-3-2.dtd`; per-leaf `study-id` tagging; sequence-number gap detection; MD5 checksum enforcement; lifecycle-op rules (`new`/`append`/`replace`/`delete`); regional rule packs (FDA ESG, EMA CESP, PMDA); single `validateEctdPackage()` returning structured findings; ESG preflight before transmission.
**Out:** Python ectd4_compiler bridge; PDF/A-1b conversion; PDF accessibility; SFTP transmission to ESG.

### New files
- `server/services/ectd/dtd-validator.ts` — wraps `libxmljs2`/`node-libxml` to validate `index.xml`, `index-md5.txt`, regional XML against the DTD.
- `server/services/ectd/sequence-validator.ts` — reads prior sequences for an `applicationNumber`, detects 4-digit gaps, validates lifecycle-op references resolve to a prior leaf.
- `server/services/ectd/checksum-validator.ts` — every leaf's declared MD5 matches actual ZIP-entry bytes; verifies `index-md5.txt`.
- `server/services/ectd/study-id-tagger.ts` — reads `studyId` from M5 leaf source artifacts and writes `<study-tag>` per ICH M8.
- `server/services/ectd/regional/{fda-esg,ema-cesp,pmda-gateway}.ts` — region rule packs.
- `server/services/ectd/dtd/ich-ectd-3-2.dtd` — vendored DTD.
- `server/services/ectd/validation-report.ts` — composes structured findings, reuses `ValidationFinding` from `ectd4-validator.ts:32`.

### Existing files to modify
- `server/services/ectdExportService.ts:679` (`validateEctdPackage`) — call new `runFullValidation(zip, options)`. Keep `{valid, errors, warnings}` for compat; extend with `findings[]`, `score`.
- `server/services/ectdExportService.ts:763` (`validateXmlWellFormedness`) — keep as fast-path fallback under feature flag.
- `server/services/ectd/ectd4-validator.ts:217` — fix the placeholder `submissionType === 'IND' ? IND_REQUIRED_SECTIONS : IND_REQUIRED_SECTIONS` ternary; add `NDA_REQUIRED_SECTIONS`, `BLA_REQUIRED_SECTIONS`.
- `server/routes/ectd-export.ts:199` — extend `/api/ectd/export/:submissionId/validate` with `?region=FDA|EMA|PMDA` and `?strict=true`; return `findings[]` envelope.

### Schema deltas
New table `ectd_validation_runs` (`id, organization_id, project_id, submission_id, sequence_number, region, ran_at, ran_by, valid, score, findings jsonb, dtd_used, package_md5, duration_ms`).
Add to `ectd_granules` (currently `shared/schema.ts:7751`): `prior_sequence_id` FK self, `lifecycle_operation` enum, `study_id`, `md5_checksum NOT NULL`, `dtd_version`.
**Migration:** `migrations/0018_ectd_validation_hardening.sql` (compound `(org, project)` indexes; partial index on `valid=false`).

### Route surface
- `POST /api/ectd/validate/:submissionId` — body `{region, strict, dtdVersion}` → `ValidationResult`.
- `GET /api/ectd/validate/:submissionId/history` — last N runs.
- `POST /api/ectd/validate/preflight` — accepts in-memory `EctdLeaf[]`; pre-ZIP gate for orchestrator.

### Service sequencing
`validateEctdPackage()` → `dtd-validator.validateBackbone()` → `sequence-validator.validateAgainstHistory()` → `checksum-validator.verifyAllLeaves()` → `study-id-tagger.verifyTags()` → `regional/{region}.applyRules()` → `validation-report.compose()` → persist `ectd_validation_runs` → return.

### Dependencies
None upstream. Plan 5 calls Plan 1 as the final gate.

### Acceptance criteria
- ZIP missing `m1/us/us-regional.xml` → finding `{severity:'error', code:'MISSING_REGIONAL_FILE', rule:'FDA-ESG-3.3.2'}`.
- Sequence `0003` declares `operation=replace` against a non-existent prior leaf → `{code:'INVALID_LIFECYCLE_REPLACE_TARGET'}`, `valid=false`.
- Leaf MD5 mismatch with `index-md5.txt` → `{code:'CHECKSUM_MISMATCH'}`.
- DTD violation (e.g., element out of order) → `{code:'DTD_SCHEMA_VIOLATION', xpath:...}`.
- Persisted `ectd_validation_runs` row has `findings` jsonb and matching `package_md5`.

### Effort
**3.0 person-weeks** (1.5 services / 0.75 region packs / 0.75 tests + DTD fixtures).

### Risks
- `libxmljs2` needs native compile; if Replit lacks `libxml2`, fall back to `xmldom` + manual schema or shell out to `xmllint`.
- ICH DTD vendoring policy; PMDA uses a JP-patched DTD — document.
- Sequence history requires Plan 5's `priorSequenceId` modeling.

---

## Plan 2 — Module 3 Narrative Composer

### Scope
**In:** AI-gateway-grounded narrative builders for 3.2.S.1–7 and 3.2.P.1–8; new 3.2.A.1/A.2/A.3 and 3.2.R.* appendices; cross-reference injection ("see Section 3.2.S.7 for stability"); paragraph-level provenance back to `cmc_source_objects.id`.
**Out:** New CMC ingestion (covered by `module3-convergence-service.ts:97`); contradiction resolution (`cmc_contradictions` exists); QbD/CQA modeling.

### New files
- `server/services/cmc/module3-narrative-builder.ts` — orchestrator: per `MODULE3_SECTION_RULES` (`module3Composer.ts:53`), retrieves matched sources, builds grounded prompt, calls AI gateway with `taskType:'document_drafting'`, validates, returns `{narrative, citations[], lineage[]}`.
- `server/services/cmc/module3-prompts.ts` — per-subsection system prompts with explicit ICH M4Q cross-reference rules.
- `server/services/cmc/module3-cross-ref-injector.ts` — post-pass injecting standardized "see Section X" links per policy.
- `server/services/cmc/module3-narrative-validator.ts` — fail-closed if output contains values absent from `sourcePayload`.
- `server/services/cmc/module3-3-2-A-builder.ts`, `module3-3-2-R-builder.ts` — appendix handlers absent from `MODULE3_SECTION_RULES:53-74`.

### Existing files to modify
- `server/services/module3Composer.ts:116` (`SECTION_GENERATORS`) — add `3.2.A.1/A.2/A.3`, `3.2.R.*`; add `narrativeMode: 'template' | 'ai-grounded'` switch on `composeModule3FromCanonicalSources` (line 693).
- `server/services/module3Composer.ts:53` (`MODULE3_SECTION_RULES`) — append A and R rules with `requiredSourceTypes`.
- `server/services/module3-convergence-service.ts:97` (`getModule3BuildStatus`) — surface narrative-build telemetry.
- `server/services/cmc-module3-compiler.ts` — add `compileWithNarrative(orgId, projectId, sectionKey)` writing to `cmc_module3_sections.deterministic_json` + new `narrative_text`.

### Schema deltas
Add to `cmc_module3_sections`: `narrative_text`, `narrative_model`, `narrative_token_cost`, `narrative_generated_at`, `narrative_lineage jsonb`, `narrative_validation jsonb`.
**Migration:** `migrations/0019_module3_narrative.sql`.

### Route surface
- `POST /api/cmc/module3/sections/:sectionKey/narrate` — `{projectId, mode}`.
- `POST /api/cmc/module3/narrate-all` — batch over a project.
- `GET /api/cmc/module3/sections/:sectionKey/narrative` — fetch + lineage.
- `POST /api/cmc/module3/sections/:sectionKey/regenerate` — invalidate stale narrative.

### Service sequencing
`composeSection(orgId, projectId, sectionKey)` → query `cmc_source_objects` (org+project) → `module3-prompts.buildPrompt()` → `aiGateway.complete(...{taskType:'document_drafting', callerModule:'module3-narrative'})` → `module3-narrative-validator.validate()` (fail-closed) → write to `cmc_module3_sections` with lineage → cross-ref injector after batch → emit `concept2cureProvenanceEvents`.

### Dependencies
None upstream. Plan 3 (M2.3.S) reads Plan 2 narratives. Plan 5 blocks M2.3.S until M3.2 is `approval_state >= 'approved'`.

### Acceptance criteria
- Project with `drug_substance` + `manufacturing_process` + `process_validation` sources → `POST .../3.2.S.2/narrate?mode=ai` returns narrative containing manufacturer name from `sourcePayload`; `narrative_lineage` lists all three source IDs with hashes-at-compile.
- Source object's `source_hash` changes → impacted section's `cmc_module3_sections.stale=true` with `staleReason`.
- Validator detects number absent from any source payload → `narrative_validation.findings[].code='HALLUCINATED_VALUE'`; section not committed.
- Two completed sections (3.2.S.4, 3.2.S.7) → cross-ref injector inserts standardized "see Section 3.2.S.7" link in 3.2.S.4.
- All AI calls go through `getGateway()` (`server/services/ai-gateway/index.ts:12`) with `callerModule` set.

### Effort
**3.5 person-weeks** (2.0 builder + prompts / 0.5 cross-ref / 0.5 A+R appendices / 0.5 validator + tests).

### Risks
- AI cost: 15 subsections × full project ~30k–60k tokens per regenerate. Cache by `source_hash`; only re-run impacted sections.
- Validator false positives on legitimate computed values; ship with override flag for human-approved.
- Cross-ref policy needs regulatory-writing sign-off (ICH M4Q has soft conventions).

---

## Plan 3 — M2 Summary Builders (2.3.S, 2.4.S, 2.7.S)

### Scope
**In:** Three services composing 2.3 Quality Overall Summary (from M3.2 narratives), 2.4 Nonclinical Overview (from M4 study reports), 2.7 Clinical Summary (from CSR §11–12 / Plan 4). Each respects upstream lock state.
**Out:** 2.3.A regional summaries (Module 1); 2.5 Clinical Overview (separate); 2.6 Nonclinical Written/Tabulated (defer to phase 2).

### New files
- `server/services/m2/m2-3-quality-summary-builder.ts` — reads approved `cmc_module3_sections.narrative_text` (org+project), abstracts into M2.3 hierarchy, generates ~40-page summary via AI gateway.
- `server/services/m2/m2-4-nonclinical-overview-builder.ts` — reads `concept2cureArtifacts` with `ctd_section LIKE '4.2.%'`; composes pharmacology/PK/toxicology overview.
- `server/services/m2/m2-7-clinical-summary-builder.ts` — reads CSR §11.* / §12.* (Plan 4); composes 2.7.1 Biopharmaceutic, 2.7.2 Clinical Pharmacology, 2.7.3 Efficacy, 2.7.4 Safety.
- `server/services/m2/m2-dependency-resolver.ts` — `canBuild(sectionCode, projectId, orgId) → {allowed, blockedBy[]}`. Reused by Plan 5.
- `server/services/m2/m2-prompts.ts` — system prompts anchored to ICH M4 §2.3/2.4/2.7.
- `server/services/m2/m2-summary-validator.ts` — every quantitative claim maps back to a source narrative; fail-closed.

### Existing files to modify
- `server/services/regulatory/submissionPackageBuilder.ts:113` — extend section-blueprint mapping so M2.3.S/2.4.S/2.7.S statuses reflect builder output (not just `projectSections`).
- `server/services/ectdExportService.ts:476` — when looking up M2 leaf content, prefer M2 builder output before falling back to `concept2cureArtifacts` → granule metadata → placeholder.

### Schema deltas
- `m2_summaries` (`id, organization_id, project_id, section_code, narrative_text, source_section_codes text[], source_artifact_ids int[], content_hash, version, approval_state, model, token_cost, generated_at, generated_by, locked_at, locked_by`); unique `(org, project, section_code, version)`.
- `m2_summary_versions` (append-only, mirrors `concept2cureArtifactVersions:5315`).
**Migration:** `migrations/0020_m2_summary_builders.sql`.

### Route surface
- `POST /api/m2/summaries/:sectionCode/generate` — body `{projectId}`; 409 if upstream not ready.
- `GET /api/m2/summaries/:sectionCode` — most recent + lineage.
- `POST /api/m2/summaries/:sectionCode/lock` — locks version; emits provenance event.
- `GET /api/m2/summaries/dependencies/:projectId` — dependency graph.

### Service sequencing
`build(projectId, orgId)` → `m2-dependency-resolver.canBuild(...)` (fail if upstream not approved) → fetch approved `cmc_module3_sections` (org+project) → `m2-prompts.buildQOSPrompt()` → `aiGateway.complete(...{taskType:'document_drafting'})` → `m2-summary-validator.validate()` → upsert `m2_summaries` + version row + provenance event. Same pattern for 2.4 and 2.7.

### Dependencies
- M2.3.S → **Plan 2** (M3 narratives `approval_state >= 'approved'`).
- M2.7.S → **Plan 4** (CSR §11/§12 must exist).
- M2.4.S → only `concept2cureArtifacts`; can ship first.
- Plan 5 consumes `m2-dependency-resolver`.

### Acceptance criteria
- Project with `3.2.S.4 approval_state='draft'` → `POST .../2.3.S/generate` returns 409 `{blockedBy:['3.2.S.4']}`.
- All M3.2 approved → build succeeds; `m2_summaries.source_section_codes` lists every consumed M3 subsection.
- CSR §11/§12 `drafted` → 2.7.S build cites primary efficacy results matching CSR §11.4 verbatim placeholders.
- Lock emits `concept2cureProvenanceEvents` with `event_type='m2_summary_locked'` and source hashes.
- All AI calls through gateway with `callerModule:'m2-builder/...'`.

### Effort
**3.0 person-weeks** (1.0 / 0.75 / 1.0 / 0.25).

### Risks
- M2.3.S can be 100+ pages; token budget exceeds single call. Hierarchical compose (subsection → roll-up).
- M2.4.S source data: confirm `concept2cureArtifacts` w/ `ctd_section='4.2.*'` is the contract or whether `m4_study_reports` is needed (open question).

---

## Plan 4 — CSR Builder Completion (ICH E3)

### Scope
**In:** Complete `launchCSRBuild()` (`csr-builder.ts:152`) execution path; add §11 (efficacy) and §12 (safety) data-driven generators with tabulation; CDISC ODM ingestion or vault integration; cross-link CSR §11–12 → M2.7.S placeholders.
**Out:** SDTM/ADaM standardization (assume curated upstream); statistical re-execution (tabulate provided values); audit-ready PDF rendering.

### New files
- `server/services/csr/csr-job-runner.ts` — async state machine over new `csr_build_jobs`; replaces synchronous flow at `csr-builder.ts:152-183`. States: `queued/loading_data/drafting/tabulating/cross_linking/complete/failed`.
- `server/services/csr/csr-data-loader.ts` — pulls CDISC ODM XML, else `study_data` JSON, else `concept2cureArtifacts` w/ `ctd_section LIKE '5.3.%'`.
- `server/services/csr/csr-section-11-builder.ts` — efficacy: ITT/mITT/PP populations, primary/secondary endpoint tables, subgroup analyses; returns `{narrative, tables[]}`.
- `server/services/csr/csr-section-12-builder.ts` — safety: extent of exposure, AE incidence by SOC/PT, deaths/SAEs, lab shifts, vitals.
- `server/services/csr/csr-tabulator.ts` — generic table builder.
- `server/services/csr/csr-narrative-generator.ts` — wraps existing AI logic at `csr-builder.ts:230-275` through the AI gateway (replacing the legacy `unified-ai-client` shim).
- `server/services/csr/csr-m2-7-cross-link.ts` — emits structured cross-refs from CSR → M2.7.S placeholders.

### Existing files to modify
- `server/services/csr-builder.ts:14-19` — replace dynamic `unified-ai-client` import with direct `getGateway()` per CLAUDE.md.
- `server/services/csr-builder.ts:152` (`launchCSRBuild`) — change from synchronous `await generateCSRSections` to enqueued job returning `jobId` immediately; persist progress to `csr_build_jobs` and stream updates.
- `server/services/csr-builder.ts:189` (`generateCSRSections`) — split per-section AI into new §11/§12 builders; keep template fallback for other sections.
- `server/services/csr-builder.ts:325-355` (raw SQL in `compareWithExistingCSRs`) — port to Drizzle.
- `server/services/foresight-csr-integration.ts` — wire CSR job completion to write outputs into `concept2cureArtifacts` with `ctd_section='5.3.5'`.

### Schema deltas
- `csr_build_jobs` (`id, organization_id, project_id, study_id, status, progress, started_at, completed_at, error, sections_to_generate text[], study_info_snapshot jsonb`).
- `csr_section_outputs` (`id, organization_id, project_id, job_id, section_number, content, content_hash, ai_generated bool, model, token_cost, lineage jsonb`).
- `csr_efficacy_tables`, `csr_safety_tables` — structured jsonb so M2.7.S can re-read.
**Migration:** `migrations/0021_csr_builder_completion.sql`. Indexes on `(org, project, status)`.

### Route surface
- `POST /api/csr/jobs` — body `CSRBuildRequest` (defined `csr-builder.ts:113`); returns `{jobId}`.
- `GET /api/csr/jobs/:jobId` — status + progress.
- `GET /api/csr/jobs/:jobId/sections/:sectionNumber` — output.
- `POST /api/csr/jobs/:jobId/sections/:sectionNumber/regenerate` — re-run one section.
- `POST /api/csr/jobs/:jobId/lock` — copy outputs to `concept2cureArtifacts`; lock for M2.7.S.

### Service sequencing
`csr-job-runner.run(jobId)`: `csr-data-loader.load(study)` → for sections 1–10, 13: `csr-narrative-generator.draft()` → `csr-section-11-builder.build(data)` → `csr-section-12-builder.build(data)` → `csr-tabulator` builds required tables → `csr-m2-7-cross-link.emitPlaceholders()` → write `csr_section_outputs`; on lock copy to `concept2cureArtifacts`.

### Dependencies
None upstream. Plan 3 M2.7.S depends on Plan 4 outputs locked; Plan 5 orchestrates.

### Acceptance criteria
- `CSRBuildRequest` with `studyDataPath` to CDISC ODM → `POST /api/csr/jobs` inserts `csr_build_jobs status='queued'` and returns `jobId` within 200ms (sync compose gone).
- Study with 120 subjects, 47 unique AE preferred terms → §12.2 generates `csr_safety_tables` with exactly 47 PT rows aggregated by SOC.
- §11.4 efficacy locked output in `concept2cureArtifacts` has `ctd_section='5.3.5'` and `content_hash` Plan 1 validator can verify.
- All AI invocations report `callerModule:'csr-builder/...'`; no direct Anthropic SDK use remains in `csr-builder.ts`.
- §12.3 SAE narratives reference subject ID + SOC from input dataset (no hallucination).

### Effort
**4.5 person-weeks** (largest — 1.5 §11 / 1.5 §12 / 1.0 job runner + loader / 0.5 cross-link + tests).

### Risks
- CDISC ODM parser dependency: `cdisc-odm-js` or roll our own. Confirm vendor.
- Statistical computation policy: re-compute p-values or trust upstream stats? Plan assumes trust; document.
- Existing `csr-foresight-orchestrator.ts` overlap — absorb or compose? (open question)

---

## Plan 5 — Submission-Package Orchestrator

### Scope
**In:** Single orchestrator resolving the dependency DAG (M3.2 → M2.3.S; M4 → M2.4.S; CSR §11/§12 → M2.7.S; everything → eCTD ZIP → validator); per-step progress; retry/backoff/resume; cascade-mark `stale` on upstream `content_hash` change; per-submission audit log; bind final eCTD leaves to `concept2cure_artifacts.id` (closes audit gap D.3).
**Out:** UI; the validator (Plan 1); section builders (Plans 2/3/4); ESG transmission.

### New files
- `server/services/submissions/submission-package-orchestrator.ts` — `runSubmissionAssembly(submissionId, orgId, options)`.
- `server/services/submissions/dependency-graph.ts` — DAG from project's submission type (IND/NDA/BLA); reuses `m2-dependency-resolver` from Plan 3.
- `server/services/submissions/step-runner.ts` — per-step executor with retry, exponential backoff, idempotency keys.
- `server/services/submissions/change-impact-analyzer.ts` — when artifact `content_hash` changes, walks DAG forward marking `stale`.
- `server/services/submissions/leaf-binder.ts` — at ZIP-gen time binds every emitted leaf to source `concept2cureArtifacts.id`; persists `submission_leaf_bindings` (closes D.3).
- `server/services/submissions/submission-audit-log.ts` — append-only writer to `submission_audit_events`.
- `server/services/submissions/orchestrator-metrics.ts` — duration / success rate / token spend per submission.

### Existing files to modify
- `server/services/ectdExportService.ts:333` (`generateEctdPackage`) — accept pre-resolved `assembledSections` from orchestrator instead of re-querying; orchestrator becomes single owner of assembly state.
- `server/services/ectdExportService.ts:476-493` — prefer orchestrator-provided binding before artifact-lookup fallback.
- `server/services/ectd-submission-agent.ts:69-424` — existing draft → assembling → validated → submitted FSM becomes a *consumer*; remove duplicate sequencing, delegate to `step-runner`.
- `server/routes/ectd-export.ts:69` — hand `POST /api/ectd/export/:submissionId` to orchestrator runtime.
- `shared/schema.ts:5267` (`concept2cureArtifacts`) — add soft-link `submission_leaf_path` (or model as separate `submission_leaf_bindings` table — see schema).

### Schema deltas
- `submission_assemblies` (`id, organization_id, project_id, submission_id, sequence_number, status (queued/running/blocked/complete/failed), started_at, completed_at, dag_snapshot jsonb, error jsonb`).
- `submission_assembly_steps` (`id, assembly_id, node_code, depends_on text[], status, started_at, completed_at, attempts, last_error, output_artifact_id`).
- `submission_leaf_bindings` (`id, organization_id, submission_id, sequence_number, leaf_path, artifact_id FK concept2cureArtifacts.id, content_hash, bound_at`) — **closes lineage gap**.
- `submission_audit_events` (`id, organization_id, submission_id, event_type (assembly_started/step_complete/step_failed/leaf_bound/zip_built/validated/...), event_payload jsonb, content_hash, actor_user_id, ip_address, created_at`).
- `submission_change_impact_log` — cascade of stale-marks on upstream hash flip.
**Migration:** `migrations/0022_submission_orchestrator.sql`. Compound `(org, submission)` indexes everywhere.

### Route surface
- `POST /api/submissions/:submissionId/assemble` — `{region, sequenceNumber, submissionType, force}` → `{assemblyId}`.
- `GET /api/submissions/:submissionId/assemblies/:assemblyId` — status + per-step progress.
- `POST /api/submissions/:submissionId/assemblies/:assemblyId/cancel`.
- `POST /api/submissions/:submissionId/assemblies/:assemblyId/resume` — from last good step.
- `GET /api/submissions/:submissionId/assemblies/:assemblyId/audit` — full audit trail.
- `GET /api/submissions/:submissionId/leaf-bindings` — what artifact backs each leaf in most-recent ZIP (the lineage answer).

### Service sequencing
`runSubmissionAssembly()`: `dependency-graph.build(submissionType)` (topo-ordered DAG) → for each node `step-runner.execute(node)`:
- `3.2.S.*`/`3.2.P.*` → **Plan 2** narrative builder
- `2.3.S` → **Plan 3** quality summary (after gate)
- `5.3.5` → **Plan 4** CSR job runner; await
- `2.7.S` → **Plan 3** clinical summary (after CSR lock)

Once leaves produced → `ectdExportService.generateEctdPackage(assembledSections)` (pre-assembled content) → `leaf-binder.bindAll(zip, artifacts)` → **Plan 1** `validateEctdPackage` with full DTD/ESG. On any failure: `change-impact-analyzer.markDownstreamStale()`. Every transition writes `submission_audit_events`.

Background change-watcher: subscribes to `concept2cureArtifacts` updates; when `content_hash` flips, finds open assemblies that consumed it and marks downstream stale.

### Dependencies
**Depends on Plans 1, 2, 3, 4** — orchestrator is the integrator. Ships last (or against stub interfaces and integrates as each lands).

### Acceptance criteria
- Fresh project with M3 sources but no narratives → `POST /api/submissions/:id/assemble` generates M3 narratives → M2.3.S → assembles → validates; one `submission_audit_events` row per state transition; returns `assemblyId` immediately (async).
- `3.2.S.4` `content_hash` flips mid-run → change-watcher marks `submission_assembly_steps` for `2.3.S` and downstream nodes `stale` with `change_impact` reference.
- After successful run, `submission_leaf_bindings` has one row per ZIP leaf → `concept2cureArtifacts.id` (closes D.1/D.3).
- AI gateway 5xx → step retried up to N with backoff; if all fail, `submission_assemblies.status='blocked'`; manual `resume` picks up.
- Plan 1 validator runs as final step; if `valid=false`, `submission_assemblies.status='failed'` and ZIP not delivered.
- Tenant isolation: every query in orchestrator/runner/binder uses `organizationId` AND `projectId` from `tenantContext` — no header overrides (`tenantContext.ts:7-44`).

### Effort
**4.0 person-weeks** (1.5 orchestrator + DAG / 0.75 step runner + retry / 0.75 change-impact + watcher / 0.5 leaf binder + audit / 0.5 tests).

### Risks
- Long-running async needs a worker (BullMQ / Postgres-NOTIFY / cron) — confirm codebase standard.
- DAG complexity for variations (BLA biosimilar comparability > IND); v1 ships IND + NDA, BLA follow-up.
- Idempotent step retries depend on collaborator services being idempotent; Plans 2–4 must support `regenerate` cleanly without duplicate writes.
- Change-watcher could storm orchestrator on bulk imports — debounce 30s, coalesce per assembly.

---

## Cross-Plan Sequencing — Minimum Critical Path

### Phase 1 — Foundations (parallelizable, ~3 weeks)
1. **Plan 1 (validator hardening)** — ships independently. Without it, even a perfect ZIP fails FDA ESG. Highest leverage per LOC.
2. **Plan 2 (M3 narrative composer)** — parallel with Plan 1. M3 required for *every* submission type; most data-rich existing pipeline.
3. **Plan 4 (CSR completion)** — parallel; depends on neither. Long pole at 4.5w; start week 1.

### Phase 2 — Summaries (~3 weeks)
4. **Plan 3 (M2 builders)** — start as soon as Plans 2 (for 2.3.S) and 4 (for 2.7.S) are minimally functional. 2.4.S can start day 1. M2.3.S unlocks NDA path; M2.7.S unlocks NDA/BLA clinical path.

### Phase 3 — Integration (~4 weeks, partially parallel)
5. **Plan 5 (orchestrator)** — designed against stub interfaces of Plans 2/3/4 starting week 2 (only API contracts needed). Real integration after Plan 3 lands. Plan 5 turns the four piecewise builders into a coordinated submission machine.

### Critical path
Plan 4 (4.5w) → Plan 3 M2.7.S (~1w of Plan 3, after Plan 4 locked) → Plan 5 integration (~2w after Plan 3 mostly done) = **~7.5 calendar weeks min** with one strong contributor; **~4–5 weeks with two contributors** splitting CSR/M2 from validator/orchestrator.

### Minimum ship targets
- **Ship-able IND submission (no NDA narratives):** Plan 1 + Plan 2 + Plan 5 = ~10 person-weeks. (30-day-clock IND model from audit C.1 still missing — separable workstream.)
- **Ship-able NDA submission:** all five = ~18 person-weeks. Without Plan 4 → no §11/§12 → no §2.7 → no NDA. Without Plan 1 → ZIP can't pass ESG. Without Plan 5 → human assembler does orchestration.

### Tenant-isolation guardrails (non-negotiable per Projects audit)
Every new service must:
1. Accept `(orgId, projectId)` together — never one alone.
2. Pass them through to every Drizzle query.
3. Use `apiRequest()` and `sendSuccess`/`sendError` envelopes.
4. Write append-only rows to `submission_audit_events` / `concept2cureProvenanceEvents` / `charterAuditEvents` on every state transition.
5. Call only `getGateway()` for AI work — never the legacy `unified-ai-client` shim still used by `csr-builder.ts:14-19`.

### Critical files for implementation
- `server/services/ectdExportService.ts`
- `server/services/ectd/ectd4-validator.ts`
- `server/services/module3Composer.ts`
- `server/services/csr-builder.ts`
- `server/services/regulatory/submissionPackageBuilder.ts`
