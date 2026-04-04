# Concept2Cure Deep Existing-System Activation Audit

**Date:** 2026-03-16
**Branch:** `claude/product-launch-planning-OKJg0`
**Purpose:** Determine what is real, what is fake, and exactly how to wire the existing backend into one coherent beta product.

---

## 1. SURVIVING PRIMARY SURFACES

These are the only surfaces that should survive beta. Everything else must be hidden, merged, or deleted.

| # | Surface | Canonical Route | Canonical Component | Survives? |
|---|---------|----------------|-------------------|-----------|
| 1 | **RI Copilot** | `/concept2cure` | `ZenChat` via `ZenRouter` | YES |
| 2 | **Submission Builder** | `/client-portal/ectd-coauthor` | `FulleCTDCoAuthor` | YES |
| 3 | **Submission Ops** | `/submission-center` | `UnifiedSubmissionCenter` | YES |
| 4 | **CMC Platform** | `/client-portal/cmc-wizard` | `CmcWizard` | YES |
| 5 | **Clinical Trial Hub** | `/csr` | `CSRPage` / `CSRDetail` | YES (needs wiring) |
| 6 | **Evidence Search** | `/unified-suite` | `StudyRegulatoryIntelligenceSuite` | YES |
| 7 | **Document Vault** | `/client-portal/vault` | `VaultPage` | YES |
| 8 | **Report / Communication** | `/reports` | `ReportsPage` | YES (needs build-out) |
| 9 | **Mission Control** | `/concept2cure` (MissionControl tab) | `MissionControl` | YES (fold into Submission Ops or admin) |

---

## 2. EXISTING BACKEND-TO-UI ACTIVATION MAP

### 2.1 RI Copilot (`/concept2cure`)

| Dimension | Current State |
|-----------|---------------|
| **Route** | `/concept2cure`, `/concept2cure/:rest*` |
| **Component** | `ZenChat.tsx` via `ZenRouter.tsx` |
| **Intended Job** | AI front door — guidance, retrieval, drafting, governed document creation, package-aware routing |
| **Actual Behavior** | Chat interface with conversation persistence, file attachments, streaming responses. Creates `concept2cureArtifacts` records. Does NOT open a real editor. Does NOT trigger Docx Factory. Does NOT place artifacts into packages. Does NOT connect to vault. |
| **Backend Available** | AI Gateway, Multi-Agent Council (4-agent sequential), Advanced RAG, Lumen Cortex services, `concept2cure_*` tables (conversations, messages, artifacts, versions, signatures), DraftingOrchestrator, DynamicContentAssembly, Knowledge Graph, Cognitive Ecosystem |
| **Missing UI Bindings** | (1) Artifact → real editor handoff. (2) Artifact → Docx Factory formalization. (3) Artifact → vault save. (4) Artifact → eCTD package placement via `ctdSection` field. (5) Package-aware prompt context. (6) Document-family-aware creation flows. |
| **Stop-Ship Issues** | AI outputs trapped in chat. No editor for post-generation editing. No docx export pipeline from chat. No vault persistence from chat. |
| **Activation Tasks** | Wire `useDocumentActions` hook to open artifact in editor. Wire Docx Factory render from artifact content. Wire vault save after formalization. Wire `ctdSection` field for package placement. Add document-family intent classification to chat. |

### 2.2 Submission Builder (`/client-portal/ectd-coauthor`)

| Dimension | Current State |
|-----------|---------------|
| **Route** | `/client-portal/ectd-coauthor` (+ 15 legacy redirects) |
| **Component** | `FulleCTDCoAuthor.tsx` (1181 lines) |
| **Intended Job** | Package assembly, section/workstream view, artifact creation/placement, package completeness |
| **Actual Behavior** | Has eCTD Module 1-5 structure display. `DossierNavigator` shows real CTD hierarchy with progress bars. But data is passed as props — no live backend fetch of actual artifact placement state. |
| **Backend Available** | `reg_ectd_packages` table, `reg_sequences`/`reg_sequence_files` tables, `packager.ts` ZIP builder, `ectd-documents.ts` routes, `concept2cure_artifacts.ctdSection` field |
| **Missing UI Bindings** | (1) Fetch real artifacts per CTD section from DB. (2) Show actual document status per section. (3) Create missing artifacts inline. (4) Open existing artifacts in editor. (5) Real package validation (currently simulated). |
| **Stop-Ship Issues** | Package structure is display-only shell. Cannot create or place documents from this surface. Completeness percentages are not computed from real artifact state. |
| **Activation Tasks** | Query `concept2cure_artifacts` by `ctdSection` to populate section status. Add "create artifact" action per section. Add "open in editor" per existing artifact. Wire `packager.ts` for real ZIP assembly. |

### 2.3 Submission Ops (`/submission-center`)

| Dimension | Current State |
|-----------|---------------|
| **Route** | `/submission-center` |
| **Component** | `UnifiedSubmissionCenter` |
| **Intended Job** | Blockers, readiness, approvals, due states, escalation, milestone truth |
| **Actual Behavior** | MissionControl page has real enterprise hooks (`useProjectTree`, `useProjectRollup`, `useSentinelStatus`, `useSentinelFindings`, `useProjectRules`). RoleDashboard is **100% mock** with `generateMockTasks()` and `generateMockMetrics()`. |
| **Backend Available** | Enterprise hooks with `apiFetch` calls, `unified_tasks` table, `cross_module_task_links`, `workflow_stages`, `cro_milestones`, project rollup service, gatekeeper blocker logic |
| **Missing UI Bindings** | (1) Replace RoleDashboard mock data with real unified task queries. (2) Wire blocker/readiness state from gatekeeper service. (3) Wire approval queue from `concept2cure_signatures` + workflow approval tables. (4) Show real due dates from `unified_tasks.dueDate`. |
| **Stop-Ship Issues** | RoleDashboard is entirely fake. Enterprise API endpoints (`/api/enterprise/*`) may not exist as HTTP routes. |
| **Activation Tasks** | Expose enterprise service endpoints if missing. Replace mock data generators with real queries. Wire approval queue. Wire blocker summary. |

### 2.4 CMC Platform (`/client-portal/cmc-wizard`)

| Dimension | Current State |
|-----------|---------------|
| **Route** | `/client-portal/cmc-wizard` (+ `/cmc-wizard`, `/cmc-blueprint`) |
| **Component** | `CmcWizard.tsx` |
| **Intended Job** | CMC-specific drafting, review, readiness, issue work |
| **Actual Behavior** | **REAL** — ICH guardrail checking (Q1A-Q6), impurity tracking with reporting/identification/qualification thresholds, specification management. Has `cmcService.ts` with real `apiRequest()` calls. |
| **Backend Available** | `stability.router.ts` (103KB), `quality.router.ts` (55KB), `quality.templates.router.ts`, Module 3 services, manufacturing services |
| **Missing UI Bindings** | (1) Connect CMC artifacts to Submission Builder Module 3 placement. (2) Connect CMC documents to vault. (3) Add CMC-specific Docx Factory templates. |
| **Stop-Ship Issues** | Mostly functional. Main gap is integration with the document pipeline. |
| **Activation Tasks** | Wire CMC spec/stability outputs to artifact creation. Connect to vault. Add Module 3 placement. |

### 2.5 Clinical Trial Hub (`/csr`)

| Dimension | Current State |
|-----------|---------------|
| **Route** | `/csr`, `/csr/:id` |
| **Component** | `CSRPage` (670 lines), `CSRDetail` |
| **Intended Job** | Protocol, IB, SAP, CSR, study architecture work |
| **Actual Behavior** | CSR listing and detail views exist. `StudyProtocolDesigner` component has real study design types (9 designs, 7 phases), endpoint selection, power calculations. But no backend data integration — UI-only with placeholder callbacks. |
| **Backend Available** | `StudyDesignAgent` service, `ClinicalIntelligenceService`, `ForesightAI` engine, `CSRSearchService`, regulatory submissions tables |
| **Missing UI Bindings** | (1) Wire StudyProtocolDesigner to backend services. (2) Wire CSR creation to artifact system. (3) Connect clinical docs to Submission Builder Module 4/5. |
| **Stop-Ship Issues** | No backend data flow. Study design is UI-only. CSR pages may show placeholder content. |
| **Activation Tasks** | Wire study design agent to protocol designer. Wire CSR generation service. Connect to artifact + vault + package pipeline. |

### 2.6 Evidence Search (`/unified-suite`)

| Dimension | Current State |
|-----------|---------------|
| **Route** | `/unified-suite` (+ 5 legacy redirects) |
| **Component** | `StudyRegulatoryIntelligenceSuite` |
| **Intended Job** | Evidence, precedent, semantic retrieval, guided support for drafting and decisions |
| **Actual Behavior** | `RegulatoryIntelligence` component has 8 global agencies, 7 therapeutic areas, real document type taxonomy. Search/filter/bookmark UI. But evidence search API is NOT exposed as HTTP route despite `evidence.ts` service existing. |
| **Backend Available** | Advanced RAG Pipeline, Semantic Search Service, Enhanced Embedding Service, Knowledge Graph, `evidence.ts` service, `kgQuery.ts`, CSR Search Service, pgvector infrastructure |
| **Missing UI Bindings** | (1) Expose evidence search service as HTTP endpoint. (2) Wire search results to RI Copilot context. (3) Wire "use in draft" action from evidence to artifact creation. (4) Wire knowledge graph queries to UI. |
| **Stop-Ship Issues** | Backend retrieval is strong but not exposed to frontend. Search may return no results because API route doesn't exist. |
| **Activation Tasks** | Create `/api/evidence/search` route wrapping existing service. Wire RAG pipeline to search UI. Add handoff actions to RI Copilot and editor. |

### 2.7 Document Vault (`/client-portal/vault`)

| Dimension | Current State |
|-----------|---------------|
| **Route** | `/client-portal/vault` (+ 6 legacy redirects) |
| **Component** | `VaultPage` |
| **Intended Job** | Governed system of record — versions, provenance, compare, export/archive, approval/publish basis |
| **Actual Behavior** | Real document upload/management with `ProjectKnowledge` hook. File type detection, metadata, download/delete actions. `DocumentIntelligenceService` has real smart tagging (11 tag types), version diffing, citation/cross-reference tracking. |
| **Backend Available** | `vault-dms.js` routes, `vault.ts` schema with embeddings, `vault-auto.ts` for submission package ingest, `DocumentOrchestrationService`, `vaultDocuments` table with S3 storage + processing pipeline |
| **Missing UI Bindings** | (1) Wire concept2cure artifacts INTO vault as governed documents. (2) Wire version comparison UI. (3) Wire approval/publish status display. (4) Wire vault → package placement. (5) Wire vault → Docx Factory for re-rendering. |
| **Stop-Ship Issues** | Vault and artifacts are separate systems with no automatic linking. Documents uploaded to vault are not the same as artifacts created by RI Copilot. |
| **Activation Tasks** | Create artifact-to-vault promotion flow. Wire version comparison. Add approval status to vault entries. Connect vault documents to package placement. |

### 2.8 Report / Communication Center (`/reports`)

| Dimension | Current State |
|-----------|---------------|
| **Route** | `/reports`, `/reports-dashboard`, `/cer-reports` |
| **Component** | `ReportsPage`, `ReportsDashboard` |
| **Intended Job** | Readiness briefs, exception summaries, sponsor/CRO handoffs, transmittals, communication history |
| **Actual Behavior** | **BLANK / MINIMAL** — `MorningBriefing` component exists but is placeholder. No report generation UI. No transmittal generation. No communication history. |
| **Backend Available** | `digest.ts` (Slack digest + calendar event generation), `emailService.ts`, `notify.ts`, `report-generator-service.ts`, Docx Factory templates, DynamicContentAssembly |
| **Missing UI Bindings** | Everything. This surface needs to be built from scratch using existing backend services. |
| **Stop-Ship Issues** | Entire surface is missing. No readiness briefs. No sponsor handoffs. No transmittals. |
| **Activation Tasks** | Build report listing page. Wire `report-generator-service` for readiness briefs. Wire Docx Factory for formal output. Wire digest service for scheduled reports. Add transmittal creation flow. |

---

## 3. RI COPILOT DEEP ACTIVATION MAP

### 3.1 Existing Chat/Copilot Surfaces

| Surface | File | Current Role | Verdict |
|---------|------|-------------|---------|
| **ZenChat** | `/client/src/concept2cure/components/chat/ZenChat.tsx` | Primary Claude.ai-style chat with streaming, attachments, artifact generation | **KEEP — canonical RI Copilot** |
| **ChatPanel** | `/client/src/concept2cure/components/chat/ChatPanel.tsx` | Section-aware sidebar chat for document editing | **KEEP — embed in editor as sidebar** |
| **LumenCortexChat** | `/client/src/components/LumenCortexChat.tsx` | Standalone Cortex chat widget | **MERGE INTO ZenChat** |
| **CortexChatWidget** | `/client/src/portal-v2/components/cortex/CortexChatWidget.tsx` | Portal V2 Cortex chat | **MERGE INTO ZenChat** |
| **AIAssistant V3** | `/client/src/portal-v2/components/ai-assistant/AIAssistant.tsx` | Portal V2 AI assistant | **MERGE INTO ZenChat** |
| **AIAssistantV3** | `/client/src/components/ai/AIAssistantV3.tsx` | Generic wrapper | **MERGE INTO ZenChat** |
| **ResearchCompanion** | `/client/src/components/ResearchCompanion.tsx` | Clinical research chat | **MERGE INTO ZenChat** |
| **CSRChatPanel** | `/client/src/components/csr/CSRChatPanel.tsx` | CSR evidence chat | **MERGE INTO ChatPanel** |
| **LumenAssistant** | `/client/src/components/assistant/LumenAssistant.jsx` | Legacy | **DELETE** |
| **AuroraAssistant** | `/client/src/components/assistant/AuroraAssistant.jsx` | Legacy | **DELETE** |
| **LumenAiAssistant** | `/client/src/components/assistant/LumenAiAssistant.jsx` | Legacy | **DELETE** |
| **StudyDesignAssistant** | `/client/src/components/assistant/StudyDesignAssistant.jsx` | Legacy | **DELETE** |
| **RegulatoryQAAssistant** | `/client/src/components/assistant/RegulatoryQAAssistant.jsx` | Legacy | **DELETE** |

**Result:** 2 survivors (ZenChat + ChatPanel). 5 merge targets. 5+ deletions.

### 3.2 Canonical Routes/Services for RI Copilot

| Layer | Canonical Choice | File |
|-------|-----------------|------|
| **User-facing chat** | ZenChat | `/client/src/concept2cure/components/chat/ZenChat.tsx` |
| **Chat hook** | useCortexChat | `/client/src/concept2cure/hooks/useCortex.ts` |
| **Backend chat route** | `/api/chat` + cortex-unified | `/server/routes/chat.ts`, `/server/routes/cortex-unified.ts` |
| **AI provider routing** | AI Gateway | `/server/services/ai-gateway/gateway.ts` |
| **Multi-agent drafting** | Multi-Agent Council | `/server/services/multi-agent-council.ts` |
| **Client-side orchestration** | DraftingOrchestrator | `/client/src/services/DraftingOrchestrator.ts` |
| **Retrieval** | Advanced RAG Pipeline | `/server/services/advancedRAGPipeline.ts` |
| **Context building** | Lumen Context Builder | `/server/services/lumen-context-builder.ts` |
| **Conversation persistence** | concept2cure_conversations + messages | `/shared/schema.ts:4596-4663` |
| **Artifact persistence** | concept2cure_artifacts + versions | `/shared/schema.ts:4671-4734` |
| **Signature** | concept2cure_signatures | `/shared/schema.ts:4742-4783` |
| **Document generation** | DocxGenerator + Docx Factory | `/server/services/docxGenerator.ts`, `/server/routes/docx-factory.ts` |

### 3.3 Exact Artifact/Version Persistence Path

```
User sends message in ZenChat
  → useCortexChat → POST /api/chat (or /api/cortex-unified/*)
  → AI Gateway routes to provider (Claude for regulatory, GPT-4o for structured)
  → Response streamed back
  → If artifact detected:
      POST /api/concept2cure/projects/:projectId/artifacts
        → DOMPurify sanitizes content
        → SHA-256 contentHash calculated
        → INSERT concept2cure_artifacts (version=1, status='draft')
        → INSERT concept2cure_artifact_versions (immutable)
        → INSERT regulatory_audit_logs (action=CREATE)
        → Return artifact with artifactId
```

### 3.4 Exact Editor/Canvas/Docx/Vault Pipeline to Activate

**Current state:** Pipeline works in isolated segments but has 6 critical breaks.

```
BREAK #1: Chat → Editor
  Problem: No rich text editor exists. Editor.jsx is a textarea stub.
  Fix: Integrate TipTap or use concept2cure canvas components that already exist.
  Existing: useDocumentActions hook, ChatPanel sidebar component

BREAK #2: Artifact → Docx Factory
  Problem: No automatic triggering. User must manually call export.
  Fix: Add "Formalize as DOCX" action on artifact cards.
  Existing: POST /api/docx-factory/renders, docxGenerator.ts

BREAK #3: Docx Factory → Vault
  Problem: No direct integration. Rendered DOCX lives only as download.
  Fix: After render, auto-save to vault via vault-auto.ts
  Existing: vault-auto.ts saveSubmissionPackage(), vault-dms.js upload

BREAK #4: Artifact → eCTD Placement
  Problem: ctdSection field exists in schema but NO code uses it.
  Fix: When creating artifact, set ctdSection. Submission Builder reads it.
  Existing: concept2cure_artifacts.ctdSection column

BREAK #5: eCTD Package → Vault
  Problem: No auto-trigger after package validation.
  Fix: After package ZIP creation, auto-ingest to vault.
  Existing: vault-auto.ts, packager.ts

BREAK #6: Approval → Document Lock
  Problem: Signatures recorded but don't lock vault documents.
  Fix: After signature, update artifact status to 'locked' and vault doc status.
  Existing: concept2cure_signatures (append-only), artifact status field
```

### 3.5 First Beta Document Families to Support in RI Copilot

| Priority | Document Family | Package Mode | ctdSection |
|----------|----------------|-------------|------------|
| 1 | Cover Letter | All | m1 |
| 2 | Device Description | 510(k) | device-description |
| 3 | Predicate Comparison / SE Summary | 510(k) | se-summary |
| 4 | CER Executive Summary | Device/CER | cer-summary |
| 5 | Protocol Synopsis | IND/NDA | m5-protocol |
| 6 | CMC Overview (Module 3 QOS) | IND/NDA/BLA | m3-qos |
| 7 | IND Cover Letter | IND | m1-cover |
| 8 | Readiness Memo | All | operational |
| 9 | Sponsor Handoff Brief | All | operational |
| 10 | Transmittal | All | operational |

---

## 4. KEEP / MERGE / RENAME / HIDE / DELETE TABLE

### Primary Surfaces

| Surface | Current Route | Verdict | Action |
|---------|--------------|---------|--------|
| ZenChat (RI Copilot) | `/concept2cure` | **KEEP** | Canonical AI front door |
| eCTD Co-Author | `/client-portal/ectd-coauthor` | **KEEP** | Canonical Submission Builder |
| CERV2Page | `/cerv2` | **KEEP** | Canonical Device/CER builder |
| UnifiedSubmissionCenter | `/submission-center` | **KEEP** | Canonical Submission Ops |
| CmcWizard | `/client-portal/cmc-wizard` | **KEEP** | Canonical CMC Platform |
| CSRPage | `/csr` | **KEEP** | Canonical Clinical Trial Hub |
| StudyRegulatoryIntelligenceSuite | `/unified-suite` | **KEEP** | Canonical Evidence Search |
| VaultPage | `/client-portal/vault` | **KEEP** | Canonical Document Vault |
| ReportsPage | `/reports` | **KEEP** | Canonical Report Center (needs build-out) |
| MissionControl | (ZenChat tab) | **KEEP** | Fold into admin or Submission Ops |

### Surfaces to Merge

| Surface | Current Route | Merge Into | Reason |
|---------|--------------|-----------|--------|
| LumenCortex standalone | `/lumen-cortex` | RI Copilot | Duplicate AI surface |
| AIAssistant (portal) | `/client-portal/ai-assistant` | RI Copilot | Duplicate AI surface |
| LumenCortexChat | (component) | ZenChat | Duplicate chat widget |
| CortexChatWidget | (component) | ZenChat | Duplicate chat widget |
| AIAssistantV3 | (component) | ZenChat | Duplicate chat widget |
| ResearchCompanion | (component) | ZenChat | Duplicate chat widget |
| CSRChatPanel | (component) | ChatPanel | Duplicate chat panel |
| CMCBlueprintGenerator | `/cmc-blueprint` | CmcWizard | Duplicate CMC surface |
| DocxFactory page | `/docx-factory` | Report Center | Should be backend service, not standalone page |
| ReportsDashboard | `/reports-dashboard` | ReportsPage | Duplicate reports surface |
| AnalyticsDashboard | `/analytics` | Mission Control / Admin | Fold into admin |

### Surfaces to Hide

| Surface | Current Route | Reason |
|---------|--------------|--------|
| QualityDashboard | `/client-portal/quality` | 33-line placeholder stub |
| Safety Reporting | `/client-portal/safety` | Placeholder, redirects to portal |
| Training Center | `/client-portal/training` | Placeholder, redirects to portal |
| Project Hub | `/client-portal/project-hub` | Placeholder, redirects to portal |
| Regulatory Intel (legacy) | `/client-portal/regulatory-intel` | Already redirects to `/unified-suite` |
| RoleDashboard | (component) | 100% mock data |

### Surfaces to Delete

| Surface | Location | Reason |
|---------|----------|--------|
| LumenAssistant | `/client/src/components/assistant/LumenAssistant.jsx` | Legacy duplicate |
| AuroraAssistant | `/client/src/components/assistant/AuroraAssistant.jsx` | Legacy duplicate |
| LumenAiAssistant | `/client/src/components/assistant/LumenAiAssistant.jsx` | Legacy duplicate |
| StudyDesignAssistant | `/client/src/components/assistant/StudyDesignAssistant.jsx` | Legacy duplicate |
| RegulatoryQAAssistant | `/client/src/components/assistant/RegulatoryQAAssistant.jsx` | Legacy duplicate |
| 10+ other legacy assistant variants | `/client/src/components/assistant/` | Dead code |

### Route Consolidation

| Action | Count | Detail |
|--------|-------|--------|
| Keep canonical routes | 10 | One per surviving surface |
| Keep legacy redirects | ~35 | Already working, low risk |
| Hide placeholder routes | 5 | Return "coming soon" or redirect |
| Merge duplicate component routes | 6 | Point to canonical component |

---

## 5. TOP 20 VISIBLE PRODUCT LIES

### LIE #1: "RI Copilot creates governed documents"
**Reality:** Chat creates `concept2cure_artifacts` records but they dead-end. No editor opens. No Docx Factory triggers. No vault save. No package placement. The artifact lives in the database but has no onward workflow.

### LIE #2: "The editor is a real document authoring surface"
**Reality:** `editor.jsx` is a textarea stub with a comment saying "consider using TipTap or ProseMirror." No rich text editing exists anywhere in the codebase.

### LIE #3: "Submission Builder shows real package completeness"
**Reality:** `DossierNavigator` displays eCTD Module 1-5 structure with progress bars, but percentages are computed from props, not from actual artifact state in the database. The `ctdSection` field on artifacts is never populated by any code.

### LIE #4: "RoleDashboard shows real operational data"
**Reality:** Contains `generateMockTasks()` and `generateMockMetrics()` functions with hardcoded fake data. Comment in code: "would connect to real backend."

### LIE #5: "Electronic signatures are production-ready"
**Reality:** `concept2cure_signatures` table is real and append-only. BUT `electronic-signature-service.js` is a placeholder with comment: "In a real implementation, this would verify against a database." Two signature systems exist — one real, one fake.

### LIE #6: "eCTD package validation works"
**Reality:** Package validation is simulated. `ectd-validate.ts` returns mock validation results. No real eCTD v4 schema validation exists.

### LIE #7: "Clinical Trial Hub is a functional module"
**Reality:** `/client-portal/study-architect` redirects to `/unified-suite`. StudyProtocolDesigner has real UI components but zero backend data integration. No protocol data persists.

### LIE #8: "8 chat/copilot surfaces provide specialized assistance"
**Reality:** ZenChat, LumenCortexChat, CortexChatWidget, AIAssistant V3, ResearchCompanion, CSRChatPanel, and legacy variants all exist as separate components using different backends and different persistence. They are not specialized — they are duplicates.

### LIE #9: "Document Vault is the system of record"
**Reality:** Vault and concept2cure artifacts are separate systems with no automatic linking. A document created by RI Copilot does not appear in the vault. A document uploaded to the vault is not available as an artifact.

### LIE #10: "Report / Communication Center exists"
**Reality:** Route exists. `MorningBriefing` component is a placeholder. No report generation, no transmittals, no sponsor handoff briefs, no communication history. Backend services (`report-generator-service.ts`, `digest.ts`) exist but have no UI.

### LIE #11: "Docx Factory is integrated into the workflow"
**Reality:** Docx Factory is a standalone page at `/docx-factory`. It is not triggered from RI Copilot, not triggered from artifact approval, and does not auto-save to vault. Generated DOCX files exist only as browser downloads.

### LIE #12: "Quality Management is a module"
**Reality:** 33-line stub component. Route exists, renders almost nothing.

### LIE #13: "Safety Reporting is a module"
**Reality:** Route redirects to client portal. No component exists.

### LIE #14: "Training Center is a module"
**Reality:** Route redirects to client portal. No component exists.

### LIE #15: "Advanced RAG powers the search experience"
**Reality:** `advancedRAGPipeline.ts` has enterprise-grade retrieval (HyDE, reranking, MMR, contextual compression). But `evidence.ts` service is not exposed as an HTTP route. The Evidence Search UI cannot access this pipeline.

### LIE #16: "Two conversation persistence systems work together"
**Reality:** Legacy `chat_threads`/`chat_messages` and newer `concept2cure_conversations`/`concept2cure_messages` exist in parallel. Different chat surfaces write to different tables. No migration or unification exists.

### LIE #17: "Approval workflows enforce document governance"
**Reality:** `approvalRoutes.ts` operates on `cer_jobs` table with batch approve/reject. No real multi-step approval workflow engine is connected to the UI. Signatures don't lock documents. Approvals don't gate package submission.

### LIE #18: "Package mode changes the experience"
**Reality:** `ProjectTimeline.tsx` defines different phases per submission type (510K, IND, NDA/BLA). But package mode does not change: navigation labels, blocker language, artifact menus, report templates, default filters, or approval classes. It only changes the timeline display.

### LIE #19: "Enterprise API endpoints power Mission Control"
**Reality:** MissionControl component calls `/api/enterprise/hierarchy`, `/api/enterprise/rules`, `/api/enterprise/sentinel/*` via `useEnterprise.ts` hooks. These endpoints may not exist as registered HTTP routes. The hooks make real `apiFetch` calls that may 404.

### LIE #20: "Python Lumen Cortex is the intelligence substrate"
**Reality:** ~50 Python files exist in `/lumen_cortex/` with GraphRAG, Neo4j, embeddings. Status is PARTIAL. The Node.js AI Gateway is the actual canonical provider router. Python backend may not be running or connected.

---

## 6. EXISTING AI LANDSCAPE / LUMEN CORTEX ACTIVATION AUDIT

### 6.1 User-Facing AI Surfaces

| Surface | Route/Location | Purpose | Status |
|---------|---------------|---------|--------|
| ZenChat | `/concept2cure` | Primary Claude.ai-style regulatory AI | **REAL — canonical** |
| ChatPanel | (sidebar component) | Section-aware document editing chat | **REAL — keep as editor sidebar** |
| LumenCortexChat | `/lumen-cortex` | Standalone Cortex chat | **DUPLICATE — merge into ZenChat** |
| CortexChatWidget | (portal component) | Portal V2 chat widget | **DUPLICATE — merge into ZenChat** |
| AIAssistant V3 | `/client-portal/ai-assistant` | Portal AI assistant | **DUPLICATE — merge into ZenChat** |
| ResearchCompanion | (component) | Clinical research chat | **DUPLICATE — merge into ZenChat** |
| CSRChatPanel | (component) | CSR evidence chat | **DUPLICATE — merge into ChatPanel** |
| 5+ legacy assistants | `/client/src/components/assistant/` | Various legacy chat | **DEAD — delete** |

### 6.2 Backend AI Services by Function

#### Chat & Conversation
| Service | File | Status |
|---------|------|--------|
| Chat Routes | `/server/routes/chat.ts` | **ACTIVE** — REST API with demo fallback |
| Cortex Unified Routes | `/server/routes/cortex-unified.ts` | **ACTIVE** — rate-limited Cortex endpoints |
| Chat Thread Helpers | `/server/services/chat-thread-helpers.ts` | **ACTIVE** — DB-backed thread management |

#### Provider Routing
| Service | File | Status |
|---------|------|--------|
| AI Gateway | `/server/services/ai-gateway/gateway.ts` | **ACTIVE — canonical** — multi-provider with fallback, health tracking, audit |
| AI Provider Router | `/server/services/aiProviderRouter.ts` | **ACTIVE** — task-based routing, cost optimization |
| Multi-Provider LLM | `/server/lib/multi-provider-llm.ts` | **ACTIVE** — survival failover layer |

**Configured routing:**
- `document_analysis` → Claude 3.5 Sonnet
- `structured_output` → GPT-4o
- `regulatory_review` → Claude 3.5 Sonnet
- `chat` → GPT-4o-mini
- `reasoning` → Claude 3.5 Sonnet

#### Retrieval / RAG
| Service | File | Status |
|---------|------|--------|
| Advanced RAG Pipeline | `/server/services/advancedRAGPipeline.ts` | **ACTIVE** — HyDE, reranking, MMR, compression |
| Enhanced Embedding Service | `/server/services/enhancedEmbeddingService.ts` | **ACTIVE** — OpenAI embeddings, batch, cache |
| Semantic Search | `/server/services/semantic-search-service.ts` | **ACTIVE** — vector similarity over vault |
| CSR Search | `/server/services/csr-search-service.ts` | **ACTIVE** — CSR-specific semantic search |
| Knowledge Graph | `/server/services/knowledge-graph.ts` | **ACTIVE** — entity extraction, graph reasoning |
| pgvector | Schema + types | **ACTIVE** — 1536/3072 dimension vectors |

#### Drafting / Orchestration
| Service | File | Status |
|---------|------|--------|
| Multi-Agent Council | `/server/services/multi-agent-council.ts` | **ACTIVE** — 4-agent sequential (Drafter→Statistician→Critic→Synthesizer) |
| LangGraph Orchestrator | `/server/services/cognitive-ecosystem/langgraph-orchestrator.service.ts` | **ACTIVE** — graph workflows, HITL, checkpointing |
| DraftingOrchestrator | `/client/src/services/DraftingOrchestrator.ts` | **ACTIVE** — client-side council session tracking |
| DynamicContentAssembly | `/server/services/DynamicContentAssembly.ts` | **ACTIVE** — conditional section assembly |

#### Document Generation
| Service | File | Status |
|---------|------|--------|
| DocxGenerator | `/server/services/docxGenerator.ts` | **ACTIVE** — npm docx library |
| Docx Factory (Shadow) | `/shadow_service/generators/docx_factory.py` | **ACTIVE** — python-docx templates |
| Document Orchestration | `/server/services/DocumentOrchestrationService.ts` | **ACTIVE** — multi-step doc workflows |
| Report Generator | `/server/services/report-generator-service.ts` | **ACTIVE** — formatted regulatory reports |
| CER Generation | `/server/services/cerGenerationService.ts` | **ACTIVE** — AI-powered CER generation |

#### Lumen Cortex Services
| Service | File | Status |
|---------|------|--------|
| Lumen Cortex Service | `/server/services/lumen-cortex-service.ts` | **ACTIVE** — SEC 10-K harvesting, ingestion |
| Lumen Context Builder | `/server/services/lumen-context-builder.ts` | **ACTIVE** — project-aware prompt building |
| Lumen Insights | `/server/services/lumen-insights-service.ts` | **ACTIVE** — regulatory insights from KG |
| Lumen Instruction Engine | `/server/services/lumen-instruction-engine.ts` | **ACTIVE** — role-aware prompt optimization |

#### Domain-Specific AI
| Service | File | Status |
|---------|------|--------|
| Predicate Intelligence | `/server/services/predicate-intelligence.ts` | **ACTIVE** — 510(k) predicate recommendations |
| Study Design Agent | `/server/services/study-design-agent-service.ts` | **ACTIVE** — protocol optimization |
| Clinical Intelligence | `/server/services/clinical-intelligence-service.ts` | **ACTIVE** — clinical data analysis |
| Regulatory Intelligence | `/server/services/regulatory-intelligence-service.ts` | **ACTIVE** — FDA guidance interpretation |
| ForesightAI Engine | `/server/services/foresight-ai-engine.ts` | **ACTIVE** — multi-modal clinical prediction |
| Citation Enforcement | `/server/services/citationEnforcementService.ts` | **ACTIVE** — RAG citation validation |
| Confidence Scoring | `/server/services/confidenceScoringEngine.ts` | **ACTIVE** — prediction confidence |

#### Compliance & Audit
| Service | File | Status |
|---------|------|--------|
| AI Gateway Audit | `/server/services/ai-gateway/audit.ts` | **ACTIVE** — full request logging |
| Prompt Injection Protection | `/server/lib/prompt-injection-protection.ts` | **ACTIVE** — input sanitization |
| Tamper-Proof Audit | `/server/lib/tamper-proof-audit.ts` | **ACTIVE** — cryptographic integrity |
| Part 11 Compliance | `/server/services/part11ComplianceService.ts` | **ACTIVE** — 21 CFR Part 11 validation |

### 6.3 Canonical AI Stack for Beta

| Layer | Canonical Choice | Reason |
|-------|-----------------|--------|
| **User-facing assistant** | ZenChat + ChatPanel | ZenChat is the most complete; ChatPanel adds editor-sidebar capability |
| **Provider router** | AI Gateway | Central, audited, multi-provider, task-based |
| **Conversation persistence** | `concept2cure_conversations` + `concept2cure_messages` | Newer, richer schema, 21 CFR Part 11 compliant |
| **Retrieval** | Advanced RAG Pipeline + Semantic Search | Enterprise-grade with HyDE, reranking, MMR |
| **Drafting orchestration** | Multi-Agent Council | Real 4-agent workflow, audit trail |
| **Document generation** | DocxGenerator (simple) + Docx Factory (complex) | Dual-path: quick export vs template-based |
| **Context building** | Lumen Context Builder | Project-aware, vault-aware prompt assembly |

### 6.4 Duplicate / Conflicting AI Surfaces

| Surface | Verdict |
|---------|---------|
| ZenChat | **KEEP** — canonical |
| ChatPanel | **KEEP** — editor sidebar |
| LumenCortexChat | **MERGE INTO ZenChat** |
| CortexChatWidget | **MERGE INTO ZenChat** |
| AIAssistant V3 (portal) | **MERGE INTO ZenChat** |
| AIAssistantV3 (component) | **MERGE INTO ZenChat** |
| ResearchCompanion | **MERGE INTO ZenChat** |
| CSRChatPanel | **MERGE INTO ChatPanel** |
| LumenAssistant | **DELETE** |
| AuroraAssistant | **DELETE** |
| LumenAiAssistant | **DELETE** |
| StudyDesignAssistant | **DELETE** |
| RegulatoryQAAssistant | **DELETE** |
| Legacy chat_threads/chat_messages | **DEPRECATE** — migrate to concept2cure tables |

### 6.5 Top AI Product Lies

1. **AI creates governed work** — It creates artifacts that dead-end in the DB with no onward workflow
2. **8 copilot surfaces provide specialized AI** — They are duplicates using different backends
3. **Advanced RAG powers search** — Pipeline exists but has no HTTP route for the frontend
4. **Multi-Agent Council drafts documents** — Service exists but is not triggered from any UI flow
5. **Lumen Cortex is the intelligence substrate** — It's one more standalone module, not the underlying layer
6. **Knowledge Graph grounds AI outputs** — Service exists but is not consistently invoked during chat
7. **Task-based model routing optimizes quality** — AI Gateway has routing configured but not all chat surfaces use it
8. **Two conversation systems coexist** — They don't. They're parallel, unlinked, and confusing

### 6.6 Beta-First AI Activation Priorities

| Priority | What | How |
|----------|------|-----|
| **P1** | RI Copilot prompt → governed artifact draft → editor | Wire ZenChat artifact creation → open in editor (needs editor upgrade) |
| **P2** | RI Copilot prompt → formal DOCX via Docx Factory | Add "Formalize" action on artifact → POST /api/docx-factory/renders |
| **P3** | Artifact → vault save + package placement | Wire vault-auto ingest + populate ctdSection |
| **P4** | Submission Ops summaries from real backend truth | Replace RoleDashboard mocks with real unified_tasks queries |
| **P5** | Evidence Search → RI Copilot handoff | Expose evidence.ts as HTTP route, wire to chat context |
| **P6** | Report Center narrative generation | Wire report-generator-service + Docx Factory to reports UI |

---

## 7. GOLDEN BETA WORKFLOWS AND CURRENT BLOCKERS

### 7.1 Biotech/Pharma Path (IND Submission)

```
Step 1: Create project (IND type) in RI Copilot
  STATUS: WORKS — project creation via useProjects hook

Step 2: Upload background documents to project knowledge
  STATUS: WORKS — ProjectKnowledge upload with file type detection

Step 3: Ask RI Copilot to draft Module 3 QOS
  STATUS: PARTIAL — Chat generates response, creates artifact record
  BLOCKER: Artifact does not open in editor. No ctdSection set.

Step 4: Edit draft in rich editor
  STATUS: BLOCKED — No rich text editor exists (textarea stub only)

Step 5: Formalize as DOCX
  STATUS: BLOCKED — No trigger from artifact to Docx Factory

Step 6: Save to vault
  STATUS: BLOCKED — No artifact→vault pipeline

Step 7: Place in Submission Builder Module 3
  STATUS: BLOCKED — ctdSection never populated, builder doesn't query artifacts

Step 8: Submit for approval
  STATUS: BLOCKED — Approval workflow not connected to artifacts

Step 9: Generate readiness brief
  STATUS: BLOCKED — Report Center is blank
```

**Path completion: 2/9 steps work. 7 blocked.**

### 7.2 Device Path (510(k) Submission)

```
Step 1: Create project (510K type)
  STATUS: WORKS

Step 2: Use CERV2Page to build device submission
  STATUS: WORKS — CERV2Page is 7648 lines, real UI with predicate comparison

Step 3: Draft predicate comparison via RI Copilot
  STATUS: PARTIAL — Chat creates artifact, predicate intelligence service exists
  BLOCKER: No handoff from RI Copilot to CERV2Page

Step 4: Generate SE Summary
  STATUS: PARTIAL — Docx Factory has SE Matrix template
  BLOCKER: Not triggered from workflow

Step 5: Place documents in 510(k) package structure
  STATUS: BLOCKED — DossierNavigator is display-only

Step 6: Run package completeness check
  STATUS: BLOCKED — Validation is simulated

Step 7: Submit for review/approval
  STATUS: BLOCKED — Approval workflow disconnected
```

**Path completion: 2/7 steps work. 5 blocked.**

### 7.3 CER / IVDR Path

```
Step 1: Create CER project
  STATUS: WORKS — via CERV2Page

Step 2: Search for evidence/literature
  STATUS: PARTIAL — RegulatoryIntelligence component has search UI
  BLOCKER: Evidence search API not exposed

Step 3: Draft CER sections
  STATUS: PARTIAL — cerGenerationService exists
  BLOCKER: Not connected to editor or artifact pipeline

Step 4: Review/approve CER
  STATUS: BLOCKED — Approval workflow disconnected

Step 5: Export CER as formal document
  STATUS: PARTIAL — Docx export endpoint exists
  BLOCKER: Not triggered from workflow
```

**Path completion: 1/5 steps work. 4 blocked.**

### 7.4 Report/Transmittal Path

```
Step 1: Generate readiness brief from current package state
  STATUS: BLOCKED — Report Center blank, report-generator-service not exposed

Step 2: Generate sponsor handoff summary
  STATUS: BLOCKED — No UI, no route

Step 3: Create transmittal
  STATUS: BLOCKED — No UI, no route

Step 4: Send/deliver communication
  STATUS: BLOCKED — digest.ts and emailService.ts exist but no UI
```

**Path completion: 0/4 steps work. All blocked.**

### 7.5 RI Copilot Prompt-to-Document Path

```
Step 1: User types "Draft a cover letter for my 510(k) submission"
  STATUS: WORKS — ZenChat processes intent

Step 2: AI classifies intent as document creation
  STATUS: PARTIAL — No explicit intent classification layer
  BLOCKER: Chat treats all prompts as conversational

Step 3: AI identifies document family + package mode + project context
  STATUS: PARTIAL — Lumen Context Builder can build context
  BLOCKER: Not consistently invoked

Step 4: AI generates governed artifact with correct ctdSection
  STATUS: PARTIAL — Artifact created, ctdSection not set

Step 5: Artifact opens in real editor for refinement
  STATUS: BLOCKED — No editor

Step 6: User finalizes and triggers Docx Factory
  STATUS: BLOCKED — No trigger

Step 7: Formal DOCX saved to vault with provenance
  STATUS: BLOCKED — No vault integration

Step 8: Document placed in package at correct section
  STATUS: BLOCKED — No placement

Step 9: Document routed for review/approval
  STATUS: BLOCKED — No approval routing
```

**Path completion: 1/9 steps work. 8 blocked.**

---

## 8. EXACT IMPLEMENTATION SEQUENCE

### Sprint 1 — Visible Truth Reset (1 week)

| Task | Files | Action |
|------|-------|--------|
| 1.1 Hide placeholder routes | `App.jsx` | Return "Coming Soon" page for quality, safety, training, project-hub |
| 1.2 Remove RoleDashboard mock | `RoleDashboard.tsx` | Replace with "Connect to real data" empty state |
| 1.3 Redirect duplicate AI surfaces | `App.jsx` | Point `/lumen-cortex`, `/client-portal/ai-assistant` to `/concept2cure` |
| 1.4 Delete legacy assistant components | `/client/src/components/assistant/` | Remove LumenAssistant, AuroraAssistant, etc. |
| 1.5 Fix editor.jsx | `editor.jsx` | Integrate TipTap with basic markdown support |
| 1.6 Add loading/error/empty states | All surviving routes | Wrap with error boundaries, add loading skeletons |
| 1.7 Unify conversation persistence | `chat.ts` route | Route all chat to `concept2cure_*` tables |

### Sprint 2 — RI Copilot Activation (2 weeks)

| Task | Files | Action |
|------|-------|--------|
| 2.1 Add document intent classification | `chat.ts` or new middleware | Classify user prompt as question/draft/update/formalize/navigate |
| 2.2 Wire artifact → editor handoff | `ZenChat.tsx`, editor component | When artifact created, show "Open in Editor" action |
| 2.3 Set ctdSection on artifact creation | `concept2cure.ts` route | Accept ctdSection in artifact creation payload, set from intent |
| 2.4 Add "Formalize as DOCX" action | Artifact card component | POST to `/api/docx-factory/renders` with artifact content |
| 2.5 Wire Docx → vault auto-save | `docx-factory.ts` | After render, call vault-auto ingest |
| 2.6 Add document-family templates | New config file | Define first 10 document families with metadata |
| 2.7 Wire Multi-Agent Council to RI Copilot | `chat.ts` | For draft intents, invoke council instead of single-turn chat |
| 2.8 Wire RAG to RI Copilot context | `chat.ts` | Invoke Advanced RAG Pipeline before generating response |

### Sprint 3 — Submission Builder Activation (1 week)

| Task | Files | Action |
|------|-------|--------|
| 3.1 Query artifacts by ctdSection | `FulleCTDCoAuthor.tsx` | Fetch real artifacts for each package section |
| 3.2 Show artifact status per section | `DossierNavigator.tsx` | Display draft/review/approved/locked per section |
| 3.3 Add "Create" action per section | `DossierNavigator.tsx` | Open RI Copilot with pre-set document family and ctdSection |
| 3.4 Add "Open" action per existing artifact | `DossierNavigator.tsx` | Open artifact in editor |
| 3.5 Wire real package completeness calculation | `DossierNavigator.tsx` | Compute from actual artifact counts vs expected |

### Sprint 4 — Submission Ops Activation (1 week)

| Task | Files | Action |
|------|-------|--------|
| 4.1 Expose enterprise endpoints | New route file or existing | Ensure `/api/enterprise/*` routes exist and return real data |
| 4.2 Replace mock data in RoleDashboard | `RoleDashboard.tsx` | Query `unified_tasks` table for real tasks |
| 4.3 Wire blocker summary | `UnifiedSubmissionCenter` | Query gatekeeper service for real blockers |
| 4.4 Wire approval queue | New component | Show pending approvals from `concept2cure_signatures` + workflow tables |
| 4.5 Wire due date/overdue tracking | Dashboard component | Query tasks with dueDate < now |

### Sprint 5 — Module Activation (2 weeks)

| Task | Files | Action |
|------|-------|--------|
| 5.1 CMC → artifact pipeline | `CmcWizard.tsx` | Wire CMC outputs to artifact creation with ctdSection=m3-* |
| 5.2 Clinical Trial Hub data | `CSRPage`, `StudyProtocolDesigner` | Wire study design agent, CSR generation service |
| 5.3 Evidence Search API | New route `/api/evidence/search` | Expose existing evidence.ts + RAG pipeline |
| 5.4 Evidence → RI Copilot handoff | Evidence Search UI | Add "Use in draft" action that opens RI Copilot with evidence context |
| 5.5 Vault ← artifact integration | `VaultPage` | Show concept2cure artifacts in vault, add version comparison |
| 5.6 Report Center build-out | `ReportsPage` | Wire report-generator-service, add readiness brief template |
| 5.7 Transmittal creation | Report Center | Wire Docx Factory for transmittal generation |

### Sprint 6 — Beta Proof (1 week)

| Task | Proof |
|------|-------|
| 6.1 Screenshot all 9 surviving surfaces | PNG files |
| 6.2 Golden path: IND prompt-to-document | Video/screenshots showing all 9 steps |
| 6.3 Golden path: 510(k) device submission | Video/screenshots |
| 6.4 Golden path: CER generation | Video/screenshots |
| 6.5 Route smoke test | All routes return content, no blank/error |
| 6.6 Build proof | `npm run build` passes |
| 6.7 Commit hash | Tagged release |

---

## 9. PIPELINE BREAK SUMMARY — THE 6 CRITICAL FIXES

These are the 6 integration breaks that, once fixed, make the entire product work:

| # | Break | Fix | Impact |
|---|-------|-----|--------|
| 1 | **Chat → Editor** | Integrate TipTap, add "Open in Editor" on artifacts | Unlocks post-generation editing |
| 2 | **Artifact → Docx Factory** | Add "Formalize" action calling `/api/docx-factory/renders` | Unlocks formal document output |
| 3 | **Docx → Vault** | Auto-save rendered DOCX to vault via `vault-auto.ts` | Unlocks governed storage |
| 4 | **Artifact → eCTD** | Populate `ctdSection` field, Submission Builder reads it | Unlocks package assembly |
| 5 | **Evidence → Chat** | Expose evidence API, wire to RI Copilot context | Unlocks grounded drafting |
| 6 | **Approval → Lock** | After signature, set artifact status='locked' | Unlocks governance |

**Fix these 6 breaks and the product works end-to-end.**

---

## 10. FINAL ASSESSMENT

### What is real and strong
- AI Gateway with multi-provider routing and audit logging
- Multi-Agent Council with 4-agent sequential drafting
- Advanced RAG Pipeline with enterprise retrieval
- Artifact persistence with SHA-256 integrity and immutable versions
- Electronic signature table with append-only enforcement
- CMC Platform with ICH guardrail checking
- CERV2Page with 7648 lines of device submission logic
- Docx Factory with real DOCX generation (python-docx backend)
- Vault schema with embeddings and processing pipeline
- 68+ active backend AI services

### What is missing
- A real rich text editor (the #1 blocking dependency)
- The 6 pipeline integration points listed above
- Report/Communication Center UI
- Clinical Trial Hub backend data flow
- Evidence Search HTTP API
- Enterprise endpoint registration
- Package-mode-aware UI adaptation beyond timeline

### What the product needs to feel right
- Fewer surfaces, more depth
- AI that produces governed work, not disposable text
- One canonical chat, not eight
- Editor that is a real authoring surface
- Package assembly from actual artifacts
- Operational truth from real data, not mock generators
- Reports and transmittals from real package state

**The backend is 70% built. The UI is 40% wired. The pipeline has 6 breaks. Fix the breaks and the product exists.**
