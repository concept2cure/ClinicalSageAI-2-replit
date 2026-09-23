/**
 * Electronic sign-off on approval-gated task completion (21 CFR Part 11).
 *
 * A unified task flagged `approvalRequired` used to render an "approval
 * checkpoint" chip with nothing behind it — any caller could PATCH it to
 * completed with no identity check and no record (assessment Phase 4 item,
 * "e-signature on regulated task sign-off"). Completing such a task now
 * demands a signature ceremony:
 *
 *   · the signer is re-verified by the platform's one signing ceremony
 *     (services/part11/reverify-signer.ts): the account password, the second
 *     factor when one is enrolled, and the account's lockout. Until
 *     2026-09-23 this was a separate signing PIN, which a session could set
 *     and which ignored the second factor (VSR-001 §13.3 item 3),
 *   · states the §11.50(a)(3) meaning of the signature and a reason,
 *   · and the verified manifestation (printed name, date/time, meaning) is
 *     appended to the task's `approvalHistory` and written to the governed
 *     audit ledger by the route.
 *
 * Without a signature the route answers 428 ESIGN_REQUIRED so clients open
 * the ceremony instead of silently failing. The credentials never reach any
 * log, audit payload, or response.
 *
 * @module server/services/tasking/task-signoff
 */
import { reverifySigner, type ReverifySignerDeps } from '../part11/reverify-signer';
import { signerReverificationDeps } from '../part11/reverify-signer-deps';
import { TASK_SIGNATURE_MEANINGS } from '../part11/signature-meanings';

export interface SignoffActor {
  userId: number | null;
  email: string | null;
  name?: string | null;
}

export interface SignoffSignature {
  password: string;
  /** The enrolled authenticator's current code; required when one is enrolled. */
  mfaToken?: string;
  meaning: string;
}

/** The §11.50 manifestation persisted into unified_tasks.approvalHistory. */
export interface SignoffManifestation {
  signedById: number | null;
  signedByName: string;
  meaning: string;
  reason: string;
  signedAt: string;
  /** What the ceremony verified. Signatures taken before 2026-09-23 read 'pin'. */
  method: 'password' | 'password+mfa' | 'pin';
}

export type SignoffResult =
  | { required: false }
  | { required: true; ok: true; manifestation: SignoffManifestation }
  | { required: true; ok: false; status: number; code: string; error: string };

/**
 * `approvers` is a `json` column, so it may hold anything a past writer put
 * there. Accept the two shapes that are meaningful — a bare array of user ids,
 * or an array of `{ userId }` records — and ignore everything else rather than
 * throwing. Returning [] means "no designation", which leaves the gate open;
 * that is the safe direction here because the alternative is bricking every
 * approval-gated task on a malformed value.
 */
function normaliseApprovers(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap(entry => {
    if (typeof entry === 'number' && Number.isInteger(entry)) return [entry];
    if (typeof entry === 'string' && /^\d+$/.test(entry)) return [Number(entry)];
    if (entry && typeof entry === 'object') {
      const id = (entry as { userId?: unknown }).userId;
      if (typeof id === 'number' && Number.isInteger(id)) return [id];
      if (typeof id === 'string' && /^\d+$/.test(id)) return [Number(id)];
    }
    return [];
  });
}

/** A refusal of the transition, shaped as the route returns it. */
type SignoffRefused = Extract<SignoffResult, { ok: false }>;

const refuse = (status: number, code: string, error: string): SignoffRefused => ({
  required: true,
  ok: false,
  status,
  code,
  error,
});

/**
 * What the ceremony needs before any credential is checked: a signature, a
 * meaning from the task vocabulary, a reason, and a signer the server can
 * re-verify (an account id). The refusal, or the four, checked.
 */
function ceremonyInput(
  signature: SignoffSignature | undefined,
  reason: string | undefined,
  userId: number | null,
): SignoffRefused | { signature: SignoffSignature; reason: string; signerId: number } {
  if (!signature) {
    return refuse(
      428, // Precondition Required — the client must run the ceremony
      'ESIGN_REQUIRED',
      'Completing this task requires an electronic signature: your password ' +
        '(and your authenticator code, if you use one), the meaning of the signature, and a reason.',
    );
  }
  if (!(TASK_SIGNATURE_MEANINGS as readonly string[]).includes(signature.meaning)) {
    return refuse(400, 'ESIGN_MEANING_INVALID', `Signature meaning must be one of: ${TASK_SIGNATURE_MEANINGS.join(', ')}.`);
  }
  if (!reason || reason.trim().length < 3) {
    return refuse(400, 'ESIGN_REASON_REQUIRED', 'A reason for the sign-off is required.');
  }
  if (userId === null || !Number.isInteger(userId) || userId <= 0) {
    return refuse(401, 'ESIGN_IDENTITY_REQUIRED', 'A verified signer identity is required to sign.');
  }
  return { signature, reason: reason.trim(), signerId: userId };
}

/**
 * Decide whether this transition needs a signature and, if so, verify it.
 * Pure apart from the signer's re-verification, whose dependencies default to
 * the production wiring; the caller persists the manifestation.
 */
export async function requireTaskSignoff(params: {
  organizationId: number;
  task: {
    taskId: string;
    title: string;
    approvalRequired: boolean | null;
    approvalStatus: string | null;
    /** `unified_tasks.approvers` — the designated signers for this checkpoint.
     *  See the enforcement note in the body. */
    approvers?: unknown;
  };
  toStatus: string;
  actor: SignoffActor;
  signature?: SignoffSignature;
  reason?: string;
  /** The ceremony's dependencies; production wiring unless a test injects them. */
  deps?: ReverifySignerDeps;
}): Promise<SignoffResult> {
  const { task, toStatus, actor, signature, reason } = params;

  const needsSignoff =
    toStatus === 'completed' &&
    task.approvalRequired === true &&
    task.approvalStatus !== 'approved';
  if (!needsSignoff) return { required: false };

  // Designated-approver scoping.
  //
  // `unified_tasks.approvers` names who may clear this checkpoint. Where it is
  // populated we enforce it: identity alone is not authority, and a verified signer
  // proves only that the signer is who they say they are, not that they are the
  // person the workflow nominated.
  //
  // Where it is EMPTY the gate stays open to any org member who can sign, and
  // that is a real, known limitation rather than an oversight: nothing
  // in the product writes this column yet and there is no UI to nominate
  // approvers, so enforcing an empty list would lock every approval-gated task
  // permanently. Quorum and role-based gate types are NOT implemented — the
  // surface copy must not claim they are. Closing that gap means a designation
  // UI plus a quorum policy, which is a feature, not a guard.
  const designated = normaliseApprovers(task.approvers);
  if (designated.length > 0 && (actor.userId === null || !designated.includes(actor.userId))) {
    return {
      required: true,
      ok: false,
      status: 403,
      code: 'ESIGN_NOT_DESIGNATED_APPROVER',
      error:
        'This approval checkpoint is assigned to specific approvers, and you are not one of them.',
    };
  }

  const input = ceremonyInput(signature, reason, actor.userId);
  if ('ok' in input) return input;
  const { signature: sig, reason: why, signerId } = input;

  const verified = await reverifySigner(
    signerId,
    { password: sig.password, mfaToken: sig.mfaToken },
    params.deps ?? signerReverificationDeps(),
  );
  if (!verified.ok) {
    return {
      required: true,
      ok: false,
      // A wrong password or code refuses the act, not the session: 403, as the
      // PIN's refusals were, so the client does not read it as signed out.
      status: verified.status === 401 ? 403 : verified.status,
      code: `ESIGN_${verified.code}`,
      error: verified.error,
    };
  }

  return {
    required: true,
    ok: true,
    manifestation: {
      signedById: signerId,
      signedByName: actor.name || actor.email || `User ${signerId}`,
      meaning: sig.meaning,
      reason: why,
      signedAt: new Date().toISOString(),
      method: verified.authenticationMethod,
    },
  };
}

export { TASK_SIGNATURE_MEANINGS };
