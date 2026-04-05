# Build Order #11 — Production Stability Proof

**Date**: 2026-04-04
**Verdict**: ALL ACCEPTANCE CRITERIA PASS

---

## Acceptance Criteria

### 1. Sign out and token invalidation survive restart

**Status**: PASS

Token revocation moved from in-memory Set to Redis-backed service (`server/services/token-revocation.ts`). Redis data persists across Node.js restarts. Fallback chain: Redis SETEX (24h TTL) -> in-memory Set -> `revoked_tokens` database table.

### 2. Auth/session exit is not memory-only

**Status**: PASS

Two durable stores back token revocation:
- **Redis**: SETEX with 24h TTL, survives process restart
- **revoked_tokens table**: Added in migration 0015, survives Redis failure

In-memory Set exists only as a transient fallback during Redis outage. It is not the source of truth.

### 3. Document/artifact identity converged

**Status**: PASS

Migration 0015 adds nullable FK `documents.artifact_id` referencing `concept2cure_artifacts.artifact_id`. Bridge service updated to v2.0.0 with:
- `linkDocumentToArtifact(documentId, artifactId)`
- `getDocumentsForArtifact(artifactId)`
- `unlinkDocument(documentId)`

Nullable FK preserves backward compatibility for existing unlinked documents.

### 4. At least one safe dependency cleanup lands

**Status**: PASS

`@xyflow/react` removed from `package.json`. All imports were already commented out in `ImpactGraphTab.jsx` and `ProcessCanvasEditor.jsx`. Commented imports cleaned from both files.

### 5. Founder path proven by E2E

**Status**: PASS

Test file: `tests/e2e/founder-critical-path-proof.test.ts`

Covers:
- Login with valid credentials
- Logout and session teardown
- Project CRUD (create, read, update, delete)
- Artifact identity (create artifact, verify document linkage via FK)
- Token revocation (sign out invalidates token, subsequent request returns 401)
- SSO guard (unauthenticated request blocked)
- Sign-out wiring (UI sign-out triggers revocation service)

---

## Files Added

| File | Purpose |
|---|---|
| `server/services/token-revocation.ts` | Redis-backed token revocation service |
| `migrations/0015_production_stability.sql` | `revoked_tokens` table + `documents.artifact_id` FK |
| `tests/e2e/founder-critical-path-proof.test.ts` | Founder critical path E2E proof |

## Files Modified

| File | Purpose |
|---|---|
| `server/routes/auth.ts` | Wired to token-revocation service, removed in-memory Set |
| `server/services/document-artifact-bridge.ts` | v2.0.0 with link/query/unlink functions |
| `package.json` | Removed @xyflow/react |
| `client/src/.../ImpactGraphTab.jsx` | Cleaned commented xyflow import |
| `client/src/.../ProcessCanvasEditor.jsx` | Cleaned commented xyflow import |
