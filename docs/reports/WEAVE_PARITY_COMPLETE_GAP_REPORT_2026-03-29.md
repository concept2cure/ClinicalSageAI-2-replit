# Complete Weave.bio Parity Gap Report

**Date:** 2026-03-29
**Branch:** `concept2cure-v2`
**Purpose:** Exhaustive gap analysis across all measurable dimensions for complete Weave.bio parity

---

## Executive Summary

Concept2Cure already **exceeds** Weave in backend capability (score: 127/160 vs Weave's 64/160 per prior competitive analysis). The gap is **productization and surface exposure**, not missing machinery. This report identifies every measurable gap and the work required to close each one.

**Current parity status:** 5 matched, 3 partially matched, 2 gaps out of 10 Weave visible use cases.

---

## 1. DIMENSION-BY-DIMENSION PARITY ANALYSIS

### A. Document Lifecycle (Draft → Review → Verify → Publish)

| Capability | Weave | C2C Status | Gap | Work Required |
|---|---|---|---|---|
| Explicit lifecycle stages in editor UI | 4 clear stages (Draft/Review/Verify/Publish) visible in editor chrome | Artifact status exists (`draft → review → approved → locked`) but stages are not visually surfaced in EditorPanel | **GAP** | Add lifecycle stage bar to EditorPanel header showing current stage with transition buttons |
| Stage-gated transitions | Cannot publish unreviewed content | Status transitions exist in backend but no enforcement in editor UI | **GAP** | Wire `exportGovernance.ts` stage checks into editor stage bar; block Publish if Review not complete |
| Stage-specific toolbars | Review mode shows comments/redlines; Verify mode shows source tracing | Inspector panels exist for all modes but are not auto-surfaced per stage | **PARTIAL** | Auto-open relevant inspector panels when entering each lifecycle stage |

### B. AI-Native Drafting

| Capability | Weave | C2C Status | Gap | Work Required |
|---|---|---|---|---|
| Generate full IND sections from source data | AutoIND: M1-M5 section generation from uploaded data | `indCopilot`, `authoring-actions`, `ana-ri/artifact-generator` all handle this | **MATCHED** | Convergence: all paths must land in EditorPanel |
| Section-by-section generation | Select one CTD section, generate from sources | Exists via SubmissionAppsPanel + authoring-actions | **MATCHED** | Already converges to EditorPanel |
| Source file selection for generation | Choose which Data Room files to use as input | Not directly surfaced — AI uses all available context | **GAP** | Add source file selector in draft creation dialog; pass selected files to AI context |
| 97% time reduction claim | Validated with Takeda for IND writing | No public benchmark | **N/A** | Marketing metric, not a feature gap |

### C. AI Template Engine

| Capability | Weave | C2C Status | Gap | Work Required |
|---|---|---|---|---|
| Template → Content view toggle | Seamless switch between template structure (prompt blocks) and generated content | FullDocumentBuilder has 5-step wizard but no inline toggle | **GAP** | Add template/content view toggle to EditorPanel; show template structure alongside content |
| Prompt blocks per section | Define AI prompts per section, run individually or collectively | AI actions work per-section but no visible "prompt block" concept | **GAP** | Add prompt block UI to template view — each section shows its generation prompt, editable |
| Customizable AI templates | Users create/edit templates with variable slots | Template catalog exists (`templateCatalog.ts`) but no user-facing template editor | **GAP** | Build template editor UI: list templates, edit prompt blocks, save custom templates |
| Generate on each file individually | Run template across each source file separately | Not supported — AI generates from combined context | **MINOR GAP** | Add "per-file generation" option to AI draft action |

### D. Data Room / Vault

| Capability | Weave | C2C Status | Gap | Work Required |
|---|---|---|---|---|
| Upload folders with preserved hierarchy | Drag-and-drop folder upload | VaultPage exists with file upload | **PARTIAL** | Add folder structure preservation on upload |
| Semantic search over documents | AI-powered search across all uploaded content | `ForesightRAGService` + `deep-research-orchestrator` exist | **PARTIAL** | Wire semantic search into VaultPage UI; currently search is keyword-only in vault |
| "Ask" tab for Q&A over documents | Ask questions, get grounded answers with source citations | `IndEvidenceAskPanel` exists (PR #294), `/api/evidence/ask` endpoint works | **PARTIAL** | IndEvidenceAskPanel is IND-workspace only. Need a universal Data Room Ask panel in VaultPage |
| AI-extracted metadata | Auto-tag uploaded documents with metadata | Not implemented | **GAP** | Use document intake pipeline (PR #293) to extract metadata on upload |
| Direct connection to drafting | Click source → start draft referencing it | Not connected | **GAP** | Add "Draft from this source" action on vault documents → opens EditorPanel with source context |

### E. Dossier Manager

| Capability | Weave | C2C Status | Gap | Work Required |
|---|---|---|---|---|
| eCTD-structured section view | Hierarchical Module 1-5 view | `DossierTree` in ProjectWorkspaceShell, `DossierMap` visual view | **MATCHED** | Already implemented |
| Section → editor click-through | Click section to open editor for that document | Implemented in PR #294 (section click opens artifact or shows start actions) | **MATCHED** | Done |
| Live section readiness derived from artifacts | Section status reflects actual artifact state | `readinessEvaluator.ts` exists, `useSubmissionSections` tracks status | **PARTIAL** | Readiness evaluator needs to pull live artifact status, not just section count |
| Change propagation alerts | When source data updates, flag affected sections | Not implemented | **GAP** | Build change propagation service: track source→section links, emit alerts when sources change |
| Cross-document reference maintenance | Auto-update references when sections change | Not implemented at editor level | **GAP** | Implement cross-reference tracking in editor extensions |

### F. Submission Builder

| Capability | Weave | C2C Status | Gap | Work Required |
|---|---|---|---|---|
| eCTD package assembly | Compile documents into eCTD structure | `ectd-compile.ts`, `ectd-export.ts`, `ectd4-validator.ts` exist | **MATCHED** | Already implemented |
| Automated formatting | Format documents to eCTD standards | Export renderers handle formatting | **MATCHED** | Done |
| Section completeness tracking | Visual dashboard of what's done/missing | `SubmissionReadiness.tsx` exists | **MATCHED** | Already implemented |
| Table/figure auto-generation | Generate tables and figures from source data | Not visible in editor | **GAP** | Add table/figure generation AI action in editor — "Generate table from data" |
| Citation management | Auto-update citations when sources change | Not implemented | **GAP** | Build citation manager extension for editor; track source→citation links |

### G. Review & Collaboration

| Capability | Weave | C2C Status | Gap | Work Required |
|---|---|---|---|---|
| Real-time collaborative editing | Google Docs-style simultaneous editing | Not implemented (single-user editing) | **MAJOR GAP** | Requires Y.js or similar CRDT integration with EditorPanel + Socket.io backend |
| Inline comments with threads | Comment on specific text ranges | EditorPanel 'comments' inspector panel exists | **MATCHED** | Already implemented |
| Redline/track changes | Visual diff of edits | EditorPanel 'compare' inspector panel exists | **MATCHED** | Already implemented |
| Reviewer assignments | Assign specific reviewers to sections | EditorPanel 'reviewers' inspector panel exists | **MATCHED** | Already implemented |
| Approval workflows | Built-in approval chain | Governed artifact workflow exists with status transitions | **MATCHED** | Already implemented |
| Side-by-side comments and content | View comments alongside document | Inspector panels are side panels | **MATCHED** | Already implemented |

### H. Source Traceability / Verification

| Capability | Weave | C2C Status | Gap | Work Required |
|---|---|---|---|---|
| Sentence-level source tracing | Click any sentence to see its source | EditorPanel 'provenance' inspector exists | **PARTIAL** | Provenance tracks at section/artifact level, not sentence level. Need sentence-level source annotation |
| Automated data verification | Verify content matches source data | EditorPanel 'inconsistency' inspector exists | **MATCHED** | Already implemented via RIM pattern detection |
| Cross-reference validation | Check all references are valid | Not implemented as automated check | **GAP** | Add cross-reference validation pass to compliance scanner |
| Contradiction detection | Flag contradictory claims across documents | RIM `cross-module-intelligence.ts` exists | **MATCHED** | Already implemented |

### I. HAQ Response Workflow

| Capability | Weave | C2C Status | Gap | Work Required |
|---|---|---|---|---|
| Ingest HA questions | Upload/import health authority questions | `HAQManager` exists in tools subview | **PARTIAL** | HAQManager exists but is not prominent in workspace |
| Organize questions by section/topic | Categorize and prioritize questions | EMA question taxonomy service exists | **PARTIAL** | Need visible UI for question organization |
| AI-draft responses from sources | Generate response drafts referencing submission + data room | Backend intelligence exists (CRL/RTF patterns) | **GAP** | Wire AI drafting to HAQ responses using source docs + prior submission as context |
| Review/finalize/export responses | Complete response workflow | Not fully visible | **GAP** | Build HAQ response lifecycle: Ingest → Organize → Draft → Review → Export |
| Link responses to original submission | Connect HAQ answers to eCTD sections | Not implemented | **GAP** | Add section linking in HAQ response metadata |

### J. Publishing / Export

| Capability | Weave | C2C Status | Gap | Work Required |
|---|---|---|---|---|
| DOCX export | Export documents as DOCX | `cerv2-export-routes.ts` handles DOCX | **MATCHED** | Already implemented |
| eCTD-formatted output | Export in eCTD structure | `ectd-compile.ts` + `ectd-export.ts` | **MATCHED** | Already implemented |
| Governed export with audit trail | 5-record chain per export | `exportGovernance.ts` creates artifact + version + provenance + audit + snapshot | **MATCHED** | Already implemented — **exceeds Weave** |
| PDF export | Export as PDF | PDF export exists | **MATCHED** | Already implemented |

---

## 2. MEASURABLE GAP SUMMARY

### Critical Gaps (Must Close for Parity)

| # | Gap | Impact | Effort | Files to Create/Modify |
|---|---|---|---|---|
| 1 | **Editor lifecycle stage bar** | Users can't see Draft/Review/Verify/Publish stages | Medium | `EditorPanel.tsx` — add stage bar component |
| 2 | **Template/Content view toggle** | Can't switch between template prompts and generated content | Large | `EditorPanel.tsx` — new editor mode + template view component |
| 3 | **Data Room Ask (universal)** | Evidence Q&A only in IND workspace, not in VaultPage | Small | `VaultPage.tsx` — integrate Ask panel |
| 4 | **Sentence-level source tracing** | Provenance is section-level, not sentence-level | Large | Editor extension + backend annotation service |
| 5 | **HAQ response workflow UI** | No visible HAQ Manager in primary workspace | Large | New HAQ workspace component with full lifecycle |
| 6 | **Real-time collaborative editing** | Single-user only, Weave has Google Docs-style collab | Very Large | Y.js/Hocuspocus integration with TipTap + Socket.io |
| 7 | **Source file selector for drafting** | Can't choose which files AI uses as input | Small | Draft creation dialog modification |
| 8 | **Change propagation alerts** | No notification when source data changes affect sections | Medium | New service + notification component |
| 9 | **Cross-reference management** | No automated cross-reference tracking/validation | Large | Editor extension + validation service |
| 10 | **AI-generated tables/figures** | No table/figure generation from data in editor | Medium | New AI action + editor table rendering |

### Partial Gaps (Improvement Needed)

| # | Gap | Current State | Work Required |
|---|---|---|---|
| 11 | Semantic search in vault | RAG exists but vault search is keyword-only | Wire ForesightRAGService into VaultPage search |
| 12 | Document metadata extraction | Intake pipeline exists (PR #293) but not connected to upload | Connect DocumentIntakePipeline to vault upload flow |
| 13 | HAQ question organization UI | Backend taxonomy exists, no frontend | Build question organization panel |
| 14 | Live section readiness from artifacts | Readiness evaluator uses section count, not artifact status | Enhance evaluator to pull live artifact data |
| 15 | Customizable AI templates | Template catalog exists, no user editor | Build template management UI |

### Already Exceeded (C2C > Weave)

| # | Capability | C2C Advantage |
|---|---|---|
| 1 | Medical device workflows | Full 510(k)/PMA/CER/IVDR — Weave is pharma-only |
| 2 | Multi-agency support | FDA + EMA + PMDA + HC + TGA + NMPA + 6 more — Weave is FDA + EMA roadmap |
| 3 | Biostatistics judgment | 7-module engine (power adequacy, assumption fragility, endpoint defensibility) |
| 4 | Regulatory precedent intelligence | CRL/RTF patterns, advisory committee risk, confidence calibration |
| 5 | Approval probability prediction | Foresight AI engine with success rate prediction |
| 6 | Clinical protocol design | 12 trial types (RCT, crossover, adaptive, basket, platform, N-of-1) |
| 7 | Multi-persona AI copilot | 6+ persona-based prompt routing (CEO, RA, medical writer, etc.) |
| 8 | Governed export pipeline | 5-record audit chain per export — enterprise compliance grade |
| 9 | Global regulatory registry | 69 application types across 12 regions (just built) |

---

## 3. PRIORITIZED EXECUTION PLAN

### Phase 1: Visible Parity (Weeks 1-2) — Close perception gaps

1. **Editor lifecycle stage bar** — Draft/Review/Verify/Publish bar in EditorPanel header with stage-gated transitions
2. **Universal Data Room Ask** — Move IndEvidenceAskPanel to VaultPage + make it project-agnostic
3. **Source file selector** — Add file picker to draft creation dialog
4. **HAQ Manager visibility** — Surface HAQ workflow in Tools workbench landing

### Phase 2: Deep Parity (Weeks 2-4) — Close functional gaps

5. **Sentence-level source tracing** — Editor annotation extension that links sentences to source documents
6. **HAQ response workflow** — Full lifecycle: Ingest → Organize → Draft → Review → Export
7. **Template/Content view toggle** — Dual-mode editor view with prompt blocks
8. **AI table/figure generation** — New AI action for structured data → table/figure in editor
9. **Semantic search in vault** — Wire ForesightRAGService into VaultPage

### Phase 3: Advanced Parity (Weeks 4-8) — Close infrastructure gaps

10. **Real-time collaborative editing** — Y.js + Hocuspocus + TipTap collaboration extension
11. **Cross-reference management** — Editor extension for intra/inter-document reference tracking
12. **Change propagation alerts** — Source→section dependency tracking with notifications
13. **Customizable AI templates** — Template editor UI with prompt block management
14. **Document metadata extraction** — Wire intake pipeline to vault upload

### Phase 4: Superiority Sprint (Weeks 8+) — Leverage advantages

15. Expose device workflows more prominently in product positioning
16. Surface Foresight/precedent/biostats intelligence in dossier context
17. Add multi-agency comparison features (FDA vs EMA vs PMDA side-by-side)
18. Build multi-submission project support (IND + NDA + MAA in parallel)

---

## 4. QUANTITATIVE PARITY SCORECARD

| Dimension | Weave Score | C2C Score (Today) | C2C Score (After Phase 1-2) | C2C Score (After Phase 3) |
|---|---|---|---|---|
| AI Drafting | 9/10 | 8/10 | 9/10 | 9/10 |
| Template Engine | 9/10 | 5/10 | 7/10 | 9/10 |
| Data Room / Vault | 8/10 | 5/10 | 7/10 | 8/10 |
| Dossier Manager | 8/10 | 7/10 | 8/10 | 9/10 |
| Submission Builder | 7/10 | 7/10 | 8/10 | 9/10 |
| Editor Lifecycle | 8/10 | 4/10 | 7/10 | 8/10 |
| Review / Collaboration | 9/10 | 6/10 | 6/10 | 9/10 |
| Source Traceability | 9/10 | 5/10 | 7/10 | 9/10 |
| HAQ Workflow | 8/10 | 2/10 | 6/10 | 8/10 |
| Publishing / Export | 7/10 | 8/10 | 8/10 | 9/10 |
| **TOTAL** | **82/100** | **57/100** | **73/100** | **87/100** |

### Additional C2C-Only Dimensions (Weave = 0)

| Dimension | C2C Score |
|---|---|
| Medical Device Workflows | 8/10 |
| Multi-Agency Intelligence (12 regions) | 9/10 |
| Biostatistics Engine | 8/10 |
| Regulatory Precedent Intelligence | 8/10 |
| Approval Probability (Foresight) | 7/10 |
| Protocol Design (12 types) | 7/10 |
| Multi-Persona AI | 8/10 |
| **Extended Total** | **57/100 → 112/170** |

---

## 5. THE 6 HIGHEST-IMPACT ITEMS

If you could only do 6 things to close the most visible gap:

1. **Editor lifecycle stage bar** — instant perception of professional document workflow
2. **Universal Data Room Ask** — matches Weave's headline feature, already mostly built
3. **HAQ response workflow** — Weave's HAQ Manager is a named product, we need equivalent visibility
4. **Sentence-level source tracing** — Weave's strongest differentiator claim
5. **Template/Content view toggle** — Weave's "unified editor" story centerpiece
6. **Real-time collaboration** — table-stakes expectation for enterprise authoring

Items 1-3 are achievable in 1-2 weeks. Items 4-6 are 2-6 week efforts each.
