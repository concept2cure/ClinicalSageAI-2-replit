/**
 * Whether this deployment can deliver a login verification code, and what it
 * says when it cannot.
 *
 * Login OTP is the default mandatory second factor, so this is the question of
 * whether anyone can sign in at all. Three routes ask it — POST
 * /api/auth/login, POST /api/auth/mfa/resend, and the enterprise
 * verify-password door — and it must have the same answer in all three, which
 * is why it is one module and not three env reads.
 *
 * ── What was wrong ──────────────────────────────────────────────────────────
 * All three minted a code, fired `sendLoginOtpEmail` without awaiting it, and
 * answered `success: true` with the masked address — unconditionally. With no
 * SMTP credentials on a production server `sendLoginOtpEmail` logs an error and
 * returns, so the code reaches nobody; the routes still told the person a code
 * had been sent to their address, and the resend route said it in words: "A new
 * verification code has been sent to your email." A tester then waits on that
 * screen for a message that cannot arrive, with no way to tell this from a slow
 * mail server, and the product reads as broken for an unknowable reason.
 *
 * That is the state `scripts/ops/pilot-go-no-go.mjs` measures and calls the
 * decisive blocker: "SMTP_HOST + SMTP_USER + SMTP_PASS MISSING —
 * getTransporter() returns null, so login OTP emails are never sent and NO
 * tester can complete a login."
 *
 * The sign-up handler in `routes/auth.ts` already refuses on exactly this
 * condition, and says why in its own comment: "A deployment that cannot mail
 * the link … refuses the sign-up rather than create an account nobody can
 * activate." This module is that rule applied to the other half of the door.
 *
 * @module server/services/auth/login-code-delivery
 */
import { isEmailConfigured } from '../email/smtp-config';

/**
 * Whether a login verification code can reach the person who just asked for
 * one.
 *
 * True when SMTP is configured. Also true on a non-production server, where
 * `sendLoginOtpEmail` writes the code to the debug log and a developer reads it
 * there — that is a real channel for a laptop, and a laptop must not hide the
 * login from the person building the product.
 *
 * False means no channel exists: the code is generated, mailed nowhere, and
 * logged nowhere a user can reach.
 */
export function canDeliverLoginCode(): boolean {
  return isEmailConfigured() || process.env.NODE_ENV !== 'production';
}

/**
 * What a login route says when it cannot deliver the code.
 *
 * One sentence in one place, because three routes say it. It names the server
 * as the cause so the person stops retrying, clears their account so they do
 * not start resetting a password that is fine, and names no setting — the
 * caller has verified a password, not earned a configuration report.
 */
export const LOGIN_CODE_UNDELIVERABLE_MESSAGE =
  'We could not send your verification code, so sign-in cannot be completed. ' +
  'This is a problem with the server, not with your account — contact your administrator.';

/** The audit reason recorded for a challenge that could not be delivered. */
export const LOGIN_CODE_UNDELIVERABLE_REASON = 'mfa_challenge_email_undeliverable';

/** The error code all three routes answer with, so one client branch matches all three. */
export const LOGIN_CODE_UNDELIVERABLE_CODE = 'AUTH_OTP_UNDELIVERABLE';
