# Database & Data Schema Production Readiness Report (Combined)

Date: 2026-03-25
Owner: Platform Engineering

## Executive Summary
This report combines:
1. **Initial readiness audit** (migration hygiene + live DB posture checks).
2. **Supplemental audit** for missed risk areas (migration naming determinism, PK coverage, nullable tenant keys).

The result is a single production-cutover readiness baseline and remediation plan.

---

## Audit Scope (Combined)

### Pass 1 (initial)
- Migration inventory and collision checks.
- Live Postgres extension checks (`pgcrypto`, `vector`).
- Migration bookkeeping table checks (`drizzle_migrations`, `schema_migrations`).
- FK index coverage checks.
- Tenant table RLS posture checks.

### Pass 2 (supplemental / missed areas)
- Migration naming convention compliance (`<numeric_prefix>_<name>.sql`).
- Mixed migration prefix-style detection (sequence vs date vs other).
- Migration manifest drift detection (`migrations_manifest.json` coverage + totals).
- Table primary-key coverage checks.
- Nullable tenant-key detection (`organization_id`, `org_id`, `tenant_id`).

---

## Production Criteria
1. **Governance & Deployability**
   - Deterministic migration ordering.
   - Manifest/order metadata kept in sync with repository state.
   - Migration tracking in database.
2. **Security & Isolation**
   - Tenant-keyed tables protected by RLS.
   - Tenant keys non-null unless intentional and documented.
   - Required crypto extensions installed.
3. **Performance**
   - FK columns indexed.
   - Critical runtime paths have selective indexes.
4. **Data Integrity**
   - All durable tables have PKs.
   - Parent/child runtime records are FK-enforced.
   - Status/state values constrained.

---

## Implemented in this remediation pass

### A) Automated readiness tooling
- `scripts/db/readiness-audit.mjs`
  - now includes both the original checks and supplemental checks listed above.
- `npm run db:readiness` added to `package.json`.

### B) Data-model hardening for AI goal planning
- `db/migrations/20260325_ai_goal_plan_hardening.sql` adds:
  - `ai_goal_plan_runs.status` check constraint.
  - FK from `ai_goal_plan_step_events.plan_run_id` to `ai_goal_plan_runs.id` with `ON DELETE CASCADE`.
  - Query-supporting indexes for run status and step-event timelines.

---

## Current Findings Snapshot

### From local execution (no `DATABASE_URL` provided)
- Static checks executed successfully.
- Live DB checks intentionally skipped (environment limitation).
- Migration manifest was synchronized to current repository SQL migration inventory (`140` files).

### Known high-priority follow-ups before production cutover
1. Run the combined audit against **staging** and **pre-prod** with live database connectivity.
2. Triage and remediate all FAIL, then WARN findings in order:
   - RLS gaps on tenant tables.
   - FK indexes missing on hot paths.
   - nullable tenant keys where multi-tenant guarantees require strict isolation.
   - PK gaps on any persistent tables.
3. Enforce a deterministic migration ordering contract in CI/CD.
4. Keep `migrations_manifest.json` updated as new migrations are introduced.

---

## Unified Remediation Plan

### Phase 1 — Blockers (must pass)
- [ ] No FAIL checks in staging.
- [ ] No FAIL checks in pre-prod.
- [ ] Goal-plan hardening migration applied and verified.

### Phase 2 — Hardening (strongly recommended)
- [ ] Resolve tenant-table WARNs (RLS + nullable keys).
- [ ] Resolve schema performance WARNs (FK index coverage).
- [ ] Resolve migration-governance WARNs (prefix collisions/style mixing).
- [ ] Resolve manifest drift WARNs (executionOrder + totalMigrations alignment).

### Phase 3 — Operational proof
- [ ] Backup restore drill evidence (RTO/RPO) captured.
- [ ] Runbook updated with `npm run db:readiness` release gate.
- [ ] Post-deploy audit artifact attached for each production release.

---

## Runbook Commands
```bash
# Combined readiness audit
npm run db:readiness

# CI mode: fail on WARN or FAIL
npm run db:readiness:strict

# Write machine-readable report
node scripts/db/readiness-audit.mjs --json-out=artifacts/db-readiness.json

# Example with explicit database target
DATABASE_URL='postgres://...' npm run db:readiness

# Manifest drift checks in CI
npm run db:sync-manifest:check
```
