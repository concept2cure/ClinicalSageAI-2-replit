/**
 * Part 11 governance for AnA's chat-initiated commands.
 *
 * AnA can execute governed mutations directly from chat (place an artifact in
 * the dossier, revert a version, transition a milestone, freeze/sign/submit a
 * document). Under 21 CFR Part 11 those record-altering actions must capture a
 * reason-for-change AND a manifested electronic signature (§11.10, §11.50,
 * §11.200) before they take effect. This module is the SERVER-SIDE, fail-closed
 * gate: a governed command cannot run unless the dispatch carries a verified
 * sign-off.
 *
 * Enforcement is per-tenant (organizations.settings.anaPart11Enforce) and
 * defaults OFF, so the mechanism can ship ahead of the client e-signature UX
 * without breaking existing behavior; once the modal lands, a tenant flips the
 * flag and every governed AnA action is gated.
 *
 * Pure / deterministic except for {@link loadPart11Enforce}, which is a
 * fail-soft org-settings read (any DB issue → not enforced).
 */

/** AnA command names whose effect alters the regulatory record and therefore
 * requires a Part 11 reason-for-change + e-signature. Scoped deliberately to
 * record-altering mutations — drafting/search/list commands are not gated. */
export const PART11_GOVERNED_COMMANDS: ReadonlySet<string> = new Set<string>([
  'place_in_dossier',
  'revert_to_version',
  'create_milestone',
  'update_milestone',
  'update_artifact_status',
  'freeze_document',
  'sign_document',
  'submit_document',
  'create_submission_package',
]);

/** Minimum meaningful reason-for-change length (trimmed). */
export const MIN_REASON_FOR_CHANGE_LEN = 10;

/** The verified sign-off a client must supply for a governed command to run. */
export interface Part11Signoff {
  /** Free-text reason-for-change, recorded verbatim to the audit trail. */
  reasonForChange: string;
  /**
   * True only after the server has verified the user's re-authentication
   * (password and/or MFA) via the e-signature service for THIS dispatch.
   * Never trust a client-asserted value — the route stamps this.
   */
  signatureVerified: boolean;
  /** Id of the recorded electronic_signatures row, when one was written. */
  signatureId?: number;
  /** §11.50 signature meaning (authorship/review/approval/responsibility/release). */
  signaturePurpose?: string;
}

/** Does this command require a Part 11 sign-off before it may execute? */
export function requiresPart11Signoff(command: string): boolean {
  return PART11_GOVERNED_COMMANDS.has(command);
}

export interface SignoffValidation {
  ok: boolean;
  /** Machine code for the failure, for the client to branch on. */
  code?: 'MISSING_SIGNOFF' | 'MISSING_REASON' | 'REASON_TOO_SHORT' | 'SIGNATURE_NOT_VERIFIED';
  error?: string;
}

/**
 * Pure: validate a sign-off. Fail-closed — anything missing or unverified is a
 * rejection. Requires a non-trivial reason-for-change AND a server-verified
 * signature.
 */
export function validateSignoff(signoff: Part11Signoff | undefined): SignoffValidation {
  if (!signoff) {
    return { ok: false, code: 'MISSING_SIGNOFF', error: 'A Part 11 sign-off is required for this action.' };
  }
  const reason = typeof signoff.reasonForChange === 'string' ? signoff.reasonForChange.trim() : '';
  if (reason.length === 0) {
    return { ok: false, code: 'MISSING_REASON', error: 'A reason for change is required.' };
  }
  if (reason.length < MIN_REASON_FOR_CHANGE_LEN) {
    return {
      ok: false,
      code: 'REASON_TOO_SHORT',
      error: `The reason for change must be at least ${MIN_REASON_FOR_CHANGE_LEN} characters.`,
    };
  }
  if (signoff.signatureVerified !== true) {
    return {
      ok: false,
      code: 'SIGNATURE_NOT_VERIFIED',
      error: 'Your electronic signature could not be verified.',
    };
  }
  return { ok: true };
}

/** The structured fail-closed result returned when a governed command is
 * attempted without a valid sign-off. `openModal: 'esign'` cues the client to
 * collect the reason-for-change + signature, then retry with the sign-off. */
export function buildSignatureRequiredResult(
  command: string,
  validation: SignoffValidation,
  params?: Record<string, unknown>
): {
  success: false;
  action: string;
  error: string;
  message: string;
  openModal: 'esign';
  data: {
    reasonRequired: true;
    code: SignoffValidation['code'];
    /** Everything the client needs to re-submit via POST /governed-action. */
    retry: { command: string; params: Record<string, unknown> };
  };
} {
  return {
    success: false,
    action: command,
    error: 'PART11_SIGNATURE_REQUIRED',
    message:
      validation.error ??
      'This action alters a governed record and requires a reason for change and an electronic signature.',
    openModal: 'esign',
    data: { reasonRequired: true, code: validation.code, retry: { command, params: params ?? {} } },
  };
}

/**
 * Fail-soft org-settings read: is Part 11 enforcement enabled for this tenant?
 * Any DB issue → false (not enforced), mirroring loadAnaToolPolicy. Reads
 * organizations.settings.anaPart11Enforce (boolean).
 */
export async function loadPart11Enforce(
  pool: { query: (sql: string, params: unknown[]) => Promise<{ rows: any[] }> },
  organizationId: number
): Promise<boolean> {
  if (!Number.isFinite(organizationId) || organizationId <= 0) return false;
  try {
    const { rows } = await pool.query(
      `SELECT settings FROM organizations WHERE id = $1 LIMIT 1`,
      [organizationId]
    );
    return rows[0]?.settings?.anaPart11Enforce === true;
  } catch {
    return false;
  }
}
