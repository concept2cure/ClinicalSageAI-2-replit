# Degraded Mode Policy

## Purpose

Defines when the platform should warn, block, or proceed when critical
subsystems are unavailable. All services should follow this policy.

## Subsystem Degradation Matrix

| Subsystem | Healthy | Degraded | Emergency/Unavailable |
|-----------|---------|----------|-----------------------|
| **Token Revocation** | Redis + DB + memory | Redis-only or DB-only + memory | Memory-only (volatile) |
| **Document Bridge** | Both tables + artifact_id column | Tables exist, column missing | Tables missing |
| **Governance Decisions** | DB reachable, transitions table present | DB reachable, transitions missing | DB unreachable |
| **Redis** | Connected, responding | Reconnecting | Unavailable |
| **Database** | Connected, responding | Slow/intermittent | Unreachable |

## Behavior Rules

### WARN (log + report in health, proceed normally)
- Redis unavailable (token revocation falls back to DB)
- Bridge column missing (convergence features disabled)
- Bridge drift detected (orphaned links)
- Non-critical table missing

### BLOCK (return error to caller)
- Database completely unreachable for write operations
- Token revocation in memory-only mode AND critical auth operation requested
- Migration required but not yet applied

### PROCEED IN DEGRADED MODE (log, report, continue)
- Redis unavailable for token revocation (use DB + memory)
- Bridge backfill not yet run (features work, linkage incomplete)
- Startup invariant warnings (non-critical)
- Scheduled maintenance skipped (will retry next cycle)

### SURFACE IN HEALTH/READINESS
- `GET /api/concept2cure/governance/health` — reports all subsystem states
- `GET /api/concept2cure/startup/invariants` — reports startup check results
- Status values: `healthy | degraded | emergency | error`
- Always report backend availability (redis, db, memory)

## Implementation

Services MUST:
1. Never crash on subsystem unavailability — degrade and report
2. Log degradation at WARN level with structured context
3. Report status via health endpoints
4. Prefer durable backends (Redis > DB > memory) for writes
5. Check all backends on reads (return on first hit)

Services MUST NOT:
1. Silently succeed when data was not durably persisted
2. Return stale cached data without indicating it
3. Throw unhandled exceptions on backend unavailability
4. Pretend to be healthy when operating in degraded mode
