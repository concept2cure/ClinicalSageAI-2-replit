# Forensic Dead-Code Audit Report

**Date**: 2026-04-01  
**Branch**: `cursor/system-pathway-cleanup-14eb`  
**Scope**: scripts/, root configs, client/src/config/, shared/, agents/, docs/

---

## Executive Summary

| Area | Total Files | Dead Files | Dead Lines | Status |
|------|------------|------------|------------|--------|
| scripts/ (top-level) | ~90 | ~80 | ~18,000 | Massive dead weight |
| scripts/automation/ | 112 | 112 | 13,839 | Entire directory dead |
| scripts/import/ | 26 | 26 | 8,673 | Entire directory dead |
| scripts/test/ | 71 | 71 | 7,193 | Entire directory dead |
| scripts/verification/ | 15 | 15 | 3,603 | Entire directory dead |
| scripts/deploy/ | 9 | 9 | 494 | Entire directory dead |
| scripts/farmers/ | 7 | 7 | 5,167 | Entire directory dead |
| scripts/data/ | 101 | 101 | 1,680 | Entire directory dead |
| scripts/performance/ | 4 | 4 | 610 | Entire directory dead |
| scripts/build/ | 5 | 5 | 415 | Entire directory dead |
| scripts/smoke/ | 3 | 3 | 967 | Entire directory dead |
| scripts/oss/ | 11 | 11 | 629 | Entire directory dead |
| scripts/security/ | 1 | 1 | 186 | Dead |
| scripts/sonar/ | 1 | 1 | 161 | Dead |
| Root-level files | 41 | 12 | ~1,900 | Config debris |
| client/src/config/ | 5 | 5 | 676 | Entire directory dead |
| shared/ (top-level) | 13 | 8 | 1,455 | Dead stubs/schemas |
| shared/types/ | 22 | 2 | 518 | Mostly alive |
| shared/schema/ | 18 | 1 | 180 | Mostly alive (barrel) |
| shared/schemas/ | 2 | 2 | 199 | Dead |
| shared/other | 6 | 3 | 367 | Dead stubs |
| agents/ | 3 | 3 | 1,090 | Entire directory dead |
| docs/ (obsolete) | ~50 | 0 (noted) | ~12,000 | Documentation only |
| **TOTAL** | **~615** | **~531** | **~79,802** | |

**Total removable dead code: ~531 files, ~80,000 lines.**

---

## 1. scripts/ — Dead or Obsolete Scripts

### ALIVE (Referenced from package.json or CI workflows) — 43 files

| Filepath | Referenced By | Notes |
|----------|-------------|-------|
| `scripts/startup.sh` | package.json `dev` | 542 lines, main startup |
| `scripts/build-server.mjs` | package.json `build` | 36 lines |
| `scripts/jest.config.js` | package.json `test` | 7 lines |
| `scripts/jest.setup.js` | jest.config.js | 19 lines |
| `scripts/vitest.config.ts` | package.json (indirect) | 9 lines |
| `scripts/vitest.setup.ts` | vitest.config.ts | 1 line |
| `scripts/check_assembly_docs.mjs` | package.json `db:check-assembly` | 29 lines |
| `scripts/e2e_smoke_assembly.mjs` | package.json `smoke:e2e-assembly` | 209 lines |
| `scripts/seed-ga-demo.mjs` | package.json `db:seed` | 423 lines |
| `scripts/seed-admin.mjs` | package.json `db:seed:admin` | 92 lines |
| `scripts/db_check.js` | package.json `db:check` | 31 lines |
| `scripts/db_status.js` | package.json `db:status` | 59 lines |
| `scripts/db/readiness-audit.mjs` | package.json `db:readiness` | — |
| `scripts/db/sync-migration-manifest.mjs` | package.json `db:sync-manifest` | — |
| `scripts/smoke_cerv2_workbench.js` | package.json | 139 lines |
| `scripts/cerv2_seed_demo.js` | package.json | 19 lines |
| `scripts/verify_cerv2_workbench.js` | package.json | 58 lines |
| `scripts/cerv2_staging_verify.mjs` | package.json + CI | 544 lines |
| `scripts/cerv2_deploy_rc.sh` | package.json | 224 lines |
| `scripts/cerv2_postmerge_verify.mjs` | package.json | 368 lines |
| `scripts/generate-risk-code-types.ts` | package.json `generate:risk-codes` | 524 lines |
| `scripts/validate-ectd-stubs-bundle.ts` | package.json `validate:ectd-stubs` | 213 lines |
| `scripts/ci/ban-new-pool.sh` | package.json + CI | — |
| `scripts/ci/check-governed-export-routes.mjs` | package.json | — |
| `scripts/ci/check-governed-export-consequence-shape.mjs` | package.json | — |
| `scripts/ci/audit-route-mounts.mjs` | package.json | — |
| `scripts/ci/check-reasoning-tier-ga-readiness.mjs` | package.json | — |
| `scripts/ci/check-reasoning-tier-uat-evidence.mjs` | package.json | — |
| `scripts/ci/check-reasoning-tier-readiness-suite.mjs` | package.json | — |
| `scripts/ci/require-migration-headers.sh` | CI workflow | — |
| `scripts/ci/generate-test-summary.js` | CI (indirect) | — |
| `scripts/audits/generate-last-pr-wiring-audit.mjs` | package.json | — |
| `scripts/audits/execute-last-pr-audit-build-plan.mjs` | package.json | — |
| `scripts/audits/prune-generated-audit-artifacts.mjs` | package.json | — |
| `scripts/audits/repo-health-scan.mjs` | package.json | — |
| `scripts/sync-branches.sh` | CI workflow | 329 lines |
| `scripts/db_migrate.sh` | CI workflow | 181 lines |
| `scripts/db_verify.sql` | CI workflow | — |
| `scripts/db_compliance_check.sql` | CI workflow | — |
| `scripts/check_no_destructive_migrations.sh` | CI workflow | 129 lines |
| `scripts/e2e_staging_smoke.py` | CI workflow | 491 lines |
| `scripts/generate_part11_report.py` | CI workflow | 28 lines |
| `scripts/validate_ectd4_xmp.py` | CI workflow | 65 lines |
| `scripts/validate_fhir_audit.py` | CI workflow | 48 lines |
| `scripts/generate-ectd4-sample.py` | CI workflow | 55 lines |
| `scripts/ai/verify-tests.sh` | CI workflow | — |
| `scripts/worker/run_batch_worker.py` | docker-compose.yml | 132 lines |
| `scripts/migrate-logging-to-pino.mjs` | test file | 63 lines |

### DEAD — Top-Level scripts/ (0 external references)

| Filepath | Lines | Notes |
|----------|-------|-------|
| `scripts/add-founder-user.js` | 79 | Ad-hoc user creation |
| `scripts/add_indexes.cjs` | 183 | One-off DB index script |
| `scripts/add-ind-templates.js` | 548 | One-off IND template seeder |
| `scripts/add_timestamps.cjs` | 169 | One-off timestamp migration |
| `scripts/ai-agent-protection.js` | 274 | Obsolete protection script |
| `scripts/aiBackfill.js` | 226 | One-off AI backfill |
| `scripts/ai/context-pack.sh` | — | Unused AI context script |
| `scripts/ai/worktree-clean.sh` | — | Unused worktree cleanup |
| `scripts/ai/worktree-new.sh` | — | Unused worktree creation |
| `scripts/aios_controls_parser.py` | 86 | AIOS parser, orphaned |
| `scripts/analyze_pdf.py` | 112 | Standalone PDF analyzer |
| `scripts/analyze_protocol.py` | 662 | Standalone protocol analyzer |
| `scripts/apply_phase5_migrations.mjs` | 60 | One-off migration script |
| `scripts/backfill_embeddings.js` | 78 | One-off embedding backfill |
| `scripts/backup.sh` | 86 | Manual backup script |
| `scripts/buildIND.js` | 58 | Obsolete IND builder |
| `scripts/bulkImport.js` | 118 | Obsolete bulk import |
| `scripts/check-inline-state-patterns.sh` | 84 | One-off audit |
| `scripts/check-tables.js` | 110 | Superseded by db_check.js |
| `scripts/check-workspace-grammar.sh` | 78 | One-off grammar check |
| `scripts/cleanup-fixtures.mjs` | 135 | One-off cleanup |
| `scripts/cleanup-old-structure.sh` | 70 | One-off restructure |
| `scripts/coauthor-smoke-test.js` | 128 | Obsolete smoke test |
| `scripts/codemod-dry-run-report.txt` | — | Stale report artifact |
| `scripts/consolidate-services.sh` | 154 | One-off consolidation |
| `scripts/cortex-enhance.cjs` | 145 | Obsolete cortex script |
| `scripts/cortex-enhancer.ts` | 434 | Obsolete cortex script |
| `scripts/cortex_fda_progress.json` | — | Stale progress state |
| `scripts/cortex_harvest_progress.json` | — | Stale progress state |
| `scripts/cortex-orchestrator.js` | 371 | Obsolete orchestrator |
| `scripts/cortex_orchestrator_state.json` | — | Stale state file |
| `scripts/cortex_pubmed_progress.json` | — | Stale progress state |
| `scripts/create_cer_approvals.js` | 90 | One-off table creation |
| `scripts/create_cer_approvals_table.js` | 84 | Duplicate of above |
| `scripts/create-complete-ectd-templates.cjs` | 794 | Superseded by seed-ectd |
| `scripts/create_component_snapshot.sh` | 46 | One-off snapshot |
| `scripts/create_manual_backup.sh` | 14 | One-off backup |
| `scripts/create-missing-tables.js` | 208 | One-off table creation |
| `scripts/create-roadmap-files.sh` | 30 | One-off doc creation |
| `scripts/create-unified-requirements.py` | 56 | One-off requirements gen |
| `scripts/db_verify_031_plus.sql` | — | One-off verify |
| `scripts/dependency-manager.mjs` | 129 | Unused dep manager |
| `scripts/deploy-dev.sh` | 26 | Not in CI |
| `scripts/deploy-prod.sh` | 51 | Not in CI |
| `scripts/deploy-staging.sh` | 26 | Not in CI |
| `scripts/dev-all.sh` | 187 | Unused dev script |
| `scripts/development-best-practices-audit.js` | 383 | One-off audit |
| `scripts/embed-atoms.ts` | 128 | Unused embedding script |
| `scripts/emergency-cleanup.sh` | 32 | One-off cleanup |
| `scripts/export_compare_pdf.py` | 268 | Unused PDF comparison |
| `scripts/extract_protocol_data.py` | 346 | Unused protocol extractor |
| `scripts/final_fixed_parse.py` | 56 | One-off parse script |
| `scripts/final_parse.py` | 49 | One-off parse script |
| `scripts/final_validated_parse.py` | 69 | One-off parse script |
| `scripts/find_missing_fks.cjs` | 77 | One-off DB audit |
| `scripts/find_missing_indexes.cjs` | 78 | One-off DB audit |
| `scripts/find_missing_relations.cjs` | 48 | One-off DB audit |
| `scripts/find_missing_timestamps.cjs` | 58 | One-off DB audit |
| `scripts/find_missing_timestamps_v2.cjs` | 48 | Duplicate of above |
| `scripts/find_status_cols.cjs` | 54 | One-off DB audit |
| `scripts/fix-copilot-branch.sh` | 147 | One-off branch fix |
| `scripts/fixed_parse.py` | 55 | One-off parse script |
| `scripts/fix-missing-schema.cjs` | 144 | One-off schema fix |
| `scripts/fix-toast-calls.js` | 185 | One-off codemod |
| `scripts/fix-typescript-errors.ts` | 227 | One-off TS fix |
| `scripts/full-smoke-test.cjs` | 289 | Obsolete smoke test |
| `scripts/generate_aios_evidence_pack.py` | 154 | Unused AIOS gen |
| `scripts/generate_intelligence_report.py` | 172 | Unused report gen |
| `scripts/generate_protocol_intelligence_report.py` | 302 | Unused report gen |
| `scripts/generate_protocol_report.py` | 407 | Unused report gen |
| `scripts/generate_restore_report.py` | 125 | Unused restore report |
| `scripts/generate-risk-codes.ts` | 146 | Superseded by types version |
| `scripts/generate_sample_csrs.py` | 160 | One-off CSR gen |
| `scripts/generate_sap_report.py` | 114 | Unused SAP report |
| `scripts/generate_sso_spec.js` | 645 | Unused SSO spec gen |
| `scripts/generate_success_pdf.py` | 248 | Unused PDF gen |
| `scripts/generate_usecase_report.py` | 336 | Unused report gen |
| `scripts/generate_weekly_digest.py` | 256 | Unused digest gen |
| `scripts/health-check.js` | 93 | Not used (server has own) |
| `scripts/initialize_regulatory_knowledge.js` | 132 | Unused initializer |
| `scripts/.inline-state-baseline` | — | Stale baseline file |
| `scripts/lint-and-format.sh` | 13 | Unused, pkg.json has lint |
| `scripts/lock-html` | — | Unknown lock file |
| `scripts/lumen-cortex-harvester.js` | 501 | Obsolete harvester |
| `scripts/memory-monitor.js` | 44 | Unused memory monitor |
| `scripts/migrate-cortex-prime.js` | 447 | One-off migration |
| `scripts/migrate_legacy_types.js` | 224 | One-off migration |
| `scripts/neon-migrate-schema.sh` | 23 | Unused Neon migration |
| `scripts/neon-verify-connection.sh` | 9 | Unused Neon verify |
| `scripts/optimized-start.js` | 42 | Unused start script |
| `scripts/optimize-performance.js` | 87 | Unused perf script |
| `scripts/parse_csrs_to_csv.py` | 90 | Unused CSV parser |
| `scripts/parse_csr_to_dataset.py` | 47 | Unused dataset parser |
| `scripts/phase8_e2e_qa.mjs` | 1026 | Obsolete QA script |
| `scripts/populate-ectd-modules.js` | 444 | One-off eCTD populator |
| `scripts/pre-commit-protection.sh` | 46 | Unused hook script |
| `scripts/pre_commit_safety.sh` | 130 | Unused hook script |
| `scripts/preprocess_pdfs.js` | 103 | Unused PDF processor |
| `scripts/pre-test-stability-check.js` | 75 | Unused stability check |
| `scripts/psql_safe.sh` | 42 | Unused SQL wrapper |
| `scripts/recover_component.sh` | 61 | One-off recovery |
| `scripts/reg-auto-check.mjs` | 179 | Unused reg check |
| `scripts/reorganize-structure.sh` | 62 | One-off restructure |
| `scripts/restart_agent.js` | 68 | Unused agent restart |
| `scripts/run-audit-migration.mjs` | 29 | One-off migration |
| `scripts/run-db-migration.js` | 159 | Superseded by db_migrate |
| `scripts/run-embedding-migration.js` | 93 | One-off migration |
| `scripts/run_migrations.js` | 23 | One-off migration |
| `scripts/save_checkpoint.js` | 25 | Unused checkpoint save |
| `scripts/schedule-backup.js` | 81 | Unused backup scheduler |
| `scripts/security-test.js` | 300 | Unused security test |
| `scripts/seed-authoring.mjs` | 153 | Unused seeder |
| `scripts/seed-demo-data.sh` | 363 | Unused demo seeder |
| `scripts/seed-ectd-templates.js` | 858 | Unused seeder |
| `scripts/seed-ind-pyramid.sh` | 914 | Unused seeder |
| `scripts/seed-lumen-biosciences.sh` | 974 | Unused seeder |
| `scripts/seedProfiles.ts` | 79 | Unused seeder |
| `scripts/seed-quality-templates.mjs` | 35 | Unused seeder |
| `scripts/seed-stability.mjs` | 298 | Unused seeder |
| `scripts/setup_neon_auth.js` | 96 | One-off Neon setup |
| `scripts/setup-pre-commit-hooks.sh` | 98 | Unused hook setup |
| `scripts/setup-protection.js` | 113 | Obsolete protection |
| `scripts/setup_reference_model.js` | 566 | Unused setup |
| `scripts/setup-rls.js` | 102 | One-off RLS setup |
| `scripts/test-cognitive-fabric.ts` | 221 | Unused test |
| `scripts/test_reference_model.js` | 444 | Unused test |
| `scripts/test_regulatory_ai.js` | 132 | Unused test |
| `scripts/test-retention-api.js` | 205 | Unused test |
| `scripts/train_final_model.py` | 94 | Unused ML training |
| `scripts/trialsage-html-security.sh` | 57 | Obsolete, old product name |
| `scripts/uat-authoring.mjs` | 181 | Unused UAT |
| `scripts/uat-process.mjs` | 242 | Unused UAT |
| `scripts/uat-stability.mjs` | 196 | Unused UAT |
| `scripts/uat-stability-workflow.mjs` | 99 | Unused UAT |
| `scripts/unlock-html` | — | Unknown lock file |
| `scripts/validate_aios_audit_assets.py` | 94 | Unused validator |
| `scripts/validate_cerv2_fixes.mjs` | 262 | One-off validator |
| `scripts/validate-commit.js` | 268 | Unused commit validator |
| `scripts/validate_phase712.mjs` | 268 | Obsolete phase validator |
| `scripts/verify_components.sh` | 104 | One-off verify |
| `scripts/verify-database-connection.js` | 41 | Unused DB verify |
| `scripts/verify-db-tables.js` | 113 | Unused DB verify |
| `scripts/verify-db-tables.mjs` | 90 | Duplicate DB verify |
| `scripts/verify-db-tables.ts` | 107 | Triplicate DB verify |
| `scripts/verify-migration.mjs` | 77 | One-off verify |
| `scripts/verify-reorganization.js` | 55 | One-off verify |

### DEAD — Entire Script Subdirectories

| Directory | Files | Lines | Notes |
|-----------|-------|-------|-------|
| `scripts/automation/` | 112 | 13,839 | Legacy ops scripts — batch imports, CER setup, toast fixes, emergency recovery, etc. Zero external references. |
| `scripts/import/` | 26 | 8,673 | ClinicalTrials.gov / Health Canada trial import scripts. Zero external references. |
| `scripts/test/` | 71 | 7,193 | Ad-hoc test scripts for 510K, CER, CSR, analytics. Test PDFs. Zero external references. |
| `scripts/verification/` | 15 | 3,603 | SUB_PHASE_1_3, SUB_PHASE_1_4, SUB_PHASE_2_*, SUB_TASK_3_* verification. All for completed phases. Zero refs. |
| `scripts/deploy/` | 9 | 494 | Deployment scripts not referenced in any CI workflow. Superseded. |
| `scripts/farmers/` | 7 | 5,167 | Data harvesting (EMA, FDA, PubMed, ICH). Zero references — these were one-off data ingestion. |
| `scripts/data/` | 101 | 1,680 | 1 CSV + 100 processed CSR JSON files. Zero references. |
| `scripts/performance/` | 4 | 610 | Load tests, API benchmarks, regression checks. Zero references. |
| `scripts/build/` | 5 | 415 | Build scripts not in package.json. Superseded by build-server.mjs. |
| `scripts/smoke/` | 3 | 967 | Reviewer smoke tests. Zero references. |
| `scripts/oss/` | 11 | 629 | OSS readiness checks, scorecards, UAT metrics. Only self-referencing. |
| `scripts/security/` | 1 | 186 | security-scan.js — not referenced in CI or package.json. |
| `scripts/sonar/` | 1 | 161 | triage_quality_gate.py — not referenced in CI. |

---

## 2. Root-Level Config Debris

### DEAD Root Files

| Filepath | Lines | Status | Notes |
|----------|-------|--------|-------|
| `.eslintrc.cjs` | 144 | **DEAD** | Superseded by `eslint.config.js` (flat config). Not referenced anywhere. |
| `check_all.cjs` | 35 | **DEAD** | Ad-hoc Postgres query with hardcoded local connection string. |
| `fix-auth.cjs` | 21 | **DEAD** | ⚠️ SECURITY: Contains hardcoded Neon database credentials. Must delete. |
| `test-ana.cjs` | 52 | **DEAD** | ⚠️ SECURITY: Contains hardcoded JWT token. Ad-hoc test. Must delete. |
| `test_doc_loop.cjs` | 442 | **DEAD** | Ad-hoc document loop test script. |
| `_test_neon.cjs` | 13 | **DEAD** | ⚠️ SECURITY: Contains hardcoded Neon database URL. Must delete. |
| `ethics-mlops-execution-board-2026-03-24.json` | — | **DEAD** | Stale execution board state file. |
| `phase-0-1-execution-board.json` | — | **DEAD** | Stale execution board state file. |
| `.replit-ci.yml` | — | **DEAD** | Not referenced by .replit or any CI workflow. |
| `audit-ci.json` | — | **DEAD** | No `audit-ci` in package.json or CI workflows. |
| `docker-compose.beta.yml` | — | **DEAD** | Not referenced in any CI workflow (only e2e + staging are). |
| `.env.beta.example` | — | **DEAD** | Not referenced anywhere. |
| `.ai-instructions.md` | — | **DEAD** | Not referenced; superseded by CLAUDE.md + .claude/ skills. |
| `.cerv2_program_id` | — | **DEAD** | Not referenced by any source file. |

### ALIVE Root Files (confirmed references)

| Filepath | Referenced By |
|----------|-------------|
| `package.json` | Core |
| `tsconfig.json` | Core |
| `vite.config.ts` | Core |
| `vitest.config.ts` | Core |
| `eslint.config.js` | `npm run lint` |
| `drizzle.config.ts` | `drizzle-kit push` |
| `tailwind.config.ts` | PostCSS/Vite |
| `postcss.config.js` | Vite |
| `playwright.config.ts` | E2E tests |
| `.prettierrc` / `.prettierignore` | Prettier |
| `.gitignore` | Git |
| `.npmrc` | npm |
| `.dockerignore` | Docker |
| `Dockerfile.optimized` | CI (deploy-aws.yml) |
| `docker-compose.yml` | Docker |
| `docker-compose.e2e.yml` | CI (debug_celery, test_generator) |
| `docker-compose.staging.yml` | CI (ci-staging-integration) |
| `dangerfile.js` | CI (danger.yml) |
| `knip.json` | `npm run audit:dead-code` |
| `lighthouse-ci.json` | CI (cerv2-staging-deploy) |
| `.trivyignore` | CI (trivy scans) |
| `vercel.json` / `.vercelignore` | Vercel deployment |
| `.replit` | Replit deployment |
| `app.yaml` | Google App Engine |
| `theme.json` | Replit/portal theming |

---

## 3. client/src/config/ — ALL DEAD

Every file in this directory has **zero imports** from any source file.

| Filepath | Lines | Status | Notes |
|----------|-------|--------|-------|
| `client/src/config/constants.js` | 109 | **DEAD** | Global app constants — no imports found |
| `client/src/config/documentTypeConfig.js` | 117 | **DEAD** | CERV2 document type config — no imports |
| `client/src/config/googleConfig.js` | 77 | **DEAD** | Google API config — no imports |
| `client/src/config/regionRules.ts` | 177 | **DEAD** | Region module rules — no imports |
| `client/src/config/versionConfig.js` | 196 | **DEAD** | Version config for Extract Commitments — no imports |

**Total: 5 files, 676 lines, all dead.**

---

## 4. shared/ — Dead Shared Files

### DEAD Top-Level shared/ Files

| Filepath | Lines | Status | Notes |
|----------|-------|--------|-------|
| `shared/langchain-community-llms-hf.ts` | 23 | **DEAD** | Stub for HuggingFace — never imported |
| `shared/langchain-core.ts` | 38 | **DEAD** | Stub for LangChain core — never imported |
| `shared/pm-schema.ts` | 864 | **DEAD** | Mission Control PM schema — never imported |
| `shared/schema-index.ts` | 78 | **DEAD** | Old schema barrel — superseded by `shared/schema/index.ts` |
| `shared/schema_junction_tables.ts` | 111 | **DEAD** | Junction table definitions — never imported |
| `shared/snowglobe.types.ts` | 284 | **DEAD** | Snow Globe prediction engine types — deleted feature |
| `shared/tensorflow-stub.ts` | 23 | **DEAD** | TensorFlow stub — never imported |
| `shared/trials-schema.ts` | 34 | **DEAD** | Trials table schema — never imported (tables in main schema.ts) |

### DEAD shared/schemas/ Files

| Filepath | Lines | Status | Notes |
|----------|-------|--------|-------|
| `shared/schemas/DeviceProfileSchema.js` | 91 | **DEAD** | Zod device schema — not imported (server defines its own) |
| `shared/schemas/DeviceProfileSchema.mjs` | 108 | **DEAD** | ESM copy of above — not imported |

### DEAD shared/types/ Files

| Filepath | Lines | Status | Notes |
|----------|-------|--------|-------|
| `shared/types/resolution-bundle.ts` | 231 | **DEAD** | Resolution bundle types — never imported (server defines locally) |
| `shared/types/jsx-modules.d.ts` | 287 | **BORDERLINE** | Ambient `*.jsx` declarations auto-included by tsconfig. Wildcard `*.jsx` declaration may still be needed (761 JSX files exist), but most specific module declarations are probably stale. |

### DEAD shared/schema/ Files

| Filepath | Lines | Status | Notes |
|----------|-------|--------|-------|
| `shared/schema/vault.ts` | 180 | **DEAD** | Vault document chunks + evidence citations — not in barrel, 0 imports |

### DEAD shared/regulatory/ Files

| Filepath | Lines | Status | Notes |
|----------|-------|--------|-------|
| `shared/regulatory/project-model-integration.ts` | 132 | **DEAD** | Project model integration — never imported |
| `shared/regulatory/readiness-matrix.ts` | 158 | **DEAD** | Readiness matrix — never imported |

### DEAD shared/other Files

| Filepath | Lines | Status | Notes |
|----------|-------|--------|-------|
| `shared/ivdr/stableStringify.ts` | — | **DEAD** | Worker has its own inline copy, this is never imported |
| `shared/templates/csr_mapping_template.json` | 77 | **DEAD** | CSR mapping template — never referenced |
| `shared/utils/therapeutic-area-classifier.ts` | — | **BORDERLINE** | Self-describes as stub; imported by `server/protocol-analyzer-service.ts` |

### ALIVE shared/ Files (confirmed imports)

- `shared/db.ts`, `shared/schema.ts`, `shared/docTypes.ts`, `shared/evidenceSchema.ts`, `shared/cmc-schema.ts`
- `shared/ivdr/manifest.ts` (imported by client + server)
- `shared/regulatory/index.ts` (barrel), `document-taxonomy.ts`, `application-families.ts`, `region-profiles.ts`, `global-document-registry.ts`, `project-bootstrap.ts`
- All `shared/schema/*.ts` files re-exported from `shared/schema/index.ts` barrel (except `vault.ts`)
- All `shared/types/*.ts` files except `resolution-bundle.ts` and `jsx-modules.d.ts`

---

## 5. agents/ — ALL DEAD

| Filepath | Lines | Status | Notes |
|----------|-------|--------|-------|
| `agents/ocr_engine.py` | 235 | **DEAD** | Python OCR engine — zero references from any source file |
| `agents/openai/assistant-profile.json` | 113 | **DEAD** | OpenAI assistant config — zero references |
| `agents/openai/trialsage_assistant.ts` | 742 | **DEAD** | TrialSage assistant — zero references, imports from openai-service but is never imported itself |

**Total: 3 files, 1,090 lines, all dead.**

---

## 6. docs/ — Clearly Obsolete Documentation (Not marked DEAD — for awareness)

These docs reference systems, product names, or architectures that have been removed or superseded. They are documentation-only and not blocking code execution, but they add cognitive noise.

### Entire Directories of Legacy Docs

| Directory | Files | Lines | Notes |
|-----------|-------|-------|-------|
| `docs/archive/` | 21 | ~3,805 | Already labeled "archive" — Replit agent directives, old consolidation reports, old architecture |
| `docs/trialsage_vault/` | 7 | ~3,125 | "TrialSage Vault" docs — refers to old product identity, CRO portal architecture |

### Specific Obsolete Docs

| Filepath | Notes |
|----------|-------|
| `docs/guides/README_LUMENTRIAL.md` | References "LumenTrial" — deleted product |
| `docs/guides/README_SAGEPLUS.md` | References "SagePlus" — deleted product |
| `docs/guides/README_VAULT.md` | References old "TrialSage Vault" |
| `docs/guides/REPLIT_README.md` | Replit-specific getting started |
| `docs/getting-started/PRISMA_MIGRATION.md` | Prisma migration guide — project uses Drizzle now |
| `docs/TECH_DEBT_ANALYSIS_2026-01-24.md` | 2+ months old, likely stale |
| `docs/CONSOLIDATION_ACTION_PLAN_2026-01-26.md` | Pre-consolidation plan, already executed |
| `docs/UI_ALIGNMENT_SUMMARY_2026-01-29.md` | Pre-consolidation UI alignment |
| `docs/security/CERV2_PROTECTION_SYSTEM.md` | References old protection scripts |
| `docs/security/DOCUMENT_EDITOR_PROTECTION.md` | References old protection scripts |
| `docs/security/DOCUMENT_EDITOR_PROTECTION_SYSTEM.md` | Duplicate of above |
| `docs/security/MAXIMUM_PROTECTION.md` | References old protection system |
| `docs/security/MODULE_PROTECTION_SYSTEM.md` | References old protection system |
| `docs/security/PROJECT_LOCKDOWN_MANIFEST.md` | References old lockdown |
| `docs/security/PROJECT_PROTECTION.md` | References old protection |

---

## 7. Security Findings (URGENT)

Three root-level files contain **hardcoded credentials** that should be removed immediately:

| File | Credential Type |
|------|----------------|
| `fix-auth.cjs` | Neon database connection string with password |
| `_test_neon.cjs` | Neon database URL with password |
| `test-ana.cjs` | Hardcoded JWT token |

These should be deleted regardless of dead-code status.

---

## Summary: Recommended Deletions

### High-Priority (security + largest impact)

1. **Delete `fix-auth.cjs`, `_test_neon.cjs`, `test-ana.cjs`** — hardcoded credentials
2. **Delete `scripts/automation/`** — 112 files, 13,839 lines, zero references
3. **Delete `scripts/import/`** — 26 files, 8,673 lines, zero references
4. **Delete `scripts/test/`** — 71 files, 7,193 lines, zero references
5. **Delete `scripts/data/`** — 101 files, 1,680 lines, zero references
6. **Delete `scripts/farmers/`** — 7 files, 5,167 lines, zero references
7. **Delete `scripts/verification/`** — 15 files, 3,603 lines, zero references
8. **Delete `agents/`** — 3 files, 1,090 lines, zero references
9. **Delete `client/src/config/`** — 5 files, 676 lines, zero imports

### Medium-Priority (dead top-level scripts)

10. **Delete ~80 dead top-level scripts/** — ~18,000 lines (see table above)
11. **Delete dead root configs** — `.eslintrc.cjs`, `check_all.cjs`, `test_doc_loop.cjs`, etc.
12. **Delete dead shared/ files** — `pm-schema.ts`, `snowglobe.types.ts`, stubs, etc.

### Low-Priority (dead subdirectories)

13. **Delete `scripts/deploy/`** — 494 lines
14. **Delete `scripts/performance/`** — 610 lines
15. **Delete `scripts/build/`** — 415 lines
16. **Delete `scripts/smoke/`** — 967 lines
17. **Delete `scripts/oss/`** — 629 lines
18. **Delete `scripts/security/`** — 186 lines
19. **Delete `scripts/sonar/`** — 161 lines

### Documentation (awareness only, not blocking)

20. **Consider archiving**: `docs/trialsage_vault/`, `docs/guides/README_LUMENTRIAL.md`, `docs/guides/README_SAGEPLUS.md`, `docs/getting-started/PRISMA_MIGRATION.md`
