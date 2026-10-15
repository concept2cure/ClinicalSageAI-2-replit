/**
 * The verified factors, for every CMC electronic signature.
 *
 * ── Signing authority (P0-10b fix round, security audit 2026-09-24 DP-02) ───
 * The CMC batch release (batchRecordRoutes.ts), the specification approval
 * (specificationRoutes.ts), the register qualification / validation
 * (routes.ts, qualifyRegisterRecord) and the Module 3 section approval
 * (module3OperatingSystemRoutes.ts) each ran verifyReauth and nothing else.
 * verifyReauth proves WHO is signing (§11.200). It does not ask whether that
 * person may sign (§11.10(g): identity is not authority), so any member of the
 * organization, a read-only viewer included, who knew their own password could
 * release a batch, approve a specification or qualify a register record.
 *
 * ── The order, in each handler ───────────────────────────────────────────────
 *   1. checkSigningAuthority (services/part11/signing-authority-gate), the
 *      platform's one policy: the role from the membership row, never the
 *      token or the body                     403 ESIGNATURE_NO_AUTHORITY
 *                                            503 SIGNING_AUTHORITY_UNVERIFIED
 *   2. verifyReauth, in the handler itself   401 REAUTH_*
 *   3. the ledger sign and the signature row, recording verifiedReauthFactors
 *
 * This file held its own copy of step 1 (refusedWithoutSigningAuthority) until
 * 2026-10-08 (P-27: one signing-authority policy); a failed role lookup there
 * answered 500 where the gate answers 503. Each handler now asks the gate.
 * verifyReauth stays in each handler on purpose: ci:sign-ceremony proves a
 * `sign` write is ceremonied by finding the re-verification, and the authority
 * check, in the same handler, and it cannot see one moved behind a helper.
 *
 * @module server/api/cmc/cmc-signer
 */

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
