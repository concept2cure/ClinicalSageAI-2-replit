# Click-Through Audit: Segment 6 — Editor Panel (Full Editing Experience)

## 1. EditorPanel Loading

- **File**: `client/src/concept2cure/components/editor/EditorPanel.tsx`
- **Lazy loaded**: from `ProjectWorkspaceShell.tsx:99`
- **Data fetched on mount**: Artifact content, metadata, versions via `apiRequest`
- **Loading state**: Uses loading spinners and toast notifications
- **Verdict**: **PASS** — Properly lazy loaded with loading states

---

## 2. TipTap Editor Setup

- **File**: `client/src/concept2cure/components/editor/UnifiedDocumentEditor.tsx`
- **28+ Extensions registered**:

### Core (from TipTap packages):
| Extension | Import | Status |
|-----------|--------|--------|
| StarterKit | `@tiptap/starter-kit` | Installed |
| Highlight | `@tiptap/extension-highlight` | Installed |
| TextStyle | `@tiptap/extension-text-style` | Installed |
| Color | `@tiptap/extension-color` | Installed |
| Placeholder | `@tiptap/extension-placeholder` | Installed |
| CharacterCount | `@tiptap/extension-character-count` | Installed |
| Underline | `@tiptap/extension-underline` | Installed |
| Table/Row/Cell/Header | `@tiptap/extension-table*` | Installed |
| TaskList + TaskItem | `@tiptap/extension-task-list/item` | Installed |
| TextAlign | `@tiptap/extension-text-align` | **MISSING from package.json** |
| Superscript | `@tiptap/extension-superscript` | **MISSING from package.json** |
| Subscript | `@tiptap/extension-subscript` | **MISSING from package.json** |
| Link | `@tiptap/extension-link` | Installed |
| FontFamily | `@tiptap/extension-font-family` | **MISSING from package.json** |
| Heading | `@tiptap/extension-heading` | Installed |
| Collaboration | `@tiptap/extension-collaboration` | Installed |
| CollaborationCursor | `@tiptap/extension-collaboration-cursor` | Installed |

### Custom Extensions (local):
| Extension | File | Purpose |
|-----------|------|---------|
| SearchAndReplace | `extensions/SearchAndReplace` | Find/replace in editor |
| SlashCommandMenu | `extensions/SlashCommandMenu` | "/" triggered command palette |
| CommentMark | `extensions/CommentMark` | Inline comment threads |
| AIAutocomplete | `extensions/AIAutocomplete` | AI-powered text completion |
| GlossaryTooltip | `extensions/GlossaryTooltip` | Regulatory term tooltips |
| CitationMark + Plugin | `extensions/CitationPlugin` | Source citations |
| ComplianceScanner | `extensions/ComplianceScanner` | Live compliance scanning |
| TrackChanges | `extensions/TrackChangesExtension` | Tracked changes (review mode) |
| PageBreak | `extensions/PageBreakExtension` | Page break markers |
| Indent | `extensions/IndentExtension` | Paragraph indentation |
| TraceabilityMark | Inline (line 346) | [SRC-n] source tokens |
| FontSize | Inline (line 79) | Font size via TextStyle |
| LineHeight | Inline (line 112) | Line height on paragraphs |
| HeadingWithId | Inline (line 385) | Auto-ID headings for outline |

### CRITICAL: 4 Missing TipTap Packages
- `@tiptap/extension-text-align` — imported line 38 but NOT in package.json
- `@tiptap/extension-superscript` — imported line 39 but NOT in package.json
- `@tiptap/extension-subscript` — imported line 40 but NOT in package.json
- `@tiptap/extension-font-family` — imported line 42 but NOT in package.json

**These will cause a runtime crash if not hoisted from another dependency's node_modules.**

- **Verdict**: **FAIL** — 4 missing packages will crash the editor

---

## 3. AI Actions in Editor

- **File**: `EditorPanel.tsx:149-153`
- **6 AI Actions defined**:
  1. `rewrite` — Rewrite selected text
  2. `expand` — Expand content with more detail
  3. `summarize` — Summarize content
  4. `regulatory-tone` — Adjust to regulatory tone
  5. `add-references` — Add references to claims
  6. `generate-table` — Generate a data table

- **Handler**: `handleAIEdit` (line 1436)
  - Calls `POST /api/concept2cure/ai/edit-section` via `apiRequest`
  - Sends: action, text, sectionTitle, submissionType, projectId, artifactId, ctdSection
  - Response: AI result + provenance (source count, claims traced)
  - Accept: `handleAcceptAI` (line 1482) — inserts HTML into editor

- **Verdict**: **PASS** — Real API call, provenance tracking, proper error handling with toasts

---

## 4. Source Traceability

- **TraceabilityMark** (UnifiedDocumentEditor.tsx:346): Custom TipTap Mark that renders `[SRC-n]` tokens as highlighted spans with `data-source-index` attributes
- **applySourceTraceability**: Parses AI output for `[SRC-n]` patterns, resolves to provenance sources
- **Chain**: AI generates text with [SRC-n] → parser extracts and maps → TraceabilityMark renders as clickable marks
- **Verdict**: **PASS** — Complete end-to-end traceability chain

---

## 5. Auto-Save

- **Save handler**: Calls `POST /api/concept2cure/projects/{projectId}/artifacts/{artifactId}` or `PUT` variant
- **Versioning**: Each save creates an immutable version (21 CFR Part 11 compliant)
- **Lock enforcement**: HTTP 423 if document is locked by another user
- **Optimistic concurrency**: HTTP 409 on version conflict
- **Verdict**: **PASS** — Production-quality save with compliance

---

## 6. CRDT Collaboration

- **useYjsProvider hook**: Connects to Hocuspocus WebSocket server
- **hocuspocus-server.ts**: Server-side Y.js document management
- **Package**: `@hocuspocus/server@3.4.4` in package.json
- **Extensions**: `Collaboration` + `CollaborationCursor` registered (lines 153-154)
- **Verdict**: **PASS** — Full CRDT stack configured

---

## 7. Track Changes (Review Mode)

- **TrackChanges extension**: `extensions/TrackChangesExtension`
- **Toggle**: `editor.extensionManager.extensions.find(e => e.name === 'trackChanges')?.options?.enabled` (line 917)
- **ReviewMode.tsx**: Provides review-specific toolbar
- **InlineApprovalPanel.tsx**: Approve/reject tracked changes
- **Tracked change decisions**: `POST /api/authoring/documents/{id}/tracked-change-decisions` persists accept/reject to DB
- **Verdict**: **PASS** — Full review mode with tracked changes

---

## Summary

| Feature | Verdict | Issue |
|---------|---------|-------|
| Editor Loading | **PASS** | Lazy loaded, proper states |
| TipTap Extensions (24 working) | **PASS** | Rich extension set |
| 4 Missing TipTap Packages | **FAIL** | TextAlign, Superscript, Subscript, FontFamily not in package.json |
| AI Actions (6 types) | **PASS** | Real API, provenance tracking |
| Source Traceability | **PASS** | Complete [SRC-n] pipeline |
| Auto-Save | **PASS** | Versioned, compliant |
| CRDT Collaboration | **PASS** | Full Y.js/Hocuspocus stack |
| Track Changes | **PASS** | Review mode with persistence |

**Critical Issue**: 4 TipTap extension packages missing from package.json — editor may crash at runtime.
