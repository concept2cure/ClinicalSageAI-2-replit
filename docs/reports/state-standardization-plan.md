# State Standardization Plan — Single Source of Truth

> Generated: 2026-03-24
> Scope: Canonical state primitive, top-20 migration targets, lint enforcement

---

## 1. THE CANONICAL FILE

### `client/src/components/ui/statesV2.tsx` — The One Source of Truth

**Why this file and not the others:**

| Candidate | Verdict | Reason |
|-----------|---------|--------|
| **`statesV2.tsx`** | **WINNER** | WCAG 2.1 AA, ARIA live regions, focus management, `DataStateWrapper<T>`, `InlineLoading`, `ProgressIndicator`, `testId` on everything, `errorCode`/`supportLink` on errors. Enterprise-grade. Zero imports today = clean migration. |
| `states.tsx` (v2.0) | DEPRECATE | Subset of statesV2 with no accessibility, no testIds, no inline loading, no progress. Only 1 import (`EvidenceLinker.tsx`). Superseded. |
| `enterprise.tsx` (`LoadingState`/`EmptyState`) | ABSORB | Zen design tokens (zinc palette, rounded-xl) are product-specific styling. Merge the Zen visual treatment *into* statesV2 via a `variant="zen"` prop or Tailwind class override — don't maintain a parallel primitive. |
| `spinner.tsx` | DEPRECATE | 11 imports. Replace with `<InlineLoading />` from statesV2 (same visual, plus ARIA). |
| `LoadingSpinner.jsx` | DEPRECATE | 27 imports. Legacy JSX. Replace with `<LoadingState size="sm" />` from statesV2. |
| `database-aware.jsx` (`DataAware`) | DEPRECATE | Poor man's `DataStateWrapper`. statesV2's version is generic, typed, and accessible. |
| `cmc/ErrorBoundary.jsx` | DELETE | Copy-paste of `ui/error-boundary.jsx`. Use the shared one. |

**Action**: Re-export statesV2 as the barrel from `client/src/components/ui/states.ts` (rename current `states.tsx` → `states.legacy.tsx` during migration, then delete).

### Exports from the canonical file (already exist)

```typescript
// client/src/components/ui/statesV2.tsx — v3.0.0
export { LoadingState }        // Full-screen or inline, ARIA role="status"
export { EmptyState }          // Icon + title + desc + primary/secondary actions
export { ErrorState }          // Alert role, expandable details, error code, retry
export { Skeleton }            // Base skeleton
export { SkeletonText }        // Multi-line text placeholder
export { SkeletonCard }        // Card skeleton with avatar
export { SkeletonTable }       // Table skeleton (rows × columns)
export { DataStateWrapper<T> } // THE wrapper — loading/error/empty/success in one
export { InlineLoading }       // Button/inline spinner (replaces Spinner, LoadingSpinner)
export { ProgressIndicator }   // Determinate progress bar with variants
```

---

## 2. THE 20 HIGHEST-VISIBILITY MIGRATION TARGETS

Ranked by user-facing frequency × architectural centrality. All 20 currently use **inline** `Loader2` / hand-rolled error JSX instead of the canonical primitives.

| # | Component | Path | Why High-Visibility | Current Inline Pattern |
|---|-----------|------|---------------------|----------------------|
| 1 | **ZenApp** (app shell) | `concept2cure/ZenApp.tsx` | Every session starts here. Suspense fallbacks are raw text. | `<p className="text-sm text-zinc-400">Loading workspace…</p>` × many |
| 2 | **ZenRouter** | `concept2cure/router/ZenRouter.tsx` | 12+ `<Suspense fallback={...}>` with hand-rolled loaders | Inline `<p>` loading text per route |
| 3 | **ZenChat** (AnA panel) | `concept2cure/components/chat/ZenChat.tsx` | Persistent chat — visible on every screen | Inline `Loader2 animate-spin` |
| 4 | **ProjectWorkspaceShell** | `concept2cure/components/workspace/ProjectWorkspaceShell.tsx` | Main workspace container — loaded on every project open | Inline `Loader2` + custom error div |
| 5 | **SectionWorkspace** | `concept2cure/components/workflow/SectionWorkspace.tsx` | Primary authoring surface — core user workflow | Inline loading/error |
| 6 | **EditorPanel** | `concept2cure/components/editor/EditorPanel.tsx` | Document editing — highest dwell-time screen | Inline `Loader2` |
| 7 | **GovernedDocumentPanel** | `concept2cure/components/workspace/GovernedDocumentPanel.tsx` | Document governance view — appears in every edit session | Inline spinner + error |
| 8 | **RoleDashboard** | `concept2cure/components/dashboards/RoleDashboard.tsx` | Landing dashboard after login | Inline `Loader2` |
| 9 | **ProjectKnowledge** | `concept2cure/components/knowledge/ProjectKnowledge.tsx` | Knowledge panel — frequently accessed side panel | Inline loading text |
| 10 | **RegulatoryIntelligencePanel** | `concept2cure/components/intelligence/RegulatoryIntelligencePanel.tsx` | Core RI feature — primary differentiator | Inline `Loader2` |
| 11 | **ComplianceScannerPanel** | `concept2cure/components/editor/ComplianceScannerPanel.tsx` | In-editor compliance — runs on every document | Inline spinner |
| 12 | **ReviewMode** | `concept2cure/components/editor/ReviewMode.tsx` | Review workflow — high-frequency regulatory action | Inline `Loader2` |
| 13 | **SubmissionReadinessValidator** | `concept2cure/components/submission/SubmissionReadinessValidator.tsx` | Submission gating — critical path feature | Inline loading |
| 14 | **ReportCenter** | `concept2cure/components/reports/ReportCenter.tsx` | Report generation hub — frequent export target | Inline `Loader2` |
| 15 | **PrecedentIntelligenceDashboard** | `concept2cure/components/precedent/PrecedentIntelligenceDashboard.tsx` | Precedent search — core RI use case | Inline loading/error |
| 16 | **ArtifactViewer** | `concept2cure/components/artifacts/ArtifactViewer.tsx` | Artifact display — loaded for every document view | Inline `Loader2` |
| 17 | **RICopilotHome** | `concept2cure/components/intelligence/RICopilotHome.tsx` | RI copilot landing — primary entry point | Inline spinner |
| 18 | **DocumentProvenancePanel** | `concept2cure/components/provenance/DocumentProvenancePanel.tsx` | Audit trail view — regulatory compliance critical | Inline loading |
| 19 | **ReviewQueuePanel** | `concept2cure/components/workspace/ReviewQueuePanel.tsx` | Review queue — daily workflow for reviewers | Inline `Loader2` |
| 20 | **PreSubmissionChecklist** | `concept2cure/components/submission/PreSubmissionChecklist.tsx` | Pre-submission gate — high-stakes workflow | Inline loading |

### Migration pattern for each component

**Before** (typical inline pattern found 62+ times):
```tsx
if (isLoading) {
  return (
    <div className="flex items-center justify-center p-8">
      <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
      <span className="ml-2 text-sm text-zinc-500">Loading...</span>
    </div>
  );
}
if (error) {
  return (
    <div className="text-red-500 text-sm p-4">
      Error: {error.message}
    </div>
  );
}
```

**After** (canonical wrapper):
```tsx
import { DataStateWrapper } from '@/components/ui/statesV2';

// Wrap entire data-dependent render:
<DataStateWrapper
  isLoading={isLoading}
  error={error}
  data={data}
  retry={refetch}
  emptyTitle="No documents found"
  emptyDescription="Create your first document to get started."
  emptyAction={{ label: 'New Document', onClick: handleCreate }}
>
  {(data) => <ActualContent data={data} />}
</DataStateWrapper>
```

For Suspense fallbacks in ZenApp/ZenRouter:
```tsx
<Suspense fallback={<LoadingState message="Loading workspace…" />}>
```

---

## 3. LINT / CI ENFORCEMENT RULES

### 3A. Custom ESLint Rule: `no-inline-state-patterns`

Add to `eslint.config.js` using `no-restricted-imports` + `no-restricted-syntax`:

```javascript
// Add to the rules object in eslint.config.js:

// RULE 1: Ban competing loading/error primitive imports
'no-restricted-imports': ['error', {
  paths: [
    {
      name: '@/components/ui/states',
      message: 'Use @/components/ui/statesV2 instead. states.tsx is deprecated.',
    },
    {
      name: '@/components/common/LoadingSpinner',
      message: 'Use { LoadingState } or { InlineLoading } from @/components/ui/statesV2.',
    },
    {
      name: '@/components/ui/spinner',
      message: 'Use { InlineLoading } from @/components/ui/statesV2.',
    },
    {
      name: '@/components/ui/database-aware',
      message: 'Use { DataStateWrapper } from @/components/ui/statesV2.',
    },
    {
      name: '@/components/cmc/ErrorBoundary',
      message: 'Use { ErrorBoundary } from @/components/ui/error-boundary.',
    },
  ],
  patterns: [
    {
      group: ['**/common/LoadingSpinner*'],
      message: 'Use { LoadingState } from @/components/ui/statesV2.',
    },
  ],
}],

// RULE 2: Ban inline Loader2 spinner patterns in concept2cure/
'no-restricted-syntax': ['error',
  {
    selector: 'JSXElement[openingElement.name.name="Loader2"]',
    message: 'Do not use <Loader2> directly. Use <LoadingState>, <InlineLoading>, or <DataStateWrapper> from @/components/ui/statesV2.',
  },
  {
    selector: 'JSXElement[openingElement.name.property.name="Loader2"]',
    message: 'Do not use <Loader2> directly. Use <LoadingState>, <InlineLoading>, or <DataStateWrapper> from @/components/ui/statesV2.',
  },
],
```

### 3B. CI Gate (add to `package.json` scripts or CI pipeline)

```jsonc
// package.json — add script:
"lint:state-patterns": "eslint --no-eslintrc -c eslint.config.js --rule '{\"no-restricted-imports\": [\"error\", {\"paths\": [{\"name\": \"@/components/ui/states\", \"message\": \"Deprecated. Use statesV2.\"}, {\"name\": \"@/components/common/LoadingSpinner\", \"message\": \"Deprecated. Use statesV2.\"}]}]}' 'client/src/**/*.{ts,tsx}'"
```

Or, more practically, just run the full lint in CI which will now include these rules:

```bash
# CI step (already exists as `npm run lint`)
npm run lint -- --max-warnings 0
```

### 3C. Grep-Based CI Backstop (catches what ESLint misses)

For JSX files that ESLint can't fully parse (legacy `.jsx`), add a shell check:

```bash
#!/bin/bash
# scripts/check-inline-state-patterns.sh
# Run in CI alongside lint

VIOLATIONS=0

# Check for raw Loader2 usage in concept2cure components
COUNT=$(grep -r "Loader2" client/src/concept2cure/ --include="*.tsx" --include="*.jsx" -l | wc -l)
if [ "$COUNT" -gt 0 ]; then
  echo "ERROR: $COUNT files in concept2cure/ still use raw Loader2."
  grep -r "Loader2" client/src/concept2cure/ --include="*.tsx" --include="*.jsx" -l
  VIOLATIONS=$((VIOLATIONS + COUNT))
fi

# Check for deprecated LoadingSpinner imports
COUNT=$(grep -r "LoadingSpinner" client/src/ --include="*.tsx" --include="*.jsx" -l | wc -l)
if [ "$COUNT" -gt 0 ]; then
  echo "ERROR: $COUNT files still import LoadingSpinner."
  grep -r "LoadingSpinner" client/src/ --include="*.tsx" --include="*.jsx" -l
  VIOLATIONS=$((VIOLATIONS + COUNT))
fi

# Check for inline "Loading..." string patterns (not from statesV2)
COUNT=$(grep -rn 'className.*animate-spin.*border' client/src/concept2cure/ --include="*.tsx" -l | wc -l)
if [ "$COUNT" -gt 0 ]; then
  echo "WARN: $COUNT files have hand-rolled CSS spinners."
  VIOLATIONS=$((VIOLATIONS + COUNT))
fi

if [ "$VIOLATIONS" -gt 0 ]; then
  echo "FAILED: $VIOLATIONS inline state pattern violations found."
  exit 1
fi

echo "PASSED: No inline state pattern violations."
exit 0
```

Add to `package.json`:
```json
"lint:state-guard": "bash scripts/check-inline-state-patterns.sh"
```

---

## 4. MIGRATION EXECUTION ORDER

### Phase 1: Foundation (Day 1)
1. Add `no-restricted-imports` and `no-restricted-syntax` rules to `eslint.config.js` as **warnings** (not errors yet)
2. Re-export statesV2 components from `@/components/ui/states` so existing imports don't break during transition
3. Migrate ZenApp + ZenRouter Suspense fallbacks (highest visibility, lowest risk)

### Phase 2: Core Surfaces (Days 2-3)
4. Migrate components #2–#10 (workspace shell, editor, chat, dashboard, intelligence)
5. Each migration: replace inline loading/error/empty → `DataStateWrapper` or individual primitives

### Phase 3: Remaining Top 20 (Days 4-5)
6. Migrate components #11–#20
7. Migrate the 11 `Spinner` imports and 27 `LoadingSpinner` imports in `client/src/components/`

### Phase 4: Lock Down (Day 6)
8. Flip ESLint rules from `warn` → `error`
9. Add `scripts/check-inline-state-patterns.sh` to CI
10. Delete deprecated files: `states.tsx`, `spinner.tsx`, `LoadingSpinner.jsx`, `cmc/ErrorBoundary.jsx`
11. Remove `LoadingState`/`EmptyState` from `enterprise.tsx` (absorbed into statesV2)

---

## 5. CURRENT STATE BY THE NUMBERS

| Metric | Count |
|--------|-------|
| Files with inline `Loader2` spinners in `concept2cure/` | **62** |
| Files importing deprecated `LoadingSpinner` | **27** (legacy components) |
| Files importing deprecated `Spinner` | **11** (CER components) |
| Files importing canonical `statesV2` | **0** |
| Files importing v2.0 `states` | **1** (`EvidenceLinker.tsx`) |
| Competing state primitive files | **9** (→ consolidate to **1**) |
| Suspense fallbacks with raw text | **16** (ZenRouter alone has 12) |

After migration: **1 file**, **1 import path**, **0 inline patterns**, **CI blocks regression**.
