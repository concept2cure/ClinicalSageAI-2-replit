# GA Readiness Audit — UX Redesign Features
**Date:** 2026-03-29
**Scope:** All features from the forensic UX study redesign brief
**Branch:** `concept2cure-v2`

---

## Executive Summary

7 audit agents examined every file modified during the UX redesign. **12 critical issues** found across 7 components, **18 warnings**, and **~15 minor items**. The most impactful findings are a missing `</div>` in the workspace shell, a missing backend endpoint, and several silent-failure patterns.

---

## CRITICAL ISSUES (Must Fix Before GA)

### C-01: Missing `</div>` for collapsible context bar container
**File:** `ProjectWorkspaceShell.tsx` line 1630
**Issue:** The `overflow-hidden transition-all` div is never closed, malforming the DOM and breaking collapse behavior.
**Impact:** Context bars don't properly hide/show. All subsequent DOM structure is shifted.

### C-02: Missing `/api/concept2cure/tasks/pending` backend endpoint
**File:** `WelcomeBackScreen.tsx` line 164
**Issue:** WelcomeBackScreen fetches from this endpoint but it doesn't exist in server routes.
**Impact:** Pending items section silently fails for every user on the welcome screen.

### C-03: No validation when `initialProjectId` doesn't exist in projects list
**File:** `ZenApp.tsx` lines 871-873, 932-934
**Issue:** If a deleted project ID is passed from session restore, user enters `project-home` mode with a non-existent project.
**Impact:** UI renders with undefined `activeProject`, potentially breaking downstream renders.

### C-04: No deleted-project recovery in session restore flow
**File:** `ZenAppWithSession.tsx` lines 124-131
**Issue:** `handleContinue` passes project ID without validating it still exists.
**Impact:** User gets stuck viewing ghost project after deletion.

### C-05: Silent error on consequence action buttons (`/api/ana-ri/generate`)
**File:** `AnaPersistentPanel.tsx` lines 4508-4534
**Issue:** `try-catch` silently swallows all errors. User gets NO feedback when API fails.
**Impact:** User thinks action worked when it didn't.

### C-06: Double-click vulnerability on consequence buttons
**File:** `AnaPersistentPanel.tsx` lines 4503-4506
**Issue:** `isThinking` state-based guard has a race condition. Rapid clicks fire duplicate requests.
**Impact:** Duplicate artifacts created in database.

### C-07: "Send to dossier" buttons don't actually send to dossier
**File:** `RICopilotHome.tsx` lines 781-786, 1227-1236, 1310-1316
**Issue:** Buttons labeled "Send to dossier" actually call draft handlers (`onDraft()`), not a dossier API.
**Impact:** Misleading UI — user expects dossier submission but gets evidence memo draft.

### C-08: MoreHorizontal icon not imported in ZenSidebar
**File:** `ZenSidebar.tsx` lines 300, 472
**Issue:** `MoreHorizontal` is used in ConvoRow/ProjectRow but not imported from lucide-react.
**Impact:** Runtime crash when rendering conversation/project context menus.

### C-09: Incorrect navigation for "New Artifact" in sidebar dropdown
**File:** `ZenSidebar.tsx` line 862
**Issue:** `onNewArtifact` calls `onNavigate?.('apps')` instead of artifact creation flow.
**Impact:** "New Artifact" takes user to AI Assistants page instead of document creation.

### C-10: `onComposeAction` required but not optional in ProjectComposeBar
**File:** `ProjectComposeBar.tsx` line 37, 99
**Issue:** Prop is required, so if parent forgets to provide it, component crashes on Draft/Review/Compare click.
**Impact:** Runtime crash if callback missing (currently wired, but fragile).

### C-11: `relTime()` doesn't handle invalid/future dates
**File:** `ZenApp.tsx` lines 3632-3642
**Issue:** Negative ms (future dates) shows "Just now". Invalid dates cause NaN cascade.
**Impact:** Corrupted timestamps display misleading relative times.

### C-12: Unsafe `msg.id` in conversation_context builder
**File:** `AnaPersistentPanel.tsx` lines 4510-4514
**Issue:** `findIndex(m => m.id === msg.id)` assumes `msg.id` is always defined.
**Impact:** If undefined, could match wrong messages or produce empty context slice.

---

## WARNING ISSUES (Should Fix Before GA)

| # | Issue | File | Lines |
|---|-------|------|-------|
| W-01 | Trust strip chips missing `aria-label` | ProjectWorkspaceShell.tsx | 2086-2124 |
| W-02 | Context band visible even when context bars collapsed | ProjectWorkspaceShell.tsx | 1690-1728 |
| W-03 | localStorage silent failure in private browsing (resume) | ProjectWorkspaceShell.tsx | 714-738 |
| W-04 | 50+ raw `<button>` elements instead of Button component | ProjectWorkspaceShell.tsx | Throughout |
| W-05 | Missing `aria-label` on "Insert into Editor" button | AnaPersistentPanel.tsx | 4426-4469 |
| W-06 | Consequence row `opacity-0` fails WCAG (invisible interactive) | AnaPersistentPanel.tsx | 4488-4493 |
| W-07 | Raw `fetch()` calls in chat pipeline instead of `apiRequest()` | AnaPersistentPanel.tsx | 1688, 1761, etc. |
| W-08 | Stale "Data Room" in VaultPage docstring and ToolsLanding label | VaultPage.tsx, ToolsLanding.tsx | 2-8, 66 |
| W-09 | "Submission Apps" title not updated to "AI Assistants" | ProjectWorkspaceShell.tsx | 2062 |
| W-10 | "Browse Apps" label in FirstRunExperience not updated | FirstRunExperience.tsx | 305 |
| W-11 | "Vault / Data Room" mixed terminology in ToolsLanding | ToolsLanding.tsx | 66 |
| W-12 | "Search artifacts..." placeholder inconsistent with "Documents" page | ArtifactsPage.tsx | 136 |
| W-13 | Loading state accessibility (no `role="status"`, no `aria-live`) | ZenAppWithSession.tsx | 161-174 |
| W-14 | `initialConversationId` passed but no fallback if conversation deleted | ZenApp.tsx | 935 |
| W-15 | Inconsistent `setLayoutMode` patterns across project selection paths | ZenApp.tsx | 2205, 3667, 3734, 3949 |
| W-16 | `ri-copilot` routing keys still present (not user-visible but brand debt) | ZenApp.tsx | 502, 529, 1941, etc. |
| W-17 | SendToDossierMenu doesn't close on outside click, no ESC key | RICopilotHome.tsx | 1085-1124 |
| W-18 | 16+ raw `<button>` elements in RICopilotHome | RICopilotHome.tsx | Throughout |

---

## MINOR ISSUES (Nice to Have)

| # | Issue | File |
|---|-------|------|
| M-01 | 34 `any` type usages in AnaPersistentPanel | AnaPersistentPanel.tsx |
| M-02 | Hardcoded API URLs throughout (should be constants) | AnaPersistentPanel.tsx |
| M-03 | No `useEffect` fallback when activeProject becomes undefined | ZenApp.tsx |
| M-04 | Typography scale inconsistency (`text-xs` vs `text-[11px]`) | RICopilotHome.tsx |
| M-05 | Spacing scale inconsistency (mixed gap/padding patterns) | RICopilotHome.tsx |
| M-06 | Missing keyboard nav in SendToDossierMenu | RICopilotHome.tsx |
| M-07 | `projectName` empty → "Document Type — " in SendToDossierMenu | RICopilotHome.tsx |
| M-08 | Session history localStorage quota not checked | useSessionRestore.ts |
| M-09 | QUICK_ACTIONS hardcoded in WelcomeBackScreen (static config OK) | WelcomeBackScreen.tsx |
| M-10 | DossierTree suggestion chips inaccessible on touch devices | DossierTree.tsx |
| M-11 | "New Artifact" label in sidebar dropdown should be "New Document" | ZenSidebar.tsx |
| M-12 | Stale "Data Room" in legacy JSX comments (50+ refs in old coauthor files) | Multiple legacy files |

---

## PASSING COMPONENTS

| Component | Status | Notes |
|-----------|--------|-------|
| **ProjectHomeDashboard** | ✅ GA Ready | Already lean, conversation-first, no changes needed |
| **TemplateTree recommended section** | ✅ GA Ready | Graceful degradation, real template keys, proper accessibility |
| **ProjectComposeBar** (structure) | ✅ GA Ready | ARIA correct, keyboard accessible, all types handled |
| **ComputeJobPanel rename** | ✅ GA Ready | "AnA evidence memo" correctly applied |
| **DossierTree suggestion chips** | ✅ GA Ready | Optional callbacks, focus-within accessibility |

---

## RECOMMENDED FIX PRIORITY

### Phase 1 — GA Blockers (fix now)
1. **C-01**: Find and add missing `</div>` for collapsible container
2. **C-03 + C-04**: Add project existence validation in ZenApp initializer
3. **C-05 + C-06**: Add error toast + debounce to consequence buttons
4. **C-08**: Import `MoreHorizontal` in ZenSidebar
5. **C-09**: Fix `onNewArtifact` navigation target
6. **C-11**: Guard `relTime()` against invalid/future dates
7. **C-12**: Add defensive `msg.id` check

### Phase 2 — Pre-GA Polish (fix this sprint)
1. **C-02**: Create `/api/concept2cure/tasks/pending` endpoint or remove feature
2. **C-07**: Rename "Send to dossier" to "Draft as evidence memo" or implement dossier API
3. **C-10**: Make `onComposeAction` optional with safe fallback
4. **W-01, W-05**: Add missing `aria-label` attributes
5. **W-08 through W-12**: Complete terminology renaming pass

### Phase 3 — Post-GA Hardening
1. Replace raw `<button>` elements with Button component (W-04, W-18)
2. Migrate raw `fetch()` to `apiRequest()` (W-07)
3. Extract API URLs to constants (M-02)
4. Standardize typography scale (M-04, M-05)
