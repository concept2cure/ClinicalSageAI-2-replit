# ClinicalSageAI — UI State Management Standards

> Version 1.0.0 | 2026-03-24
> This document codifies the EXACT patterns to use for loading, error, empty, and async states across the ClinicalSageAI frontend. Every pattern is grounded in what already exists in the codebase.

---

## 1. Foundation: What Already Exists

These are the canonical tools. **Use them. Do not reinvent them.**

### State Components (`client/src/components/ui/statesV2.tsx`)

| Component | Purpose | When to Use |
|-----------|---------|-------------|
| `LoadingState` | Full-area spinner with message | Page-level or section-level loading |
| `EmptyState` | Icon + title + description + action | When query returns `[]` or `null` |
| `ErrorState` | Alert with retry button + technical details | When query fails or mutation errors |
| `Skeleton` / `SkeletonText` / `SkeletonCard` / `SkeletonTable` | Placeholder shimmer | Content-shaped loading (preferred over spinner) |
| `DataStateWrapper<T>` | Orchestrates loading → error → empty → success | **THE default wrapper for any data-driven component** |
| `InlineLoading` | Tiny spinner for buttons/inline | Inside buttons during mutations |
| `ProgressIndicator` | Progress bar with variants | Long-running operations with known progress |

### Query Infrastructure (`client/src/lib/queryClient.ts`)

| Export | Purpose |
|--------|---------|
| `queryClient` | Singleton QueryClient — retry: 1, staleTime: 5m, gcTime: 10m |
| `apiRequest()` | Fetch wrapper with auth + org headers + error parsing |
| `getQueryFn()` | Default query function for TanStack Query |
| `invalidateApiCache()` | Call after login/logout/org switch |

### Query Keys (`client/src/concept2cure/hooks/queryKeys.ts`)

Pattern: `['concept2cure', domain, ...params] as const`

**Every new query MUST add its key to this factory.** No ad-hoc string arrays.

### Toast Notifications (`client/src/hooks/use-toast.ts`)

| Function | When |
|----------|------|
| `toast({ title, description })` | Mutation success feedback |
| `toast({ title, description, variant: 'destructive' })` | Mutation failure feedback |

### Error Boundary (`client/src/components/ui/error-boundary.jsx`)

Wraps top-level route components. Uses Card + AlertTriangle + "Try Again" button.

### Spinner (`client/src/components/ui/spinner.tsx`)

Small inline spinner (Loader2 icon). Sizes: `sm`, `md`, `lg`.

---

## 2. The Five States Every Async Component MUST Handle

Every component that fetches data must handle exactly these five states:

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│ LOADING  │ → │  ERROR   │ → │  EMPTY   │ → │ SUCCESS  │ → │ STALE/   │
│          │    │          │    │          │    │          │    │ REFRESH  │
└──────────┘    └──────────┘    └──────────┘    └──────────┘    └──────────┘
```

| State | What the User Sees | Implementation |
|-------|-------------------|----------------|
| **Loading** (initial) | Skeleton or spinner | `isLoading === true` |
| **Error** | Error message + retry button | `error !== null` |
| **Empty** | Descriptive message + CTA | `data` is `null`, `[]`, or `{}` |
| **Success** | Actual content | `data` is populated |
| **Background Refresh** | Content stays visible, subtle indicator | `isFetching && !isLoading` |

---

## 3. Mandatory Patterns

### Pattern A: Simple Data Display (Use `DataStateWrapper`)

This is the **default pattern** for any component that shows data from a single query.

```tsx
import { DataStateWrapper } from '@/components/ui/statesV2';

function ProjectTasks({ projectId }: { projectId: number }) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.projects.tasks(projectId),
    queryFn: () => apiRequest('GET', `/api/concept2cure/projects/${projectId}/tasks`).then(r => r.json()),
    enabled: !!projectId,
  });

  return (
    <DataStateWrapper
      isLoading={isLoading}
      error={error}
      data={data?.data}
      loadingComponent={<SkeletonTable rows={5} columns={3} />}
      emptyTitle="No tasks yet"
      emptyDescription="Create your first task to get started."
      emptyAction={{ label: 'Create Task', onClick: () => setShowCreate(true) }}
      retry={refetch}
      testId="project-tasks"
    >
      {(tasks) => <TaskList tasks={tasks} />}
    </DataStateWrapper>
  );
}
```

**Rules:**
- Use `SkeletonTable` / `SkeletonCard` / `SkeletonText` as `loadingComponent` (NOT bare `<LoadingState />`) when the content shape is known
- Always pass `retry={refetch}` so errors have a recovery path
- Always pass `testId` for testability
- Always provide meaningful `emptyTitle` + `emptyDescription` (no generic "No data")

### Pattern B: Multiple Parallel Queries (Compose DataStateWrappers)

For dashboards with multiple independent data sources:

```tsx
function ReadinessDashboard({ projectId }: { projectId: number }) {
  const readiness = useQuery({ queryKey: queryKeys.intelligence.readiness(projectId), ... });
  const recommendations = useQuery({ queryKey: queryKeys.intelligence.recommendations(projectId), ... });

  return (
    <div className="grid grid-cols-2 gap-6">
      <DataStateWrapper isLoading={readiness.isLoading} error={readiness.error} data={readiness.data} ...>
        {(data) => <ReadinessScore data={data} />}
      </DataStateWrapper>

      <DataStateWrapper isLoading={recommendations.isLoading} error={recommendations.error} data={recommendations.data} ...>
        {(data) => <RecommendationList items={data} />}
      </DataStateWrapper>
    </div>
  );
}
```

**Rules:**
- Each query gets its OWN `DataStateWrapper` — do NOT combine them into one loading state
- Sections load independently — fast sections appear first
- Each section fails independently — one error doesn't take down the whole page

### Pattern C: Mutations (Toast + Button State)

```tsx
function ApproveButton({ artifactId }: { artifactId: number }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const approve = useMutation({
    mutationFn: () => apiRequest('POST', `/api/concept2cure/artifacts/${artifactId}/approve`),
    onSuccess: () => {
      toast({ title: 'Approved', description: 'Document approved successfully.' });
      queryClient.invalidateQueries({ queryKey: queryKeys.artifacts.detail(artifactId) });
    },
    onError: (err: Error) => {
      toast({ title: 'Approval failed', description: err.message, variant: 'destructive' });
    },
  });

  return (
    <Button onClick={() => approve.mutate()} disabled={approve.isPending}>
      {approve.isPending ? <InlineLoading label="Approving" /> : 'Approve'}
    </Button>
  );
}
```

**Rules:**
- Mutations use `.isPending` (NOT `.isLoading`) — TanStack Query v5
- Success → `toast()` + `invalidateQueries()`
- Error → `toast({ variant: 'destructive' })` — never silently fail
- Button shows `InlineLoading` or `<Spinner size="sm" />` during pending
- Button is `disabled` during pending — prevent double-submit

### Pattern D: Forms (react-hook-form + Mutation)

```tsx
import { useForm } from 'react-hook-form';
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';

function CreateProjectForm() {
  const form = useForm<CreateProjectInput>({ defaultValues: { name: '', description: '' } });
  const { toast } = useToast();

  const create = useMutation({
    mutationFn: (values: CreateProjectInput) => apiRequest('POST', '/api/concept2cure/projects', values),
    onSuccess: () => { toast({ title: 'Project created' }); },
    onError: (err: Error) => { toast({ title: 'Failed to create project', description: err.message, variant: 'destructive' }); },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((v) => create.mutate(v))}>
        <FormField control={form.control} name="name" rules={{ required: 'Name is required' }}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Project Name</FormLabel>
              <FormControl><Input {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={create.isPending}>
          {create.isPending ? <InlineLoading label="Creating" /> : 'Create'}
        </Button>
      </form>
    </Form>
  );
}
```

**Rules:**
- Always use react-hook-form (not useState for each field)
- Validation via `rules` prop or zod resolver
- Field errors shown via `<FormMessage />`
- Submit button disabled during `isPending`

### Pattern E: Route-Level Code Splitting

```tsx
const Intelligence = lazy(() => import('./pages/Intelligence'));

<Suspense fallback={<LoadingState message="Loading intelligence..." />}>
  <Intelligence />
</Suspense>
```

**Rules:**
- All route-level components use `React.lazy()` + `<Suspense>`
- Suspense fallback is `<LoadingState>` (not a bare spinner)
- Wrap each lazy route in `<ErrorBoundary>` for crash protection

---

## 4. API Response Envelope (Backend → Frontend Contract)

### Success Response

```json
{
  "success": true,
  "data": { ... },
  "meta": { "total": 42, "page": 1, "limit": 20 }
}
```

### Error Response

```json
{
  "success": false,
  "error": {
    "message": "Human-readable error message",
    "code": "VALIDATION_FAILED",
    "details": { ... }
  }
}
```

### Backend Helpers (Already Exist in `server/routes/concept2cure.ts`)

```typescript
const sendSuccess = <T>(res: Response, data: T, meta?: Record<string, unknown>) => {
  if (meta) return res.json({ success: true, data, meta });
  return res.json({ success: true, data });
};

const sendError = (res: Response, status: number, message: string, details?: unknown, code?: string) =>
  res.status(status).json({ success: false, error: { message, code, details } });
```

**Rules:**
- ALL new API routes MUST use `sendSuccess()` / `sendError()` — no raw `res.json({ ... })`
- Error payloads always include `error.message` — the frontend relies on it
- Use HTTP status codes correctly: 400 validation, 401 auth, 403 forbidden, 404 not found, 409 conflict, 500 server

---

## 5. Query Key Management

### Adding New Query Keys

```typescript
// In client/src/concept2cure/hooks/queryKeys.ts
export const queryKeys = {
  // ... existing keys ...

  // ── New Domain ──────────────────────────────────────────────
  newDomain: {
    all: ['concept2cure', 'new-domain'] as const,
    detail: (id: number | string) => ['concept2cure', 'new-domain', id] as const,
    byProject: (projectId: number | string) => ['concept2cure', 'new-domain', 'project', projectId] as const,
  },
};
```

### Cache Invalidation After Mutations

```typescript
// Invalidate single item
queryClient.invalidateQueries({ queryKey: queryKeys.artifacts.detail(id) });

// Invalidate list (prefix match)
queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });

// Invalidate everything for a project
queryClient.invalidateQueries({ queryKey: ['concept2cure', 'projects', projectId] });
```

---

## 6. Accessibility Requirements (Non-Negotiable)

All state components from `statesV2.tsx` already include these. When building custom states:

| Requirement | Implementation |
|-------------|----------------|
| Loading announced to screen readers | `role="status"` + `aria-live="polite"` + `aria-busy="true"` |
| Errors announced assertively | `role="alert"` + `aria-live="assertive"` |
| Regions labeled | `aria-labelledby` pointing to visible title |
| Keyboard operable | Retry buttons focusable, `Enter`/`Space` trigger action |
| Screen reader text | `<span className="sr-only">` for icon-only elements |
| Test IDs | `data-testid` on every state component |

---

## 7. Forbidden Patterns

| Pattern | Why It's Forbidden | Use Instead |
|---------|--------------------|-------------|
| `{isLoading && <div>Loading...</div>}` | No accessibility, no structure | `<DataStateWrapper>` or `<LoadingState>` |
| `{error && <p style={{color:'red'}}>{error}</p>}` | No retry, no accessibility | `<ErrorState>` with `retry` prop |
| `useState` for each form field | Reinventing react-hook-form | `useForm()` + `<FormField>` |
| `try/catch` around `fetch()` with `console.error` only | Silent failure | `useMutation` + `toast({ variant: 'destructive' })` |
| `mutation.isLoading` | Deprecated in TanStack v5 | `mutation.isPending` |
| Ad-hoc query keys like `['tasks', id]` | Cache collisions, no factory | `queryKeys.domain.method(id)` |
| `getAuthHeaders()` helper per-file | Duplicated auth logic | `apiRequest()` from `queryClient.ts` |
| `axios` for new code | Being phased out | `apiRequest()` (native fetch) |
| Raw `res.json({ error: '...' })` in routes | Inconsistent envelope | `sendError()` helper |
| `alert()` or `window.alert()` | Blocks UI, no styling | `toast()` from `use-toast` |
| `console.log` for user-facing errors | Users don't see console | `toast()` or `<ErrorState>` |
| Custom spinner HTML per component | Inconsistent, inaccessible | `<Spinner>`, `<InlineLoading>`, or `<LoadingState>` |

---

## 8. Component Audit Checklist

Before shipping any async component, verify:

- [ ] **Loading**: Uses `DataStateWrapper`, `LoadingState`, or Skeleton variant
- [ ] **Error**: Has retry path via `<ErrorState retry={refetch}>` or toast
- [ ] **Empty**: Descriptive empty state with actionable CTA
- [ ] **Mutation feedback**: Toast on success, destructive toast on error
- [ ] **Button states**: Disabled + spinner during `isPending`
- [ ] **Query keys**: Registered in `queryKeys.ts` factory
- [ ] **API calls**: Use `apiRequest()` — not raw `fetch()` or `axios`
- [ ] **Test IDs**: `data-testid` on major UI states
- [ ] **Accessibility**: ARIA roles, labels, live regions per section 6
- [ ] **No silent failures**: Every error path has user-visible feedback
- [ ] **No duplicate auth**: No per-file `getAuthHeaders()` functions

---

## 9. File Reference Map

| What | Where |
|------|-------|
| State components | `client/src/components/ui/statesV2.tsx` |
| Error boundary | `client/src/components/ui/error-boundary.jsx` |
| Spinner | `client/src/components/ui/spinner.tsx` |
| Skeleton (basic) | `client/src/components/ui/skeleton.tsx` |
| Toast hook | `client/src/hooks/use-toast.ts` |
| Toast renderer | `client/src/components/ui/toaster.tsx` |
| Query client | `client/src/lib/queryClient.ts` |
| API request | `client/src/lib/queryClient.ts` → `apiRequest()` |
| Query key factory | `client/src/concept2cure/hooks/queryKeys.ts` |
| Form primitives | `client/src/components/ui/form.tsx` |
| Auth context | `client/src/hooks/use-auth.tsx` |
| Workspace context | `client/src/concept2cure/contexts/ZenWorkspaceContext.tsx` |
| Document mode context | `client/src/concept2cure/contexts/DocumentModeContext.tsx` |
| Backend response helpers | `server/routes/concept2cure.ts` → `sendSuccess()`, `sendError()` |
| UI primitives barrel | `client/src/components/ui/index.ts` |
