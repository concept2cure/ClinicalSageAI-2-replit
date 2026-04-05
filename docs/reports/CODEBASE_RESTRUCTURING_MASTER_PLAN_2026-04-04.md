# Codebase Restructuring Master Plan

> **Date:** 2026-04-04
> **Scope:** Full audit of concept2cure-v2 branch — server, client, schema, migrations, PRs
> **Goal:** Transform chaotic codebase into a controlled, professionally architected system without losing functionality

---

## Executive Summary

| Metric | Current | Assessment |
|--------|---------|------------|
| Total Lines of Code | **1,054,086** | Severely bloated |
| Source Files (.ts/.tsx/.js) | **2,755** | Excessive |
| Server Route Files | **272** (55 dead) | Critical waste |
| Server Service Files | **564** (49 orphaned) | Critical waste |
| Client Components | **1,198** (8+ duplicate families) | Uncontrolled sprawl |
| Schema Tables | **493** (47 unused, 724KB monolith) | Partially modularized |
| Files with Commented-Out Code | **2,544** | Major tech debt |
| Files with console.log | **1,095** | Unprofessional |
| Dependencies | **283** | Some unused |
| Test Files | **311** (no coverage tracking) | Infrastructure exists, metrics missing |

**Bottom line:** The codebase has ~200-300K lines of dead, duplicated, or orphaned code. A disciplined restructuring can reduce the codebase by 25-30% while improving maintainability, without touching any live functionality.

---

## Part 1: Immediate Dead Code Removal (Zero Risk)

### 1A. Delete 55 Unused Route Files (~413KB)

These files are **not imported or mounted anywhere**. Safe to delete immediately.

**Regulatory/Compliance (11 files):**
- `server/routes/academic_protocol_assessment.ts` (52KB)
- `server/routes/academic_regulatory_routes.ts` (9.3KB)
- `server/routes/regulatory-correspondence.validation.ts` (3.7KB)
- `server/routes/regulatory-intelligence-api.ts` (22KB)
- `server/routes/quality-management-routes.ts` (1.3KB)
- `server/routes/section-quality-gates.ts` (6.9KB)
- `server/routes/nonclinicalRoutes.ts` (16KB)
- `server/routes/quality-management-api.ts` (25KB)
- `server/routes/phase6.routes.ts` (16KB)
- `server/routes/maud-routes.ts` (18KB)
- `server/routes/faers-routes.ts` (5KB)

**Document/Content (8 files):**
- `server/routes/csr-upload-routes.ts` (13KB)
- `server/routes/evidence-search.ts` (5.3KB)
- `server/routes/evidenceV2.ts` (33KB)
- `server/routes/deep-research.ts` (21KB)
- `server/routes/literature-review.ts` (3.1KB)
- `server/routes/intelligent-reports.ts` (14KB)
- `server/routes/comment-routes.ts` (22KB)
- `server/routes/correction-routes.ts` (2.6KB)

**Special Domains (15 files):**
- `server/routes/dropout-forecast-routes.ts` (16KB)
- `server/routes/hallucination-check.ts` (8.9KB)
- `server/routes/ectd-compile.ts` (21KB)
- `server/routes/ectd-documents.ts` (11KB)
- `server/routes/ectd-export.ts` (10KB)
- `server/routes/ectd-submission-agent.routes.ts` (8.5KB)
- `server/routes/equivalence-api.mjs` (18KB)
- `server/routes/license-routes.js` (23KB)
- `server/routes/smart-blocks.js` (16KB)
- `server/routes/sota-api.mjs` (10KB)
- `server/routes/regulatory-ai-production.mjs` (16KB)
- `server/routes/medical-device-documents.mjs` (7.2KB)
- `server/routes/indSequenceRoutes.mjs` (9.1KB)
- `server/routes/evidence.ts` (unused, superseded)
- `server/routes/510kRoutes.ts` (old, superseded)

**Organizational/Config (21 files):**
- `server/routes/billing-dashboard.ts` (28KB)
- `server/routes/billing.ts` (12KB)
- `server/routes/change-management.ts` (18KB)
- `server/routes/compliance-gap-analysis.ts` (20KB)
- `server/routes/molecule-routes.ts` (3.5KB)
- `server/routes/session_routes.ts` (8.4KB)
- `server/routes/simulation-routes.ts` (2.9KB)
- `server/routes/alignment-routes.ts` (1.5KB)
- `server/routes/approvalRoutes.ts` (4.7KB)
- `server/routes/cognitive-ecosystem.routes.ts` (26KB)
- `server/routes/cognitive-ecosystem.ts` (21KB)
- `server/routes/notification_routes.ts` (14KB)
- `server/routes/notifications.routes.ts` (16KB)
- `server/routes/module-subscriptions.ts` (18KB)
- `server/routes/projects-create.ts` (6.2KB)
- `server/routes/sap_routes.ts` (7.4KB)
- `server/routes/programsV2.ts` (31KB)
- `server/routes/realtime-validation.ts` (3KB)
- `server/routes/content-plan.js` (8.3KB)
- `server/routes/510kEstarRoutes.ts` (old, superseded)
- `server/routes/cerRoutes.ts` (old, superseded)

### 1B. Delete 49 Orphaned Service Files (~1MB)

These services have **zero imports** anywhere in the codebase:

- `server/services/data-integrity-service.js`
- `server/services/watermarkService.js`
- `server/services/quotaEnforcementService.js`
- `server/services/electronic-signature-service.js`
- `server/services/docusign.js`
- `server/services/contentPlanManagementService.js`
- `server/services/atomicQuotaService.js`
- `server/services/discoveryService.js`
- `server/services/confidenceScoringEngine.ts`
- `server/services/controlledVocabularyService.js`
- `server/services/delta-comparison-service.js`
- `server/services/indService.js`
- `server/services/biotechRagService.js`
- `server/services/redactionService.js`
- `server/services/diffChecker.js`
- `server/services/faersService.js`
- `server/services/relation-extraction-engine.js`
- `server/services/cmcBlueprintService.js`
- `server/services/documentExportService.ts`
- `server/services/contextAwareGuidance.js`
- `server/services/seed-default-canon.ts`
- `server/services/googleOAuthService.js`
- `server/services/esgPush.js`
- `server/services/literatureService.js`
- `server/services/factsService.js`
- `server/services/indCopilot.js`
- `server/services/metabase.js`
- `server/services/sentenceTraceabilityService.ts`
- `server/services/keywordExtractionService.ts`
- `server/services/pdfGenerator.js`
- `server/services/componentDiff.js`
- `server/services/memory-consolidation-job.ts`
- `server/services/figureGenerationService.ts`
- `server/services/enhancedPdfBuilder.js`
- `server/services/esgService.js`
- `server/services/regulator-overlay-engine.ts`
- `server/services/fdaService.js`
- `server/services/cmcEvents.js`
- `server/services/service-registry.ts`
- `server/services/referenceService.js`
- `server/services/globalChangeManagementService.js`
- `server/services/firebase-admin.ts`
- `server/services/semanticEmbeddingService.js`
- `server/services/regulatory-database.js`
- `server/services/vendorService.js`
- `server/services/externalSearch.js`
- `server/services/componentExtraction.js`
- `server/services/autoExtractionPipeline.ts`

### 1C. Remove 47 Unused Schema Tables

Per index.ts audit (lines 18-26), these tables are defined but never queried:
- 37 CDISC reference tables (defined in `cdisc-reference.ts`)
- 6 QC tables
- 2 vault tables (`vaultDocumentChunks`, `vaultEvidenceCitations`)
- 1 workflow table (`documentAttachments`)
- 1 clinical table (`pkpdCompartments`)

**Action:** Comment-archive the table definitions with a `// ARCHIVED: unused as of 2026-04-04` marker, or move to `shared/schema/_archived/`.

### 1D. Clean Commented-Out Code (2,544 files)

Run automated cleanup:
```bash
# Script to identify and remove commented code blocks (>3 lines)
# Manual review per file, but automated detection
```

**Estimated savings from Part 1:** ~1.5MB of dead code removed, ~104 files deleted.

---

## Part 2: Consolidate Duplicate Implementations

### 2A. Server Route Consolidation

**Evidence Routes (5+ files -> 1):**
- Keep: `evidence-management.routes.ts` (canonical)
- Delete: `evidence.ts`, `evidenceV2.ts`, `evidence-search.ts`
- Merge useful logic from `evidence-fabric.ts`, `evidence-ask.ts` into canonical

**CER Routes (6 files -> 3):**
- Keep: `cerv2-ai-routes.ts`, `cerv2-document-routes.ts`, `cerv2-export-routes.ts`
- Delete: `cer-routes.ts` (v1), `cerRoutes.ts` (v1), `cer-unified.ts` (unused)
- Merge `cerv2-sections.ts` + `cerv2-versions.ts` into `cerv2-document-routes.ts`

**510(k) Routes (7 files -> 2):**
- Keep: `fda510k-routes.ts` (primary), `510k-api-routes.ts` (API layer)
- Merge: `510k-compliance-routes.ts`, `510k-estar-routes.ts`, `510k-literature-routes.ts`, `510k-project.routes.ts` into primary
- Delete: `510kRoutes.ts`, `510kEstarRoutes.ts` (legacy)

**Auth Helper Deduplication (26 files -> 1 shared middleware):**
- Extract `getUser()`, `requireAuth()` into `server/middleware/auth-helpers.ts`
- Replace 26 per-file implementations with single import

### 2B. Server Service Consolidation

**Memory Systems (5 -> 2):**
- Merge `memory-service.ts` + `working-memory.ts` + `memory-context-assembler.ts` -> `memory/unified-memory.ts`
- Keep `client-intelligence-memory.ts` separate (different domain)
- Enforce via `shared-memory-contract.ts`

**Intelligence Systems (6+ -> 2):**
- Keep `intelligence/` (RIM) as canonical intelligence layer
- Merge `intelligence-engine/` claim/evidence/risk logic into `intelligence/`
- Keep `client-intelligence-memory.ts` as client-tier wrapper
- Deprecate standalone `user-intelligence.ts`, `module-intelligence.ts` by migrating their logic into RIM

**Contradiction/Decision/Assumption (5 -> 1 directory):**
- Create `server/services/resolution/` directory
- Move: `contradiction-engine-service.ts`, `contradiction-consequence-service.ts`, `cmc-impact-contradiction-engine.ts`, `decision-record-service.ts`, `decision-lifecycle-service.ts`, `assumption-registry-service.ts`
- Single barrel export via `index.ts`

**Literature (5 -> 1 module):**
- Consolidate `LiteratureService.ts`, `LiteratureAggregatorService.ts`, `LiteratureSummarizerService.ts` into `literature/` with 3 internal functions
- Merge `academic-knowledge-service.ts` logic

**FDA/Compliance (5 -> 2):**
- Merge `FDAComplianceTracker.ts` + `FDA510kTemplateServiceBackend.ts` into `FDAFormGenerator.ts`
- Keep `part11ComplianceService.ts` separate (21 CFR Part 11)

### 2C. Client Component Consolidation

**DocuSharePanel (8 variants -> 1):**
- Audit all 8 versions, identify superset of features
- Create single `DocuSharePanel.tsx` in `concept2cure/components/documents/`
- Delete all 8 variants after migration

**Compliance Dashboards (6 variants -> 1):**
- Merge into single `ComplianceDashboard.tsx`
- Use props/config for CER vs FDA vs regulatory vs portal variants

**Document Editors (10+ variants -> 1 canonical):**
- `UnifiedDocumentEditor.tsx` is already designated canonical per CLAUDE.md
- Delete: `EnhancedDocumentEditor.jsx`, `MedicalDeviceDocumentEditor.jsx`, `RegulatoryRichTextEditor.jsx`
- Ensure EditorPanel.tsx delegates to UnifiedDocumentEditor

**Estimated savings from Part 2:** ~500KB of duplicated code eliminated.

---

## Part 3: Split Monolithic Files

### 3A. Server Monoliths

**`server/routes/concept2cure.ts` (646KB) -> 8-10 domain modules:**
```
server/routes/concept2cure/
  index.ts              # Router aggregator
  projects.ts           # Project CRUD + management
  documents.ts          # Document operations
  submissions.ts        # Submission workflows
  intelligence.ts       # Intelligence endpoints
  compliance.ts         # Compliance checks
  collaboration.ts      # Real-time collaboration
  exports.ts            # Export/download endpoints
  admin.ts              # Admin operations
  utilities.ts          # Shared route helpers (sendSuccess, sendError, getUser)
```

**`server/routes/authoring.router.ts` (165KB) + `authoring-actions.ts` (129KB) -> 5 modules:**
```
server/routes/authoring/
  index.ts              # Router aggregator
  document-crud.ts      # Document lifecycle
  ai-actions.ts         # AI-powered actions (governed)
  review-workflow.ts    # Review/approval flows
  version-control.ts    # Versioning operations
  export.ts             # Export operations
```

**`server/services/intelligent-report-engine.ts` (113KB) -> 3 modules:**
```
server/services/report-engine/
  index.ts              # Public API
  context-builder.ts    # Report context assembly
  generator.ts          # Report generation logic
  templates.ts          # Report templates/formats
```

**`server/services/lumen-context-builder.ts` (96KB) -> 3 modules:**
```
server/services/lumen/
  index.ts              # Public API
  section-context.ts    # Section-level context
  domain-context.ts     # Domain-level context
  assembler.ts          # Context composition
```

### 3B. Client Monoliths

**`ComprehensiveCMCPlatformClean.jsx` (26,553 lines) -> 8+ modules:**
- This is the single worst file in the codebase
- Must be decomposed into focused components per CMC section
- Each section panel becomes its own component

**`ZenApp.tsx` (4,063 lines) -> modular shell:**
- Extract route definitions to `ZenRoutes.tsx`
- Extract provider tree to `ZenProviders.tsx`
- Extract panel management to `ZenPanelManager.tsx`
- Keep ZenApp.tsx as thin orchestrator (~500 lines)

**`AnaPersistentPanel.tsx` (5,475 lines) -> 4 modules:**
- Extract message rendering to `ChatMessageList.tsx`
- Extract input area to `ChatInput.tsx`
- Extract slash command handling to `SlashCommandRouter.tsx`
- Keep panel as orchestrator

---

## Part 4: Schema Modularization

### 4A. Complete the Planned Extraction

The `shared/schema/index.ts` already documents 6 planned extractions. Execute them:

| New Module | Tables to Extract | Source |
|-----------|-------------------|--------|
| `core.ts` | organizations, users, sessions, projects, tenants | schema.ts |
| `documents.ts` | document_*, folders, sharepoint_* | schema.ts |
| `regulatory.ts` | cer_*, regulatory_*, ind_*, device_* | schema.ts |
| `clinical.ts` | csr_*, trials, protocols, biomarkers | schema.ts |
| `ai.ts` | rag_*, embeddings, knowledge_graph | schema.ts |
| `compliance.ts` | audit_*, compliance_*, validation | schema.ts |

**Goal:** Reduce `schema.ts` from 724KB/377 tables to <50KB with only legacy/transitional tables.

### 4B. Deduplicate `documentComments`

Currently defined in both `schema.ts` and `unified_workflow.ts`. Choose one source of truth.

### 4C. Standardize Migration Naming

- Adopt timestamp-based naming exclusively: `YYYYMMDD_description.sql`
- Resolve 20+ prefix collisions in `db/migrations/`
- Already managed by manifest — but clean up file names for human readability

---

## Part 5: Architectural Improvements

### 5A. Centralize Cross-Cutting Concerns

| Concern | Current State | Target |
|---------|--------------|--------|
| Auth helpers | 26 per-file implementations | 1 shared middleware |
| Error responses | 40+ patterns | `sendSuccess()`/`sendError()` everywhere |
| DB access in routes | Raw SQL in 40+ route files | Drizzle ORM only |
| Health endpoints | 44 definitions of `/health` | 1 central health check |
| Console logging | 1,095 files | Structured logging (Pino) |

### 5B. Migrate All Routes to Bootstrap Manifests

Currently 7 bootstrap files exist (`register-*-routes.ts`) but 151 direct imports still scatter through `server/index.ts`. Target: all routes through bootstrap manifests, zero direct imports.

### 5C. Standardize File Formats

237 `.ts` + 23 `.js` + 12 `.mjs` route files. Target: TypeScript only. Convert `.js`/`.mjs` files or delete if unused.

### 5D. Add Test Coverage Tracking

311 test files exist but no coverage metrics. Add:
- Coverage thresholds in CI
- Coverage reporting in vitest config
- Minimum 60% coverage for new code

---

## Part 6: PR & Branch Hygiene

### Findings from PR Audit

- **Total PRs analyzed:** 30+ recent PRs
- **Branch violations:** Multiple PRs from `codex/*` and `claude/*` branches (against CLAUDE.md rules)
- **Target branch:** Most PRs correctly target `concept2cure-v2`
- **Multi-agent swarms:** PRs #344-356 were a coordinated multi-agent batch (security, schema, routes)
- **Risk:** Large multi-file PRs merged without granular review

### Recommendations

1. Enforce branch naming rules via GitHub branch protection
2. Require PR reviews for changes >500 lines
3. Add CI checks that block `claude/*` branch creation
4. Track PR merge quality (files changed, review status)

---

## Execution Phases

### Phase 1: Dead Code Purge (1-2 days, zero risk)
- Delete 55 unused route files
- Delete 49 orphaned service files
- Archive 47 unused schema tables
- Remove commented-out code blocks
- **Impact:** -1.5MB, -104 files, cleaner codebase

### Phase 2: Duplicate Consolidation (3-5 days, low risk)
- Consolidate Evidence routes (5 -> 1)
- Consolidate CER routes (6 -> 3)
- Consolidate 510(k) routes (7 -> 2)
- Extract shared auth middleware
- Consolidate 8 DocuSharePanel variants
- Consolidate 6 compliance dashboard variants
- **Impact:** -500KB, single source of truth per feature

### Phase 3: Monolith Decomposition (5-8 days, medium risk)
- Split `concept2cure.ts` (646KB) into domain modules
- Split `authoring.router.ts` + `authoring-actions.ts` (294KB) into workflow modules
- Split `intelligent-report-engine.ts` (113KB)
- Split `ComprehensiveCMCPlatformClean.jsx` (26.5K lines)
- Split `ZenApp.tsx` into thin orchestrator
- **Impact:** No more monoliths, clear module boundaries

### Phase 4: Schema Modularization (2-3 days, medium risk)
- Execute 6 planned schema extractions
- Reduce `schema.ts` from 724KB to <50KB
- Standardize migration naming
- **Impact:** Modular, navigable database layer

### Phase 5: Architecture Hardening (3-5 days, low risk)
- Centralize auth, error handling, logging
- Migrate all routes to bootstrap manifests
- Convert .js/.mjs to TypeScript
- Add coverage tracking
- **Impact:** Professional, maintainable architecture

---

## Expected Outcomes

| Metric | Before | After | Reduction |
|--------|--------|-------|-----------|
| Total LOC | 1,054,086 | ~750,000 | **-29%** |
| Source Files | 2,755 | ~2,500 | **-9%** |
| Dead Route Files | 55 | 0 | **-100%** |
| Dead Service Files | 49 | 0 | **-100%** |
| Monolithic Files (>100KB) | 8+ | 0 | **-100%** |
| Duplicate Component Families | 5+ | 0 | **-100%** |
| Auth Implementations | 26 | 1 | **-96%** |
| Schema in Monolith | 377 tables | <30 | **-92%** |
| console.log Files | 1,095 | 0 | **-100%** |

**The codebase becomes:** Modular, navigable, professionally architected, with clear ownership boundaries and zero dead code. Every file earns its place. Every module has a single responsibility. Every pattern is used exactly once.

---

## Risk Mitigation

1. **Every deletion is verified** — only files with zero imports are deleted
2. **Every consolidation preserves functionality** — feature tests run before and after
3. **Every split maintains API contracts** — barrel exports ensure no broken imports
4. **Phased execution** — each phase is independently valuable and reversible
5. **Git history preserved** — use `git mv` for renames, commit messages reference this plan

---

*Report generated: 2026-04-04*
*Branch: concept2cure-v2*
*Next action: Begin Phase 1 dead code purge on user approval*
