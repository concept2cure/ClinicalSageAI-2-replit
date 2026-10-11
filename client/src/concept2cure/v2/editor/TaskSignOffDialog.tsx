/**
 * Completing an approval-gated task is an electronic signature (21 CFR 11
 * §11.50), taken where the person is: the product's one signing dialog, the
 * shared EsignModal (meaning, reason, the account password, and the
 * authenticator code when one is enrolled).
 *
 * ── Why this file exists ─────────────────────────────────────────────────────
 * A review task in the document's Tasks rail (ReviewTasksPanel.tsx) that the
 * server answered 428 ESIGN_REQUIRED for used to send the signer away, to the
 * Task board, to sign there (docs/design/ONE_ANA_ONE_CANVAS.md §4.7, slice
 * 19): "a reviewer signs on the document, not on a task board". The ceremony
 * itself was the Task board's private `ESignTaskModal` (surfaces/TaskBoard.tsx).
 * This is that ceremony as a component either place can mount. The Task board
 * mounts it too (surfaces/TaskBoard.tsx, since wave 2D,
 * docs/evidence/D2-ONE-ANA/2026-10-08/ana-2d-review-loop-closes/), so there is
 * one task sign-off.
 *
 * ── What it sends ────────────────────────────────────────────────────────────
 * The same transition again, PATCH /api/tasks/tasks/:taskId, now carrying the
 * reason and the signature. The server re-verifies the signer in
 * server/services/tasking/task-signoff.ts through
 * server/services/part11/reverify-signer.ts and only then writes the
 * transition with its manifestation (printed name, time, meaning, method) into
 * the task's approval history and the governed audit ledger. A refusal is
 * thrown by apiRequest with the server's sentence, which the dialog shows;
 * nothing is written. The credentials are never logged or echoed.
 *
 * ── What the confirmation shows ──────────────────────────────────────────────
 * The server's manifestation, never one made up here: the time and the printed
 * name are the last entry of the approval history the PATCH returns. A success
 * without one is not shown as a signature; it settles as unknown and the task
 * list is re-read.
 */
import React, { useRef, useState } from 'react';
import { apiRequest, ApiRequestError, serverMessage } from '@/lib/queryClient';
import { EsignModal, type EsigSignedManifest, type EsignSigner } from '../../_shared/components/EsignModal';
import type { EsigMeaning } from '../../hooks/useEsignature';

/** The task sign-off vocabulary (TASK_SIGNATURE_MEANINGS), as the shared dialog names it. */
export const TASK_SIGNATURE_MEANING: Partial<Record<EsigMeaning, string>> = {
  approval: 'APPROVED',
  review: 'REVIEWED',
  responsibility: 'RESPONSIBILITY',
  authorship: 'AUTHORSHIP',
};
export const TASK_SIGNATURE_MEANINGS: ReadonlyArray<EsigMeaning> = ['approval', 'review', 'responsibility', 'authorship'];

/** The transition the server gated: which task, and the move being signed. */
export interface TaskSignOffRequest {
  taskId: string;
  title: string;
  status: string;
  progress: number;
}

export interface TaskSignOffDialogProps {
  req: TaskSignOffRequest;
  /** Who the dialog shows as signing (the signed-in user). The server decides who signed. */
  signer?: EsignSigner;
  /** Closed with nothing written. */
  onClose: () => void;
  /**
   * Closed after the server confirmed the signed transition ('signed'), or
   * after it could not say whether it landed ('unknown'). Either way the
   * caller re-reads; only 'signed' may be reported as signed.
   */
  onSigned: (outcome: 'signed' | 'unknown') => void;
}

/**
 * apiRequest RETURNS a 401 rather than throwing it. Usually that is the
 * session, but the sign-off answers 401 ESIGN_IDENTITY_REQUIRED itself when
 * the session names no verified signer (task-signoff.ts), a different fact
 * with its own sentence. Branch on the code, never on the text.
 */
async function unauthenticatedSignOff(res: Response): Promise<Error> {
  const body = (await res.json().catch(() => null)) as { code?: unknown } | null;
  const own = typeof body?.code === 'string' && body.code.startsWith('ESIGN_') ? serverMessage(body) : null;
  return new Error(own
    ? `${own} The task was not completed.`
    : 'Your session is not signed in any more. Sign in again; the task was not completed.');
}

/** The manifestation the server recorded: the last approval-history entry of the returned task. */
export function recordedManifestation(json: unknown): { signedByName: string; signedAt: string } | null {
  const history = (json as { data?: { approvalHistory?: unknown } } | null)?.data?.approvalHistory;
  if (!Array.isArray(history) || history.length === 0) return null;
  const last = history[history.length - 1] as { signedByName?: unknown; signedAt?: unknown } | null;
  const signedByName = typeof last?.signedByName === 'string' ? last.signedByName.trim() : '';
  const signedAt = typeof last?.signedAt === 'string' ? last.signedAt : '';
  if (!signedByName || !Number.isFinite(new Date(signedAt).getTime())) return null;
  return { signedByName, signedAt };
}

const NO_MANIFESTATION =
  'The task changed, but the response did not carry the signature the server recorded, so none is shown. Close this dialog to re-read the task before signing again.';

export function TaskSignOffDialog({ req, signer, onClose, onSigned }: TaskSignOffDialogProps) {
  /* Set once the server has confirmed the signature, or could not say whether
     it landed (OUTCOME_UNKNOWN), so closing the dialog re-reads the task list
     to the state that holds rather than reading as a cancel. */
  const settled = useRef<'signed' | 'unknown' | null>(null);
  /* The printed name the server recorded, shown as "Signed by" once it has. */
  const [recordedSigner, setRecordedSigner] = useState<EsignSigner | null>(null);

  const onSign = async (input: { meaning: EsigMeaning; reason: string; password: string; totp?: string }): Promise<EsigSignedManifest> => {
    const res = await apiRequest('PATCH', '/api/tasks/tasks/' + encodeURIComponent(req.taskId), {
      status: req.status,
      progress: req.progress,
      reason: input.reason,
      signature: {
        password: input.password,
        ...(input.totp ? { mfaToken: input.totp } : {}),
        meaning: TASK_SIGNATURE_MEANING[input.meaning] ?? input.meaning,
      },
    }).catch((e: unknown) => {
      if (e instanceof ApiRequestError && e.code === 'OUTCOME_UNKNOWN') settled.current = 'unknown';
      throw e;
    });
    if (!res.ok) throw await unauthenticatedSignOff(res);
    const recorded = recordedManifestation(await res.json().catch(() => null));
    if (!recorded) {
      settled.current = 'unknown';
      throw new Error(NO_MANIFESTATION);
    }
    settled.current = 'signed';
    setRecordedSigner({ name: recorded.signedByName });
    return { meaning: input.meaning, reason: input.reason, signedAt: recorded.signedAt };
  };

  return (
    <EsignModal
      open
      action="Complete approval-gated task"
      target={req.title}
      targetMeta="Completing it applies your electronic signature, recorded with the task and in the audit ledger."
      defaultMeaning="approval"
      meanings={TASK_SIGNATURE_MEANINGS}
      signer={recordedSigner ?? signer}
      onClose={() => (settled.current ? onSigned(settled.current) : onClose())}
      onSign={onSign}
    />
  );
}
