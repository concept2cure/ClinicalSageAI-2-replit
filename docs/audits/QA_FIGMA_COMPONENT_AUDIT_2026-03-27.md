# QA Figma-Code Governed Component Audit

**Date**: 2026-03-27
**Auditor**: Claude Code (automated)
**Governing spec**: `client/src/component-registry.ts` (28 mapped components)
**Files audited**: 2

---

## File 1: `client/src/concept2cure/components/workspace/ToolsLanding.tsx`

### Registry Components Used

| Component | Status |
|---|---|
| `WorkspaceCanvas` | USED (line 14, 89) |

### Violations

| # | Line(s) | Violation | Governed Alternative | Severity |
|---|---------|-----------|---------------------|----------|
| V1 | 91 | Raw `<h1>` used as page header | `PageTitleHeader` from `@/components/ui/workspace-primitives` | HIGH |
| V2 | 103, 150, 206 | Raw `<button>` elements (artifact resume buttons and tool buttons) | `Button` from `@/components/ui/button` with `variant="ghost"` and appropriate sizing | HIGH |
| V3 | 119-131 | Custom status pill using manual `cn()` color classes for artifact status (`draft`, `review`, `approved`, `locked`) | `WorkspaceStatusBadge` from `@/components/ui/workspace-primitives` with `WORKFLOW_STATUS_CONFIG` | HIGH |
| V4 | 190-196 | Custom empty state with ad-hoc icon + text | `EmptyState` from `@/components/ui/statesV2` or `@/design-system/patterns/EmptyState` | MEDIUM |

### Summary

- **Registry components used**: 1 of 5+ applicable (`WorkspaceCanvas`)
- **Missing**: `PageTitleHeader`, `Button`, `WorkspaceStatusBadge`, `EmptyState`
- **Compliance**: LOW

---

## File 2: `client/src/concept2cure/components/workflow/HAQManager.tsx`

### Registry Components Used

| Component | Status |
|---|---|
| `WorkspaceCanvas` | USED (line 15, 161) |
| `PageTitleHeader` | USED (line 15, 162) |
| `Button` | USED (line 16, 178, 238, 244) |
| `Textarea` | USED (line 17, 172) |
| `Badge` | USED (line 18, 218) |

### Violations

| # | Line(s) | Violation | Governed Alternative | Severity |
|---|---------|-----------|---------------------|----------|
| V5 | 150-156 | Custom `statusConfig` object with manual color classes for HAQ statuses (`pending`, `drafting`, `drafted`, `reviewed`, `finalized`) | `WorkspaceStatusBadge` from `@/components/ui/workspace-primitives` with `WORKFLOW_STATUS_CONFIG`. Map HAQ-specific statuses to the governed status keys or extend the config. | HIGH |
| V6 | 206-223 | Raw `<button>` used for question list items in the sidebar | `Button` from `@/components/ui/button` with `variant="ghost"` and custom className | MEDIUM |
| V7 | 190-195 | Custom empty state (ad-hoc centered div with icon and text for "No questions ingested yet") | `EmptyState` from `@/components/ui/statesV2` or `@/design-system/patterns/EmptyState` | MEDIUM |
| V8 | 282-284 | Custom empty state for "Select a question" placeholder | `EmptyState` from `@/components/ui/statesV2` | LOW |
| V9 | 97-108 | Raw `fetch()` with manual `Authorization` header construction via `sessionStorage` | `apiRequest()` from `@/lib/queryClient` (handles auth automatically) | HIGH |
| V10 | 55-57 | `useState` used for form-like input (`inputText`) instead of `react-hook-form` | `useForm()` from `react-hook-form` with `<FormField>` (applicable if the ingest area grows; minor for a single textarea) | LOW |
| V11 | 255-259 | Custom loading indicator (`<Sparkles>` with `animate-pulse` + text) for drafting state | `InlineLoading` or `Spinner` from `@/components/ui/statesV2` | MEDIUM |

### Summary

- **Registry components used**: 5 of 8+ applicable (`WorkspaceCanvas`, `PageTitleHeader`, `Button`, `Textarea`, `Badge`)
- **Missing**: `WorkspaceStatusBadge`, `EmptyState`, `apiRequest()`, `InlineLoading`/`Spinner`
- **Compliance**: MODERATE

---

## Overall Compliance Scores

| File | Score | Grade |
|------|-------|-------|
| `ToolsLanding.tsx` | 2/10 | FAIL |
| `HAQManager.tsx` | 6/10 | NEEDS WORK |
| **Combined** | **4/10** | **NEEDS WORK** |

---

## Fix Recommendations

### Priority 1 (HIGH -- must fix before merge)

**1. ToolsLanding.tsx -- Replace raw `<h1>` with `PageTitleHeader`** (V1)

```tsx
// BEFORE (line 91-95):
<h1 className="text-lg font-semibold text-zinc-900">Tools</h1>
{projectName && <p className="text-sm text-zinc-400 mt-0.5">{projectName}</p>}

// AFTER:
<PageTitleHeader title="Tools" subtitle={projectName} />
```

**2. ToolsLanding.tsx -- Replace raw `<button>` elements with `<Button>`** (V2)

Replace all three raw `<button>` patterns (lines 103, 150, 206) with:
```tsx
<Button variant="ghost" className="w-full justify-start gap-3 px-3 py-2.5 h-auto" ...>
```

**3. ToolsLanding.tsx -- Replace custom status pill with `WorkspaceStatusBadge`** (V3)

```tsx
// BEFORE (lines 119-131):
<span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded', ...)}>
  {artifact.status}
</span>

// AFTER:
import { WorkspaceStatusBadge } from '@/components/ui/workspace-primitives';
<WorkspaceStatusBadge status={artifact.status} size="sm" />
```

**4. HAQManager.tsx -- Replace custom statusConfig with `WorkspaceStatusBadge`** (V5)

Remove the local `statusConfig` object (lines 150-156) and use `WorkspaceStatusBadge` at line 218:
```tsx
// BEFORE:
<Badge variant="outline" className={cn('text-[10px]', config.color)}>
  {config.label}
</Badge>

// AFTER:
<WorkspaceStatusBadge status={mapHaqStatus(q.status)} size="sm" />
```
If HAQ statuses don't map 1:1 to `WORKFLOW_STATUS_CONFIG` keys, extend the config or create a mapping function.

**5. HAQManager.tsx -- Replace raw `fetch()` with `apiRequest()`** (V9)

```tsx
// BEFORE (lines 97-108):
const response = await fetch('/api/evidence/ask', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${sessionStorage.getItem('trialsage_access_token') || ''}`,
  },
  body: JSON.stringify({ ... }),
});

// AFTER:
import { apiRequest } from '@/lib/queryClient';
const response = await apiRequest('POST', '/api/evidence/ask', {
  question: question.questionText,
  projectId,
  context: `...`,
});
```

### Priority 2 (MEDIUM -- fix before next sprint review)

**6. Both files -- Replace ad-hoc empty states with `EmptyState`** (V4, V7, V8)

```tsx
import { EmptyState } from '@/components/ui/statesV2';

// ToolsLanding.tsx (line 190-196):
<EmptyState
  icon={<MessageSquareMore className="w-8 h-8" />}
  title="No questions ingested yet"
  description="Paste questions above to start the HAQ response workflow."
/>
```

**7. HAQManager.tsx -- Replace raw `<button>` in question list with `<Button>`** (V6)

```tsx
<Button
  variant="ghost"
  className={cn('w-full justify-start text-left px-3 py-2 h-auto', ...)}
  onClick={() => setSelectedQuestion(q.id)}
>
```

**8. HAQManager.tsx -- Replace custom loading indicator with `InlineLoading`** (V11)

```tsx
import { InlineLoading } from '@/components/ui/statesV2';
<InlineLoading label="Drafting response from project documents..." />
```

### Priority 3 (LOW -- nice to have)

**9. HAQManager.tsx -- Consider `useForm` for ingest textarea** (V10)

Low priority since it is a single field. If the ingest area grows to include file upload, category selection, etc., migrate to `react-hook-form`.

---

## Violation Summary

| Category | Count |
|----------|-------|
| Raw `<button>` instead of `<Button>` | 4 instances across both files |
| Custom status pills instead of `WorkspaceStatusBadge` | 2 (one per file) |
| Ad-hoc empty states instead of `EmptyState` | 3 instances |
| Raw `fetch()` instead of `apiRequest()` | 1 instance |
| Custom loading indicator instead of governed component | 1 instance |
| Missing `PageTitleHeader` | 1 instance (ToolsLanding) |
| **Total violations** | **11** |

---

*Generated by QA Figma-Code Component Audit -- 2026-03-27*
