# Build Order #11 — Production Stability Architecture

**Date**: 2026-04-04

---

## Token Revocation Architecture

Three-tier design: Redis primary, in-memory fallback, database persistence.

```
Sign-out request
  │
  ▼
token-revocation.ts
  │
  ├─► Redis SETEX (token_hash, 24h TTL)   ← primary store
  │     on failure ──► in-memory Set       ← volatile fallback
  │
  └─► revoked_tokens table                 ← persistence fallback
        (token_hash, revoked_at, expires_at)
```

**Token validation** checks Redis first. On Redis miss or failure, falls back to in-memory Set, then queries `revoked_tokens` table.

**TTL alignment**: Redis SETEX TTL matches JWT expiry (24h). Table rows can be pruned after expiry via scheduled cleanup.

**Redis reuse**: Same ioredis instance already used for rate limiting, Bull queues, and distributed locks. No new infrastructure.

---

## Document/Artifact Identity Convergence

Nullable foreign key from `documents` to `concept2cure_artifacts`.

```
documents
  ├── id (PK)
  ├── artifact_id (nullable FK) ──► concept2cure_artifacts.artifact_id
  ├── title
  └── ...

concept2cure_artifacts
  ├── artifact_id (PK)
  ├── project_id
  └── ...
```

**Bridge service v2.0.0** provides:

| Function | Purpose |
|---|---|
| `linkDocumentToArtifact(documentId, artifactId)` | Sets the FK on an existing document |
| `getDocumentsForArtifact(artifactId)` | Returns all documents linked to an artifact |
| `unlinkDocument(documentId)` | Nulls out the FK |

The FK is nullable to preserve backward compatibility. Existing documents without an artifact link continue to function. New documents created through the authoring flow are linked at creation time.

---

## Dependency Removed: @xyflow/react

`@xyflow/react` was listed in `package.json` but all imports were commented out in:

- `ImpactGraphTab.jsx` — impact graph visualization (commented out)
- `ProcessCanvasEditor.jsx` — process canvas (commented out)

The package added approximately 1.2MB to `node_modules`. Removed from `package.json` and commented imports cleaned from source files. If graph visualization is needed in the future, re-add with active imports.

---

## Files Added/Modified

| File | Type |
|---|---|
| `server/services/token-revocation.ts` | Added |
| `migrations/0015_production_stability.sql` | Added |
| `server/services/document-artifact-bridge.ts` | Modified (v2.0.0) |
| `server/routes/auth.ts` | Modified |
| `package.json` | Modified |
| `client/src/.../ImpactGraphTab.jsx` | Modified |
| `client/src/.../ProcessCanvasEditor.jsx` | Modified |
| `tests/e2e/founder-critical-path-proof.test.ts` | Added |
