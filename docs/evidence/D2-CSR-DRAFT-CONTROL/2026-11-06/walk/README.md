# Running-app walk of the CSR drafting lane's shipped screens, 2026-11-06: started, then stopped

RULE 4: a screen is not done until it was opened in the running app and used. This lane shipped several pieces with
tests only:
- P-72 slices 1a and 1b (`ae12195a5`, `a06ae96c8`);
- CSR drafting slices 3–4 (`0f4bc4f2c`);
- folds F4 and F6 (`970bc3637`).

This walk was to open each of them. **The account's monthly spend limit stopped the walk after its first step.** This
README records exactly that step and nothing more.

## What already exists

- Five human-test lanes walked the product on 2026-11-06. Their records are `docs/evidence/HUMAN-TEST/README.md` and
  J1–J5:
  - J1 covers sign-in, Home, Projects, New project and the project page;
  - J3 covers the one editor;
  - J5 covers the rail's other destinations, Reporting included.
- None of them names the drafting panel's alternatives, revise or passage controls, the device section of Reporting,
  the Client Review Room on a device project's Review step, or the pre-auth lookups' new owner. Those are this walk's
  subject.
- This walk reuses J3's pattern: `walk-scripts/common.cjs.txt`, with Playwright and a sign-in through the emailed code.

## How it ran

- **Database.** A fresh `lanew` on the local PostgreSQL 16, built by the repository's own path: install-fresh,
  `deploy-migrate`, seed-admin and `demo:seed` (`provision.mjs` exit 0). `pgvector` 0.6.0 was installed first.
- **Server.** It ran as the runtime role `app_service`, with `RLS_ENFORCE=on`, `LAUNCH_SCOPE_ENFORCE=on`, no model key
  and dev sign-in off, so sign-in takes the emailed code. The command is `walk-scripts/start-server.sh.txt`, with the
  password redacted.
- **Credentials.** Personas are the seeded local accounts. Their passwords are read from the environment and are not
  committed.

## Walked: sign-in and the password-reset request (P-72 slice 1a), at 1440 and 390 px

`ae12195a5` removed the custom `SET` clause from `user_id_for_email`, `user_id_for_reset_token` and
`invitations_for_member`, re-owned them by the NOLOGIN role `c2c_platform_scope`, and gave each read policy that
role's arm. Sign-in and the reset request reach the first of these through `server/services/auth/pre-auth-account.ts`.

| Step | Seen | Server log |
|---|---|---|
| Sign in as the seeded owner | "Verify it's you", with the code sent to the masked address (`shots/a-1440-light-code-screen.png`) | The password check passed; a login code was issued (dev: logged, SMTP not configured) |
| Forgot password, same address | "Check your email" (`shots/a-1440-light-forgot.png`, `…-reset-sent.png`) | A reset link with a token was issued for that account |
| Sign in as a member of a second organization (`nadia.empty@harbor-lane.example`) | The same code screen (`shots/a-1440-light-nadia-code-screen.png`) | A login code was issued |
| A wrong password | "Incorrect email or password. If you were invited and have not set a password yet, open the link in your invitation or reset your password." (`shots/a-1440-light-wrong-password.png`) | Refused; no code issued |
| A wrong code | "Invalid or expired verification code. Each code works once; if you just used it, wait for the next." (`shots/a-1440-light-wrong-code.png`) | Refused |
| The same screens at 390 px | Sign-in, the code screen, forgot and reset sent fit the width, with nothing clipped (`shots/a-390-light-*.png`) | — |

Apart from the two deliberate refusals, no permission error, 4xx or 5xx was logged on these paths. So the re-owned lookups answer in the running app, as the
runtime role with RLS enforced, on a database the migration set built.

**One thing seen, for the shell's owner:** the sign-in pages rendered the light page under the dark colour scheme
too, byte-identical at 1440 px and a few bytes apart at 390 px. So the dark captures were dropped. Whether the sign-in
page should follow the system scheme is D1's to decide. It may simply not offer dark mode.

## Not walked, because the walk stopped

- the drafting panel: one draft, three alternatives, revise, and "Offer alternatives" on a passage. Without a model key
  each must refuse honestly. Real drafting needs a key this environment does not have;
- Reporting's device section, on an organization with device projects and on one with none (F4);
- Projects' last activity, the Client Review Room on a device project's Review step, and the retired ids opened by
  address (F6);
- the audit-chain verdict on a screen, which must not say "verified" over nothing (P-72 slice 1b);
- the signed-in screens at 390 px and in dark mode.

They are the next walk, from these scripts and this database recipe.
