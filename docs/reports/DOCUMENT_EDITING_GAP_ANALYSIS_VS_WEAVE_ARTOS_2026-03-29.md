# Document Editing Gap Analysis: ClinicalSageAI vs Weave.bio vs Artos AI

**Date:** 2026-03-29
**Scope:** All user-facing document editing screens and capabilities
**Verdict:** ClinicalSageAI has broader platform coverage but critical UX gaps in the core editing experience that Weave and Artos nail.

---

## Executive Summary

**Honest assessment:** ClinicalSageAI has built an impressive _breadth_ of editor infrastructure — 27 editor files, 7 TipTap extensions, 17 inspector panels, and full lifecycle tooling. But the **editing UX itself** — the thing users spend 80% of their time in — lags behind both Weave and Artos in polish, source traceability, and AI-drafting workflow. We have more _features_ than either competitor, but the features that matter most to a regulatory writer (source linking, AI draft iteration, clean review cycles) are weaker in execution.

### Scorecard

| Capability Area | Weave.bio | Artos AI | ClinicalSageAI | Gap Severity |
|---|---|---|---|---|
| **Core Rich Text Editor** | ★★★★★ | ★★★★ | ★★★★ | Low |
| **AI Draft Generation (full doc)** | ★★★★★ | ★★★★★ | ★★★☆ | **HIGH** |
| **AI Section-Level Editing** | ★★★★★ | ★★★★ | ★★★★ | Low |
| **Source Traceability (click-to-source)** | ★★★★★ | ★★★★★ | ★★☆☆ | **CRITICAL** |
| **Data Room / Evidence Repository** | ★★★★★ | ★★★★ | ★★☆☆ | **HIGH** |
| **Template Engine (eCTD-native)** | ★★★★★ | ★★★★ | ★★★☆ | Medium |
| **Review / Redline Workflow** | ★★★★ | ★★★ | ★★★☆ | Medium |
| **Real-time Collaboration** | ★★★★★ | ★★★ | ★★★☆ | Medium |
| **Version Control / History** | ★★★★ | ★★★ | ★★★★ | Low |
| **Compliance Scanning** | ★★★★ | ★★★ | ★★★★ | Low |
| **Cross-References** | ★★★★★ | ★★★ | ★★★☆ | Medium |
| **Tables & Figures** | ★★★★★ | ★★★ | ★★★ | Medium |
| **Export (DOCX/PDF/eCTD)** | ★★★★★ | ★★★ | ★★★ | Medium |
| **Dossier Manager / Submission Builder** | ★★★★★ | ★★☆ | ★★★ | Medium |
| **HAQ Workflow** | ★★★★★ | ☆☆☆ | ★★☆ | **HIGH** |
| **Inconsistency Intelligence** | ★★★ | ★★★★★ | ★★★ | Medium |
| **Document Lifecycle Stages** | ★★★★ | ★★★ | ★★★ | Medium |
| **Signature / 21 CFR Part 11** | ★★★ | ★★ | ★★★★★ | **C2C Advantage** |
| **Regulatory Intelligence (RIM)** | ☆☆ | ☆☆ | ★★★★★ | **C2C Advantage** |
| **Precedent Engine** | ☆☆ | ☆☆ | ★★★★★ | **C2C Advantage** |
| **Multi-Agency Coverage** | ★★☆ (FDA+EMA) | ★★ (FDA) | ★★★★★ (30+ agencies) | **C2C Advantage** |
| **Biostatistics** | ☆☆ | ☆☆ | ★★★★★ | **C2C Advantage** |

---

## CRITICAL GAPS (Must Fix)

### 1. Source Traceability — Click-to-Source Linking

**What Weave does:** Every sentence in a generated document is clickable. Click it → see the exact source file, page, and keywords that produced it. Instant visual linking between claims and evidence. This is their #1 differentiator and the thing reviewers love most.

**What Artos does:** "Source Tracer" — purpose-built for life sciences complexity. When the same data exists across pharmacology reports, written summaries, and overviews, Artos shows exactly how each section was created. Goes beyond naive vector stores.

**What we have:** `SourceCitationsPanel.tsx` (269 lines) and `CitationPlugin.tsx` extension exist, but:
- Citations are **manually inserted**, not auto-generated during AI drafting
- No click-on-any-sentence → source-file linkage
- No visual indication of which source documents informed which paragraphs
- The Data Room panel exists (550 lines) but is **not wired to the AI drafting pipeline**
- No `/api/evidence/ask` endpoint connecting evidence queries to document generation

**Gap:** We have citation _infrastructure_ but not the **automatic source-linking UX** that both competitors treat as table stakes. A regulatory reviewer opening our editor cannot click a paragraph and see its provenance chain to source data. This is a trust killer.

**Fix priority:** P0 — This is the single most important gap. Without it, reviewers don't trust AI-generated content.

---

### 2. AI Draft Generation — Full Document from Source Data

**What Weave does:** Upload source files → select eCTD template → AI generates a complete first draft in hours, not months. Users can generate entire documents or individual sections. The unified editor lets you switch between "template view" (prompts/structure) and "content view" (generated text) seamlessly. Prompt blocks can run across all source files collectively or per-file.

**What Artos does:** Add source data for a document → get a high-quality first draft in minutes. Template-flexible (their templates, custom templates, or purchased templates). AI conforms drafts to any template structure.

**What we have:**
- `TemplateGeneratorPanel.tsx` (402 lines) — exists but lightweight
- `BatchAIPanel.tsx` (705 lines) — batch AI operations on sections
- AI actions in editor: rewrite, expand, summarize, regulatory-tone, add-references (5 actions)
- `FullDocumentBuilder` exists as a creation path
- Backend: `authoring-actions.ts` has governed AI actions

**Gap:** Our AI drafting is **action-oriented** (select text → apply action) rather than **generation-oriented** (upload sources → generate document). We don't have:
- A "template + content view" toggle like Weave's unified editor
- Source-file-aware generation (AI doesn't read from uploaded vault docs during drafting)
- Per-section vs whole-document generation toggle
- Prompt block customization (how content is generated per section)

**Fix priority:** P0 — This is the core value proposition. "Upload data, get a draft" is what both competitors lead with.

---

### 3. Data Room / Evidence Repository — Connected to Drafting

**What Weave does:** Single smart repository for every source document. AI-extracted metadata + semantic search. Import existing file structures. Direct connection from Data Room → drafting workflows. Seamless, traceable flow between source files and submission documents.

**What Artos does:** Search across company internal data + external sources (clinicaltrials.gov, Drugs@FDA). Complex data structure handling for life sciences formats.

**What we have:**
- `DataRoomPanel.tsx` (550 lines) — UI exists
- `AskDataRoomPanel.jsx` — exists but `/api/evidence/ask` endpoint is **missing**
- Vault/document storage exists
- `ForesightRAGService` exists on backend but is **not wired to editor**

**Gap:** The Data Room is a **display panel**, not an **active participant** in document creation. Users can't:
- Ask questions against their uploaded evidence and get cited answers
- Have the AI drafting engine pull from Data Room sources automatically
- See which vault documents informed which sections
- Get alerts when new source data conflicts with existing draft content

**Fix priority:** P0 — Without this, our AI drafting is "AI writing from thin air" rather than "AI writing from your data."

---

## HIGH GAPS (Should Fix Soon)

### 4. HAQ Manager — Health Authority Question Workflow

**What Weave does:** Full HAQ lifecycle built in collaboration with Takeda:
- Auto-extract and track incoming questions from FDA/EMA
- Generate draft responses based on relevant source docs + historical interactions
- Consolidate responses across teams
- Version control + progress tracking
- Final submission packaging

**What we have:**
- `HAQManager.tsx` exists in `components/workflow/`
- Backend: `ema-question-taxonomy-service.ts` + `crl-trigger-service.ts` exist
- But the **visible frontend workflow** (ingest → organize → AI-draft → review → export) is incomplete

**Gap:** Backend intelligence exists but no polished user-facing workflow. Weave explicitly launched this as a named product feature with Takeda validation.

**Fix priority:** P1 — HAQ response is a high-value, high-frequency activity for regulatory teams.

---

### 5. Real-time Collaboration Polish

**What Weave does:** Multiple simultaneous editors with change tracking ("who changed what"). Live workspace with comments, context, and redline suggestions side-by-side. "No more lost edits or version chaos."

**What we have:**
- `CollaborationPresence.tsx` (184 lines) — shows who's online
- `useCollaboration` hook exists
- `CommentThread.tsx` (526 lines) — threaded comments
- `ReviewMode.tsx` (405 lines) — tracked changes

**Gap:** The pieces exist but feel like **independent panels** rather than a **unified collaboration surface**. Specifically:
- Collaboration presence is just avatars, not live cursors in the document
- Comments don't have @mentions or notification routing
- Review mode tracked changes are basic (no inline accept/reject per-change in the document body)
- No "who changed what" audit visible during live editing

**Fix priority:** P1 — Collaboration is how teams actually work. Weave's "side-by-side comments + redlines" is more cohesive.

---

### 6. Template Engine — eCTD-Native Structure

**What Weave does:** Built-in eCTD templates for Modules 1 (including IB), 2, 3, and 5. Template view vs content view toggle. Variables/prompts embedded in templates. General-purpose templates beyond eCTD.

**What we have:**
- `TemplateGeneratorPanel.tsx` exists but is a panel, not a structural template system
- CTD section assignment exists (`ctdSection` field on artifacts)
- `INDChecklist.tsx` in workflow components
- No "template view" that shows document structure with prompt blocks

**Gap:** Our templates are **metadata on documents** (CTD section codes), not **structural scaffolds** that define section hierarchy, required content, and generation prompts. Weave's template engine is a first-class architectural concept; ours is a label.

**Fix priority:** P1 — eCTD structural awareness should permeate the editor, not sit in a side panel.

---

## MEDIUM GAPS (Plan For)

### 7. Cross-Reference Automation

**What Weave does:** Automates keeping citations and cross-references current as content changes. When a table or figure is updated, all references update.

**What we have:** `CrossReferencePanel.tsx` (700 lines) exists as an inspector panel. But cross-references are **manually managed**, not auto-maintained when content changes.

### 8. Table & Figure Handling

**What Weave does:** Automates table/figure formatting for submission. Handles regulatory table styles.

**What we have:** TipTap Table extension (Table, TableRow, TableCell, TableHeader) provides basic table editing. No automated regulatory formatting or table-of-figures management.

### 9. Inconsistency Intelligence

**What Artos does:** "Inconsistency Intelligence" — change one section, get notified of all other sections affected. Cross-document consistency checking.

**What we have:** `InconsistencyPanel.tsx` (331 lines) exists. But unclear if it performs live cross-section impact analysis or is mostly static.

### 10. Document Lifecycle Stage Visibility

**What the build plan calls for:** Draft → Review → Verify → Publish as 4 visible, calm lifecycle stages with grouped inspector panels.

**What we have:** Status exists on artifacts but the **4-stage indicator** is not yet a primary visual element in the editor header. Inspector panels are still 17 flat options rather than grouped by lifecycle stage.

### 11. Export Quality

**What Weave does:** Submission-ready formatting, eCTD publishing, automated table/figure handling in exports.

**What we have:** `ExportDialog.tsx` (277 lines) with DOCX generation via backend. PDF export exists. But no eCTD-native packaging from the editor.

---

## WHERE C2C IS ALREADY STRONGER (Honest Advantages)

These are genuine, deep capabilities that neither Weave nor Artos offer:

### 1. Regulatory Intelligence Model (RIM)
- 6 codified judgment models (Evidence Sufficiency, Defensibility, Reviewer Sensitivity, Claim Risk, Cross-Section Consistency, Submission Risk)
- 16 seed patterns in Pattern Registry
- Two-layer signal capture (500 signals/project)
- 4 non-blocking interceptors
- **Neither competitor has anything approaching this depth of regulatory judgment**

### 2. Precedent Engine
- Search FDA clearances, approvals, advisory committee decisions
- Insert precedent citations directly into documents
- Similarity scoring against current submission
- `PrecedentSearchInspector` built into the editor
- **Weave and Artos don't surface regulatory precedent data**

### 3. 21 CFR Part 11 Compliance
- `SignatureWorkflow.tsx` (1,118 lines) — full electronic signature
- Signature hash verification
- Document locking after approval
- `DocumentWatermark.tsx` for controlled copies
- Audit trail (DocumentProvenancePanel, DocumentAuditReport, DocumentVersionCompare)
- **This is enterprise-grade GxP compliance tooling**

### 4. Multi-Agency Coverage
- FDA, EMA, PMDA, Health Canada, TGA (30+ agencies)
- Weave covers FDA + EMA. Artos covers primarily FDA.
- **5x broader regulatory coverage**

### 5. Biostatistics Engine
- 7-module biostat engine
- Protocol design for 12 trial types
- **Neither competitor touches biostatistics**

### 6. AI Intelligence Panels
- 17 inspector panels in the editor (intelligence, provenance, compliance, health, batch AI, etc.)
- AnA Memory integration
- GA Readiness assessment
- **More contextual intelligence surfaces than either competitor**

### 7. Medical Device Workflows
- 510(k), PMA, CER support
- Device-specific regulatory paths
- **Neither Weave nor Artos addresses medical devices**

---

## PRIORITY ACTION PLAN

### P0 — Close Before Any Demo (Weeks 1-2)

| # | Gap | What to Build | Key Files |
|---|-----|---------------|-----------|
| 1 | Source traceability | Auto-link AI-generated content to source documents. Click any paragraph → see source files, confidence, keywords. Visual provenance ribbons on AI-generated sections. | `CitationPlugin.tsx`, `SourceCitationsPanel.tsx`, new `SourceTracer` extension |
| 2 | Source-aware AI drafting | Wire Data Room/Vault documents into AI generation pipeline. AI reads from uploaded source files, not just user prompts. | `DataRoomPanel.tsx`, `authoring-actions.ts`, `lumen-context-builder.ts` |
| 3 | Data Room → Editor connection | Wire `/api/evidence/ask` endpoint. Connect `AskDataRoomPanel` → `ForesightRAGService`. Enable "ask your evidence" from within editor. | `AskDataRoomPanel.jsx`, new API endpoint, `foresight-rag-service.ts` |

### P1 — Close for Beta (Weeks 3-4)

| # | Gap | What to Build |
|---|-----|---------------|
| 4 | HAQ Manager visible workflow | Complete the ingest → organize → AI-draft → review → export flow in `HAQManager.tsx` |
| 5 | Template engine upgrade | eCTD-structural templates with prompt blocks, template/content view toggle |
| 6 | Collaboration polish | Live cursors, @mentions in comments, inline accept/reject for tracked changes |
| 7 | Lifecycle stage visibility | 4-stage indicator in editor header, inspector panels grouped by stage |

### P2 — Polish for GA (Weeks 5-8)

| # | Gap | What to Build |
|---|-----|---------------|
| 8 | Cross-reference automation | Auto-update references when tables/figures change |
| 9 | Table formatting | Regulatory-standard table styles, table-of-figures generation |
| 10 | Inconsistency intelligence | Live cross-section impact analysis on content changes |
| 11 | eCTD export packaging | Native eCTD structure in export pipeline |

---

## HONEST BOTTOM LINE

**Weave** is the most dangerous competitor. They've built a **focused, polished document authoring experience** with source traceability as the foundation. Their Takeda collaboration (97% time savings, zero critical errors) is a powerful proof point. Their editor is purpose-built for the regulatory writing workflow — not a general editor with regulatory features bolted on.

**Artos** is smaller (seed-stage, $500K raised vs our deeper platform) but their Source Tracer and Inconsistency Intelligence are sharp product concepts that directly address regulatory writer pain points.

**ClinicalSageAI** has genuinely deeper intelligence (RIM, Precedent Engine, Foresight, 30+ agencies, biostatistics, 21 CFR Part 11) but the **core editing UX** — the thing a regulatory writer opens every day — doesn't yet match the polish of either competitor in the three areas that matter most:

1. **"I can see exactly where this text came from"** (source traceability)
2. **"I uploaded my data and got a draft"** (source-aware generation)
3. **"I can ask questions against my evidence base"** (Data Room / Ask)

Fix these three and C2C's broader platform becomes a decisive advantage. Without them, demos will feel like "lots of panels, but where did this text come from?"

---

_Report generated 2026-03-29. Based on publicly available information from weave.bio and artosai.com, plus full codebase analysis of ClinicalSageAI editor infrastructure._
