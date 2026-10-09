# P1-9 — the main socket namespace admitted on a stale claim and never looked again (IAM-12, Medium)

**Row:** D6. **Finding:** `docs/security/SECURITY_AUDIT_2026-09-24.md` IAM-12. **Plan item:** P1-9.
**Sibling fix:** P0-1 (`7c4faf2a`) did the same for the `/ana` namespace.

## What was wrong

`server/socketServer.ts`'s handshake middleware verified the token (signature, revocation, account standing, token
class) and the tenant's lifecycle, and admitted the socket on the token's `organizationId` claim alone: no membership
row was consulted, so a user removed from the organisation connected for the rest of the token's day. It accepted the
token from the query string as well as from `handshake.auth`. After connect nothing re-checked anything, so a revoked
session, an account taken out of use, a password-change-ended session, a removed member and a suspended tenant all kept
receiving the org room's live events (tasks, notifications, compliance, timers) until the transport dropped.

## What is true now

- The token comes from `handshake.auth.token` only (no first-party client sends one in the query string:
  `client/src` has no socket.io client at all; the one consumer is the contract suite, which already used `auth`).
- The handshake requires `checkOrgMembership(userId, organizationId) === 'member'` (fail-closed on `indeterminate`,
  the same helper and cache the HTTP boundary and `/ana` use) before the lifecycle check; the ids must be positive
  integers.
- Every admitted socket re-runs the three checks on a timer (`SOCKET_SESSION_RECHECK_MS`, default 60 s, floor 5 s,
  `unref`'d): `verifyLiveToken` on the handshake token, the membership, the tenant lifecycle. On a failure the socket
  receives `session:ended { reason: 'session_ended' | 'membership_revoked' | 'tenant_inactive' }`, one warning is
  logged, and it is disconnected; the timer is cleared on disconnect and never overlaps itself.

| | File | Result |
|---|---|---|
| red | `red/main-namespace-before-fix.txt` | HEAD `f47aa229`, server unchanged: a query-string token admitted; revoked and indeterminate memberships admitted; no timer, so a removed member, an ended session and a suspended tenant keep the socket; 8 of 11 fail |
| green | `green/main-namespace-after-fix.txt` | 11 of 11, and the real-socket isolation contract (`tests/socket-tenant-isolation.contract.test.ts`, PGlite, two live tenants) 11 of 11 with a membership table added to its fixture |
| gates | `green/gates.txt` | `check:security-patterns`, `ci:jwt-verify-pinned`, `ci:discarded-audit-write` exit 0 |

Tests: `server/__tests__/security/socket-main-namespace-session.test.ts` (new; the real middleware and connection
handler driven through a fake socket.io server, fake timers for the re-check).

## Not done here

- A browser client for the main namespace does not exist today; when one is written it must pass the token in
  `auth` and handle `session:ended`.
- The per-connection re-check reads the membership cache (60 s) and the token on every tick; a Redis-published
  "membership revoked" event that disconnects immediately would be tighter than the timer and is not built.
