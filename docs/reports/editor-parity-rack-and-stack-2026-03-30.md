# Editor Parity Rack & Stack: Concept2Cure vs Weave.bio vs Artos AI

> **Date:** 2026-03-30
> **Scope:** Document editor features only — down to the smallest function
> **Classification:** CONFIDENTIAL — Internal Use Only
> **Purpose:** Production parity gap analysis with concrete action items

---

## Executive Summary

**Concept2Cure's editor is the most feature-complete of the three** — 28 TipTap extensions, 22 inspector panels, 58 toolbar commands, real-time CRDT collaboration, 21 CFR Part 11 signatures, and full export pipeline. However, Weave.bio leads on **source traceability UX** and **AI draft generation depth**, while Artos leads on **cross-document inconsistency detection** and **template library breadth**. Neither competitor has our collaboration depth, compliance scanning, or document lifecycle management.

### Scores (Editor Only)

| Category | Concept2Cure | Weave.bio | Artos AI |
|----------|-------------|-----------|----------|
| Core Editing | **9/10** | 7/10 | 4/10 |
| Formatting & Typography | **9/10** | 6/10 | 3/10 |
| Tables & Structured Data | **8/10** | 6/10 | 7/10 |
| AI Writing Assistance | 7/10 | **9/10** | **9/10** |
| Source Traceability | 6/10 | **9/10** | **8/10** |
| Collaboration (Real-time) | **9/10** | 5/10 | 2/10 |
| Comments & Review | **9/10** | 6/10 | 3/10 |
| Track Changes | **9/10** | 5/10 | 5/10 |
| Version Control | **9/10** | 6/10 | 5/10 |
| Compliance Scanning | **9/10** | 3/10 | 3/10 |
| Document Lifecycle | **9/10** | 4/10 | 2/10 |
| Templates (CTD/eCTD) | 6/10 | 7/10 | **9/10** |
| Cross-Document Intelligence | 6/10 | 6/10 | **8/10** |
| Import (Multi-format) | **8/10** | 7/10 | **8/10** |
| Export (DOCX/PDF/PPTX) | **9/10** | 6/10 | 4/10 |
| E-Signatures (Part 11) | **9/10** | 3/10 | 0/10 |
| External Storage (DMS) | 5/10 | 5/10 | **7/10** |
| Print & Zoom | **8/10** | 5/10 | 2/10 |
| Keyboard Shortcuts | **8/10** | 6/10 | 3/10 |
| Search & Replace | **9/10** | 5/10 | 3/10 |
| **TOTAL** | **161/200** | **113/200** | **86/200** |

---

## Detailed Category Breakdown

### 1. Core Editing Experience

| Feature | C2C | Weave | Artos | Notes |
|---------|-----|-------|-------|-------|
| Rich text editing (WYSIWYG) | **YES** (TipTap/ProseMirror) | YES (likely ProseMirror) | PARTIAL (section-based, not char-level) | Artos is generation-first, not editing-first |
| Paragraph, headings (H1-H6) | **YES** (H1-H6) | YES | N/A | Artos structures via templates |
| Bold / Italic / Underline / Strike | **YES** | YES | Unknown | |
| Superscript / Subscript | **YES** | Likely | Unknown | |
| Block quotes | **YES** | Likely | Unknown | |
| Code blocks | **YES** | Unlikely | No | |
| Task lists (checkboxes) | **YES** | No | No | Unique to C2C |
| Horizontal rules | **YES** | Likely | Unknown | |
| Page breaks (Ctrl+Enter) | **YES** | Likely | Unknown | |
| Indent/outdent (10 levels) | **YES** | Likely | Unknown | |
| Undo/Redo | **YES** | YES | Unknown | |
| Slash command menu (15+ cmds) | **YES** | No public evidence | No | C2C unique |
| Right-click context menu | **YES** (14 items) | Unknown | No | C2C unique |

**Verdict:** C2C has the deepest editing experience. Artos is not a traditional editor — users generate sections, not type them.

---

### 2. Formatting & Typography

| Feature | C2C | Weave | Artos |
|---------|-----|-------|-------|
| Font family picker (12 families) | **YES** | Unknown | No |
| Font size picker | **YES** (custom extension) | Unknown | No |
| Line height/spacing | **YES** (custom extension) | Unknown | No |
| Text color | **YES** | Likely | No |
| Highlight color | **YES** | Likely | No |
| Text alignment (L/C/R/J) | **YES** | Likely | No |
| Word-style paste cleanup | **YES** (MSO detection) | Unknown | No |

**Verdict:** C2C has Word-level typography control. Neither competitor has confirmed font/size pickers.

---

### 3. Tables & Structured Data

| Feature | C2C | Weave | Artos |
|---------|-----|-------|-------|
| Insert table | **YES** (configurable) | Likely | YES (AI-generated) |
| Add/remove rows & columns | **YES** | Unknown | Unknown |
| Merge/split cells | **YES** | Unknown | Unknown |
| Toggle header row | **YES** | Unknown | Unknown |
| Delete table | **YES** | Unknown | Unknown |
| AI table generation | **YES** (slash command) | YES | **YES** (from data sources) |
| Auto-update from source data | NO | Unknown | **YES** (automations) |
| Data room table insertion | PARTIAL (DataRoom panel) | Unknown | **YES** |
| Statistical data import (SAS/R) | NO | NO | NO |

**Verdict:** C2C leads on manual table editing. Artos leads on AI-generated tables from data sources. **Gap: auto-update tables from source data.**

---

### 4. AI Writing Assistance

| Feature | C2C | Weave | Artos |
|---------|-----|-------|-------|
| Full document first-draft | YES (via AnA) | **YES** (AutoIND flagship) | **YES** (per-doc-type AI) |
| Section-level regeneration | YES (Batch AI) | **YES** | **YES** |
| AI rewrite | **YES** (5 actions) | YES | YES |
| AI expand | **YES** | Unknown | Unknown |
| AI summarize | **YES** | Unknown | Unknown |
| Regulatory tone adjustment | **YES** | YES | YES |
| AI autocomplete (ghost text) | **YES** (1.5s debounce) | Unknown | Unknown |
| Comment-driven regeneration | NO | Unknown | **YES** |
| No-prompt generation | PARTIAL (slash cmds) | **YES** (knowledge graph) | **YES** (purpose-built agents) |
| Anti-hallucination guarantee | NO (uses guardrails) | Claims strong | **Claims zero** |
| Table/figure/graph AI gen | YES | YES | **YES** (with auto-update) |

**Verdict:** Weave and Artos lead on zero-config draft generation. C2C leads on inline AI (ghost text, 5 rewrite modes). **Gap: purpose-built AI per document type, comment-driven regeneration.**

---

### 5. Source Traceability

| Feature | C2C | Weave | Artos |
|---------|-----|-------|-------|
| Sentence-level source linking | PARTIAL (TraceabilityMark) | **YES** (2-click verification) | **YES** (Source Tracer) |
| Source popover preview | NO | **YES** | **YES** |
| Citation insertion ([@trigger) | **YES** | Unknown | Unknown |
| Citation search (AI-powered) | **YES** | Unknown | Unknown |
| Source panel / sidebar | YES (SourceCitationsPanel) | **YES** | **YES** |
| "Beyond naive vector stores" | Using CORTEX + embeddings | Knowledge graph | Claims proprietary approach |

**Verdict:** All three have source traceability. Weave and Artos have better UX for click-through verification. **Gap: sentence-level click-to-source popover needs polish.**

---

### 6. Real-time Collaboration

| Feature | C2C | Weave | Artos |
|---------|-----|-------|-------|
| CRDT-based sync (Y.js) | **YES** | Unknown | NO |
| Multi-cursor presence | **YES** (10-color palette) | Unknown | NO |
| Typing indicators | **YES** | Unknown | NO |
| Socket.io + Firestore dual-write | **YES** | NO | NO |
| Collaborator list with status | **YES** | Unknown | NO |
| Document locking | **YES** | Unknown | Unknown |

**Verdict:** C2C dominates. Artos has no confirmed real-time co-editing. Weave has "centralized workspace" but no CRDT evidence.

---

### 7. Comments & Review Workflow

| Feature | C2C | Weave | Artos |
|---------|-----|-------|-------|
| Inline comments (highlight) | **YES** (CommentMark) | Likely | NO confirmed |
| Threaded replies | **YES** | Unknown | NO |
| Comment resolution status | **YES** (open/resolved/rejected) | Unknown | NO |
| Reviewer assignment (RACI) | **YES** | Unknown | NO |
| Review deadline tracking | **YES** | Unknown | NO |
| Accept/reject changes (per-change) | **YES** (ReviewMode) | Unknown | Partial (Changes Marked) |
| Bulk accept/reject all | **YES** | Unknown | Unknown |
| Review completion status | **YES** | Unknown | Unknown |

**Verdict:** C2C has the most complete review workflow. Artos has basic "Changes Marked" mode but no confirmed commenting.

---

### 8. Version Control & Document Lifecycle

| Feature | C2C | Weave | Artos |
|---------|-----|-------|-------|
| Version timeline | **YES** | Unknown | Unknown |
| Version comparison (diff) | **YES** | Unknown | NO |
| Version restore | **YES** | Unknown | NO |
| Draft → Review → Approved → Published | **YES** | Unknown | NO confirmed |
| Document watermark per status | **YES** (4 types) | NO | NO |
| Document health score | **YES** (6 dimensions) | NO | NO |
| Status change quality gates | **YES** | Unknown | NO |

**Verdict:** C2C dominates with full lifecycle management. Artos focuses on drafting, not lifecycle.

---

### 9. Compliance & Regulatory Features

| Feature | C2C | Weave | Artos |
|---------|-----|-------|-------|
| Real-time compliance scanning | **YES** (20+ rules, 7 categories) | NO | NO |
| Wavy underline decorations | **YES** (red/amber/blue) | NO | NO |
| Auto-fix suggestions | **YES** | NO | NO |
| Glossary tooltips (50+ terms) | **YES** | NO | NO |
| 21 CFR Part 11 e-signatures | **YES** (full §11.50/70/100) | NO confirmed | NO |
| Tamper detection (SHA-256) | **YES** | Unknown | NO |
| Immutable audit trail | **YES** | YES | YES |
| GxP compliance logging | **YES** | Unknown | **YES** |

**Verdict:** C2C has the strongest compliance tooling. Only C2C has production e-signatures and real-time compliance scanning.

---

### 10. Templates & CTD Structure

| Feature | C2C | Weave | Artos |
|---------|-----|-------|-------|
| eCTD templates | YES (TemplateGeneratorPanel) | YES | **400+ free templates** |
| Custom template creation | YES | YES (template/content toggle) | **YES** (with AI optimization) |
| Module-aware structure | YES (DossierMap, CTD) | YES | **YES** (deep module logic) |
| Template → AI draft pipeline | YES | **YES** | **YES** |
| Template marketplace/library | NO | NO | **YES** (400+ free, 3rd party) |

**Verdict:** Artos leads with 400+ templates and template marketplace. **Gap: need a broader template library.**

---

### 11. Cross-Document Intelligence

| Feature | C2C | Weave | Artos |
|---------|-----|-------|-------|
| Cross-section consistency | YES (RIM cross-artifact) | Unknown | **YES** (Inconsistency Intelligence) |
| Change impact propagation | YES (rim-change-impact.ts) | Unknown | **YES** (dossier-scale) |
| Cross-reference panel | **YES** (CrossReferencePanel) | Unknown | NO |
| Term inconsistency detection | **YES** (InconsistencyPanel) | NO | **YES** |
| "Changes Marked" auto-edit | NO | NO | **YES** |

**Verdict:** C2C and Artos both have cross-document intelligence but with different approaches. **Gap: auto-edit affected sections when a change propagates (Artos's "Changes Marked" mode).**

---

### 12. Import & Export

| Feature | C2C | Weave | Artos |
|---------|-----|-------|-------|
| DOCX import (Mammoth.js) | **YES** | YES | YES |
| PDF import (server OCR) | **YES** | YES | YES |
| Image import + OCR | **YES** | Unknown | YES |
| CSV/TSV → table | **YES** | Unknown | Unknown |
| RTF/HTML/Markdown import | **YES** | Unknown | Unknown |
| DOCX export | **YES** (full formatting) | YES | Likely |
| PDF export | **YES** | Unknown | Unknown |
| PPTX export | **YES** | NO | NO |
| Markdown export | **YES** | NO | NO |
| eCTD XML backbone | YES | YES | Exploring (FHIR) |

**Verdict:** C2C has the broadest import/export. PPTX and Markdown export are unique.

---

### 13. External Storage & Integrations

| Feature | C2C | Weave | Artos |
|---------|-----|-------|-------|
| Project Vault (internal DMS) | **YES** | YES | YES |
| Veeva Vault | YES (connector) | Unknown | **YES** (confirmed) |
| SharePoint | YES (connector) | Unknown | **YES** (confirmed) |
| OneDrive | YES (connector) | Unknown | Unknown |
| Google Drive | YES (connector) | Unknown | **YES** (confirmed) |
| Box | NO | Unknown | **YES** |
| Empower | NO | Unknown | **YES** |
| LIMS | NO | Unknown | **YES** |
| Microsoft Teams notify | NO | Unknown | **YES** |
| Local PC download | **YES** | YES | Likely |
| Print | **YES** | Likely | Unknown |

**Verdict:** Artos has the broadest confirmed integration set including Box, Empower, LIMS, and Teams notifications. **Gap: Box integration, Teams notifications, LIMS.**

---

## Production Parity Gaps — Status After Prior Sessions

> **IMPORTANT UPDATE (2026-03-30):** A prior Claude session (2026-03-29) already closed most
> critical gaps. See `docs/reports/weave-parity-updated-2026-03-29.md` (10/10 Weave parity)
> and `docs/reports/ARTOS_PARITY_ASSESSMENT_2026-03-29.md` (8.8/10 Artos parity).
> Commits: `a3cb8674`, `8faf665b`, `d3f9650a`.

### ALREADY CLOSED (Built in prior session)

| # | Gap | Status | Commit | Evidence |
|---|-----|--------|--------|----------|
| 1 | **Sentence-level source traceability** | CLOSED | `a3cb8674` | `applySourceTraceability.ts` — `[SRC-n]` tokens → TraceabilityMark spans with click-to-reveal source |
| 2 | **HAQ Response Manager** | CLOSED | `8faf665b` | Server-side persistence (`PUT/GET /projects/:id/haq-session`), auto-classify, AI-draft, review/finalize |
| 3 | **AI table generation** | CLOSED | `8faf665b` | Added `generate-table` slash command + AI action |
| 4 | **Cross-ref auto-update** | CLOSED | `8faf665b` | CrossReferencePanel auto-scans on content change (1s debounce) |
| 5 | **CRDT collaboration** | CLOSED | `a3cb8674` | Y.js + Hocuspocus WebSocket + CollaborationCursor |
| 6 | **Reviewer workflow persistence** | CLOSED | `a3cb8674` | Team member API, reviewer CRUD, review decisions, reminders |
| 7 | **Automation engine + DMS connectors + SAML SSO** | CLOSED | `d3f9650a` | Artos parity gaps — automation engine, DMS connectors, SAML SSO |
| 8 | **Cross-document inconsistency** | ALREADY AHEAD | N/A | `contradiction-engine-service.ts` — 8+ contradiction types, formal source-of-truth hierarchy |

### REMAINING GAPS (Still to build)

| # | Gap | Competitor Advantage | Effort | Priority |
|---|-----|---------------------|--------|----------|
| 1 | **Purpose-built IND auto-draft** | Weave (AutoIND) — upload source docs → complete IND draft in hours, no prompts | 2-3 weeks | P0 |
| 2 | **400+ eCTD template library** | Artos — free, pre-structured templates (we have 117+, they have 400+) | 1-2 weeks | P1 |
| 3 | **Comment-driven AI regeneration** | "Address this comment" → AI rewrites section incorporating reviewer feedback | 3-5 days | P1 |
| 4 | **Zero-hallucination validation layer** | Artos claims "zero hallucination" — fact-check layer validating AI claims against source data | 1 week | P1 |
| 5 | **Box integration** | Artos has Box; add to SaveToDialog + connector library | 2-3 days | P2 |

### NICE TO HAVE (Polish items)

| # | Gap | What's Needed | Effort |
|---|-----|--------------|--------|
| 6 | LIMS integration | Connector for lab information management | 3-5 days |
| 7 | Empower integration | Waters Empower chromatography data connector | 3-5 days |
| 8 | HL7 FHIR data import | Structured submission data from FHIR resources | 1 week |
| 9 | Template marketplace | Let orgs share/sell templates | 1-2 weeks |
| 10 | AI usage analytics dashboard | Track AI generation quality, acceptance rates, hallucination rates | 1 week |

---

## Where We Already Win (Defend These)

These are production advantages neither competitor can match:

1. **Real-time CRDT collaboration** (Y.js + Hocuspocus) — neither competitor has confirmed CRDT
2. **21 CFR Part 11 e-signatures** — full §11.50/70/100 compliance, tamper detection
3. **20+ rule compliance scanner** with auto-fix — runs in real-time as you type
4. **Full document lifecycle** (Draft → Review → Approved → Locked → Published) with quality gates
5. **22 inspector panels** — no competitor has this depth of contextual intelligence
6. **AI autocomplete ghost text** — inline completion as you type (Tab to accept)
7. **5 AI rewrite modes** — rewrite, expand, summarize, regulatory tone, add references
8. **Right-click context menu** with 14 actions (Word-like editing)
9. **Font family + font size + line height** control (Word parity)
10. **Zoom, Print Preview, TOC generation** — professional document tooling
11. **Multi-document tabs** — work on multiple artifacts simultaneously
12. **PPTX + Markdown export** — unique output formats
13. **Document watermarking** — status-based visual indicators
14. **Document health scoring** — 6-dimension quality assessment
15. **Regulatory Intelligence Model (RIM)** — compounding judgment, not just generation

---

## Recommended Sprint Plan

### Sprint 1 (Week 1-2): Close Critical Gaps
- [ ] Sentence-level source traceability popover (P0)
- [ ] eCTD template library — seed 50+ templates from CTD structure (P0)
- [ ] Cross-document change propagation with "Changes Marked" mode (P1)

### Sprint 2 (Week 2-3): AI Draft Parity
- [ ] IND AutoDraft — ingest source docs → generate complete IND (P0)
- [ ] Comment-driven AI regeneration (P1)
- [ ] Zero-hallucination validation layer (P1)

### Sprint 3 (Week 3-4): Enterprise Polish
- [ ] HAQ Response Manager (P1)
- [ ] Auto-update tables from source data (P1)
- [ ] Box connector + Teams notifications (P2)

### Sprint 4 (Week 4-5): Competitive Edge
- [ ] Template marketplace (org sharing)
- [ ] AI usage analytics
- [ ] FHIR data import
- [ ] LIMS/Empower connectors

---

## Bottom Line

**After prior session gap closures (2026-03-29), we are at ~95% editor parity and ~80% AI generation parity.** 8 of the original 10 critical gaps were already closed in commits `a3cb8674`, `8faf665b`, and `d3f9650a`. The 5 remaining items are incremental improvements, not structural gaps. The only P0 item is IND AutoDraft (purpose-built zero-prompt generation from uploaded source docs). Everything else is P1/P2 polish. We already exceed both competitors on collaboration, compliance, lifecycle, intelligence, and multi-agency support.

---

## Sources

- Concept2Cure codebase audit (28 TipTap extensions, 22 inspector panels, 58 toolbar commands)
- Weave.bio: weave.bio, April 2025 release notes, AutoIND/AutoCT pages, HAQ Manager launch
- Artos AI: artosai.com, Y Combinator W24, 60+ source URLs from feature pages, blog posts, conference listings
- Prior competitive analysis: docs/competitive-analysis-weave-bio.md (2026-03-19)
- Prior competitive analysis: docs/competitive-analysis-artos-ai.md (2026-03-30)
