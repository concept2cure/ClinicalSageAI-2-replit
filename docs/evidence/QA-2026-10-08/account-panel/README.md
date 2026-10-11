# P-25 — the account panel (QA 2026-10-08)

**Decision:** P-25 in `docs/LAUNCH_DEFINITION_OF_DONE.md`. From the shell's account menu, a signed-in person can
see their profile, change their password, and enrol or remove an authenticator app.
**Row:** D6, Security posture. Without this panel, the authenticator that ADR-0014 §4 expects of signers could not be
enrolled anywhere in the product. This evidence does not turn D6 green. It removes one blocker.
**State:** built, tested, and checked in the browser. Not committed.

## What existed, and what was reused

| Looked for | Found | Outcome |
|---|---|---|
| An account, profile or settings surface (grep; `git log --all --diff-filter=D -- 'client/**/*Account*' 'client/**/*Profile*' 'client/**/*Settings*'`, and the lower-case, Mfa, Password and Security variants) | Deleted: `useUserProfileFromStorage.ts` (a32a0067c, a hook), `DeviceProfile*` (46044c426, device profiles, unrelated), `legacy-esign/useSecurityContext.tsx` (26c050077). None of them rendered an account panel. | No earlier surface to restore. The panel is new. |
| A component that renders MFA setup (`mfa/setup`, `otpauth`, `TOTP` in `client/`) | None. `EsignModal` asks for a code at signing time and does not enrol. `authService` had `setupTotp`, `verifyTotpSetup`, `disableMfaMethod`, `getMfaMethods` and `generateBackupCodes`. They called `/mfa/totp/setup`, `/mfa/totp/verify`, `DELETE /mfa/:method`, `/mfa/methods` and `/mfa/backup-codes`. **None of these routes exists, and nothing called the methods.** | Those five were replaced in place by `setupMfa`, `enableMfa` and `disableMfa`, which call the server's real routes. There is one auth client and no parallel one. |
| A password change | `authService.changePassword` → `POST /password/change`, with no UI caller. Its request type declared `terminateOtherSessions`, which the route does not read. | Reused. The field the route ignores was removed from the type. |
| The 401 rule (ddc8c0db5, `unauthorizedMeansSession`) | In `authService`'s `ApiClient`. | Every panel call goes through it. Checked on this screen; see below. |
| Dialog vocabulary | The `de-*` drawer (`journey-v2.css`), `useDialog`, `EmptyState` and `ErrorState`, plus `acct-sep` and `mono`. | Only existing classes are used. No new CSS. |

The panel is a dialog that belongs to the account menu. It is not a routed surface, so it has no registry row and no
launch-scope row. `ci:launch-scope` and `ci:surface-discoverability` pass unchanged (`05-gates-and-tsc.txt`).

## Route contracts used (server/routes/auth.ts, unchanged)

| Route | Body | Success | Refusals the panel shows in the server's words |
|---|---|---|---|
| `GET /session` | — | `user`: name, e-mail, `organizationName`, `roles[0]` = the membership role from `organization_users` | Any failure is shown as an error with **Try again**, never as an empty panel. |
| `POST /password/change` | `{ currentPassword, newPassword }` | Ends **every** session that began before the change, this one included (IAM-04) | 401 AUTH_001 "Current password is incorrect"; 400 AUTH_001 policy, with every entry of `details.errors`; reuse; history |
| `POST /mfa/setup` | — | `{ secret, otpauthUrl, qrCode }`, where `qrCode` is a `data:` URL drawn on the server | 409 MFA_ALREADY_ENABLED |
| `POST /mfa/enable` | `{ code }` | `{ backupCodes }`, kept only as hashes on the server, so this is the one time they can be shown | 401 AUTH_004 (code wrong or already used) |
| `POST /mfa/disable` | `{ code }`, a current 6-digit authenticator code (recovery codes are refused) | — | 401 AUTH_004 "Invalid verification code" |

Rate limits: none of these four routes has its own limiter. Only the `/api/auth` per-address **failure** bucket applies
(`SIGN_IN_LIMITS.failuresPerIp`: 50 per 15 min in production, 100 in development). A 429 reaches the panel as the
server's "Too many requests".

## Tests: red, then green

| File | What it shows |
|---|---|
| `01-red.txt` | 13 of 13 fail: 12 new tests against a placeholder panel, plus the admin copy test pinned to the new wording. |
| `02-green.txt` | 13 of 13 pass. With every `services/portal` auth test in the same run, 40 of 40. |
| `03-mutation-401-rule.txt` | With `unauthorizedMeansSession` reverted to "every signed-in 401 is a session", exactly the three refusal tests fail: wrong current password, wrong enrolment code, wrong removal code. The file was restored byte-identical. |
| `04-mutation-css-gate.txt` | An undefined class planted in the panel fails `ci:undefined-css-classes`. Restored. |
| `07-existing-shell-auth-mfa-tests.txt` | 156 files and 2,112 tests pass: every Shell, auth, MFA and AdminSurfaces client test, plus the new ones. |

The panel tests (`client/src/concept2cure/v2/__tests__/accountPanel.test.tsx`) run the real `AuthProvider` and the
real `authService` singleton. Only `fetch` is stubbed, and it answers at the real paths (`/api/v1/auth/...`) with the
server's own bodies. The tests check that:

- the menu lists Account first, the panel opens, and focus returns to the account button on close;
- the profile shows the server's values, read-only;
- a failed read shows an alert with a retry, and no form;
- a wrong current password shows the server's refusal, with no "Session expired", no refresh, no sign-out, and a request body of exactly the two fields;
- every policy reason is listed;
- a mismatched confirmation sends nothing;
- a successful change says every session ended, and "Sign in again" signs out;
- enrolment shows the server's QR code and key, enables Confirm only for 6 digits, sends `{ code }`, and shows the recovery codes once (they are kept in no storage, and Done removes them);
- the status is re-read from the server;
- a wrong enrolment code shows the refusal and leaves the key on screen;
- a 409 on setup is shown;
- a QR code that is not a `data:` URL is never loaded;
- a refused removal is shown, and a good code removes the authenticator.

`adminSetupMfaCopy.test.tsx` used to pin "Enrolling an authenticator app is not offered in this product yet". That
sentence became false with this change. It now pins "Each person sets up an authenticator app from Account in the
account menu."

## Browser after-check: http://localhost:5078 against `c2c_qa`

Harness: `harness/run.mjs`, which imports the committed QA lib. The account was `qa-onboard-2@concept2cure.pro`, a
throwaway. Results: `browser-results.json`. Console and HTTP log: `browser-http-and-console.json`. The only 4xx
responses are the two deliberate refusals; the certificate errors in the log already appear in earlier QA runs.
**19 passed, 0 failed, 1 not verifiable.**

- **A known password from the product's own flow.** A re-invite cannot re-issue a setup link here, because both
  throwaway accounts have set a password. The re-invite route only re-issues for a hash that still starts with `invite:`.
  So the harness asked for a reset (`POST /password/reset-request`) and read the dev mail sink, which is the server log,
  the same way the QA lib reads emailed sign-in codes. **Before using the link**, it checked that the token's sha256
  equals `users.reset_token` for qa-onboard-2, using read-only SQL. It then set a random password on the product's reset
  page, and confirmed that `users.password_changed_at` moved.
- `01`: the account menu lists Account first. The profile matches the database: QA Onboard 2,
  qa-onboard-2@concept2cure.pro, Concept2Cure Therapeutics, member.
- `02`: a wrong current password shows "Current password is incorrect". There is no "Session expired", and the session
  stays.
- `03`: the change goes through, and the panel says every session ended. "Sign in again" opens sign-in, and the new
  password signs in.
- `04`: setup shows the server-drawn QR code and the 32-character key, both masked in the screenshot. A TOTP computed
  from the key in the harness confirms it.
- `05`: ten recovery codes are shown once (masked). The status, re-read from the server, says "Set up", and
  `mfa_enabled = true`. Done removes the codes.
- **Not verifiable here:** whether sign-in now asks for the authenticator. The QA app runs with `ALLOW_DEV_AUTH=1`
  (`.env`), and with that set `/login` skips every second factor. The server logs "Dev mode — MFA skipped" for
  user 33.
- `06`: removal with `000000` shows "Invalid verification code", with no "Session expired".
- `07`: a fresh code removes the authenticator. The status says "Not set up", and `mfa_enabled = false`.

jm.smith and sarah.chen were not touched: their `password_changed_at` dates are from 2026-10-07 23:22, and neither has
an authenticator. The throwaway account ends the run with no authenticator and with a random password that was never
recorded.

Secrets: the key, QR image, recovery codes, codes, passwords and reset token stay in harness memory. Screenshots mask
the key, QR code and code list. Text dumps are redacted against every secret the run held, and the run ends by grepping
its own output for each one ("no secret in …").

## Lint and types

`06-lint.txt`: no changed file has more ESLint warnings than at HEAD, and the two new files have none. The scoped `tsc`
over the six changed files and their imports exits 0, and it reported TS2322 when a type error was planted in the panel
(`05-gates-and-tsc.txt`).

## Not verified

- That sign-in asks for the authenticator after enrolment. The QA app's `ALLOW_DEV_AUTH=1` bypasses it. This needs an
  instance without that flag.
- That electronic signatures ask for the code after enrolment. The panel's copy states it from
  `reverify-signer.ts` (an `mfaToken` is required when MFA is enabled), but no signature was applied in this run.
- A real 429 from the failure bucket. It is not exercised.
- Mobile width and dark mode, which were not captured.

## Decisions for the founder

1. **Editing one's own name.** `PATCH /api/users/me` writes `name`, but it validates nothing and records no audit
   event. The name is the printed name on future signatures (past ones snapshot `signer_name`). The panel shows the
   name read-only. To make it editable, the route first needs validation and an audit row.
2. **`GET /session` invents an organisation.** It answers `organizationName: 'Concept2Cure'` when the token names no
   organisation or the row is missing. The panel shows what the server says, so it inherits this. It should be null.
3. **ADR-0014 P1-2b is not enforced.** Nothing requires owners, administrators or signers to use an authenticator.
   Signing asks for a code only when one is enrolled. Enrolment is now possible, but the requirement is a separate
   piece of work.
4. **No per-account limit on wrong codes at `/mfa/enable` and `/mfa/disable`.** Only the per-address failure bucket
   applies. `mfaFailuresPerAccount` covers `/mfa/verify` only.
5. **`authService.updateProfile`** calls `PATCH /api/v1/auth/profile`, which does not exist, and has no caller. It was
   left in place. Remove it, or point it at the outcome of decision 1.
