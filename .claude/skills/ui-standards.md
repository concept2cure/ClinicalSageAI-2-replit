# Skill: UI State Standards Enforcement

## Description

Enforce ClinicalSageAI UI state management standards when writing or modifying any React component that handles async data, mutations, forms, or API calls.

## Activation

This skill activates when:
- Creating or modifying any React component in `client/src/`
- Adding new API routes in `server/routes/`
- Writing or modifying custom hooks that use TanStack Query
- Touching form logic, loading states, error handling, or empty states
- Modifying AnaPersistentPanel or any chat component
- Adding new backend endpoints

## Governing Design Constraint

**Zero Capability Loss:** Conversation-first design does NOT mean removing capabilities. Every metric, score, workflow step, and action that a dashboard or widget once provided MUST still be achievable — through conversation, slash commands, on-demand inspector panels, or rich inline results. A cleaner UI that does less is a regression, not an improvement.

## Rules (Hard Requirements)

### 1. Data Display Components

**MUST** use `DataStateWrapper<T>` from `client/src/components/ui/statesV2.tsx` as the default pattern for any component rendering data from a query.

```tsx
import { DataStateWrapper, SkeletonCard } from '@/components/ui/statesV2';
```

- Pass `loadingComponent` with the appropriate Skeleton variant (`SkeletonTable`, `SkeletonCard`, `SkeletonText`) — NOT bare `<LoadingState />`
- Always pass `retry={refetch}` to give users error recovery
- Always pass meaningful `emptyTitle` + `emptyDescription` — never generic "No data"
- Always pass `testId` for test automation
- For dashboards with multiple queries, each section gets its OWN `DataStateWrapper` — sections load and fail independently

### 2. Mutations

**MUST** follow this exact pattern:

```tsx
const mutation = useMutation({
  mutationFn: (input) => apiRequest('POST', '/api/...', input),
  onSuccess: () => {
    toast({ title: '...', description: '...' });
    queryClient.invalidateQueries({ queryKey: queryKeys.domain.method() });
  },
  onError: (err: Error) => {
    toast({ title: '...', description: err.message, variant: 'destructive' });
  },
});
```

- Use `mutation.isPending` (NOT `.isLoading`) — TanStack Query v5
- Disable buttons during `isPending`
- Show `<InlineLoading>` or `<Spinner size="sm" />` in the button during pending
- Always toast on error with `variant: 'destructive'` — NEVER silently fail
- Always `invalidateQueries()` on success using keys from `queryKeys.ts`

### 3. Query Keys

**MUST** register all query keys in `client/src/concept2cure/hooks/queryKeys.ts`.

Pattern: `['concept2cure', domain, ...params] as const`

**FORBIDDEN:** Ad-hoc string arrays like `['tasks', id]` or `['/api/projects']`.

### 4. API Calls

**MUST** use `apiRequest()` from `client/src/lib/queryClient.ts` for all API calls.

**Documented Exceptions (require comment explaining why):**
- SSE streaming: requires `AbortController` signal — use `getAuthHeaders()` helper from AnaPersistentPanel
- Multipart file upload: requires `FormData` body without JSON Content-Type — use `getAuthHeaders()` helper

**FORBIDDEN:**
- Raw `fetch()` without documented justification and auth headers
- `axios` (being phased out)
- Duplicated `localStorage` auth header logic — use the shared `getAuthHeaders()` helper

### 5. Forms

**MUST** use `react-hook-form` with the form primitives from `client/src/components/ui/form.tsx`.

**FORBIDDEN:** `useState` per-field for form state management.

### 6. Backend API Responses

**MUST** use the response envelope:

```typescript
// Success
sendSuccess(res, data);
sendSuccess(res, data, { total });

// Error
sendError(res, 400, 'Validation failed', details, 'VALIDATION_FAILED');
```

Define `sendSuccess`/`sendError` helpers in each route file if not already present (see `server/routes/ana-ri.ts` or `server/routes/concept2cure.ts` for reference).

**Documented Exception:** SSE streaming endpoints use `res.write()` with JSON event data — this is correct for `text/event-stream` and does NOT use the envelope.

**FORBIDDEN:** Raw `res.json({ error: '...' })` without the envelope.

### 7. Loading States

**Order of preference:**
1. `SkeletonTable` / `SkeletonCard` / `SkeletonText` — when content shape is known
2. `LoadingState` — for page-level or unknown shape
3. `Spinner` — for inline contexts only
4. `InlineLoading` — inside buttons only

**For AnA chat streaming:** Use the streaming cursor animation (`animate-[blink_1s_ease-in-out_infinite]`) — no skeleton needed.

**FORBIDDEN:**
- `{isLoading && <div>Loading...</div>}` — no structure, no accessibility
- Custom spinner HTML per component — use the shared components

### 8. Error States

**MUST** always provide a recovery path:
- Query errors → `<ErrorState retry={refetch}>` (via `DataStateWrapper`)
- Mutation errors → `toast({ variant: 'destructive' })`
- Chat errors → inline error message in conversation + toast
- Render errors → `<ErrorBoundary>` at route level

**For AnA chat action handlers:** falling back to `handleSend()` (sending the request as natural language) IS an acceptable recovery path. Add a comment: `/* API failed — fall back to natural language */`

**FORBIDDEN:**
- `console.error` as the only error handling
- `alert()` / `window.alert()`
- Empty `catch {}` blocks without explanatory comments

### 9. Empty Catch Blocks

Every empty `catch {}` **MUST** have a comment explaining why it's empty:
- SSE parsing: `/* Skip malformed SSE chunk */`
- Graceful degradation: `/* API failed — fall back to natural language */`
- Non-critical enrichment: `/* Non-blocking — continue without enrichment */`
- Table might not exist: `/* Table may not exist yet — skip */`

### 10. Accessibility (Non-Negotiable)

All async state UI must include:
- `role="status"` + `aria-live="polite"` + `aria-busy="true"` for loading/streaming
- `role="alert"` + `aria-live="assertive"` for errors and health warnings
- `role="log"` + `aria-live="polite"` for conversation areas
- `role="listbox"` + `aria-label` for dropdown menus (slash commands, mode selector)
- `aria-label` on every icon-only button (copy, thumbs up, download, etc.)
- `data-testid` on every stateful component
- `<span className="sr-only">` for icon-only UI elements

### 11. TypeScript Quality

- **FORBIDDEN:** `any` type unless absolutely unavoidable (document with comment)
- Use `catch (err: unknown)` and narrow with `instanceof Error` — not `catch (err: any)`
- Define proper interfaces for all data structures (especially API response shapes)
- No unused imports — clean up after refactoring

### 12. SQL Security

- **ALL** SQL queries MUST use parameterized values (`$1`, `$2`, etc.)
- **FORBIDDEN:** String interpolation in SQL (`` `LIMIT ${limit}` ``) — use `LIMIT $N` with params
- Column name allowlists are acceptable for dynamic SET clauses (see command-executor.ts pattern)

### 13. Backend Streaming Endpoints (SSE)

SSE endpoints have unique patterns:
- Use `res.writeHead(200, { 'Content-Type': 'text/event-stream' })` — not `sendSuccess()`
- Send events as `data: ${JSON.stringify(...)}\n\n`
- Error events use `{ type: 'error', error: 'message' }` — not `sendError()`
- Pre-streaming errors (before headers sent) use `sendError()` normally
- Always check `res.headersSent` before choosing error format

## Reference Files

| Purpose | Path |
|---------|------|
| State components | `client/src/components/ui/statesV2.tsx` |
| Error boundary | `client/src/components/ui/error-boundary.jsx` |
| Spinner | `client/src/components/ui/spinner.tsx` |
| Toast | `client/src/hooks/use-toast.ts` |
| Query client + apiRequest | `client/src/lib/queryClient.ts` |
| Query key factory | `client/src/concept2cure/hooks/queryKeys.ts` |
| Form primitives | `client/src/components/ui/form.tsx` |
| Backend response helpers | `server/routes/concept2cure.ts` (sendSuccess/sendError) |
| AnA response helpers | `server/routes/ana-ri.ts` (sendSuccess/sendError) |
| Full standards document | `docs/standards/ui-state-standards.md` |
| AnA chat component | `client/src/concept2cure/components/chat/AnaPersistentPanel.tsx` |
| Auth header helper | `getAuthHeaders()` in AnaPersistentPanel.tsx |
| Audit report | `docs/reports/audit-ui-chatfirst-2026-03-25.md` |

## Validation Checklist

Before completing any component that touches async data:

- [ ] Uses `DataStateWrapper` or individual state components from `statesV2.tsx`
- [ ] Skeleton variant matches content shape
- [ ] Error state has retry callback
- [ ] Empty state has descriptive text + CTA
- [ ] Mutations use `isPending` (not `isLoading`)
- [ ] Mutations toast on error with `variant: 'destructive'`
- [ ] Mutations `invalidateQueries()` on success
- [ ] Query keys registered in `queryKeys.ts`
- [ ] API calls use `apiRequest()` — documented exceptions for SSE/file upload
- [ ] Forms use `react-hook-form` + `<FormField>` components
- [ ] Backend routes use `sendSuccess()` / `sendError()` envelope
- [ ] ARIA attributes present on all state elements
- [ ] `data-testid` on stateful components
- [ ] No silent failures — every error has user-visible feedback
- [ ] Buttons disabled during mutations
- [ ] No empty catch blocks without comments
- [ ] No `any` types without documentation
- [ ] SQL uses parameterized values only
- [ ] SSE endpoints use correct streaming patterns
