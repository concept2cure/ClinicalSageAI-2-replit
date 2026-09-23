/**
 * AuthoringFilingBar — the governed "lock it down" filing actions for a
 * selected authoring document, wired to the real authoring store
 * (server/routes/authoring.router.ts, uuid authoring_documents):
 *
 *   • Freeze — POST /api/authoring/docs/:docId/freeze {reason}: snapshots the
 *     whole document into frozen_documents with a sha256 content hash and an
 *     audit-trail entry, flipping the document to FROZEN. The returned hash is
 *     shown so the signer/regulator can re-derive it.
 *   • E-sign — POST /api/authoring/docs/:docId/e-sign
 *     {password, mfaToken?, meaning, intent}: records a 21 CFR Part 11
 *     electronic signature against the document's content hash with an audit
 *     entry; an APPROVER signature flips the document to APPROVED and
 *     auto-freezes it.
 *
 * The signature runs the product's one signing dialog, the shared EsignModal:
 * meaning, reason, the account password, and the authenticator code when one
 * is enrolled, re-verified server-side by the same ceremony every other
 * signature uses (server/services/part11/reverify-signer.ts). This bar used to
 * ask for a separate "signing PIN" (VSR-001 §13.3 item 3). The store is
 * uuid-scoped, so the dialog posts to this store's own e-sign endpoint rather
 * than to /api/esignature/sign.
 *
 * HONESTY: real awaited writes; a success toast fires only after the server
 * confirms and includes the server hash; a refused credential or any error is
 * shown in the dialog and nothing local is fabricated. onChanged() lets the
 * host refetch so the document's new status (FROZEN / APPROVED) comes from the
 * server, not an optimistic guess.
 */
import React, { useState } from 'react';
import { I } from '../icons';
import { C2CForm } from '../C2CForm';
import type { C2CFormConfig } from '../C2CForm';
import { apiRequest, extractApiError, redactInternals, serverMessage, type ApiRequestError } from '@/lib/queryClient';
import { EsignModal, type EsigSignedManifest, type EsignSigner } from '../../_shared/components/EsignModal';
import type { EsigMeaning } from '../../hooks/useEsignature';

export interface AuthoringFilingBarProps {
  docId: string;
  docTitle: string;
  docStatus: string;
  /** Refetch hook so the host adopts the server's post-write document status. */
  onChanged: () => void;
  /* BP-W0-6, and this is the sharpest instance of it. This component owns
     Freeze and the §11.50 electronic signature. Its prop type erased the tone
     the host's useToast accepts, so every call here defaulted to 'ok' — and a
     REJECTED credential rendered with the green success tick, aria-live="polite" and
     the same 4.2s dwell as "Document signed". On the one action in the product
     that is a legally binding attestation, failure was indistinguishable from
     success. C2CForm is fire-and-forget and the dialog stays open on failure
     with no inline error, so the toast is the ONLY signal there is. */
  fireToast: (m: string, tone?: 'ok' | 'error') => void;
  /** Who the signature dialog shows as signing (the host's signed-in user). */
  signer?: EsignSigner;
}

type Dialog = 'freeze' | 'esign' | null;

const FROZEN_STATES = new Set(['FROZEN', 'APPROVED']);

/** What the server said is still outstanding on this document. */
interface Unresolved { openComments: number; pendingEdits: number }

/** "1 unresolved comment and 2 tracked changes" — the same phrasing the server
 *  uses, built here so the dialog can restate it without echoing server text. */
function describeUnresolved(u: Unresolved): string {
  const parts: string[] = [];
  if (u.openComments > 0) {
    parts.push(`${u.openComments} unresolved comment${u.openComments === 1 ? '' : 's'}`);
  }
  if (u.pendingEdits > 0) {
    parts.push(`${u.pendingEdits} tracked change${u.pendingEdits === 1 ? '' : 's'} nobody has accepted or rejected`);
  }
  return parts.join(' and ');
}

/* The freeze dialog has two shapes. Ordinarily it asks for a reason.
 *
 * When the server has REFUSED because the document is not settled, it asks
 * again — naming exactly what is outstanding and making the choice explicit.
 * That refusal is not a dead end and must not read like one: freezing a draft
 * with open comments is a real thing to want, so the way forward is offered
 * here rather than left for the user to guess. What it is NOT is a button that
 * quietly proceeds: the acknowledgement is a deliberate selection, and the
 * server records what was sealed over. */
const FREEZE_FORM = (title: string, unresolved: Unresolved | null): C2CFormConfig => ({
  eyebrow: 'Part 11 · content freeze',
  title: unresolved ? 'This document is not settled' : 'Freeze document',
  sub: unresolved
    ? `“${title}” still has ${describeUnresolved(unresolved)}. Freezing seals the ` +
      'content for signature and filing, so the questions would go unanswered and the ' +
      'proposed edits would reach a reviewer undecided.'
    : `Snapshot “${title}” into an immutable, hash-sealed version before signing or filing.`,
  governed: true,
  submitLabel: unresolved ? 'Continue' : 'Freeze and seal',
  fields: [
    ...(unresolved
      ? [{
          key: 'acknowledge',
          label: 'How do you want to proceed?',
          type: 'seg' as const,
          required: true,
          options: [
            { value: 'resolve', label: 'Go back and resolve them' },
            { value: 'seal', label: 'Seal it as it stands' },
          ],
        }]
      : []),
    { key: 'reason', label: 'Reason for freeze', type: 'textarea', required: true, placeholder: 'e.g. Locking for QA review prior to approval' },
    { key: 'version', label: 'Version label (optional)', type: 'text', placeholder: 'e.g. v1.0.frozen' },
  ],
});

/** The authoring store's §11.50 vocabulary (SIGNATURE_MEANINGS in
 *  authoring.router.ts), as the shared dialog names the same three meanings. */
const AUTHORING_MEANING: Partial<Record<EsigMeaning, 'AUTHOR' | 'REVIEWER' | 'APPROVER'>> = {
  authorship: 'AUTHOR',
  review: 'REVIEWER',
  approval: 'APPROVER',
};
const AUTHORING_MEANINGS: ReadonlyArray<EsigMeaning> = ['authorship', 'review', 'approval'];

/** What the shared dialog hands over once the signer has re-authenticated. */
interface SignInput {
  meaning: EsigMeaning;
  reason: string;
  password: string;
  totp?: string;
}

/**
 * POST the signature to the authoring store. The same credentials the dialog
 * checked go with it, and the server re-verifies them inside the transaction
 * that writes the signature. A refusal is thrown as the sentence to show.
 */
async function postAuthoringSignature(
  docId: string,
  input: SignInput,
): Promise<{ meaning: 'AUTHOR' | 'REVIEWER' | 'APPROVER'; hash?: string; signedAt?: string }> {
  const meaning = AUTHORING_MEANING[input.meaning];
  if (!meaning) throw new Error('This document cannot carry that meaning. Nothing was signed.');
  const res = await apiRequest('POST', `/api/authoring/docs/${docId}/e-sign`, {
    password: input.password,
    ...(input.totp ? { mfaToken: input.totp } : {}),
    meaning,
    intent: input.reason,
  });
  const json = (await res.json().catch(() => null)) as { documentHash?: string; signedAt?: string } | null;
  /* apiRequest RETURNS a 401 rather than throwing it. Here a 401 is the
     signing ceremony refusing the password or code, not a lost session. */
  if (res.status === 401) {
    throw new Error((serverMessage(json) ?? 'Your password or code was not verified.') + ' Nothing was signed.');
  }
  return { meaning, hash: json?.documentHash, signedAt: json?.signedAt };
}

export function AuthoringFilingBar({ docId, docTitle, docStatus, onChanged, fireToast, signer }: AuthoringFilingBarProps) {
  const [dialog, setDialog] = useState<Dialog>(null);
  /** Set when the server refused the freeze because work is outstanding. */
  const [unresolved, setUnresolved] = useState<Unresolved | null>(null);
  const frozen = FROZEN_STATES.has(docStatus);

  const doFreeze = async (v: Record<string, string>) => {
    /* The user chose "go back and resolve them" — close and let them work.
       Offering the choice and then ignoring half of it would be worse than not
       offering it. */
    if (unresolved && v.acknowledge === 'resolve') {
      setUnresolved(null);
      setDialog(null);
      return;
    }
    try {
      const res = await apiRequest('POST', `/api/authoring/docs/${docId}/freeze`, {
        reason: v.reason,
        version: v.version || undefined,
        /* Only ever sent after the server refused AND the user deliberately
           chose to seal it anyway. Never a default, never inferred. */
        ...(unresolved && v.acknowledge === 'seal' ? { acknowledgeUnresolved: true } : {}),
      });
      const json = await res.json().catch(() => null);
      /* apiRequest throws on every non-2xx EXCEPT 401, which it returns so
         callers can say "sign in" rather than "server error". This handler
         relied on the throw alone, so an expired session fell straight through
         to "Document frozen and sealed" — a seal claim, plus a refresh, over a
         freeze the server refused. Same guard the e-sign handler below has. */
      if (res.status === 401) { fireToast('Not frozen — your session isn’t authenticated. Sign in and try again; nothing was sealed.', 'error'); return; }
      if (!res.ok) { fireToast('Couldn’t freeze the document — ' + (extractApiError(json, res.status).message) + '. Nothing was sealed.', 'error'); return; }
      const hash = (json as { contentHash?: string })?.contentHash;
      fireToast('Document frozen and sealed' + (hash ? ' · ' + String(hash).slice(0, 12) + '…' : '') + '.');
      setUnresolved(null);
      setDialog(null);
      onChanged();
    } catch (e) {
      /* `apiRequest` THROWS on a non-2xx, so the old `if (!res.ok)` branch above
         was unreachable and every failure fell to this catch — where
         `(json as any)?.error` would in any case have rendered "[object Object]"
         now that the server answers with `{ code, message }`. */
      const err = e as Partial<ApiRequestError> & { message?: string };
      if (err?.code === 'DOCUMENT_NOT_SETTLED') {
        const counts = (err.payload as { unresolved?: Unresolved } | undefined)?.unresolved;
        /* Re-ask rather than report a failure: the document is not broken, it is
           unfinished, and the dialog can say so and offer both ways forward. */
        setUnresolved({
          openComments: Number(counts?.openComments ?? 0),
          pendingEdits: Number(counts?.pendingEdits ?? 0),
        });
        setDialog('freeze');
        return;
      }
      const why = redactInternals(err?.message, 'the server did not accept it');
      fireToast(
        'Couldn’t freeze the document — ' + why + ' Nothing was sealed.' +
          (err?.correlationId ? ` Reference ${err.correlationId}.` : ''),
        'error',
      );
    }
  };

  /* Runs after the dialog has checked the password (and code) with the server.
     A throw is shown in the dialog, which stays open; nothing is signed. */
  const doSign = async (input: SignInput): Promise<EsigSignedManifest> => {
    const signed = await postAuthoringSignature(docId, input);
    const approved = signed.meaning === 'APPROVER';
    fireToast('Document signed (' + signed.meaning.toLowerCase() + ')' + (approved ? ' — approved and frozen' : '') + (signed.hash ? ' · ' + String(signed.hash).slice(0, 12) + '…' : '') + '.');
    onChanged();
    return {
      meaning: input.meaning,
      reason: input.reason,
      signedAt: signed.signedAt ?? new Date().toISOString(),
      ...(signed.hash ? { hash: signed.hash } : {}),
    };
  };

  return (
    <>
      <button className="btn ghost" style={{ height: 30 }} onClick={() => setDialog('freeze')} disabled={frozen}
        title={frozen ? 'Document is already frozen' : 'Snapshot and seal this document'}>
        {I.lock} {frozen ? 'Frozen' : 'Freeze'}
      </button>
      <button className="btn ghost" style={{ height: 30 }} onClick={() => setDialog('esign')}>
        {I.penLine} E-sign
      </button>

      {dialog === 'freeze' && (
        <C2CForm
          config={FREEZE_FORM(docTitle, unresolved)}
          onCancel={() => { setUnresolved(null); setDialog(null); }}
          onSubmit={doFreeze}
        />
      )}
      {dialog === 'esign' && (
        <EsignModal
          open
          action="Sign document"
          target={docTitle}
          targetMeta="An Approval signature approves and freezes the document."
          defaultMeaning="review"
          meanings={AUTHORING_MEANINGS}
          signer={signer}
          onClose={() => setDialog(null)}
          onSign={doSign}
        />
      )}
    </>
  );
}
