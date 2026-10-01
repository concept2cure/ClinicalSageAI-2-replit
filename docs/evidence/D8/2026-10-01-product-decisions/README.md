# D8 — the product owner's connector decisions, implemented

**Row:** D8. **Decisions:** P-1, P-2, P-3 in `docs/LAUNCH_DEFINITION_OF_DONE.md` ("Product decisions, 2026-10-01"),
made by the product owner under the founder's delegation of 2026-10-01. **Lane:** `…session_01JNRgCKWRqqJxZ1cJCyxoor`,
claimed before the work. No migration, no schema change, no new dependency.

## P-1 — a password change ends every connector grant authorised before it

**Before:** the connector's *access* tokens already ended at a password change (they verify through
`verifyLiveToken`), but its refresh tokens did not: `red/A-password-change-before-fix.txt` — a grant authorised before
the change refreshed after it and minted a fresh access token.

**Now:** both `/token` exchanges (`liveGrantorMembership`, `server/mcp/auth/provider.ts`) read the account once through
the canonical `readAccountStandingBeforeTenant` and refuse, with the reason, when
`sessionPredatesPasswordChange(issued, passwordChangedAt)` — the platform's own whole-second comparison — says the
presented code or refresh token predates the change. The issue time is that row's `created_at`. No column records the
original consent, and none is needed: every rotation passes this check first, so once the password changes no token can
be minted from a grant authorised before it. (A first draft added an `authorized_at` column; it was removed before
commit as redundant.)

| File | |
|---|---|
| `red/A-password-change-before-fix.txt` | The case on unchanged code: the refresh succeeds after the change. |
| `green/A-dbtests-after-fix.txt` | `mcp-account-standing.dbtest.ts` + `mcp-connector.dbtest.ts` as the runtime role, RLS on: 26/26. The case refuses the access token, the refresh token and an unredeemed code, says "password", and a fresh sign-in connects again. |
| `green/A-unit-after-fix.txt` | Every connector unit suite and the registration contract: 53/53. |
| `red/A-revert-proof-check-removed.txt` | With the comparison disabled, the case fails on the refresh, as it should. |

## P-2 — production registration fails closed without an allowlist

**Before:** in production with `MCP_CLIENT_REDIRECT_ALLOWLIST` unset, the router warned once and admitted any https
origin (`openInProduction`). **Now:** that state is `closedInProduction` and every registration is refused with RFC 7591
`invalid_redirect_uri` ("Registration is closed…"), echoing nothing the caller sent; the single warning at router
creation now says registration is refused and names the launch origins. Clients already registered are unaffected.

| File | |
|---|---|
| `red/B-registration-before-fix.txt` | The registration contract updated to the decision, on unchanged code: 4 of 19 fail — exactly the cases that pinned the open state. |
| `green/B-registration-and-connector-unit.txt` | After: 53/53 (registration contract 19/19 with the connector suites). |

The production values — `MCP_ENABLED=true`, `MCP_PUBLIC_URL`, `MCP_CLIENT_REDIRECT_ALLOWLIST=https://claude.ai,https://claude.com`
— are `terraform/stack`'s boot environment and the deploy preflight, handed to the W2 lane on the board.

## P-3 — repository and release controls

Recorded in the launch definition; P0-14 in the remediation plan revised accordingly. The GitHub settings (force-push
and deletion blocks, push protection, the `production` environment reviewer) need repository admin and are the
founder's to apply. The deploy-time verdict (deploy only a commit whose release-evidence gate is green) is handed to W2.

## Found on the way, fixed

`server/mcp/__tests__/mcp-tenant-tool-policy.test.ts` (`b835cf159`) paid a cold, lazy import of AnA's handler graph
inside its first test: 9.3 s and 8.7 s against a 10 s budget on trunk, and a 10 007 ms timeout once another suite
shared the fork. The import is now warmed in `beforeAll` (60 s hook budget); the same first call, the same assertions;
the test takes 3-4 ms and the connector set is 34/34 twice.
