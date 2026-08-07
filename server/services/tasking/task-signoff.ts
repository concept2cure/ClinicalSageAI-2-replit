/**
 * Electronic sign-off on approval-gated task completion (21 CFR Part 11).
 *
 * A unified task flagged `approvalRequired` used to render an "approval
 * checkpoint" chip with nothing behind it — any caller could PATCH it to
 * completed with no identity check and no record (assessment Phase 4 item,
 * "e-signature on regulated task sign-off"). Completing such a task now
 * demands a signature ceremony:
 *
 *   · the signer re-authenticates with their signing PIN (same `user_pins`
 *     store + bcrypt + lockout policy as document sealing — see
 *     services/part11/pin-verification),
 *   · states the §11.50(a)(3) meaning of the signature and a reason,
 *   · and the verified manifestation (printed name, date/time, meaning) is
 *     appended to the task's `approvalHistory` and written to the governed
 *     audit ledger by the route.
 *
 * Without a signature the route answers 428 ESIGN_REQUIRED so clients open
 * the ceremony instead of silently failing. The PIN itself never reaches any
 * log, audit payload, or response.
 *
 * @module server/services/tasking/task-signoff
 */
import {
  verifySigningPin,
  TASK_SIGNATURE_MEANINGS,
} from '../part11/pin-verification';

export interface SignoffActor {
  userId: number | null;
  email: string | null;
  name?: string | null;
}

export interface SignoffSignature {
  pin: string;
  meaning: string;
}

/** The §11.50 manifestation persisted into unified_tasks.approvalHistory. */
export interface SignoffManifestation {
  signedById: number | null;
  signedByName: string;
  meaning: string;
  reason: string;
  signedAt: string;
  method: 'pin';
}

export type SignoffResult =
  | { required: false }
  | { required: true; ok: true; manifestation: SignoffManifestation }
  | { required: true; ok: false; status: number; code: string; error: string };

/**
 * Decide whether this transition needs a signature and, if so, verify it.
 * Pure apart from the PIN check; the caller persists the manifestation.
 */
export async function requireTaskSignoff(params: {
  organizationId: number;
  task: {
    taskId: string;
    title: string;
    approvalRequired: boolean | null;
    approvalStatus: string | null;
  };
  toStatus: string;
  actor: SignoffActor;
  signature?: SignoffSignature;
  reason?: string;
}): Promise<SignoffResult> {
  const { organizationId, task, toStatus, actor, signature, reason } = params;

  const needsSignoff =
    toStatus === 'completed' &&
    task.approvalRequired === true &&
    task.approvalStatus !== 'approved';
  if (!needsSignoff) return { required: false };

  if (!signature) {
    return {
      required: true,
      ok: false,
      status: 428, // Precondition Required — the client must run the ceremony
      code: 'ESIGN_REQUIRED',
      error:
        'Completing this task requires an electronic signature: your signing PIN, ' +
        'the meaning of the signature, and a reason.',
    };
  }
  if (!(TASK_SIGNATURE_MEANINGS as readonly string[]).includes(signature.meaning)) {
    return {
      required: true,
      ok: false,
      status: 400,
      code: 'ESIGN_MEANING_INVALID',
      error: `Signature meaning must be one of: ${TASK_SIGNATURE_MEANINGS.join(', ')}.`,
    };
  }
  if (!reason || reason.trim().length < 3) {
    return {
      required: true,
      ok: false,
      status: 400,
      code: 'ESIGN_REASON_REQUIRED',
      error: 'A reason for the sign-off is required.',
    };
  }
  if (!actor.email) {
    return {
      required: true,
      ok: false,
      status: 401,
      code: 'ESIGN_IDENTITY_REQUIRED',
      error: 'A verified signer identity is required to sign.',
    };
  }

  const verification = await verifySigningPin(actor.email, signature.pin, organizationId);
  if (!verification.ok) {
    return {
      required: true,
      ok: false,
      status: verification.code === 'UNAVAILABLE' ? 503 : 403,
      code: `ESIGN_${verification.code}`,
      error: verification.message,
    };
  }

  return {
    required: true,
    ok: true,
    manifestation: {
      signedById: actor.userId,
      signedByName: actor.name || actor.email,
      meaning: signature.meaning,
      reason: reason.trim(),
      signedAt: new Date().toISOString(),
      method: 'pin',
    },
  };
}

export { TASK_SIGNATURE_MEANINGS };
