/**
 * Sequences filed outside the platform, on a US submission in the Submission
 * Center (D7, 2026-10-29; docs/design/FILED_ELSEWHERE_BASELINE_2026-10-29.md).
 *
 * An IND whose earlier sequences were filed with another tool declares them
 * here: the last sequence filed, the one that opened the Original Application,
 * and the agency's acknowledgment as a Vault document. The declaration is an
 * electronic signature (the shared EsignModal; the server's signGovernedAct),
 * and the server refuses a sequence numbered within the declared ones, or a
 * second Original Application. The screen then numbers the first platform
 * sequence after them.
 *
 *   GET  /api/submissions/:id/filed-baseline
 *   POST /api/submissions/:id/filed-baseline
 */
import React from 'react';
import { EsignModal, type EsigSignedManifest, type EsignSigner } from '../../_shared/components/EsignModal';
import type { EsigMeaning } from '../../hooks/useEsignature';
import { apiRequest, ApiRequestError } from '@/lib/queryClient';
import { useLiveData } from '../dataConnect';

export interface FiledBaselineView {
  lastFiledSequence: string;
  originalSequence: string;
  nextSequence: string;
  declaredAt: string;
  declaredByName: string | null;
  meaning: string | null;
  reason: string;
}

export interface FiledBaselineRead {
  /** 'none' for a submission that is not for the US: nothing to declare. */
  state: 'none' | 'loading' | 'error' | 'ready';
  baseline: FiledBaselineView | null;
}

/** The meanings the declaration can carry (the server's DECISION_ACT_MEANINGS). */
const DECLARATION_MEANINGS: ReadonlyArray<EsigMeaning> = ['responsibility', 'approval'];
const SEQUENCE_RE = /^\d{4}$/;
const UNREAD_SIGNATURE =
  'The declaration was recorded, but the response did not carry the signature the server recorded, so none is shown. ' +
  'Close this dialog to re-read the submission.';

export const isUsSubmission = (sub: { primaryRegion: string }): boolean => sub.primaryRegion.toLowerCase() === 'fda';

/** The declaration in force for a US submission. A failed read is never read as "nothing declared". */
export function useFiledBaseline(sub: { id: number; primaryRegion: string } | null | undefined, bump: number): FiledBaselineRead {
  const path = sub && isUsSubmission(sub) ? `/api/submissions/${sub.id}/filed-baseline` : null;
  const read = useLiveData<{ baseline: FiledBaselineView | null }>(path, [path, bump]);
  if (!path) return { state: 'none', baseline: null };
  if (read.loading) return { state: 'loading', baseline: null };
  if (read.error || !read.data || !('baseline' in read.data)) return { state: 'error', baseline: null };
  return { state: 'ready', baseline: read.data.baseline };
}

/** The next sequence number, after the platform's own and any filed elsewhere. */
export function nextAfterFiled(platformNext: string, baseline: FiledBaselineView | null): string {
  if (!baseline) return platformNext;
  return baseline.nextSequence > platformNext ? baseline.nextSequence : platformNext;
}

function signedOn(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toISOString().slice(0, 10);
}

/** What was declared, by whom and when. */
export function FiledBaselineNote({ baseline }: { baseline: FiledBaselineView }) {
  return (
    <div className="scaf-note sc-mb" data-testid="filed-baseline-note">
      Sequences 0000–{baseline.lastFiledSequence} were filed outside the platform. Sequence {baseline.originalSequence} opened
      the Original Application. Declared by {baseline.declaredByName ?? 'an unnamed signer'} on {signedOn(baseline.declaredAt)}
      {baseline.meaning ? ` (${baseline.meaning})` : ''}. The next sequence is {baseline.nextSequence}.
    </div>
  );
}

interface DeclareProps {
  submissionId: number;
  signer?: EsignSigner;
  onDeclared: () => void;
}

/** The declaration: the facts first, then the signature that records them. */
export function DeclareFiledBaseline({ submissionId, signer, onDeclared }: DeclareProps) {
  const [open, setOpen] = React.useState(false);
  const [signing, setSigning] = React.useState(false);
  const [last, setLast] = React.useState('');
  const [original, setOriginal] = React.useState('0000');
  const [evidence, setEvidence] = React.useState('');
  const declared = React.useRef(false);

  const problem = !SEQUENCE_RE.test(last) ? 'Enter the last sequence filed, four digits.'
    : !SEQUENCE_RE.test(original) ? "Enter the Original Application's sequence, four digits."
      : original > last ? "The Original Application's sequence cannot be after the last one filed."
        : evidence.trim() === '' ? "Name the Vault document holding the agency's acknowledgment." : null;

  const onSign = async (input: { meaning: EsigMeaning; reason: string; password: string; totp?: string }): Promise<EsigSignedManifest> => {
    try {
      const res = await apiRequest('POST', `/api/submissions/${submissionId}/filed-baseline`, {
        lastFiledSequence: last, originalSequence: original, evidenceDocumentId: evidence.trim(),
        meaning: input.meaning, reason: input.reason, password: input.password,
        ...(input.totp ? { mfaToken: input.totp } : {}),
      });
      const body = await res.json().catch(() => null) as { signedAt?: string } | null;
      declared.current = true;
      if (typeof body?.signedAt !== 'string') throw new Error(UNREAD_SIGNATURE);
      return { meaning: input.meaning, reason: input.reason, signedAt: body.signedAt };
    } catch (e) {
      if (e instanceof Error && e.message === UNREAD_SIGNATURE) throw e;
      // The server's own sentence: every refusal says what was wrong and that nothing was signed.
      throw new Error(e instanceof ApiRequestError ? e.message : 'The declaration was not recorded. Nothing was signed.', { cause: e });
    }
  };

  if (!open) {
    return (
      <button type="button" className="sc-btn" onClick={() => setOpen(true)}>
        Declare sequences filed before this platform
      </button>
    );
  }
  return (
    <div className="pj-card sc-mt" data-testid="declare-filed-baseline">
      <div className="pj-card-b">
        <div className="scaf-note sc-mb">
          If this IND already has sequences filed with another tool, declare them. The platform then numbers its first
          sequence after them, and an amendment names the Original Application you state. The declaration is signed, and
          it cannot be changed once a sequence here is frozen.
        </div>
        <div className="sc-field">
          <label htmlFor={`fb-last-${submissionId}`}>Last sequence filed</label>
          <input id={`fb-last-${submissionId}`} className="sc-subpick" value={last} placeholder="0041" maxLength={4}
            onChange={(e) => setLast(e.target.value.trim())} />
        </div>
        <div className="sc-field">
          <label htmlFor={`fb-original-${submissionId}`}>Sequence that opened the Original Application</label>
          <input id={`fb-original-${submissionId}`} className="sc-subpick" value={original} maxLength={4}
            onChange={(e) => setOriginal(e.target.value.trim())} />
        </div>
        <div className="sc-field">
          <label htmlFor={`fb-evidence-${submissionId}`}>Agency acknowledgment (Vault document id)</label>
          <input id={`fb-evidence-${submissionId}`} className="sc-subpick" value={evidence}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" onChange={(e) => setEvidence(e.target.value)} />
        </div>
        {problem && last !== '' ? <div className="scaf-note" role="status">{problem}</div> : null}
        <div className="cm-pushbar sc-mt">
          <button type="button" className="sp-primary sc-btn" disabled={problem !== null} onClick={() => setSigning(true)}>
            Sign declaration
          </button>
          <button type="button" className="sc-btn" onClick={() => setOpen(false)}>Cancel</button>
        </div>
      </div>
      <EsignModal
        open={signing}
        action="Declare sequences filed outside the platform"
        target={`Sequences 0000–${last || '????'} · Original Application ${original}`}
        targetMeta="Your signature is bound to these sequences and to the acknowledgment's content."
        defaultMeaning="responsibility"
        meanings={DECLARATION_MEANINGS}
        signer={signer}
        onClose={() => {
          setSigning(false);
          if (declared.current) {
            declared.current = false;
            setOpen(false);
            onDeclared();
          }
        }}
        onSign={onSign}
      />
    </div>
  );
}

/**
 * The Submission Center's line about sequences filed elsewhere: the
 * declaration in force, the offer to make one (a US submission with none), or
 * a read that failed, which is said, never shown as "nothing declared".
 */
export function FiledBaselineSlot({ read, submissionId, signer, onDeclared }: {
  read: FiledBaselineRead;
  submissionId: number;
  signer?: EsignSigner;
  onDeclared: () => void;
}) {
  if (read.state === 'none' || read.state === 'loading') return null;
  if (read.state === 'error') {
    return (
      <div className="scaf-note sc-mb" role="alert">
        Couldn&#39;t read whether this application&#39;s earlier sequences were filed outside the platform, so no sequence
        number is offered. Retry.
      </div>
    );
  }
  if (read.baseline) return <FiledBaselineNote baseline={read.baseline} />;
  return <DeclareFiledBaseline submissionId={submissionId} signer={signer} onDeclared={onDeclared} />;
}

/** Whether the screen knows enough to offer a sequence number. */
export const numberingKnown = (read: FiledBaselineRead): boolean => read.state === 'none' || read.state === 'ready';
