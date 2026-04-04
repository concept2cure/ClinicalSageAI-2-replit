# Build Order 13 — Ops Hardening Audit Map

> Date: 2026-04-04 | Sprint: Ops Hardening

## 1. Scheduled Maintenance

**File:** `server/services/platform-maintenance.ts`

`runPlatformMaintenance()` executes three tasks in parallel:

| Task | Function | Purpose |
|------|----------|---------|
| Token cleanup | `runTokenRevocationCleanup()` | Purge expired/revoked tokens |
| Bridge integrity | `checkBridgeIntegrity()` | Detect drift in bridge tables |
| Backfill | `runBackfill()` | Fill missing derived data |

**Route:** `POST /maintenance/run` — triggers `runPlatformMaintenance`, returns structured result per task.

## 2. Startup Invariants

**Route:** `GET /startup/invariants`

Five checks run in parallel (never throw, always return a report):

| # | Invariant | Checks |
|---|-----------|--------|
| 1 | Database connectivity | Can we reach PostgreSQL? |
| 2 | `revoked_tokens` table | Does the table exist? |
| 3 | `artifact_id` column | Present on required tables? |
| 4 | `artifacts` table | Does it exist with expected schema? |
| 5 | Redis connectivity | Can we reach Redis? |

Result: structured JSON report with per-check `pass`/`fail` and optional message.

## 3. Legacy Quarantine

**Status:** Unchanged. 9 Supabase consumers remain quarantined.

- Migration is too risky this sprint (tight coupling, no test coverage on those paths).
- CI guard already blocks new Supabase consumer imports.
- No action required until a dedicated migration sprint.

## 4. Playwright E2E

**File:** `tests/e2e/founder-critical-path.e2e.ts`

8 tests covering the founder critical path:

| # | Test |
|---|------|
| 1 | Login with valid credentials |
| 2 | SSO redirect flow |
| 3 | Projects API returns valid list |
| 4 | Governance health endpoint responds |
| 5 | Maintenance route executes successfully |
| 6 | Startup invariants return structured report |
| 7 | Logout + token revocation |
| 8 | Sign-out UI clears session state |

## 5. Degraded Mode Policy

**File:** `docs/architecture/degraded-mode-policy.md`

Three severity levels:

| Level | Meaning | Behavior |
|-------|---------|----------|
| **WARN** | Non-critical service degraded | Log warning, continue normally |
| **BLOCK** | Critical invariant failed | Block affected operation, surface error |
| **PROCEED** | Optional service unavailable | Skip gracefully, note in health report |

All services must classify their failure modes into one of these three levels.
