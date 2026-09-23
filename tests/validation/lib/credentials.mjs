/**
 * Tester credentials for the CREDENTIALED steps of the OQ protocols.
 *
 * Dev-login (the harness's authentication) issues a session without a
 * password factor, by design. A Part 11 signing act re-authenticates with the
 * account password (§11.200): `POST /api/mdx/qms/documents/:id/approve`
 * (OQ-QMS-05) and `POST /api/c2c/actions/sign` (OQ-SUBC-08). Those steps are
 * therefore executed by a tester who HOLDS a password, supplied only through
 * the environment — never a default, never guessed, never written to a record
 * (the harness redacts every `password` key it sees; runners never echo it).
 *
 *   OQ_SIGNER_EMAIL     the signing identity (must hold signing authority:
 *                       org role admin / approver / reviewer — §11.10(g))
 *   OQ_SIGNER_PASSWORD  that identity's password
 *   OQ_SIGNER_TOTP_SECRET  the secret of the signer's enrolled TOTP factor, for a
 *                       server that requires MFA at login (every server that is
 *                       not a development one). The signer always signs in with
 *                       its password (POST /api/auth/login), never dev-login.
 *   OQ_AUTHOR_EMAIL     optional; the identity that authored the fixtures
 *                       (defaults to the run identity, VALIDATION_USER_EMAIL).
 *                       The signer must differ from it — the two-person rule
 *                       (§11.10(d)) refuses an author approving their own record.
 *
 * When the credential is absent the step is recorded as a deviation with
 * CREDENTIAL_NOT_SUPPLIED as its reason, and every step depending on it is
 * not-executed. Nothing is simulated.
 */
import { TEST_USER_EMAIL, passwordLogin } from './harness.mjs';
import { freshTotp } from './totp.mjs';

export const CREDENTIAL_NOT_SUPPLIED =
  'not executed — credential not supplied: set OQ_SIGNER_EMAIL and OQ_SIGNER_PASSWORD to a second identity that holds signing authority (and is not the author) to execute this credentialed step.';

/**
 * A current code from the signer's authenticator, never one already presented,
 * or undefined when no TOTP secret was supplied. Every signing endpoint requires
 * it when the signer has a second factor enrolled (§11.200), so a supplied
 * secret asserts that one is.
 */
export async function signerCode(signer) {
  return signer.totpSecret ? freshTotp(signer.email, signer.totpSecret) : undefined;
}

/** The signer credential from the environment, or null when not supplied. */
export function signerCredential() {
  const email = (process.env.OQ_SIGNER_EMAIL || '').trim().toLowerCase();
  const password = process.env.OQ_SIGNER_PASSWORD || '';
  if (!email || !password) return null;
  const authorEmail = (process.env.OQ_AUTHOR_EMAIL || TEST_USER_EMAIL).trim().toLowerCase();
  return { email, password, totpSecret: process.env.OQ_SIGNER_TOTP_SECRET || '', authorEmail };
}

/**
 * Resolve the credentialed signer for a step: deviation when not supplied,
 * deviation when it is the author's own identity (the step could only observe
 * the two-person refusal, not the positive signature). Returns the credential
 * plus the signer's session, opened with its password.
 */
export async function requireSigner({ deviation, expect }, baseUrl, authorEmailOverride = null) {
  const cred = signerCredential();
  if (!cred) deviation(CREDENTIAL_NOT_SUPPLIED);
  const authorEmail = (authorEmailOverride ?? cred.authorEmail).toLowerCase();
  if (cred.email === authorEmail) {
    deviation(
      `not executed — OQ_SIGNER_EMAIL is the author identity (${authorEmail}); the two-person rule (§11.10(d)) needs a second identity to observe a positive signature.`,
    );
  }
  let session;
  try {
    session = await passwordLogin(baseUrl, cred);
  } catch (e) {
    expect(false, `signer identity ${cred.email} could not open a session: ${e.message}`);
  }
  return { ...cred, session };
}
