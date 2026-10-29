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
 *   - Record a commitment made in a response (PMR, PMC, REMS…), into the
 *     project's commitments register under Communication's Meetings & commitments.
 *   - Withdraw a question recorded in error (governed, with a reason). It stays
 *     in the record, marked withdrawn, and needs no response.
 *   - Mark a letter that requires a response as asking nothing, with a reason,
 *     when no question is recorded on it.
 *   - Record the CTD section a question concerns, and correct it with a reason
 *     (2026-10-19). It is classification: the signature does not cover it.
 *   - Set who owns preparing a question's response, or clear it, with a reason
 *     (2026-10-19): an active member who may open the letter at its
 *     visibility, which the server checks. It replaces the free-text
 *     assignment CMC kept on its own, now read-only, question file.
 *     CMC / Module 3 lists the program's questions about its sections from it
 *     and opens each here, on its letter (P-38, P-39 item 1).
 *   - Read every text a response has had, who wrote it and why, and the
 *     signature that approved it, if one did (the history disclosure).
 *   - Download the response package once every response is approved as it
 *     stands. The server assembles it and records the export.
 *
 * This module decides nothing. A response's state (no response, draft,
 * changed after approval, approved, withdrawn), whether this person may write
 * or sign, why the letter cannot close yet, whether it is overdue, and whether
 * the package is ready are all the server's words. Nothing here says a response is approved that
 * the server did not say is, and no control is offered that the server says
 * this person would be refused.
 */
import React from 'react';
import { AgencyResponseEditor } from './AgencyResponseEditor';
import { useAuthoringReadSession } from '../editor/authoringCurrentRead';
import { ApiRequestError, apiRequest, assertApiResponseOk } from '@/lib/queryClient';
import { useAuthUser, type AuthUser } from '@/services/portal/authService';
import { EsignModal, type EsigSignedManifest, type EsignSigner } from '../../_shared/components/EsignModal';
import type { EsigMeaning } from '../../hooks/useEsignature';
import { C2CForm } from '../C2CForm';
import { EmptyState, useLiveData, type DataReadOwner } from '../dataConnect';
import { downloadBlob } from '../download';
import { I } from '../icons';
import type { CommRow } from './AgencyInbox';
import { RESPONSE_STATE_LABEL as STATE_LABEL, RESPONSE_STATE_TONE as STATE_TONE, type ResponseState } from './agencyQuestionState';
import { LetterQuestionProposals } from './LetterQuestionProposals';

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
  /** The register's own reading: past due and not met is overdue. */
  effectiveStatus: string;
}

interface RevisionView {
  revision: number;
  responseText: string;
  writtenByName: string | null;
  writtenAt: string;
  reason: string;
  approvedBy: SignatureView | null;
}

interface ViewerCapabilities {
  canWrite: boolean;
  writeRefusal: string | null;
  canSign: boolean;
  signAuthorityRefusal: string | null;
}

export interface AgencyQuestionView {
  id: number;
  questionRef: string;
  questionText: string;
  discipline: string | null;
  /** The CTD section the question concerns, in the repository's one spelling; null when none is recorded. */
  ctdSection?: string | null;
  /** Who owns preparing the response; null (or absent) with none. */
  ownerUserId?: number | null;
  ownerName?: string | null;
  severity: string;
  responseText: string;
  responseRevision: number;
  responseUpdatedByName: string | null;
  responseUpdatedAt: string | null;
  state: ResponseState;
  approval: SignatureView | null;
  supersededApproval: SignatureView | null;
  signRefusal: { code: string; message: string } | null;
  withdrawal: { withdrawnAt: string | null; withdrawnByName: string | null; reason: string | null } | null;
  /** Every text this response has had, newest first. */
  history: RevisionView[];
  commitments: CommitmentView[];
}

interface QuestionsPayload {
  letter: {
    id: string;
    communicationType: string;
    closureStatus: string;
    dueDate: string | null;
    /** The agency's date, or the one the response clock derives from the letter's class: what overdue is judged by. */
    responseDueDate?: string | null;
    responseRequired: boolean;
    /** Why the letter may not be closed now, in the server's words; null when it may. */
    closeRefusal: string | null;
    /** The server's one overdue verdict (response-logic letterOverdue), the same CMC counts. */
    overdue?: boolean;
  };
  viewer: ViewerCapabilities;
  questions: AgencyQuestionView[];
  outstanding: Array<{ questionRef: string; state: string }>;
  packageReady: boolean;
}

function isQuestionsPayload(v: unknown): v is QuestionsPayload {
  const p = v as QuestionsPayload | null;
  return Boolean(p && p.letter && p.viewer && Array.isArray(p.questions) && Array.isArray(p.outstanding));
}

/** One active member of the organisation, as GET …/projects/:projectId/team lists them. */
interface TeamMember {
  userId: number;
  name: string;
  role: string | null;
}
/** The owner select's value for "no owner". */
const NO_OWNER = 'none';

/** Refusals that mean the record moved under this person: show it as it now stands. */
const STALE_CODES = new Set(['RESPONSE_CHANGED', 'ALREADY_APPROVED', 'NOTHING_TO_SIGN', 'QUESTION_WITHDRAWN', 'LETTER_CLOSED']);
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

/** One question: the agency's words, our response, its approval, its history and its commitments. */
function QuestionCard({
  q,
  closed,
  busy,
  viewer,
  targeted = false,
  projectId,
  eventId,
  onNav,
  onSaved,
  onBusy,
  currentVisit,
  fire,
  onSign,
  onCommit,
  onWithdraw,
  onClassify,
  onAssign,
}: {
  q: AgencyQuestionView;
  closed: boolean;
  busy: boolean;
  viewer: ViewerCapabilities;
  /** Opened from a link to this question (CMC's "Open on its letter"): scrolled into view. */
  targeted?: boolean;
  projectId: string; eventId: string; onNav?: (id: string) => void;
  onSaved: () => void; onBusy: (busy: boolean) => void; fire: (message: string, tone?: 'ok' | 'error') => void;
  currentVisit: () => boolean;
  onSign: (q: AgencyQuestionView) => void;
  onCommit: (q: AgencyQuestionView) => void;
  onWithdraw: (q: AgencyQuestionView) => void;
  onClassify: (q: AgencyQuestionView) => void;
  onAssign: (q: AgencyQuestionView) => void;
}) {
  const itemRef = React.useRef<React.ElementRef<'li'> | null>(null);
  React.useEffect(() => {
    if (targeted) itemRef.current?.scrollIntoView?.({ block: 'center' });
  }, [targeted]);
  const [editing, setEditing] = React.useState(false);
  const textId = React.useId();
  const withdrawn = q.state === 'withdrawn';
  const writable = !closed && !withdrawn && viewer.canWrite;
  const signable = !closed && (q.state === 'drafted' || q.state === 'changed-after-approval') && viewer.canWrite;
  const signBlock = q.signRefusal?.message ?? (viewer.canSign ? null : viewer.signAuthorityRefusal);

  const startEdit = () => setEditing(true);

  return (
    <li ref={itemRef} className="cc-q" data-state={q.state} data-question-id={q.id} data-targeted={targeted || undefined}>
      <div className="cc-comm-top">
        <span className="cc-comm-t">{q.questionRef}</span>
        {q.discipline && <span className="cc-comm-src">{q.discipline}</span>}
        {q.ctdSection && <span className="cc-comm-src mono" title="CTD section">§{q.ctdSection}</span>}
        {q.ownerUserId != null && (
          <span className="cc-comm-src" title="Owns preparing the response">Owner: {q.ownerName ?? 'a member'}</span>
        )}
        <span className={'rd-chip tone-' + (q.severity === 'critical' ? 'err' : q.severity === 'major' ? 'warn' : 'idle')}>
          {q.severity}
        </span>
        <span className={'rd-chip tone-' + STATE_TONE[q.state]}>{STATE_LABEL[q.state]}</span>
      </div>
      <blockquote className="cc-q-text">{q.questionText}</blockquote>

      {withdrawn && q.withdrawal && (
        <p className="cc-q-sig">
          Withdrawn{q.withdrawal.withdrawnByName ? ` by ${q.withdrawal.withdrawnByName}` : ''}
          {q.withdrawal.withdrawnAt ? ` on ${when(q.withdrawal.withdrawnAt)}` : ''}
          {q.withdrawal.reason ? `: ${q.withdrawal.reason}` : ''}. It needs no response and is left out of the package.
        </p>
      )}

      {editing ? (
        <AgencyResponseEditor projectId={projectId} eventId={eventId} questionId={q.id} questionRef={q.questionRef}
          responseRevision={q.responseRevision} onNav={onNav} onSaved={onSaved} onCancel={() => setEditing(false)} hostCurrent={currentVisit}
          onBusy={onBusy} fire={fire} />
      ) : (
        !withdrawn && (
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
        )
      )}

      {q.approval && <p className="cc-q-sig">Approved by {signatureSentence(q.approval)}.</p>}
      {q.state === 'changed-after-approval' && q.supersededApproval && (
        <p className="cc-q-sig" data-tone="err">
          Approved earlier by {signatureSentence(q.supersededApproval)}. The response has changed since, so it needs a new signature.
          The approved text is kept in the history below.
        </p>
      )}

      {q.commitments.length > 0 && (
        <ul className="cc-comm-issues">
          {q.commitments.map((c) => (
            <li key={c.id}>
              {c.commitmentType.toUpperCase()}: {c.description}
              {c.dueDate ? `, due ${c.dueDate}` : ''} (
              <span data-tone={c.effectiveStatus === 'overdue' ? 'err' : undefined}>{c.effectiveStatus.replace(/_/g, ' ')}</span>)
            </li>
          ))}
        </ul>
      )}

      {q.history.length > 0 && (
        <details className="cc-q-hist">
          <summary>
            History · {q.history.length} text{q.history.length === 1 ? '' : 's'}
          </summary>
          <ol className="cc-q-hist-list">
            {q.history.map((h) => (
              <li key={h.revision}>
                <p className="cc-q-meta mono">
                  Revision {h.revision}
                  {h.writtenByName ? `, written by ${h.writtenByName}` : ''} on {when(h.writtenAt)}. Reason: {h.reason}
                </p>
                <p className="cc-q-body">{h.responseText.trim() ? h.responseText : '(empty)'}</p>
                <p className="cc-q-meta">{h.approvedBy ? `Approved by ${signatureSentence(h.approvedBy)}.` : 'Not approved.'}</p>
              </li>
            ))}
          </ol>
        </details>
      )}

      {!editing && (writable || signable) && (
        <div className="cc-comm-foot">
          {writable && (
            <button className="cc-btn sm" disabled={busy} onClick={startEdit}>
              {I.penLine} {q.responseText.trim() ? 'Edit response' : 'Write response'}
            </button>
          )}
          {signable && (
            <button
              className="cc-btn sm primary"
              disabled={busy || signBlock !== null}
              aria-describedby={signBlock ? `${textId}-why` : undefined}
              onClick={() => onSign(q)}
            >
              {I.check} Approve response
            </button>
          )}
          {writable && (
            <button className="cc-btn sm" disabled={busy} onClick={() => onCommit(q)}>
              Record commitment
            </button>
          )}
          {writable && q.state !== 'approved' && (
            <button className="cc-btn sm" disabled={busy} onClick={() => onWithdraw(q)}>
              Withdraw question
            </button>
          )}
          {/* "Record" when none is recorded; "Correct" only when one is. */}
          {writable && (
            <button className="cc-btn sm" disabled={busy} onClick={() => onClassify(q)}>
              {q.ctdSection ? 'Correct section' : 'Record section'}
            </button>
          )}
          {writable && (
            <button className="cc-btn sm" disabled={busy} onClick={() => onAssign(q)}>
              {q.ownerUserId != null ? 'Change owner' : 'Set owner'}
            </button>
          )}
          {signable && signBlock && (
            <span id={`${textId}-why`} className="cc-q-note">{signBlock}</span>
          )}
        </div>
      )}
    </li>
  );
}

interface AgencyResponsesProps {
  projectId: string; letter: CommRow; fire: (m: string, tone?: 'ok' | 'error') => void;
  /** A question another screen linked to (CMC's "Open on its letter"). */
  focusQuestionId?: number | null; onNav?: (id: string) => void;
}
/** Retire all retained questions and action forms before a different visit renders. */
export function AgencyResponses(props: AgencyResponsesProps) {
  const session = useAuthoringReadSession(useAuthUser());
  const key = `${session.actor}:${session.key}:${props.projectId}:${props.letter.id}`;
  const owner = React.useRef({ key });
  if (owner.current.key !== key) owner.current = { key };
  const visit = owner.current;
  const readOwner = React.useMemo(() => ({ key, current: () => owner.current === visit && session.sameRevision() }), [key, visit, session]);
  return <ScopedAgencyResponses key={key} {...props} readOwner={readOwner} />;
}

/** The questions and responses of one admitted inbox-letter visit. */
function ScopedAgencyResponses({
  projectId,
  letter,
  fire: hostFire,
  focusQuestionId = null,
  onNav,
  readOwner,
}: AgencyResponsesProps & { readOwner: DataReadOwner }) {
  const base = `/api/concept2cure/projects/${encodeURIComponent(projectId)}/agency-communications/${encodeURIComponent(letter.id)}`;
  const [version, setVersion] = React.useState(0);
  const reload = () => { if (readOwner.current()) setVersion((v) => v + 1); };
  const fire = (message: string, tone?: 'ok' | 'error') => { if (readOwner.current()) hostFire(message, tone); };
  const read = useLiveData<QuestionsPayload>(`${base}/questions`, [base, version],
    (value: unknown): value is QuestionsPayload => isQuestionsPayload(value) && value.letter.id === letter.id, readOwner);
  const authUser = useAuthUser();
  const [busy, setBusy] = React.useState(false);
  /** The Record-a-question form, open; filled with a question the letter's text numbers (G3), or empty. */
  const [adding, setAdding] = React.useState<null | { questionRef: string; questionText: string }>(null);
  const [committing, setCommitting] = React.useState<AgencyQuestionView | null>(null);
  const [withdrawing, setWithdrawing] = React.useState<AgencyQuestionView | null>(null);
  const [classifying, setClassifying] = React.useState<AgencyQuestionView | null>(null);
  const [assigning, setAssigning] = React.useState<AgencyQuestionView | null>(null);
  /* The organisation's active members, read only while the owner form is
     open. The server decides who may own a response (a member who may open
     this letter at its visibility) and says so if the one chosen may not. */
  const team = useLiveData<TeamMember[]>(
    assigning ? `/api/concept2cure/projects/${encodeURIComponent(projectId)}/team` : null,
    [projectId, assigning?.id ?? null],
    undefined, readOwner,
  );
  const [askingNothing, setAskingNothing] = React.useState(false);
  const [signing, setSigning] = React.useState<AgencyQuestionView | null>(null);
  /* Reload when the signing dialog closes: after a signature, or after a
     refusal that says the record moved (another save, another approval). */
  const reloadOnClose = React.useRef(false);

  const data = read.data;
  const closed = data?.letter.closureStatus === 'closed';

  const addQuestion = async (v: Record<string, string>) => {
    if (!readOwner.current()) return;
    setBusy(true);
    try {
      const res = await apiRequest('POST', `${base}/questions`, {
        questionRef: v.questionRef,
        questionText: v.questionText,
        discipline: v.discipline || undefined,
        ctdSection: v.ctdSection?.trim() || undefined,
        severity: v.severity || 'major',
        reason: v.reason,
      });
      if (!res.ok) await assertApiResponseOk(res);
      if (!readOwner.current()) return;
      setAdding(null);
      fire(`Question ${v.questionRef} recorded, with an audit entry.`);
      reload();
    } catch (e) {
      fire(`Question not recorded: ${said(e)}. Nothing was stored.`, 'error');
    } finally {
      setBusy(false);
    }
  };


  const recordCommitment = async (v: Record<string, string>) => {
    if (!readOwner.current()) return;
    if (!committing) return;
    setBusy(true);
    try {
      const res = await apiRequest('POST', `${base}/questions/${committing.id}/commitments`, {
        commitmentType: v.commitmentType,
        description: v.description,
        dueDate: v.dueDate || undefined,
        regulatoryBasis: v.regulatoryBasis || undefined,
        reason: v.reason,
      });
      if (!res.ok) await assertApiResponseOk(res);
      if (!readOwner.current()) return;
      fire(`Commitment recorded from ${committing.questionRef}. It is listed under Meetings & commitments.`);
      setCommitting(null);
      reload();
    } catch (e) {
      fire(`Commitment not recorded: ${said(e)}. Nothing was stored.`, 'error');
    } finally {
      setBusy(false);
    }
  };

  const withdraw = async (v: Record<string, string>) => {
    if (!readOwner.current()) return;
    if (!withdrawing) return;
    setBusy(true);
    try {
      const res = await apiRequest('POST', `${base}/questions/${withdrawing.id}/withdraw`, { reason: v.reason });
      if (!res.ok) await assertApiResponseOk(res);
      if (!readOwner.current()) return;
      fire(`Question ${withdrawing.questionRef} withdrawn, with an audit entry. It stays in the record.`);
      setWithdrawing(null);
      reload();
    } catch (e) {
      fire(`Question ${withdrawing.questionRef} not withdrawn: ${said(e)}.`, 'error');
      if (e instanceof ApiRequestError && e.code && STALE_CODES.has(e.code)) reload();
    } finally {
      setBusy(false);
    }
  };

  /* A question's CTD section, corrected with a reason. The server normalises
     it (3.2.p.5 → 3.2.P.5) or refuses what is not a CTD code; an empty value
     clears it. The approval is not affected: the signature does not cover it. */
  const classify = async (v: Record<string, string>) => {
    if (!readOwner.current()) return;
    if (!classifying) return;
    setBusy(true);
    try {
      const res = await apiRequest('PATCH', `${base}/questions/${classifying.id}`, { ctdSection: v.ctdSection?.trim() || null, reason: v.reason });
      if (!res.ok) await assertApiResponseOk(res);
      if (!readOwner.current()) return;
      fire(`Section of ${classifying.questionRef} recorded, with an audit entry.`);
      setClassifying(null);
      reload();
    } catch (e) {
      fire(`Section of ${classifying.questionRef} not changed: ${said(e)}.`, 'error');
      if (e instanceof ApiRequestError && e.code && STALE_CODES.has(e.code)) reload();
    } finally {
      setBusy(false);
    }
  };

  /* The owner of a question's response, set or cleared with a reason. */
  const assign = async (v: Record<string, string>) => {
    if (!readOwner.current()) return;
    if (!assigning) return;
    const ownerUserId = v.owner === NO_OWNER ? null : Number(v.owner);
    setBusy(true);
    try {
      const res = await apiRequest('PATCH', `${base}/questions/${assigning.id}/owner`, { ownerUserId, reason: v.reason });
      if (!res.ok) await assertApiResponseOk(res);
      if (!readOwner.current()) return;
      fire(
        ownerUserId === null
          ? `Owner of ${assigning.questionRef} cleared, with an audit entry.`
          : `Owner of ${assigning.questionRef} recorded, with an audit entry.`,
      );
      setAssigning(null);
      reload();
    } catch (e) {
      fire(`Owner of ${assigning.questionRef} not changed: ${said(e)}.`, 'error');
      if (e instanceof ApiRequestError && e.code && STALE_CODES.has(e.code)) reload();
    } finally {
      setBusy(false);
    }
  };

  const markNoResponseRequired = async (v: Record<string, string>) => {
    if (!readOwner.current()) return;
    setBusy(true);
    try {
      const res = await apiRequest('POST', `${base}/no-response-required`, { reason: v.reason });
      if (!res.ok) await assertApiResponseOk(res);
      if (!readOwner.current()) return;
      fire('Letter marked as needing no response, with an audit entry. It can now be closed.');
      setAskingNothing(false);
      reload();
    } catch (e) {
      fire(`Letter not changed: ${said(e)}.`, 'error');
      reload();
    } finally {
      setBusy(false);
    }
  };

  const sign = async (input: { meaning: EsigMeaning; reason: string; password: string; totp?: string }): Promise<EsigSignedManifest> => {
    if (!readOwner.current()) throw new Error('The letter or session changed. Reopen the response before signing.');
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
      if (!readOwner.current()) throw new Error('The letter or session changed. Reopen the response to read its signing result.');
      if (!res.ok || body?.data?.state !== 'approved' || !body.signedAt) {
        throw new Error('Whether the response was approved could not be confirmed. Reload before signing again.');
      }
      reloadOnClose.current = true;
      return { meaning: input.meaning, reason: input.reason, signedAt: body.signedAt };
    } catch (e) {
      if (e instanceof ApiRequestError) {
        if (e.code && STALE_CODES.has(e.code)) {
          reloadOnClose.current = true;
          throw new Error(`${e.message} Close this dialog to see the response as it now stands.`);
        }
        throw new Error(`${e.message}`);
      }
      throw e;
    }
  };

  const download = async (format: 'md' | 'docx') => {
    if (!readOwner.current()) return;
    setBusy(true);
    try {
      const res = await apiRequest('POST', `${base}/response-package`, { format });
      if (!res.ok) {
        fire('The package was not delivered. Sign in and try again.', 'error');
        return;
      }
      const sha = res.headers.get('X-Export-Sha256');
      const blob = await res.blob();
      if (!readOwner.current()) return;
      const ok = downloadBlob(`response-${letter.id}.${format}`, blob);
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
  const viewer: ViewerCapabilities = data?.viewer ?? { canWrite: false, writeRefusal: null, canSign: false, signAuthorityRefusal: null };
  const asked = questions.filter((q) => q.state !== 'withdrawn');
  const approvedCount = asked.filter((q) => q.state === 'approved').length;
  const withdrawnCount = questions.length - asked.length;

  return (
    <section className="cc-qs" aria-label={`Questions and responses for ${letter.communicationType}`}>
      <div className="cc-inbox-head">
        <div className="pj-seclbl" style={{ margin: 0 }}>
          Questions and responses{' '}
          <span className="s">
            · {asked.length} question{asked.length === 1 ? '' : 's'} · {approvedCount} approved
            {withdrawnCount > 0 ? ` · ${withdrawnCount} withdrawn` : ''}
          </span>
        </div>
        {!closed && viewer.canWrite && (
          <button className="cc-btn sm" disabled={busy} onClick={() => setAdding({ questionRef: '', questionText: '' })}>
            {I.plus} Record question
          </button>
        )}
      </div>

      {!closed && !viewer.canWrite && viewer.writeRefusal && (
        <p className="cc-q-note" role="note">
          You can read the questions and responses on this letter. {viewer.writeRefusal}
        </p>
      )}

      {!closed && viewer.canWrite && (
        <LetterQuestionProposals base={base} version={version} readOwner={readOwner} disabled={busy}
          onRecord={(p) => setAdding({ questionRef: p.ref, questionText: p.text })} />
      )}

      {questions.length === 0 ? (
        <p className="cc-q-note">
          No questions are recorded on this letter.
          {!data?.letter.responseRequired && ' Record each question as the agency numbered and worded it; each then takes a response and an approval.'}
        </p>
      ) : (
        <ol className="cc-q-list">
          {questions.map((q) => (
            <QuestionCard
              key={q.id}
              q={q}
              closed={closed}
              busy={busy}
              viewer={viewer}
              projectId={projectId} eventId={letter.id} onNav={onNav} onSaved={reload} onBusy={setBusy} fire={fire} currentVisit={readOwner.current}
              onSign={(x) => {
                reloadOnClose.current = false;
                setSigning(x);
              }}
              onCommit={setCommitting}
              onWithdraw={setWithdrawing}
              onClassify={setClassifying}
              onAssign={setAssigning}
              targeted={focusQuestionId === q.id}
            />
          ))}
        </ol>
      )}

      {/* The server's verdict, said as what made it: responses not approved,
          or (a response-required letter) no question to answer recorded. */}
      {!closed && data?.letter.overdue && (
        <p className="cc-q-note" data-tone="err" role="note">
          Overdue: past its due date{(data.letter.responseDueDate ?? data.letter.dueDate) ? ` (${(data.letter.responseDueDate ?? data.letter.dueDate)!.slice(0, 10)})` : ''}
          {asked.length === 0 ? ', with no question recorded.' : ', with responses not approved as they stand.'}
        </p>
      )}
      {!closed && data?.letter.closeRefusal && (
        <p className="cc-q-note" role="note">
          {data.letter.closeRefusal}
        </p>
      )}
      {!closed && viewer.canWrite && data?.letter.responseRequired && asked.length === 0 && (
        <div className="cc-comm-foot">
          <button className="cc-btn sm" disabled={busy} onClick={() => setAskingNothing(true)}>
            Mark as needing no response
          </button>
        </div>
      )}

      {asked.length > 0 && (
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
          key={`${adding.questionRef}:${adding.questionText.length}`}
          config={{
            eyebrow: 'Agency letter · questions',
            title: 'Record a question',
            sub: `Record the question exactly as ${letter.communicationType} states it. It then takes a response and an approval.`,
            governed: 'Recorded with your reason in the audit trail.',
            submitLabel: 'Record question',
            fields: [
              { key: 'questionRef', label: 'Question number', type: 'text', placeholder: 'As the agency numbered it, e.g. Q3', required: true, half: true, default: adding.questionRef },
              { key: 'discipline', label: 'Discipline', type: 'select', options: ['Clinical', 'Nonclinical', 'CMC', 'Biostatistics', 'Labeling', 'Safety', 'Regulatory'], half: true },
              { key: 'severity', label: 'Severity', type: 'seg', options: ['major', 'minor', 'critical'] },
              { key: 'ctdSection', label: 'CTD section (optional)', type: 'text', placeholder: 'e.g. 3.2.P.5.1', half: true },
              { key: 'questionText', label: 'Question text', type: 'textarea', placeholder: 'Paste the question verbatim', required: true, default: adding.questionText },
              { key: 'reason', label: 'Reason', type: 'text', placeholder: 'e.g. Recording the IR received 2026-10-12', required: true },
            ],
          }}
          onCancel={() => setAdding(null)}
          onSubmit={(v) => void addQuestion(v)}
        />
      )}

      {withdrawing && (
        <C2CForm
          config={{
            eyebrow: `${withdrawing.questionRef} · withdraw`,
            title: 'Withdraw this question',
            sub: `Withdraw ${withdrawing.questionRef} only if it was recorded in error. It stays in the record, marked withdrawn, needs no response and is left out of the package. This cannot be undone; record the question again if it is needed.`,
            governed: 'Recorded with your reason in the audit trail.',
            submitLabel: 'Withdraw question',
            fields: [
              { key: 'reason', label: 'Reason', type: 'text', placeholder: 'e.g. Recorded twice; the agency asked this once, as Q4', required: true },
            ],
          }}
          onCancel={() => setWithdrawing(null)}
          onSubmit={(v) => void withdraw(v)}
        />
      )}

      {classifying && (
        <C2CForm
          config={{
            eyebrow: `${classifying.questionRef} · CTD section`,
            title: classifying.ctdSection ? 'Correct the section' : 'Record the section',
            sub: classifying.ctdSection
              ? `The CTD section ${classifying.questionRef} concerns, as the agency's question cites it. Leave it empty to record none. It classifies the question; the approval does not cover it.`
              : `No CTD section is recorded for ${classifying.questionRef}. Record the one the agency's question cites. It classifies the question; the approval does not cover it.`,
            governed: 'Recorded with your reason in the audit trail.',
            submitLabel: classifying.ctdSection ? 'Correct section' : 'Record section',
            fields: [
              { key: 'ctdSection', label: 'CTD section', type: 'text', placeholder: 'e.g. 3.2.S.4.1', default: classifying.ctdSection ?? '' },
              { key: 'reason', label: 'Reason', type: 'text', placeholder: 'e.g. The agency cites the impurity specification', required: true },
            ],
          }}
          onCancel={() => setClassifying(null)}
          onSubmit={(v) => void classify(v)}
        />
      )}

      {assigning && (
        <C2CForm
          config={{
            eyebrow: `${assigning.questionRef} · Owner`,
            title: assigning.ownerUserId != null ? 'Change the owner' : 'Set the owner',
            sub:
              `Who prepares the response to ${assigning.questionRef}. ` +
              'They must be able to open this letter at its visibility. The approval does not cover it.',
            governed: 'Recorded with your reason in the audit trail.',
            submitLabel: 'Record owner',
            fields: [
              {
                key: 'owner',
                label: 'Owner',
                type: 'select',
                required: true,
                default: assigning.ownerUserId != null ? String(assigning.ownerUserId) : '',
                options: [
                  ...(assigning.ownerUserId != null ? [{ value: NO_OWNER, label: 'No owner' }] : []),
                  ...(team.data ?? []).map((m) => ({ value: String(m.userId), label: m.role ? `${m.name} (${m.role})` : m.name })),
                ],
                descStatus: team.loading
                  ? "Reading the organisation's members…"
                  : team.error
                    ? "The organisation's members could not be read, so no one can be chosen now."
                    : undefined,
              },
              { key: 'reason', label: 'Reason', type: 'text', placeholder: 'e.g. Ines leads the dissolution work', required: true },
            ],
          }}
          onCancel={() => setAssigning(null)}
          onSubmit={(v) => void assign(v)}
        />
      )}

      {askingNothing && (
        <C2CForm
          config={{
            eyebrow: 'Agency letter · no response',
            title: 'Mark as needing no response',
            sub: `${letter.communicationType} is recorded as requiring a response, and no question is recorded on it. If the letter asks nothing of you, say why; it can then be closed without a response package.`,
            governed: 'Recorded with your reason in the audit trail.',
            submitLabel: 'Mark as needing no response',
            fields: [
              { key: 'reason', label: 'Reason', type: 'text', placeholder: 'e.g. Acknowledgement letter; it asks no questions', required: true },
            ],
          }}
          onCancel={() => setAskingNothing(false)}
          onSubmit={(v) => void markNoResponseRequired(v)}
        />
      )}

      {committing && (
        <C2CForm
          config={{
            eyebrow: `${committing.questionRef} · commitment`,
            title: 'Record a commitment',
            sub: `A commitment made in the response to ${committing.questionRef}. It is tracked with its due date under Meetings & commitments, separately from the signed responses.`,
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
            if (reloadOnClose.current) reload();
          }}
          onSign={sign}
        />
      )}
    </section>
  );
}
