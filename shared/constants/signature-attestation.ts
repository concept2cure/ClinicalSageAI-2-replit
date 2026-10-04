/**
 * The statement of intent a person signs when they sign an action AnA proposed,
 * one text for both sides (21 CFR 11.100(b); §11.50).
 *
 * GovernedActionSignoff shows it beside the password and the declared meaning;
 * where a signature records the signer's statement, the server records this
 * same text (AnA approving or locking an artifact, server/services/ana-ri/
 * ana-signed-artifact-act.ts, into the signature's manifest and the lock's
 * snapshot). Two copies could disagree, and then the record would name a
 * statement nobody was shown.
 */
export const GOVERNED_SIGNATURE_ATTESTATION =
  'By signing, you confirm the §11.50 meaning above and your 21 CFR 11.100(b) intent. Your credentials are verified at signing and are not reused from this session.';
