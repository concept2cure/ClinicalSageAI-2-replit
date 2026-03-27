# QA UI Standards Audit — 2026-03-27

**Auditor**: Claude Code (automated)
**Standard**: `.claude/skills/ui-standards.md` (UI State Standards Enforcement)
**Scope**: Three new files from the Document System Convergence Sprint

---

## Files Audited

1. `client/src/concept2cure/components/workspace/ToolsLanding.tsx`
2. `client/src/concept2cure/components/workflow/HAQManager.tsx`
3. `server/routes/evidence-ask.ts`

---

## 1. ToolsLanding.tsx

**Summary**: Static presentational component. Receives `recentArtifacts` as a prop (no queries, no mutations, no forms, no API calls). Renders tool cards and fires callback props.

| # | Rule | Verdict | Notes |
|---|------|---------|-------|
| 1 | DataStateWrapper for async data | **N/A** | Component does not fetch data — it receives props from parent. Parent is responsible for query wrapping. |
| 2 | Mutations use isPending / disable / toast | **N/A** | No mutations. |
| 3 | Query keys in queryKeys.ts | **N/A** | No queries. |
| 4 | Uses apiRequest() | **N/A** | No API calls. |
| 5 | Forms use react-hook-form | **N/A** | No forms. |
| 6 | Backend sendSuccess/sendError | **N/A** | Frontend-only file. |
| 7 | Loading states proper components | **N/A** | No loading states rendered. |
| 8 | Error recovery paths | **N/A** | No async operations. |
| 9 | Empty catch blocks commented | **N/A** | No catch blocks. |
| 10 | ARIA attributes | **FAIL** | See violations below. |
| 11 | No `any` types | **PASS** | No `any` usage. |
| 12 | SQL parameterized | **N/A** | Frontend-only file. |

### Violations

#### V1 — Missing ARIA on interactive elements (Rule 10)

**Lines 103, 150**: Raw `<button>` elements are used for artifact resume and tool card actions. They lack `aria-label` attributes that describe the action for screen readers.

**Line 120-130**: Status badges on artifacts are visual-only with no `aria-label` or `sr-only` text — screen readers will read the raw status string without context.

**Line 89**: `WorkspaceCanvas` gets `testId="tools-landing"` (good), but the overall page region has no `role` or `aria-label` for landmark navigation.

**Fix recommendations**:
```tsx
// Line 103 — add aria-label to resume buttons
<button
  key={artifact.id}
  onClick={() => onResumeArtifact?.(artifact.id)}
  aria-label={`Resume document: ${artifact.title}`}
  ...
>

// Line 150 — add aria-label to tool buttons
<button
  key={tool.id}
  onClick={() => onAction(tool.id)}
  aria-label={`Open tool: ${tool.label} — ${tool.description}`}
  ...
>

// Line 120 — add sr-only context to status badges
<span className="sr-only">Status: </span>
{artifact.status}
```

---

## 2. HAQManager.tsx

**Summary**: Stateful component managing HAQ workflow. Parses pasted questions locally, calls `/api/evidence/ask` via raw `fetch()`, and manages question state with `useState`. Contains async operations, form-like input, and error handling.

| # | Rule | Verdict | Notes |
|---|------|---------|-------|
| 1 | DataStateWrapper for async data | **FAIL** | Component manages its own async state without DataStateWrapper. |
| 2 | Mutations use isPending / disable / toast | **FAIL** | No `useMutation`, no toast on error, button not disabled during drafting. |
| 3 | Query keys in queryKeys.ts | **FAIL** | No query keys registered — no `useQuery` used at all. |
| 4 | Uses apiRequest() | **FAIL** | Raw `fetch()` with manual auth header construction on lines 97-108. |
| 5 | Forms use react-hook-form | **FAIL** | Uses `useState` for `inputText` (line 56) instead of `react-hook-form`. |
| 6 | Backend sendSuccess/sendError | **N/A** | Frontend file. |
| 7 | Loading states proper components | **FAIL** | Custom inline loading indicator on lines 256-259 (`<Sparkles>` with `animate-pulse` text). |
| 8 | Error recovery paths | **FAIL** | Errors silently set fallback text — no toast, no user-visible error notification. |
| 9 | Empty catch blocks commented | **PASS** | Catch block on line 133 is not empty — it sets fallback state. |
| 10 | ARIA attributes | **FAIL** | See violations below. |
| 11 | No `any` types | **FAIL** | Line 119: `(s: { docTitle: string })` cast from untyped API response. Response shape not typed. |
| 12 | SQL parameterized | **N/A** | Frontend file. |

### Violations

#### V2 — Raw `fetch()` instead of `apiRequest()` (Rule 4)

**Lines 97-108**: Uses `fetch('/api/evidence/ask', { ... })` with manually constructed `Authorization` header reading from `sessionStorage`. This duplicates auth logic and bypasses the centralized `apiRequest()` helper.

**Fix**:
```tsx
import { apiRequest } from '@/lib/queryClient';

// Replace lines 97-108 with:
const data = await apiRequest('POST', '/api/evidence/ask', {
  question: question.questionText,
  projectId,
  context: `This is a Health Authority Question...`,
});
```

#### V3 — No `useMutation` pattern (Rule 2)

**Lines 87-142**: The `handleDraftResponse` function performs an async API call but does not use TanStack Query's `useMutation`. There is no `isPending` state check, no button disabling during the request, and no toast notification on error.

**Fix**: Refactor to use `useMutation`:
```tsx
import { useMutation } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';

const { toast } = useToast();

const draftMutation = useMutation({
  mutationFn: (questionText: string) =>
    apiRequest('POST', '/api/evidence/ask', {
      question: questionText,
      projectId,
      context: '...',
    }),
  onError: (err: Error) => {
    toast({
      title: 'AI drafting failed',
      description: err.message,
      variant: 'destructive',
    });
  },
});

// In the button:
<Button
  size="sm"
  onClick={() => draftMutation.mutate(selected.questionText)}
  disabled={draftMutation.isPending}
>
  {draftMutation.isPending ? <Spinner size="sm" /> : <Sparkles ... />}
  AI Draft Response
</Button>
```

#### V4 — `useState` for form input instead of `react-hook-form` (Rule 5)

**Lines 55-56**: `inputText` is managed via `useState`. The ingest area (lines 168-187) is a form with a textarea and submit button — it should use `react-hook-form`.

**Fix**:
```tsx
import { useForm } from 'react-hook-form';
import { Form, FormField, FormItem } from '@/components/ui/form';

const form = useForm({ defaultValues: { questionText: '' } });

const handleIngestQuestions = form.handleSubmit((data) => {
  // parse data.questionText
});
```

#### V5 — Custom loading indicator instead of standard component (Rule 7)

**Lines 255-259**: Custom loading state with animated `<Sparkles>` icon and plain text.

**Fix**: Use `<InlineLoading />` or `<Spinner size="sm" />` from statesV2:
```tsx
import { Spinner } from '@/components/ui/spinner';

{selected.status === 'drafting' && (
  <div className="mt-4 flex items-center gap-2 text-sm text-blue-600"
       role="status" aria-live="polite" aria-busy="true">
    <Spinner size="sm" />
    Drafting response from project documents...
  </div>
)}
```

#### V6 — Silent error handling (Rule 8)

**Lines 124-131 and 133-141**: When the API call fails (HTTP error or network error), the component silently sets `responseText` to a fallback string. There is no toast notification. The user sees "AI drafting unavailable" in the response area but receives no explicit error feedback.

**Fix**: Add toast notifications:
```tsx
} catch {
  toast({
    title: 'AI drafting failed',
    description: 'Could not generate a response. Please draft manually.',
    variant: 'destructive',
  });
  // ... existing fallback state update
}
```

#### V7 — Missing ARIA attributes (Rule 10)

**Line 161**: `WorkspaceCanvas` has `testId` but no landmark role.

**Lines 206-223**: Question list buttons lack `aria-label`. The list has no `role="listbox"` or `aria-label`.

**Lines 255-259**: Drafting indicator lacks `role="status"`, `aria-live="polite"`, `aria-busy="true"`.

**Line 190-195**: Empty state div lacks `role="status"` or `data-testid`.

**Fix**: Add ARIA roles and labels to all interactive/status elements as shown above.

#### V8 — No query keys registered (Rule 3)

No entries for `evidence` or `haq` exist in `client/src/concept2cure/hooks/queryKeys.ts`. If this component is refactored to use `useQuery`/`useMutation`, keys must be registered:
```tsx
// In queryKeys.ts
evidence: {
  ask: (projectId?: string) => ['concept2cure', 'evidence', 'ask', projectId] as const,
},
haq: {
  list: (projectId?: string) => ['concept2cure', 'haq', 'list', projectId] as const,
},
```

#### V9 — Untyped API response (Rule 11)

**Line 119**: `(s: { docTitle: string })` is an inline type assertion on the API response. The full response shape from `/api/evidence/ask` is not defined as a TypeScript interface.

**Fix**: Define a response interface:
```tsx
interface EvidenceAskResponse {
  answer: string;
  sources: Array<{
    docId: string;
    docTitle: string;
    excerpt: string;
    relevanceScore: number;
  }>;
  confidence: number;
  question: string;
}
```

---

## 3. evidence-ask.ts

**Summary**: Backend Express route. Handles `POST /api/evidence/ask`. Uses `ForesightRAGService` for RAG queries. Has rate limiting and auth middleware.

| # | Rule | Verdict | Notes |
|---|------|---------|-------|
| 1 | DataStateWrapper for async data | **N/A** | Backend file. |
| 2 | Mutations use isPending / disable / toast | **N/A** | Backend file. |
| 3 | Query keys in queryKeys.ts | **N/A** | Backend file. |
| 4 | Uses apiRequest() | **N/A** | Backend file. |
| 5 | Forms use react-hook-form | **N/A** | Backend file. |
| 6 | Backend sendSuccess/sendError | **FAIL** | Uses raw `res.json()` and `res.status().json()`. |
| 7 | Loading states proper components | **N/A** | Backend file. |
| 8 | Error recovery paths | **PASS** | Returns structured error with graceful degradation (lines 89-95). |
| 9 | Empty catch blocks commented | **N/A** | No empty catch blocks. |
| 10 | ARIA attributes | **N/A** | Backend file. |
| 11 | No `any` types | **FAIL** | Two instances of `any`. |
| 12 | SQL parameterized | **N/A** | No direct SQL — delegates to `ForesightRAGService`. |

### Violations

#### V10 — Raw `res.json()` instead of `sendSuccess()`/`sendError()` (Rule 6)

**Line 53**: `res.status(400).json({ error: '...' })` — should use `sendError(res, 400, '...')`.

**Line 74**: `res.json({ answer: ..., sources: ..., ... })` — should use `sendSuccess(res, { ... })`.

**Line 89**: `res.status(502).json({ error: '...' })` — should use `sendError(res, 502, '...')`.

**Fix**: Import or define `sendSuccess`/`sendError` helpers:
```typescript
function sendSuccess(res: Response, data: Record<string, unknown>, meta?: Record<string, unknown>) {
  return res.json({ ok: true, data, ...meta });
}

function sendError(res: Response, status: number, message: string, details?: unknown, code?: string) {
  return res.status(status).json({ ok: false, error: message, details, code });
}

// Line 53:
return sendError(res, 400, 'Question is required (minimum 3 characters)', null, 'VALIDATION_FAILED');

// Line 74:
return sendSuccess(res, { answer: result.answer, sources: [...], confidence: ..., question: ... });

// Line 89:
return sendError(res, 502, 'Data Room search is temporarily unavailable', error.message);
```

#### V11 — `any` types (Rule 11)

**Line 28**: `(req: any)` in the rate limiter `keyGenerator`. Should use the Express `Request` type.

**Line 85**: `catch (error: any)` — should use `catch (error: unknown)` and narrow with `instanceof Error`.

**Fix**:
```typescript
// Line 28:
keyGenerator: (req: Request) => {
  const userId = (req as any).userId || (req as any).user?.id || 'anon';
  // OR better: define an AuthenticatedRequest interface
  ...
}

// Line 85:
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : 'Unknown error';
  console.error('[Evidence Ask] Query failed:', error);
  return sendError(res, 502, 'Data Room search is temporarily unavailable', message);
}
```

---

## Summary Scorecard

| Rule | ToolsLanding.tsx | HAQManager.tsx | evidence-ask.ts |
|------|:---:|:---:|:---:|
| 1. DataStateWrapper | N/A | **FAIL** | N/A |
| 2. Mutations isPending/disable/toast | N/A | **FAIL** | N/A |
| 3. Query keys registered | N/A | **FAIL** | N/A |
| 4. apiRequest() | N/A | **FAIL** | N/A |
| 5. react-hook-form | N/A | **FAIL** | N/A |
| 6. sendSuccess/sendError | N/A | N/A | **FAIL** |
| 7. Loading states | N/A | **FAIL** | N/A |
| 8. Error recovery | N/A | **FAIL** | PASS |
| 9. Empty catch blocks | N/A | PASS | N/A |
| 10. ARIA attributes | **FAIL** | **FAIL** | N/A |
| 11. No `any` types | PASS | **FAIL** | **FAIL** |
| 12. SQL parameterized | N/A | N/A | N/A |

### Totals

| File | PASS | FAIL | N/A |
|------|:----:|:----:|:---:|
| ToolsLanding.tsx | 1 | 1 | 10 |
| HAQManager.tsx | 1 | 8 | 3 |
| evidence-ask.ts | 1 | 2 | 9 |
| **Overall** | **3** | **11** | **22** |

### Priority Fixes

1. **HAQManager.tsx** is the highest-risk file with 8 failures. The most critical issues are:
   - **V2**: Raw `fetch()` bypasses centralized auth handling — security risk
   - **V3**: No `useMutation` — no loading/error UX for async operations
   - **V6**: Silent error handling — violates "no silent failures" rule
   - **V7**: Missing ARIA — accessibility compliance failure

2. **evidence-ask.ts** needs:
   - **V10**: Envelope helpers (`sendSuccess`/`sendError`) — consistency with all other routes
   - **V11**: Remove `any` types — type safety

3. **ToolsLanding.tsx** is mostly clean (presentational component) but needs:
   - **V1**: ARIA labels on interactive buttons — accessibility compliance

---

*Report generated: 2026-03-27*
*Standard reference: `.claude/skills/ui-standards.md`*
