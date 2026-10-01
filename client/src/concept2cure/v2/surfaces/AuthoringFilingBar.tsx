/**
 * AuthoringFilingBar — the governed "lock it down" filing actions for a
 * selected authoring document, wired to the real authoring store
 * (server/routes/authoring.router.ts, uuid authoring_documents):
 *
 *   • Freeze — POST /api/authoring/docs/:docId/freeze
 *     {reason, meaning, password, mfaToken?}: snapshots the whole document
 *     into frozen_documents with a sha256 content hash, flips it to FROZEN and
 *     records the freezer's signature bound to that snapshot. A frozen document
 *     counts as finalized for eCTD leaf completeness and the IND checklist, so
 *     the freeze is a signature (DP-35): it runs through the same EsignModal
 *     ceremony as E-sign, re-verified server-side. The returned hash is shown
 *     so the signer/regulator can re-derive it.
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
import React, { useId, useState } from 'react';
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
  /* GE-P-3 (2026-09-28): the server's refusal of Freeze / E-sign for THIS
     caller, as the sentence to show (the host reads it from GET /docs/:id
     `access`). A string disables the control and is its visible, described
     reason. Null or absent means allowed OR unknown — the control stays
     enabled and the server decides; the bar never infers a denial. */
  freezeRefusal?: string | null;
  esignRefusal?: string | null;
}

type Dialog = 'freeze' | 'freeze-unsettled' | 'esign' | null;

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

/* The freeze is a signature (DP-35), so it is asked for by the shared
 * EsignModal: meaning, reason, password and code. When the server has REFUSED
 * because the document is not settled, this form asks first — naming exactly
 * what is outstanding and making the choice explicit — and the signature
 * dialog opens again only if the user chooses to seal it as it stands. That
 * refusal is not a dead end and must not read like one: freezing a draft with
 * open comments is a real thing to want. What it is NOT is a button that
 * quietly proceeds: the acknowledgement is a deliberate selection, and the
 * server records what was sealed over. */
const UNSETTLED_FORM = (title: string, unresolved: Unresolved): C2CFormConfig => ({
  eyebrow: 'Part 11 · content freeze',
  title: 'This document is not settled',
  sub:
    `“${title}” still has ${describeUnresolved(unresolved)}. Freezing seals the ` +
    'content for signature and filing, so the questions would go unanswered and the ' +
    'proposed edits would reach a reviewer undecided.',
  governed: true,
  submitLabel: 'Continue',
  fields: [
    {
      key: 'acknowledge',
      label: 'How do you want to proceed?',
      type: 'seg' as const,
      required: true,
      options: [
        { value: 'resolve', label: 'Go back and resolve them' },
        { value: 'seal', label: 'Seal it as it stands' },
      ],
    },
  ],
});

/** The meanings a freeze carries (FREEZE_SIGNATURE_MEANINGS in authoring.router.ts).
 *  Approval is not one: it is E-sign, which approves and freezes in one act. */
const FREEZE_MEANING: Partial<Record<EsigMeaning, 'AUTHOR' | 'REVIEWER'>> = {
  authorship: 'AUTHOR',
  review: 'REVIEWER',
};
const FREEZE_MEANINGS: ReadonlyArray<EsigMeaning> = ['authorship', 'review'];

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

/** What the freeze endpoint answered: sealed, or refused as not settled. */
type FreezeOutcome =
  | { kind: 'sealed'; hash?: string; frozenAt?: string }
  | { kind: 'not-settled'; unresolved: Unresolved };

/** The outstanding work the server named when it refused, or null for any other failure. */
function notSettledCounts(e: unknown): Unresolved | null {
  const err = e as Partial<ApiRequestError>;
  if (err?.code !== 'DOCUMENT_NOT_SETTLED') return null;
  const counts = (err.payload as { unresolved?: Unresolved } | undefined)?.unresolved;
  return { openComments: Number(counts?.openComments ?? 0), pendingEdits: Number(counts?.pendingEdits ?? 0) };
}

/**
 * POST the signed freeze. The credentials the dialog checked go with it and
 * the server re-verifies them inside the freeze's transaction. A refusal is
 * thrown as the sentence to show; "not settled" is returned, because it is a
 * question for the user rather than a failure.
 */
async function postFreeze(docId: string, input: SignInput, acknowledge: boolean): Promise<FreezeOutcome> {
  const meaning = FREEZE_MEANING[input.meaning];
  if (!meaning) throw new Error('A freeze is signed as its author or a reviewer. Nothing was sealed.');
  let res: Response;
  try {
    res = await apiRequest('POST', `/api/authoring/docs/${docId}/freeze`, {
      reason: input.reason,
      meaning,
      password: input.password,
      ...(input.totp ? { mfaToken: input.totp } : {}),
      ...(acknowledge ? { acknowledgeUnresolved: true } : {}),
    });
  } catch (e) {
    const unresolved = notSettledCounts(e);
    if (unresolved) return { kind: 'not-settled', unresolved };
    /* `apiRequest` THROWS on a non-2xx and the server answers `{ code,
       message }`, so the sentence is read from it — never "[object Object]". */
    const err = e as Partial<ApiRequestError> & { message?: string };
    const why = redactInternals(err?.message, 'the server did not accept it');
    throw new Error(
      'Couldn’t freeze the document — ' + why + ' Nothing was sealed.' +
        (err?.correlationId ? ` Reference ${err.correlationId}.` : ''),
      { cause: e },
    );
  }
  const json = (await res.json().catch(() => null)) as { contentHash?: string; frozenAt?: string } | null;
  /* apiRequest RETURNS a 401 rather than throwing it. Here a 401 is the
     signing ceremony refusing the password or code, not a lost session; it
     used to fall through to "Document frozen and sealed" — a seal claim over
     a freeze the server refused. */
  if (res.status === 401) {
    throw new Error('Not frozen — ' + (serverMessage(json) ?? 'your password or code was not verified.') + ' Nothing was sealed.');
  }
  if (!res.ok) {
    throw new Error('Couldn’t freeze the document — ' + extractApiError(json, res.status).message + '. Nothing was sealed.');
  }
  return { kind: 'sealed', hash: json?.contentHash, frozenAt: json?.frozenAt };
}

/** The line under the freeze dialog's target: what the signature records. */
function freezeTargetMeta(unresolved: Unresolved | null): string {
  return unresolved
    ? `Sealing it as it stands, with ${describeUnresolved(unresolved)}. Your signature records that you sealed it.`
    : 'Freezing seals the content for signature and filing. Your signature records that you sealed it.';
}

/** The Freeze control's title: why it is unavailable, or what it does. */
function freezeTitle(frozen: boolean, refusal: string | null | undefined): string {
  if (frozen) return 'Document is already frozen';
  return refusal ?? 'Sign, snapshot and seal this document';
}

/** The server's refusal of a governed act, as visible text the disabled control is described by (GE-P-3). */
function RefusalNote({ id, testId, text }: { id: string; testId: string; text: string }) {
  return (
    <span id={id} data-testid={testId} style={{ fontSize: 11.5, color: 'var(--text-400)', maxWidth: 240 }}>
      {text}
    </span>
  );
}

export function AuthoringFilingBar({ docId, docTitle, docStatus, onChanged, fireToast, signer, freezeRefusal, esignRefusal }: AuthoringFilingBarProps) {
  const freezeNoteId = useId();
  const esignNoteId = useId();
  const [dialog, setDialog] = useState<Dialog>(null);
  /** Set when the server refused the freeze because work is outstanding. */
  const [unresolved, setUnresolved] = useState<Unresolved | null>(null);
  const frozen = FROZEN_STATES.has(docStatus);

  /** The not-settled form's answer: go back, or reopen the signature to seal it as it stands. */
  const onUnsettledChoice = (v: Record<string, string>) => {
    /* "Go back and resolve them" closes and lets them work. Offering the choice
       and then ignoring half of it would be worse than not offering it. */
    if (v.acknowledge === 'seal') {
      setDialog('freeze');
      return;
    }
    setUnresolved(null);
    setDialog(null);
  };

  /* Runs after the dialog has checked the password (and code) with the server.
     A throw is shown in the dialog, which stays open; nothing is sealed. */
  const doFreeze = async (input: SignInput): Promise<EsigSignedManifest> => {
    /* The acknowledgement is only ever sent after the server refused AND the
       user deliberately chose to seal it anyway. Never a default, never inferred. */
    const out = await postFreeze(docId, input, unresolved !== null);
    if (out.kind === 'not-settled') {
      /* Re-ask rather than report a failure: the document is not broken, it
         is unfinished, and the form says so and offers both ways forward. */
      setUnresolved(out.unresolved);
      setDialog('freeze-unsettled');
      throw new Error('Not frozen — the document is not settled. Nothing was sealed.');
    }
    fireToast('Document frozen and sealed' + (out.hash ? ' · ' + String(out.hash).slice(0, 12) + '…' : '') + '.');
    setUnresolved(null);
    onChanged();
    return {
      meaning: input.meaning,
      reason: input.reason,
      signedAt: out.frozenAt ?? new Date().toISOString(),
      ...(out.hash ? { hash: out.hash } : {}),
    };
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
      <button className="btn ghost" style={{ height: 30 }} onClick={() => setDialog('freeze')} disabled={frozen || !!freezeRefusal}
        aria-describedby={!frozen && freezeRefusal ? freezeNoteId : undefined}
        title={freezeTitle(frozen, freezeRefusal)}>
        {I.lock} {frozen ? 'Frozen' : 'Freeze'}
      </button>
      {!frozen && freezeRefusal && <RefusalNote id={freezeNoteId} testId="freeze-refusal" text={freezeRefusal} />}
      <button className="btn ghost" style={{ height: 30 }} onClick={() => setDialog('esign')} disabled={!!esignRefusal}
        aria-describedby={esignRefusal ? esignNoteId : undefined}
        title={esignRefusal ?? undefined}>
        {I.penLine} E-sign
      </button>
      {esignRefusal && <RefusalNote id={esignNoteId} testId="esign-refusal" text={esignRefusal} />}

      {dialog === 'freeze' && (
        <EsignModal
          open
          action="Freeze and seal"
          target={docTitle}
          targetMeta={freezeTargetMeta(unresolved)}
          defaultMeaning="authorship"
          meanings={FREEZE_MEANINGS}
          signer={signer}
          onClose={() => { setUnresolved(null); setDialog(null); }}
          onSign={doFreeze}
        />
      )}
      {dialog === 'freeze-unsettled' && unresolved && (
        <C2CForm
          config={UNSETTLED_FORM(docTitle, unresolved)}
          onCancel={() => { setUnresolved(null); setDialog(null); }}
          onSubmit={onUnsettledChoice}
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
