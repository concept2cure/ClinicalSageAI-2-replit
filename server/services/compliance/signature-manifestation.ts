/**
 * 21 CFR Part 11 §11.50 signature manifestation — pure renderer.
 *
 * §11.50 requires that signed electronic records carry, in any human-readable
 * form (display or print), the THREE elements of the signature: the printed
 * name of the signer, the date and time of signing, and the meaning of the
 * signature (e.g. review, approval, authorship). The platform captures all of
 * this in concept2cure_signatures but had no formatted block to embed in the
 * rendered document — this closes that gap.
 *
 * Pure and deterministic (no DB, no I/O): the loader/tool feeds it a signature
 * record and it returns the human-readable block plus the structured required
 * fields, so the formatting is directly unit-testable.
 */

export interface SignatureManifestInput {
  signatureId: string;
  signerName: string;
  signerEmail?: string | null;
  signerRole?: string | null;
  signatureType: string; // approval | review | witness | acknowledgment | authorship
  signaturePurpose?: string | null;
  signatureMeaning?: string | null;
  signedAt: Date | string;
  authenticationMethod?: string | null;
  secondFactorVerified?: boolean | null;
  signatureHash?: string | null;
  ipAddress?: string | null;
  recordTitle?: string | null;
}

/** The three §11.50-required elements, isolated for programmatic use. */
export interface RequiredManifestFields {
  printedName: string;
  dateTimeUtc: string;
  meaning: string;
}

/** Format a Date/ISO string as "YYYY-MM-DD HH:MM:SS UTC" (stable, tz-explicit). */
export function formatSignedAtUtc(signedAt: Date | string): string {
  const d = signedAt instanceof Date ? signedAt : new Date(signedAt);
  if (Number.isNaN(d.getTime())) return 'unknown';
  return `${d.toISOString().slice(0, 19).replace('T', ' ')} UTC`;
}

/** The signature's meaning per §11.50 — explicit meaning, else the type, with purpose. */
export function manifestMeaning(input: SignatureManifestInput): string {
  const base = (input.signatureMeaning || input.signatureType || 'signature').trim();
  const purpose = input.signaturePurpose?.trim();
  return purpose && purpose.toLowerCase() !== base.toLowerCase() ? `${base} — ${purpose}` : base;
}

/** The three required §11.50 fields, isolated. */
export function requiredManifestFields(input: SignatureManifestInput): RequiredManifestFields {
  return {
    printedName: input.signerName.trim(),
    dateTimeUtc: formatSignedAtUtc(input.signedAt),
    meaning: manifestMeaning(input),
  };
}

/**
 * Render the human-readable signature manifestation block to embed in the
 * rendered record. Leads with the three §11.50-required elements, then the
 * supporting controls (authentication, signature id/hash) that make the
 * signature defensible on inspection.
 */
export function renderSignatureManifestation(input: SignatureManifestInput): string {
  const req = requiredManifestFields(input);
  const signer = [req.printedName, input.signerRole?.trim(), input.signerEmail?.trim()]
    .filter(Boolean)
    .join(', ');

  const lines: string[] = [
    'Electronic Signature — 21 CFR Part 11 §11.50',
    `  Signed by:    ${signer}`,
    `  Date & time:  ${req.dateTimeUtc}`,
    `  Meaning:      ${req.meaning}`,
  ];

  const auth: string[] = [];
  if (input.authenticationMethod) auth.push(input.authenticationMethod.trim());
  if (input.secondFactorVerified) auth.push('MFA verified');
  if (auth.length) lines.push(`  Authentication: ${auth.join('; ')}`);

  const idParts: string[] = [`ID ${input.signatureId}`];
  if (input.signatureHash) idParts.push(`hash ${input.signatureHash.slice(0, 16)}…`);
  lines.push(`  Signature:    ${idParts.join('; ')}`);

  if (input.recordTitle) lines.push(`  Record:       ${input.recordTitle.trim()}`);

  return lines.join('\n');
}
