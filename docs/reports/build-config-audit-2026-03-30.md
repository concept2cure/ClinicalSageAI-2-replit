# Build Configuration & Dependency Audit

**Date**: 2026-03-30
**Scope**: 6 recently-added files + overall build health

---

## 1. Target File Import Verification

### `server/services/connectors/box.ts` -- ALL IMPORTS RESOLVE
| Import | Source | Status |
|--------|--------|--------|
| `createScopedLogger` | `../../utils/logger.js` | OK -- `server/utils/logger.ts` exists |
| `DataConnector`, `ConnectorHealth`, etc. | `./connector-interface.js` | OK -- `server/services/connectors/connector-interface.ts` exists |

Note: Uses `.js` extension convention (ESM-compatible). Consistent with the project's `"type": "module"` setting.

### `server/routes/hallucination-check.ts` -- ALL IMPORTS RESOLVE
| Import | Source | Status |
|--------|--------|--------|
| `Router, Request, Response` | `express` | OK |
| `z` | `zod` | OK |
| `pool` | `../db` | OK -- exported from `server/db.ts` |
| `authMiddleware` | `../auth` | OK -- exported from `server/auth/index.ts` |
| `createScopedLogger` | `../utils/logger` | OK |
| `getEmbeddingService` (dynamic) | `../services/enhancedEmbeddingService.js` | OK -- file exists |
| Uses no `.js` extensions on static imports | | Inconsistent with some other routes, but works via `tsx` |

### `server/routes/comment-routes.ts` -- ALL IMPORTS RESOLVE
| Import | Source | Status |
|--------|--------|--------|
| `Router` | `express` | OK |
| `z` | `zod` | OK |
| `and, desc, eq, sql` | `drizzle-orm` | OK |
| `documentComments, documents` | `../../shared/schema` | OK -- both exported from `shared/schema.ts` via barrel |
| `authMiddleware` | `../auth` | OK |
| `db` | `../db` | OK |
| `createScopedLogger` | `../utils/logger` | OK |
| `getGateway` (dynamic) | `../services/ai-gateway/gateway.js` | OK -- file exists |

### `client/src/concept2cure/components/editor/INDAutoDraftWizard.tsx` -- ALL IMPORTS RESOLVE
| Import | Source | Status |
|--------|--------|--------|
| `Dialog`, `DialogContent`, etc. | `@/components/ui/dialog` | OK |
| `Button` | `@/components/ui/button` | OK |
| `Input` | `@/components/ui/input` | OK |
| `Checkbox` | `@/components/ui/checkbox` | OK |
| `Progress` | `@/components/ui/progress` | OK |
| lucide-react icons | `lucide-react` | OK |
| `apiRequest` | `@/lib/queryClient` | OK |

### `client/src/concept2cure/components/editor/CommentThread.tsx` -- ALL IMPORTS RESOLVE
| Import | Source | Status |
|--------|--------|--------|
| lucide-react icons | `lucide-react` | OK |
| `cn` | `@/lib/utils` | OK |
| `Button` | `@/components/ui/button` | OK |
| `apiRequest` | `@/lib/queryClient` | OK |

### `client/src/concept2cure/components/editor/SaveToDialog.tsx` -- ALL IMPORTS RESOLVE
| Import | Source | Status |
|--------|--------|--------|
| lucide-react icons | `lucide-react` | OK |
| `cn` | `@/lib/utils` | OK |
| `Button` | `@/components/ui/button` | OK |
| `Input` | `@/components/ui/input` | OK |
| `Select`, etc. | `@/components/ui/select` | OK |
| `apiRequest` | `@/lib/queryClient` | OK |
| `downloadBlob` | `../../hooks/useDocumentFactory` | OK -- exported from `useDocumentFactory.ts` |

---

## 2. Collaboration Packages -- All Present

All packages requested for verification are in `package.json` and installed:

| Package | Version in package.json | Installed |
|---------|------------------------|-----------|
| `yjs` | `13.6.30` | YES |
| `@hocuspocus/server` | `3.4.4` | YES |
| `@hocuspocus/provider` | `3.4.4` | YES |
| `@tiptap/extension-collaboration` | `3.21.0` | YES |
| `@tiptap/extension-collaboration-cursor` | `2.26.2` | YES |

---

## 3. Missing Packages (NOT in package.json, but imported in code)

These packages are imported somewhere in the codebase but are **not listed** in `package.json`:

| Missing Package | Imported By | Impact |
|----------------|-------------|--------|
| `@tiptap/extension-text-align` | `UnifiedDocumentEditor.tsx:38` | **Build error** -- editor will fail to load text-align |
| `@tiptap/extension-superscript` | `UnifiedDocumentEditor.tsx:39` | **Build error** -- editor will fail to load superscript |
| `@tiptap/extension-subscript` | `UnifiedDocumentEditor.tsx:40` | **Build error** -- editor will fail to load subscript |
| `@tiptap/extension-font-family` | `UnifiedDocumentEditor.tsx:42` | **Build error** -- editor will fail to load font-family |
| `@testing-library/user-event` | `SEMatrixV2Panel.test.tsx`, `ElectronicSignature.test.tsx` | Test-only -- tests will fail |
| `@emotion/react` | `client/src/design-system/motion.ts` | Design system motion utils broken |
| `@figma/code-connect` | `primitives.figma.tsx`, `domain.figma.tsx` | Dev tooling only -- Figma code connect won't work |
| `@storybook/react` | `button.stories.tsx` | Dev tooling only -- Storybook won't build |
| `citation-js` | `server/integrations/citationjs/client.ts` | Citation formatting broken at runtime |
| `react-dropzone` | `client/src/components/csr/CSRIngest.tsx` | CSR Ingest upload broken |

**High priority**: The 4 missing `@tiptap/extension-*` packages affect the core document editor (`UnifiedDocumentEditor.tsx`). These should be added to `package.json` immediately.

---

## 4. TypeScript Compilation Status

```
Total errors: 4,313
```

The 6 target files produce **zero TypeScript errors**. The errors are concentrated in older/peripheral code.

### Error Breakdown (top categories):

| Error Code | Count | Description |
|-----------|-------|-------------|
| TS2345 | 1,131 | Argument type mismatch |
| TS2339 | 1,059 | Property does not exist on type |
| TS2769 | 286 | No overload matches this call |
| TS7006 | 277 | Parameter implicitly has 'any' type |
| TS2322 | 249 | Type not assignable |
| TS18046 | 185 | Variable is of type 'unknown' |
| TS2304 | 156 | Cannot find name |
| TS2307 | 59 | Cannot find module |
| TS2614 | 47 | Module has no exported member |

### Missing Module Errors (TS2307) -- 59 occurrences across these files:
- `shared/types/predicate-intelligence` -- path resolution issue (file exists at `shared/types/predicate-intelligence.ts` but 8 imports use relative paths like `../../../shared/types/...` that don't resolve correctly from `client/src/components/predicate/`)
- `@/assets/concept2cure-logo.jpg` -- asset file may be missing or needs a declaration file
- `../widgets/RecentActivityFeed` and `../widgets/ProjectStatusWidget` -- missing widget files in client-portal
- `../pages/CERV2Page` -- missing page module
- Industry index re-exports 5 missing modules (`BiotechProgramDashboard`, `PharmaPortfolioDashboard`, etc.)

---

## 5. Duplicate / Version Conflict Dependencies

### @smithy packages (peer dependency conflicts with @langchain/community)
`@langchain/community` expects `@smithy/protocol-http@^3.0.6` and `@smithy/signature-v4@^2.0.10` but the installed versions are `@smithy/protocol-http@5.3.12` and `@smithy/signature-v4@5.3.12` (pulled in by `@aws-sdk/*@3.758.0`).

**Impact**: May cause runtime issues with LangChain community integrations that use AWS services. The AWS SDK v3 and LangChain community packages need version alignment.

**No other duplicate dependency issues** were detected at the top level.

---

## 6. Import Path Consistency

The server codebase has **mixed conventions** for `.js` extensions on imports:
- Some files (e.g., `box.ts`) use `.js` extensions: `from './connector-interface.js'`
- Other files (e.g., `hallucination-check.ts`, `comment-routes.ts`) use bare paths: `from '../auth'`

Both conventions work because:
- `tsx` (dev runtime) resolves both
- Dynamic imports in the hallucination-check and comment-routes files use `.js` extensions correctly

This is not a blocking issue but creates inconsistency.

---

## Summary of Issues Found

### Critical (will cause runtime failures):
1. **4 missing `@tiptap/extension-*` packages** -- `text-align`, `superscript`, `subscript`, `font-family` -- needed by `UnifiedDocumentEditor.tsx`
2. **Missing `react-dropzone`** -- needed by `CSRIngest.tsx`
3. **Missing `citation-js`** -- needed by `server/integrations/citationjs/client.ts`

### Moderate (feature-level impact):
4. **@smithy version conflicts** with `@langchain/community` peer dependencies
5. **Missing `@emotion/react`** -- design system motion utilities broken

### Low (dev tooling / test only):
6. **Missing `@testing-library/user-event`** -- 2 test files affected
7. **Missing `@storybook/react`** -- Storybook won't build
8. **Missing `@figma/code-connect`** -- Figma code connect won't work
9. **5 missing industry dashboard modules** -- re-exported from `industry/index.ts` but files don't exist

### Informational:
10. **4,313 TypeScript errors** across the codebase (none in the 6 audited files)
11. **Mixed `.js` extension conventions** in server imports
