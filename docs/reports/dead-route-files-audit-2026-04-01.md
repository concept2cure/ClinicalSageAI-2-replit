# Dead Route Files Audit — `server/routes/`

**Date:** 2026-04-01
**Auditor:** Automated forensic dead-code audit
**Method:** Full codebase search (ripgrep) for every `.js` file in `server/routes/` and every `.ts` file in `server/routes/reports/`. A file is marked DEAD if no other `.ts` or `.js` file in the codebase imports, requires, or dynamically loads it.

---

## Summary

| Category | Count | Lines | Bytes |
|----------|-------|-------|-------|
| **DEAD files** | **21** | **6,789** | **217,087** |
| ALIVE files | **11** | **4,557** | **125,154** |
| **Total audited** | **32** | **11,346** | **342,241** |

---

## Full Audit Table

### `server/routes/*.js` (25 files)

| # | File | Lines | Bytes | Status | Imported By |
|---|------|-------|-------|--------|-------------|
| 1 | `server/routes/atoms.js` | 259 | 6,049 | **ALIVE** | `server/index.ts:1766` (dynamic import) |
| 2 | `server/routes/biotech-rag.js` | 1,117 | 31,282 | **ALIVE** | `server/index.ts:1120` (dynamic import) |
| 3 | `server/routes/content-plan.js` | 274 | 8,254 | **ALIVE** | `server/index.ts:1614` (lazy route loader) |
| 4 | `server/routes/contextual-guidance.js` | 113 | 2,893 | **DEAD** | — |
| 5 | `server/routes/device-data-center.js` | 682 | 22,860 | **DEAD** | — (superseded by `document-data-center.ts`) |
| 6 | `server/routes/doe.js` | 476 | 11,829 | **DEAD** | — |
| 7 | `server/routes/esgSubmission.js` | 240 | 6,413 | **DEAD** | — (superseded by `esgSubmissionRoutes.ts`) |
| 8 | `server/routes/folder-management.js` | 136 | 3,855 | **ALIVE** | `server/index.ts:1877` (dynamic import) |
| 9 | `server/routes/indWizardAPI.js` | 619 | 20,774 | **DEAD** | — |
| 10 | `server/routes/internal-clinical-data.js` | 404 | 11,404 | **DEAD** | — |
| 11 | `server/routes/leaves.js` | 440 | 13,277 | **ALIVE** | `server/index.ts:7004` (dynamic import) |
| 12 | `server/routes/license-routes.js` | 664 | 22,852 | **ALIVE** | `server/index.ts:1431` (lazy route loader) |
| 13 | `server/routes/mashable-bi.js` | 405 | 11,740 | **DEAD** | — (client hits `/api/mashable-bi/*` but this file is never mounted) |
| 14 | `server/routes/medical-device-routes.js` | 664 | 19,621 | **ALIVE** | `server/index.ts:1137` (dynamic import) |
| 15 | `server/routes/meta.js` | 296 | 8,295 | **DEAD** | — |
| 16 | `server/routes/ocr-routes.js` | 229 | 5,354 | **DEAD** | — |
| 17 | `server/routes/promo.js` | 81 | 2,606 | **DEAD** | — |
| 18 | `server/routes/rate-limiter.js` | 79 | 2,462 | **DEAD** | — |
| 19 | `server/routes/real-predictive-analytics.js` | 169 | 4,023 | **DEAD** | — |
| 20 | `server/routes/reference-model.js` | 526 | 14,099 | **DEAD** | — (client hits `/api/reference-model/*` but this file is never mounted) |
| 21 | `server/routes/similar-goals-routes.js` | 375 | 10,876 | **DEAD** | — |
| 22 | `server/routes/smart-blocks.js` | 503 | 15,893 | **ALIVE** | `server/index.ts:1615` (lazy route loader) |
| 23 | `server/routes/sota-api.js` | 160 | 4,904 | **DEAD** | — |
| 24 | `server/routes/vault-dms.js` | 1,000 | 34,286 | **DEAD** | — |
| 25 | `server/routes/vectorSearch.js` | 96 | 2,508 | **DEAD** | — |

### `server/routes/cer/*.js` (4 files)

| # | File | Lines | Bytes | Status | Imported By |
|---|------|-------|-------|--------|-------------|
| 26 | `server/routes/cer/assistant.js` | 160 | 5,350 | **DEAD** | — (`cer-routes.ts` does NOT import these) |
| 27 | `server/routes/cer/complianceScore.js` | 119 | 4,451 | **DEAD** | — |
| 28 | `server/routes/cer/generateFullCER.js` | 332 | 12,063 | **DEAD** | — |
| 29 | `server/routes/cer/improveCompliance.js` | 110 | 3,993 | **DEAD** | — |

### `server/routes/reports/*.ts` (3 files)

| # | File | Lines | Bytes | Status | Imported By |
|---|------|-------|-------|--------|-------------|
| 30 | `server/routes/reports/generate-report.ts` | 242 | 6,226 | **ALIVE** | `server/index.ts:135` (static import) |
| 31 | `server/routes/reports/manifest-routes.ts` | 190 | 5,948 | **ALIVE** | `server/index.ts:134` (static import) |
| 32 | `server/routes/reports/subscriptions-routes.ts` | 186 | 5,801 | **ALIVE** | `server/index.ts:136` (static import) |

---

## DEAD Files — Deletion Candidates (21 files, 6,789 lines, ~217 KB)

```
server/routes/contextual-guidance.js        113 lines    2,893 bytes
server/routes/device-data-center.js         682 lines   22,860 bytes
server/routes/doe.js                        476 lines   11,829 bytes
server/routes/esgSubmission.js              240 lines    6,413 bytes
server/routes/indWizardAPI.js               619 lines   20,774 bytes
server/routes/internal-clinical-data.js     404 lines   11,404 bytes
server/routes/mashable-bi.js                405 lines   11,740 bytes
server/routes/meta.js                       296 lines    8,295 bytes
server/routes/ocr-routes.js                 229 lines    5,354 bytes
server/routes/promo.js                       81 lines    2,606 bytes
server/routes/rate-limiter.js                79 lines    2,462 bytes
server/routes/real-predictive-analytics.js  169 lines    4,023 bytes
server/routes/reference-model.js            526 lines   14,099 bytes
server/routes/similar-goals-routes.js       375 lines   10,876 bytes
server/routes/sota-api.js                   160 lines    4,904 bytes
server/routes/vault-dms.js                1,000 lines   34,286 bytes
server/routes/vectorSearch.js                96 lines    2,508 bytes
server/routes/cer/assistant.js              160 lines    5,350 bytes
server/routes/cer/complianceScore.js        119 lines    4,451 bytes
server/routes/cer/generateFullCER.js        332 lines   12,063 bytes
server/routes/cer/improveCompliance.js      110 lines    3,993 bytes
```

---

## Notes

1. **`device-data-center.js`** was superseded by `document-data-center.ts` — `index.ts` imports the `.ts` version and mounts it on `/api/device-data-center`.
2. **`esgSubmission.js`** was superseded by `esgSubmissionRoutes.ts` — `index.ts` imports the `.ts` version.
3. **`mashable-bi.js`** and **`reference-model.js`** have client-side code hitting their API paths, but the route files themselves are never imported/mounted by `server/index.ts` or any other server file. The API endpoints they define are unreachable.
4. **`contextual-guidance.js`** has a separate implementation at `server/api/ai/routes.ts:497` (POST `/contextual-guidance`). The standalone `.js` file is orphaned.
5. **All 4 `cer/*.js` files** are orphaned — `cer-routes.ts` (which IS loaded by `index.ts`) is a completely independent implementation that does not import them.
6. **All 3 `reports/*.ts` files** are ALIVE — statically imported at the top of `server/index.ts`.
