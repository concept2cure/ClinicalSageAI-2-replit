# Skill: UI State Standards Enforcement

## Description

Enforce ClinicalSageAI UI state management standards when writing or modifying any React component that handles async data, mutations, forms, or API calls.

## Activation

This skill activates when:
- Creating or modifying any React component in `client/src/`
- Adding new API routes in `server/routes/`
- Writing or modifying custom hooks that use TanStack Query
- Touching form logic, loading states, error handling, or empty states

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

**FORBIDDEN:**
- Raw `fetch()` with manual header construction
- `axios` (being phased out)
- Per-file `getAuthHeaders()` functions (duplicated auth logic)

### 5. Forms

**MUST** use `react-hook-form` with the form primitives from `client/src/components/ui/form.tsx`.

```tsx
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
```

**FORBIDDEN:** `useState` per-field for form state management.

### 6. Backend API Responses

**MUST** use the response envelope from `server/routes/concept2cure.ts`:

```typescript
// Success
sendSuccess(res, data);              // { success: true, data }
sendSuccess(res, data, { total });   // { success: true, data, meta: { total } }

// Error
sendError(res, 400, 'Validation failed', details, 'VALIDATION_FAILED');
// { success: false, error: { message, code, details } }
```

**FORBIDDEN:** Raw `res.json({ error: '...' })` without the envelope.

### 7. Loading States

**Order of preference:**
1. `SkeletonTable` / `SkeletonCard` / `SkeletonText` — when content shape is known
2. `LoadingState` — for page-level or unknown shape
3. `Spinner` — for inline contexts only
4. `InlineLoading` — inside buttons only

**FORBIDDEN:**
- `{isLoading && <div>Loading...</div>}` — no structure, no accessibility
- Custom spinner HTML per component — use the shared components
- `<LoadingOverlay>` (legacy) — use `<LoadingState fullScreen>` instead

### 8. Error States

**MUST** always provide a recovery path:
- Query errors → `<ErrorState retry={refetch}>` (via `DataStateWrapper`)
- Mutation errors → `toast({ variant: 'destructive' })`
- Render errors → `<ErrorBoundary>` at route level

**FORBIDDEN:**
- `console.error` as the only error handling
- `alert()` / `window.alert()`
- `{error && <p style={{color:'red'}}>{error}</p>}`

### 9. Route-Level Components

**MUST** use:
- `React.lazy()` + `<Suspense fallback={<LoadingState message="..." />}>`
- `<ErrorBoundary>` wrapping each lazy route

### 10. Accessibility (Non-Negotiable)

All async state UI must include:
- `role="status"` + `aria-live="polite"` + `aria-busy="true"` for loading
- `role="alert"` + `aria-live="assertive"` for errors
- `aria-labelledby` pointing to visible headings
- `data-testid` on every stateful component
- `<span className="sr-only">` for icon-only UI elements

The components in `statesV2.tsx` already include all of these — use them.

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
| Backend response helpers | `server/routes/concept2cure.ts` |
| Full standards document | `docs/standards/ui-state-standards.md` |

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
- [ ] API calls use `apiRequest()` from `queryClient.ts`
- [ ] Forms use `react-hook-form` + `<FormField>` components
- [ ] Backend routes use `sendSuccess()` / `sendError()` envelope
- [ ] ARIA attributes present on all state elements
- [ ] `data-testid` on stateful components
- [ ] No silent failures — every error has user-visible feedback
- [ ] Buttons disabled during mutations
