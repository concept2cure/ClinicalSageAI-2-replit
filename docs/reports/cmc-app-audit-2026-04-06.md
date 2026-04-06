# CMC App Comprehensive Audit Report

**Date:** 2026-04-06  
**Auditor:** Claude Code  
**Scope:** Full-stack CMC platform — schema, backend, frontend, integration, gaps

---

## Executive Summary

The CMC platform is a **substantial, mostly real implementation** with 65+ files across backend services, API routes, frontend components, schemas, and documentation. The Module 3 Operating System (write-through convergence) is production-grade and live. However, the audit reveals **critical structural debt, orphaned code, mock subsystems, and incomplete feature coverage** that must be addressed before the platform can be considered production-ready.

**Scorecard:**

| Dimension | Score | Notes |
|-----------|-------|-------|
| Core Data Pipeline (write-through → Module 3) | 9/10 | Production-ready, live |
| API Route Coverage | 7/10 | 10/14 route groups fully real; 2 broken, 1 mock, 1 incomplete |
| Frontend Reachability | 6/10 | Main wizard works; concept2cure components orphaned |
| Schema Organization | 4/10 | Split across 3 files; duplicated tables; missing migrations |
| Test Coverage | 3/10 | 6 test files for 65+ source files |
| AnA Chat Integration | 9/10 | 18 domain prompts, context enrichment live |
| Component Governance | 9/10 | Governed components used consistently in TS files |
| TypeScript Strictness | 6/10 | TS files strict; legacy JSX components loose |

---

## 1. What Works (Production-Ready)

### 1.1 Module 3 Operating System (Core IP)

The write-through convergence pipeline is the crown jewel — live as of 2026-04-06.

| Service | File | Status |
|---------|------|--------|
| Write-Through Engine | `server/services/cmc-write-through.ts` (20 KB) | **Production** — real UPSERT to `cmc_source_objects`, provenance events, stale-section marking, transaction safety |
| Module 3 Compiler | `server/services/cmc-module3-compiler.ts` (4.3 KB) | **Production** — deterministic JSON compilation, SHA-256 hashing, lineage tracking |
| Contradiction Engine | `server/services/cmc-impact-contradiction-engine.ts` (7.1 KB) | **Production** — 8 contradiction types, severity scoring, task derivation |
| Module 3 OS Routes | `server/api/cmc/module3OperatingSystemRoutes.ts` (30 KB) | **Production** — full CRUD, write-through calls on every save |
| Module 3 Build State | `server/api/cmc/module3BuildStateRoutes.ts` (14 KB) | **Production** — stale tracking, refresh workflows |
| Module 3 Convergence | `server/api/cmc/module3ConvergenceRoutes.ts` (11 KB) | **Production** — dependency mapping, compilation orchestration |

**Write-through coverage (7 data types):**
- Drug Substance, Drug Product, Analytical Method, Stability Study
- Process Validation, Change Control, Comparability

### 1.2 Core CRUD Routes (All Real DB)

| Route File | Size | DB Engine | Audit Trail |
|------------|------|-----------|-------------|
| `projectRoutes.ts` | 22 KB | Drizzle ORM | Ownership verification |
| `stabilityRoutes.ts` | 13 KB | Raw SQL | Arrhenius shelf-life projection (real pharma science) |
| `batchRecordRoutes.ts` | 12 KB | Raw SQL | Release decision logic |
| `specificationRoutes.ts` | 8.8 KB | Raw SQL | `specification_audit_log` table |
| `documentRoutes.ts` | 16 KB | Raw SQL | Version history, complex JOINs |
| Core `routes.ts` | 25 KB | Raw SQL | Write-through on all saves |

### 1.3 AnA Chat Integration

- **18 CMC domain prompts** registered in `config/domain-prompts.ts`
- Context enrichment injects Module 3 build state (stale sections, source counts) into AnA payload
- BLA/NDA navigation contexts include CMC domain
- `/cmc` slash command enriched with Module 3 build-state

### 1.4 Frontend — Working Path

The primary user path is functional:
```
/cmc → /cmc-wizard → ComprehensiveCMCPlatformClean.jsx (26,553 lines)
```

This monolithic component includes:
- 30+ real API calls to backend
- Manufacturing process panels, analytical methods, stability, batch records
- AI suggestion engine with real API integration
- Document authoring with TipTap editor
- ICH Q-series compliance checking

---

## 2. What's Broken

### 2.1 `blueprintRoutes.ts` — WILL CRASH AT RUNTIME

**Severity: Critical**

The `/generate-blueprint` endpoint calls **5 undefined functions**:

| Function | Called At | Status |
|----------|----------|--------|
| `createWorkflowTemplates()` | Blueprint generation | **ReferenceError** — not implemented |
| `createComplianceFramework()` | Blueprint generation | **ReferenceError** — not implemented |
| `generateRiskAssessment()` | Blueprint generation | **ReferenceError** — not implemented |
| `generateInitialNextActions()` | Blueprint generation | **ReferenceError** — not implemented |
| `generateProjectTimeline()` | Blueprint generation | **ReferenceError** — not implemented |

**Impact:** Any user hitting "Generate Blueprint" will get a 500 error. The AI-powered blueprint generation (GPT-4 call) works, but post-processing crashes.

**Fix:** Implement the 5 helper functions or remove the broken codepath and return the raw AI blueprint.

### 2.2 `collaborationRoutes.ts` — 100% MOCK

**Severity: High**

All data stored in JavaScript `Map()` objects:
```typescript
let comments = new Map();
let notifications = new Map();
let activeUsers = new Map();
let realtimeConnections = new Map();
```

**Impact:** All collaboration data (comments, notifications, activity feed) is lost on every server restart. No persistence whatsoever. Code itself acknowledges: "replace with database/Redis in production."

**Fix:** Replace with database-backed storage using existing schema tables or create new collaboration tables.

### 2.3 `workflowRoutes.ts` — PARTIALLY STUBBED

**Severity: Medium**

- Workflow templates are **hardcoded in-memory JSON** (180 lines of static data)
- No database-backed template persistence
- Task creation/update endpoints may be incomplete

**Fix:** Migrate templates to database; implement full task lifecycle CRUD.

---

## 3. What's Orphaned (Real Code, Never Used)

### 3.1 Concept2Cure CMC Components (Disconnected)

These are **fully implemented, production-quality TypeScript components** that are NOT reachable from any UI route:

| Component | File | Lines | Quality | Status |
|-----------|------|-------|---------|--------|
| CMCHub | `client/src/concept2cure/components/cmc/CMCHub.tsx` | 1,075 | Production TS, uses `apiRequest()` | **Orphaned** |
| CMCCommandCenter | `client/src/concept2cure/components/cmc/CMCCommandCenter.tsx` | 248 | Production TS, governed components | **Orphaned** |
| useCMC hook | `client/src/concept2cure/hooks/useCMC.ts` | 20+ hooks | TanStack Query, cache invalidation | **Orphaned** |
| cmcService | `client/src/concept2cure/services/cmcService.ts` | 750 | Full service layer, proper types | **Orphaned** |

**These represent ~2,000+ lines of production code that duplicates what ComprehensiveCMCPlatformClean.jsx does with loose JSX.**

**Decision needed:** Either wire these into the app as the canonical CMC UI (preferred — they follow all governance rules) or delete them.

### 3.2 Type Definitions — Zero Imports

`client/src/types/cmc.d.ts` (3.3 KB) defines interfaces for MolecularStructure, Formulation, CMCBlueprintResponse, etc. **No component imports these types.** Either integrate or delete.

### 3.3 Legacy JS Route Files (Unclear Status)

These JavaScript files in `server/api/cmc/` may be unreachable:

| File | Size | Concern |
|------|------|---------|
| `audit-risk-monitor.js` | 33 KB | JS, not TS — may not be mounted |
| `cmc-copilot.js` | 21 KB | JS — AI copilot logic |
| `global-compliance.js` | 23 KB | JS — compliance engine |
| `manufacturing-tuner.js` | 17 KB | JS — manufacturing optimization |
| `preclinical-translator.js` | 19 KB | JS — preclinical data translation |
| `blueprint-generator.js` | 13 KB | JS — older blueprint generator |
| `change-impact-simulator.js` | 15 KB | JS — change impact simulation |

**These total ~141 KB of JavaScript code that may or may not be mounted.** Requires route registration audit.

---

## 4. Schema Structural Debt

### 4.1 Triple Schema Problem

CMC tables are defined in **three separate locations**:

| Location | Tables | Exported | Used by Routes |
|----------|--------|----------|----------------|
| `shared/schema.ts` (monolith) | 8 CMC tables | Yes (via barrel) | **Yes** — all core CRUD routes |
| `shared/cmc-schema.ts` | 13 CMC tables | **No** (direct import only) | Only `projectRoutes.ts` |
| `shared/schema/cmc-os.ts` | 6 Module 3 OS tables | Yes (via index.ts) | **Yes** — Module 3 routes |

### 4.2 Duplicate Table Definitions

These tables are defined in BOTH `schema.ts` and `cmc-schema.ts`:

| Table | schema.ts | cmc-schema.ts | Which Routes Use |
|-------|-----------|---------------|------------------|
| `analyticalMethods` | Lines 3419+ | Yes | schema.ts version |
| `stabilityStudies` | Lines 3477+ | Yes | schema.ts version |
| `drugSubstances` | Lines 3567+ | Yes | schema.ts version |
| `drugProducts` | Lines 3596+ | Yes | schema.ts version |

### 4.3 Tables with No Migrations

These tables are defined in `cmc-schema.ts` but have **no corresponding SQL migration files**:

- `cmcProjects`
- `workflowTemplates`
- `projectWorkflows`
- `workflowTasks`
- `riskAssessments`
- `manufacturingProcesses`
- `qualitySpecifications`
- `regulatoryDocuments`
- `complianceTracking`

**Risk:** If `db:push` hasn't been run, these tables may not exist in the database, causing silent failures.

### 4.4 Tables with No Routes

| Table (in cmc-schema.ts) | Route Coverage |
|---------------------------|----------------|
| `manufacturingProcesses` | **None** |
| `qualitySpecifications` | **None** |
| `regulatoryDocuments` | **Unclear** |
| `complianceTracking` | **None** |
| `riskAssessments` | **None** |

---

## 5. Write-Through Coverage Gaps

The write-through engine covers 7 of ~12 CMC data types:

| Data Type | Write-Through | Section Mapping |
|-----------|---------------|-----------------|
| Drug Substance | ✅ Yes | 3.2.S.* |
| Drug Product | ✅ Yes | 3.2.P.* |
| Analytical Method | ✅ Yes | 3.2.S.4, 3.2.P.5 |
| Stability Study | ✅ Yes | 3.2.S.7, 3.2.P.8 |
| Process Validation | ✅ Yes | 3.2.P.3 |
| Change Control | ✅ Yes | Impacted sections |
| Comparability | ✅ Yes | Cross-section |
| QC Testing | ❌ No | 3.2.S.4, 3.2.P.5 |
| Batch Records | ❌ No | 3.2.P.3.5 |
| Specifications | ❌ No | 3.2.S.4.1, 3.2.P.5.1 |
| Manufacturing Process (detailed) | ❌ No | 3.2.P.3 |
| Risk Assessment | ❌ No | 3.2.P.2.3 |

**Impact:** Changes to QC testing, batch records, specifications, and risk assessments do NOT automatically trigger Module 3 section staleness, creating data drift risk.

---

## 6. Test Coverage Gap

### Current Tests (6 files)

| Test | Type | Coverage |
|------|------|----------|
| `cmc-module3-compiler.test.ts` | Unit | Compiler logic |
| `cmcConvergenceMap.test.ts` | Unit | Convergence mapping |
| `module3OperatingSystemRoutes.test.ts` | Integration | OS routes |
| `cmc-direct-open.spec.ts` | E2E | Module opening |
| `cmc-screenshots.cjs` | Visual | Screenshot capture |
| `cmc-tab-smoke-v2.cjs` | Smoke | Tab functionality |

### Missing Tests (Critical)

| Missing | Why Critical |
|---------|-------------|
| Write-through service tests | Core pipeline — any regression breaks Module 3 |
| Contradiction engine tests | Business logic with 8 detection types |
| Stability Arrhenius calculation | Pharma science — wrong calculation = regulatory risk |
| Blueprint generation tests | Currently crashes — needs tests to verify fix |
| Specification audit trail tests | Regulatory compliance — audit trail must be complete |
| API contract tests | Protect UI-backend contract from regression |
| Batch record release logic tests | Release decisions must be correct |

---

## 7. Frontend Architecture Issues

### 7.1 Monolith Problem

`ComprehensiveCMCPlatformClean.jsx` is **26,553 lines** (675 KB). This is:
- Unmaintainable at this size
- Impossible to code-review effectively
- A bundle-size concern (even with code splitting)
- Written in loose JSX, not governed TypeScript

### 7.2 Dual Implementation

Two complete CMC UIs exist:

| Surface | Tech | Quality | Reachable | Lines |
|---------|------|---------|-----------|-------|
| ComprehensiveCMCPlatformClean.jsx | JSX, loose | Working but ungoverned | ✅ Yes via `/cmc-wizard` | 26,553 |
| CMCHub.tsx + CMCCommandCenter.tsx | TypeScript, strict | Governed, production-quality | ❌ No — orphaned | ~1,323 |

**This violates the UI Convergence rules in CLAUDE.md** — two competing surfaces for the same capability.

### 7.3 Component Governance Violations

The JSX components in `client/src/components/cmc/` use governed components (Button, Card, etc.) but:
- Are not TypeScript strict
- Don't use `DataStateWrapper` for loading states
- Don't use `queryKeys` registry for query keys
- Some use inline `fetch()` instead of `apiRequest()`

---

## 8. Previous Audit Gap Closure Status

From the 2026-03-23 gap assessment:

| Gap ID | Issue | Status | Evidence |
|--------|-------|--------|----------|
| CMC-001 | Blueprint Generation | 🔴 **Broken** | 5 undefined functions crash at runtime |
| CMC-002 | Analytical Methods | ✅ **Closed** | Full CRUD with write-through |
| CMC-003 | Comparability Studies | ✅ **Closed** | Write-through mapper active |
| CMC-004 | Replace Simulated Generation | 🟡 **Partial** | Collaboration routes still 100% mock |
| CMC-005 | ICH Q-Series Compliance | 🟡 **Partial** | Q1-Q6 guardrails in useCMC hook; Q7-Q12 not implemented |
| G1 | Dual CMC entrypoints | 🟡 **Open** | `/cmc` and `/cmc-wizard` still both active |
| G5 | Tab/screen sprawl | 🟡 **Open** | Not addressed |
| G7 | AnA presence | ✅ **Closed** | 18 domain prompts, context enrichment |

---

## 9. Prioritized Action Plan

### P0 — Fix What's Broken (Immediate)

| # | Action | Effort | Impact |
|---|--------|--------|--------|
| 1 | **Fix blueprintRoutes.ts** — implement 5 missing helper functions or remove broken codepath | 1-2 days | Eliminates 500 errors |
| 2 | **Replace collaborationRoutes.ts** in-memory Maps with DB persistence | 2-3 days | Data survives restarts |
| 3 | **Create migrations** for cmc-schema.ts tables that lack them (or remove unused definitions) | 1 day | Prevents schema sync failures |

### P1 — Close Structural Debt (This Sprint)

| # | Action | Effort | Impact |
|---|--------|--------|--------|
| 4 | **Consolidate schema** — merge cmc-schema.ts tables into schema.ts or schema/cmc.ts; remove duplicates | 1-2 days | Single source of truth |
| 5 | **Decide CMC UI authority** — either wire CMCHub.tsx as canonical (preferred) or delete it | 1 day | Resolves UI convergence violation |
| 6 | **Extend write-through** to cover QC Testing, Batch Records, Specifications, Risk Assessment | 2-3 days | Complete Module 3 coverage |
| 7 | **Migrate workflowRoutes.ts** from hardcoded templates to database | 1-2 days | Workflow persistence |

### P2 — Harden for Production (Next Sprint)

| # | Action | Effort | Impact |
|---|--------|--------|--------|
| 8 | **Add contract tests** for all CMC API endpoints | 3-4 days | Regression protection |
| 9 | **Add unit tests** for write-through, contradiction engine, Arrhenius calculation | 2-3 days | Business logic safety |
| 10 | **Audit legacy JS route files** — determine which are mounted, migrate to TS or delete | 2-3 days | Reduce dead code |
| 11 | **Split ComprehensiveCMCPlatformClean.jsx** into governed TS sub-components | 5-7 days | Maintainability |
| 12 | **Implement ICH Q7-Q12 compliance checks** | 3-5 days | Complete regulatory coverage |

### P3 — Polish (Backlog)

| # | Action | Effort | Impact |
|---|--------|--------|--------|
| 13 | Delete orphaned `client/src/types/cmc.d.ts` or integrate into components | 0.5 day | Clean up |
| 14 | Consolidate `/cmc` and `/cmc-wizard` routes to single entry | 0.5 day | Clean navigation |
| 15 | Add CMC-specific telemetry and usage analytics | 2-3 days | Observability |
| 16 | Role-based workflow presets per CMC persona | 3-5 days | User experience |

---

## 10. File Inventory Summary

| Category | Files | Real | Broken/Mock | Orphaned |
|----------|-------|------|-------------|----------|
| Backend Services | 4 | 4 | 0 | 0 |
| API Routes (TS) | 14 | 10 | 2 | 2 unclear |
| API Routes (JS) | 7 | Unknown | Unknown | Possibly all |
| Frontend Components | 47 JSX + 4 TSX | 47 | 0 | 4 TSX orphaned |
| Schema Files | 3 | 3 | 0 | 0 |
| Migrations | 7 | 7 | 0 | 0 |
| Tests | 6 | 6 | 0 | 0 |
| Documentation | 10+ | 10+ | 0 | 0 |
| Domain Prompts | 18 | 18 | 0 | 0 |

**Total: ~65+ CMC files, ~2.5 MB of code**

---

## Conclusion

The CMC platform has a **strong core** — the Module 3 write-through pipeline, contradiction detection, and core CRUD operations are production-grade. The AnA chat integration is solid with 18 domain prompts. However, the platform suffers from:

1. **Broken features** (blueprint generation crashes, collaboration is ephemeral)
2. **Structural debt** (triple schema, duplicate tables, missing migrations)
3. **UI convergence violation** (two complete CMC surfaces, one orphaned)
4. **Incomplete coverage** (5 of 12 data types missing write-through; ICH Q7-Q12 not implemented)
5. **Thin test coverage** (6 tests for 65+ files)

The P0 fixes (blueprint crash, collaboration persistence, migration gaps) should be addressed immediately. The P1 structural consolidation will put the platform on solid footing for production hardening.
