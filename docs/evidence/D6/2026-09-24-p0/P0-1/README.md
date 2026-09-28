# P0-1 — the `/ana` socket namespace admitted the pre-MFA challenge token (IAM-01, Critical)

**Row:** D6. **Finding:** `docs/security/SECURITY_AUDIT_2026-09-24.md` IAM-01. **Plan item:** P0-1.
**Reproduction at the audited commit:** `docs/evidence/D6/2026-09-24-security-audit/repro/IAM-01-ana-namespace-pre-mfa-token.txt`.

## What was wrong

`server/services/ana/ana-realtime.ts` registered `io.of('/ana')` with a handshake that called `verifyLiveToken` and
checked that two claims were present. `verifyLiveToken` checks signature, revocation and account standing, never the
token class, so the 5-minute `mfa_challenge` token a correct password yields before the second factor (and a partial
or refresh token) opened the AnA agent loop with the account's tenant scope. The token was also accepted from the
query string, and neither live membership nor tenant lifecycle was checked. The main namespace
(`server/socketServer.ts:225-280`) and the collaboration socket (`server/services/hocuspocus-server.ts:211-300`) make
all of those checks; this namespace, a third transport with no Express middleware in front of it, did not.

## What is true now

The handshake is the same gate as the other two transports: token from `handshake.auth` only; `verifyLiveToken`;
`requireAccessTokenReason` refuses every non-access class and a token that declares no class; `checkOrgMembership` must answer `member` (indeterminate
refuses); `shouldProcessTenantInBackground` must be true. Positive integers are required for both ids. The namespace
stays registered (no client uses it today; hardening removes the exposure without a capability decision).

| | File | Result |
|---|---|---|
| red | `red/ana-realtime-auth-before-fix.txt` | 7 of 8 fail on HEAD `0b8d6e9a`: the challenge, partial and refresh tokens, the query-string token, a revoked and an indeterminate membership, and an inactive tenant are all admitted; the control passes |
| green | `green/ana-realtime-auth-after-fix.txt` | 14 of 14 (the 9 handshake cases and the 5 existing `AnaRealtimeSession` cases) |

Test: `server/services/ana/__tests__/ana-realtime-auth.test.ts` (the database-backed lookups inside `verifyLiveToken`
are stood in by the real `verifyJwtWithRotation`; membership and lifecycle are mocked and toggled per case).
`npx tsc --noEmit -p tsconfig.check.json` reports nothing for the file.

## Not done here

- The main namespace still accepts a query-string token and does not re-check membership after connect (IAM-12, P1-9).
