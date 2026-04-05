# Build Order #12 -- Production Readiness and Drift Elimination Architecture

**Date**: 2026-04-04

---

## Three-Tier Token Revocation

```
[Sign-out / Force-revoke]
        |
        v
  Write-through layer
   |         |         |
   v         v         v
 Redis      DB       Memory
 (tier 1)  (tier 2)  (tier 3)
```

### Write Path

All revocation writes go to every available backend. Each write is independent -- a Redis failure does not prevent DB or memory writes. Token is SHA-256 hashed before storage.

```
revokeToken(rawToken):
  hash = sha256(rawToken)
  await Promise.allSettled([
    redis.sadd("revoked_tokens", hash),
    db.insert(revokedTokens).values({ tokenHash: hash }),
    memorySet.add(hash)
  ])
```

### Read Path

Checks backends in priority order. Returns on first positive match.

```
isRevoked(rawToken):
  hash = sha256(rawToken)
  if redis.sismember("revoked_tokens", hash) -> return true
  if db.select(revokedTokens).where(tokenHash = hash) -> return true
  if memorySet.has(hash) -> return true
  return false
```

### Degradation Modes

| Redis | DB | Memory | Status |
|-------|----|--------|--------|
| Up | Up | Up | healthy |
| Down | Up | Up | degraded |
| Down | Down | Up | emergency |
| Down | Down | Down | critical (sign-out still clears JWT client-side) |

## Bridge v3: Document-Artifact Integrity

### Integrity Check

`checkBridgeIntegrity()` runs two queries:
1. Artifacts with no matching document row (orphaned artifacts)
2. Documents with no matching artifact row (orphaned documents)

Returns structured report with orphan counts and IDs for remediation.

### Backfill

`backfillArtifactLinks()` resolves unlinked documents by normalized title matching within the same `projectId`. Creates artifact link records for each match found.

### Health Diagnostics

`getBridgeHealth()` verifies schema presence:
- Required tables: `documents`, `artifacts`, `artifact_document_links`
- Required columns per table checked via `information_schema.columns`

## Health Endpoint Aggregation

`GET /api/governance/health` fetches three subsystem reports in parallel:

```
Promise.all([
  getGovernanceHealth(),
  getRevocationHealth(),
  getBridgeHealth()
]) -> { governance, tokenRevocation, documentBridge, aggregate }
```

Aggregate status is the worst of the three subsystem statuses: healthy > degraded > emergency > critical.
