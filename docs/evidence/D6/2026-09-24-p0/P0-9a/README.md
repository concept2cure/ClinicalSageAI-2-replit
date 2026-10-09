# P0-9a — the audit immutability triggers are checked at boot and by the daily sweep (DP-06, DP-04)

**Row:** D6. **Findings:** `docs/security/SECURITY_AUDIT_2026-09-24.md` DP-06 (High) and DP-04 (High).
**Plan items:** P0-9 (this is the startup self-check half; the Terraform task-definition and deploy-preflight half
that sets `AUDIT_TRAIL_ENABLED=true` / `AUDIT_REQUIRE_ENFORCE=true` is the W2 lane's) and P0-8 (this is the
sweep half; the archive-bypass `SECURITY DEFINER` function, the `app_service` DELETE grant and the anchored chain
head are not here).

## What was wrong

The audit stores are append-only because database triggers refuse UPDATE and DELETE on them
(`db/migrations/20260617_audit_logs_immutability.sql`, `20260222_audit_events_immutability.sql`,
`20260813_audit_tamper_proof_log.sql`, `20260730_esign_audit_db_level_immutability.sql`). Nothing at boot asked
whether those triggers existed, so a database restored from a dump older than the trigger migrations, a fresh
install booted before `deploy-migrate`, or an `ALTER TABLE … DISABLE TRIGGER` left every store writable behind a
green boot and a green security self-test. `assertAuditTrailForProduction` (`server/startup/audit-enforcement.ts`)
only looked at the `AUDIT_TRAIL_ENABLED` flag.

The daily sweep (`server/jobs/auditChainIntegritySweep.ts`) called `verifyAuditChain` alone: the plain `audit_logs`
sha256 chain. A broken HMAC seal, a tampered `audit.tamper_proof_log` row, a broken `audit_events` link or a dropped
trigger were never reported by the scheduled tamper-evidence check; the on-demand verifier that walks all three
stores (`scripts/ops/verify-audit-chain.mjs`) was scheduled by nothing.

## What is true now

- **`server/services/audit/audit-immutability-triggers.ts`** (new). `assertAuditImmutabilityTriggers(client)` runs one
  parameterised, read-only probe over `pg_trigger` ⋈ `pg_class` ⋈ `pg_namespace` for the eight expected triggers on
  `public.audit_logs`, `public.audit_events`, `audit.tamper_proof_log` and `public.electronic_signatures`, and returns
  `{ ok, missing, disabled, tablesAbsent, expected, present }`. An absent table is missing every trigger on it; a
  trigger whose `tgenabled` is not `O`/`A` (disabled, or replica-only) is `disabled`; an expected trigger the probe
  returns no row for is missing (the expected list decides what was checked, not the result set). The list is pinned
  to the migrations by a drift guard: each name must appear as `CREATE TRIGGER <name>` in its named source file, and
  that file must be in `C2C_MIGRATION_FILES`. `device_audit_trail`'s trigger is not required because no applier
  migration creates that table.
- **`server/startup/audit-enforcement.ts`.** `assertAuditImmutabilityForProduction(pool)` — wired from the end of
  `verifyDatabaseConnection` in `server/startup/services.ts`, after the connection is verified and before the security
  self-test — refuses a production boot when any trigger is missing or disabled, **regardless of
  `AUDIT_REQUIRE_ENFORCE`** (a writable audit store is not a rollout state; the throw reaches `startServer().catch`,
  exit 1). When the probe itself cannot run, `AUDIT_REQUIRE_ENFORCE=true` makes that a refusal too; otherwise it is
  one loud warning that says the triggers were NOT verified, never a pass. With `AUDIT_REQUIRE_ENFORCE=true`,
  `ENABLE_AUDIT_CHAIN_CHECK=false` in production is refused before the database is touched
  (`assertAuditIntegritySweepForProduction`). Outside production every gap is a structured warning. The sweep's
  gating matrix moved into `resolveAuditChainSweepPosture` here so the job and the gate cannot disagree.
  `assertAuditTrailForProduction` and `isAuditTrailActive` are unchanged.
- **`server/services/securityHealth.ts`.** `audit_immutability_triggers` is a critical check on the panel (boot
  self-test, `/api/admin/security-health`, the 5-minute scheduler), so a trigger disabled mid-day shows within one
  interval.
- **`server/jobs/auditChainIntegritySweep.ts`.** One run now verifies six things through the writers' own exported
  verifiers, nothing re-transcribed: `audit_logs.chain` and `audit_logs.seals` (`verifyAuditIntegrity`, which fails
  closed to `unverifiable` without `AUDIT_HMAC_KEY`), `audit_events.linkage` (`summarizeChainLinkage`, the monitor's
  walk) and `audit_events.seals` (`verifyAuditEventsChainSeals`), `audit.tamper_proof_log` (`verifyTamperProofLogRows`
  on a plain SELECT under `AUDIT_HMAC_SECRET` — not the class method, which appends a verification row), and the
  trigger check. Each store is `ok`, an incident (`broken` / `missing` / `error`) or `unverifiable`; every store is
  checked even when another fails. An incident raises the alert path the chain break raised before — error log,
  `process.emitWarning('…', 'AuditChainIntegrity')` — plus the `[SECURITY]` webhook (`reportSecurityAlert`, kind
  `audit_integrity_sweep_failed`) with counts and the first failing identifier only, never row content.
  `unverifiable` is a warning and is never reported as ok. `ok`, `rowsChecked` and `brokenAt` keep their meaning for
  existing consumers; the schedule (02:00 daily, `AUDIT_CHAIN_CHECK_CRON`) is unchanged.

| | File | Result |
|---|---|---|
| red | `red/before-fix.txt` | on HEAD `dac69d76`: 25 of 40 fail. The two new files cannot import `audit-immutability-triggers` (nothing checked triggers); the 15 new startup-gate cases fail (no `assertAuditImmutabilityForProduction`, `assertAuditIntegritySweepForProduction`, `resolveAuditChainSweepPosture`); 10 of the 11 new sweep cases fail — a broken seal, a tampered tamper-proof row, a broken `audit_events` link and a missing trigger raise no alert because none is checked. The 6 existing enforcement cases and the 8 existing schedule cases pass. |
| green | `green/after-fix.txt` | 57 of 57 across the four files: 11 trigger-check unit cases (fake catalog client, drift guard, panel exposure), 6 against the real catalog in PGlite (the four real migrations applied, then replayed; a trigger dropped; a trigger disabled and re-enabled; the `audit` schema dropped; a same-named trigger on a decoy table), 21 startup-gate and posture cases, 19 sweep cases. |

Tests: `server/services/audit/__tests__/audit-immutability-triggers.test.ts`,
`server/services/audit/__tests__/audit-immutability-triggers.pglite.test.ts` (both new),
`server/startup/__tests__/audit-enforcement.test.ts` and `server/jobs/__tests__/auditChainIntegritySweep.test.ts`
(both extended; the sweep's verifiers, pool, cron and webhook are mocked, the sweep's own SELECTs answered by a fake
client). Neighbouring suites that consume the panel and the sweep — `securityHealth.test.ts`,
`securityHealthScheduler.test.ts`, `audit-chain-wiring.test.ts`, `chainIntegrityMonitor.test.ts`,
`audit-integrity-pglite.integration.test.ts` — 55 of 55.

Gates: `ci:discarded-audit-write` no new occurrences (131 baselined); `ci:dead-audit-catch` no new occurrences;
`check:security-patterns` 0 violations across 2837 files; `ci:audit-logs-fixture` every fixture accepts the writer's
16 columns. A scoped `tsc` (the nine touched files plus `shared/types/third-party.d.ts`, `extends tsconfig.json`)
reports nothing for them; the full-tree typecheck was OOM-killed on this host and is the control tower's at push.
A real PostgreSQL run is not possible here (no pgvector); the PGlite suite covers the catalog SQL.

## What still depends on the Terraform half (P0-9, W2)

- The missing-trigger refusal is unconditional in production and needs no variable.
- `AUDIT_REQUIRE_ENFORCE=true` in the task definition is what turns "the probe could not run" and
  `ENABLE_AUDIT_CHAIN_CHECK=false` into refusals instead of warnings, and what makes `AUDIT_TRAIL_ENABLED` unset a
  refusal (unchanged behaviour of `assertAuditTrailForProduction`).
- `AUDIT_TRAIL_ENABLED=true` is what starts the request interceptor and the 5-minute `chainIntegrityMonitor`; the
  daily sweep does not depend on it in production (default ON since before this change).
- The deploy preflight should read the same two names; `terraform test` for them is the W2 acceptance test.

## Not done here

- The archive-bypass GUC (`app.audit_archive_bypass`), the `app_service` DELETE grant and the daily chain-head anchor
  (P0-8, other halves). Without the anchor the sweep still cannot detect a deletion of the newest rows.
- `audit.tamper_proof_log` has no TRUNCATE trigger (its migration blocks UPDATE and DELETE only); adding one is an
  in-place amendment of `20260813_audit_tamper_proof_log.sql` under CLAUDE.md Rule 1, on the migration lane.
- `electronic_signatures`' trigger is attached by `20260730_esign…` only if the table exists when that file runs; on a
  first deploy where the table is created later in the set the trigger appears on the next `deploy-migrate`, and the
  boot gate refuses until then — the fail-closed outcome, named here so it is not read as a false positive.
- In production with `AUDIT_SEAL_ACCEPT_UNSEALED=true` (no `AUDIT_HMAC_KEY`) the sweep reports the seals
  `unverifiable` every day; that is the visible cost of the accepted posture, not a defect.
- The security-health panel maps a thrown `relation … does not exist` from the pool to `warn` (the panel's
  fresh-environment convention, pinned by `server/services/__tests__/securityHealth.test.ts`, outside this lane's
  window); the probe itself never throws for an absent store — that is a `fail` — and the boot gate does not soften
  anything.
