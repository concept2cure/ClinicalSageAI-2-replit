# CONCEPT2CURE — FULL FORENSIC PLATFORM AUDIT

**Date:** March 8, 2026
**Branch:** `concept2cure-v2`
**Auditor:** Codespace Agent (automated, code-evidence-based)
**Method:** Full codebase traversal — every claim below has a file path

---

## 1. EXECUTIVE VERDICT

### Can this become one synergistic platform?

**YES, but only if major consolidation happens.**

The architecture _already supports_ unification — one PostgreSQL database (74 tables), one Express server (5,984 lines), one React frontend with one module registry (18 registered modules), one auth/tenant-isolation layer, one Drizzle ORM schema. The data model is coherent. The three client workflows (IND, 510(k), CER) share CERV2Page and CoAuthor.jsx as their main work surfaces. The infrastructure for unification exists.

**The problem is not fragmentation of architecture. The problem is fragmentation of _finish_.**

Every major workflow is 60–80% built. No workflow is 100% complete. The last 20% differs per workflow. Mock chat UIs sit in front of a real WebSocket copilot. A 35,000-line RAG engine (LumenCortex) is disabled by default. Template-based placeholders sit where OpenAI calls should be. Five vault variants do what one should do. The platform never crosses the finish line because effort keeps expanding sideways instead of drilling down.

### Can this get to market based on what exists?

**YES — the 510(k) workflow is closest.** It has 54 dedicated components, real FDA predicate search, a 17-section eSTAR builder, PDF export with regulatory headers, workflow management, and manager sign-off. Wiring CERV2 AI suggestions to OpenAI (the scaffolding is already done — auth, validation, role checks — it just returns `[PLACEHOLDER]` tokens) would close the biggest gap.

### What is the clearest path?

510(k) beta for medical device clients → CER (EU MDR) expansion → IND (biotech) after CoAuthor decomposition.

### What is the biggest lie the current product tells?

The chat surfaces. `AskLumenCopilot` and `LumenAssistant` render polished chat UIs that return hardcoded answers with simulated delays. A prospect typing a real question gets a canned response. Meanwhile, the _real_ IND Copilot WebSocket (`copilot-api.js` → `/ws/chat`) with streaming + tool calling exists but isn't the default chat experience.

### What is the biggest hidden asset?

**LumenCortex** — 35,533 lines of Python implementing enterprise-grade GraphRAG with Neo4j, 6-layer citation enforcement (attention grounding, FFN force, knowledge graph validation, NLI entailment, self-consistency, number verification), WORM-compliant audit trails with Merkle trees, multi-provider embeddings with caching, circuit breakers, and a fully functional FastAPI bridge. This is a serious, production-grade AI engine that is **disabled by default** in `server/index.ts` (line ~127: `startPythonBackend() → Promise.resolve(null)`).

---

## 2. PLATFORM TRUTH MAP

### 2.1 Codebase Scale

| Metric                       | Count                                      |
| ---------------------------- | ------------------------------------------ |
| JS/TS files                  | 2,466                                      |
| Python files                 | 181                                        |
| JS/TS lines of code          | 1,050,416                                  |
| Python lines of code         | 55,187                                     |
| Server route files           | 231                                        |
| Mounted `app.use()` handlers | 150                                        |
| React components             | 956                                        |
| Page components              | 64                                         |
| Database tables (schema)     | 74                                         |
| Module registry entries      | 18                                         |
| server/index.ts              | 5,984 lines                                |
| CoAuthor.jsx                 | 15,077 lines                               |
| CERV2Page.jsx                | 7,435 lines                                |
| Test files                   | 75 total (41 tests/, 13 client, 21 server) |

### 2.2 Module Truth Table

| Capability                  | Client Type | Frontend Path                                                                                                                | Backend Path                                                                                       | Status                                                                                      | Beta? | Disposition                         |
| --------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ----- | ----------------------------------- |
| **eCTD Co-Author**          | Biotech     | `pages/coauthor/CoAuthor.jsx` (15K lines)                                                                                    | `services/indCopilot.js` (1,209 lines), `routes/ind.ts`                                            | **REAL** — OpenAI generation, Supabase retrieval, section streaming                         | Yes   | KEEP — decompose urgently           |
| **510(k) Builder**          | Device      | `pages/csr/CERV2Page.jsx` + 54 components in `components/510k/`                                                              | `routes/510kRoutes.ts`, `services/medicalDeviceService.ts`, `services/fda510kDocumentGenerator.js` | **REAL** — predicate search, eSTAR, PDF export                                              | Yes   | KEEP — closest to ship              |
| **CER Generator**           | Device/IVD  | `pages/csr/CERV2Page.jsx` + 92 components in `components/cer/`                                                               | `services/cerGenerator.ts`, `routes/cerRoutes.ts`                                                  | **REAL** — MEDDEV 2.7/1 Rev 4, PubMed, FAERS, PDF                                           | Yes   | KEEP — second priority              |
| **EU IVDR Module**          | Diagnostics | `pages/regulatory/IVDRProjectHub.tsx`                                                                                        | `routes/ivdr-routes.ts`, `routes/ivdr-binder-routes.ts`, `workers/ivdr-pack-worker.ts`             | **REAL** — Annex VIII classifier (8 rules), 7-stage workplan, evidence binder, pack builder | Later | KEEP — feature-flagged already      |
| **Document Vault**          | All         | 5 variants: `VaultPage`, `DataRoomPage` (886 lines, best), `EmbeddedVaultBrowser`, `PredictiveVaultPage`, `VaultBrowserPage` | `routes/vault-routes.ts`                                                                           | **REAL but fragmented** — 5 variants of same concept                                        | Yes   | MERGE into DataRoomPage             |
| **Part 11 Compliance**      | All         | None (API-only)                                                                                                              | `routes/part11-compliance.ts` (888 lines)                                                          | **REAL** — e-signatures, SHA-256 chain audit, SOC2 evidence models                          | Yes   | KEEP — add UI                       |
| **LumenCortex RAG**         | All         | `pages/LumenCortex.jsx`                                                                                                      | `lumen_cortex/enterprise/` (35K lines Python), `enterprise/api_bridge.py` (FastAPI)                | **REAL but DISABLED** — GraphRAG, citation enforcement, WORM, embeddings                    | Yes   | KEEP — re-enable                    |
| **Real-time Collaboration** | All         | None confirmed                                                                                                               | `routes/realtime-collab.ts` (608 lines), `socketServer.ts` (872 lines)                             | **REAL** — Yjs CRDT rooms, Socket.IO cursor sync                                            | Later | HIDE for beta                       |
| **CMC Platform**            | Biotech     | `components/cmc/`                                                                                                            | `api/cmc/enhancedCMCService.ts` (5+ OpenAI call sites), `api/cmc/blueprintRoutes.ts`               | **REAL** — OpenAI drafting                                                                  | Later | KEEP — hide for beta                |
| **IND Copilot WebSocket**   | Biotech     | `lib/copilot-api.js` (client)                                                                                                | `services/indCopilot.js` (1,209 lines)                                                             | **REAL** — streaming, tool calling, Supabase retrieval                                      | Yes   | KEEP — make default chat            |
| **AskLumenCopilot**         | —           | `components/advisor/AskLumenCopilot.jsx`                                                                                     | None — local responses                                                                             | **MOCK** — hardcoded, simulated delay                                                       | No    | DEPRECATE                           |
| **LumenAssistant**          | —           | `components/assistant/LumenAssistant.jsx`                                                                                    | None — fixed Q&A                                                                                   | **MOCK** — no API calls                                                                     | No    | DEPRECATE                           |
| **Advisor Readiness**       | —           | `components/advisor/`                                                                                                        | `advisor-routes.js`                                                                                | **MOCK** — hardcoded 0-100 scores                                                           | No    | HIDE                                |
| **Risk Predictions**        | —           | —                                                                                                                            | `regulatory-brain-routes.js`                                                                       | **MOCK** — static data                                                                      | No    | HIDE                                |
| **CERV2 AI Suggestions**    | Device/CER  | `pages/csr/CERV2Page.jsx`                                                                                                    | `routes/cerv2-ai-routes.ts` (581 lines)                                                            | **TEMPLATE** — full auth/validation scaffolding, returns `[PLACEHOLDER]` tokens             | Yes   | KEEP — wire to OpenAI               |
| **Cognitive Ecosystem**     | —           | None                                                                                                                         | `routes/cognitive-ecosystem.ts` (491 lines)                                                        | **REAL** — LangGraph agents, FHIR, digital twins                                            | No    | HIDE for beta                       |
| **Module Subscriptions**    | All         | None                                                                                                                         | `routes/module-subscriptions.ts` (406 lines)                                                       | **REAL** — SaaS entitlement gating                                                          | Later | HIDE for beta                       |
| **Semantic Intelligence**   | Biotech     | None                                                                                                                         | `routes/semantic-intelligence-routes.ts` (468 lines)                                               | **REAL** — protocol-CSR alignment via Python subprocess                                     | Later | KEEP — hide for beta                |
| **ForesightAI**             | Biotech     | —                                                                                                                            | `services/foresight-ai-engine.ts`                                                                  | **REAL** — gpt-5/gpt-4.1 predictions, DB-backed                                             | Later | KEEP — hide for beta                |
| **AI Provider Router**      | All         | —                                                                                                                            | `services/aiProviderRouter.ts`                                                                     | **REAL** — OpenAI/Anthropic/Azure/Ollama, cost tracking, failover                           | Yes   | KEEP                                |
| **PDF/DOCX Export**         | All         | —                                                                                                                            | `server/export/renderers.ts`                                                                       | **REAL** — Puppeteer + PDFKit, 510k/PMA/CER templates                                       | Yes   | KEEP                                |
| **3 Regulatory Dashboards** | —           | `pages/admin/Regulatory*.jsx` (3 files)                                                                                      | `advisor-routes.js` (mock)                                                                         | **DUPLICATE** — Enhanced (548 lines) is only real one                                       | No    | MERGE → EnhancedRegulatoryDashboard |
| **Old SidebarNav**          | —           | `components/SidebarNav.jsx`                                                                                                  | —                                                                                                  | **DEAD** — all 8 nav items point to non-existent routes (`/study`, `/analytics`, etc.)      | No    | DELETE                              |
| **CerPage / CerModule**     | —           | `pages/csr/CerPage.jsx` (10 lines), `components/cer/CerModule.jsx` (178 lines)                                               | —                                                                                                  | **SUPERSEDED** by CERV2Page                                                                 | No    | DELETE                              |
| **CopilotService.js**       | —           | `services/copilotService.js`                                                                                                 | —                                                                                                  | **MOCK** — "in real implementation, this would..."                                          | No    | DELETE                              |
| **Aurora Assistant**        | —           | `components/assistant/AuroraAssistant.jsx`                                                                                   | —                                                                                                  | **DEAD** — unreachable                                                                      | No    | DELETE                              |
| **PredictiveVaultPage**     | —           | `pages/vault/PredictiveVaultPage.jsx`                                                                                        | —                                                                                                  | **DEMO** — hardcoded stats, not connected to real predictions                               | No    | DELETE                              |

### 2.3 Navigation Truth

**Active sidebar:** Portal-V2 `SidebarNav.tsx` → reads from `moduleRegistry.ts`

**18 registered modules in sidebar:**

| Category         | Module                  | Route                        | Wired?          |
| ---------------- | ----------------------- | ---------------------------- | --------------- |
| **Core**         | Dashboard               | `/portal/dashboard`          | Yes             |
| **Core**         | Document Vault          | `/portal/vault`              | Yes             |
| **Core**         | Project Hub             | `/portal/project-hub`        | Yes             |
| **Core**         | Timeline Planner        | `/portal/timeline-planner`   | Yes             |
| **Submissions**  | CER Generator           | `/portal/cer-generator`      | Yes             |
| **Submissions**  | 510(k) Builder          | `/portal/510k-builder`       | Yes             |
| **Submissions**  | eCTD Co-Author          | `/portal/ectd-coauthor`      | Yes             |
| **Submissions**  | EU IVDR Module          | `/portal/ivdr`               | Feature-flagged |
| **Intelligence** | Regulatory Intelligence | `/portal/regulatory-intel`   | Partial         |
| **Intelligence** | Analytics               | `/portal/analytics`          | Yes             |
| **Intelligence** | AI Assistant            | `/portal/ai-assistant`       | Beta-flagged    |
| **Intelligence** | Lumen Cortex            | `/portal/lumen-cortex`       | Beta-flagged    |
| **Operations**   | CMC Platform            | `/portal/cmc-platform`       | Yes             |
| **Operations**   | Clinical Trial Hub      | `/portal/clinical-trial`     | Partial         |
| **Operations**   | Safety Reporting        | `/portal/safety-reporting`   | Partial         |
| **Operations**   | Quality Management      | `/portal/quality-management` | Yes             |
| **Operations**   | Document Control        | `/portal/document-control`   | Yes             |
| **Operations**   | Training Center         | `/portal/training`           | Stub            |
| **System**       | Settings                | `/portal/settings`           | Yes             |

### 2.4 Database Schema Summary

**74 tables across 6 domains:**

| Domain           | Tables | Key Tables                                                                                                                                |
| ---------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **CER/Device**   | 17     | `cer_projects`, `cer_reports`, `cer_sections`, `cer_literature`, `cer_faers_data`, `cer_exports`, `device_profiles`, `device_submissions` |
| **IND/eCTD**     | 6      | `leaves`, `leaf_patches`, `leaf_citations`, `facts`, `sections`, `validation_findings`                                                    |
| **CRO/Projects** | 11     | `organizations`, `cro_clients`, `cro_studies`, `project_documents`, `project_tasks`, `project_milestones`                                 |
| **Quality/CMC**  | 15     | `quality_management_plans`, `qc_testing`, `stability_studies`, `analytical_methods`, `cmc_change_control`, `doe_*`                        |
| **Documents**    | 6      | `document_folders`, `document_audit_log`, `simple_documents`, `simple_document_versions`, `sharepoint_locks`                              |
| **System**       | 8      | `users`, `organizations`, `available_modules`, `regulatory_documents`, `reports`, `strategic_reports`                                     |
| **Compliance**   | 4      | `qmp_audit_trail`, `qmp_section_gating`, `qmp_traceability_matrix`, `obligation_updates`                                                  |

---

## 3. REAL USER FLOWS

### 3.1 Medical Device (510(k)) — MOST COMPLETE

**Current actual workflow:**

1. Login → `/concept2cure` hub
2. Create project via NewProjectWizard (5-stage: info → device template → specs → team → review)
3. Navigate to CERV2Page in 510(k) mode
4. Device intake form → predicate search (real FDA API) → select predicate
5. Substantial equivalence table (side-by-side comparison)
6. eSTAR builder — 17 FDA sections (1.0 User Fee through 17.0 Special Areas)
7. Performance testing documentation
8. Compliance check panel
9. Report generator → PDF with regulatory headers (21 CFR Part 807)
10. Manager sign-off dialog
11. _(No real FDA eSubmitter connection)_

**Missing links:** CERV2 AI auto-populate returns `[PLACEHOLDER]` tokens instead of real OpenAI calls. Predicate search has no fallback cache. Some compliance validators are stubbed.

**Broken links:** If FDA API is down, predicate finder shows empty results with no error message.

**Recommendation:** Wire cerv2-ai-routes.ts to OpenAI (scaffolding is complete — 581 lines of auth, validation, role checks, template structures). Add local predicate cache as fallback. This workflow can ship.

### 3.2 CER / EU MDR — SECOND MOST COMPLETE

**Current actual workflow:**

1. Login → Project creation
2. CERV2Page in CER mode → 8-section MEDDEV 2.7/1 Rev 4 structure
3. Device profile (class, description, intended purpose)
4. State of the art analysis
5. Literature search — **PubMed integration is real (NCBI API)**
6. Clinical data collection → FAERS integration is real (openFDA)
7. Evidence appraisal
8. Benefit-risk analysis
9. GSPR mapping (MDR Annex I)
10. PMS/PMCF plan
11. Conclusions
12. Export → **PDF export works** (Puppeteer + regulatory styling)

**Missing links:** Notified Body lookups incomplete. Some FAERS complex queries fail. Language support is English-only despite stubs.

**Recommendation:** Fix FAERS error handling. Connect LumenCortex for citation-grounded generation. This workflow is close to demoable.

### 3.3 Biotech (IND) — MOST AMBITIOUS, LEAST FINISHED

**Current actual workflow:**

1. Login → CoAuthor.jsx (15,077 lines — one file)
2. Select CTD module (1, 2.x, 3, 4, 5)
3. AI generates section content via `indCopilot.js` → real OpenAI calls with regulatory source context
4. Content atoms — structured, reusable fragments
5. Validation dashboard with compliance scoring
6. Version tracking in `leaves` + `leaf_patches` tables
7. _(eCTD XML export is mock skeleton — not real)_
8. _(Template registry falls back to generic templates)_

**Missing links:** eCTD XML backbone at CoAuthor.jsx L5030 is a mock. Real eCTD XML compliance requires ISI-format backbone generation. 588+ IND templates are mostly fallback. The indCopilot uses Supabase retrieval but Supabase credentials may not be configured.

**Broken links:** If Supabase is not configured, copilot falls back to non-retrieval mode silently. The 15K-line monolith makes debugging painful.

**Recommendation:** Decompose CoAuthor.jsx (the file itself says to — see line 12 TODO). Don't attempt IND beta until 510(k) is stable.

### 3.4 Diagnostics (IVD/IVDR) — REAL BUT NASCENT

**Current actual workflow:**

1. Login → IVDRProjectHub (feature-flagged: `ENABLE_IVDR_MODULE`)
2. 7-stage workplan: Classification → PEP → Analytical → Clinical → CER → Assembly → Submission
3. Annex VIII classification engine — 8 fully implemented rules with rule trace
4. Analytical validation tracker
5. Clinical evidence tracker (2×2 tables)
6. Evidence binder with pack builder
7. Async pack generation worker

**Missing links:** No sample data or demo flow. Feature flag blocks entry by default. IVDR-specific schema tables appear to use polymorphic device tables rather than dedicated IVDR tables.

**Recommendation:** Keep feature-flagged. Not beta-ready but the engine is real. Third priority after 510(k) and CER.

---

## 4. ARCHITECTURE COHERENCE ASSESSMENT

### What shares one substrate (good)

- **All workflows** share one PostgreSQL database via Drizzle ORM
- **All workflows** share one Express server (`server/index.ts`)
- **All workflows** share one React frontend with one routing system (Wouter)
- **All workflows** share one auth/tenant-isolation middleware stack
- **All workflows** share one module registry (`moduleRegistry.ts`)
- **All AI calls** can route through one provider router (`aiProviderRouter.ts`) — OpenAI/Anthropic/Azure/Ollama
- **All exports** share one renderer (`export/renderers.ts`) — PDF/DOCX with style packs

### What does NOT share (bad)

| System              | Fragmented Across                                                                                                          |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **Chat**            | 3 separate implementations: IND Copilot WebSocket (real), AskLumenCopilot (mock), LumenAssistant (mock)                    |
| **Vault**           | 5 page variants, each with different feature sets                                                                          |
| **Dashboard**       | 3 regulatory dashboard variants                                                                                            |
| **Retrieval**       | indCopilot uses Supabase; LumenCortex uses Neo4j + pgvector; backend uses local HashEmbeddings; frontend chat uses nothing |
| **Python services** | LumenCortex (35K lines), backend/ (16K lines), analytics-engine/ — all separate, all disabled by default                   |

### What can unify (with effort)

1. **Chat** → One chat component backed by IND Copilot WebSocket (already supports streaming + tool calls). Replace mock UIs with this.
2. **Vault** → Consolidate to DataRoomPage (886 lines, has ask panel, citation helper, CCMS integration, upload).
3. **Retrieval** → Standardize on LumenCortex as the RAG layer. It has the most sophisticated citation enforcement. Re-enable Python services.
4. **Dashboards** → One EnhancedRegulatoryDashboard with role-based panels.

### What cannot unify (accept)

- CoAuthor.jsx (IND) and CERV2Page (device/CER) serve fundamentally different document structures. CoAuthor is a free-form CTD section editor; CERV2Page is a structured form/panel system. **They should remain separate** but share components (vault, chat, export).
- The monolith `server/index.ts` at 5,984 lines should be broken up but does actually work as-is.

---

## 5. BETA PLAN BASED ON CURRENT REALITY

### 5.1 Recommended First Client Type

**Medical Device — 510(k)**

Rationale:

- 54 dedicated components already built
- Real FDA predicate search
- 17-section eSTAR builder fully structured
- PDF export works with regulatory headers
- Workflow has clear start (device intake) and clear end (manager sign-off + PDF)
- Smallest gap to "done": wire AI suggestions to OpenAI + add predicate cache

### 5.2 Recommended Hero Workflow

**Create 510(k) project → Device intake → Predicate search → AI-assisted section drafting → Compliance check → eSTAR assembly → PDF export → Sign-off**

### 5.3 Recommended Hero Output

**510(k) Summary PDF** — regulatory-formatted, includes device description, predicate comparison, substantial equivalence discussion, testing summary, citations. Already generated by `fda510kDocumentGenerator.js` through `export/renderers.ts`.

### 5.4 Modules to Keep Visible (Beta)

| Module                             | Why                            |
| ---------------------------------- | ------------------------------ |
| Dashboard                          | Landing page, project overview |
| Document Vault (DataRoomPage only) | Upload and manage evidence     |
| 510(k) Builder                     | Hero workflow                  |
| CER Generator                      | Second track, shares CERV2Page |
| eCTD Co-Author                     | Available but not primary demo |
| Settings                           | Basic config                   |

### 5.5 Modules to Hide (Beta)

| Module                   | Why                                   |
| ------------------------ | ------------------------------------- |
| EU IVDR Module           | Already feature-flagged, not ready    |
| CMC Platform             | Real but not core to beta             |
| Clinical Trial Hub       | Partial implementation                |
| Safety Reporting         | Partial                               |
| Training Center          | Stub                                  |
| Lumen Cortex (UI)        | Backend is gold — UI is sparse        |
| AI Assistant (mock chat) | Embarrassing — shows canned responses |
| Regulatory Intelligence  | Partial                               |
| Quality Management       | Real but secondary                    |
| Document Control         | Secondary                             |
| Timeline Planner         | Secondary                             |
| Platform Readiness       | Internal tool                         |
| Cognitive Ecosystem      | No UI                                 |
| Module Subscriptions     | SaaS plumbing                         |

### 5.6 Dependencies to Stabilize First

1. **PostgreSQL (Neon) connection** — the entire platform falls into DEMO_MODE without it. Ensure reliable connection + connection pooling.
2. **OpenAI API key** — 10+ backend services depend on it. No graceful degradation exists.
3. **File storage** — currently local filesystem (`uploads/`). Non-persistent across container restarts. Must map Docker volume or move to S3 for production.
4. **Predicate search fallback** — FDA API downtime = empty predicate results. Needs local cache.

### 5.7 — 30-Day Hardening Plan

| Week  | Action                                                                                                                                                                |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1** | Wire cerv2-ai-routes.ts to OpenAI (replace `[PLACEHOLDER]` tokens). Consolidate vault to DataRoomPage. Delete mock chat components (AskLumenCopilot, LumenAssistant). |
| **2** | Re-enable LumenCortex Python service. Connect citation enforcement to CERV2 section generation. Add FDA predicate local cache fallback.                               |
| **3** | Make IND Copilot WebSocket the default chat everywhere. Add Part 11 signing UI to 510(k) workflow. Stabilize export renderers.                                        |
| **4** | Integration test: full 510(k) workflow end-to-end. Fix silent mock fallbacks (evidence API, academic protocols, CSR search). Hide non-beta modules in nav.            |

### 5.8 — 60-Day Market-Ready Plan

| Week    | Action                                                                                                                                                    |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **5–6** | CER workflow polish: FAERS error handling, literature evidence linking, GSPR validation. Decompose CoAuthor.jsx into 6 components.                        |
| **7–8** | Unified onboarding flow: project wizard → automatic track selection (biotech/device/diagnostics) → relevant workspace. Deploy to staging with S3 storage. |

---

## 6. CUT LIST

### DELETE (archive and remove from routes)

| Item                   | File                                       | Reason                                                           |
| ---------------------- | ------------------------------------------ | ---------------------------------------------------------------- |
| Old SidebarNav         | `components/SidebarNav.jsx`                | All 8 routes are dead (`/study`, `/analytics`, `/predict`, etc.) |
| CerPage wrapper        | `pages/csr/CerPage.jsx`                    | 10-line redirect, superseded by CERV2Page                        |
| CerModule (old)        | `components/cer/CerModule.jsx`             | 178 lines, superseded by CERV2Page's 92 CER components           |
| CopilotService.js      | `services/copilotService.js`               | Returns "in real implementation, this would..." strings          |
| Aurora Assistant       | `components/assistant/AuroraAssistant.jsx` | Unreachable deprecated variant                                   |
| PredictiveVaultPage    | `pages/vault/PredictiveVaultPage.jsx`      | Demo page with hardcoded stats                                   |
| PredictiveVaultBrowser | `pages/vault/PredictiveVaultBrowser.jsx`   | Child of PredictiveVaultPage                                     |

### DEPRECATE (keep in code, remove from nav/routes)

| Item                    | File                                      | Reason                                             |
| ----------------------- | ----------------------------------------- | -------------------------------------------------- |
| AskLumenCopilot         | `components/advisor/AskLumenCopilot.jsx`  | Mock chat — hardcoded responses with fake delays   |
| LumenAssistant          | `components/assistant/LumenAssistant.jsx` | Mock chat — fixed Q&A, no API                      |
| Advisor routes          | `server/advisor-routes.js`                | Hardcoded 0-100 readiness scores                   |
| Regulatory Brain routes | `server/regulatory-brain-routes.js`       | Static mock risk predictions                       |
| c2c-missing-routes      | `server/routes/c2c-missing-routes.ts`     | Explicitly named "missing" — placeholder endpoints |

### MERGE

| Keep                                    | Absorb                                                              | Reason                                                       |
| --------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------ |
| DataRoomPage (886 lines)                | VaultPage, VaultBrowserPage, EmbeddedVaultBrowser                   | DataRoomPage has ask panel + citation helper + CCMS + upload |
| EnhancedRegulatoryDashboard (548 lines) | RegulatoryDashboard (53 lines), RegulatoryRiskDashboard (149 lines) | Only Enhanced fetches real data                              |
| IND Copilot WebSocket                   | Mock chat UIs                                                       | Only real chat with streaming + tool calls                   |

### HIDE FOR BETA

| Module                  | Reason                                               |
| ----------------------- | ---------------------------------------------------- |
| Cognitive Ecosystem     | LangGraph agents — no user-facing UI                 |
| Real-time Collaboration | Yjs CRDT backend — no confirmed frontend integration |
| Module Subscriptions    | SaaS plumbing — not needed pre-revenue               |
| Semantic Intelligence   | Real but requires Python subprocess                  |
| ForesightAI             | Real but secondary to core workflows                 |
| Training Center         | Stub                                                 |
| Safety Reporting        | Partial                                              |

### STOP BUILDING

| Activity               | Reason                                  |
| ---------------------- | --------------------------------------- |
| New dashboard variants | Consolidate existing 3 into 1           |
| New vault variants     | Consolidate into DataRoomPage           |
| New chat surfaces      | Wire existing WebSocket copilot         |
| New Python services    | Re-enable LumenCortex first             |
| New route files        | 231 already exist — finish what's wired |

---

## 7. PRESSURE TEST RISKS

### Technical Risks

| Risk                                    | Severity | Evidence                                                                                                               |
| --------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------- |
| **Python services disabled by default** | HIGH     | `server/index.ts` L~127: `startPythonBackend() → Promise.resolve(null)`. LumenCortex never starts.                     |
| **Supabase dependency in IND Copilot**  | HIGH     | `indCopilot.js` imports `@supabase/supabase-js`. Falls back silently if not configured. Retrieval degrades to non-RAG. |
| **Local file storage**                  | HIGH     | `uploads/` on local filesystem. Non-persistent across container restarts without Docker volume mount.                  |
| **CoAuthor.jsx monolith**               | MEDIUM   | 15,077 lines, one file. Any bug requires navigating the whole file. Explicitly marked TODO: REFACTOR at line 12.       |
| **server/index.ts monolith**            | MEDIUM   | 5,984 lines. 150 mounted route handlers. Hard to maintain.                                                             |

### Workflow Risks

| Risk                                 | Severity | Evidence                                                                                                                                    |
| ------------------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **eCTD XML is mock**                 | HIGH     | CoAuthor.jsx L5030 — XML export generates placeholder structure, not real eCTD backbone.                                                    |
| **FDA predicate search no fallback** | HIGH     | PredicateFinderPanel shows empty list when FDA API is down. No cache.                                                                       |
| **Silent mock fallbacks**            | HIGH     | `routes/evidence.ts`, `routes/academic_protocol_assessment.ts`, `routes/csr_search_routes.ts` return fake data indistinguishable from real. |

### Credibility Risks

| Risk                                           | Severity | Evidence                                                                                              |
| ---------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------- |
| **Mock chat as hero feature**                  | CRITICAL | AskLumenCopilot returns hardcoded responses. If demoed, any non-canned question exposes the mock.     |
| **4 brand names in codebase**                  | MEDIUM   | Concept2Cure, TrialSage, ClinicalSage, ClinicalSageAI all appear. Package.json says "clinicalsageai". |
| **292 schema definitions vs 74 actual tables** | LOW      | Schema file has aspirational definitions beyond what's migrated.                                      |

### Compliance Risks

| Risk                       | Severity | Evidence                                                                                                                 |
| -------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------ |
| **E-signatures lack PKI**  | MEDIUM   | `part11-compliance.ts` uses SHA-256 hash only. No X.509 certificates. Adequate for beta, not for FDA review.             |
| **Dev mode auth bypass**   | MEDIUM   | `server/middleware/auth.ts` L69: if `isDev && !authorization`, allows access. 8 other isDev softening checks.            |
| **Audit coverage limited** | MEDIUM   | Audit logging covers QC batches and file operations. Does NOT cover all user actions or AI interactions comprehensively. |

### UX Confusion Risks

| Risk                       | Severity | Evidence                                                                        |
| -------------------------- | -------- | ------------------------------------------------------------------------------- |
| **18 modules in sidebar**  | HIGH     | A new user sees 18 items across 5 categories. No guidance on where to start.    |
| **No client-type routing** | HIGH     | A biotech user and a device user see the same 18 modules. No onboarding tracks. |
| **Vault location unclear** | MEDIUM   | 5 vault variants reachable from different paths.                                |

---

## 8. FINAL RECOMMENDATION

This platform is not a pile of disconnected experiments. It is a single, coherent PostgreSQL-backed system with real regulatory intelligence, real document processing, real AI generation, and real compliance infrastructure. The architecture already supports unification — one database, one server, one module registry, one auth layer, one export engine. The problem is that engineering effort has been distributed across too many surfaces at once: 5 vault pages, 3 chat systems, 3 dashboards, a 15,077-line monolith, a 35,000-line RAG engine that is turned off. **The answer is not to re-architect. The answer is to consolidate, wire, and finish.** Push the 510(k) workflow across the finish line — it is 80% there and needs the least work. Wire the real AI (replace `[PLACEHOLDER]` tokens with actual OpenAI calls — the scaffolding is already done). Kill the mock chat surfaces. Re-enable LumenCortex. Merge the 5 vaults into 1. Hide everything that isn't ready. That is a credible beta. Everything else is sequencing, not architecture.

---

## TOP 10 FINDINGS

1. **LumenCortex (35K lines Python, production-grade RAG) is disabled by default** — the biggest hidden asset is turned off
2. **Mock chat UIs are the default experience** — real WebSocket copilot exists but isn't the primary chat
3. **CERV2 AI suggestions have complete scaffolding (auth/validation/roles/templates) but return `[PLACEHOLDER]` tokens** — a weekend of wiring to OpenAI fixes this
4. **510(k) workflow is 80%+ complete** — 54 components, real FDA search, eSTAR builder, PDF export
5. **CoAuthor.jsx is 15,077 lines in one file** — the file itself says "TODO: REFACTOR" with a 6-file decomposition plan
6. **5 vault variants exist** — DataRoomPage (886 lines) is the best; the other 4 should be absorbed
7. **All "unmounted" routes were actually mounted** — part11-compliance, realtime-collab, cognitive-ecosystem, module-subscriptions are all served
8. **Evidence API silently returns fake data** — no indicator to the frontend that responses are mock
9. **74 DB tables in a coherent Drizzle schema** — the data model is solid and already supports multi-tenant isolation
10. **IVDR module is a real Annex VIII classifier with 8 rules and a 7-stage workplan** — not a stub, just feature-flagged

## TOP 10 ACTIONS (IN ORDER)

1. Wire cerv2-ai-routes.ts to OpenAI — replace `[PLACEHOLDER]` tokens with real model calls
2. Delete/deprecate mock chat (AskLumenCopilot, LumenAssistant) — make IND Copilot WebSocket the only chat
3. Re-enable LumenCortex Python services — update `startPythonBackend()` in server/index.ts
4. Consolidate vault — DataRoomPage absorbs all 4 other variants
5. Add FDA predicate search local cache fallback
6. Hide non-beta modules from sidebar (reduce 18 → 6–7 visible)
7. Fix silent mock fallbacks — make evidence/academic/CSR search return clear "no data" instead of fake data
8. Add Part 11 signature UI to 510(k) workflow (backend is done, needs frontend panel)
9. Standardize branding to "Concept2Cure" everywhere — remove TrialSage, ClinicalSage, ClinicalSageAI references
10. Decompose CoAuthor.jsx into 6 files per its own TODO comment

## TOP 5 DECISIONS THE FOUNDER MUST MAKE NOW

1. **Which client type ships first?** — Evidence says 510(k) (medical device). Confirm or redirect.
2. **Kill the mock chat or wire it?** — The mock chat (AskLumenCopilot) is a credibility risk. Decision: delete it and expose the real WebSocket copilot, or invest in making the mock real.
3. **Re-enable LumenCortex or stay Node-only?** — 35K lines of RAG engine sit disabled. Running Python adds deployment complexity. Decision: is citation-grounded AI a beta requirement or a post-beta upgrade?
4. **Unified workspace or client-type tracks?** — Should a biotech user and a device user see the same 18-module sidebar, or should the platform route them into different module sets on login? The module registry already supports role-based visibility.
5. **Ship on current infrastructure or harden first?** — Local file storage, no S3, no Redis, database-backed polling. Adequate for a beta with <50 users. Must decide: ship now and harden later, or harden first and delay.
