# Build Order 13 — Ops Hardening Architecture

> Date: 2026-04-04

## Maintenance Architecture

`platform-maintenance.ts` exposes `runPlatformMaintenance()` which runs three tasks via `Promise.allSettled`:

```
runPlatformMaintenance()
  ├── runTokenRevocationCleanup()   // purge expired tokens
  ├── checkBridgeIntegrity()        // detect bridge table drift
  └── runBackfill()                 // fill missing derived data
```

- Each task returns `{ task, status, detail }`.
- The route (`POST /maintenance/run`) returns the full array — callers inspect per-task status.
- No task failure aborts the others (parallel, isolated).

## Startup Invariant Architecture

`GET /startup/invariants` runs 5 async checks via `Promise.allSettled`:

```
checkStartupInvariants()
  ├── checkDatabaseConnectivity()
  ├── checkRevokedTokensTable()
  ├── checkArtifactIdColumn()
  ├── checkArtifactsTable()
  └── checkRedisConnectivity()
```

- **Never throws.** Always returns a structured report.
- Each check returns `{ name, passed: boolean, message?: string }`.
- Aggregate `allPassed` boolean at the top level for quick health gating.
- Intended for use at server boot and as a live health probe.

## Degraded Mode Policy

All services follow the `WARN / BLOCK / PROCEED` policy defined in `docs/architecture/degraded-mode-policy.md`:

| Level | When | Effect |
|-------|------|--------|
| WARN | Non-critical dependency unavailable | Log, continue, surface in health |
| BLOCK | Critical invariant failed | Halt affected operation, return error |
| PROCEED | Optional service down | Skip silently, note in structured health |

Services must not invent ad-hoc failure handling. Every degraded scenario maps to one of these three levels, ensuring consistent behavior across the platform.
