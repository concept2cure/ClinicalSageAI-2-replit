# Weave Parity Matrix

**Date:** 2026-03-27
**Purpose:** Map each Weave-visible use case to Concept2Cure equivalents with gap status.

---

## Parity Table

| # | Weave Visible Use Case | Weave Detail | C2C Component(s) | C2C File Paths | Status | Gap / Action |
|---|------------------------|-------------|-------------------|---------------|--------|-------------|
| 1 | AI-native drafting | Generate IND sections from source data (M1-M5), 97% time reduction validated with Takeda | indCopilot (AI section drafting), AnA RI (chat-driven generation), authoring-actions (in-editor AI), SubmissionAppsPanel (governed draft creation) | `server/services/indCopilot.js`, `server/routes/authoring-actions.ts`, `server/services/ana-ri/artifact-generator.ts`, `client/src/concept2cure/components/workspace/SubmissionAppsPanel.tsx` | **MATCHED** | Multiple AI drafting paths exist. Convergence needed so all land in EditorPanel. |
| 2 | AI template-driven authoring | Unified editor with template → content view switching, section or full-doc generation, customizable AI templates | FullDocumentBuilder (5-step wizard: type → agencies → info → generate → review), template tree in ProjectWorkspaceShell, EditorPanel with AI slash commands | `client/src/concept2cure/components/builder/FullDocumentBuilder.tsx`, `client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx` (template rail), `client/src/concept2cure/components/editor/EditorPanel.tsx` | **MATCHED** | Builder output already converges to EditorPanel via `onOpenInEditor`. Template tree creates artifacts directly in editor. |
| 3 | Data Room with semantic search and AI ask | Upload folders, semantic deep search, AI relevance scoring, "Ask" tab for Q&A over project documents | VaultPage (file upload/browse), AskDataRoomPanel (UI exists, backend stub), ForesightRAGService (RAG pipeline ready), deep-research-orchestrator (multi-connector search) | `client/src/concept2cure/pages/VaultPage.tsx`, `client/src/components/coauthor/AskDataRoomPanel.jsx`, `server/services/foresight-rag-service.ts`, `server/services/deep-research-orchestrator.ts` | **GAP** | AskDataRoomPanel UI exists but `/api/evidence/ask` endpoint is missing. Must wire AskDataRoomPanel → ForesightRAGService. Semantic search over vault documents not yet connected. |
| 4 | Dossier Manager as connected source of truth | Sections tied to source data, live updates when data changes, connected authoring space | DossierTree in ProjectWorkspaceShell (CTD section tree with placement), artifact `ctdSection` field linking docs to dossier positions, DossierMap (visual CTD module view) | `client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx` (dossier rail mode), `client/src/concept2cure/components/workflow/DossierMap.tsx`, `server/routes/concept2cure.ts` (placement endpoint) | **PARTIALLY MATCHED** | Dossier tree and placement exist. Missing: automatic surfacing of where changes are needed when data updates. Section readiness not yet derived from live artifact status. |
| 5 | Submission Builder with eCTD-aware assembly | Automated formatting, table/figure handling, citation management, cross-reference maintenance | SubmissionReadiness (readiness checklist), ectd-compile (eCTD 4.0 compilation), ectd-export (ZIP generation), ectd4-validator (ICH M8 validation), cerv2-export-routes (PDF/DOCX/ZIP) | `client/src/concept2cure/components/workflow/SubmissionReadiness.tsx`, `server/routes/ectd-compile.ts`, `server/routes/ectd-export.ts`, `server/services/ectd/ectd4-validator.ts`, `server/routes/cerv2-export-routes.ts` | **PARTIALLY MATCHED** | Backend compilation and export work. SubmissionReadiness exists as UI. Gap: assembly workflow not visible enough inside Tools as unified Submit flow. |
| 6 | Review with comments, redlines, source tracing, version restore | In-platform review, comment threads, redline comparison, source tracing back to origin | EditorPanel inspector panels: 'compare' (version diff), 'comments' (threads), 'review' (reviewer state), 'reviewers' (assignments), ReviewReadiness (compliance surface) | `client/src/concept2cure/components/editor/EditorPanel.tsx` (inspector panels), `client/src/concept2cure/components/provenance/DocumentVersionCompare.tsx`, `client/src/concept2cure/components/provenance/DocumentAuditReport.tsx` | **MATCHED** | Inspector panels for compare, comments, review, reviewers all exist in EditorPanel. Need to make them more discoverable as lifecycle stages. |
| 7 | Verification / source traceability / QC | Trace every claim to source, confidence scoring, contradiction detection | EditorPanel 'provenance' inspector, 'inconsistency' inspector, 'proof' inspector, 'compliance-scanner' inspector, DocumentProvenancePanel, RIM signal capture | `client/src/concept2cure/components/provenance/DocumentProvenancePanel.tsx`, `client/src/concept2cure/components/editor/EditorPanel.tsx` (inconsistency, proof, compliance-scanner panels), `server/services/intelligence/rim.ts` | **MATCHED** | Provenance, inconsistency detection, compliance scanning all exist as inspector panels. Need to surface as "Verify" lifecycle stage. |
| 8 | Governed publishing/export (DOCX, eCTD) | Governed status progression, export with audit trail, locked/approved states | Export governance (5-record chain: artifact + version + provenance + audit + snapshot), PDF/DOCX/ZIP export, artifact status lifecycle (draft → review → approved → locked) | `server/services/compute/exportGovernance.ts`, `server/routes/cerv2-export-routes.ts`, `server/export/renderers.ts` | **MATCHED** | Full governed export pipeline exists. Creates 5 interconnected DB records per export. Status lifecycle exists in concept2cureArtifacts. |
| 9 | HAQ response workflow | Ingest questions, organize, AI-draft responses from source docs and prior submissions, review/finalize | EMA question taxonomy service (backend patterns), CRL/RTF trigger services (deficiency patterns), but NO visible frontend workflow | `server/services/regulatory-precedent-intelligence/ema-question-taxonomy-service.ts`, `server/services/regulatory-precedent-intelligence/crl-trigger-service.ts` | **GAP** | Backend intelligence exists (EMA questions, CRL/RTF patterns). No visible HAQ Manager workflow in the UI. Must build: ingest → organize → draft → review → export. |
| 10 | Cross-functional collaboration in one connected environment | Authors and reviewers work in one space, audit readiness at every stage | Governed artifact workflow, reviewer assignments, signature workflow, audit trail, AnaPersistentPanel (always-available AI copilot in same workspace) | `client/src/concept2cure/components/editor/EditorPanel.tsx` (reviewers panel), `server/services/compute/exportGovernance.ts` (audit), `client/src/concept2cure/components/chat/AnaPersistentPanel.tsx` | **PARTIALLY MATCHED** | Governance and review infrastructure exist. Gap: collaboration feels like parallel inspectors, not one connected space. Need unified lifecycle visibility. |

---

## Summary

| Status | Count | Use Cases |
|--------|-------|-----------|
| **MATCHED** | 5 | #1 AI drafting, #2 Templates, #6 Review, #7 Verification, #8 Publishing |
| **PARTIALLY MATCHED** | 3 | #4 Dossier Manager, #5 Submission Builder, #10 Collaboration |
| **GAP** | 2 | #3 Data Room/Ask, #9 HAQ workflow |

---

## Where Concept2Cure Exceeds Weave (Weave Has NONE of These)

| # | Capability | C2C File Paths | Detail |
|---|-----------|---------------|--------|
| 1 | Medical device workflows (510k/PMA/CER/IVDR) | `client/src/pages/csr/CERV2Page.jsx`, `client/src/concept2cure/components/pma/PMAWorkspace.tsx` | Full device submission workflows — Weave is pharma-only |
| 2 | Biostatistics judgment engine (7 modules) | `server/services/biostatistics-judgment/`, `server/services/ana-biostats/` | Power adequacy, assumption fragility, endpoint defensibility, risk classification, role-aware interpretation |
| 3 | Regulatory precedent intelligence | `server/services/regulatory-precedent-intelligence/` | CRL/RTF trigger patterns, advisory committee risk, confidence calibration, cross-jurisdictional pathways |
| 4 | Foresight AI (approval probability) | `server/services/foresight/foresight-ai-engine.ts` | Success rate prediction, timeline estimation, risk factor analysis |
| 5 | Clinical protocol design (12 trial types) | `client/src/concept2cure/components/clinical/StudyProtocolDesigner.tsx` | Parallel RCT, crossover, adaptive, dose escalation, basket, platform, N-of-1, etc. |
| 6 | ClinicalTrials.gov MCP integration | MCP connector (live) | Direct trial data access for competitive intelligence |
| 7 | Multi-agency support (live) | AnA RI personas + lumen-context-builder | FDA + EMA + PMDA + Health Canada + TGA — Weave is FDA-only with EMA on roadmap |
| 8 | RIM (Regulatory Intelligence Model) | `server/services/intelligence/rim.ts`, `judgment-framework.ts`, `pattern-registry.ts`, `signal-capture.ts` | Compounding intelligence: 6 judgment models, 16+ seed patterns, 4 interceptors, signal accumulation |
| 9 | Multi-persona AI copilot | `server/services/ana-ri/persona.ts`, `server/services/ana-ri/orchestrator.ts` | Role-based prompt tailoring (CEO, RA lead, medical writer, clinical lead, CMC lead, investor) + deficiency taxonomy |
