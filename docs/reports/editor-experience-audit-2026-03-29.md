# Editor Experience Audit — Brutally Honest Assessment
> Date: 2026-03-29 | Auditor: Claude Code (automated code-level analysis)

## TL;DR

**Concept2Cure's editor is NOT equivalent to MS Word.** It is a competent TipTap-based rich text editor with strong regulatory-specific features (compliance scanning, citations, AI autocomplete, cross-references) but significant gaps in basic word processing capabilities that knowledge workers expect.

**Vs. Weave.bio:** Comparable in AI-assisted drafting and regulatory structure. Concept2Cure has MORE extensions (compliance, citations, glossary, cross-references). But Weave's actual editor UX is not publicly verifiable — their differentiation is AI draft generation speed, not editor sophistication.

---

## Feature-by-Feature Rating

### Core Text Editing

| Feature | Status | Notes |
|---------|--------|-------|
| Bold / Italic / Underline / Strike | ✅ Production | TipTap StarterKit extensions loaded |
| Headings (H1-H4) | ✅ Production | Configured in useEditor |
| Bullet lists / Ordered lists | ✅ Production | TipTap List extensions |
| Blockquotes | ✅ Production | Part of StarterKit |
| Code blocks | ✅ Production | Part of StarterKit |
| Undo / Redo | ✅ Production | TipTap History extension |
| Copy / Paste | ✅ Production | Native browser + TipTap |
| Keyboard shortcuts (Ctrl+B/I/Z) | ✅ Production | TipTap defaults |

### Text Formatting — GAPS

| Feature | Status | Notes |
|---------|--------|-------|
| Text alignment (left/center/right/justify) | ❌ Missing | No TextAlign extension loaded |
| Font family picker | ❌ Missing | No FontFamily extension |
| Font size picker | ❌ Missing | No FontSize extension — only heading levels |
| Text color / highlight | ❌ Missing | No Color/Highlight extensions |
| Superscript / Subscript | ❌ Missing | Not loaded — needed for scientific notation |
| Line spacing | ❌ Missing | No line spacing control |
| Paragraph spacing | ❌ Missing | No paragraph spacing control |
| Indentation controls | ❌ Missing | No indent/outdent beyond list nesting |

### Tables

| Feature | Status | Notes |
|---------|--------|-------|
| Basic table insertion | ✅ Production | TipTap Table extension loaded |
| Add/remove rows/columns | ✅ Production | Table toolbar buttons exist |
| Cell merge / split | ❌ Missing | No mergeCells/splitCell found in editor code |
| Column resize (drag) | ❌ Missing | No columnResizing extension |
| Table styling (borders, colors) | ❌ Missing | Basic only |

### Images & Media

| Feature | Status | Notes |
|---------|--------|-------|
| Image insertion | ⚠️ Limited | Image import exists in editor but `@tiptap/extension-image` NOT in package.json — may be a custom or broken implementation |
| Image resize | ❌ Missing | No resize handles |
| Figure captions | ❌ Missing | No figure/caption extension |
| Charts / graphs | ❌ Missing | No chart embedding |

### Document Structure — GAPS vs Word

| Feature | Status | Notes |
|---------|--------|-------|
| Page breaks | ❌ Missing | No pageBreak extension — web-first, not page-first |
| Headers & footers | ⚠️ Export only | Available as export option in ExportDialog, not in-editor |
| Footnotes / endnotes | ❌ Missing | No footnote extension |
| Table of contents (auto) | ❌ Missing | No TOC generation |
| Page numbers | ⚠️ Export only | Added during DOCX/PDF export |
| Section breaks | ❌ Missing | No section break concept |
| Columns (multi-column layout) | ❌ Missing | Single-column only |

### Track Changes & Review

| Feature | Status | Notes |
|---------|--------|-------|
| Track changes (Word-style) | ⚠️ Limited | ReviewMode extension exists — shows diff between versions, NOT real-time insertion/deletion tracking like Word |
| Accept/reject individual changes | ❌ Missing | Diff view only, no per-change accept/reject |
| Reviewer comments (inline) | ✅ Production | CommentMark extension — inline threaded comments with resolve |
| Document compare (diff) | ✅ Production | DocumentDiff panel shows version comparison |
| Approval workflow | ✅ Production | InlineApproval + SignatureWorkflow components |

### Find & Replace

| Feature | Status | Notes |
|---------|--------|-------|
| Find in document | ✅ Production | SearchAndReplace extension |
| Replace / Replace All | ✅ Production | Full replace functionality |
| Regex search | ❌ Unknown | Not verified in extension code |
| Find & Replace across documents | ❌ Missing | Single document only |

### Export

| Feature | Status | Notes |
|---------|--------|-------|
| DOCX export | ✅ Production | `server/routes/docx-factory.ts` + `server/services/docx/masterDocumentBuilder.ts` |
| PDF export | ✅ Production | `server/routes/ind-pdf.ts` + export routes |
| HTML export | ✅ Production | TipTap getHTML() native |
| Markdown export | ⚠️ Likely | TipTap can output markdown but no explicit button |
| eCTD package | ⚠️ Partial | Submission builder exists but full eCTD packaging unclear |

### AI Features — STRENGTH AREA

| Feature | Status | Notes |
|---------|--------|-------|
| AI autocomplete (inline) | ✅ Production | AIAutocomplete extension + `POST /api/concept2cure/ai/autocomplete` backend |
| Slash commands (/generate, /check) | ✅ Production | SlashCommandMenu extension with 10+ commands |
| AI rewrite/expand/simplify | ✅ Production | Authoring actions via AI gateway |
| Compliance scanning (inline) | ✅ Production | Real-time pattern matching + ComplianceScannerPanel |
| Regulatory intelligence in context | ✅ Production | RIM integration, precedent search, deficiency detection |

### Collaboration

| Feature | Status | Notes |
|---------|--------|-------|
| Real-time multi-cursor editing | ✅ Production | Y.js + Hocuspocus CRDT via `useYjsProvider` hook |
| Presence indicators | ✅ Production | CollaborationPresence component shows active users |
| Live sync (CRDT) | ✅ Production | Conflict-free replicated data types |
| Collaboration cursors with names | ✅ Production | Color-coded per user |

### Regulatory-Specific Features — STRENGTH AREA

| Feature | Status | Notes |
|---------|--------|-------|
| CTD section structure | ✅ Production | Section codes, module hierarchy |
| Cross-references | ✅ Production | CrossReferencePanel for linking between sections |
| Citation management | ✅ Production | CitationPlugin with search and insertion |
| Glossary tooltips | ✅ Production | GlossaryTooltip extension |
| Compliance scanning | ✅ Production | Real-time with ComplianceScannerPanel |
| Document versioning | ✅ Production | VersionTimeline with full history |
| Document locking | ✅ Production | Lock/unlock with 423 conflict handling |
| Watermarks | ✅ Production | DocumentWatermark overlay (DRAFT, CONFIDENTIAL, etc.) |
| Signature workflows | ✅ Production | 21 CFR Part 11 electronic signatures |
| Document health scoring | ✅ Production | DocumentHealth panel with real-time metrics |

### Performance & UX

| Feature | Status | Notes |
|---------|--------|-------|
| Autosave | ✅ Production | Periodic save with dirty state tracking |
| Keyboard shortcuts panel | ✅ Production | KeyboardShortcuts component |
| Toolbar | ⚠️ Basic | Formatting toolbar exists but not ribbon-style (more like Notion than Word) |
| Unsaved changes warning | ❌ Missing | No beforeunload prompt |
| Large document performance | ⚠️ Unknown | No virtualization detected; TipTap can slow on 50K+ word docs |

---

## Honest Comparison Matrix

### vs. Microsoft Word

| Area | Word | Concept2Cure | Verdict |
|------|------|-------------|---------|
| Text formatting | 50+ options | ~10 options | **Word wins decisively** |
| Tables | Full (merge, resize, formulas) | Basic (insert, add/remove) | **Word wins** |
| Page layout | Headers, footers, sections, columns | None (web-first) | **Word wins** |
| Track changes | Industry standard | Diff view only | **Word wins** |
| Images/media | Full support | Minimal | **Word wins** |
| Templates | Extensive | CTD-structured | **Niche: C2C wins for regulatory** |
| AI assistance | Copilot (general) | Deep regulatory AI | **C2C wins** |
| Compliance scanning | None | Real-time | **C2C wins** |
| Regulatory structure | None | Full CTD/eCTD | **C2C wins** |
| Collaboration | SharePoint/365 | Y.js CRDT | **Comparable** |
| Citations/references | Basic | Regulatory-specific | **C2C wins** |
| Export to DOCX | Native | Generated | **Word wins (fidelity)** |

**Summary:** Word is a better *word processor*. Concept2Cure is a better *regulatory document authoring system*. They're different tools for different jobs. But if a regulatory writer expects Word-like text formatting, they will be disappointed.

### vs. Weave.bio

| Area | Weave | Concept2Cure | Verdict |
|------|-------|-------------|---------|
| AI draft generation | Validated (Takeda study) | AI gateway + autocomplete | **Weave has proof** |
| Editor richness | Unknown (not public) | 25+ extensions, 7 custom | **C2C verifiable** |
| Compliance scanning | Marketing claim only | Real-time, rule-based | **C2C verified** |
| Track changes | Marketing claim only | Diff view (limited) | **Both limited/unverified** |
| Collaboration | Marketing claim only | Y.js CRDT (real) | **C2C verified** |
| eCTD templates | Yes (core feature) | CTD section structure | **Comparable** |
| Regulatory intelligence | Not mentioned | RIM + precedent + foresight | **C2C wins** |
| Citations | Not mentioned | Full citation system | **C2C wins** |
| 21 CFR Part 11 | Not mentioned | Signatures + audit trail | **C2C wins** |
| Veeva integration | Yes (confirmed) | Not present | **Weave wins** |
| Independent validation | 1 pharma partner | None | **Weave wins** |

**Summary:** Concept2Cure has MORE verifiable features than Weave. Weave has better marketing and one validation study. Neither is a Word replacement. Concept2Cure's strength is the intelligence layer (RIM, compliance, citations, foresight) that Weave doesn't appear to have.

---

## Critical Gaps to Close

**Priority 1 (blocks Word-switchers):**
1. Text alignment (left/center/right/justify)
2. Superscript/subscript (scientific notation)
3. Table cell merge/split + column resize
4. Real track changes (not just diff view)
5. Unsaved changes warning (beforeunload)

**Priority 2 (expected by professionals):**
6. Font size control (at least small/normal/large)
7. Text highlight/color
8. Page breaks (for export fidelity)
9. Footnotes
10. Image resize handles

**Priority 3 (nice to have):**
11. Table of contents generation
12. Headers/footers in editor (not just export)
13. Multi-column layout
14. Regex find/replace
15. Line/paragraph spacing controls

---

## Bottom Line

Concept2Cure's editor is **not a Word replacement** and should not be marketed as one. It IS a strong regulatory authoring environment with AI, compliance, collaboration, and domain intelligence that Word doesn't have. The right positioning is: *"Purpose-built for regulatory — not another word processor."*

The 8 missing basic formatting features (alignment, super/sub, merge cells, etc.) are fixable with TipTap extensions in 2-3 days of focused work. Track changes is harder — 1-2 weeks for a proper implementation.
