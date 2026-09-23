# D6 — security posture: sign-in and signing credentials, 2026-09-23

**Launch row:** D6, security posture (`docs/LAUNCH_DEFINITION_OF_DONE.md`).
**Scope:** VSR-001 §13.3 items 1, 2 and 4, plus the defects of the same kind
found while mapping them.

**Posture of every real-database proof here:**
- Database `c2c_d6_repro`, provisioned from empty by
  `scripts/db/provision-test-db.sh`: install-fresh, then `deploy-migrate` over
  the whole migration set, including `20260923_users_mfa_totp_last_step.sql`.
- Each test mints its own `NOSUPERUSER NOBYPASSRLS` runtime role and runs with
  `RLS_ENFORCE=on`, dev-login closed, and production's own
  `registerPlatformRoutes` and global `/api` gate.
- Only `Date` is faked, so TOTP time steps are chosen, not read off the clock.

**"Red"** means the same test run against the code before the fix. The fixed
files were copied from `HEAD` for that run, then restored. Each file in `red/`
says which files that was.

## 1. What was wrong, and what is true now

| # | Defect | Before the fix (red) | After the fix (green) | Commit |
|---|---|---|---|---|
| 1 | **A TOTP code was accepted more than once** (§13.3 item 1). It was accepted again until its ±1-step window closed, on every path that verifies one: password sign-in, enterprise sign-in, and every signature (`reverifySigner`). RFC 6238 §5.2. | 15 of 16 cases fail. The same code opened two sessions (200/200). Two concurrent sign-ins with one code both opened. A code used on one sign-in path opened a session on the other. `red/dbtest-one-time-credentials-before-fix.txt` | 17 of 17 pass. `users.mfa_totp_last_step`; a code is accepted only for a later step, compared and set in one `UPDATE … WHERE … RETURNING`. `green/dbtest-one-time-credentials-after-fix.txt` | `a689ad680` |
| 1a | The e-sign modal's pre-check (`/api/esignature/verify-mfa`) would have spent the code the signature then needs. | (new behaviour) | The pre-check uses the non-consuming `isTokenCurrentlyAcceptable`. Checking twice leaves the code unused; the signature uses it; after that it neither checks nor signs. | `a689ad680` |
| 1b | The e-sign pre-checks (`/verify-password` and `/verify-mfa`) were guessing oracles, limited only by the 600-a-minute session budget. | The limiter case fails (no 429). | Each is limited per signer: 10 per 5 minutes, on separate budgets. **Not closed:** the signing endpoints (`/api/esignature/sign`, the `verifyReauth` routes) answer the same credential question and are still unlimited per signer (§4 item 3). | `a689ad680` |
| 1c | **The emailed sign-in code** was read, compared and cleared in separate statements. | 3 of 8 concurrent requests with one code were accepted. 12 concurrent wrong guesses left the right code usable. | Counting and consuming are conditional UPDATEs: exactly 1 of 8 is accepted, and the 5-attempt limit holds under concurrency. | `a689ad680` |
| 1d | **The password-reset token** was read, then written by account id alone, with a bcrypt hash in between. | Two resets with one token both reported success (200/200); the later password won silently. | The password is written only while the token is still this account's and unexpired: 200/400, and the reported password is the stored one. | `a689ad680` |
| 1e | **The TOTP secret was sent to a third party.** The enrolment QR code was an `https://api.qrserver.com/…?data=otpauth://…secret=…` address, so any client that displayed it disclosed the seed. | (unit) | Drawn on the server as a `data:image/png` URL, which never contains the secret. | `a689ad680` |
| 4 | **The session misstated the account** (§13.3 item 4). `/api/auth/session` reported `mfaEnabled:false, mfaMethods:[], mustChangePassword:false` for every account. `/mfa/verify` reported `true` for every account and echoed the request's `method`. `/api/users/me` reported `mfaMethods:[]`. | 4 of 6 fail. `red/dbtest-sign-in-posture-item4-before-fix.txt` | One reading of the account (`server/services/mfa-enrolment.ts`), the one the sign-in challenge uses, now serves the challenge, session, `/mfa/verify`, dev-login and `/api/users/me`. | `75d3069a2` |
| 4a | Enterprise `check-email` answered `mfaRequired` from the account before any credential, which singled out enrolled accounts. | Enrolled ≠ unknown. `red/dbtest-check-email-before-fix.txt` | One answer for every address, with no lookup. | `75d3069a2` |
| 4b | **A session alone replaced an enrolled authenticator.** `/mfa/setup` overwrote the secret of an enabled factor, with no current code asked for. A stolen session could make its own authenticator the account's second factor, at sign-in and on every signature. | Both routers answered 200. After two setup calls the owner's own code could no longer remove the factor (401). `red/dbtest-mfa-setup-over-live-factor-before-fix.txt` | **Fixed by F-26** (`0c912e67e`, W3 session; found in parallel): `generateSecret` refuses while a factor is enrolled, in one statement, and `/api/auth/mfa/setup` answers 409 (pinned by `tests/db/second-factor-binding.dbtest.ts`). This session's part: the enterprise router's `/mfa/setup` reached the same refusal and answered it with a 500; it now answers 409 `MFA_ALREADY_ENABLED` (`tests/db/sign-in-posture.dbtest.ts`). | F-26; item-2 commit |
| 2 | **The client address was forgeable** (§13.3 item 2, second half). About 20 sites read X-Forwarded-For by hand and took the left-most entry, which the client writes. Affected: `electronic_signatures`, QMS approvals, financial-disclosure signatures, the §11.10(e) trail observer, c2c `sign`, 27 c2c audit rows via `getClientIp`, EULA clickwrap, and the enterprise `/api/auth` limit's key. The collapse half (no `trust proxy`) was fixed by F-24, `eefac757b`, in another session. | `ci:client-ip-single-source` finds 26 sites on the pre-sweep tree (`red/gate-client-ip-single-source-before-sweep.txt`). The enterprise limit is escaped by claiming a new address each attempt (`red/unit-enterprise-auth-limiter-key-before-fix.txt`). | One reader, `server/utils/client-ip.ts` (`req.ip`, as the trust-proxy hop count resolves it). `getClientIp` is deleted. The limiters key by `req.ip`, with IPv6 bucketed by /56. The gate (CI and pre-push, 17-case self-test) forbids reading forwarding headers and forbids `trust proxy` outside `server/index.ts`. | item-2 commit |
| 2a | An audit route took the IP from the request body (`body.ipAddress \|\| req.ip`). | (by reading) | It takes the request's own address. | item-2 commit |
| 2b | **Password-reset poisoning.** Without `APP_URL`, reset and invitation links were built on the request's Host header. The load balancer accepts direct connections, so `POST /forgot-password` naming a victim with `Host: attacker.example` emailed the victim a live token on the attacker's domain. | The emailed link carries the attacker's Host (`red/unit-reset-link-origin-before-fix.txt`). | In production the link origin is an https `APP_URL` or nothing. Without one, reset refuses every address alike (503) and stores no token. The deploy preflight requires `APP_URL`. | item-2 commit |
| 2c | SCIM `meta.location`, `security.txt` and `enforceHttps` read raw `X-Forwarded-Proto` / `X-Forwarded-Host`. | (gate) | They use `req.protocol` and `req.get('host')`. | item-2 commit |
| 2d | **The gate's comment stripper was blind after a `/*` inside a string.** A CSP source such as `'https://*.neon.tech'` opened a "comment" that hid everything up to the next `*/`: 859 lines across 10 server files, the security middleware among them. Found by the adversarial review. | A read inserted into `enterprise-security.ts` at line 260 was not reported (`red/gate-comment-stripper-before-fix.txt`). | `scripts/ci/lib/strip-comments.mjs` is string-, template- and escape-aware and is used by this gate and `ci:unapproved-model-pins`; the self-test gained three cases. 23 other gate scripts still use the old regex (§4 item 8). | review commit |
| 1f | **A new authenticator's first code was refused because of the old one's last step.** `mfa_totp_last_step` survived disable and re-setup, so a code the new secret had never presented, in the same 30 s as the disable, read as used. Found by the adversarial review. | Mutant M10 (the reset removed) fails the re-enrolment case. | `generateSecret` clears the last step together with storing a new secret; the enable refusals say a code works once. | review commit |
| 1g | The emailed code's concurrency test bounded the attempts below 12, not at 5. Found by the adversarial review. | Mutant M11 (six attempts) passed the old test. | Boundary cases: the right code is accepted after 4 wrong guesses and refused after 5. M11 is killed. | review commit |

## 2. Mutation checks

`green/mutations-one-time-credentials.txt`: every fix of item 1 was mutated
one at a time and the real-database suite run.
- 12 of 13 mutants are killed (M10 and M11 were added after the review). Among them: accepting the same step, a
  read-then-write instead of compare-and-set, a consuming pre-check, email
  consumption not conditional on the stored code, an unbounded attempt count,
  both pre-check limiters removed, and the pre-fix reset write.
- The read-then-write mutant is killed only by the eight-way race, 5 of 5
  times. The two-request HTTP race serialises too much to catch it, which is
  why the eight-way case exists.
- The survivor, M9, drops the token condition from the reset write while
  keeping the expiry condition. It is equivalent under every interleaving the
  suite can force; the file says why.

## 3. Tests added or changed

- `tests/db/one-time-credentials.dbtest.ts`: new, 20 cases.
- `tests/db/sign-in-posture.dbtest.ts`: new, 8 cases.
- `tests/db/sign-in-audit-trail.dbtest.ts`: its enterprise block moved to a
  second member. It had presented step N-1 after N+1 was accepted, and passed
  only because of the defect.
- `tests/services/mfaService.test.ts`: consume-once, pre-check, QR, and a unit case for F-26's setup
  guard.
- `server/services/__tests__/mfa-enrolment.test.ts`.
- `server/utils/__tests__/client-ip.test.ts`.
- `server/middleware/__tests__/enterprise-auth-limiter-key.test.ts`.
- `tests/services/password-setup-token.test.ts` and
  `server/routes/__tests__/passwordResetAuditTrail.test.ts`: link origin, and
  a used reset token.
- Four harnesses that set `trust proxy: true`, a value production never has,
  now use production's hop count. The SCIM allow-list gained a
  leaked-token-plus-claimed-address case (403).

## 4. Open, and for the owner

These were found while mapping, and each needs a decision rather than a patch:

1. **Recovery codes are issued but never redeemable, and a TOTP user can
   finish sign-in with an emailed code.**
   - `enableMfa` returns ten recovery codes that no verifier accepts.
   - `/mfa/resend` mints an emailed code for any challenge, TOTP ones included.
   - `/mfa/verify` and enterprise `verify-mfa` accept it.
   - So enrolling an authenticator does not raise sign-in assurance; signing
     still requires the authenticator.
   - Closing the email path alone would leave a user who loses the device with
     no way back in, since there is no admin reset.
   - Recommendation: make recovery codes redeemable at the login challenge only
     (consumed atomically, like the TOTP step), then refuse the emailed code
     for accounts with an authenticator.
2. **The load balancer accepts traffic from the internet**, not only from
   CloudFront. This is a launch blocker for D1, not only an attribution gap.
   - With one trusted hop (F-24), CloudFront-routed requests record the
     CloudFront edge, not the user.
   - Every limiter keyed by `req.ip` counts CloudFront-routed users per edge
     address: F-24's sign-in and MFA limits (10 per 15 minutes), and now the
     enterprise `/api/auth` limit (5 per 15 minutes in production). Its old key,
     the left-most entry, was per user but written by the client, so anyone
     could escape it. The forgeable key is not a safe interim answer, and a
     shared per-edge budget can be used up by one person for everyone at that
     edge. SAML SSO makes two `/api/auth` requests per sign-in. The adversarial
     review reproduced six viewers behind one edge: the sixth was refused for
     15 minutes.
   - Recording the user needs the ALB security group restricted to CloudFront's
     origin-facing prefix list, and `TRUST_PROXY_HOPS=2`.
   - SCIM, MCP and the deploy smoke test reach the ALB directly today, and
     would each need a CloudFront behaviour.
   - Also found, for D1:
     - The CloudFront origin is the ALB's DNS name with `https-only`, which
       CloudFront cannot validate against the app certificate.
     - The `/api/*` behaviour uses legacy `forwarded_values`, so CloudFront
       replaces `User-Agent` in every audit row and drops headers not listed.
3. **The signing endpoints are not limited per signer**: `/api/esignature/sign` and the
   `verifyReauth` routes answer the same credential question as the limited
   pre-checks. They need the same budget, counted on failed checks only, in a
   shared store.
   **Rate limits are per task.** Every `express-rate-limit` instance uses the
   in-process store, and production runs two tasks. A per-user attempt budget
   needs the shared (Redis) store. The sign-in code limit is also per IP only;
   a per-challenge or per-account budget is stronger.
4. **`APP_URL` is not in the Terraform task definition.** The deploy preflight
   now refuses a task definition without it. The Terraform module does not yet
   express most of the boot contract (D1).
5. **Authoring e-sign is PIN-only** (§13.3 item 3, with the reviewer), and
   `submission-sign-release` asks for no second factor.
6. **Some signing surfaces keep a code that has been spent**: RBM approvals,
   governed-action sign-off and eSTAR filing. The server's refusals now say
   "each code works once; wait for the next".
7. **Evidence timing on deploy.** The rolling update keeps old tasks serving
   until they drain. A live replay probe filed as post-fix evidence must run
   after the rollout completes.
8. **23 other CI gate scripts strip comments with the string-unaware regex**,
   so they may have the blind spot 2d fixed, where they scan JS/TS. Among them: `check-action-overclaim`,
   `check-fabricated-identity`, `check-migration-drop-safety`,
   `check-pq-evaluation-callers`. Each should move to
   `scripts/ci/lib/strip-comments.mjs`, and each owner should check what the
   move newly reports.

## 5. Reproduce

```
C2C_TESTDB=c2c_d6_repro APP_SERVICE_DB_ROLE=app_service_d6 bash scripts/db/provision-test-db.sh
U='postgresql://postgres@127.0.0.1:5432/c2c_d6_repro?sslmode=disable'
TEST_DATABASE_URL=$U DATABASE_URL=$U RLS_ENFORCE=on \
  npx vitest run --config vitest.db.config.ts \
  tests/db/one-time-credentials.dbtest.ts tests/db/sign-in-posture.dbtest.ts tests/db/sign-in-audit-trail.dbtest.ts
npm run ci:client-ip-single-source:selftest && npm run ci:client-ip-single-source
```

Prepared by the D6 Claude session. It cannot sign.
