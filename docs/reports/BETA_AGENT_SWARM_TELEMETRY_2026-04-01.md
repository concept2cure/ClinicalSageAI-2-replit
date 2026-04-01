# Beta Agent Swarm Telemetry — 2026-04-01

## Objective

Run a guided multi-lane QA swarm for beta-critical paths and fail closed on findings:

1. Onboarding + guided demo flow  
2. Project creation/bootstrap  
3. Governed authoring workflow  
4. Governed export behavior  
5. Route-risk telemetry (mount conflicts / shadow-risk)

## Swarm Lanes & Commands

### Lane A — Route Governance / Merge-path guardrails

- `npm run ci:audit-route-mounts:no-regression`
- `npm run ci:route-ownership-matrix`
- `npm run ci:route-ownership-matrix:check`
- `npm run audit:repo-health:no-regression`

### Lane B — Guided user journey tests

- `npx vitest run tests/guided-demo-path.test.ts`
- `npx vitest run tests/routes/concept2cure-project-bootstrap.test.ts`

### Lane C — Authoring + Export governance tests

- `npx vitest run tests/resolution/e2e-authoring-workflow.test.ts`
- `npx vitest run tests/routes/governed-export-e2e.test.ts`
- `npx vitest run tests/routes/export-routes-governance.test.ts`
- `npx vitest run tests/routes/project-modules-tenant.test.ts`

## Findings & Fixes Applied

1. **Shadow-risk prefixes detected (`/api/csr`, `/api/atoms`)**
   - Cause: inline `app.get()` handlers shadowed router-owned namespaces.
   - Fix:
     - removed inline handlers from `server/index.ts`.
     - added canonical `GET /` status endpoint to `server/routes/csr-builder-routes.ts`.
   - Result: no shadow-risk warnings remain in route-mount audit (warnings reduced to multi-use prefixes only).

2. **Duplicate mount surfaces (`/api/documents`, `/api/ivdr`, `/api/programs`, `/api/projects`)**
   - Cause: version diff, unified documents, source links, and intelligence routers were mounted separately under the same prefix.
   - Fix:
     - consolidated document routes into a single `/api/documents` gateway mount,
     - consolidated IVDR routes into a single `/api/ivdr` gateway mount,
     - consolidated program routes into a single `/api/programs` gateway mount,
     - moved project-module nested mount to `/api` alias router (keeps `/api/projects/:id/modules` path while removing duplicate `/api/projects` mount).
   - Result: route-mount warnings reduced from 6 to 1 in the latest pass.

3. **Project bootstrap test failures (module resolution)**
   - Failing test: `tests/routes/concept2cure-project-bootstrap.test.ts` (`buildInstructionsFromLegacyType`).
   - Cause: runtime `require()` path resolution mismatch for legacy mapper/global registry.
   - Fix: converted to static ESM imports in `server/services/regulatory/defaultInstructionBuilder.ts`.
   - Result: test file now fully green.

4. **QA noise in package metadata**
   - Cause: duplicate `jsdom` key in `package.json`.
   - Fix: removed duplicate entry.
   - Result: duplicate-key warning removed from vitest startup.

5. **Missing runtime telemetry lane for guided beta flows**
   - Cause: prior pass relied primarily on static/test telemetry without runtime request rollups.
   - Fix:
     - added beta flow telemetry middleware + aggregation service,
     - added authenticated endpoint `GET /api/ops/beta-telemetry` for operator snapshots,
     - enforced fail-closed controls: in production, endpoint requires `ENABLE_BETA_OPS_TELEMETRY=true`; reset requires admin/super_admin + explicit confirmation header + audit reason (min 10 chars); `include_errors` requires admin role.
   - Result: onboarding/project creation/authoring/export error-rate telemetry is now available at runtime.

## Telemetry Snapshot (post-fix)

- Route mount telemetry:
  - mounts scanned: **234**
  - errors: **0**
  - warnings: **0** (no shadow-risk, no unexpected multi-use prefixes)
- Repo-health no-regression:
  - duplicate basenames delta: **-4 vs baseline**
  - files over byte threshold delta: **0**
  - files over line threshold delta: **0**
- Guided beta suites:
  - test files: **8 passed / 8**
  - tests: **104 passed / 104**
  - failures: **0**

## Beta Gate Decision

**PASS (controlled beta lane):** onboarding/project bootstrap, governed authoring, and governed export are green under the current strict telemetry run; route-shadowing findings discovered in this pass were remediated in-code before gate close.
