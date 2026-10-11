/**
 * §11.10(g) — may this signer sign at all? The platform's one check, asked
 * before any credential is compared.
 *
 * Identity is not authority: re-authentication (verifyReauth, reverifySigner)
 * proves who is signing, never that they may. The answer comes from the
 * signer's role on the membership row (resolveSignerOrgRole), never the token
 * or the body, held to the one signing policy (isSigningAuthorized: admin,
 * approver, reviewer by default; P-18, managers do not sign).
 *
 * This began as the governed signature ceremony's private
 * `assertSigningAuthority` (services/part11/governed-signature-ceremony.ts,
 * cf950eeb9). It moved here on 2026-10-08 (QA j6, the Gateway transmit) so a
 * route that signs through its own handler asks the same question in the same
 * words instead of writing another copy. Kept out of resolve-signer-role.ts on
 * purpose: tests replace resolveSignerOrgRole with a module mock, and a check
 * living in the same module would call the real one past the mock.
 *
 * Each caller answers in its own envelope; the status, code and sentence are
 * this module's, so every refusal reads the same.
 *
 * @module server/services/part11/signing-authority-gate
 * @compliance 21 CFR Part 11 §11.10(d), §11.10(g)
 */
import { resolveSignerOrgRole } from './resolve-signer-role';
import { isSigningAuthorized } from './signing-authority';

/** The sentence every signing route gives a role without signing authority. */
export const NO_SIGNING_AUTHORITY_MESSAGE =
  'Your role does not permit applying an electronic signature (21 CFR Part 11 §11.10(g)). Nothing was signed.';

/** The sentence when the role could not be read; the cause is logged, never shown. */
export const SIGNING_AUTHORITY_UNVERIFIED_MESSAGE =
  'Your signing authority could not be checked, so nothing was signed. Try again; if this continues, contact your administrator.';

export type SigningAuthorityRefusal =
  | { status: 403; code: 'ESIGNATURE_NO_AUTHORITY'; message: string }
  | { status: 503; code: 'SIGNING_AUTHORITY_UNVERIFIED'; message: string };

/**
 * Null when the signer's role carries signing authority in this organization;
 * otherwise the refusal to answer, before the password is asked for and before
 * anything is written. A lookup that cannot run refuses (fail closed).
 */
export async function checkSigningAuthority(userId: number, orgId: number): Promise<SigningAuthorityRefusal | null> {
  let role: string | null;
  try {
    role = await resolveSignerOrgRole(userId, orgId);
  } catch (err) {
    console.error('[signing-authority] signer role lookup failed:', err instanceof Error ? err.message : err);
    return { status: 503, code: 'SIGNING_AUTHORITY_UNVERIFIED', message: SIGNING_AUTHORITY_UNVERIFIED_MESSAGE };
  }
  if (isSigningAuthorized(role)) return null;
  return { status: 403, code: 'ESIGNATURE_NO_AUTHORITY', message: NO_SIGNING_AUTHORITY_MESSAGE };
}
