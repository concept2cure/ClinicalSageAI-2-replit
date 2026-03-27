# UI/UX Quality Pressure Test Report

**Date**: 2026-03-27
**Scope**: Sprint files — ToolsLanding, HAQManager, useSubmissionSections, workspace-primitives (InspectorRibbon), DocumentListPane, evidence-ask route
**Reviewer**: Claude Code (GA Quality Pass)

---

## File 1: `client/src/concept2cure/components/workspace/ToolsLanding.tsx`

### Scorecard

| Dimension           | Result | Details |
|---------------------|--------|---------|
| Component Contract  | **FAIL** | 3 violations (see below) |
| Accessibility       | **PASS** | ARIA labels on all interactive elements, `role="region"`, `role="group"`, `aria-label` on nav |
| Error Handling      | **PASS** | N/A — no async operations |
| TypeScript Quality  | **FAIL** | 1 type error |
| Visual Consistency  | **PASS** | Consistent Tailwind spacing, governed layout primitives |

### Violations

1. **`PageTitleHeader` receives `subtitle` prop that does not exist.** `PageTitleHeader` accepts `description`, not `subtitle`. The `projectName` value is silently discarded — users never see the project name context.
   - **Line 98-101**: `<PageTitleHeader title="Tools" subtitle={projectName || undefined} />`
   - **Fix**: Change `subtitle` to `description`.

2. **`WorkspaceCanvas` receives `maxWidth="2xl"` which is not in the union type.** The accepted values are `'3xl' | '4xl' | '5xl' | '6xl' | 'full'`. TypeScript should catch this if strict mode is enforced, but the value will fall through to an undefined CSS class (no max-width constraint applied at all — content will be full-width).
   - **Line 97**: `<WorkspaceCanvas maxWidth="2xl" testId="tools-landing">`
   - **Fix**: Change to `maxWidth="3xl"` (closest equivalent).

3. **`EmptyState` receives `testId` prop that does not exist.** The `EmptyState` component from `@/design-system/patterns/EmptyState` accepts: `title`, `description`, `icon`, `illustration`, `action`, `secondaryAction`, `size`, `variant`, `className`. There is no `testId` prop — the `data-testid` attribute will NOT be rendered.
   - **Line 142-146**: `<EmptyState ... testId="tools-no-recent" />`
   - **Fix**: Wrap in a `<div data-testid="tools-no-recent">` or add `testId` support to `EmptyState`.

### Missing

- No `data-testid` on the "recent documents" resume buttons (the artifact list items). Only the tool buttons have `data-testid`.

---

## File 2: `client/src/concept2cure/components/workflow/HAQManager.tsx`

### Scorecard

| Dimension           | Result | Details |
|---------------------|--------|---------|
| Component Contract  | **FAIL** | 3 violations |
| Accessibility       | **PASS** | Comprehensive ARIA: `role="listbox"`, `role="option"`, `aria-selected`, `aria-live="polite"`, `aria-busy`, `role="status"` |
| Error Handling      | **PASS** | Toast on error for both AI drafting and save-as-artifact. Uses `variant: 'destructive'`. Catch blocks produce user-visible feedback. |
| TypeScript Quality  | **PASS** | Proper typed interfaces, `err: unknown` with `instanceof Error` guard |
| Visual Consistency  | **PASS** | Consistent spacing, calm aesthetic, proper use of `WorkspaceStatusBadge` |

### Violations

1. **`PageTitleHeader` receives `subtitle` prop that does not exist** (same as File 1).
   - **Line 282-285**: `<PageTitleHeader title="HAQ Response Manager" subtitle={...} />`
   - **Fix**: Change `subtitle` to `description`.

2. **`EmptyState` receives `testId` prop that does not exist** (same as File 1).
   - **Lines 366, 468**: `testId="haq-empty"` and `testId="haq-no-selection"` silently dropped.
   - **Fix**: Wrap in `<div data-testid="...">`.

3. **`EmptyState` receives `icon` as JSX element instead of `LucideIcon` component reference.** The `EmptyState` `icon` prop expects a component (e.g., `MessageSquareMore`), not a rendered element (`<MessageSquareMore className="w-8 h-8" />`). This will cause a runtime error because `EmptyState` does `<Icon className={...} />` on the value — calling a JSX element as a component will fail.
   - **Line 366**: `icon={<MessageSquareMore className="w-8 h-8" />}`
   - **Fix**: Change to `icon={MessageSquareMore}`.

### Observations

- **Split-pane layout** (`w-1/3` + `flex-1`): Not explicitly responsive. On narrow viewports, the 1/3 question list becomes too cramped. Consider stacking on `sm:` breakpoints.
- **`window.confirm()` on clear**: Line 267 uses a raw browser confirm dialog. This is functional but visually inconsistent with the rest of the design system. Consider using the governed `Dialog` component for confirmation.
- **`eslint-disable-next-line react-hooks/exhaustive-deps`** on line 119: The `toast` dependency is intentionally omitted. This is defensible (toast is a stable ref), but should be documented.
- **Session storage fallback on line 95**: Silent catch on corrupted storage is correct, but the quota-exceeded catch on line 96 should log a warning so storage failures don't go completely invisible.

---

## File 3: `client/src/concept2cure/hooks/useSubmissionSections.ts`

### Scorecard

| Dimension           | Result | Details |
|---------------------|--------|---------|
| Component Contract  | **N/A** | Hook, not a UI component |
| Accessibility       | **N/A** | Hook, not a UI component |
| Error Handling      | **FAIL** | 1 issue |
| TypeScript Quality  | **FAIL** | 1 issue |
| Visual Consistency  | **N/A** | Hook, not a UI component |

### Violations

1. **Query keys are ad-hoc string arrays instead of using `queryKeys` registry.** Per the UI standards, query keys MUST be registered in `queryKeys.ts`. This hook uses:
   - `['concept2cure', 'ind-sections']` (line 137)
   - `['concept2cure', 'projects', projectId, 'artifacts']` (line 149)
   - **Fix**: Register in `client/src/concept2cure/hooks/queryKeys.ts` and import from there.

2. **No explicit error handling / exposure.** The hook returns `error: indSectionsQuery.error || artifactsQuery.error` but does not distinguish between the two. If `indSectionsQuery` fails AND `artifactsQuery` also has an error, only the first is surfaced. This is a minor issue but could confuse debugging. Consider returning both errors or a combined error message.

### Observations

- **`staleTime` values are appropriate**: 5 minutes for section structure (rarely changes), 30 seconds for artifacts (changes during editing). Good choices.
- **No `gcTime` (cacheTime) configured**: Defaults to TanStack Query's 5-minute garbage collection. Acceptable but worth noting — section structure could be cached longer.
- **TypeScript quality is otherwise strong**: Properly typed `SectionNode` interface, no `any` usage, proper `as const` assertions.
- **`apiRequest` used correctly** for both API calls — no raw `fetch()`.

---

## File 4: `client/src/components/ui/workspace-primitives.tsx` (InspectorRibbon)

### Scorecard

| Dimension           | Result | Details |
|---------------------|--------|---------|
| Component Contract  | **FAIL** | 2 violations |
| Accessibility       | **FAIL** | 2 gaps |
| Error Handling      | **N/A** | Presentational component |
| TypeScript Quality  | **PASS** | Clean interfaces, proper typing |
| Visual Consistency  | **PASS** | Consistent with design system tokens |

### Violations

1. **Expanded-mode ribbon buttons use raw `<button>` instead of governed `Button` component.** Lines 697-725: Individual inspector toggle buttons are raw `<button>` elements with inline Tailwind classes. Per the component registry, ALL clickable actions must use `<Button variant="..." size="...">`.
   - **Lines 697, 733**: Raw `<button>` elements
   - **Partial mitigation**: These are toolbar toggle buttons with custom visual states (active color, badge overlay, pulse indicator) that may not map cleanly to the `Button` component's variant system. This is an edge case where raw `<button>` may be architecturally justified, but it should be explicitly documented as an exception.

2. **`WorkspaceTabBar` uses raw `<button>` for tab triggers** (lines 448-469). Same issue — tab buttons should use `Button` or at minimum have documented exception.

### Accessibility Gaps

1. **Expanded ribbon buttons lack `aria-label`.** Lines 697-725: Individual toggle buttons have no `aria-label` or `aria-pressed` attribute. Screen readers cannot distinguish between them without reading the visual label text.
   - **Fix**: Add `aria-label={item.label}` and `aria-pressed={isActive}` to each button.

2. **Collapsed group pill badge dot lacks text alternative.** Line 746: `<span className="ml-1 w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" />` is a visual indicator (amber dot = "has badges") with no `aria-label` or `sr-only` text. Screen readers skip it entirely.
   - **Fix**: Add `aria-label="Has notifications"` or `<span className="sr-only">Has pending items</span>`.

### Progressive Collapse Logic Review

- **Logic is correct**: When `progressiveCollapse=true` (default), only the group containing the active inspector shows expanded; others show as pills. When no inspector is active (`activeGroupIdx === -1`), all groups expand. This is sound.
- **Keyboard accessibility of collapsed pills**: Collapsed pills are `<button>` elements, so they ARE keyboard focusable and activatable. The focus-visible styles come from Tailwind defaults. **PASS**.
- **Badge visibility on collapsed groups**: Line 744-747 renders an amber dot when any item in the group has `badge > 0`. This is visible but not announced to assistive tech (see gap above).

---

## File 5: `client/src/concept2cure/components/workspace/DocumentListPane.tsx`

### Scorecard

| Dimension           | Result | Details |
|---------------------|--------|---------|
| Component Contract  | **FAIL** | 5 violations |
| Accessibility       | **FAIL** | 4 gaps |
| Error Handling      | **N/A** | Presentational component |
| TypeScript Quality  | **PASS** | Clean interfaces |
| Visual Consistency  | **FAIL** | 1 issue |

### Violations

1. **Raw `<button>` used for "New" button (header).** Line 125-130: `<button onClick={onCreateNew} ...>` — must use governed `Button` component.

2. **Raw `<input>` used for search.** Line 139-144: `<input type="text" ...>` — must use governed `Input` component from `@/components/ui/input`.

3. **Raw `<select>` used for status filter.** Lines 155-164: `<select ...>` — must use governed `Select` component from `@/components/ui/select`.

4. **Raw `<button>` used for "Draft with AI" and "Start Blank / Create Document" buttons.** Lines 190-209: Two raw `<button>` elements in the empty state. These are primary action buttons and MUST use the governed `Button` component.

5. **Local `statusBadge()` function instead of `WorkspaceStatusBadge`.** Lines 50-77: A local function renders status badges with ad-hoc styling. The component registry mandates `WorkspaceStatusBadge` for ALL workflow status indicators. The styling is also inconsistent — uses `ring-1` borders while `WorkspaceStatusBadge` uses background color fills.

### Accessibility Gaps

1. **Search input lacks `aria-label`.** Line 139: `<input ... placeholder="Search documents...">` — placeholder is not a substitute for `aria-label`. Screen readers may not announce the purpose.

2. **Status filter `<select>` lacks `aria-label`.** Line 155: No label associated with the select dropdown.

3. **Expand/collapse chevron button uses `title` instead of `aria-label`.** Line 251-259: `title="Toggle details"` is for mouse tooltips. Add `aria-label="Toggle details for {doc.title}"` and `aria-expanded={isExpanded}`.

4. **Action buttons (cut, place, copy path) use `title` instead of `aria-label`.** Lines 296-328: Scissors, MapPin, Copy buttons all use `title` for tooltip. Must have `aria-label` for screen readers.

### Visual Consistency

1. **`statusBadge()` styling differs from `WorkspaceStatusBadge`.** The local function uses `ring-1 ring-emerald-200` borders + `rounded-md` shape, while `WorkspaceStatusBadge` uses `rounded-full` pills without ring borders. This creates visual inconsistency when the same statuses appear in both the document list and other surfaces.

---

## File 6: `server/routes/evidence-ask.ts`

### Scorecard

| Dimension           | Result | Details |
|---------------------|--------|---------|
| Component Contract  | **N/A** | Backend route |
| Accessibility       | **N/A** | Backend route |
| Error Handling      | **PASS** | Proper try/catch, `sendError` with status codes and error codes |
| TypeScript Quality  | **FAIL** | 1 issue |
| Visual Consistency  | **N/A** | Backend route |
| sendSuccess/sendError | **PASS** | Uses envelope helpers correctly |
| Input Validation    | **PASS** | Validates question presence, type, and minimum length |
| SQL Injection       | **PASS** | No raw SQL — delegates to `ForesightRAGService` which uses parameterized queries |
| Rate Limiting       | **PASS** | 15 req/min per user+org, proper key generation |
| Auth Middleware     | **PASS** | `authMiddleware` applied on the route |

### Issues

1. **Local `sendSuccess`/`sendError` instead of importing from `concept2cure.ts`.** Lines 22-29: The route defines its own response envelope helpers. Per the UI standards, backend routes MUST use `sendSuccess()` / `sendError()` from the shared module (likely `server/routes/concept2cure.ts`). This creates divergence risk — if the envelope format changes, this route won't pick it up.
   - **Fix**: Import from the shared location instead of redefining locally.

2. **Type casting for `userId` and `tenantId`.** Lines 66-67: `(req as Record<string, unknown>).userId` — this is a common pattern in the codebase but is fragile. The auth middleware should type-extend `Request` to include these fields. This is a codebase-wide issue, not specific to this file.

3. **Rate limiter error response does not use `sendError` envelope.** Line 38: `message: { error: 'Too many Data Room queries...' }` — this is a raw object, not the `{ success: false, error: ... }` envelope the frontend expects. The frontend may not surface this error correctly.
   - **Fix**: Change to `message: { success: false, error: 'Too many Data Room queries — please wait.', code: 'RATE_LIMITED' }`.

### Observations

- **`question` length validation** (min 3 chars) is reasonable but could also enforce a maximum (e.g., 2000 chars) to prevent abuse.
- **`maxTokens: 1500`** is hardcoded — consider making this configurable or at least documenting the rationale.
- **No input sanitization on `projectId`** — it's passed as a string to the RAG service context but not validated as a number/UUID. If `ForesightRAGService` trusts it for DB queries, this could be an injection vector.

---

## Summary of Critical Findings

### P0 — Must Fix Before GA

| # | File | Issue | Impact |
|---|------|-------|--------|
| 1 | ToolsLanding, HAQManager | `subtitle` passed to `PageTitleHeader` which only accepts `description` | Project name context invisible to users |
| 2 | ToolsLanding | `maxWidth="2xl"` not in union type | No max-width constraint applied — layout breaks |
| 3 | HAQManager | `EmptyState` `icon` passed as JSX element instead of component ref | **Runtime crash** when rendering empty state |
| 4 | DocumentListPane | 5 raw HTML elements violating component contract | Inconsistent interaction patterns, no governed focus/hover states |
| 5 | DocumentListPane | Local `statusBadge()` instead of `WorkspaceStatusBadge` | Visual inconsistency across surfaces |

### P1 — Should Fix Before GA

| # | File | Issue |
|---|------|-------|
| 6 | ToolsLanding, HAQManager | `EmptyState` `testId` prop silently ignored — no test hooks |
| 7 | useSubmissionSections | Ad-hoc query keys instead of `queryKeys` registry |
| 8 | InspectorRibbon | Expanded buttons lack `aria-label` and `aria-pressed` |
| 9 | DocumentListPane | Search, select, action buttons missing `aria-label` |
| 10 | evidence-ask | Rate limiter response not in `sendError` envelope format |
| 11 | evidence-ask | Local `sendSuccess`/`sendError` instead of shared import |

### P2 — Should Fix Post-GA

| # | File | Issue |
|---|------|-------|
| 12 | HAQManager | Split-pane not responsive on narrow viewports |
| 13 | HAQManager | `window.confirm()` instead of governed Dialog |
| 14 | InspectorRibbon | Collapsed badge dot lacks screen reader text |
| 15 | evidence-ask | No max length validation on `question` input |
| 16 | evidence-ask | `projectId` not validated as number/UUID |
| 17 | workspace-primitives | Raw `<button>` in WorkspaceTabBar (documented exception needed) |

---

## Appendix: Component Registry Cross-Reference

| Governed Component | ToolsLanding | HAQManager | DocumentListPane | InspectorRibbon |
|--------------------|:---:|:---:|:---:|:---:|
| Button | USED | USED | MISSING (5x) | MISSING (edge case) |
| Input | N/A | N/A | MISSING (1x) | N/A |
| Select | N/A | N/A | MISSING (1x) | N/A |
| Textarea | N/A | USED | N/A | N/A |
| WorkspaceCanvas | USED | USED | N/A | N/A |
| PageTitleHeader | USED (wrong prop) | USED (wrong prop) | N/A | N/A |
| WorkspaceStatusBadge | USED | USED | MISSING | N/A |
| EmptyState | USED (wrong props) | USED (wrong props) | MISSING | N/A |
| Spinner | N/A | USED | N/A | N/A |
| DataStateWrapper | N/A | N/A | N/A | N/A |

---

*Report generated by Claude Code GA quality pass.*
*Files analyzed: 6 | Violations found: 17 | P0 (must fix): 5 | P1 (should fix): 6 | P2 (post-GA): 6*
