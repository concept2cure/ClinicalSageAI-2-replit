# WEAVE.BIO vs CONCEPT2CURE — Competitive Gap Analysis & Execution Plan

> Generated: 2026-03-27
> Purpose: Map Weave.bio features to existing Concept2Cure capabilities, identify gaps, and build execution plan

---

## WEAVE.BIO FEATURE MAP (What They Sell)

### Core Products
1. **AutoIND** — AI-drafted IND applications (flagship, live)
2. **Submission Builder** — eCTD assembly, publishing, formatting
3. **HAQ Manager** — Health Authority Question response workflow
4. **Dossier Manager** — Single source of truth for regulatory dossier
5. **Data Room** — Document upload, semantic search, AI Q&A ("Ask" tab)
6. **Editor** — Unified authoring with AI template engine
7. **Review & Verification** — Inline review, source tracing, QC

### Key Capabilities
| # | Weave Capability | Details |
|---|-----------------|---------|
| 1 | AI IND drafting | Generate full IND sections from source data (M1-M5) |
| 2 | Data Room with semantic search | Upload folders, deep search, AI relevance scoring, "Ask" tab |
| 3 | AI Template Engine | Template → content view switching, section-level or full-doc generation |
| 4 | Dossier Manager | Sections tied to underlying data, live updates, connected authoring |
| 5 | eCTD formatting | Auto-format for eCTD submission structure |
| 6 | Table/figure generation | AI generates tables and figures from source data |
| 7 | Citation management | Intra-doc, inter-doc, and literature cross-references |
| 8 | Review with source tracing | Comment, verify, trace back to source data |
| 9 | Version-controlled audit trail | Every decision, edit, data update captured |
| 10 | HAQ/RTQ response workflow | Structured workspace for health authority question responses |
| 11 | Submission publishing | Final eCTD package assembly and publishing |
| 12 | Nonclinical summaries | 97% time reduction (100h → 3h) on nonclinical written summaries |
| 13 | CMC document support | Module 3 organization and authoring |
| 14 | ISS/ISE generation | Integrated Safety Summary / Integrated Summary of Efficacy |
| 15 | Pre-IND briefing packages | Meeting preparation documents |
| 16 | Investigator Brochure co-authoring | Real-time IB preparation |
| 17 | Veeva import/export | Integration with Veeva Vault |
| 18 | Multi-region support | FDA now, EMA/PMDA/LATAM on roadmap |

### What They DON'T Have (Our Advantage)
- No medical device support (510(k), PMA, CER) — **we have this**
- No biostatistics judgment engine — **we have a 7-module platform**
- No regulatory precedent intelligence (CRL/RTF patterns, advisory committee risk) — **we have this**
- No approval probability scoring — **we have Foresight AI**
- No clinical trial protocol design — **we have StudyProtocolDesigner**
- No ClinicalTrials.gov integration — **we have MCP connector**
- No real-time compliance scanning — **we have RIM**
- No multi-persona AI (regulatory, biostat, clinical, CMC) — **we have AnA RI personas**

---

## CONCEPT2CURE EXISTING INVENTORY (What We Have)

### FULLY IMPLEMENTED (Real Backend, Database-Backed)
| # | Capability | Files | Weave Equivalent |
|---|-----------|-------|------------------|
| 1 | IND auto-drafting (M1-M5) | `ind-autodraft.ts`, `indCopilot.js` | AutoIND |
| 2 | IND section management | `ind-sections.ts`, `ind.ts` | Dossier Manager |
| 3 | IND templates | `ind-templates.ts` | AI Templates |
| 4 | IND submission lifecycle | `ind-submissions.routes.ts` | Submission Builder |
| 5 | eCTD 4.0 compilation | `ectd-compile.ts`, `ectd.ts` | eCTD formatting |
| 6 | eCTD export (ZIP) | `ectd-export.ts` | Submission publishing |
| 7 | eCTD validation | `ectd-validate.ts`, `ectd4-validator.ts` | (Weave has this) |
| 8 | eCTD Co-Author | `eCTDCoAuthor.tsx` | Editor |
| 9 | CMC Hub (M3.2.S/P) | `CMCHub.tsx`, `cmcRoutes.ts` | CMC support |
| 10 | CMC blueprint generation | `cmcBlueprintService.js` | CMC authoring |
| 11 | Biostatistics judgment (7 modules) | `biostatistics-judgment/` | **NONE in Weave** |
| 12 | AnA Biostats orchestrator | `ana-biostats/` | **NONE in Weave** |
| 13 | Safety narrative generation | `safety-narrative-service.ts` | Clinical narratives |
| 14 | CSR builder | `csr-builder-routes.ts` | CSR support |
| 15 | Protocol generation | `kernel-agent-protocol.ts` | **NONE in Weave** |
| 16 | Deep Research (multi-source) | `deep-research-orchestrator.ts` | Data Room (partial) |
| 17 | Precedent Intelligence | `regulatory-precedent-intelligence/` | **NONE in Weave** |
| 18 | Foresight AI (risk scoring) | `foresight-ai-engine.ts` | **NONE in Weave** |
| 19 | CRL/RTF pattern detection | `crl-trigger-service.ts`, `rtf-trigger-service.ts` | **NONE in Weave** |
| 20 | EMA question taxonomy | `ema-question-taxonomy-service.ts` | HAQ Manager (similar) |
| 21 | Advisory committee risk scoring | `advisory-committee-service.ts` | **NONE in Weave** |
| 22 | Cross-jurisdictional intelligence | `cross-jurisdictional-service.ts` | Multi-region (roadmap) |
| 23 | UnifiedDocumentEditor (TipTap) | `UnifiedDocumentEditor.tsx` | Editor |
| 24 | Export governance (5-record chain) | `exportGovernance.ts` | Audit trail |
| 25 | PDF/DOCX/ZIP export | `cerv2-export-routes.ts` | Export |
| 26 | Document vault | `VaultPage.tsx` | Data Room (partial) |
| 27 | RIM (Regulatory Intelligence Model) | `server/services/intelligence/` | **NONE in Weave** |
| 28 | 510(k)/PMA/CER/IVDR | Multiple | **NONE in Weave** |
| 29 | ClinicalTrials.gov MCP | MCP connector | **NONE in Weave** |
| 30 | StudyProtocolDesigner | `StudyProtocolDesigner.tsx` | **NONE in Weave** |

---

## GAP ANALYSIS — What We Need to Match/Beat Weave

### GAPS WE MUST CLOSE (Critical)

| # | Gap | Weave Has | We Have | Fix |
|---|-----|-----------|---------|-----|
| G1 | **Data Room with AI "Ask"** | Folder upload, semantic search, AI Q&A | Vault (files only, no AI Q&A) | Wire Deep Research + vault into "Ask Data Room" panel |
| G2 | **HAQ/RTQ Response Workflow** | Dedicated HAQ Manager | EMA question taxonomy service (backend only) | Build HAQ response workflow through AnA + Apps |
| G3 | **IND hero path in ZenApp** | AutoIND is their hero | IND tools exist but scattered, not in Apps page | Add IND Workspace to Apps, wire through embedded module |
| G4 | **ISS/ISE generation** | Integrated Safety/Efficacy Summary | Safety narrative exists, but no ISS/ISE specific | Extend safety narrative to cover ISS/ISE |
| G5 | **Pre-IND Briefing Package** | Briefing book generator | No dedicated briefing package | Add briefing package generation via AnA |
| G6 | **IB Co-Authoring** | Real-time IB authoring | IB generation exists in IND module | Surface IB authoring in eCTD Co-Author |
| G7 | **Table/Figure AI Generation** | AI generates tables/figures from data | Editor has table insert, but no AI table generation | Add AI table/figure generation to editor slash commands |

### GAPS WE ALREADY EXCEED (Advantages)

| # | Advantage | Our Capability | Weave Status |
|---|-----------|---------------|--------------|
| A1 | Medical device workflows | 510(k), PMA, CER, IVDR — full | None |
| A2 | Biostatistics platform | 7-module judgment engine + SAP builder | None |
| A3 | Regulatory precedent intelligence | CRL/RTF patterns, AC risk, confidence calibration | None |
| A4 | Foresight AI | Approval probability, timeline, risk prediction | None |
| A5 | Clinical trial protocol design | 12 design types, powering, endpoints | None |
| A6 | ClinicalTrials.gov integration | Live MCP connector | None |
| A7 | Multi-persona AI copilot | AnA RI with role-based routing | Generic AI |
| A8 | RIM (compounding intelligence) | Judgment framework, pattern registry, signal capture | None |
| A9 | Real-time compliance scanning | RIM interceptors on chat/artifacts | None |
| A10 | Multi-agency support (live) | FDA, EMA, PMDA, Health Canada, TGA | FDA only (EMA/PMDA on roadmap) |

---

## EXECUTION PLAN — Wire Everything Through AnA + Apps

### STEP 1: Add Biotech/Pharma Apps to AppsPage

Add these apps (all have real backends):

| App | ID | Backend | What It Does |
|-----|----|---------|--------------|
| **IND Workspace** | `ind-workspace` | `ind-autodraft.ts` + `ind-sections.ts` | AI-drafted IND sections (M1-M5) — our AutoIND |
| **eCTD Co-Author** | `ectd-coauthor` | `ectd-compile.ts` + `eCTDCoAuthor.tsx` | CTD module authoring with AI |
| **CMC Hub** | `cmc-hub` | `cmcRoutes.ts` + `CMCHub.tsx` | Module 3 CMC authoring |
| **HAQ Response** | `haq-response` | `ema-question-taxonomy-service.ts` | Health Authority Question responses |
| **Protocol Designer** | `protocol-designer` | `kernel-agent-protocol.ts` | Clinical study protocol design |

### STEP 2: Build IND Workspace as Embedded Module (like 510k)

Route: `/concept2cure/project/:projectId/ind`
- Embeds `INDFullSolution.jsx` (88KB, already fully built)
- Same pattern as 510k: embedded in ZenApp shell with AI assistant drawer
- Real AI drafting via `indCopilot.js`
- Sections mapped to CTD M1-M5

### STEP 3: Wire HAQ Response Workflow

- Backend: `ema-question-taxonomy-service.ts` already has question patterns
- Frontend: New HAQ panel accessible from Apps or AnA slash command
- Workflow: Receive questions → AI-draft responses → Review → Finalize
- Uses same governed artifact loop

### STEP 4: Surface Existing Tools in AnA Slash Commands

Register these slash commands for biotech users:
- `/draft-ind-section` — Generate IND section with AI
- `/haq-response` — Draft HAQ response
- `/protocol-design` — Design clinical protocol
- `/biostat-analysis` — Run statistical analysis
- `/briefing-package` — Generate pre-IND briefing
- `/ib-section` — Draft Investigator Brochure section
- `/iss-summary` — Generate Integrated Safety Summary
- `/cmc-section` — Draft CMC section

### STEP 5: Enhance Data Room → "Ask" Capability

Wire Deep Research orchestrator into vault:
- Upload documents to vault
- Semantic search across project documents
- "Ask" tab that queries documents with AI
- Source-traced answers with citations

---

## COMPETITIVE POSITIONING SUMMARY

```
WEAVE.BIO (what they have):
├── AutoIND (IND drafting)
├── Submission Builder (eCTD assembly)
├── HAQ Manager (question responses)
├── Data Room (document search/ask)
├── Editor (AI templates)
└── Review/Verification

CONCEPT2CURE (what we have + will wire):
├── AutoIND equivalent (ind-autodraft + indCopilot) ← WIRE INTO APPS
├── Submission Builder equivalent (ectd-compile + ectd-export) ← WIRE INTO APPS
├── HAQ Manager equivalent (ema-question-taxonomy) ← BUILD FRONTEND
├── Data Room equivalent (vault + deep-research) ← ENHANCE
├── Editor (UnifiedDocumentEditor + TipTap) ← ALREADY LIVE
├── Review/Verification (export governance + RIM) ← ALREADY LIVE
│
│ ── PLUS EVERYTHING WEAVE DOESN'T HAVE ──
│
├── 510(k) / PMA / CER / IVDR (device workflows)
├── Biostatistics Platform (7-module judgment engine)
├── Regulatory Precedent Intelligence (CRL/RTF/AC risk)
├── Foresight AI (approval probability scoring)
├── Clinical Protocol Designer (12 design types)
├── ClinicalTrials.gov Live Integration
├── AnA RI Multi-Persona Copilot
├── RIM (Regulatory Intelligence Model)
├── Multi-Agency (FDA + EMA + PMDA + HC + TGA — live)
└── Real-Time Compliance Scanning
```

**Bottom line: We have MORE than Weave.bio already built. The gap is surfacing/wiring, not building.**
