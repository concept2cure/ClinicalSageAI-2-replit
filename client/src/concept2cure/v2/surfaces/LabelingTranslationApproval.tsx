/**
 * Approving a labeling translation: an electronic signature (D5, 2026-10-29).
 *
 * The server signs the approval. PATCH /api/mdx/labeling/translations/:id with
 * status `approved` runs the platform's signing ceremony
 * (server/routes/mdx-labeling.ts → signGovernedAct). It checks the signer's
 * authority, then the password and any enrolled second factor. Then the
 * approval, the ledger pair and the signature row go on one transaction. So
 * the Labeling screen's approval control opens the shared signature dialog
 * (EsignModal, on useEsignature), and no longer sends the bare status change
 * the other steps send.
 *
 * The row's step control is here too: Approve for a translation in review,
 * Advance before that, nothing once approved, and nothing at all for a role
 * that cannot write (canGovernedWrite; the server's requireEditorAccess
 * refuses that role every labeling write). For a translation's own creator,
 * Approve is shown disabled with the reason, as the approval refuses them. AnA
 * is offered the same steps.
 *
 * @module client/src/concept2cure/v2/surfaces/LabelingTranslationApproval
 */
import * as React from 'react';
import { ApiRequestError, apiRequest, serverMessage } from '@/lib/queryClient';
import { useAuthUser } from '@/services/portal/authService';
import { EsignModal, esignSignerOf, type EsigSignedManifest } from '../../_shared/components/EsignModal';
import type { EsigMeaning } from '../../hooks/useEsignature';
import { I } from '../icons';

/** The meanings the server's approval takes (DECISION_ACT_MEANINGS). */
const TRANSLATION_APPROVAL_MEANINGS: ReadonlyArray<EsigMeaning> = ['approval', 'responsibility'];
const NOTHING_SIGNED = 'Nothing was signed.';
const UNCONFIRMED_APPROVAL =
  'The server did not confirm the approval. Reload the label and check the translation before you sign again.';

/**
 * The server's sentence, saying "Nothing was signed." once. The ceremony's
 * refusals end with it; the separation-of-duties wording says it mid-sentence,
 * then names the remedy.
 */
function refusedSigning(message: string): Error {
  return new Error(message.includes(NOTHING_SIGNED) ? message : `${message.trimEnd()} ${NOTHING_SIGNED}`);
}

type SignInput = { meaning: EsigMeaning; reason: string; password: string; totp?: string };

/**
 * Send the signed approval. A coded refusal (4xx) is thrown as the server's
 * sentence and the dialog stays open. A dropped connection or a server error
 * may have come after the commit, so it says the outcome is unconfirmed rather
 * than "nothing was signed". The time shown is the signature row's.
 */
export async function postTranslationApproval(
  id: string,
  input: SignInput,
): Promise<{ row: unknown; manifest: EsigSignedManifest }> {
  let res: Response;
  try {
    res = await apiRequest('PATCH', '/api/mdx/labeling/translations/' + encodeURIComponent(id), {
      status: 'approved',
      meaning: input.meaning,
      reason: input.reason,
      password: input.password,
      ...(input.totp ? { mfaToken: input.totp } : {}),
    });
  } catch (e) {
    if (e instanceof ApiRequestError && e.status < 500) throw refusedSigning(e.message);
    throw new Error(UNCONFIRMED_APPROVAL, { cause: e });
  }
  const json = (await res.json().catch(() => null)) as { data?: unknown; signedAt?: string; sha256Chain?: string } | null;
  // apiRequest hands a 401 back rather than throwing: the ceremony refused the password or code.
  if (res.status === 401) {
    throw refusedSigning(serverMessage(json) ?? 'Your password or code was not verified. Re-enter them and sign again.');
  }
  if (!res.ok || !json?.signedAt) throw new Error(UNCONFIRMED_APPROVAL);
  return {
    row: json.data ?? null,
    manifest: {
      meaning: input.meaning,
      reason: input.reason,
      signedAt: json.signedAt,
      ...(json.sha256Chain ? { hash: json.sha256Chain } : {}),
    },
  };
}

/** The shared signature dialog, saying what the approval binds. `onSigned` gets the server's approved row. */
export function TranslationApprovalDialog({ translation, label, onClose, onSigned }: {
  translation: { id: string; name: string; language: string };
  label: string;
  onClose: () => void;
  onSigned: (row: unknown) => void;
}) {
  const authUser = useAuthUser();
  return (
    <EsignModal
      open
      action={'Approve the ' + translation.name + ' translation'}
      target={label + ': ' + translation.name + ' (' + translation.language + ')'}
      targetMeta="Your signature approves this translation as it stands, for use on the label."
      meanings={TRANSLATION_APPROVAL_MEANINGS}
      defaultMeaning="approval"
      signer={esignSignerOf(authUser)}
      requireMfa={authUser?.mfaEnabled === true}
      onClose={onClose}
      onSign={async (input) => {
        const { row, manifest } = await postTranslationApproval(translation.id, input);
        onSigned(row);
        return manifest;
      }}
    />
  );
}

/**
 * A translation row's next step. `canWrite` is canGovernedWrite for the
 * signed-in role; without it nothing is offered. `ownNoteId` names the
 * sentence saying the signed-in user added this translation: the approval
 * refuses its creator (separation of duties), so Approve is shown disabled and
 * described by that sentence, not offered as if it would work
 * (LabelingSignatures.tsx; the server's refusal stays the authority).
 */
export function TranslationStepControl({ status, canWrite, onApprove, onAdvance, ownNoteId = null }: {
  status: string;
  canWrite: boolean;
  onApprove: () => void;
  onAdvance: () => void;
  ownNoteId?: string | null;
}) {
  if (!canWrite || status === 'approved') return null;
  if (status !== 'review') return <button className="btn ghost" style={{ height: 26 }} onClick={onAdvance}>{I.arrowRight} Advance</button>;
  return ownNoteId
    ? <button className="btn ghost" style={{ height: 26 }} disabled aria-describedby={ownNoteId}>{I.penLine} Approve</button>
    : <button className="btn ghost" style={{ height: 26 }} onClick={onApprove}>{I.penLine} Approve</button>;
}

/** What AnA may offer for the translations: the same steps the screen offers this role. */
export function translationStepActions(canWrite: boolean): string[] {
  return canWrite
    ? [
        'Add a target-language translation (a real persisted write)',
        'Advance a translation through pending, in progress and review, then approve it with an electronic signature',
      ]
    : ['Read the translations. This role cannot add, advance or approve them'];
}
