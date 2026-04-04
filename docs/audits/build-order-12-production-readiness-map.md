# Build Order #12 -- Production Readiness Audit Map

**Date**: 2026-04-04
**Status**: Complete

---

## 1. Token Revocation: 3-Tier Architecture

Previous state: 2-tier (Redis + in-memory).
Current state: 3-tier with explicit fallback order.

| Tier | Backend | Role |
|------|---------|------|
| 1 | Redis | Primary -- fastest lookup, volatile |
| 2 | PostgreSQL (`revoked_tokens` table, migration 0015) | Durable fallback -- survives restart |
| 3 | In-memory Set | Emergency -- no external deps required |

- **Write path**: write-through to all three backends. Failure in one does not block others.
- **Read path**: check Redis first, then DB, then memory. Return on first hit.
- **Token hashing**: SHA-256 applied before storage and lookup. Raw tokens never persisted.
- **DB table**: `revoked_tokens` created by migration 0015 with indexed `token_hash` column.

## 2. Auth Health Endpoint

`GET /api/governance/health` now reports three subsystem statuses in parallel:

| Subsystem | Healthy | Degraded | Emergency |
|-----------|---------|----------|-----------|
| Governance | Config loaded | Partial config | No config |
| Token Revocation | All 3 tiers up | 1-2 tiers down | All tiers down |
| Document Bridge | Tables exist, columns valid | Missing columns | Missing tables |

Response includes per-subsystem status and an aggregate status.

## 3. Bridge v3: Integrity, Backfill, Health

- **`checkBridgeIntegrity()`**: Queries for orphaned artifact-document links (artifact exists but document missing, or vice versa). Returns orphan count and IDs.
- **`backfillArtifactLinks()`**: Title-matching backfill for documents lacking artifact links. Matches by normalized title within the same project scope.
- **`getBridgeHealth()`**: Checks existence of required tables and columns. Reports missing schema elements.

## 4. Legacy Dependency Quarantine CI Guard

**Script**: `scripts/ci/check-legacy-dep-quarantine.mjs`

Scans `package.json` and lock files for quarantined packages:
- `@supabase/supabase-js` -- replaced by direct Drizzle/PostgreSQL
- `aws-sdk` v2 -- replaced by `@aws-sdk/client-s3` v3

Exits non-zero if quarantined dependencies are detected. Intended for CI pipeline integration.

## 5. Founder E2E Structural Proof

**Test file**: `tests/build-order-12-production-readiness.test.ts`

Covers seven structural proof areas:

| Test | Validates |
|------|-----------|
| Login | Auth endpoint returns JWT on valid credentials |
| Logout + Revocation | Sign-out writes to all 3 revocation tiers |
| Project CRUD | Create, read, update, delete with tenant scoping |
| Sign-out Wiring | UI sign-out handler calls revocation endpoint |
| SSO Guard | SSO routes reject when SSO is not configured |
| API-First Persistence | All mutations use `apiRequest()`, no raw fetch |
| Canonical Identity | User identity resolves consistently across services |

---

## Files Added/Modified

| File | Change |
|------|--------|
| `server/services/token-revocation.ts` | 3-tier revocation engine |
| `migrations/0015_revoked_tokens.sql` | `revoked_tokens` table |
| `server/routes/governance-health.ts` | Parallel health aggregation |
| `server/services/document-bridge-v3.ts` | Integrity, backfill, health |
| `scripts/ci/check-legacy-dep-quarantine.mjs` | CI quarantine guard |
| `tests/build-order-12-production-readiness.test.ts` | Founder E2E proof |
