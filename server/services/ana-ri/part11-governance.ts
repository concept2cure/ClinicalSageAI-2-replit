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
 * require, at minimum, a Part 11 reason-for-change. Scoped deliberately to
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
  // Applying AnA's onboarding proposals writes the organization profile on the
  // client's behalf, so it is governed: a reason-for-change is required and the
  // action is recorded. It is deliberately NOT in the e-sign set below — it
  // matches the bar the equivalent PATCH /organizations/:id/profile already
  // sets, and demanding re-authentication during first-run setup would land on
  // a client least equipped to satisfy it. Adding it to PART11_ESIGN_COMMANDS
  // escalates it centrally; the onboarding route consults that policy and fails
  // closed rather than continuing on a weaker path.
  'onboarding.apply_proposals',
]);

/**
 * High-impact subset: actions that alter the official record irreversibly or
 * change submission state. These require a manifested ELECTRONIC SIGNATURE
 * (re-authentication) in addition to a reason-for-change. The remaining governed
 * commands (milestone/status transitions) require a reason-for-change only.
 *
 * Tiered policy: reason-for-change always; e-signature for high-impact.
 */
export const PART11_ESIGN_COMMANDS: ReadonlySet<string> = new Set<string>([
  'place_in_dossier',
  'revert_to_version',
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

/** Does this command require a Part 11 sign-off (at least a reason-for-change)? */
export function requiresPart11Signoff(command: string): boolean {
  return PART11_GOVERNED_COMMANDS.has(command);
}

/** Does this command additionally require a manifested electronic signature
 * (re-authentication), not just a reason-for-change? */
export function requiresEsignature(command: string): boolean {
  return PART11_ESIGN_COMMANDS.has(command);
}

export interface SignoffValidation {
  ok: boolean;
  /** Machine code for the failure, for the client to branch on. */
  code?: 'MISSING_SIGNOFF' | 'MISSING_REASON' | 'REASON_TOO_SHORT' | 'SIGNATURE_NOT_VERIFIED';
  error?: string;
}

/**
 * Pure: validate a sign-off, fail-closed. A non-trivial reason-for-change is
 * ALWAYS required. A server-verified electronic signature is required only when
 * `opts.requireSignature` is true (the high-impact tier). Defaults to requiring
 * the signature, so callers that don't opt out get the strictest behavior.
 */
export function validateSignoff(
  signoff: Part11Signoff | undefined,
  opts: { requireSignature?: boolean } = {}
): SignoffValidation {
  const requireSignature = opts.requireSignature !== false;
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
  if (requireSignature && signoff.signatureVerified !== true) {
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
 * collect the reason-for-change (+ signature when `signatureRequired`), then
 * retry via POST /governed-action with the sign-off. */
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
    /** True for the high-impact tier (e-signature also required). */
    signatureRequired: boolean;
    code: SignoffValidation['code'];
    /** Everything the client needs to re-submit via POST /governed-action. */
    retry: { command: string; params: Record<string, unknown> };
  };
} {
  const signatureRequired = requiresEsignature(command);
  return {
    success: false,
    action: command,
    error: 'PART11_SIGNATURE_REQUIRED',
    message:
      validation.error ??
      (signatureRequired
        ? 'This action alters a governed record and requires a reason for change and an electronic signature.'
        : 'This action requires a reason for change.'),
    openModal: 'esign',
    data: {
      reasonRequired: true,
      signatureRequired,
      code: validation.code,
      retry: { command, params: params ?? {} },
    },
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

/**
 * True when this deployment runs under the immutable REGULATED PROFILE
 * (C2C_REGULATED_PROFILE=1). Under it, Part 11 governance must not be silently
 * removable by configuration or a database fault (G-04): enforcement DEFAULTS
 * ON and a settings-read failure FAILS CLOSED for governed commands. Outside the
 * profile the legacy opt-in behaviour (loadPart11Enforce) is preserved, so
 * enabling this is a deliberate per-deployment decision rather than a silent
 * behaviour change.
 */
export function isRegulatedProfile(): boolean {
  return process.env.C2C_REGULATED_PROFILE === '1';
}

export interface Part11EnforcementVerdict {
  /** Whether the governed-command gate is active for this dispatch. */
  enforced: boolean;
  /** True when the org-settings read threw — the caller must fail closed. */
  readFailed: boolean;
}

/**
 * Resolve Part 11 enforcement with an explicit read-failure signal (G-04).
 *
 * - Regulated profile: DEFAULT enforced (only an explicit `anaPart11Enforce:
 *   false` opts a tenant out), and a settings-read failure yields
 *   `enforced: true, readFailed: true` — the gate cannot be dropped by a DB
 *   outage, the fail-soft hole the finding named.
 * - Outside the profile: mirrors {@link loadPart11Enforce} (default OFF,
 *   read failure → not enforced), so existing behaviour is unchanged.
 */
export async function resolvePart11Enforce(
  pool: { query: (sql: string, params: unknown[]) => Promise<{ rows: any[] }> } | null | undefined,
  organizationId: number,
  opts: { regulated: boolean }
): Promise<Part11EnforcementVerdict> {
  const { regulated } = opts;
  if (!pool) {
    // No database handle: under the regulated profile we cannot prove a tenant
    // opted out, so we enforce (and mark the read as failed for the receipt).
    return { enforced: regulated, readFailed: regulated };
  }
  if (!Number.isFinite(organizationId) || organizationId <= 0) {
    return { enforced: regulated, readFailed: false };
  }
  try {
    const { rows } = await pool.query(
      `SELECT settings FROM organizations WHERE id = $1 LIMIT 1`,
      [organizationId]
    );
    const flag = rows[0]?.settings?.anaPart11Enforce;
    const enforced = regulated ? flag !== false : flag === true;
    return { enforced, readFailed: false };
  } catch {
    return { enforced: regulated, readFailed: regulated };
  }
}
