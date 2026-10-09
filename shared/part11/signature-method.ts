/**
 * How a signature was authenticated, as its human-readable form states it
 * (21 CFR §11.50(b)). One wording for the authoring Signatures rail, the Task
 * board's approval history and the authoring export's signature manifest.
 *
 * The stored value is what the signing ceremony verified
 * (server/services/part11/reverify-signer.ts): 'password' or 'password+mfa'
 * ('password+totp' on governed actions). Signatures taken before 2026-09-23 on
 * the authoring loop and the Task board carry 'PIN' / 'pin', the credential
 * those surfaces used until it was retired; they keep their own wording.
 */
export function describeSignatureMethod(
  method: string | null | undefined,
  pinVerified?: boolean | null,
): string {
  switch (method) {
    case 'password+mfa':
    case 'password+totp':
      return 'Password and authenticator code, re-verified at signing';
    case 'password':
      return 'Password, re-verified at signing';
    case 'PIN':
    case 'pin':
      return pinVerified ? 'Signing PIN, verified at signing' : 'Signing PIN';
    case null:
    case undefined:
    case '':
      return 'Not recorded';
    default:
      return method;
  }
}
