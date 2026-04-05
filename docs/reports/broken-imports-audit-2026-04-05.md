# Broken Imports Audit — Post-681-File Deletion
**Date:** 2026-04-05  
**Scope:** `server/` codebase — import/require references to deleted files

---

## Summary

Out of 33 deleted server-side TypeScript/JavaScript files, **18 broken references** were found across **6 files**. All are in server-side code. The majority are in `server/index.ts` as dynamic `await import()` calls wrapped in `try/catch` — they fail gracefully at runtime (log an error but don't crash the server). Two categories are more serious: static compile-time imports and a module that re-exports from a deleted file.

---

## Category 1 — Runtime Failures (graceful, try/catch wrapped in `server/index.ts`)

All of these use `await import(...)` inside `try { } catch { }` blocks. The server **will not crash** on startup, but those endpoints will be unavailable and an error will be logged.

| File | Line | Broken Import | Deleted File |
|------|------|---------------|--------------|
| `server/index.ts` | 589 | `await import('./routes/csr_search_routes')` | `server/routes/csr_search_routes.ts` |
| `server/index.ts` | 886 | `await import('./routes/fda-integration-simple')` | `server/routes/fda-integration-simple.ts` |
| `server/index.ts` | 941 | `{ mod: './routes/pubmed' }` (Promise.allSettled) | `server/routes/pubmed.ts` |
| `server/index.ts` | 944 | `{ mod: './routes/literature-review' }` (Promise.allSettled) | `server/routes/literature-review.ts` |
| `server/index.ts` | 1028 | `{ mod: './routes/ectd-validate' }` (Promise.allSettled) | `server/routes/ectd-validate.ts` |
| `server/index.ts` | 5557 | `await import('./routes/multiAgencyValidation')` | `server/routes/multiAgencyValidation.ts` |
| `server/index.ts` | 5602 | `await import('./routes/validation')` | `server/routes/validation.ts` |
| `server/index.ts` | 5721 | `await import('./routes/vault-auto')` | `server/routes/vault-auto.ts` |
| `server/index.ts` | 5768 | `await import('./routes/ai-completion')` | `server/routes/ai-completion.ts` |
| `server/index.ts` | 6158 | `await import('./routes/c2c-missing-routes')` | `server/routes/c2c-missing-routes.ts` |

---

## Category 2 — Runtime Failure (try/catch, but **blocks sibling mounts**)

This one is more dangerous because `workspace-tool-settings` is imported in the **same `try` block** as `firecrawl` and `external-evidence`. If the import throws, all three routes fail to mount.

| File | Line | Broken Import | Deleted File |
|------|------|---------------|--------------|
| `server/bootstrap/register-ai-routes.ts` | 24 | `await import('../routes/workspace-tool-settings')` | `server/routes/workspace-tool-settings.ts` |

`firecrawl.ts` and `external-evidence.ts` both exist and would silently fail to mount as a side effect.

---

## Category 3 — Compile-Time Broken Imports (static `import` statements)

These are **static imports** — TypeScript will flag them and the build will fail or produce type errors.

### `server/functions/justifyEndpoint.ts` (line 4)
```ts
import { openai } from '../services/openai-service';
```
Targets `server/services/openai-service.ts` — **DELETED**. (Note: `server/openai-service.ts` exists but is a different file with different exports.)

### `server/functions/generateProtocol.ts` (line 4)
```ts
import { openai } from '../services/openai-service';
```
Same deleted target. These three `server/functions/` files are not imported anywhere in the codebase (dead code), but they are included in `tsconfig.json`'s `server/**/*` glob.

### `server/functions/buildINDModule.ts` (line 4)
```ts
import { openai } from '../services/openai-service';
```
Same deleted target.

---

## Category 4 — Re-export from Deleted Module

### `server/services/index.ts` (line 30)
```ts
export * as openaiService from './openai-service';
```
This re-exports from `server/services/openai-service.ts` — **DELETED**. However, nothing in the codebase imports from `server/services/index.ts` directly, so this does not cause a runtime failure today. It will cause a TypeScript compile error.

---

## Category 5 — Dynamic Import of Deleted Module (conditional, runtime only)

### `server/services/AssemblyLine.ts` (line 60)
```ts
const openaiModule = await import('../services/openai-service');
```
This is inside `if (process.env.OPENAI_API_KEY)` and wrapped in `try/catch`. It only fires when `OPENAI_API_KEY` is set. Target is `server/services/openai-service.ts` — **DELETED**. `AssemblyLine` is imported by `server/routes/test-assembly.ts` which mounts via `server/index.ts`.

---

## Non-Issues (Confirmed OK)

| Reference | Reason Not Broken |
|-----------|-------------------|
| `server/middleware/auth.js` references everywhere | `server/middleware/auth.ts` EXISTS — `.js` extension resolves to `.ts` in ESM |
| `server/services/connectors/pubmed.ts` | EXISTS — distinct from deleted `server/routes/pubmed.ts` |
| `server/services/versionDiffService.ts` | EXISTS — distinct from deleted `server/routes/versionDiff.ts` |
| `server/openai-service.ts` imports | EXISTS — distinct from deleted `server/services/openai-service.ts` |
| `server/bootstrap/register-core-routes.ts` cmc-dashboard-prisma | `server/routes/cmc-dashboard-prisma.ts` EXISTS |
| `server/types/global.d.ts` ambient module declarations | Ambient `declare module` for missing files causes no runtime failure |
| `server/api/cmc/cmcConvergenceMap.ts:23` | String literal in a data structure, not an import |
| `server/src/services/ai-gateway/index.ts` (deleted) | Nothing in codebase imports from this path |
| `workers/artifact-compute/docx-python-runtime.py` reference | Runtime `path.resolve` only — not an import; Python runtime path, not a module |

---

## Action Items (Priority Order)

1. **High — `server/bootstrap/register-ai-routes.ts` line 24**: Split the try/catch so `workspace-tool-settings` failure doesn't block `firecrawl` and `external-evidence` mounts. Then remove the `workspace-tool-settings` import.

2. **High — `server/functions/*.ts`** (3 files): Either delete these dead-code files (they're not imported anywhere) or fix the imports to point to `server/openai-service.ts`. They currently block TypeScript compilation.

3. **Medium — `server/services/index.ts` line 30**: Remove the `export * as openaiService from './openai-service'` line. Nothing imports it, but it will fail `tsc`.

4. **Medium — `server/services/AssemblyLine.ts` line 60**: Fix the dynamic import path to `'../../openai-service'` (pointing to `server/openai-service.ts`) or remove the AI-polish feature.

5. **Low — `server/index.ts`** (10 broken dynamic imports): Each is wrapped in its own `try/catch` and logs an error. Routes are simply unavailable. Remove the dead mount code for: `csr_search_routes`, `fda-integration-simple`, `pubmed`, `literature-review`, `ectd-validate`, `multiAgencyValidation`, `validation`, `vault-auto`, `ai-completion`, `c2c-missing-routes`.
