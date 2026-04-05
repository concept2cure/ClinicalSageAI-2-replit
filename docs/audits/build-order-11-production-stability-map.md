# Build Order #11 — Production Stability Audit Map

**Date**: 2026-04-04
**Scope**: Token revocation, document/artifact convergence, dependency cleanup, E2E proof

---

## 1. Token Revocation — Redis-Backed Service

**Before**: In-memory `Set<string>` in `server/routes/auth.ts`. Tokens lost on restart.

**After**: Dedicated `server/services/token-revocation.ts` backed by Redis (SETEX, 24h TTL) with in-memory fallback. Redis already active in the project via ioredis (rate limiting, Bull queues, distributed locks). Migration 0015 adds `revoked_tokens` table as persistence fallback when Redis is unavailable.

| File | Change |
|---|---|
| `server/services/token-revocation.ts` | New service — `revokeToken()`, `isRevoked()`, Redis primary + memory fallback |
| `server/routes/auth.ts` | Removed in-memory Set, wired to token-revocation service |
| `migrations/0015_production_stability.sql` | Added `revoked_tokens` table (token_hash, revoked_at, expires_at) |

---

## 2. Document/Artifact Identity Convergence

**Before**: `documents` and `concept2cure_artifacts` tables had no foreign key relationship. Bridge service mapped them by convention only.

**After**: Nullable column `documents.artifact_id` added via migration 0015, referencing `concept2cure_artifacts.artifact_id`. Bridge service updated to v2.0.0 with explicit link/query functions.

| File | Change |
|---|---|
| `migrations/0015_production_stability.sql` | Added `artifact_id` nullable FK column to `documents` |
| `server/services/document-artifact-bridge.ts` | v2.0.0 — `linkDocumentToArtifact()`, `getDocumentsForArtifact()` |
| `shared/schema/` (relevant schema file) | Drizzle schema updated with nullable `artifactId` field |

---

## 3. Dependency Cleanup — @xyflow/react Removed

**Before**: `@xyflow/react` listed in `package.json`. All imports were commented out — dead dependency.

**After**: Package removed from `package.json`. Commented imports cleaned from consuming files.

| File | Change |
|---|---|
| `package.json` | Removed `@xyflow/react` from dependencies |
| `client/src/concept2cure/components/*/ImpactGraphTab.jsx` | Removed commented xyflow import |
| `client/src/concept2cure/components/*/ProcessCanvasEditor.jsx` | Removed commented xyflow import |

---

## 4. E2E Proof — Founder Critical Path

**Added**: `tests/e2e/founder-critical-path-proof.test.ts`

Covers the founder-critical path end-to-end:

- Login with valid credentials
- Logout and session teardown
- Project CRUD (create, read, update, delete)
- Artifact identity (create artifact, verify document linkage)
- Token revocation (sign out invalidates token, subsequent requests rejected)
- SSO guard (unauthenticated requests blocked)
- Sign-out wiring (UI sign-out triggers token revocation)

---

## Summary

| Area | Status | Key Artifact |
|---|---|---|
| Token revocation | Redis-backed with fallback | `server/services/token-revocation.ts` |
| Document/artifact FK | Nullable FK added | `migrations/0015_production_stability.sql` |
| Dead dependency | @xyflow/react removed | `package.json` |
| E2E proof | Founder path covered | `tests/e2e/founder-critical-path-proof.test.ts` |
