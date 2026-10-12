# D6 — a login code that can reach nobody is refused, not claimed

**Row:** D6 (security posture — sign-in defects)
**Workstream:** W3b
**Date:** 2026-10-12
**Head before:** `be20b53d9`

## The defect, as a tester meets it

`scripts/ops/pilot-go-no-go.mjs` returns **NO-GO** on this deployment, and its
decisive line is:

> SMTP_HOST + SMTP_USER + SMTP_PASS MISSING — `getTransporter()` returns null,
> so login OTP emails are never sent and NO tester can complete a login.

That is a configuration gap, and setting those three variables is not something
code can do. What code *was* doing made it far worse: all three login routes
minted a verification code, fired `sendLoginOtpEmail` **without awaiting it**,
and answered `success: true` with the masked address — unconditionally.

| Route | What it answered with no SMTP |
|---|---|
| `POST /api/auth/login` | `{ success: true, mfaRequired: true, maskedEmail: 'jo**@…' }` |
| `POST /api/auth/mfa/resend` | `{ success: true, message: 'A new verification code has been sent to your email.' }` |
| `POST /api/auth/enterprise/verify-password` | `{ success: true, requiresMfa: true, mfaMethod: 'email', maskedEmail }` |

The middle one states it outright: **a sentence of fact about something that
provably did not happen.** A tester then waits on that screen for a message that
cannot arrive, with no way to tell this from a slow mail server, and the product
reads as broken for an unknowable reason. Each resend spent one of the
challenge's limited `MAX_RESENDS` doing it, so the tester also burned their
remaining attempts on codes nothing could deliver.

Login OTP is the **default mandatory second factor**, so this is not an edge
case — it is the front door.

The repository had already written down the right answer, 200 lines above the
first of these three sites. `routes/auth.ts`'s sign-up handler refuses on
exactly this condition, and says why in its own comment:

> A deployment that cannot mail the link, or has no public origin to build it
> on, refuses the sign-up rather than create an account nobody can activate.

The rule existed. It had just never been applied to the other half of the door.

## What changed

### `server/services/email/smtp-config.ts` (new) — one definition

Three places asked "is SMTP configured" in three ways: `getTransporter()`'s own
`if (!host || !user || !pass)`, `isEmailConfigured()`, and the sign-up handler
through the second. They agreed, and nothing kept them agreeing. The predicate
is now a leaf module with **no imports**, so it can be read from anywhere
without pulling in nodemailer and the templates — and, because nothing mocks it,
without any of the nine mail-service doubles in the test suite having to restate
it. `emailService` re-exports `isEmailConfigured` from it, so every existing
importer and every existing mock is untouched, and `getTransporter()` now reads
the same predicate.

### `server/services/auth/login-code-delivery.ts` (new) — one answer for three routes

```ts
export function canDeliverLoginCode(): boolean {
  return isEmailConfigured() || process.env.NODE_ENV !== 'production';
}
```

The second clause is deliberate and is the reason this is a module rather than
an inline `isEmailConfigured()` call. Off production, `sendLoginOtpEmail` writes
the code to the debug log and a developer reads it there — that is a real
channel, and a laptop must not hide the login from the person building the
product. False means **no channel exists**: generated, mailed nowhere, logged
nowhere a user can reach.

The message, the error code and the audit reason live beside it, because three
routes say the same thing and one client branch matches all three.

### The three routes

Each now computes deliverability **before** minting anything, and:

- answers **503 `AUTH_OTP_UNDELIVERABLE`** with the shared sentence,
- mints no code and sends no mail,
- names no address a code went to (no `maskedEmail`, no `challengeId`, no
  `partialToken`),
- spends none of the challenge's resend budget,
- and records the audit event as `outcome: 'failure'`, reason
  `mfa_challenge_email_undeliverable`.

That last point is the Part 11 half. The event was recorded `outcome: 'success'`
with reason `mfa_challenge_email` before the send was even attempted, so an
inspector reading the ledger would conclude the account received a code. The
ledger now says the challenge was never issued, rather than issued and ignored.

**An authenticator account is untouched.** TOTP needs no emailed code, so
nothing about mail may stand between it and its challenge — pinned by a case in
each route's test file.

### What the message says, and does not say

> We could not send your verification code, so sign-in cannot be completed.
> This is a problem with the server, not with your account — contact your
> administrator.

It names the server so the person stops retrying, clears their account so they
do not start resetting a password that is fine, and names no setting: the caller
has verified a password, not earned a configuration report. A test asserts it
mentions no `SMTP*`, `NODE_ENV`, `getTransporter`, `nodemailer` or `.ts` path.

This discloses a misconfiguration to a caller who has already passed the
password check, so it is not an anonymous probe and reveals nothing the existing
`requiresMfa` answer did not. The sign-up path, which *is* anonymous, keeps its
vaguer wording for that reason.

### No client change was needed, and none was made

I patched `Concept2CureLogin.tsx` to stop attributing this error to the password
field, then reverted it: `error.field` is **never read** in that component — the
only `.field` matches are CSS class names, and the error always renders in one
page-level alert (`:479-483`) in the server's own words. The patch was a no-op,
so it is not in this change. `ZenLogin.tsx` does read `field`, but `ZenRouter`
mounts `Concept2CureLogin`, so it is not the reachable screen. A case was added
to `signInRefusal.test.tsx` instead, pinning that the sentence survives the page
and that nothing about it reads as a rejected password.

## Verified by making each check fail

| Suite | Against pre-fix code | Against the fix |
|---|---|---|
| `server/services/auth/__tests__/login-code-delivery.test.ts` | **1 failed / 8 passed** — predicate forced to `true`, the pre-fix assumption | **9 passed** |
| `server/routes/__tests__/auth-login-code-undeliverable.test.ts` | **6 failed / 3 passed** — `auth.ts` restored from `HEAD` | **9 passed** |
| `server/routes/__tests__/authEnterprise-login-code-undeliverable.test.ts` | **3 failed / 2 passed** — `authEnterprise.ts` restored from `HEAD` | **5 passed** |
| `client/.../signInRefusal.test.tsx` | n/a — asserts page behaviour that needed no change | **3 passed** |

Across the two route files: **9 refusal cases failed and all 5 control cases
passed** against the pre-fix routes. The controls matter as much as the
failures — they are what distinguishes "the refusal works" from "nothing works".

## Repo-wide gates

| Gate | Result |
|---|---|
| `npx tsc --noEmit -p tsconfig.json` | exit 0 |
| Every test file that mocks `services/emailService`, plus the new suites | **16 files / 173 tests passed** |
| `npm run ci:internals-in-copy` | see commit |
| `npm run check:microcopy` | see commit |

The 16-file run is the one that matters for the re-export: nine of those files
mock `services/emailService` without `isEmailConfigured`, and all nine stay
green because the predicate moved to a module nothing mocks.

## What this does not fix

**SMTP is still unset.** This change makes the failure honest and auditable; it
does not make login work. `pilot-go-no-go` will still return NO-GO on the mail
gate until `SMTP_HOST`, `SMTP_USER` and `SMTP_PASS` are set in the deployment
environment — which is a founder/operator action, not a code change. The
difference is that a tester now gets a sentence telling them to contact an
administrator, instead of a screen that waits forever.

The other two hard gates `pilot-go-no-go` reports (schema 0/4 core tables, the
demo-admin check erroring) are untouched here.
