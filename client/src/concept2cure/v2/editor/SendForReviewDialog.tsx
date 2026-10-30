/**
 * Send for review — the review request, its review route and each reviewer's
 * task, as ONE act on ONE server transaction.
 *
 * ── What it writes ───────────────────────────────────────────────────────────
 * POST /api/authoring/documents/:id/request-review
 *   { reviewers: [{ id, name }], reason, route: { reviewDueDate }, instructions, priority }
 * (server/routes/authoring.router.ts). In one transaction the server writes one
 * authoring_reviews row per reviewer, status pending, the Reviewer grants, an
 * audited `review_requested` row carrying the reason, the review route's header
 * and one route task per reviewer in their Tasks
 * (docs/design/REVIEW_ROUTING_2026-10-23.md, RR5). They commit together or not
 * at all, so there is no second write to fail or to lose.
 *
 * Until RR5 the dialog made that second write itself: one POST /api/tasks/tasks
 * per reviewer once the request was confirmed, and a task could be refused or
 * lost after the request stood. That write is removed; the receipt names the
 * tasks the server wrote, from its answer (`route.tasks`).
 *
 * The reviewer closes their route task with the review signature (the
 * document's E-sign, meaning Review). "Changes requested" on the Review board
 * returns the route to the sender. The due date is the end of that day in the
 * sender's notification time zone, which the form names. Who may be chosen is
 * the route's one member validator's answer (GET …/route-candidates): a member
 * it would refuse (no signing authority, no access to the project, an author)
 * is shown disabled with its reason, never left out silently.
 *
 * ── Who has already been asked ───────────────────────────────────────────────
 * The dialog reads the document's review requests first (useDocumentReviews,
 * shared with the Tasks rail), and a member who already has one is shown with
 * it. One whose review is pending cannot be chosen: they are already asked. One
 * whose verdict is recorded can be asked again, the usual loop (changes
 * requested, revised, asked again): since wave 2D the route reopens their row
 * to pending (authoring.router.ts, request-review), and the note beside them
 * says their verdict stays in the record and a new review is requested. The
 * earlier verdict keeps its own document_reviewed audit row. If that read
 * fails, no one can be chosen. A task is made only for a row that comes back
 * pending; a row that comes back with a verdict was not reopened, gets no
 * task, and the receipt and toast preserve its actual saved-content standing.
 *
 * ── The reviewer identity ────────────────────────────────────────────────────
 * The board decides "awaiting my review" from the assigned user id. The
 * roster, GET /api/task-management/assignees, gives each member's users.id as
 * a string, sent exactly as the roster gives it. The server resolves current
 * membership and display names from authoritative users; supplied labels
 * confer no queue ownership or document access.
 *
 * ── Who may review, and with what access (QA 2026-10-08, j4) ────────────────
 * The author could ask herself, and a reviewer was granted nothing on the
 * document, so could neither comment nor sign the review. The route refuses
 * original authors and historical human contributors, and this dialog does
 * not offer the original author (useReviewerRoster, `authorId`). When the requester may manage
 * the document's access (its owner or an administrator), the route grants
 * each reviewer the Reviewer role in the same transaction and answers with
 * `grants`; the receipt and the toast say who was granted it, or, in the
 * server's words, why no access was granted.
 *
 * ── Part 11 ─────────────────────────────────────────────────────────────────
 * The request is the person's act. Nothing here runs without their click, and
 * AnA has no path to it. The route accepts an optional reason
 * (optionalGovernedReason: absent, or at least GOVERNED_REASON_MIN
 * characters). A review request is a governed act, so this dialog requires one
 * at that floor and the audit row says why. A refusal is shown in the server's
 * words. Nothing is reported as requested without the server's own review rows
 * for this document.
 */
import React, { useEffect, useRef, useState } from 'react';
import { GOVERNED_REASON_MIN } from '@shared/constants/governed-reason';
import { apiRequest, ApiRequestError, redactInternals, serverMessage } from '@/lib/queryClient';
import { captureAuthoringSession } from './authoringCurrentRead';
import { I } from '../icons';
import { useDialog } from '../useDialog';
import type { FireToast } from '../toast';
import {
  PRIORITIES,
  ReviewerChecklist,
  alreadyAsked,
  useReviewerRoster,
  type AssignOutcome,
  type Assignee,
  type Priority,
} from './AssignReviewDialog';
import { routeTaskOutcomes, routeTasksOf, useRouteRefusals, type RouteTaskReceipt } from './reviewRequestRoute';

export { routeTaskOutcomes, routeTasksOf, type RouteTaskReceipt };
import { reviewStatusLabel, useDocumentReviews } from './ReviewTasksPanel';
import { reviewStandingOf } from './reviewTaskState';
import { DueDateField, ReasonField, reviewReasonProblem } from './reviewFields';

export { reviewReasonProblem };
import type { AuthoringReviewStanding } from '@shared/authoring/peer-review';

/** One review request as the server recorded it. */
export interface ReviewRequestReceipt {
  id: string;
  reviewerId: string;
  reviewer: string;
  status: string;
  standing: AuthoringReviewStanding;
  comments: string | null;
  /** Whether the request gave this reviewer the Reviewer role on the document
   *  (the server's `grants`); absent when the answer did not say. */
  granted?: boolean;
  /** Why no access was granted, in the server's words. */
  grantNote?: string;
}

/** What became of one reviewer's task. */
export interface ReviewTaskOutcome {
  reviewerId: string;
  reviewer: string;
  outcome: AssignOutcome;
}

export interface SendForReviewResult {
  reviews: ReviewRequestReceipt[];
  tasks: ReviewTaskOutcome[];
}

export interface SendForReviewDialogProps {
  docId: string;
  docTitle: string;
  programId: string | null;
  sectionCode: string | null;
  /** The document's author (authoring_documents.created_by): not offered as a
   *  reviewer. The server refuses the author either way (REVIEWER_IS_AUTHOR). */
  authorId?: string | null;
  onClose: () => void;
  /** Called once the server has confirmed the request, with what became of each task. */
  onSent?: (result: SendForReviewResult) => void;
  fireToast: FireToast;
  /** Open the document's task list, to reconcile a task whose creation was not confirmed. */
  onCheckTasks?: () => void;
  /** Open the Review board, where the request is listed. */
  onOpenBoard?: () => void;
  /** Current read limit; a request already sent keeps its recorded outcome. */
  refusal?: string | null;
}

type RequestOutcome =
  | { ok: true; reviews: ReviewRequestReceipt[]; routeTasks: RouteTaskReceipt[] }
  | { ok: false; message: string; unconfirmed: boolean };

type Phase = 'form' | 'requesting' | 'done';

const REFUSED = 'The review request was refused: ';
const UNKNOWN = 'Whether the review request was recorded is unknown: ';
const RECONCILE = ' Check the Review board before sending again.';

/**
 * Added to every review task, so the task says how it closes (RR5): the review
 * signature closes it; a change request is a verdict on the Review board, and
 * returns the route.
 */
export const VERDICT_ON_THE_BOARD = 'Sign the review on the document (E-sign, meaning Review) to close this task. To ask for changes, record “changes requested” on the Review board, which returns the route to its sender.';

const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** The request body. Separate so the identity sent can be read and tested without a server. RR5: the route's due date, and what each task carries. */
export function buildReviewRequestBody(reviewers: Assignee[], reason: string, task?: { due: string; instructions: string; priority: Priority }): {
  reviewers: Array<{ id: string; name: string }>;
  reason: string;
  route?: { reviewDueDate: string };
  instructions?: string;
  priority?: Priority;
} {
  const body = { reviewers: reviewers.map(a => ({ id: a.id, name: a.name })), reason: reason.trim() };
  if (!task) return body;
  return { ...body, route: { reviewDueDate: task.due }, instructions: task.instructions, priority: task.priority };
}

/** Each reviewer's task description: the instructions, the reason the request gave, and where the verdict goes. */
export function reviewTaskDescription(reason: string, instructions: string): string {
  return [instructions.trim(), `Reason for the review request: ${reason.trim()}`, VERDICT_ON_THE_BOARD].filter(Boolean).join('\n\n');
}

/** The reviews the request actually asked for: the rows that came back pending. */
export function askedReviews(reviews: ReviewRequestReceipt[]): ReviewRequestReceipt[] {
  return reviews.filter(r => r.status === 'pending');
}

type ReviewRow = { id?: unknown; doc_id?: unknown; reviewer_id?: unknown; reviewer_name?: unknown; reviewer_email?: unknown; review_status?: unknown; standing?: unknown; review_comments?: unknown };
type GrantRow = { reviewerId?: unknown; granted?: unknown; reason?: unknown };

/** What the server's `grants` say about one reviewer's access; nothing when they do not say. */
function grantFor(grants: GrantRow[], reviewerId: string): Pick<ReviewRequestReceipt, 'granted' | 'grantNote'> {
  const grant = grants.find(g => String(g?.reviewerId ?? '').trim() === reviewerId);
  if (typeof grant?.granted !== 'boolean') return {};
  const grantNote = grant.granted ? null : text(grant.reason);
  return grantNote ? { granted: grant.granted, grantNote } : { granted: grant.granted };
}

function toReceipt(r: ReviewRow, grants: GrantRow[]): ReviewRequestReceipt {
  const reviewerId = String(r?.reviewer_id ?? '').trim();
  return {
    id: String(r?.id ?? ''),
    reviewerId,
    reviewer: text(r?.reviewer_name) ?? text(r?.reviewer_email) ?? reviewerId,
    status: String(r?.review_status ?? ''),
    standing: reviewStandingOf(String(r?.review_status ?? ''), r?.standing),
    comments: text(r?.review_comments),
    ...grantFor(grants, reviewerId),
  };
}

/**
 * The server's rows, when they confirm THIS request: every reviewer asked has a
 * row, and every row is on this document. Anything else is not a receipt.
 */
export function confirmedReviews(json: unknown, docId: string, reviewerIds: string[]): ReviewRequestReceipt[] | null {
  const body = json as { success?: unknown; reviews?: unknown; grants?: unknown } | null;
  if (!body || body.success !== true || !Array.isArray(body.reviews)) return null;
  const rows = body.reviews as ReviewRow[];
  if (rows.some(r => String(r?.doc_id ?? '') !== docId)) return null;
  const grants = Array.isArray(body.grants) ? (body.grants as GrantRow[]) : [];
  const receipts = rows.map(r => toReceipt(r, grants));
  const got = new Set(receipts.map(r => r.reviewerId));
  if (!receipts.every(r => r.id) || !reviewerIds.every(id => got.has(id))) return null;
  return receipts;
}

/** An answer that is not a success: unauthenticated, refused, or unknown. */
function answeredFailure(status: number, json: unknown): RequestOutcome {
  if (status === 401) return { ok: false, unconfirmed: false, message: 'Not sent: your session isn’t authenticated. Sign in and send again.' };
  const said = serverMessage(json) ?? `the server returned HTTP ${status}.`;
  if (status >= 500 || status === 408) return { ok: false, unconfirmed: true, message: UNKNOWN + said + RECONCILE };
  return { ok: false, unconfirmed: false, message: REFUSED + said };
}

/**
 * The object gate's refusal of this act, said as what it means here. Its
 * standard body names "the authoring object", an internal word (wave 2D: the
 * request is now gated as an edit of the document). The control is normally
 * not offered to such a sender (access.assignReview); this covers a grant
 * revoked after the document was read.
 */
const GATE_REFUSAL: Record<string, string> = {
  AUTHORING_OBJECT_FORBIDDEN: 'Sending this document for review needs an Owner or Author grant on it.',
};

/** A thrown failure: a refusal the server stated, or an outcome nobody can confirm. */
function thrownFailure(e: unknown): RequestOutcome {
  if (e instanceof ApiRequestError && e.code && GATE_REFUSAL[e.code]) {
    return { ok: false, unconfirmed: false, message: REFUSED + GATE_REFUSAL[e.code] };
  }
  if (e instanceof ApiRequestError && (e.code === 'AUDIT_WRITE_FAILED' || (e.status >= 400 && e.status < 500 && e.status !== 408))) {
    return { ok: false, unconfirmed: false, message: REFUSED + redactInternals(e.message, 'the request was not accepted.') };
  }
  const said = redactInternals(e instanceof Error ? e.message : '', 'no confirmed response was received.');
  return { ok: false, unconfirmed: true, message: UNKNOWN + said + RECONCILE };
}

async function requestReview(docId: string, body: ReturnType<typeof buildReviewRequestBody>): Promise<RequestOutcome> {
  try {
    const res = await apiRequest('POST', `/api/authoring/documents/${encodeURIComponent(docId)}/request-review`, body);
    const json = await res.json().catch(() => null);
    if (!res.ok) return answeredFailure(res.status, json);
    const reviews = confirmedReviews(json, docId, body.reviewers.map(r => r.id));
    if (!reviews) return { ok: false, unconfirmed: true, message: 'The response did not confirm a review request on this document.' + RECONCILE };
    return { ok: true, reviews, routeTasks: routeTasksOf(json) };
  } catch (e) {
    return thrownFailure(e);
  }
}

/**
 * What became of the tasks, in three groups: created, refused, and unknown. An
 * unknown task may exist, so it is never counted as not created.
 */
export function tasksSentence(tasks: ReviewTaskOutcome[]): string | null {
  if (!tasks.length) return null;
  const made = tasks.filter(t => t.outcome.ok).length;
  const unknown = tasks.filter(t => !t.outcome.ok && t.outcome.unconfirmed).length;
  const refused = tasks.length - made - unknown;
  if (made === tasks.length) return made === 1 ? 'Their review task is in Tasks.' : 'Each reviewer asked has a review task in Tasks.';
  const groups = [
    made ? `${made} created` : null,
    refused ? `${refused} not created` : null,
    unknown ? `${unknown} with an unknown outcome` : null,
  ].filter(Boolean);
  return `Review tasks: ${groups.join(', ')}.${unknown ? ' Check the task list before sending again.' : ''}`;
}

/**
 * What access the request gave the reviewers it asked: who now has the
 * Reviewer role on the document, and, in the server's words, why anyone was
 * granted none. Null when the answer said nothing about access.
 */
export function accessSentence(reviews: ReviewRequestReceipt[]): string | null {
  const asked = askedReviews(reviews);
  const granted = asked.filter(r => r.granted === true).map(r => r.reviewer);
  const notes = [...new Set(asked.flatMap(r => (r.granted === false && r.grantNote ? [r.grantNote] : [])))];
  const parts = [
    granted.length ? `${granted.join(', ')} ${granted.length === 1 ? 'has' : 'have'} the Reviewer role on this document.` : null,
    ...notes,
  ].filter(Boolean);
  return parts.length ? parts.join(' ') : null;
}

export function sentToast(r: SendForReviewResult): string {
  const asked = askedReviews(r.reviews).map(x => x.reviewer);
  const kept = r.reviews.filter(x => x.status !== 'pending').map(x => `${x.reviewer} (${retainedVerdict(x)})`);
  return [
    asked.length ? `Review requested from ${asked.join(', ')}. It is listed on the Review board.` : null,
    accessSentence(r.reviews),
    kept.length ? `Earlier verdict retained: ${kept.join(', ')}.` : null,
    tasksSentence(r.tasks),
  ].filter(Boolean).join(' ');
}

function retainedVerdict(r: ReviewRequestReceipt): string {
  const standing = reviewStandingOf(r.status, r.standing);
  const binding = standing === 'current' ? 'current saved-content review'
    : standing === 'stale' ? 'saved document has changed' : 'saved-content binding unavailable';
  return `${reviewStatusLabel(r.status)}; ${binding}`;
}

/** The reason field: required, recorded on the audit trail, described by its rule (the shared field, reviewFields.tsx). */
function RequestReasonField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <ReasonField
      id="sfr-reason"
      label="Reason for the request"
      note={`Recorded with the request on the document’s audit trail, and given to each reviewer in their task. At least ${GOVERNED_REASON_MIN} characters.`}
      value={value}
      onChange={onChange}
      placeholder="e.g. Ready for medical review before the pre-IND package."
      testId="sfr-reason"
    />
  );
}

/** The task half of the form: what each reviewer's task in Tasks carries, and when the review is due (RR5: required, the route's date). */
function TaskFields({ instructions, onInstructions, due, onDue, priority, onPriority, timeZone }: {
  instructions: string;
  onInstructions: (v: string) => void;
  due: string;
  onDue: (v: string) => void;
  priority: Priority;
  onPriority: (p: Priority) => void;
  timeZone: string | null;
}) {
  return (
    <fieldset className="de-field">
      <legend className="de-label">In each reviewer’s tasks</legend>
      <div className="de-field">
        <label className="de-label" htmlFor="sfr-instructions">Instructions to the reviewers</label>
        <textarea
          id="sfr-instructions"
          className="c2c-input"
          value={instructions}
          onChange={e => onInstructions(e.target.value)}
          placeholder="e.g. Check the clinical claims against the cited sources."
          style={{ width: '100%', minHeight: 64, resize: 'vertical', fontSize: 13 }}
          data-testid="sfr-instructions"
        />
      </div>
      <DueDateField id="sfr-due" label="Review due" value={due} onChange={onDue} half required min={new Date().toISOString().slice(0, 10)} testId="sfr-due"
        note={`The end of that day in your time zone (${timeZone ?? 'as your notification settings give it, else UTC'}). Each reviewer is reminded before it.`} />
      <div className="de-field half">
        <label className="de-label" htmlFor="sfr-priority">Priority</label>
        <select id="sfr-priority" className="c2c-input" value={priority} onChange={e => onPriority(e.target.value as Priority)}>
          {PRIORITIES.map(p => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      </div>
    </fieldset>
  );
}

function reviewStatusLine(r: ReviewRequestReceipt): string {
  const label = reviewStatusLabel(r.status);
  return r.status === 'pending'
    ? label
    : `${retainedVerdict(r)}. This request did not reopen their review, so no task was created` +
      (r.comments ? `. Recorded reason: ${r.comments}` : '');
}

type TaskFate = 'created' | 'refused' | 'unknown';

function taskFate(t: ReviewTaskOutcome): TaskFate {
  if (t.outcome.ok) return 'created';
  return t.outcome.unconfirmed ? 'unknown' : 'refused';
}

/** One task's line: its id, or why there is none, or that whether there is one is unknown. */
export function taskLine(t: ReviewTaskOutcome): string {
  if (t.outcome.ok) return `Task ${t.outcome.taskId} in ${t.outcome.assigneeName ?? t.reviewer}’s tasks`;
  if (t.outcome.unconfirmed) return `${t.reviewer}: ${t.outcome.message}`;
  return `${t.reviewer}: no task. ${t.outcome.message}`;
}

const TASK_ICON: Record<TaskFate, React.ReactNode> = { created: I.checkSquare, refused: I.alertTriangle, unknown: I.info };

/** The receipt's first sentence: what the request asked, and what it did not reopen. */
function receiptHeadline(reviews: ReviewRequestReceipt[]): string {
  const asked = askedReviews(reviews).length;
  const kept = reviews.length - asked;
  if (asked === 0) {
    return 'No review was reopened. The server retained each reviewer’s earlier verdict; no new review request or task was created.';
  }
  const recorded = `Review requested. The server recorded ${asked === 1 ? 'one request' : `${asked} requests`} on this document, listed on the Review board.`;
  return kept ? `${recorded} ${kept === 1 ? 'One reviewer’s earlier verdict was retained' : `${kept} reviewers’ earlier verdicts were retained`}; it was not reopened.` : recorded;
}

/** The server's answer: the requests it recorded, and what became of each task. */
function SentReceipt({ result }: { result: SendForReviewResult }) {
  const reopened = askedReviews(result.reviews).length > 0;
  const access = accessSentence(result.reviews);
  return (
    <div data-testid="sfr-result">
      <div className="de-gov" role="status">
        <span className="ico">{reopened ? I.checkCircle : I.alertTriangle}</span>
        <span className="de-gov-t" data-testid="sfr-headline">{receiptHeadline(result.reviews)}</span>
      </div>
      <ul aria-label="Review requests recorded" style={{ listStyle: 'none', padding: 0, margin: '10px 0', fontSize: 13 }} data-testid="sfr-reviews">
        {result.reviews.map(r => (
          <li key={r.id} style={{ padding: '4px 0' }}>
            {I.user} {r.reviewer} · {reviewStatusLine(r)} · <span className="mono" style={{ fontSize: 11.5 }}>request {r.id}</span>
          </li>
        ))}
      </ul>
      {access && <div className="de-desc" data-testid="sfr-access">{access}</div>}
      {result.tasks.length > 0 && (
        <ul aria-label="Review tasks" style={{ listStyle: 'none', padding: 0, margin: '10px 0', fontSize: 13 }} data-testid="sfr-tasks">
          {result.tasks.map(t => (
            <li key={t.reviewerId} className={taskFate(t) === 'refused' ? 'de-err' : undefined} style={{ padding: '4px 0' }} data-outcome={taskFate(t)}>
              {TASK_ICON[taskFate(t)]} {taskLine(t)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The dialog's state and its one act. Its own hook so the dialog body is markup. */
function useSendForReview(props: SendForReviewDialogProps) {
  const [owner] = useState(captureAuthoringSession);
  const { docId, authorId, fireToast, onSent } = props;
  const generation = useRef(0);
  const pending = useRef(false);
  const refusalRef = useRef(props.refusal);
  refusalRef.current = props.refusal;
  useEffect(() => () => { generation.current++; }, []);
  const { roster, rosterState, reload: reloadRoster, authorWithheld } = useReviewerRoster(authorId);
  const standing = useDocumentReviews(docId);
  const route = useRouteRefusals(docId);
  const [selected, setSelected] = useState<string[]>([]);
  const [reason, setReason] = useState('');
  const [instructions, setInstructions] = useState('');
  const [due, setDue] = useState('');
  const [priority, setPriority] = useState<Priority>('medium');
  const [phase, setPhase] = useState<Phase>('form');
  const [error, setError] = useState<string | null>(null);
  const [needsReconciliation, setNeedsReconciliation] = useState(false);
  const [result, setResult] = useState<SendForReviewResult | null>(null);

  /* Only members not already asked (no pending request on this document): the
     checklist offers no other, and this holds even if the read changed after a
     box was ticked. A member whose verdict is recorded is asked again. */
  const chosen = standing.state === 'ready'
    ? roster.filter(a => selected.includes(a.id) && !alreadyAsked(standing.rows.find(r => r.reviewerId === a.id)) && !route.refusals[a.id])
    : [];
  const reasonProblem = reviewReasonProblem(reason);
  const canSend = !props.refusal && phase === 'form' && !needsReconciliation && chosen.length > 0 && !reasonProblem && due !== '';
  const toggle = (id: string) => setSelected(s => (s.includes(id) ? s.filter(x => x !== id) : [...s, id]));

  const send = async () => {
    if (pending.current || !canSend || refusalRef.current) return;
    if (!owner.sameRevision()) return setError('Your session changed. Close and reopen this document before requesting review.');
    pending.current = true;
    const seq = generation.current;
    const alive = () => seq === generation.current && owner.sameRevision();
    setPhase('requesting');
    setError(null);
    try {
      const body = buildReviewRequestBody(chosen, reason, { due, priority, instructions: reviewTaskDescription(reason, instructions) });
      const request = await requestReview(docId, body);
      if (!alive()) return;
      if (!request.ok) {
        setError(request.message);
        setNeedsReconciliation(request.unconfirmed);
        setPhase('form');
        return;
      }
      /* The tasks the server wrote on the route, with the request (RR5): only
         for a review the request actually opened. */
      const asked = new Set(askedReviews(request.reviews).map(r => r.reviewerId));
      const tasks = routeTaskOutcomes(chosen.filter(a => asked.has(a.id)), request.routeTasks);
      const sent = { reviews: request.reviews, tasks };
      setResult(sent);
      setPhase('done');
      if (asked.size) fireToast(sentToast(sent));
      else fireToast(sentToast(sent), 'error');
      onSent?.(sent);
    } finally {
      pending.current = false;
    }
  };

  return {
    roster, rosterState, reloadRoster, authorWithheld, standing, chosenCount: chosen.length, toggle, selected, reason, setReason,
    instructions, setInstructions, due, setDue, priority, setPriority, phase, error, needsReconciliation, result,
    reasonProblem, canSend, send, route,
  };
}

/** What the disabled Send button is waiting for, as visible text it is described by. */
function sendNote(chosenCount: number, reasonProblem: string | null, due: string): string | null {
  const missing = [
    chosenCount === 0 ? 'Choose at least one reviewer.' : null,
    due === '' ? 'Choose the review due date.' : null,
    reasonProblem,
  ].filter(Boolean);
  return missing.length ? missing.join(' ') : null;
}

function submitLabel(phase: Phase): string {
  if (phase === 'requesting') return 'Sending…';
  return 'Send for review';
}

/** The footer: Cancel and Send before the answer, Done (and the board) after it. */
function DialogFooter({ sent, busy, canSend, phase, describedBy, onSend, onClose, onOpenBoard }: {
  sent: boolean;
  busy: boolean;
  canSend: boolean;
  phase: Phase;
  describedBy: string | undefined;
  onSend: () => void;
  onClose: () => void;
  onOpenBoard?: () => void;
}) {
  if (sent) {
    return (
      <div className="de-f">
        {onOpenBoard && <button className="de-btn ghost" onClick={onOpenBoard}>Open the Review board</button>}
        <button className="de-btn primary" onClick={onClose} data-testid="sfr-done">Done</button>
      </div>
    );
  }
  return (
    <div className="de-f">
      <button className="de-btn ghost" onClick={onClose} disabled={busy}>Cancel</button>
      <button className="de-btn primary" onClick={onSend} disabled={!canSend} aria-describedby={describedBy} data-testid="sfr-submit">
        {submitLabel(phase)}
      </button>
    </div>
  );
}

/** What follows the form or the receipt: the wait, the refusal, and the ways to reconcile. */
function DialogNotes({ waitingFor, error, checkBoard, checkTasks }: {
  waitingFor: string | null;
  error: string | null;
  checkBoard?: () => void;
  checkTasks?: () => void;
}) {
  return (
    <>
      {waitingFor && <div className="de-desc" id="sfr-send-note" style={{ marginTop: 10 }} data-testid="sfr-send-note">{waitingFor}</div>}
      {error && <div className="de-err" role="alert" data-testid="sfr-error">{error}</div>}
      {checkBoard && <button className="de-btn ghost" onClick={checkBoard}>Check the Review board</button>}
      {checkTasks && <button className="de-btn ghost" onClick={checkTasks}>Check existing review tasks</button>}
    </>
  );
}

function SendForReviewDialogForSource(props: SendForReviewDialogProps) {
  const { docTitle, onClose, onCheckTasks, onOpenBoard } = props;
  const s = useSendForReview(props);
  const busy = s.phase === 'requesting';
  const ref = useDialog(() => {
    if (!busy) onClose();
  });
  const unconfirmedTask = s.result?.tasks.some(t => !t.outcome.ok && t.outcome.unconfirmed) ?? false;
  const waitingFor = s.phase === 'form' && !s.needsReconciliation ? sendNote(s.chosenCount, s.reasonProblem, s.due) : null;
  const sent = s.result !== null;

  return (
    <div className="de-bd" onMouseDown={e => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="de" ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="sfr-title" data-testid="send-for-review-dialog">
        <div className="de-h">
          <div>
            <div className="de-h-eye">Review</div>
            <div className="de-h-t" id="sfr-title">Send for review</div>
            <div className="de-h-s">Asks the people you choose to review “{docTitle}”.</div>
          </div>
          <button className="de-x" onClick={onClose} aria-label="Close" disabled={busy}>{I.close}</button>
        </div>
        <div className="de-body">
          {props.refusal && <div className="de-err" role="status">{props.refusal}</div>}
          {s.result ? <SentReceipt result={s.result} /> : (
            <>
              <ReviewerChecklist
                roster={s.roster} rosterState={s.rosterState} onReloadRoster={s.reloadRoster}
                standing={s.standing} selected={s.selected} onToggle={s.toggle} authorWithheld={s.authorWithheld}
                refusals={s.route.refusals}
              />
              {s.route.unread ? (
                <div className="de-desc" role="status" data-testid="sfr-candidates-unread">
                  Who the review route admits could not be read, so no member is marked here; the server still checks each reviewer when you send.
                </div>
              ) : null}
              <RequestReasonField value={s.reason} onChange={s.setReason} />
              <TaskFields
                instructions={s.instructions} onInstructions={s.setInstructions}
                due={s.due} onDue={s.setDue} priority={s.priority} onPriority={s.setPriority} timeZone={s.route.timeZone}
              />
              <div className="de-gov">
                <span className="ico">{I.lock}</span>
                <span className="de-gov-t">
                  One act, one record. In one step, a review request is recorded on the document for each reviewer, with your reason on the audit trail, and the Review board lists it; a review route names the reviewers, and each gets a review task in Tasks with its due date. When you own the document (or are an administrator), each reviewer is granted the Reviewer role on it, which lets them comment and sign the review. A reviewer’s §11.50 review signature on the document closes their task; “changes requested” on the Review board returns the route to you. Nothing is recorded unless all of it is.
                </span>
              </div>
            </>
          )}
          <DialogNotes
            waitingFor={sent ? null : waitingFor}
            error={s.error}
            checkBoard={s.needsReconciliation ? onOpenBoard : undefined}
            checkTasks={unconfirmedTask ? onCheckTasks : undefined}
          />
        </div>
        <DialogFooter
          sent={sent}
          busy={busy}
          canSend={s.canSend}
          phase={s.phase}
          describedBy={waitingFor ? 'sfr-send-note' : undefined}
          onSend={() => void s.send()}
          onClose={onClose}
          onOpenBoard={onOpenBoard}
        />
      </div>
    </div>
  );
}

/** Each document gets its own request and request lifetime. */
export function SendForReviewDialog(props: SendForReviewDialogProps) {
  return <SendForReviewDialogForSource key={JSON.stringify([props.programId, props.docId])} {...props} />;
}
