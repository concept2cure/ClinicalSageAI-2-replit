# Duplicate Basenames — Canonical File Map

**Date:** 2026-04-06
**Source:** `docs/reports/platform-full-audit-2026-04-01.md` (Wave 1)
**Original count:** 38 duplicate basenames (as of 2026-04-01)
**Current count:** 24 duplicate basenames (as of 2026-04-06, pre-cleanup)
**Post-cleanup count:** 7 remaining (all server-side, ALIVE with importers)

---

## Deleted Files (17 — confirmed dead, zero importers)

| # | Deleted File | Canonical Replacement | Importers |
|---|-------------|----------------------|-----------|
| 1 | `client/src/components/ui/alert.jsx` | `alert.tsx` | 78 extensionless → .tsx |
| 2 | `client/src/components/ui/collapsible.jsx` | `collapsible.tsx` | 9 extensionless → .tsx |
| 3 | `client/src/components/ui/dropdown-menu.jsx` | `dropdown-menu.tsx` | 30 extensionless → .tsx |
| 4 | `client/src/components/ui/progress.jsx` | `progress.tsx` | 138 extensionless → .tsx |
| 5 | `client/src/components/ui/radio-group.jsx` | `radio-group.tsx` | 7 extensionless → .tsx |
| 6 | `client/src/components/ui/tabs.jsx` | `tabs.tsx` | 185 extensionless → .tsx |
| 7 | `client/src/components/ui/textarea.jsx` | `textarea.tsx` | 116 extensionless → .tsx |
| 8 | `client/src/components/ui/toast.jsx` | `toast.tsx` | 2 extensionless → .tsx |
| 9 | `client/src/components/ui/toaster.jsx` | `toaster.tsx` | 45 extensionless → .tsx |
| 10 | `client/src/hooks/use-toast.js` | `use-toast.ts` | 113+ extensionless → .ts |
| 11 | `client/src/hooks/use-toast.jsx` | `use-toast.tsx` | Same — .tsx wins in Vite |
| 12 | `client/src/hooks/useQCWebSocket.js` | `useQCWebSocket.ts` | Zero importers |
| 13 | `client/src/lib/ui-utils.js` | `ui-utils.ts` | Zero importers |
| 14 | `client/src/lib/utils.js` | `utils.ts` | 19 extensionless → .ts |
| 15 | `client/src/utils/axiosWithToken.js` | `axiosWithToken.ts` | Zero importers |
| 16 | `client/src/components/csr/CSRSearchBar.jsx` | `CSRSearchBar.tsx` | Zero importers |
| 17 | `server/utils/database-optimizer.js` | `database-optimizer.ts` | Zero importers |

**Proof method:** Vite resolves `.ts`/`.tsx` before `.js`/`.jsx` for extensionless imports. All client imports use extensionless paths (e.g., `from '@/components/ui/alert'`). Zero explicit `.jsx` extension imports found in client code.

---

## Remaining Duplicates (3 — ALIVE, server-side)

Re-verified 2026-09-03 against the working tree. Four of the seven rows this
section used to carry no longer exist: `server/middleware/tenantContext.js`,
`server/middleware/validation.js` and `client/src/lib/queryClient.js` were
deleted by earlier consolidation, and `server/config/docushareConfig.js` was
deleted with its sole importer (see below). The remaining three are the ones
`scripts/ci/check-js-ts-shadows.mjs` allowlists as content-diverged.

| # | JS File | TS File | Why ALIVE |
|---|---------|---------|-----------|
| 1 | `server/db.js` | `server/db.ts` | 20+ explicit `from '../db.js'` imports in .ts and .js files |
| 2 | `server/middleware/auth.js` | `server/middleware/auth.ts` | Exports `hasPermission`/`verifyJwt` not in .ts version; many explicit .js imports |
| 3 | `server/utils/logger.js` | `server/utils/logger.ts` | Many .ts and .js files import with explicit .js |

### Removed: `server/config/docushareConfig.js`

This row previously read "ALIVE — imported by `docushareHealthCheck.js`". That
was true as a fact about the import graph and false as a conclusion about
liveness: `server/utils/docushareHealthCheck.js` was itself imported by
nothing, so the `.js` config was reachable only from an unreferenced module.
Both files are deleted; `server/config/docushareConfig.ts` remains and is what
`server/config/index.ts` resolves. The matching `check-js-ts-shadows.mjs`
allowlist entry, which carried the same wrong justification, is removed with
them.

**Action for Wave 2:** Merge JS→TS for each, update all importers to use .ts paths, then delete .js.

---

## Success Metrics

| Metric | Before | After | Target |
|--------|--------|-------|--------|
| Duplicate basenames | 24 | 7 | 25-40% reduction |
| Reduction | — | **70.8%** | **EXCEEDS target** |
| Client duplicates | 17 | 1 | — |
| Server duplicates | 7 | 6 | — |
| Files deleted | — | 17 | — |
| Regressions | — | 0 | 0 |
