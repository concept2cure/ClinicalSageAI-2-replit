# ClinicalSageAI — Product Capability Map
## Full Inventory: What Works, What's Incomplete, What's Missing
### Generated 2026-04-05

---

## EXECUTIVE SUMMARY

ClinicalSageAI is a production-grade regulatory intelligence platform with **12 major capability areas**.
After the boulder-to-statue cleanup (679 dead files removed, 182K lines), every remaining system
has been audited for functional status.

| Status | Count | Meaning |
|--------|-------|---------|
| **FUNCTIONAL** | 9 systems | Mounted, wired, real data, production-ready |
| **WIRING BUG** | 2 systems | Fully built but routes not mounted — needs 5 lines of code |
| **INCOMPLETE** | 3 features | Backend ready, UI or integration partially missing |
| **SCHEMA ONLY** | 2 features | Database tables exist, no routes or services yet |

**Critical finding**: Task Management (1,388 lines, 2 route files) is fully implemented
but never registered in Express. This is a wiring bug, not missing functionality.

---

## I. DOCUMENT EDITOR & AUTHORING PIPELINE — FUNCTIONAL ✅

**The centerpiece authoring system. Fully wired, 21 CFR Part 11 compliant.**

### Server
| Component | File | Lines | Status |
|-----------|------|-------|--------|
| Authoring Router | `server/routes/authoring.router.ts` | 5,215 | MOUNTED at `/api/authoring` |
| Authoring Actions | `server/routes/authoring-actions.ts` | — | MOUNTED, governed |
| DOCX Factory | `server/services/docx/docxFactory.ts` | ~500 | FUNCTIONAL |
| Template Registry | `server/services/docx/templateRegistry.ts` | ~800 | FUNCTIONAL (7 templates) |
| Master Doc Builder | `server/services/docx/masterDocumentBuilder.ts` | ~500 | FUNCTIONAL |
| PDF Pipeline | `server/services/docx-pdf-pipeline.ts` | — | FUNCTIONAL (Python subprocess) |
| PDF Compression | `server/services/pdf-compression-service.ts` | — | FUNCTIONAL (5 quality profiles) |

### Client
| Component | File | Lines | Status |
|-----------|------|-------|--------|
| Unified Editor | `editor/UnifiedDocumentEditor.tsx` | 2,806 | ACTIVE (TipTap-based) |
| Editor Panel | `editor/EditorPanel.tsx` | ~5,000 | ACTIVE (main container) |
| 9 TipTap Extensions | `editor/extensions/` | ~14,000 | ACTIVE |
| 27 Editor UI Panels | `editor/*.tsx` | ~18,700 | ACTIVE |

### Extensions
- AI Autocomplete (ghost text, Tab to accept)
- Compliance Scanner (9 regulatory rules, real-time underlines)
- Citation Plugin (source linking)
- Track Changes (accept/reject)
- Glossary Tooltip (regulatory term definitions)
- Slash Command Menu (/ palette)
- Search & Replace (regex support)
- Comment Marks (threaded)
- Page Break

### Document Lifecycle
```
DRAFT → IN_REVIEW → APPROVED → FROZEN → E-SIGNED → EXPORTED
```

### Capabilities
- 60+ authoring API endpoints
- JWT + PIN-based electronic signatures
- Version control with revert
- AI drafting (Claude) + deficiency scanning
- Export: DOCX, PDF, XML
- Study bundle ZIP packaging

---

## II. CMC (Module 3) — FUNCTIONAL ✅

**Most mature vertical. 70+ endpoints, 21 DB tables, 7 AI helpers.**

### Server: 27 files across `server/api/cmc/` and `server/routes/`
- 11 mounted route prefixes under `/api/cmc/*`
- Module 3 Operating System (compilation, contradictions, readiness, provenance)
- 7 AI copilot helpers (blueprint, change impact, manufacturing tuner, compliance, audit monitor)
- Full CRUD for: drug substances, drug products, specs, stability, batch records, analytical methods

### Client: 55 files
- `ComprehensiveCMCPlatformClean.jsx` (26,553 lines — the main CMC UI)
- `CMCHub.tsx` + `CMCCommandCenter.tsx` (Concept2Cure integration)
- `cmcService.ts` (751 lines, 25+ API methods)
- `useCMC.ts` (459 lines, 24 React Query hooks)
- ICH Q1-Q14 compliance checking

### Status: Production-ready. No dead code found.

---

## III. 510(k) MEDICAL DEVICE — FUNCTIONAL ✅

### Server: 7 route files (after cleanup)
- `fda510k-routes.ts` (1,683 lines) — production FDA API, heavily used
- `fda510k-unified.ts` (367 lines) — gateway consolidating sub-routers
- `510k-estar-routes.ts` (183 lines) — eSTAR package generation
- `510k-literature-routes.ts` (616 lines) — literature search/cite
- `510k-project.routes.ts` (422 lines) — project wizard
- `510kRoutes.ts` (843 lines) — device profiles/predicates
- `fda510k-workflow.ts` (470 lines) — 21 CFR Part 11 workflow

### Client: 31 files in `components/510k/` + CERV2Page integration

### Status: Functional. 3 deprecated stubs removed in Phase 2.

---

## IV. IND (Investigational New Drug) — FUNCTIONAL ✅ (with mount conflict)

### Server: 11 route files
- `ind.ts` (401) — core CRUD
- `ind-generation.ts` (369) — section generation ⚠️ CONFLICTS at `/api/ind`
- `ind-autodraft.ts` (248) — auto-drafting
- `ind-pdf.ts` (784) — PDF generation/conversion
- `ind-sections.ts` (240) — section metadata
- `ind-templates.ts` (1,340) — template management
- `ind-unified.ts` (181) — gateway at `/api/ind-wizard`
- `ind-database.routes.ts` (531) — database operations
- `ind-submissions.routes.ts` (438) — submission management
- `ind-kpi.routes.ts` (364) — KPI tracking
- `ind_automation_routes.ts` (605) — automation workflows

### Known Issue
`ind.ts` and `ind-generation.ts` both mount at `/api/ind`. Express silently shadows routes.
**Fix needed**: merge generation endpoints into ind.ts or rename path.

### Status: Functional but needs mount conflict resolution.

---

## V. CER (Clinical Evaluation Report) — FUNCTIONAL ✅

### Server: 8 route files
- `cerv2-sections.ts`, `cerv2-versions.ts` (mounted)
- `cerv2-ai-routes.ts`, `cerv2-document-routes.ts`, `cerv2-export-routes.ts`
- `cer-routes.ts`, `cer-analytics-routes.ts`, `cerDeviceProfileRoutes.ts`

### Client: 51 files (comprehensive CER UI)

### Status: v2 routes mounted and active; v1 routes need audit.

---

## VI. BIOSTATISTICS — FUNCTIONAL ✅

### Server
- `server/routes/ana-biostats.ts` — 11 endpoints
- `server/routes/biostatPlatform.ts` — platform routes
- `server/services/ana-biostats/` — 12 service files (orchestrator, computation engine, judgment engine, document generator, SME routing)
- `server/services/biostat-knowledge-graph-service.ts` — knowledge graph with 9 node types, 8 edge types

### Capabilities
- Sample size & power analysis (t-tests, proportions, survival, non-inferiority, equivalence)
- Full SAP generation (Statistical Analysis Plan)
- Multiplicity strategy (Bonferroni, Hochberg, Holm, gatekeeping)
- Estimand strategy (ICH E9(R2))
- Missing data handling strategy
- 7-dimension defensibility scoring
- Knowledge graph with method-endpoint efficacy matrix

### Status: Production-grade. Some gaps in adaptive designs and subgroup analysis.

---

## VII. CSR/CTD LEARNING — FUNCTIONAL ✅

### CSR (Clinical Study Reports)
- `server/services/csr-builder.ts` — ICH E3 CSR generation
- `server/services/csr-extractor-service.ts` — CSR content parsing
- `server/services/csr-knowledge-extractor.ts` — CSR → knowledge atoms
- `server/services/csr-search-service.ts` — semantic search
- `server/services/csr-foresight-orchestrator.ts` — intelligence orchestration
- `server/routes/csr-builder-routes.ts`, `csr-analytics.ts`

### Knowledge Extraction
- Safety signal extraction (AE, SAE, DLT classification)
- Efficacy outcome parsing (ORR, PFS, OS, DOR, CR, PR)
- Biomarker correlation analysis
- Dose-exposure relationship modeling

### CTD Ingestion
- `server/services/ctd-ingestion-service.ts` — upload & onboarding
- `server/routes/ctd-onboarding.ts` — submission API
- Multi-region compliance validation (FDA, EMA, PMDA, NMPA, Health Canada, TGA)

### Status: Functional. Real extraction pipeline, not stubs.

---

## VIII. REGULATORY INTELLIGENCE (AnA + RIM) — FUNCTIONAL ✅

### AnA RI: 18 services, 13,135 lines
- Orchestrator, persona, deficiency taxonomy (80+ patterns)
- Intent detection, role adaptation, evidence discipline
- Document action routing, governance enforcement

### RIM (Regulatory Intelligence Model): 18 services in `server/services/intelligence/`
- Judgment Framework (8-dimension defensibility scoring)
- Pattern Registry (16 seed patterns + learned patterns)
- Signal Capture (two-layer: working memory + persistent)
- Learning Loop (accept/dismiss/resolve/override feedback)
- Recommendation Engine, Evidence Confidence Model
- Cross-module intelligence, readiness scoring

### CRL/RTF/EMA Prediction
- `server/services/regulatory-precedent-intelligence/crl-trigger-service.ts`
- CRL pattern analysis, RTF trigger detection
- EMA CHMP question taxonomy, advisory committee prediction

### Regulatory Correspondence
- `server/routes/regulatory-correspondence.ts` (965 lines)
- Issue parsing → severity assessment → task creation → response compilation
- Authority position learning (persisted to project memory)

### Status: Production-grade intelligence system. Continuously learns from data and feedback.

---

## IX. PROJECT MANAGER — FUNCTIONAL ✅

### Server
- `server/routes/submissionCenter.routes.ts` — consolidated project + task API
- `server/routes/projects-management.ts` — project CRUD

### Project Types
- clinical_trial, regulatory_submission, medical_device, literature_review

### Submission Types
- NDA, ANDA, BLA, 510k, IND, PMR, PMC, IVDR

### Lifecycle
```
planning → active → on-hold → completed → archived
```

### Auto-Generated Tasks
- IND: ~20 tasks (chemistry, pharmacology, toxicology, CMC)
- 510k: ~15 tasks (classification, predicate selection, equivalence)
- IVDR: ~10 tasks (classification, performance, risk management)

### Client
- `ProjectWorkspaceShell.tsx` — main workspace (file tree | editor | inspector)
- `ProjectHomeDashboard.tsx` — project overview
- `ProjectFileTree.tsx` — codespaces-style explorer

---

## X. SUBMISSION CENTER — FUNCTIONAL ✅

### Server: Mounted at `/api/submission-center`
- Project creation with auto-task generation
- Pipeline metrics dashboard
- Workflow state machine: planning → active → review → approved → submitted → archived
- CTD hierarchy (Modules 1-5)

### Client
- `SubmissionReadiness.tsx` — section status dashboard
- `DossierMap.tsx` — CTD hierarchy viewer
- `HAQManager.tsx` — health & quality tracking

---

## XI. STUDY DESIGN & PLANNING — FUNCTIONAL ✅ (partial UI)

### Server
- `server/services/study-design-agent-service.ts` — conversational design agent
- `server/routes/clinical-operations-routes.ts` — clinical trial management
- Auto-provisioned schema: studies, sites, enrollments, monitoring_visits, protocol_deviations, milestones

### Capabilities
- Study portfolio management (Phase 1-4, Observational)
- Site management with IRB tracking
- Enrollment forecasting (schema ready)
- Protocol deviation tracking
- Milestone timeline management

### Gap: Protocol builder UI incomplete (backend ready). Enrollment ML models pending.

---

## XII. DOCUMENT VAULT / DMS — FUNCTIONAL ✅

### Server
- `server/services/vaultService.ts` (147 lines) — document storage
- Storage: local filesystem with S3 abstraction layer
- Path: `storage/vault/{orgId}/{projectId}/versions/{versionId}/{filename}`
- SHA256 integrity hashing on every version
- Metadata sidecars per version

### Gap: Document locking not implemented (concurrent edit risk).
### Gap: RAG indexing tables defined but not wired (vaultDocumentChunks, vaultEvidenceCitations).

---

## CRITICAL WIRING BUGS (Fix Immediately)

### 1. Task Management Routes Not Mounted

**Impact**: 1,388 lines of fully working code unreachable via HTTP.

| File | Lines | Status |
|------|-------|--------|
| `server/routes/taskManagement.routes.ts` | 948 | BUILT, NOT MOUNTED |
| `server/routes/unifiedTasks.routes.ts` | 440 | BUILT, NOT MOUNTED |

**Fix**: Add to bootstrap:
```typescript
app.use('/api/tasks', taskManagementRoutes);
app.use('/api/regulatory/tasks', unifiedTasksRoutes);
```

### 2. IND Route Mount Conflict

**Impact**: `ind.ts` and `ind-generation.ts` both mount at `/api/ind`. Express shadows routes.

**Fix**: Merge generation endpoints into ind.ts or mount at `/api/ind-generation`.

---

## INCOMPLETE FEATURES (Backend Ready, Needs Wiring)

| Feature | What Exists | What's Missing |
|---------|------------|----------------|
| CTD Onboarding Documents | Schema + migration | No HTTP routes to manage CTD projects |
| Vault Evidence/RAG | Schema (vaultDocumentChunks, vaultEvidenceCitations) | No routes, no indexing service |
| Document Locking | Old stub (documentLocking.js) | No active lock table or enforcement |
| Protocol Builder UI | Backend agent service | Client-side wizard not built |
| Enrollment Forecasting | Schema ready | ML models not implemented |

---

## ARCHITECTURAL HEALTH SUMMARY

| Vertical | Routes | Services | Client | DB | Overall |
|----------|--------|----------|--------|----|---------|
| Document Editor | ✅ 60+ endpoints | ✅ DOCX factory + 6 services | ✅ 38 components | ✅ | **PRODUCTION** |
| CMC | ✅ 70+ endpoints | ✅ 11 routes + 7 AI helpers | ✅ 55 components | ✅ 21 tables | **PRODUCTION** |
| 510(k) | ✅ 7 route files | ✅ Services active | ✅ 31 components | ✅ | **PRODUCTION** |
| IND | ⚠️ Mount conflict | ✅ 11 route files | ⚠️ 4 components | ✅ | **FIX CONFLICT** |
| CER | ✅ v2 mounted | ✅ Services active | ✅ 51 components | ✅ | **PRODUCTION** |
| Biostatistics | ✅ 11 endpoints | ✅ 12 services + KG | ⚠️ Thin | ✅ | **PRODUCTION** |
| CSR/CTD Learning | ✅ Mounted | ✅ 6 extractors | ⚠️ Thin | ✅ | **PRODUCTION** |
| AnA + RIM | ✅ Mounted | ✅ 36 services | ✅ Chat UI | ✅ | **PRODUCTION** |
| Project Manager | ✅ Mounted | ✅ Active | ✅ Workspace shell | ✅ | **PRODUCTION** |
| Task Manager | ❌ NOT MOUNTED | ✅ 1,388 lines ready | ✅ Kanban board | ✅ | **WIRING BUG** |
| Submission Center | ✅ Mounted | ✅ Active | ✅ Readiness + Dossier | ✅ | **PRODUCTION** |
| Study Design | ✅ Mounted | ✅ Agent + clinical ops | ⚠️ No UI wizard | ✅ | **BACKEND READY** |
| Document Vault | ✅ Via submission-center | ✅ vaultService | ⚠️ Basic | ✅ | **FUNCTIONAL** |

---

## RECOMMENDED NEXT ACTIONS (Priority Order)

1. **Wire task management routes** (5 minutes, 5 lines of code)
2. **Fix IND /api/ind mount conflict** (30 minutes)
3. **Wire CTD onboarding document routes** (1 hour)
4. **Implement document locking** (2-4 hours)
5. **Wire vault evidence/RAG indexing** (4-8 hours)
6. **Build protocol builder UI** (multi-day)
