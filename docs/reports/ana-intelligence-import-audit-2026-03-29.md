# AnA Intelligence System — Import/Export Audit Report

**Date**: 2026-03-29
**Branch**: `concept2cure-v2`
**Scope**: All AnA Intelligence System files (schema, backend services, frontend components)

---

## Summary

**3 BROKEN IMPORTS found** — all are the same root cause: backend files import ana-intelligence table symbols from `'shared/schema'`, which resolves to `shared/schema.ts` (the monolithic file), NOT `shared/schema/index.ts` (the barrel). The ana-intelligence symbols are only defined in `shared/schema/ana-intelligence.ts` and re-exported by `shared/schema/index.ts`, but TypeScript's `moduleResolution: "node"` resolves `'shared/schema'` to the FILE `shared/schema.ts` first (since it exists), before ever checking the directory index.

---

## Broken Imports

### 1. `server/services/ana-context-router.ts` — Line 24-30

```ts
import {
  userIntelligenceProfiles,
  anaCapabilityRegistry,
  anaPlatformWisdom,
  anaClientObjectives,
  anaProjectCapabilities,
} from 'shared/schema';  // ← resolves to shared/schema.ts, which does NOT export these
```

**None** of these 5 symbols exist in `shared/schema.ts`. They are only defined in `shared/schema/ana-intelligence.ts`.

**Fix**: Change import to `from 'shared/schema/ana-intelligence'` (or `from '@shared/schema/ana-intelligence'`).

---

### 2. `server/services/ana-capability-registry.ts` — Line 15

```ts
import { anaCapabilityRegistry, anaOutcomeLog, anaProjectCapabilities } from 'shared/schema';
```

**None** of these 3 symbols exist in `shared/schema.ts`.

**Fix**: Change import to `from 'shared/schema/ana-intelligence'`.

---

### 3. `server/services/ana-scoped-rule-loader.ts` — Line 15

```ts
import { anaScopedRules } from 'shared/schema';
```

`anaScopedRules` does NOT exist in `shared/schema.ts`.

**Fix**: Change import to `from 'shared/schema/ana-intelligence'`.

---

## Working Imports (No Issues)

### `server/services/ana-wisdom-engine.ts`
- Lines 16-21: Imports `projectMemoryEntries`, `projectIntelligenceProfiles`, `clientMemoryEntries`, `clientIntelligenceProfiles`, `projects` from `'shared/schema'` → **OK** (all exist in `shared/schema.ts`)
- Lines 22-27: Imports `anaPlatformWisdom`, `anaOutcomeLog`, `anaClientObjectives` from `'shared/schema/ana-intelligence'` → **OK** (direct import, correct path)
- Line 14: `db` from `'../db'` → **OK**
- Line 29: `eq`, `and`, `desc`, `sql`, `gte`, `inArray` from `'drizzle-orm'` → **OK**

### `server/services/ana-context-builder.ts`
- Line 10: Re-exports from `'./lumen-context-builder'` → **OK** (file exists)

### `server/services/industry-context-templates.ts`
- No imports from external modules — pure data file → **OK**

### `server/routes/client-intelligence.ts`
- Lines 16-37: All 20 named imports from `'../services/client-intelligence-memory'` → **OK** (all verified as exported functions)
- Line 38: `buildMemoryContextForChat` from `'../services/memory-context-assembler.js'` → **OK**
- Line 13: `Router`, `Request`, `Response` from `'express'` → **OK**
- Line 14: `multer` → **OK**

### `shared/schema/ana-intelligence.ts`
- Lines 27-38: `pgTable`, `serial`, `text`, etc. from `'drizzle-orm/pg-core'` → **OK**
- Line 39: `InferSelectModel` from `'drizzle-orm'` → **OK**
- Line 40: `organizations`, `users`, `projects` from `'../schema'` → **OK** (resolves to `shared/schema.ts`)

### `shared/schema/index.ts`
- Line 34: `export * from '../schema'` → **OK** (re-exports `shared/schema.ts`)
- Line 153: `export * from './ana-intelligence'` → **OK** (re-exports ana-intelligence tables)

---

## Frontend Components — All OK

### `client/src/concept2cure/components/intelligence/UserContextEditor.tsx`
All imports verified:
- `react-hook-form`, `@tanstack/react-query` → OK
- `@/components/ui/*` (Card, Button, Input, Textarea, Select, Badge) → OK (files exist, exports confirmed)
- `@/lib/queryClient` → OK (`apiRequest` export confirmed)
- `@/hooks/use-toast` → OK
- `@/concept2cure/hooks/queryKeys` → OK (`queryKeys` object with `anaIntelligence` keys confirmed)

### `client/src/concept2cure/components/intelligence/CompanyContextEditor.tsx`
All imports verified:
- `DataStateWrapper` from `@/components/ui/statesV2` → OK
- `DocumentUploadZone` from `./DocumentUploadZone` → OK (named export confirmed)
- All other UI imports → OK

### `client/src/concept2cure/components/intelligence/ProjectContextEditor.tsx`
All imports verified:
- `Controller`, `useFieldArray` from `react-hook-form` → OK
- `Progress` from `@/components/ui/progress` → OK
- `DataStateWrapper` from `@/components/ui/statesV2` → OK
- `DocumentUploadZone` from `./DocumentUploadZone` → OK

### `client/src/concept2cure/components/intelligence/DocumentUploadZone.tsx`
All imports verified — no issues.

---

## Schema Exports — OK

`shared/schema/ana-intelligence.ts` exports:
- **Tables**: `anaCapabilityRegistry`, `anaOutcomeLog`, `anaProjectCapabilities`, `userIntelligenceProfiles`, `anaPlatformWisdom`, `anaScopedRules`, `anaClientObjectives`
- **Types**: `AnaCapability`, `AnaOutcome`, `AnaProjectCapability`, `UserIntelligenceProfile`, `AnaPlatformWisdomEntry`, `AnaScopedRule`, `AnaClientObjective`

`shared/schema/index.ts` re-exports all of the above via `export * from './ana-intelligence'` (line 153). ✓

---

## Query Keys — OK

`client/src/concept2cure/hooks/queryKeys.ts` contains a properly structured `anaIntelligence` section (lines 170-195) with keys for:
- `companyContext`, `projectContext`, `userContext`, `capabilities`, `projectMemory`, `clientMemory`, `wisdom`, `objectives`, `documents`

All keys follow the `['concept2cure', 'ana-intelligence', ...]` convention and use `as const`. ✓

---

## Circular Dependency Analysis — No Issues

| From → To | Type | Risk |
|-----------|------|------|
| `ana-context-router.ts` → `ana-scoped-rule-loader.ts` | `import type` + dynamic `import()` | None — type-only at compile time, lazy at runtime |
| `shared/schema/ana-intelligence.ts` → `shared/schema.ts` | Static import | None — one-way (schema.ts never imports ana-intelligence.ts) |
| `shared/schema/index.ts` → `shared/schema.ts` + `./ana-intelligence` | Re-export | None — barrel file, no circular chain |

No circular dependencies detected.

---

## Root Cause & Recommended Fix

The 3 broken imports share one root cause: **TypeScript's node module resolution** resolves `'shared/schema'` to `shared/schema.ts` (the 730KB monolithic file) because it exists as a file, taking priority over the directory `shared/schema/index.ts`.

**Option A** (Minimal — fix 3 files): Change the import path in the 3 broken files from `'shared/schema'` to `'shared/schema/ana-intelligence'`.

**Option B** (Structural — permanent fix): Add the ana-intelligence table definitions to `shared/schema.ts` via a re-export at the bottom: `export * from './schema/ana-intelligence'`. This would make `'shared/schema'` resolve all symbols regardless of file vs directory resolution. However, this risks circular imports since `ana-intelligence.ts` itself imports from `'../schema'` (i.e., `shared/schema.ts`).

**Recommendation**: Option A is the safest fix.
