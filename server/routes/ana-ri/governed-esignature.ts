/**
 * The e-signature ceremony of POST /api/ana-ri/governed-action, for the
 * 'esignature' tier: the signer's declared §11.50 meaning, then §11.200
 * re-verification of the signer. Split out of the route handler in utility.ts,
 * which calls it once and turns a refusal into the HTTP answer.
 *
 * §11.50(a)(3): an electronic signature states what it means, and the meaning
 * is the SIGNER's declaration. GovernedActionSignoff posts it as
 * params.signatureMeaning. It is read from the posted body, never from the
 * resolved action's params: on a held run those are the run row's, written by
 * the model, and a model cannot declare what a person's signature means. It is
 * checked before re-verification, so a refusal consumes no credential attempt,
 * and the caller runs this before the sign-off audit row, so a refusal records
 * and runs nothing.
 *
 * 2026-09-28 (coverage-gap sweep GP-P-2): the meaning was never read. The
 * route stamped `signaturePurpose: 'approval'` for every signer, so a person
 * who signed as author was recorded — on the FDA ESG transmit's signature row
 * — as having approved.
 */
import { resolveDeclaredSignatureMeaning } from '../../services/ana-ri/part11-governance.js';
import type { GovernedSignMeaning } from '../../services/part11/signature-meanings.js';
import { reverifySigner } from '../../services/part11/reverify-signer.js';
import { signerReverificationDeps } from '../../services/part11/reverify-signer-deps.js';

export type GovernedESignature =
  | {
      ok: true;
      /** The canonical meaning the signer declared. */
      meaning: GovernedSignMeaning;
      /** What reverifySigner actually checked: 'password' or 'password+mfa'. */
      authenticationMethod: 'password' | 'password+mfa';
      secondFactorVerified: boolean;
      /**
       * The instant the server actually verified the signer, observed here
       * rather than synthesised downstream. Handlers that hand the human gate
       * to an external gateway (FDA ESG transmit) pass it through as the
       * transmission's `reauthVerifiedAt`, so it must be a real observation.
       */
      verifiedAt: Date;
    }
  | { ok: false; status: number; error: string; code: string; details: { code: string } };

export async function verifyGovernedESignature(
  userId: number,
  body: Record<string, unknown>,
  /**
   * The meaning the act fixes (part11-governance.ts requiredSignatureMeaning),
   * or null when the signer chooses. Any other is refused here, before the
   * password is checked, as the status route refuses it (2026-10-01, D5).
   */
  requiredMeaning: GovernedSignMeaning | null = null,
): Promise<GovernedESignature> {
  const posted = body.params && typeof body.params === 'object' ? (body.params as Record<string, unknown>) : {};
  const declared = resolveDeclaredSignatureMeaning(posted.signatureMeaning);
  if (!declared.ok) {
    return { ok: false, status: 400, error: declared.error, code: declared.code, details: { code: declared.code } };
  }
  // Release is offered for the act that is signed with it (locking an
  // artifact) and is not a meaning any other action took before 2026-10-01.
  if (!requiredMeaning && declared.meaning === 'release') {
    const code = 'SIGNATURE_MEANING_UNKNOWN';
    return {
      ok: false,
      status: 400,
      error: "Release is the meaning of locking a document; this action is not signed with it. Nothing was run.",
      code,
      details: { code },
    };
  }
  if (requiredMeaning && declared.meaning !== requiredMeaning) {
    const code = 'SIGNATURE_MEANING_MISMATCH';
    return {
      ok: false,
      status: 400,
      error: `This action is signed with the meaning '${requiredMeaning}'. Nothing was signed.`,
      code,
      details: { code },
    };
  }
  const password = typeof body.password === 'string' ? body.password : '';
  const mfaToken = typeof body.mfaToken === 'string' ? body.mfaToken : undefined;
  const verification = await reverifySigner(userId, { password, mfaToken }, signerReverificationDeps());
  if (!verification.ok) {
    return {
      ok: false,
      status: verification.status,
      error: verification.error,
      code: 'SIGNATURE_REJECTED',
      details: { code: verification.code },
    };
  }
  return {
    ok: true,
    meaning: declared.meaning,
    authenticationMethod: verification.authenticationMethod,
    secondFactorVerified: verification.secondFactorVerified,
    verifiedAt: new Date(),
  };
}
