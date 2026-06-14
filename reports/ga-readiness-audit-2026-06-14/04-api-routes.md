# GA Readiness Audit — API & Route Contracts

Date: 2026-06-14
Auditor: API & Route-Contract specialist
Scope: `server/routes/` (374 files), `server/api/`, `server/controllers/`, OpenAPI specs (`submission-center.openapi.json`, `ivd-platform.openapi.json`). React client and raw DB excluded.
Method: NET-NEW from source. Greps for handler decls, mock/stub markers, validation usage, plus the project's own CI audit scripts (`ci:no-mock-in-prod-routes`, `audit:orphaned-endpoints`, `ci:audit-route-mounts`).

---

## Executive Summary

The API surface is large (846 declared endpoints across ~365 handler-bearing route files) and is composed through a delegated bootstrap layer (`server/startup/routes.ts` → ~16 `register*Routes` functions in `server/bootstrap/`). Three systemic GA risks dominate:

1. **Mock / placeholder data shipping in production routes.** The project's own `ci:no-mock-in-prod-routes` guard passes only because **44 route files are whitelisted in a baseline** (`docs/reports/no-mock-in-prod-routes-baseline.json`). These are accepted, not fixed. Plus 4 NET-NEW files now exceed the baseline (agent-swarm, cro, fda510k-unified, ivd-lifecycle). That is up to **48 production route files containing mock/simulated/placeholder responses** — including customer-facing regulatory surfaces (510k, CER, IND, manufacturing, quality-management). [BLOCKER]

2. **The route-mount integrity audit is blind.** `ci:audit-route-mounts` targets `server/index.ts` and reports `Total captured mounts: 0` — but mounting actually happens in `server/startup/routes.ts` and the `server/bootstrap/register-*.ts` files. The CI gate guarding mount integrity currently validates nothing. [HIGH]

3. **Validation coverage is partial.** Only ~135 of ~365 handler-bearing route files import zod; 0 use express-validator/joi. The remaining ~230 files read `req.body`/`req.params`/`req.query` with no schema validation at the boundary. [HIGH]

4. **659 of 846 declared endpoints are orphaned** (no detected consumer). Even discounting external/public API surface, this signals large undocumented/untested API surface and contract-drift risk. [MEDIUM]

**Verdict: NOT READY** (conditional path exists — see remediation). Detail and severity-tagged findings below; written incrementally.

---

## Severity counts (running)

_To be finalized at end._

---

## Findings (incremental)

### [BLOCKER] Mock / placeholder responses in production route handlers

Source: `npm run ci:no-mock-in-prod-routes`.

- Guard PASSES only because a **44-file baseline whitelist** suppresses known offenders: `docs/reports/no-mock-in-prod-routes-baseline.json`.
- NET-NEW findings now beyond baseline (script output 2026-06-14):
  - `server/routes/agent-swarm.ts`
  - `server/routes/cro.ts`
  - `server/routes/fda510k-unified.ts`
  - `server/routes/ivd-lifecycle.ts`
- Baseline-whitelisted, customer-facing regulatory examples include: `510k-compliance-routes.ts`, `510kEstarRoutes.ts`, `510kRoutes.ts`, `cer-routes.ts`, `cerv2-ai-routes.ts`, `cerv2-export-routes.ts`, `ind-pdf.ts`, `ind-database.routes.ts`, `manufacturing-routes.ts`, `quality-management-api.ts`, `predictive-sections.ts`, `real-world-evidence.ts`, `regulatoryRoutes.ts`, `nonclinicalRoutes.ts`, `sap_routes.ts`, `auth.ts`.

Impact: customers on a regulated submission/IVD platform may receive fabricated/sample data presented as real analysis (510k compliance checks, CER content, RWE, predictive sections). This is the single highest GA risk — both a trust and a regulatory (data integrity / 21 CFR Part 11) exposure.

Fix: triage each of the 48 files; for each mock branch either (a) gate behind an explicit demo flag that is OFF in prod and returns 501/404 when disabled, or (b) replace with real implementation. Drive the baseline to zero before GA; do not whitelist.
