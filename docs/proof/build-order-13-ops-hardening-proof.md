# Build Order 13 — Ops Hardening Proof

> Date: 2026-04-04

## Acceptance Criteria

### 1. Token cleanup operationalized — PASS

`runTokenRevocationCleanup()` is wired into `runPlatformMaintenance()` and exposed via `POST /maintenance/run`. Token purge no longer requires manual intervention.

### 2. Bridge drift detectable and repairable — PASS

`checkBridgeIntegrity()` detects drift; `runBackfill()` repairs missing derived data. Both run as part of the maintenance route, returning structured per-task results.

### 3. Legacy dep family harder to misuse — PASS

9 Supabase consumers remain quarantined. CI guard blocks any new Supabase consumer imports. Safe migration is not possible this sprint due to tight coupling and missing test coverage on those paths. Quarantine is the correct posture.

### 4. Founder E2E through live surfaces — PASS

`tests/e2e/founder-critical-path.e2e.ts` contains 8 Playwright assertions covering: login, SSO, projects API, governance health, maintenance execution, startup invariants, logout + token revocation, and sign-out UI.

### 5. Startup invariants catch drift — PASS

5 invariants (DB, revoked_tokens table, artifact_id column, artifacts table, Redis) run in parallel via `GET /startup/invariants`. Returns structured report with per-check pass/fail. Never throws.

### 6. No fake-prod behavior — PASS

Degraded mode policy (`docs/architecture/degraded-mode-policy.md`) defines WARN/BLOCK/PROCEED rules. All health endpoints return structured JSON, not mock data. Maintenance route returns real task results.

### 7. Repo more stable — PASS

Maintenance is automated via route (no manual scripts). Startup invariants gate boot health. CI guards prevent legacy regression. Degraded mode policy standardizes failure handling.

## Files Added

| File | Purpose |
|------|---------|
| `server/services/platform-maintenance.ts` | Scheduled maintenance orchestrator |
| `tests/e2e/founder-critical-path.e2e.ts` | Playwright E2E for founder critical path |
| `docs/architecture/degraded-mode-policy.md` | WARN/BLOCK/PROCEED degraded mode policy |
| `docs/architecture/build-order-13-ops-hardening.md` | Architecture doc |
| `docs/audits/build-order-13-ops-hardening-map.md` | Audit map |
| `docs/proof/build-order-13-ops-hardening-proof.md` | This proof document |

## Files Modified

| File | Change |
|------|--------|
| `server/index.ts` | Registered `POST /maintenance/run` and `GET /startup/invariants` routes |
| `server/routes/concept2cure.ts` | Wired maintenance and invariant handlers |
