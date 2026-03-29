# Intelligence Components Code Review

**Date**: 2026-03-29
**Scope**: 4 new frontend intelligence components
**Reviewer**: Claude Code (automated)

---

## Summary

| Component | Governed Compliance | State Mgmt | Accessibility | Code Quality | Verdict |
|-----------|-------------------|------------|---------------|--------------|---------|
| UserContextEditor | PASS (minor) | PARTIAL | GOOD | GOOD | Minor issues |
| CompanyContextEditor | **FAIL** (2 violations) | GOOD | PARTIAL | GOOD | Needs fixes |
| ProjectContextEditor | **FAIL** (1 violation) | GOOD | PARTIAL | GOOD | Needs fixes |
| DocumentUploadZone | PASS (justified) | GOOD | GOOD | GOOD | **Prop mismatch bug** |

**Total violations found: 9**

---

## 1. UserContextEditor.tsx

**File**: `client/src/concept2cure/components/intelligence/UserContextEditor.tsx`

### Governed Component Compliance
- [PASS] Uses `Button`, `Input`, `Textarea`, `Select` from `@/components/ui/`
- [PASS] Uses `apiRequest()` for API calls
- [PASS] Uses `queryKeys.anaIntelligence.userContext`
- [PASS] Uses `react-hook-form` via `useForm`
- [PASS] Uses `useMutation.isPending` (not `.isLoading`)
- [PASS] No raw `fetch()`, no `axios`

### State Management
- **[VIOLATION] No DataStateWrapper used for the loading state.** The component disables inputs via `isLoading` but does not show `LoadingState` or `DataStateWrapper` when the profile query is loading. The user sees an empty form with disabled fields rather than a proper loading skeleton.
- **[VIOLATION] No error state handling for the query.** If the `useQuery` for the user profile fails, there is no error UI rendered. The `error` property from `useQuery` is not destructured or used at all. This is a silent failure.
- [PASS] Mutation disables submit button via `isPending`
- [PASS] Toast on success AND error for mutation

### Accessibility
- [PASS] `data-testid="user-context-editor"` present
- [PASS] `aria-label="Close editor"` on close button
- [PASS] `role="group"` and `aria-label` on expertise area
- [PASS] `role="checkbox"` and `aria-checked` on expertise badges
- [PASS] Keyboard handling (`Enter`/`Space`) on expertise badges
- [PASS] `htmlFor` attributes on labels

### Code Quality
- [PASS] No `any` types
- [PASS] Clean imports (all used)
- [PASS] Proper TypeScript interfaces

---

## 2. CompanyContextEditor.tsx

**File**: `client/src/concept2cure/components/intelligence/CompanyContextEditor.tsx`

### Governed Component Compliance
- **[VIOLATION] Raw `<button>` on line 220-236.** The `MarketChipSelector` sub-component uses a raw `<button>` element with inline styling classes instead of the governed `Button` or `Badge` component. This is a direct violation of the component contract.
- **[VIOLATION] Raw `<button>` on line 637-648.** The expandable sections toggle uses a raw `<button>` element instead of the governed `Button` component.
- [PASS] Uses `DataStateWrapper` for the main content area
- [PASS] Uses `apiRequest()` for API calls
- [PASS] Uses `queryKeys.anaIntelligence.companyContext`
- [PASS] Uses `react-hook-form` via `useForm` in `SectionEditor`
- [PASS] Uses `useMutation.isPending`

### State Management
- [PASS] `DataStateWrapper` handles loading, error, empty, and success states
- [PASS] Mutation disables save button via `isPending`
- [PASS] Toast on success AND error
- [PASS] Query invalidation on success
- **[MINOR] `DataStateWrapper` receives non-standard props.** Line 598-604 passes `emptyMessage` and `isEmpty` props. The actual `DataStateWrapper` interface uses `emptyTitle`/`emptyDescription` (not `emptyMessage`), and `isEmpty` expects a function `(data: T) => boolean` but receives a plain boolean. This will likely cause the empty state to never render correctly.

### Accessibility
- **[VIOLATION] Missing `data-testid` on root component.** The root `<Card>` has no `data-testid` attribute.
- **[VIOLATION] Missing ARIA attributes on MarketChipSelector buttons.** The raw `<button>` elements in `MarketChipSelector` have no `role="checkbox"`, `aria-checked`, or keyboard handling (unlike the equivalent pattern in `UserContextEditor` which does this correctly with Badge).
- [PASS] `aria-label="Edit ..."` on edit buttons
- **[MINOR] No keyboard handling on expandable section toggle.** The raw button does get default keyboard behavior from being a `<button>`, but it lacks `aria-expanded` and `aria-controls`.

### Code Quality
- [PASS] No `any` types
- [PASS] Clean imports
- **[MINOR] `React` imported but only used for types.** Line 13 imports `React` explicitly, which is unnecessary in React 17+ JSX transform but not strictly wrong.

---

## 3. ProjectContextEditor.tsx

**File**: `client/src/concept2cure/components/intelligence/ProjectContextEditor.tsx`

### Governed Component Compliance
- [PASS] Uses `Button`, `Input`, `Textarea`, `Select`, `Badge`, `Progress`, `Card` from `@/components/ui/`
- [PASS] Uses `DataStateWrapper` for the main content area
- [PASS] Uses `apiRequest()` for API calls
- [PASS] Uses `queryKeys.anaIntelligence.projectContext(projectId)`
- [PASS] Uses `react-hook-form` with `useForm`, `Controller`, `useFieldArray`
- [PASS] Uses `useMutation.isPending`

### State Management
- [PASS] `DataStateWrapper` handles loading, error, empty, success
- [PASS] Mutation disables save buttons via `isPending`
- [PASS] Toast on success AND error
- **[VIOLATION] `DataStateWrapper` receives non-standard props.** Line 483-490 passes `isError`, `loadingLabel`, and `emptyMessage` which do NOT exist on the `DataStateWrapper` interface. The actual interface uses: `isLoading` (correct), `error` (correct), `data` (correct), but NOT `isError`, NOT `loadingLabel` (should be `loadingMessage`), NOT `emptyMessage` (should be `emptyTitle`/`emptyDescription`). These props will be silently ignored, meaning:
  - `isError` is passed but the component only checks `error` (which is also passed, so this is harmless but dead code)
  - `loadingLabel` will never display (should be `loadingMessage`)
  - `emptyMessage` will never display (should be `emptyTitle` or `emptyDescription`)

### Prop Mismatch Bug (Critical)
- **[BUG] `DocumentUploadZone` called with wrong props on line 760.** It is called as `<DocumentUploadZone projectId={projectId} />` but the component interface expects `scope: 'company' | 'project'` and `scopeId?: string | number`. The prop `projectId` does not exist on `DocumentUploadZoneProps`. This will cause a TypeScript error and the upload zone will malfunction (scope defaults to undefined, scopeId is never set).

### Accessibility
- **[MINOR] Missing `data-testid` on root `<Card>`.** No `data-testid` attribute on the root element.
- [PASS] `aria-label` on edit buttons in `Section` component
- [PASS] `aria-expanded` on collapsible sections
- [PASS] `role="button"` on collapsible section headers

### Code Quality
- [PASS] No `any` types
- [PASS] Proper use of `Controller` for controlled components (Select)
- [PASS] `useFieldArray` for dynamic list editing
- **[MINOR] Unused import: `cn` is not imported but `cn` is not used** -- actually `cn` is NOT imported here, which is fine since it's not used.

---

## 4. DocumentUploadZone.tsx

**File**: `client/src/concept2cure/components/intelligence/DocumentUploadZone.tsx`

### Governed Component Compliance
- [PASS] Uses `Button` and `Card` from `@/components/ui/`
- [PASS] Uses `queryKeys.anaIntelligence.documents(...)` for cache invalidation
- [PASS] Uses `useToast()` for feedback
- **[JUSTIFIED EXCEPTION] Uses raw `fetch()` on line 137.** This is the documented exception for multipart file uploads -- `apiRequest()` does not support `FormData` bodies. The raw `fetch()` is properly constructed with auth headers and `credentials: 'include'`.
- [PASS] No `axios`
- [PASS] No `mutation.isLoading` (does not use `useMutation` -- manages upload state manually, which is appropriate for XHR-like progress tracking)

### State Management
- [PASS] All states handled: idle, uploading (with progress), success, error
- [PASS] Upload button/zone disabled during upload via `pointer-events-none`
- [PASS] Toast on success AND error
- [PASS] Query cache invalidation on success (documents, project memory, client memory)
- **[MINOR] No background refresh state.** Since this is an upload zone (not a data query), background refresh doesn't apply. Not a real issue.

### Accessibility
- [PASS] `data-testid="upload-zone"`, `data-testid="upload-zone-success"`, `data-testid="upload-zone-error"`
- [PASS] `role="button"` on drop zone card
- [PASS] `tabIndex={0}` for keyboard focus
- [PASS] `aria-label="Drag and drop a document here, or click to browse"`
- [PASS] `aria-label="Upload document"` on hidden file input
- [PASS] `aria-label="Dismiss success message"` and `aria-label="Dismiss error and retry"`
- [PASS] `role="progressbar"` with `aria-valuenow`, `aria-valuemin`, `aria-valuemax`, `aria-label`
- [PASS] Keyboard handling (`Enter`/`Space`) on drop zone

### Code Quality
- [PASS] No `any` types (uses `unknown` for catch)
- [PASS] Clean imports
- [PASS] Proper TypeScript interfaces
- **[MINOR] Manual auth token construction (lines 111-119).** The component manually reads `localStorage.getItem('token')` etc. to build auth headers. While necessary because `apiRequest()` isn't used, this duplicates auth logic that lives in `queryClient.ts`. If the auth token storage key changes, this will silently break.

### Prop Interface Bug (Critical -- Called Incorrectly)
- **[BUG] The component is called incorrectly by BOTH parent components:**
  - `CompanyContextEditor` line 595: `<DocumentUploadZone />` -- missing required `scope` prop entirely
  - `ProjectContextEditor` line 760: `<DocumentUploadZone projectId={projectId} />` -- passes `projectId` which is not a valid prop; should be `scope="project" scopeId={projectId}`

---

## Critical Issues (Must Fix)

| # | Component | Issue | Severity |
|---|-----------|-------|----------|
| 1 | CompanyContextEditor | Raw `<button>` in MarketChipSelector (line 220) | HIGH -- governed contract violation |
| 2 | CompanyContextEditor | Raw `<button>` for expandable toggle (line 637) | HIGH -- governed contract violation |
| 3 | CompanyContextEditor + ProjectContextEditor | `DataStateWrapper` called with non-existent props (`emptyMessage`, `isEmpty` as boolean, `isError`, `loadingLabel`) | HIGH -- empty/loading states silently broken |
| 4 | CompanyContextEditor | `<DocumentUploadZone />` called with no props -- missing required `scope` | CRITICAL -- runtime error |
| 5 | ProjectContextEditor | `<DocumentUploadZone projectId={projectId} />` -- wrong prop name | CRITICAL -- runtime error / upload broken |
| 6 | UserContextEditor | No loading skeleton or error state for profile query | MEDIUM -- violates 5-state rule |

## Minor Issues

| # | Component | Issue |
|---|-----------|-------|
| 7 | CompanyContextEditor | Missing `data-testid` on root element |
| 8 | ProjectContextEditor | Missing `data-testid` on root element |
| 9 | CompanyContextEditor | MarketChipSelector missing ARIA checkbox role/keyboard handling |
