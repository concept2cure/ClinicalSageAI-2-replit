# Beta-Readiness Audit Report

**Date**: 2026-03-30
**Scope**: Full cleanup, cost, responsiveness, professionalism, and security pass
**Branch**: `claude/beta-readiness-cleanup-cMtzs`

---

## 1. Blunt Truth About Repo Health

This is a massive enterprise platform (~5,700 files, 170 dependencies, 2,300+ TypeScript files) that has been through significant consolidation and is architecturally sound. However, it carries meaningful dead weight: 1,095 console.log statements in server code, 5 dead dependencies (40MB+ of unused packages), 16 archived files that were never deleted, dual ORM systems (Drizzle + Prisma), 5 PDF libraries, dual crypto libraries (bcrypt + bcryptjs), and 27 npm vulnerabilities (2 critical, 7 high) before this cleanup. The ESLint flat config was permissive (no-console off, no security rules). Bundle splitting missed ~1.5MB of heavy libraries (Tiptap, Yjs, Socket.io, Lucide). The existing CI is strong (18 workflows, Semgrep, CodeQL, Trivy, Husky hooks), but lacked dead-code detection (Knip) and bundle analysis tooling. After this session: 0 critical vulns, 1 high (down from 9), 3,004 lines of dead code deleted, 5 dead deps removed, ESLint tightened, bundle splitting improved, and Knip + bundle visualizer added.

---

## 2. Tooling Gap Matrix

| Tool | Status | Details |
|------|--------|---------|
| **ESLint** | Already present, **tightened now** | Dual config (.eslintrc.cjs + eslint.config.js). Flat config was weak — now tightened with no-console warn, no-debugger error, no-eval error, prefer-const, eqeqeq, no-restricted-imports |
| **Reviewdog** | **Deferred** | Not present. Would add PR review annotations but requires GitHub Actions write access and token setup. Recommend adding in next CI sprint |
| **Knip** | **Added now** | knip.json created, `audit:dead-code` npm script added. Cannot fully run due to missing drizzle-kit in node_modules, but config is ready for CI |
| **Semgrep CE** | Already present | `.github/workflows/semgrep.yml` + pr-checks.yml. Weekly schedule + PR triggers. SARIF upload to GitHub Security tab |
| **Bundle Analysis** | **Added now** | rollup-plugin-visualizer installed, integrated in vite.config.ts. Run with `ANALYZE=true npm run build` or `npm run audit:bundle` |
| **Lighthouse CI** | Partially present | `lighthouse-ci.json` exists, runs in staging deploy workflow only. Not in main CI |
| **OSV-Scanner** | **Skipped** | npm audit + Trivy + CodeQL already provide equivalent vulnerability scanning. Adding OSV-Scanner would be redundant |
| **Existing Audit Scripts** | Already present | `scripts/audits/` — PR wiring audits, build plans, artifact pruning. Strong existing infrastructure |

---

## 3. Top 30 Findings Ranked by Impact

### P0 — Must Fix Before Beta

| # | Finding | Impact | Files | Status |
|---|---------|--------|-------|--------|
| 1 | **2 critical + 7 high npm vulnerabilities** (handlebars, jspdf, socket.io-parser, express-rate-limit, path-to-regexp, picomatch, fast-xml-parser, flatted, @aws-sdk/xml-builder) | Security, trust | `package.json`, `package-lock.json` | **FIXED** — now 0 critical, 1 high |
| 2 | **1,095 console.log in server code** — exposes internal state, fills logs, costs money on log aggregation | Cost, security, professionalism | `server/index.ts` (261), `server/routes/clients-routes.ts` (26), `server/data-importer.ts` (28), 50+ other files | Remaining — needs structured logger migration |
| 3 | **9 "Coming Soon" placeholders in production UI** | Professionalism | `client/src/components/foresight/PhaseJourneyNavigator.tsx`, `client/src/concept2cure/components/quality/SOPManagement.tsx`, `client/src/concept2cure/components/regulatory/CAPAManagement.tsx`, `client/src/concept2cure/components/regulatory/PostMarketSurveillance.tsx`, `client/src/concept2cure/components/regulatory/InspectionReadiness.tsx`, `client/src/concept2cure/components/enablement/AgentShowcase.tsx`, `client/src/concept2cure/demo/UnifiedWorkspaceDemo.tsx` | Remaining |
| 4 | **Unbounded database queries** — list endpoints without LIMIT | Reliability, cost | `server/routes/clients-routes.ts`, `server/routes/concept2cure.ts` (20+ unbounded selects) | Remaining |
| 5 | **`@huggingface/inference`** listed but barely used | Cost (install time), attack surface | `package.json`, `shared/types/third-party.d.ts` | Remaining — verify before removing |
| 6 | **`@google/generative-ai`** imported in server/index.ts but minimally used | Bundle bloat, cost | `server/index.ts`, `server/services/nanoBananaService.ts`, `server/types/global.d.ts` | Remaining — verify before removing |

### P1 — Should Fix Before Beta

| # | Finding | Impact | Files | Status |
|---|---------|--------|-------|--------|
| 7 | **5 dead dependencies removed** (@supabase/supabase-js, react-grid-heatmap, react-heatmap-grid, ml-stat, react-toastify) | Bundle size (-40MB+), install time, attack surface | `package.json` | **FIXED** |
| 8 | **16 archived files deleted** (3,004 lines) | Repo hygiene, confusion | `server/_archived/*` (12 files), `server/middleware/_archived/*` (4 files) | **FIXED** |
| 9 | **2 orphaned heatmap components deleted** | Dead code | `client/src/components/EndpointFrequencyHeatmap.tsx`, `client/src/components/TagCorrelationHeatmap.tsx` | **FIXED** |
| 10 | **Bundle splitting improved** — Tiptap, Yjs/Socket.io, Lucide icons split into separate chunks | Responsiveness (-1.5MB from main bundle) | `vite.config.ts` | **FIXED** |
| 11 | **Dual crypto libraries** (bcrypt + bcryptjs) | Confusion, inconsistency | `package.json` — bcrypt has 0 imports, bcryptjs used in 4 files | Remaining — remove `bcrypt` native |
| 12 | **5 PDF libraries** (pdfkit, jspdf, pdf-lib, pdf-parse, html2pdf.js) | Complexity, bundle size | `package.json` | Remaining — audit which are actually used |
| 13 | **Dual ORM** (Drizzle + Prisma) | Complexity, memory, confusion | `package.json` — Prisma @7.5.0 but primary ORM is Drizzle | Remaining — verify Prisma usage |
| 14 | **Dual date libraries** (date-fns + dayjs) | Bundle size (-10KB) | `server/src/routes/stability.router.ts`, `client/src/routes/stability/SamplingWorkbench.tsx` | Remaining — migrate 2 files from dayjs to date-fns |
| 15 | **`googleapis` (^133.0.0)** — 40MB package for 3 barely-used integration files | Cost, install time | `server/src/services/integrations/gcal.ts`, `server/src/services/integrations/gmail.ts`, `server/src/services/calendar.ts` | Remaining |
| 16 | **17 files using axios in server** (should use standardized approach) | Consistency, maintainability | `server/services/fdaIntegrationService.ts`, `server/services/ana-cortex-service.ts`, `server/services/DocuShareAPIClient.ts`, 14+ others | Remaining |
| 17 | **ESLint flat config tightened** — no-console warn, no-debugger/eval/alert error, prefer-const, eqeqeq, no-restricted-imports | Professionalism, safety | `eslint.config.js` | **FIXED** |
| 18 | **Bundle analysis tooling added** — rollup-plugin-visualizer | Visibility | `vite.config.ts`, `package.json` | **FIXED** |
| 19 | **Knip config added** for dead code detection | CI quality | `knip.json`, `package.json` (audit:dead-code script) | **FIXED** |
| 20 | **8 unknown setInterval/polling instances** in server code | CPU/memory cost | `server/routes/ivdr-routes.ts`, `server/routes/fda510k-routes.ts`, `server/initializers/performanceOptimizer.ts`, `server/routes/fda510k-unified.ts`, `server/routes/contentAssembly.routes.ts`, `server/routes/auth.ts`, `server/services/ai-gateway/gateway.ts`, `server/services/fdaIntegrationService.ts` | Remaining — need review |

### P2 — Can Defer Until After Beta

| # | Finding | Impact | Files | Status |
|---|---------|--------|-------|--------|
| 21 | **61 TODO/FIXME comments** across codebase | Technical debt tracking | 20 in server, 41 in client | Remaining |
| 22 | **2 empty onClick handlers** (dead buttons) | UX | `client/src/components/validator/ValidatorRunner.tsx:656`, `client/src/concept2cure/components/workspace/RegulatoryTransformCanvas.tsx:395` | Remaining |
| 23 | **firebase (12.11.0)** — used for collaboration but adds ~150KB | Bundle size | 3 client hooks + 2 server services | Remaining — actively used |
| 24 | **Dual ESLint configs** (.eslintrc.cjs + eslint.config.js) | Confusion | Root directory | Remaining — consolidate to flat config when ready for ESLint 9 |
| 25 | **Dual test frameworks** (Jest + Vitest) | Complexity | 3 jest.config.js + vitest.config.ts | Remaining — migrate to Vitest only |
| 26 | **Puppeteer-cluster memory** (200-300MB baseline) | Hosting cost | `server/export/renderers.ts` | Remaining — monitor, add dynamic scaling |
| 27 | **410 useState-per-field patterns** in forms | React Hook Form migration opportunity | Various client components | Remaining — refactor opportunistically |
| 28 | **Lighthouse CI only in staging deploy** — not in main CI | Quality visibility | `.github/workflows/cerv2-staging-deploy.yml` | Remaining — add to main CI |
| 29 | **reviewdog not configured** for PR annotations | Review automation | N/A | Remaining |
| 30 | **Heatmap type declaration removed** | Cleanup | `shared/types/third-party.d.ts` | **FIXED** |

---

## 4. Exact Files Changed

| File | Change |
|------|--------|
| `package.json` | Removed 5 dead deps (@supabase/supabase-js, react-grid-heatmap, react-heatmap-grid, ml-stat, react-toastify). Added rollup-plugin-visualizer devDep. Added `audit:dead-code` and `audit:bundle` scripts |
| `package-lock.json` | Synced with package.json changes. npm audit fix applied (27 vulns -> 16, 2 critical -> 0) |
| `eslint.config.js` | Added: no-console warn, no-debugger error, no-alert error, no-eval error, no-implied-eval error, prefer-const warn, no-var error, eqeqeq warn, no-restricted-imports for deprecated states |
| `vite.config.ts` | Added rollup-plugin-visualizer (conditional on ANALYZE=true). Added 3 new manual chunks: vendor-tiptap, vendor-realtime, vendor-icons |
| `knip.json` | **New file** — Knip dead code detection config |
| `shared/types/third-party.d.ts` | Removed react-heatmap-grid type declarations (package removed) |
| `client/src/components/EndpointFrequencyHeatmap.tsx` | **Deleted** — orphaned component, never imported |
| `client/src/components/TagCorrelationHeatmap.tsx` | **Deleted** — orphaned component, never imported |
| `server/_archived/*` (12 files) | **Deleted** — archived legacy code, never imported |
| `server/middleware/_archived/*` (4 files) | **Deleted** — archived middleware, never imported |

**Total: 22 files changed, 38 insertions, 3,004 deletions**

---

## 5. What Was Intentionally NOT Added and Why

| Tool/Change | Why Not |
|-------------|---------|
| **OSV-Scanner** | npm audit + Trivy + CodeQL already cover this. Would be redundant noise |
| **reviewdog** | Requires GitHub Actions token configuration and repo admin setup. Recommend for next CI sprint, not this cleanup |
| **Lighthouse CI in main CI** | Requires a running app server during CI. Current staging-only setup is acceptable for beta |
| **Console.log mass removal** | 1,095 instances across 50+ files. Too risky for a single pass — needs structured logger migration plan with file-by-file verification |
| **Prisma removal** | Need to verify zero active usage before removing. Risk of breaking something |
| **googleapis removal** | Used in connector integrations (Google Drive, Calendar, Gmail). May be needed for enterprise features |
| **bcrypt removal** | Zero imports found but need to verify no dynamic requires before removing |
| **Major refactors** | Not appropriate for a cleanup pass. Each of these (ORM consolidation, PDF library consolidation, axios standardization) deserves its own focused PR |

---

## 6. Smallest Safe Fix Plan for Remaining Issues

### Immediate next session (2-3 hours):
1. Remove `bcrypt` native (0 imports confirmed, everything uses bcryptjs)
2. Remove `react-grid-heatmap`, `react-heatmap-grid` from node_modules (already removed from package.json)
3. Replace 9 "Coming Soon" strings with either real feature gates or remove the UI elements
4. Fix 2 empty onClick handlers
5. Add `.limit(100)` to the most obvious unbounded queries in `clients-routes.ts`

### Next CI sprint (1 day):
1. Add reviewdog to PR workflow
2. Move Lighthouse CI into main CI pipeline
3. Install drizzle-kit devDep so Knip can run fully
4. Consolidate to single ESLint config (flat)

### Structured migration (1-2 weeks):
1. Replace console.log with structured logger (server/utils/logger.ts already exists)
2. Audit and consolidate PDF libraries
3. Verify and remove Prisma if unused
4. Migrate 2 dayjs files to date-fns
5. Standardize axios usage in server code

---

## 7. Beta Blockers

These items **must be resolved** before beta:

1. ~~Critical npm vulnerabilities~~ **FIXED**
2. **"Coming Soon" placeholders** — users will see unfinished features (9 locations)
3. **Unbounded database queries** — a single large organization could trigger OOM/timeout
4. **console.log in production** — leaks internal state to browser devtools and log aggregators

Everything else is quality-of-life and professionalism that won't block beta functionality but will affect perception.

---

## 8. Vulnerability Summary

| Before | After |
|--------|-------|
| 27 total | 16 total |
| 2 critical | 0 critical |
| 7 high | 1 high |
| 13 moderate | 11 moderate |
| 5 low | 4 low |

**Remaining 1 high**: `langsmith` SSRF via tracing header injection — fix requires breaking change to `@langchain/community`. Recommend upgrading in a dedicated LangChain update PR.

---

*Generated by beta-readiness cleanup pass, 2026-03-30*
