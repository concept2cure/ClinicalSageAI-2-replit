/**
 * The questions on one agency letter and our response to each (2026-10-18,
 * rows D2 and D5). Opened from a letter's card in the project's agency inbox
 * (AgencyInbox.tsx), so Communication and Project home's Respond tab show the
 * same record.
 *
 * What a person does here, and who decides what:
 *   - Record a question as the agency numbered and worded it (governed write,
 *     with a reason).
 *   - Write the response (governed write, with a reason). The revision the
 *     writer started from travels with the save, so two people cannot
 *     overwrite each other unseen.
 *   - Approve a response: the shared Part 11 EsignModal (meaning, reason,
 *     password, authenticator code when enrolled), forwarded to the route,
 *     which runs the platform's signing ceremony. The signature binds the
 *     question and the exact text shown. The person who wrote the text cannot
 *     approve it; the server says so before anyone types a password
 *     (`signRefusal`), and refuses it anyway.
 *   - Record a commitment made in a response (PMR, PMC, REMS…), into the one
 *     commitments register Communication's Commitments tab lists.
 *   - Download the response package once every response is approved as it
 *     stands. The server assembles it and records the export.
 *
 * This module decides nothing. A response's state (no response, draft,
 * changed after approval, approved), whether this person may sign it, and
 * whether the package is ready are all the server's words, read from the
 * signature table. Nothing here says a response is approved that the server
 * did not say is.
 */
import React from 'react';
import { ApiRequestError, apiRequest } from '@/lib/queryClient';
import { useAuthUser, type AuthUser } from '@/services/portal/authService';
import { EsignModal, type EsigSignedManifest, type EsignSigner } from '../../_shared/components/EsignModal';
import type { EsigMeaning } from '../../hooks/useEsignature';
import { C2CForm } from '../C2CForm';
import { EmptyState, useLiveData } from '../dataConnect';
import { downloadBlob } from '../download';
import { I } from '../icons';
import type { CommRow } from './AgencyInbox';

type ResponseState = 'unanswered' | 'drafted' | 'changed-after-approval' | 'approved';

interface SignatureView {
  signatureId: number;
  signerName: string;
  signedAt: string;
  meaning: string | null;
}

interface CommitmentView {
  id: number;
  commitmentType: string;
  description: string;
  dueDate: string | null;
  regulatoryBasis: string | null;
  status: string;
}

export interface AgencyQuestionView {
  id: number;
  questionRef: string;
  questionText: string;
  discipline: string | null;
  severity: string;
  responseText: string;
  responseRevision: number;
  responseUpdatedByName: string | null;
  responseUpdatedAt: string | null;
  state: ResponseState;
  approval: SignatureView | null;
  supersededApproval: SignatureView | null;
  signRefusal: { code: string; message: string } | null;
  commitments: CommitmentView[];
}

interface QuestionsPayload {
  letter: { id: string; communicationType: string; closureStatus: string; dueDate: string | null };
  questions: AgencyQuestionView[];
  outstanding: Array<{ questionRef: string; state: string }>;
  packageReady: boolean;
}

function isQuestionsPayload(v: unknown): v is QuestionsPayload {
  const p = v as QuestionsPayload | null;
  return Boolean(p && p.letter && Array.isArray(p.questions) && Array.isArray(p.outstanding));
}

const STATE_LABEL: Record<ResponseState, string> = {
  unanswered: 'No response',
  drafted: 'Draft',
  'changed-after-approval': 'Changed after approval',
  approved: 'Approved',
};
const STATE_TONE: Record<ResponseState, string> = {
  unanswered: 'idle',
  drafted: 'warn',
  'changed-after-approval': 'err',
  approved: 'ok',
};
const COMMITMENT_TYPES = [
  { value: 'pmr', label: 'Postmarketing requirement (PMR)' },
  { value: 'pmc', label: 'Postmarketing commitment (PMC)' },
  { value: 'rems', label: 'REMS' },
  { value: 'meeting_commitment', label: 'Commitment' },
  { value: 'other', label: 'Other' },
];
/** §11.50: approving a response means approval, or that the signer answers for it. */
const APPROVAL_MEANINGS: ReadonlyArray<EsigMeaning> = ['approval', 'responsibility'];

function when(iso: string | null | undefined): string {
  if (!iso) return '';
  const t = new Date(iso);
  return Number.isNaN(t.getTime()) ? iso : t.toLocaleString();
}

/** Only ApiRequestError has been through the envelope reduction and is safe to show. */
function said(e: unknown): string {
  return e instanceof ApiRequestError && e.message ? e.message : 'the service could not be reached';
}

function printedSigner(u: AuthUser | null): EsignSigner | undefined {
  const name = [u?.displayName, [u?.firstName, u?.lastName].filter(Boolean).join(' '), u?.email]
    .find((v) => typeof v === 'string' && v.trim().length > 0);
  return name ? { name: name.trim(), ...(u?.email ? { email: u.email } : {}) } : undefined;
}

function signatureSentence(s: SignatureView): string {
  return `${s.signerName} on ${when(s.signedAt)}${s.meaning ? ` (${s.meaning})` : ''}, signature ${s.signatureId}`;
}

/** One question: the agency's words, our response, its approval and its commitments. */
function QuestionCard({
  q,
  closed,
  busy,
  onSave,
  onSign,
  onCommit,
}: {
  q: AgencyQuestionView;
  closed: boolean;
  busy: boolean;
  onSave: (q: AgencyQuestionView, text: string, reason: string) => Promise<boolean>;
  onSign: (q: AgencyQuestionView) => void;
  onCommit: (q: AgencyQuestionView) => void;
}) {
  const [editing, setEditing] = React.useState(false);
  const [text, setText] = React.useState(q.responseText);
  const [reason, setReason] = React.useState('');
  const textId = React.useId();
  const reasonId = React.useId();

  const startEdit = () => {
    setText(q.responseText);
    setReason('');
    setEditing(true);
  };
  const save = async () => {
    if (await onSave(q, text, reason)) setEditing(false);
  };

  return (
    <li className="cc-q" data-state={q.state}>
      <div className="cc-comm-top">
        <span className="cc-comm-t">{q.questionRef}</span>
        {q.discipline && <span className="cc-comm-src">{q.discipline}</span>}
        <span className={'rd-chip tone-' + (q.severity === 'critical' ? 'err' : q.severity === 'major' ? 'warn' : 'idle')}>
          {q.severity}
        </span>
        <span className={'rd-chip tone-' + STATE_TONE[q.state]}>{STATE_LABEL[q.state]}</span>
      </div>
      <blockquote className="cc-q-text">{q.questionText}</blockquote>

      {editing ? (
        <div className="cc-q-edit">
          <label className="de-label" htmlFor={textId}>Response</label>
          <textarea id={textId} className="cc-q-area" rows={6} value={text} onChange={(e) => setText(e.target.value)} />
          <label className="de-label" htmlFor={reasonId}>Reason for this change</label>
          <input
            id={reasonId}
            className="cc-q-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Drafted from the 13-week toxicology report"
          />
          {q.state === 'approved' && (
            <p className="cc-q-note">Saving a change ends this approval. The new text needs its own signature.</p>
          )}
          <div className="cc-comm-foot">
            <button className="cc-btn sm primary" disabled={busy || reason.trim().length < 8} onClick={() => void save()}>
              Save response
            </button>
            <button className="cc-btn sm" disabled={busy} onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="cc-q-resp">
          {q.responseText.trim() ? <p className="cc-q-body">{q.responseText}</p> : <p className="cc-q-note">No response has been written.</p>}
          {q.responseRevision > 0 && (
            <p className="cc-q-meta mono">
              Revision {q.responseRevision}
              {q.responseUpdatedByName ? `, written by ${q.responseUpdatedByName}` : ''}
              {q.responseUpdatedAt ? ` on ${when(q.responseUpdatedAt)}` : ''}
            </p>
          )}
        </div>
      )}

      {q.approval && <p className="cc-q-sig">Approved by {signatureSentence(q.approval)}.</p>}
      {q.state === 'changed-after-approval' && q.supersededApproval && (
        <p className="cc-q-sig" data-tone="err">
          Approved earlier by {signatureSentence(q.supersededApproval)}. The response has changed since, so it needs a new signature.
        </p>
      )}

      {q.commitments.length > 0 && (
        <ul className="cc-comm-issues">
          {q.commitments.map((c) => (
            <li key={c.id}>
              {c.commitmentType.toUpperCase()}: {c.description}
              {c.dueDate ? `, due ${c.dueDate}` : ''} ({c.status.replace(/_/g, ' ')})
            </li>
          ))}
        </ul>
      )}

      {!editing && (
        <div className="cc-comm-foot">
          {!closed && (
            <button className="cc-btn sm" disabled={busy} onClick={startEdit}>
              {I.penLine} {q.responseText.trim() ? 'Edit response' : 'Write response'}
            </button>
          )}
          {!closed && q.state !== 'approved' && q.state !== 'unanswered' && (
            <button
              className="cc-btn sm primary"
              disabled={busy || q.signRefusal !== null}
              aria-describedby={q.signRefusal ? `${textId}-why` : undefined}
              onClick={() => onSign(q)}
            >
              {I.check} Approve response
            </button>
          )}
          <button className="cc-btn sm" disabled={busy} onClick={() => onCommit(q)}>
            Record commitment
          </button>
          {q.signRefusal && q.state !== 'approved' && q.state !== 'unanswered' && (
            <span id={`${textId}-why`} className="cc-q-note">{q.signRefusal.message}</span>
          )}
        </div>
      )}
    </li>
  );
}

/** The questions and responses of one inbox letter. */
export function AgencyResponses({
  projectId,
  letter,
  fire,
}: {
  projectId: string;
  letter: CommRow;
  fire: (m: string, tone?: 'ok' | 'error') => void;
}) {
  const base = `/api/concept2cure/projects/${encodeURIComponent(projectId)}/agency-communications/${encodeURIComponent(letter.id)}`;
  const [version, setVersion] = React.useState(0);
  const reload = () => setVersion((v) => v + 1);
  const read = useLiveData<QuestionsPayload>(`${base}/questions`, [base, version], isQuestionsPayload);
  const authUser = useAuthUser();
  const [busy, setBusy] = React.useState(false);
  const [adding, setAdding] = React.useState(false);
  const [committing, setCommitting] = React.useState<AgencyQuestionView | null>(null);
  const [signing, setSigning] = React.useState<AgencyQuestionView | null>(null);
  const signed = React.useRef(false);

  const data = read.data;
  const closed = data?.letter.closureStatus === 'closed';

  const addQuestion = async (v: Record<string, string>) => {
    setBusy(true);
    try {
      await apiRequest('POST', `${base}/questions`, {
        questionRef: v.questionRef,
        questionText: v.questionText,
        discipline: v.discipline || undefined,
        severity: v.severity || 'major',
        reason: v.reason,
      });
      setAdding(false);
      fire(`Question ${v.questionRef} recorded, with an audit entry.`);
      reload();
    } catch (e) {
      fire(`Question not recorded: ${said(e)}. Nothing was stored.`, 'error');
    } finally {
      setBusy(false);
    }
  };

  const saveResponse = async (q: AgencyQuestionView, text: string, reason: string): Promise<boolean> => {
    setBusy(true);
    try {
      await apiRequest('PUT', `${base}/questions/${q.id}/response`, { responseText: text, expectedRevision: q.responseRevision, reason });
      fire(`Response to ${q.questionRef} saved, with an audit entry.`);
      reload();
      return true;
    } catch (e) {
      fire(`Response to ${q.questionRef} not saved: ${said(e)}.`, 'error');
      if (e instanceof ApiRequestError && e.code === 'RESPONSE_CHANGED') reload();
      return false;
    } finally {
      setBusy(false);
    }
  };

  const recordCommitment = async (v: Record<string, string>) => {
    if (!committing) return;
    setBusy(true);
    try {
      await apiRequest('POST', `${base}/questions/${committing.id}/commitments`, {
        commitmentType: v.commitmentType,
        description: v.description,
        dueDate: v.dueDate || undefined,
        regulatoryBasis: v.regulatoryBasis || undefined,
        reason: v.reason,
      });
      fire(`Commitment recorded from ${committing.questionRef}. It is listed under Meetings & commitments.`);
      setCommitting(null);
      reload();
    } catch (e) {
      fire(`Commitment not recorded: ${said(e)}. Nothing was stored.`, 'error');
    } finally {
      setBusy(false);
    }
  };

  const sign = async (input: { meaning: EsigMeaning; reason: string; password: string; totp?: string }): Promise<EsigSignedManifest> => {
    const q = signing!;
    try {
      const res = await apiRequest('POST', `${base}/questions/${q.id}/approve`, {
        reason: input.reason,
        meaning: input.meaning,
        password: input.password,
        ...(input.totp ? { mfaToken: input.totp } : {}),
        expectedRevision: q.responseRevision,
      });
      const body = (await res.json().catch(() => null)) as { signedAt?: string; meaning?: string; data?: { state?: string } } | null;
      if (!res.ok || body?.data?.state !== 'approved' || !body.signedAt) {
        throw new Error('Whether the response was approved could not be confirmed. Reload before signing again.');
      }
      signed.current = true;
      return { meaning: input.meaning, reason: input.reason, signedAt: body.signedAt };
    } catch (e) {
      if (e instanceof ApiRequestError) throw new Error(`${e.message}`);
      throw e;
    }
  };

  const download = async (format: 'md' | 'docx') => {
    setBusy(true);
    try {
      const res = await apiRequest('POST', `${base}/response-package`, { format });
      if (!res.ok) {
        fire('The package was not delivered. Sign in and try again.', 'error');
        return;
      }
      const sha = res.headers.get('X-Export-Sha256');
      const ok = downloadBlob(`response-${letter.id}.${format}`, await res.blob());
      fire(
        ok
          ? `Response package downloaded and recorded${sha ? ` (sha256 ${sha.slice(0, 12)}…)` : ''}.`
          : 'The package was built and recorded, but the browser refused the download.',
        ok ? 'ok' : 'error',
      );
    } catch (e) {
      fire(`The package was not assembled: ${said(e)}.`, 'error');
    } finally {
      setBusy(false);
    }
  };

  if (read.loading && !data) {
    return <div role="status" className="scaf-note">Loading the questions on this letter…</div>;
  }
  if (read.error && !data) {
    return (
      <EmptyState
        tone="error"
        icon={I.alertTriangle}
        title="Couldn't load the questions on this letter"
        hint="The responses register didn't respond. Nothing is shown rather than an incomplete list."
      />
    );
  }

  const questions = data?.questions ?? [];
  const approvedCount = questions.filter((q) => q.state === 'approved').length;

  return (
    <section className="cc-qs" aria-label={`Questions and responses for ${letter.communicationType}`}>
      <div className="cc-inbox-head">
        <div className="pj-seclbl" style={{ margin: 0 }}>
          Questions and responses{' '}
          <span className="s">
            · {questions.length} question{questions.length === 1 ? '' : 's'} · {approvedCount} approved
          </span>
        </div>
        {!closed && (
          <button className="cc-btn sm" disabled={busy} onClick={() => setAdding(true)}>
            {I.plus} Record question
          </button>
        )}
      </div>

      {questions.length === 0 ? (
        <p className="cc-q-note">
          No questions are recorded on this letter. Record each question as the agency numbered and worded it; each then
          takes a response and an approval.
        </p>
      ) : (
        <ol className="cc-q-list">
          {questions.map((q) => (
            <QuestionCard
              key={q.id}
              q={q}
              closed={closed}
              busy={busy}
              onSave={saveResponse}
              onSign={(x) => {
                signed.current = false;
                setSigning(x);
              }}
              onCommit={setCommitting}
            />
          ))}
        </ol>
      )}

      {questions.length > 0 && (
        <div className="cc-comm-foot">
          <button className="cc-btn sm primary" disabled={busy || !data?.packageReady} onClick={() => void download('docx')}>
            {I.download} Response package (.docx)
          </button>
          <button className="cc-btn sm" disabled={busy || !data?.packageReady} onClick={() => void download('md')}>
            Markdown
          </button>
          {!data?.packageReady && data && data.outstanding.length > 0 && (
            <span className="cc-q-note">
              Available when every response is approved. Outstanding:{' '}
              {data.outstanding.map((o) => `${o.questionRef} (${STATE_LABEL[o.state as ResponseState] ?? o.state})`).join(', ')}.
            </span>
          )}
        </div>
      )}

      {adding && (
        <C2CForm
          config={{
            eyebrow: 'Agency letter · questions',
            title: 'Record a question',
            sub: `Record the question exactly as ${letter.communicationType} states it. It then takes a response and an approval.`,
            governed: 'Recorded with your reason in the audit trail.',
            submitLabel: 'Record question',
            fields: [
              { key: 'questionRef', label: 'Question number', type: 'text', placeholder: 'As the agency numbered it, e.g. Q3', required: true, half: true },
              { key: 'discipline', label: 'Discipline', type: 'select', options: ['Clinical', 'Nonclinical', 'CMC', 'Biostatistics', 'Labeling', 'Safety', 'Regulatory'], half: true },
              { key: 'severity', label: 'Severity', type: 'seg', options: ['major', 'minor', 'critical'] },
              { key: 'questionText', label: 'Question text', type: 'textarea', placeholder: 'Paste the question verbatim', required: true },
              { key: 'reason', label: 'Reason', type: 'text', placeholder: 'e.g. Recording the IR received 2026-10-12', required: true },
            ],
          }}
          onCancel={() => setAdding(false)}
          onSubmit={(v) => void addQuestion(v)}
        />
      )}

      {committing && (
        <C2CForm
          config={{
            eyebrow: `${committing.questionRef} · commitment`,
            title: 'Record a commitment',
            sub: `A commitment made in the response to ${committing.questionRef}. It is tracked with its due date under Meetings & commitments.`,
            governed: 'Recorded with your reason in the audit trail.',
            submitLabel: 'Record commitment',
            fields: [
              { key: 'commitmentType', label: 'Type', type: 'select', options: COMMITMENT_TYPES, required: true },
              { key: 'description', label: 'What was committed', type: 'textarea', required: true },
              { key: 'dueDate', label: 'Due date', type: 'date', half: true },
              { key: 'regulatoryBasis', label: 'Regulatory basis', type: 'text', placeholder: 'e.g. 21 CFR 314.81(b)(2)(vii)', half: true },
              { key: 'reason', label: 'Reason', type: 'text', required: true },
            ],
          }}
          onCancel={() => setCommitting(null)}
          onSubmit={(v) => void recordCommitment(v)}
        />
      )}

      {signing && (
        <EsignModal
          open
          action="Approve response"
          target={`${signing.questionRef}: ${letter.communicationType}`}
          targetMeta={`Your signature binds this question and the exact response text shown (revision ${signing.responseRevision}). Any later change to the text needs a new signature.`}
          meanings={APPROVAL_MEANINGS}
          defaultMeaning="approval"
          signer={printedSigner(authUser)}
          requireMfa={authUser?.mfaEnabled === true}
          onClose={() => {
            setSigning(null);
            if (signed.current) reload();
          }}
          onSign={sign}
        />
      )}
    </section>
  );
}
