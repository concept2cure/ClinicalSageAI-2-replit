# Reporting & Compliance Module Inventory and Readiness Audit (2026-04-09)

## Scope
This audit covers the **current implementation state** of the reporting and compliance surfaces in this repository, focused on:
- Reporting orchestration and exports
- Compliance APIs (global + 21 CFR Part 11)
- Audit-trail capture and retrieval
- Frontend/reporting UX wiring versus backend route availability

## Methodology
- Static code inventory of route mounts, route handlers, services, schema, migrations, and UI entry points.
- Targeted runtime-safe checks that can run without a full dependency install.
- Traceability check between frontend callsites and mounted backend endpoints.

### Commands executed
- `rg --files -g 'AGENTS.md'`
- `rg -n "intelligent-reports|report-os|part11-compliance|global-compliance|audit-trail" server/index.ts server/bootstrap`
- `node --test tests/ops/report-os-foundation.test.mjs`
- `node scripts/ci/check-governed-export-routes.mjs`
- `node scripts/ci/audit-route-mounts.mjs --write-json /tmp/route-mount-audit.json`

## Current Inventory — What Exists Now

### 1) Reporting (primary stack)

#### 1.1 Report OS backend (active, mounted)
- Mounted at `/api/report-os` from `server/index.ts` via startup bootstrap import set.
- Route file includes:
  - taxonomy seed/list
  - scoped runs (create/list)
  - dependency visibility (`/runs/:id/dependencies`)
  - PDF exports (`/runs/:id/export.pdf`, `/bundles/:bundleId/export.pdf`)
  - bundles + deliveries + correspondence capture
  - health endpoint (`/health`) with DB counts

**Read:** This is the most complete reporting backend in-repo and appears to be the canonical path for governed reporting workflows.

#### 1.2 Intelligent Reports backend (active, mounted)
- Mounted at `/api/intelligent-reports`.
- Provides catalog + generate + list + provenance + seal + verify operations.
- Positioned as immutable/sealed record generation for broader report intelligence.

#### 1.3 Legacy `/api/reports` surfaces (partially present, fragmented)
- Some report files exist under `server/routes/reports/*` (manifest and persona-subscription/download flows).
- `registerSubscriptionsRoutes` is imported in `server/index.ts` but no invocation of `registerSubscriptionsRoutes(app)` is present.
- Frontend `ReportsPage.jsx` still calls `/api/reports` and `/api/reports/export.pdf`.

**Read:** There is a legacy reporting API contract still referenced by UI, but it is not cleanly represented as one mounted, canonical backend surface.

### 2) Compliance (primary stack)

#### 2.1 Global compliance API (active, mounted)
- Mounted at `/api/compliance`.
- Includes region framework config + gap analysis + GDPR operations (RoPA/DSR/breach/transfer/DPIA) + pharmacovigilance endpoints + dashboard endpoint.
- Includes request-context helpers for org scope and role-based subject-access checks.

#### 2.2 21 CFR Part 11 API (active, mounted)
- Mounted at `/api/part11`.
- Includes signature, audit-trail, chain integrity, authority-check, SOC2 evidence, compliance-status, and health endpoints.
- Writes audit trail entries with hash chaining and optional DB persistence when pool is configured.

**Important caveat:** sections such as `/compliance-status` and SOC2 control content are currently static/hardcoded payloads in route code, so “compliance status” is partly declarative rather than fully computed from live evidence.

### 3) Audit trail module

#### 3.1 Generic audit-trail routes (active, mounted)
- Mounted under `/api` as `/api/audit/logs`, `/api/audit-logs`, `/api/audit/events`, and batch creation.
- Reads/writes `audit_events` and exposes hash-chain fields (`record_hash`, `previous_hash`, `sequence_number`) to clients.

#### 3.2 Data model and migrations
- Reporting model backed by `report_*` tables and dependency table in schema + foundation migration.
- Global compliance backed by dedicated GDPR/PV/regional config tables.
- Part 11 and audit chain infrastructure migrations exist for immutable-style audit trails, signature logs, and chain integrity fields/triggers.

### 4) Frontend surfaces

#### 4.1 ReportCenter (wired to Report OS, likely current canonical UI)
- `client/src/concept2cure/components/reports/ReportCenter.tsx` uses `useReports` hook.
- `useReports` calls `/api/report-os/*` endpoints (taxonomy/runs/bundles/deliveries/export/dependencies/correspondence).

#### 4.2 ReportsDashboard (UI-only starter/demo surface)
- Uses in-file `starterProjects`, `starterTaskLedger`, and persona examples.
- No backend report fetch path in this component.

#### 4.3 ReportsPage (mixed legacy + modern)
- Renders `ReportCenter`, but also executes direct axios calls to `/api/reports` and `/api/reports/export.pdf`.
- This mixed contract indicates migration is incomplete and increases breakage risk.

## Is It Working Yet? (Current Readiness Assessment)

## ✅ What is demonstrably working (code + checks)
1. Report OS governance/report contract structure is present and internally validated by repository test logic:
   - `node --test tests/ops/report-os-foundation.test.mjs` passed (13/13).
2. Governed export route contract check passes:
   - `node scripts/ci/check-governed-export-routes.mjs` passed.
3. Route mount audit script completed with no reported errors/warnings in this run (44 captured mounts).

## ⚠️ What is partially working / uncertain
1. End-to-end runtime verification of the full reporting/compliance stack is not proven in this audit run because dependency/toolchain install is absent in the environment (`vitest`/`tsx` unavailable).
2. Legacy `/api/reports` UI contract remains in active frontend code while canonical reporting moved to `/api/report-os`; this is a migration inconsistency.
3. Part 11 compliance dashboard endpoint returns static compliance assertions; not all values are tied to live control evidence at request time.

## ❌ What appears not production-ready yet
1. A single consolidated, canonical “reporting module contract” is not fully enforced across UI surfaces.
2. Some reporting UI surfaces are still demo/static-first (e.g., `ReportsDashboard`) rather than API-backed operational views.

## What’s Needed Next (Priority Plan)

### P0 — Stabilize contract and remove ambiguity
1. **Declare canonical reporting API** (`/api/report-os`) and deprecate legacy `/api/reports` usage from `ReportsPage.jsx`.
2. Add a CI guard that fails when frontend calls unknown/unmounted report endpoints.
3. Decide whether `registerSubscriptionsRoutes` is deprecated or should be mounted intentionally; remove dead imports if deprecated.

### P1 — Compliance truthfulness hardening
1. Replace static `/api/part11/compliance-status` sections with computed evidence from DB-backed controls/events/signatures.
2. Add integrity and evidence freshness timestamps to compliance response payloads.
3. Introduce fail-closed behavior if compliance evidence stores are unreachable.

### P2 — Operational readiness and proof
1. Run targeted integration tests for:
   - report generation → dependency checks → bundle → delivery → export
   - part11 signature + hash-chain verification
   - global compliance GDPR + PV critical flows
2. Publish a machine-readable “module health” endpoint that combines:
   - route availability
   - DB schema presence
   - queue/provider dependency health
   - last successful run time per major workflow.

### P3 — UX convergence
1. Consolidate reporting UX to one operational shell (`ReportCenter` or successor), with feature flags for experimental views.
2. Mark demo/static screens clearly (or remove from production navigation).

## Executive Conclusion
- The repository contains a **substantial reporting + compliance implementation** with active route mounts, schema/migrations, and governance-oriented infrastructure.
- The **core foundation exists and is partially validated** (Report OS + governed export checks).
- However, there is still **migration drift** (legacy `/api/reports` references, mixed/static UI surfaces) and **truth-model gaps** (hardcoded compliance status payloads).
- Net: **working foundation, not yet fully converged/operationally proven as one coherent production module.**
