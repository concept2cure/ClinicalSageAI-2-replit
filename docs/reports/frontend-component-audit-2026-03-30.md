# Frontend Component Audit Report

**Date**: 2026-03-30
**Scope**: `/client/src/concept2cure/components/` — critical directories
**Auditor**: Claude Code (Opus 4.6)
**Type**: Research only — no files modified

---

## Executive Summary

Audited the editor/, chat/, workflow/, and supporting component directories across 8 categories. Found **67 issues** total:

| Category | Critical | Warning | Info |
|---|---|---|---|
| Forbidden patterns (raw `<button>`) | 36 instances | — | — |
| Raw `fetch()` (should use `apiRequest()`) | 15 instances | — | — |
| Raw `<textarea>` (should use `<Textarea>`) | 13 instances | — | — |
| Raw `<input>` (should use `<Input>/<Checkbox>`) | 2 instances | — | — |
| Ad-hoc query keys (should use `queryKeys.*`) | 3 components | — | — |
| Dead code (exported, never imported) | 3 components | — | — |
| UI state violations | 2 components | — | — |
| Accessibility gaps | Multiple | — | — |

**No broken imports found** in the critical directories. All import paths resolve to existing files.

---

## 1. Forbidden Pattern: Raw `<button>` (36 instances across 17 files)

Per CLAUDE.md, raw `<button>` is forbidden — must use `<Button variant="..." size="...">`.

### Critical Files (editor/, chat/, workflow/):

| File | Line(s) | Context |
|---|---|---|
| `chat/ConversationHealthPill.tsx` | 73, 163, 178 | Main pill button + suggested action buttons — all raw `<button>` with inline styles |
| `chat/ChatPanel.tsx` | 227, 238 | Copy/regenerate action buttons in message hover |
| `chat/ZenChat.tsx` | 810 | Stop-generating button in input area |
| `workflow/INDChecklist.tsx` | 142 | Back navigation button |
| `workflow/CSRWorkflow.tsx` | 236 | Back navigation button |

### Other Files:

| File | Count |
|---|---|
| `control-plane/CommandCenter.tsx` | 2 |
| `submission/PreSubmissionChecklist.tsx` | 1 |
| `submission/DossierNavigator.tsx` | 4 |
| `submission/TemplateLibrary.tsx` | 1 |
| `submission/SubmissionBuilder.tsx` | 1 |
| `calendar/RegulatoryCalendar.tsx` | 1 |
| `writing/ClinicalDocAuthoringWorkspace.tsx` | 4 |
| `writing/MedicalWriterQueue.tsx` | 1 |
| `provenance/DocumentVersionCompare.tsx` | 2 |
| `provenance/DocumentAuditReport.tsx` | 2 |
| `provenance/DocumentProvenancePanel.tsx` | 2 |
| `artifacts/ArtifactPanel.tsx` | 1 |
| `sidebar/ProjectsSidebar.tsx` | 2 |
| `pma/PMAWorkspace.tsx` | 1 |
| `layout/ConvergentCanvas.tsx` | 5 |
| `reports/ReportCenter.tsx` | 1 |
| `reports/IntelligentReportGenerator.tsx` | 1 |
| `coauthor/eCTDCoAuthor.tsx` | 1 |
| `collaboration/TeamCollaborationPanel.tsx` | 3 |

**Fix**: Replace all `<button>` with `<Button>` from `@/components/ui/button`.

---

## 2. Forbidden Pattern: Raw `fetch()` (15 instances across 8 files)

Per CLAUDE.md, raw `fetch()` is forbidden — must use `apiRequest()` from `@/lib/queryClient`.

| File | Line(s) | Description |
|---|---|---|
| `chat/AnaPersistentPanel.tsx` | 1690, 1763, 1777, 1805, 1836, 1991 | Dev-login refresh, AnA RI chat, Cortex fallback chat — 6 raw fetch calls with manual token handling |
| `reports/IntelligentReportGenerator.tsx` | 379 | Report export download |
| `onboarding/CTDProjectWizard.tsx` | 162 | File upload to CTD project |
| `workspace/IndEvidenceAskPanel.tsx` | 123 | Document upload with manual auth headers |
| `workflow/CSRWorkflow.tsx` | 162 | Artifact fetch with manual token from sessionStorage |
| `common/WelcomeBackScreen.tsx` | 164 | Tasks/pending fetch with manual auth headers |
| `editor/DataRoomPanel.tsx` | 292 | Document upload with manual auth headers |
| `editor/INDAutoDraftWizard.tsx` | 187 | IND auto-draft upload |
| `editor/EditorPanel.tsx` | 1584, 1620 | PDF extraction + OCR upload |

**Note**: `AnaPersistentPanel.tsx` has the worst case — 6 raw fetch calls with manual token management, duplicated auth header construction, and a bespoke token-refresh mechanism. This should all route through `apiRequest()`.

**Fix**: Replace all `fetch()` calls with `apiRequest()`. For file uploads (FormData), `apiRequest()` needs to handle those too (or a documented exception pattern should exist).

---

## 3. Forbidden Pattern: Raw `<textarea>` (13 instances across 8 files)

Per CLAUDE.md, raw `<textarea>` is forbidden — must use `<Textarea>` from `@/components/ui/textarea`.

| File | Line(s) |
|---|---|
| `chat/ChatPanel.tsx` | 132, 380 |
| `chat/ZenChat.tsx` | 795 |
| `chat/AnaPersistentPanel.tsx` | 3685, 3957, 5085 |
| `editor/TemplateGeneratorPanel.tsx` | 346 |
| `editor/InlineApprovalPanel.tsx` | 244, 358 |
| `editor/CommentThread.tsx` | 173 |
| `editor/ReviewMode.tsx` | 438 |
| `editor/EditorPanel.tsx` | 3809 |
| `workflow/StepCard.tsx` | 301 |

**Note**: Chat input textareas may have a legitimate reason for custom implementation (auto-resize behavior), but they should still use the design system `<Textarea>` component. The `HAQManager.tsx` correctly imports and uses `<Textarea>`.

**Fix**: Replace all raw `<textarea>` with `<Textarea>` from `@/components/ui/textarea`.

---

## 4. Forbidden Pattern: Raw `<input>` (2 instances in 1 file)

| File | Line(s) | Context |
|---|---|---|
| `regulatory/CAPAManagement.tsx` | 1047, 1051 | `<input type="checkbox">` — should use `<Checkbox>` from `@/components/ui/checkbox` |

---

## 5. Ad-hoc Query Keys (3 components)

Per CLAUDE.md, all query keys must be registered in `queryKeys.ts` — no ad-hoc string arrays.

| File | Line | Key Used | Should Be |
|---|---|---|---|
| `projects/RegulatoryApplicationPicker.tsx` | 65 | `['regulatory-catalog', 'regions']` | Register in `queryKeys.regulatoryCatalog.regions()` |
| `projects/RegulatoryApplicationPicker.tsx` | 75 | `['regulatory-catalog', 'application-types', ...]` | Register in `queryKeys.regulatoryCatalog.applicationTypes(...)` |
| `projects/BootstrapPreviewPanel.tsx` | 56 | `['regulatory-catalog', 'bootstrap-preview', registryId]` | Register in `queryKeys.regulatoryCatalog.bootstrapPreview(...)` |
| `workflow/CSRWorkflow.tsx` | 159 | `['csr-sections', projectId]` | Register in `queryKeys.csr.sections(projectId)` |

**Fix**: Add `regulatoryCatalog` and `csr` namespaces to `queryKeys.ts` and update these components.

---

## 6. Dead Code (exported components never imported)

| Component | File | Notes |
|---|---|---|
| `ConversationBranches` | `chat/ConversationBranches.tsx` | Exported but never imported anywhere in the codebase. 460-line component with no consumers. |
| `PreconditionInlineSummary` | `workflow/PreconditionBadges.tsx` | Exported from `workflow/index.ts` but only referenced in its own definition file. No consumer. |
| `ActionStatsBar` | `workflow/NextActionsPanel.tsx` | Exported from `workflow/index.ts` but only referenced in its own definition file. No consumer. |

**Note**: `ConversationHealthPill` is exported from `chat/index.ts` but never imported by any other component — effectively dead code. However, it is _exported_ so it could be used externally; still worth flagging.

**Fix**: Either wire these into a parent component or remove them.

---

## 7. UI State Violations

### 7a. ConversationHealthPill — Manual useState-based data fetching

**File**: `chat/ConversationHealthPill.tsx`
**Lines**: 46-65

Uses manual `useState` + `useEffect` + `apiRequest` chain instead of `useQuery` with `DataStateWrapper`. The loading state is silently suppressed (`if (loading || !report) return null`), violating the "every async component must handle all 5 states" rule.

**Fix**: Refactor to use `useQuery` + `DataStateWrapper`, or at minimum handle the error state visibly.

### 7b. CSRWorkflow — Silent error suppression

**File**: `workflow/CSRWorkflow.tsx`
**Line**: 162-165

The `queryFn` returns `[]` on error (`if (!res.ok) return []`) — this means a failed API call looks identical to "no sections exist." Users get no error feedback.

**Fix**: Throw on non-OK responses so `useQuery` surfaces the error state properly.

---

## 8. Accessibility Issues

### 8a. ConversationHealthPill — Inline style button with no ARIA

**File**: `chat/ConversationHealthPill.tsx`
**Lines**: 73-101, 163-175, 178-192

Three raw `<button>` elements with inline styles, no `aria-label`, no `aria-expanded` on the tooltip trigger, and the tooltip is a positioned `<div>` with no role.

**Needs**:
- `aria-label="Conversation health: {state}"` on the pill button
- `aria-expanded={showTooltip}` on the pill button
- `role="tooltip"` or `role="dialog"` on the tooltip div
- `aria-label` on each action button

### 8b. ZenChat — Stop button missing aria-label

**File**: `chat/ZenChat.tsx`
**Line**: 810-813

Raw `<button>` with only a `title` attribute. Should have `aria-label="Stop generating"`.

### 8c. Chat textareas missing aria-label

**Files**: `chat/ZenChat.tsx:795`, `chat/ChatPanel.tsx:380`, `chat/AnaPersistentPanel.tsx:5085`

Main chat input textareas lack `aria-label="Type your message"` or equivalent.

### 8d. INDChecklist / CSRWorkflow — Back buttons

**Files**: `workflow/INDChecklist.tsx:142`, `workflow/CSRWorkflow.tsx:236`

Raw `<button>` elements used for navigation with no `aria-label`.

---

## 9. Additional Observations (Lower Priority)

### 9a. AnaPersistentPanel — Bespoke auth token management

**File**: `chat/AnaPersistentPanel.tsx` (lines ~1680-1715)

Contains its own `refreshTokenOnce()` function that does `fetch('/api/auth/dev-login')` to silently refresh tokens. This duplicates auth logic that should be centralized. Also stores tokens in 3 different localStorage keys (`token`, `authToken`, `auth_token`) — a maintenance hazard.

### 9b. Inline styles in ConversationHealthPill

**File**: `chat/ConversationHealthPill.tsx` (entire file)

The component uses exclusively inline `style={{...}}` instead of Tailwind classes, which is inconsistent with every other component in the codebase. This makes it harder to maintain and theme.

### 9c. `console.error` usage in production paths

38 occurrences of `console.error` across 18 component files. While some are in catch blocks (acceptable for development), production code should use structured error logging or suppress them.

### 9d. EditorPanel generate-table action defined but never wired

**File**: `editor/EditorPanel.tsx`, line 149

The `AI_ACTIONS` array defines a `'generate-table'` action type, but the `AI_ACTIONS` constant only includes 5 items (the 6th `generate-table` is in the type union but not in the array).

---

## Summary of Fixes by Priority

### P0 — Must Fix (Standards Violation)
1. **Raw `fetch()` in AnaPersistentPanel** — 6 calls bypassing auth gateway; security + maintenance risk
2. **Raw `fetch()` in 7 other components** — bypasses centralized auth; inconsistent error handling
3. **CSRWorkflow silent error suppression** — users get no feedback on API failures

### P1 — Should Fix (Forbidden Pattern)
4. **36 raw `<button>` instances** — replace with `<Button>` across 17 files
5. **13 raw `<textarea>` instances** — replace with `<Textarea>` across 8 files
6. **2 raw `<input type="checkbox">`** — replace with `<Checkbox>`
7. **4 ad-hoc query keys** — register in `queryKeys.ts`

### P2 — Should Fix (Accessibility)
8. **ConversationHealthPill** — missing ARIA attributes on interactive elements
9. **ZenChat/ChatPanel/AnaPersistentPanel** — missing aria-labels on textareas and buttons

### P3 — Nice to Fix (Code Hygiene)
10. **3 dead components** — ConversationBranches, PreconditionInlineSummary, ActionStatsBar
11. **ConversationHealthPill** — refactor to useQuery + remove inline styles
12. **AnaPersistentPanel** — centralize auth token management
