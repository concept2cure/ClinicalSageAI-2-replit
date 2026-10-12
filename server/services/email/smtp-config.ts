/**
 * Whether this deployment has SMTP credentials — the one definition.
 *
 * A leaf module with no imports, so the predicate can be read from anywhere
 * (the mail service, the sign-up refusal, the login-code refusal) without
 * pulling in nodemailer or the templates, and without a test's mail-service
 * double having to restate it.
 *
 * Three places asked this question in three ways before: `getTransporter()`'s
 * own `if (!host || !user || !pass)`, `isEmailConfigured()`, and the sign-up
 * handler through the second of those. They agreed, and nothing kept them
 * agreeing.
 *
 * @module server/services/email/smtp-config
 */

/**
 * True when SMTP is configured enough to actually deliver mail.
 *
 * Login OTP is the default mandatory second factor, so when this is false in
 * production NO user can complete a login — callers use it to fail loud at
 * boot, and to refuse rather than claim, instead of letting the failure surface
 * silently one tester at a time.
 */
export function isEmailConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}
