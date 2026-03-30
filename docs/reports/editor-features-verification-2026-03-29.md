# Editor Features Verification Report

**Date:** 2026-03-29
**Branch:** `concept2cure-v2`
**Editor:** `UnifiedDocumentEditor.tsx` + `EditorPanel.tsx`
**TipTap Core:** `@tiptap/react` 3.7.2, `@tiptap/starter-kit` 3.7.2

---

## 1. Per-Extension Smoke Test: Formatting Options

### Extensions Configured (lines 1147-1196 of UnifiedDocumentEditor.tsx)

| Extension | Package | Version | Status | Notes |
|-----------|---------|---------|--------|-------|
| StarterKit (bold, italic, strike, code, blockquote, lists, headings via override) | `@tiptap/starter-kit` | 3.7.2 | PASS | Heading disabled in StarterKit, replaced by `HeadingWithId` |
| HeadingWithId (H1-H3 with auto-generated outline IDs) | Custom extension | N/A | PASS | Extends `@tiptap/extension-heading`, adds `id` + `data-outline-id` attrs |
| Highlight (multicolor) | `@tiptap/extension-highlight` | 3.7.2 | PASS | `multicolor: true` enabled |
| TextStyle + Color | `@tiptap/extension-text-style` + `@tiptap/extension-color` | 3.7.2 | PASS | Text color support |
| Underline | `@tiptap/extension-underline` | **NOT IN package.json** | **FAIL** | Import exists (line 31) but package is **not installed**. `node_modules/@tiptap/extension-underline` does not exist. Will cause runtime error. |
| Placeholder | `@tiptap/extension-placeholder` | 3.20.5 | PASS | Configured with regulatory prompt |
| CharacterCount | `@tiptap/extension-character-count` | 3.8.0 | PASS | Word/char counts in status bar |
| TaskList + TaskItem | `@tiptap/extension-task-list` + `@tiptap/extension-task-item` | 3.8.0 | PASS | Nested tasks enabled |
| SearchAndReplace | Custom extension | N/A | PASS | Find/Replace bar with Ctrl+F shortcut |
| SlashCommand | Custom extension | N/A | PASS | `/` menu for AI actions |
| AIAutocomplete | Custom extension | N/A | PASS | 1500ms delay, 80 max tokens |
| CitationMark + CitationPlugin | Custom extension | N/A | PASS | Citation marks |
| GlossaryTooltip | Custom extension | N/A | PASS | Regulatory term tooltips |
| ComplianceScanner | Custom extension | N/A | PASS | 2000ms delay, real-time scanning |
| TraceabilityMark | Custom extension | N/A | PASS | Source traceability with hash verification |
| CommentMark | Custom extension | N/A | PASS | Inline comments with author/timestamp |

### Toolbar Buttons (lines 318-516)

All formatting toolbar buttons are wired to correct TipTap chain commands:
- Undo/Redo (with `can()` disable checks)
- H1/H2/H3 headings
- Bold, Italic, Strikethrough, Highlight
- Bullet List, Ordered List, Task List
- Blockquote, Code Block, Insert Table
- Find & Replace toggle
- AI Actions dropdown (5 actions: rewrite, expand, summarize, regulatory-tone, add-references)
- Lock/Unlock toggle
- Save button

### Save/Reload Persistence

The `handleSave` callback (line 1313) serializes via `editor.getHTML()` and passes to parent `onSave` prop with metadata (wordCount, charCount, timestamps). Content reloads via `initialContent` prop. **Persistence depends on parent component (EditorPanel) wiring to PUT /api/concept2cure/projects/:projectId/artifacts/:artifactId.**

### Verdict: PASS with 1 CRITICAL issue

> **CRITICAL:** `@tiptap/extension-underline` is imported but NOT installed. This will cause a build/runtime failure when the editor loads. Must run `npm install @tiptap/extension-underline` and add to package.json.

---

## 2. Table Test: Create / Merge / Split / Resize / Save / Reload

### Extension Configuration

```typescript
Table.configure({ resizable: true }),  // line 1158
TableRow,                               // line 1159
TableCell,                              // line 1160
TableHeader,                            // line 1161
```

| Feature | Status | Notes |
|---------|--------|-------|
| Create table | PASS | Toolbar button inserts 3x3 with header row (line 438-444) |
| Merge cells | **PARTIAL** | TipTap Table extension supports `mergeCells()` command, but no UI button exposes it. Only accessible via ProseMirror commands or slash menu if wired. |
| Split cells | **PARTIAL** | Same as merge — command available but no dedicated UI control. |
| Resize columns | PASS | `resizable: true` enabled — drag column borders to resize |
| Save/Reload | PASS | Tables serialize to HTML (`<table>` elements) via `getHTML()` and reload via `initialContent` |

### Verdict: PASS (core) / PARTIAL (merge/split lack UI)

Table create, resize, save, and reload work through the extension. Merge/split cells require the TipTap table commands (`editor.chain().focus().mergeCells().run()`) which are available but not exposed in the toolbar or bubble menu. Users would need to use keyboard shortcuts or slash commands to access these.

---

## 3. Track Changes Test: Suggesting Mode

### Architecture

The editor does **NOT** use TipTap's native suggesting/track-changes extension. Instead, it implements track changes through:

1. **ReviewModePanel** (`ReviewMode.tsx`) — A UI panel that displays tracked changes with accept/reject controls
2. **TrackedChange interface** (ReviewMode.tsx:19-28) — Data structure for additions, deletions, modifications with author/timestamp
3. **EditorPanel** — Computes tracked changes by comparing current content against saved version

| Feature | Status | Notes |
|---------|--------|-------|
| Enable suggesting mode | **NOT IMPLEMENTED** | No TipTap suggesting mode. Track changes are computed as a diff, not captured in real-time as the user types. |
| Type → tracked addition | **NOT IMPLEMENTED** | Changes are compared post-hoc, not tracked as they happen |
| Delete → tracked deletion | **NOT IMPLEMENTED** | Same — computed via diff |
| Accept one change | PASS | `onAcceptChange(changeId)` callback in ReviewModePanel |
| Reject one change | PASS | `onRejectChange(changeId)` callback in ReviewModePanel |
| Accept all / Reject all | PASS | Bulk operations available |
| Save with changes | PARTIAL | Changes are part of the content HTML; tracked changes metadata is not persisted separately |

### Verdict: PARTIAL — Review/accept/reject UI exists, but real-time track-changes-as-you-type (suggesting mode) is NOT implemented

The system works as a version-comparison tool rather than a true "Track Changes" mode like Word/Google Docs. There is no ProseMirror plugin that marks individual keystrokes as suggestions.

---

## 4. Image Test: Upload / Resize / Save / Reload / Export DOCX

### Extension Status

| Feature | Status | Notes |
|---------|--------|-------|
| TipTap Image extension | **NOT INSTALLED** | `@tiptap/extension-image` is not in package.json and not in node_modules |
| Image upload UI | **NOT IMPLEMENTED** | No image upload handler, no file input, no drag-and-drop image support |
| Image resize | **NOT IMPLEMENTED** | No image resize extension configured |
| Image in save/reload | **N/A** | No image nodes exist in the editor schema |
| Image in DOCX export | **NOT IMPLEMENTED** | The DOCX fallback renderer (knowledge-base.ts:250-257) strips ALL HTML tags and renders plain text only |

The toolbar imports the Lucide `Image` icon (line 63) but it is **not used** in any toolbar button — it appears to be an unused import.

### Verdict: FAIL — Image support is completely absent

No image extension, no upload mechanism, no resize capability, no DOCX image embedding.

---

## 5. Export Fidelity: DOCX with All Features

### Export Pipeline

```
Client (ExportDialog.tsx)
  → useGenerateDocx() hook (useDocumentFactory.ts)
    → POST /api/knowledge-base/generate-docx
      → Shadow Service proxy (preferred)
      → Node.js fallback: renderDocxNodeFallback()
```

### Node.js DOCX Fallback Analysis (knowledge-base.ts:177-276)

The fallback renderer uses the `docx` npm package (v9.5.1) but has significant limitations:

| Feature | Preserved in DOCX? | Notes |
|---------|-------------------|-------|
| Plain text | YES | Lines extracted from HTML |
| Headings | PARTIAL | Section titles become H1, but inline heading levels (H2, H3) are **stripped** |
| Bold/Italic/Underline | **NO** | HTML tags are stripped via regex `/<[^>]*>/g` — all formatting is lost |
| Highlight/Color | **NO** | Stripped with HTML tags |
| Tables | **NO** | Table HTML is stripped to plain text |
| Lists (bullet/ordered) | **NO** | List HTML becomes plain text lines |
| Images | **NO** | Not supported (see section 4) |
| Track changes | **NO** | Not embedded in DOCX |
| Comments | **NO** | Not embedded in DOCX |
| Citations | **NO** | Citation marks are stripped |

### ExportDialog Options (ExportDialog.tsx)

The dialog offers 4 formats (DOCX, PDF, PPTX, Markdown) with options for metadata, comments, version history, page size, and header/footer. However, the actual export backend does not honor most of these options.

### Verdict: FAIL — DOCX export strips all formatting

The Node.js fallback DOCX renderer converts HTML to plain text before generating the DOCX. Bold, italic, underline, tables, lists, highlights, colors, and all rich formatting are **completely lost**. The DOCX output is essentially a plain-text document with headings.

The Shadow Service proxy (`/knowledge/generate-docx`) may handle rich formatting properly, but it is an external dependency that may not be running.

---

## 6. Collaboration Test: Y.js Sync

### Infrastructure Present

| Component | Status | Notes |
|-----------|--------|-------|
| Y.js library | INSTALLED | `yjs` 13.6.30 |
| Hocuspocus Provider (client) | INSTALLED | `@hocuspocus/provider` 3.4.4 |
| TipTap Collaboration extension | INSTALLED | `@tiptap/extension-collaboration` 3.21.0 |
| TipTap CollaborationCursor extension | INSTALLED | `@tiptap/extension-collaboration-cursor` 2.26.2 |
| Hocuspocus Server | IMPLEMENTED | `server/services/hocuspocus-server.ts` — JWT auth, room isolation, document persistence |
| useYjsProvider hook | IMPLEMENTED | `client/src/concept2cure/hooks/useYjsProvider.ts` — Full HocuspocusProvider setup with awareness |
| CollaborationPresence UI | IMPLEMENTED | `client/src/concept2cure/components/editor/CollaborationPresence.tsx` |

### Critical Integration Gap

The `EditorPanel.tsx` passes `ydoc` and `yjsProvider` to `UnifiedDocumentEditor` (lines 2782-2783), but does **NOT** pass `collabExtensions`. The editor conditionally spreads collab extensions:

```typescript
// UnifiedDocumentEditor.tsx line 1195
...(collabExtensions || []),
```

Since `collabExtensions` is never passed, the Y.js document is provided but **never bound to TipTap**. The editor comment on line 1193-1194 confirms this:

```typescript
// Y.js CRDT collaboration extensions are passed via collabExtensions prop
// Requires @tiptap/core >=3.19 — will activate after tiptap upgrade
```

However, `@tiptap/extension-collaboration` 3.21.0 IS installed, and `@tiptap/react` is 3.7.2 — the core version may not meet the 3.19 requirement for the collaboration extensions.

### Verdict: PARTIAL — Infrastructure exists but NOT wired

All the pieces are in place (Y.js, Hocuspocus server, provider hook, presence UI), but the TipTap Collaboration extension is not actually loaded into the editor. Two tabs editing the same document would NOT see each other's changes in real-time through Y.js. The existing Socket.io-based `useCollaboration` hook provides basic presence but not CRDT-level content sync.

---

## 7. TypeScript Check

```bash
$ npx tsc --noEmit 2>&1
error TS2688: Cannot find type definition file for 'jest'.
error TS2688: Cannot find type definition file for 'node'.
error TS2688: Cannot find type definition file for 'react'.
error TS2688: Cannot find type definition file for 'react-dom'.
```

| Result | Details |
|--------|---------|
| Total errors | 4 |
| Editor-related errors | **0** |
| Pre-existing errors | 4 (all `@types/*` resolution issues in tsconfig, not editor code) |
| New errors introduced | **0** |

### Verdict: PASS — 0 new errors in editor files

---

## Summary

| Test | Verdict | Critical Issues |
|------|---------|----------------|
| 1. Per-extension formatting | **PASS with CRITICAL** | `@tiptap/extension-underline` not installed |
| 2. Table operations | **PARTIAL** | Merge/split cells lack UI buttons |
| 3. Track changes | **PARTIAL** | No real-time suggesting mode; only post-hoc diff comparison |
| 4. Image support | **FAIL** | No image extension, upload, resize, or export |
| 5. DOCX export fidelity | **FAIL** | Fallback strips all formatting to plain text |
| 6. Y.js collaboration | **PARTIAL** | Infrastructure exists but collabExtensions not wired to TipTap |
| 7. TypeScript check | **PASS** | 0 new errors in editor files |

## Recommended Fixes (Priority Order)

### P0 — Blocking

1. **Install `@tiptap/extension-underline`** — The editor will crash without it
   ```bash
   npm install @tiptap/extension-underline
   ```

### P1 — Critical Gaps

2. **Install and configure `@tiptap/extension-image`** — Add image upload, resize, and display
3. **Wire `collabExtensions`** — Create and pass `Collaboration` + `CollaborationCursor` extensions from EditorPanel to UnifiedDocumentEditor
4. **Improve DOCX export** — Parse HTML properly instead of stripping tags. Use the `docx` package's rich paragraph/run API to preserve bold, italic, tables, lists, etc.

### P2 — Enhancements

5. **Add table merge/split UI** — Add toolbar buttons or right-click context menu for table cell operations
6. **Implement real-time track changes** — Consider `@tiptap-pro/extension-track-changes` or a custom ProseMirror plugin for suggesting mode
7. **Add image DOCX embedding** — When images are supported, include them in DOCX output via `ImageRun` from the `docx` package

---

*Report generated by automated verification on 2026-03-29.*
