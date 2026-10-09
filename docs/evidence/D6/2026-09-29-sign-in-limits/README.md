# D6 — sign-in limits are per account; an office behind one address can sign in (2026-09-29)

**Row:** D6 (security posture).
**Hand-on:** "→ D6, unclaimed — the sign-in limiter counts per client IP, not
per account". It comes from the validation package run of 2026-09-27
(VSR-001 §18.4, `docs/work-orders/README.md`).
**Claim:** `1adc4ec2b`.

## What was wrong

Every layer in front of sign-in counted a client **address**, and most of them
counted successful sign-ins too. A sign-in is two requests: the password, then the
second factor. In production, per address, per 15 minutes:

| Layer | Limit | Counted |
|---|---|---|
| Redis `/api` limiter, `auth` bucket (`platform-limits.ts`) | 20 | every request |
| `routes/auth.ts` `loginLimiter` | 10 | every request |
| `routes/auth.ts` `mfaLimiter` (verify and resend) | 10 | every request |
| enterprise `/api/auth` limiter (`enterprise-security.ts`) | 5 | failures |

About ten colleagues behind one office address could sign in per quarter hour,
and the eleventh was refused. Five typos or five expired sessions answering 401
refused the whole address.

While the load balancer trusts one hop, "one address" is a CloudFront edge, and
an edge is shared by every customer it serves (`enterprise-auth-limiter-key.test.ts`).

The only brute-force guard on the second factor was the address's 10. Wrong
authenticator and recovery codes counted nothing per account.

## What changed

The account is what is protected. An address is limited only in what it gets
wrong, and in raw volume. All the numbers live in one place:
`SIGN_IN_LIMITS` in `server/config/platform-limits.ts`.

| Guard | Keyed by | Counts | Production |
|---|---|---|---|
| password lockout (unchanged, `auth-security-service`) | account | failures | 5, then locked |
| `signInLimits.login` (new, `middleware/sign-in-limits.ts`) | the address signed in with, normalised; client address when none | failures | 10 / 15 min |
| `signInLimits.secondFactor` (new) | the account the **verified** challenge names; client address when invalid | failures | 10 / 15 min |
| enterprise `/api/auth` | client address | failures | **50** / 15 min (was 5) |
| Redis `auth` bucket | client address (anonymous) / credential / address for credentialed | every request (volume) | **600** / 300 / 3,000 (was 20 / 20 / none) |

No layer counts a successful sign-in against the address it came from. The
Redis bucket also gains a per-address guard for credentialed traffic. Before,
rotating unverified credentials on sign-in requests bought a fresh allowance each
time. `redisRateLimiter.ts` itself is unchanged, because its numbers come from
`platform-limits.ts`.

## Shown failing first

[`fail-before.txt`](fail-before.txt): all 7 fail on the previous sources, and 7 of 7 pass on the fix.

- `server/routes/__tests__/auth-sign-in-limits.test.ts` uses the **real** auth
  router (database mocked, as in the neighbouring auth tests):
  - forty colleagues from one address complete both steps, and none is refused.
    Before: the eleventh was refused at both steps. Probed with the old router:
    `200/200` ×10, then `429/429`;
  - failed passwords for one account are refused past 10, keyed on the
    normalised address, and a colleague at the same address still signs in;
  - wrong second-factor codes for one account are refused past 10, and the next
    account is not;
  - successful sign-ins spend nothing.
- `server/middleware/__tests__/sign-in-office-address.test.ts` uses the Redis and
  enterprise limiters **imported with `NODE_ENV=production`** and mounted as
  production mounts them:
  - a hundred colleagues, twenty of whom mistype first, from one address: none
    refused. Before: **200 refusals**, the first at colleague 10;
  - a sprayer from one address is still stopped at 50 failures, and another
    address is untouched.
- **Mutation:** with the per-account key replaced by the client address, the two
  per-account tests fail.

## Live, on the running app

[`live-before-after.jsonl`](live-before-after.jsonl). The second signer, a real
account, signed in 15 times from one address on the dev server:

| Code | Result |
|---|---|
| before (previous sources, swapped in) | `200` ×10, then `429` ×5 |
| after | `200` ×15 |

Also live, on the fixed code: 12 guesses at an address with no account got `401`
×10, then `429`. The second signer then signed in from the same address: `200`.

## Tests updated, with the reason in each

- `redisRateLimiter-identity-key.test.ts` asserted that the `auth` bucket has no
  per-credential ceiling ("a login carries no bearer credential"). Sign-in carries
  none. The session calls under `/api/auth` do, and they now have a ceiling, with
  a per-address guard against rotation.
- `tests/config/platform-limits.test.ts`: production `auth` 20 → 600.

## Gates

- Middleware, auth-route, config and startup suites: 103 files, 911 tests.
- `tsc`: 0 errors.
- ESLint ratchet: no file gained a warning.
- `auth.ts` is 18 lines shorter.

## Handed on

- **Validation lane:** the OQ harness "waits the window out" between runs
  (VSR-001 P-9). It no longer needs to for one account's sign-ins: only failures
  count now. VSR-001's text records the old behaviour and is that lane's document.
- **Multi-task production:** `express-rate-limit`'s default memory store is per
  process. With two API tasks, each account's and address's allowance is per
  task, a factor of two, not a hole. This is the production-configuration lane's
  (row "two API tasks + a worker … no Redis").
