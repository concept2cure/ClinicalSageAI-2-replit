/**
 * Signing authority, and the verified factors, for every CMC electronic signature.
 *
 * ── Why this exists (P0-10b fix round, security audit 2026-09-24 DP-02) ──────
 * The CMC batch release (batchRecordRoutes.ts), the specification approval
 * (specificationRoutes.ts) and the register qualification / validation
 * (routes.ts, qualifyRegisterRecord) each ran verifyReauth and nothing else.
 * verifyReauth proves WHO is signing (§11.200). It does not ask whether that
 * person may sign (§11.10(g): identity is not authority), so any member of the
 * organization, a read-only viewer included, who knew their own password could
 * release a batch, approve a specification or qualify a register record. Since
 * P0-10b each of those acts also writes an electronic_signatures row, which
 * gave the viewer's act the standing of a signature.
 *
 * ── The order, in each of the three handlers ─────────────────────────────────
 *   1. refusedWithoutSigningAuthority: the signer's role from the membership
 *      row (resolveSignerOrgRole), never the token or the body, against the
 *      platform's one signing policy (isSigningAuthorized)  403 ESIGNATURE_NO_AUTHORITY
 *   2. verifyReauth, in the handler itself                  401 REAUTH_*
 *   3. the ledger sign and the signature row, recording verifiedReauthFactors
 *
 * Authority comes before the password, as in signGovernedAct
 * (server/routes/governed-signed-act.ts), so a signer who may not sign spends no
 * password guess and nothing is written. verifyReauth stays in each handler on
 * purpose: ci:sign-ceremony proves a `sign` write is ceremonied by finding the
 * re-verification in the same handler, and it cannot see one moved behind a
 * helper.
 *
 * @module server/api/cmc/cmc-signer
 */
import type express from 'express';
import { serverError } from '../../lib/api-response';
import { resolveSignerOrgRole } from '../../services/part11/resolve-signer-role';
import { isSigningAuthorized } from '../../services/part11/signing-authority';
import { createScopedLogger } from '../../utils/logger';

const log = createScopedLogger('cmc-signer');

/**
 * True when the request has been answered: the signer's role carries no signing
 * authority (403), or the role could not be read (500, no error text). Run it
 * before verifyReauth and before any transaction is opened.
 */
export async function refusedWithoutSigningAuthority(
  res: express.Response,
  signer: { userId: number; orgId: number },
): Promise<boolean> {
  let role: string | null;
  try {
    role = await resolveSignerOrgRole(signer.userId, signer.orgId);
  } catch (err) {
    serverError(res, log, 'resolving the CMC signer role', err);
    return true;
  }
  if (isSigningAuthorized(role)) return false;
  res.status(403).json({
    success: false,
    error: 'ESIGNATURE_NO_AUTHORITY',
    message: 'Your role does not permit applying an electronic signature (21 CFR Part 11 §11.10(g)). Nothing was signed.',
  });
  return true;
}

/** The §11.200 factors verifyReauth checked, as the electronic_signatures row records them. */
export interface VerifiedReauthFactors {
  authenticationMethod: 'password' | 'password+totp';
  secondFactorVerified: boolean;
}

/**
 * The factors of a re-authentication verifyReauth accepted. verifyReauth
 * refuses a presented code that does not verify, even for a signer with no
 * second factor enrolled, so a code here is a verified one. The three routes
 * each wrote this out themselves.
 */
export function verifiedReauthFactors(reauth: { totp?: string } | undefined): VerifiedReauthFactors {
  return reauth?.totp
    ? { authenticationMethod: 'password+totp', secondFactorVerified: true }
    : { authenticationMethod: 'password', secondFactorVerified: false };
}
