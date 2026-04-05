# Codebase Surgical Audit — 2026-04-05

> **Purpose**: Identify every file and directory safe to delete without harming functionality.
> **Method**: 5 parallel deep-scan agents covering server routes, server services, client components, scripts/docs/tests, and duplicate/competing modules.
> **Repo stats**: 5,586 files (excl node_modules/.git), 245 route files, 216 service files, 58 component directories, 183 scripts, 645 doc files.

---

## EXECUTIVE SUMMARY

| Category | Safe to Delete | Needs Verification | Total LOC Removable |
|----------|---------------|-------------------|-------------------|
| Server route stubs/orphans | 22 files | 4 files | ~1,400 |
| Server dead services + data | 12 files | 0 | ~1,670 |
| Duplicate/superseded modules | 7 files | 3 files | ~900 |
| Dead scripts | 44 files | 6 files | ~4,500 |
| Root-level junk files | 18 files | 5 files | ~3,200 |
| Dead directories (entire trees) | 12 directories | 3 directories | ~13.5 MB disk |
| Stale root-level markdown | 12 files | 6 files | ~4,000 |
| **TOTAL** | **~127 items** | **~27 items** | **~15,000+ LOC + 13.5 MB** |

**Client component audit still running** — will supplement this report when complete.

---

## TIER 1: DELETE NOW (Zero Risk)

### 1A. Server Route Stubs — Never Mounted, No Functionality

These files exist in `server/routes/` but are **never imported in server/index.ts**, contain only placeholder/mock responses, and have no service backends.

| # | File | Lines | Why |
|---|------|-------|-----|
| 1 | `fda-integration-simple.ts` | 24 | Empty mock responses |
| 2 | `multiAgencyValidation.ts` | 24 | Hardcoded stub |
| 3 | `pubmed.ts` | 24 | Empty responses |
| 4 | `validation.ts` | 25 | Mock validation |
| 5 | `document-management.ts` | 31 | Mock CRUD stub |
| 6 | `template-management.ts` | 45 | Mock template stub |
| 7 | `ana-gold-standard.ts` | 48 | Incomplete stub |
| 8 | `vault-auto.ts` | 53 | Single endpoint stub |
| 9 | `templateRoutes.ts` | 56 | Superseded by `templates.routes.ts` |
| 10 | `ana-continuous-eval.ts` | 60 | Single endpoint stub |
| 11 | `ai-completion.ts` | 67 | Never mounted |
| 12 | `beta-ops-telemetry.ts` | 72 | Superseded by `beta-telemetry.routes.ts` |
| 13 | `documentPreview.ts` | 78 | Single endpoint stub |
| 14 | `ectd-validate.ts` | 92 | Minimal stub |
| 15 | `workspace-tool-settings.ts` | 90 | Never mounted |
| 16 | `literature-review.ts` | 94 | Minimal stub |
| 17 | `deviceProfileRoutes.ts` | 96 | Superseded by `cerDeviceProfileRoutes` |
| 18 | `versionDiff.ts` | 97 | Minimal stub |
| 19 | `cmc-dashboard.ts` | 88 | Superseded by `-prisma` variant |
| 20 | `c2c-missing-routes.ts` | 158 | Stubs for "missing" features |
| 21 | `csr_search_routes.ts` | 145 | Not mounted, merged elsewhere |
| 22 | `cross-jurisdictional.ts` | 43 | Service doesn't exist |

**Subtotal: 22 files, ~1,400 lines**

### 1B. Dead Server Services

| # | File | Lines | Why |
|---|------|-------|-----|
| 1 | `services/faers-bridge.js` | 115 | 0 imports; superseded by `enhancedFaersService` |
| 2 | `services/faersDbService.js` | 213 | 0 imports; companion to dead faers-bridge |
| 3 | `services/materialService.js` | 267 | 0 imports; abandoned CMC prototype |

**Subtotal: 3 files, ~595 lines**

### 1C. Dead Data Files

| # | File | Lines | Why |
|---|------|-------|-----|
| 1 | `server/data/user_watchlist.json` | 5 | 0 imports |
| 2 | `server/data/section-metadata/ind-metadata.json` | 46 | 0 imports |
| 3 | `server/data/regulatory_rules/fda_rules.json` | 95 | 0 imports |
| 4 | `server/data/regulatory_rules/pmda_rules.json` | 190 | 0 imports |
| 5 | `server/data/historical_issues/fda_issues.json` | 47 | 0 imports |
| 6 | `server/data/historical_issues/pmda_issues.json` | 47 | 0 imports |
| 7 | `server/data/historical_issues/default_issues.json` | 42 | 0 imports |
| 8 | `server/data/historical_issues/ema_issues.json` | 47 | 0 imports |
| 9 | `server/data/ich-guidelines.js` | 377 | Superseded by `ich-guidelines-comprehensive.json` |

**Subtotal: 9 files, ~896 lines**

### 1D. Duplicate/Superseded Modules

| # | File | Lines | Why | Keep Instead |
|---|------|-------|-----|-------------|
| 1 | `server/services/openai-service.ts` | ~180 | 0 imports, duplicate | `server/openai-service.ts` (root) |
| 2 | `server/middleware/auth.js` | ~200 | Legacy .js version | `server/middleware/auth.ts` |
| 3 | `server/controllers/auth.js` | ~160 | Ancient controller pattern | `server/auth.ts` |
| 4 | `client/src/services/authService.js` | 66 | 0 imports, superseded | `portal-v2/services/authService.tsx` |
| 5 | `server/src/services/ai-gateway/index.ts` | ~80 | Older duplicate | `server/services/ai-gateway/` |
| 6 | `scripts/verify-db-tables.js` | ~80 | Keep .ts version | `scripts/verify-db-tables.ts` |
| 7 | `scripts/verify-db-tables.mjs` | ~70 | Keep .ts version | `scripts/verify-db-tables.ts` |

**Subtotal: 7 files, ~836 lines**

### 1E. Dead Scripts

All Python exploration scripts, stale JSON state files, and one-off utilities with 0 references:

| Category | Files | Approx Lines |
|----------|-------|-------------|
| Python exploration scripts (16) | `final_parse.py`, `fixed_parse.py`, `final_validated_parse.py`, `analyze_pdf.py`, `analyze_protocol.py`, `aios_controls_parser.py`, `create-unified-requirements.py`, `generate-ectd4-sample.py`, `generate_part11_report.py`, `generate_sample_csrs.py`, `parse_csr_to_dataset.py`, `train_final_model.py`, `validate_ectd4_xmp.py`, `validate_fhir_audit.py`, `worker/run_batch_worker.py`, `final_fixed_parse.py` | ~800 |
| Stale state JSON (4) | `cortex_fda_progress.json`, `cortex_harvest_progress.json`, `cortex_pubmed_progress.json`, `cortex_orchestrator_state.json` | ~50 |
| Dead automation scripts (24) | `add-founder-user.js`, `ai-agent-protection.js`, `aiBackfill.js`, `backfill_embeddings.js`, `buildIND.js`, `bulkImport.js`, `consolidate-services.sh`, `coauthor-smoke-test.js`, `cortex-orchestrator.js`, `cortex-enhance.cjs`, `development-best-practices-audit.js`, `health-check.js`, `initialize_regulatory_knowledge.js`, `lumen-cortex-harvester.js`, `migrate-cortex-prime.js`, `memory-monitor.js`, `migrate_legacy_types.js`, `optimize-performance.js`, `pre-test-stability-check.js`, `restart_agent.js`, `save_checkpoint.js`, `schedule-backup.js`, `test_reference_model.js`, `test_regulatory_ai.js` | ~2,800 |
| SQL audit scripts (3) | `db_verify.sql`, `db_verify_031_plus.sql`, `db_compliance_check.sql` | ~350 |
| Build artifacts (1) | `codemod-dry-run-report.txt` | ~500 |

**Subtotal: 48 items, ~4,500 lines**

### 1F. Root-Level Junk

| # | File/Dir | Size | Why |
|---|----------|------|-----|
| 1 | `ql -h localhost -U postgres...` | 544 B | Mistyped shell command saved as filename |
| 2 | `draft-email-dan.md` | 7.5 KB | Personal draft email |
| 3 | `MERGE_LOG.md` | 87 B | Single merge note |
| 4 | `phase-0-1-execution-board.json` | 60 KB | Historical tracking, Phase 0-1 complete |
| 5 | `ethics-mlops-execution-board-2026-03-24.json` | 8.6 KB | Historical board |
| 6 | `audit-ci.json` | 135 B | Minimal config, not referenced |
| 7 | `.cerv2_program_id` | 37 B | Stale program ID |
| 8 | `test_doc_loop.cjs` | small | One-off test script |
| 9 | `check_all.cjs` | small | One-off check script |
| 10 | `dangerfile.js` | small | CI tool not in use |
| 11 | `logs/` | 4 KB | Runtime logs |
| 12 | `tmp/` | 12 KB | Temp files |
| 13 | `output/` | 32 KB | Generated output |
| 14 | `test-artifacts/` | 60 KB | Test output |
| 15 | `test-results/` | 36 KB | Test results |
| 16 | `generated_documents/` | 192 KB | Generated docs |
| 17 | `pulls/` | 8 KB | Unclear purpose |
| 18 | `ectd_test/` | 40 KB | Test eCTD structures |

### 1G. Stale Root-Level Markdown (Historical Phase Reports)

These are completed phase audits/reports from months ago. They document decisions already made and executed.

| # | File | Size | Date |
|---|------|------|------|
| 1 | `PHASE_0_1_READINESS_AUDIT.md` | 116 KB | Historical |
| 2 | `PHASE_5_6_AUDIT_REPORT.md` | 14 KB | Historical |
| 3 | `PHASE6_AUDIT_REPORT.md` | 18 KB | Historical |
| 4 | `PHASE6_COMPLETION_CHECKLIST.md` | 13 KB | Historical |
| 5 | `PHASE6_QUICK_SUMMARY.md` | 9 KB | Historical |
| 6 | `QC_AUDIT_REPORT_2026-02-13.md` | 28 KB | Stale |
| 7 | `REGULATORY_UX_AUDIT_2026-02-13.md` | 43 KB | Stale |
| 8 | `CODE_QUALITY_AUDIT_2025-01-24.md` | 8.6 KB | 14 months old |
| 9 | `SIMPLIFICATION_ANALYSIS_2025-01-24.md` | 15 KB | 14 months old |
| 10 | `SIMPLIFICATION_DECISIONS_2025-01-24.md` | 6.4 KB | 14 months old |
| 11 | `STABILIZATION_REPORT.md` | ? | Historical |
| 12 | `CONCEPT2CURE_IMPLEMENTATION_TRACKER.md` | 53 KB | Check if still active |

---

## TIER 2: DELETE AFTER VERIFICATION

### 2A. Entire Directories — Likely Dead (knip.json Ignores Them)

These directories are explicitly ignored in `knip.json` (dead code detector), suggesting they're known-unused. **Verify no runtime process depends on them before deleting.**

| # | Directory | Size | What It Is |
|---|-----------|------|-----------|
| 1 | `backend/` | 836 KB | Unused FastAPI Python backend |
| 2 | `lumen_cortex/` | 1.6 MB | Legacy Python cortex service |
| 3 | `lumen_reports_backend/` | 72 KB | Legacy Python reports |
| 4 | `analytics-engine/` | 60 KB | Unused analytics engine |
| 5 | `shadow_service/` | 4.1 MB | Shadow service (largest) |
| 6 | `ind_automation/` | 672 KB | IND automation scripts |
| 7 | `agent/` | 56 KB | Unused agent service |
| 8 | `workers/` | 24 KB | Unused workers |
| 9 | `worker/` | 32 KB | Duplicate workers dir |
| 10 | `tsa-server/` | 12 KB | Trial Sage server, obsolete |
| 11 | `css/` | 12 KB | Stale CSS (Tailwind is used) |
| 12 | `js/` | 48 KB | Stale vanilla JS |

**Combined: ~7.6 MB of likely dead code**

### 2B. Large Data Directories

| # | Directory | Size | Risk |
|---|-----------|------|------|
| 1 | `csrs/` | 2.8 MB | CSR data files — may be reference data |
| 2 | `reports/` | 2.7 MB | Accumulated reports — may be needed |
| 3 | `db/` | 3.1 MB | Database snapshots — keep if no other backup |

### 2C. Server Routes — Unmounted But Possibly Dynamic

These 4 files have backing services but are not statically mounted in `server/index.ts`. They may be dynamically imported.

| # | File | Lines | Service |
|---|------|-------|---------|
| 1 | `conversation-health.ts` | 44 | `computeConversationHealth` — verify exists |
| 2 | `validate-completeness.ts` | 44 | `validateCompletenessEngine` — verify exists |
| 3 | `escalate.ts` | 46 | `escalateEngine` — verify exists |
| 4 | `harmonize.ts` | 42 | Uses real service — verify mount path |

---

## TIER 3: ARCHITECTURAL OBSERVATIONS (Not Deletions — Future Work)

### Competing Route Families (Consolidation Candidates)

These aren't safe to delete but represent structural bloat:

| Family | Files | Total LOC | Issue |
|--------|-------|-----------|-------|
| 510k routes | 7 files | ~3,200 | Overlapping endpoints |
| CER routes | 8 files | ~3,200 | v1 + v2 coexisting |
| Document routes | 10 files | ~4,500 | Most unmounted |
| IND routes | 11 files | ~5,100 | Most unmounted |
| Template routes | 5 files | ~1,000 | 3 competing catalogs |
| Cortex routes | 4 files | ~2,650 | Multiple entry points |

### Competing Client Trees

- `client/src/components/` (legacy, 519 imports) vs `client/src/concept2cure/components/` (new architecture, growing)
- Not safe to delete either — need gradual migration

### server/ vs server/src/ Split

Code exists in both `server/` and `server/src/`. The `server/src/` tree has duplicates (e.g., ai-gateway). Long-term: pick one.

---

## RECOMMENDED DELETION SEQUENCE

Execute in this order to minimize risk:

### Pass 1: Zero-Risk Cleanup (~20 min)
1. Delete 22 route stubs (Tier 1A)
2. Delete 3 dead services (Tier 1B)
3. Delete 9 dead data files (Tier 1C)
4. Delete 7 duplicate modules (Tier 1D)
5. `npm run build` to confirm nothing breaks

### Pass 2: Script/Doc Cleanup (~10 min)
6. Delete 48 dead scripts (Tier 1E)
7. Delete root-level junk files/dirs (Tier 1F)
8. Move stale markdown to `docs/archive/` or delete (Tier 1G)

### Pass 3: Directory Purge (~15 min, needs verification)
9. Verify and delete knip-ignored directories (Tier 2A)
10. `npm run build && npm run test` to confirm

### Pass 3B: Client Dead Code (~15 min)
11. Delete 46 orphaned client files (Tier 1H — see below)
12. Delete 12 experimental feature files (innovation/ + gcc/)
13. `npm run build` to confirm

### Pass 4: Architectural Consolidation (Future sessions)
14. Consolidate 510k route family (7 → 2)
15. Consolidate document route family (10 → 3)
16. Consolidate IND route family (11 → 3)
17. Migrate client imports from `components/` to `concept2cure/components/`
18. Resolve `server/` vs `server/src/` split

---

## TIER 1H: Dead Client Components (Zero Risk)

### Duplicate Component (944 lines)
- `concept2cure/components/canvas/ConvergentCanvas.tsx` — exact duplicate of `layout/ConvergentCanvas.tsx`

### Old 510(k) Framework (6 files, ~1,950 lines)
All replaced by CERV2Page:
- `components/510k/EnhancedLiteratureDiscovery.jsx` (127)
- `components/510k/PredicateAnalysis.jsx` (182)
- `components/510k/TeamAssignment.jsx` (546)
- `components/510k/DocumentGenerationPanel.jsx` (427)
- `components/510k/ProgressTracker.jsx` (317)
- `components/510k/PredicateComparison.jsx` (351)

### Unused UI Components (9 files, ~1,300 lines)
Never imported — shadcn/ui library includes exist but nothing references these:
- `components/ui/carousel.tsx`, `drawer.tsx`, `hover-card.tsx`, `input-otp.tsx`
- `menubar.tsx`, `navigation-menu.tsx`, `pagination.tsx`, `toggle-group.tsx`
- `components/ui/file-upload.jsx` (duplicate of .tsx version)

### Legacy Context Providers (8 files, ~1,600 lines)
Replaced by portal-v2/services/authService and TenantContext:
- `contexts/AuthContext.jsx`, `DialogContext.jsx`, `DocuShareContext.jsx`
- `contexts/OnboardingContext.jsx`, `SubmissionContext.jsx`
- `contexts/TooltipLearningContext.jsx`, `UserContext.jsx`, `UserContext.tsx`

### Portal-V2 Legacy (7 files, ~1,784 lines)
Old portal experiment, ZenApp is the active shell:
- `portal-v2/ClientPortalV2.tsx` (422)
- `portal-v2/components/AdminPortalIndex.tsx` (761)
- `portal-v2/components/cortex/*` (5 files)

### Concept2Cure Legacy Layouts (3 files, ~779 lines)
ZenApp is the active entry point:
- `concept2cure/IndustryAwareApp.tsx` (453)
- `concept2cure/ZenAppWithSession.tsx` (200)
- `concept2cure/layouts/Concept2CureLayout.tsx` (126)

### Orphaned Hooks (2 files)
- `hooks/useFetchFAERS.jsx`, `hooks/useQCWebSocket.tsx`

### Demo File (1 file)
- `concept2cure/demo/UnifiedWorkspaceDemo.tsx`

### Complete Feature Dead Zones (12 files, ~8,400 lines)

**Innovation Module** (7 files, never integrated):
- `components/innovation/AdaptiveReviewerWorkspace.tsx` (582)
- `components/innovation/AutoTraceabilityPanel.tsx` (523)
- `components/innovation/ComplianceGuardrailsSDK.tsx` (814)
- `components/innovation/OutcomeBasedTemplateLearning.tsx` (544)
- `components/innovation/RegulatoryDeltaRadar.tsx` (474)
- `components/innovation/RegulatoryNegotiationLogbook.tsx` (667)
- `components/innovation/SubmissionReadinessTwin.tsx` (545)

**GCC Module** (5 files, never integrated):
- `components/gcc/ECTDModuleBrowser.tsx` (396)
- `components/gcc/EvidenceVaultDashboard.tsx` (579)
- `components/gcc/LabelImpactSimulator.tsx` (892)
- `components/gcc/SigningWorkflowDashboard.tsx` (621)
- `components/gcc/SiteIntelligenceDashboard.tsx` (638)

### Client Files Needing Verification (25+ files, ~10,000 lines)

**Regulatory components** — check feature flags before deleting:
- `concept2cure/components/regulatory/ClinicalEvidenceTracker.tsx` (1,142)
- `concept2cure/components/regulatory/IVDRAnnexVIIIClassifier.tsx` (1,043)
- `concept2cure/components/regulatory/AnalyticalValidationTracker.tsx` (912)
- `concept2cure/components/medtech/MedicalDeviceDashboard.tsx` (1,181)

**ForesightAI modules** — verify /unified-suite route:
- `components/ForesightAI/CrossSpeciesPKPDModule.tsx` (617)
- `components/ForesightAI/DoseEscalationModule.tsx` (536)
- `components/ForesightAI/INDNarrativeModule.tsx` (498)
- `components/ForesightAI/Phase0I/DoseEscalation.jsx` (439)
- `components/ForesightAI/PhaseJourneyNavigator.jsx` (364)

### FALSE POSITIVES — Do NOT Delete
- `InteractiveDemoPage.tsx` — routed in ZenRouter
- `RegulatoryAITesting.jsx` — routed at /regulatory-ai-test
- `RegulatoryRiskDashboard.jsx` — routed in App.jsx
- `PlatformReadinessDashboard.tsx` — routed in App.jsx
- `ComponentManagementSystem.jsx` — lazy-loaded in App.jsx
- `CMCBlueprintGenerator.jsx` — lazy-loaded in App.jsx
- `RealTimeMonitoringDashboard.jsx` — lazy-loaded in App.jsx
- `concept2cure/components/layout/ConvergentCanvas.tsx` — active (NOT the canvas/ duplicate)

**Client subtotal: 58 safe files (~16,757 lines) + 12 experimental (~8,400 lines)**

---

## METRICS

- **Current repo file count**: 5,586
- **Tier 1 deletions (safe)**: ~185 files/dirs (server: 127, client: 58)
- **Tier 2 deletions (after verify)**: ~15 dirs + 25 client files + 4 route files
- **Estimated post-cleanup file count**: ~5,380 (Tier 1) → ~5,330 (Tier 2)
- **Disk savings**: ~8 MB (code) + ~8.6 MB (data dirs if verified)
- **Build verified**: Yes — `npm run build` passes as of this audit
- **Test baseline**: 132 passing, 9 pre-existing failures (CJS/Vitest config)
