/**
 * Send for review — the review request, and each reviewer's task, as one act.
 *
 * ── What it writes, in order ─────────────────────────────────────────────────
 * 1. POST /api/authoring/documents/:id/request-review
 *      { reviewers: [{ id, name }], reason }
 *    (server/routes/authoring.router.ts). In one transaction the server writes
 *    one authoring_reviews row per reviewer, status pending, and one audited
 *    `review_requested` row carrying the reason. The Review board reads those
 *    rows (server/services/review/authoring-review-board.ts), so this is what
 *    puts the document in front of its reviewers there. Before this dialog,
 *    nothing in the client called the route and the board was empty for every
 *    new organisation.
 * 2. Only once the server has confirmed the request: one review task per
 *    reviewer the request actually asked (their row came back pending),
 *    POST /api/tasks/tasks, through AssignReviewDialog's create and its
 *    confirmation, so the request also appears in each reviewer's My work.
 *    The reviewer's verdict on the Review board completes that task on the
 *    server, on the verdict's own transaction (POST /documents/:id/review,
 *    wave 2D), so the verdict and the task do not disagree.
 *    A task that was refused is reported as not created; a task whose answer
 *    was lost is reported as unknown, never as absent. The request stands
 *    either way, and the dialog says which is which.
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
 * task, and the receipt and the toast say the verdict stands.
 *
 * ── The reviewer identity ────────────────────────────────────────────────────
 * The board decides "awaiting my review" by comparing a row's reviewer_id or
 * reviewer_email with the signed-in user's id or email (makeIsMe; trimmed,
 * case-insensitive). The roster, GET /api/task-management/assignees, gives
 * each member's users.id as a string. That is the id the session carries
 * (review-board-routes.ts reads req.user.userId), so `id` is sent exactly as
 * the roster gives it. The roster carries no email, and none is invented.
 * `name` is the roster's name, which the board shows.
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
import { GOVERNED_REASON_MAX, GOVERNED_REASON_MIN } from '@shared/constants/governed-reason';
import { apiRequest, ApiRequestError, redactInternals, serverMessage } from '@/lib/queryClient';
import { I } from '../icons';
import { useDialog } from '../useDialog';
import type { FireToast } from '../toast';
import {
  PRIORITIES,
  ReviewerChecklist,
  buildReviewTaskBody,
  createReviewTask,
  alreadyAsked,
  isSubmittableReviewer,
  useAssigneeRoster,
  type AssignOutcome,
  type Assignee,
  type Priority,
} from './AssignReviewDialog';
import { reviewStatusLabel, useDocumentReviews } from './ReviewTasksPanel';

/** One review request as the server recorded it. */
export interface ReviewRequestReceipt {
  id: string;
  reviewerId: string;
  reviewer: string;
  status: string;
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
  onClose: () => void;
  /** Called once the server has confirmed the request, with what became of each task. */
  onSent?: (result: SendForReviewResult) => void;
  fireToast: FireToast;
  /** Open the document's task list, to reconcile a task whose creation was not confirmed. */
  onCheckTasks?: () => void;
  /** Open the Review board, where the request is listed. */
  onOpenBoard?: () => void;
}

type RequestOutcome =
  | { ok: true; reviews: ReviewRequestReceipt[] }
  | { ok: false; message: string; unconfirmed: boolean };

type Phase = 'form' | 'requesting' | 'tasks' | 'done';

const REFUSED = 'The review request was refused: ';
const UNKNOWN = 'Whether the review request was recorded is unknown: ';
const RECONCILE = ' Check the Review board before sending again.';

/**
 * Added to every review task, so the task never reads as the place a verdict is
 * recorded. The verdict completes the task (POST /documents/:id/review closes
 * the reviewer's review task on this document since wave 2D).
 */
export const VERDICT_ON_THE_BOARD = 'Record your verdict on the Review board; recording it completes this task. Completing the task does not record a verdict.';

const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** Why the reason cannot be sent yet, in the server's terms; null when it can. */
export function reviewReasonProblem(reason: string): string | null {
  const n = reason.trim().length;
  if (n < GOVERNED_REASON_MIN) return `A reason of at least ${GOVERNED_REASON_MIN} characters is required.`;
  if (n > GOVERNED_REASON_MAX) return `A reason is at most ${GOVERNED_REASON_MAX} characters.`;
  return null;
}

/** The request body. Separate so the identity sent can be read and tested without a server. */
export function buildReviewRequestBody(reviewers: Assignee[], reason: string): {
  reviewers: Array<{ id: string; name: string }>;
  reason: string;
} {
  return { reviewers: reviewers.map(a => ({ id: a.id, name: a.name })), reason: reason.trim() };
}

/** Each reviewer's task description: the instructions, the reason the request gave, and where the verdict goes. */
export function reviewTaskDescription(reason: string, instructions: string): string {
  return [instructions.trim(), `Reason for the review request: ${reason.trim()}`, VERDICT_ON_THE_BOARD].filter(Boolean).join('\n\n');
}

/** The reviews the request actually asked for: the rows that came back pending. */
export function askedReviews(reviews: ReviewRequestReceipt[]): ReviewRequestReceipt[] {
  return reviews.filter(r => r.status === 'pending');
}

type ReviewRow = { id?: unknown; doc_id?: unknown; reviewer_id?: unknown; reviewer_name?: unknown; reviewer_email?: unknown; review_status?: unknown };

function toReceipt(r: ReviewRow): ReviewRequestReceipt {
  const reviewerId = String(r?.reviewer_id ?? '').trim();
  return {
    id: String(r?.id ?? ''),
    reviewerId,
    reviewer: text(r?.reviewer_name) ?? text(r?.reviewer_email) ?? reviewerId,
    status: String(r?.review_status ?? ''),
  };
}

/**
 * The server's rows, when they confirm THIS request: every reviewer asked has a
 * row, and every row is on this document. Anything else is not a receipt.
 */
export function confirmedReviews(json: unknown, docId: string, reviewerIds: string[]): ReviewRequestReceipt[] | null {
  const body = json as { success?: unknown; reviews?: unknown } | null;
  if (!body || body.success !== true || !Array.isArray(body.reviews)) return null;
  const rows = body.reviews as ReviewRow[];
  if (rows.some(r => String(r?.doc_id ?? '') !== docId)) return null;
  const receipts = rows.map(toReceipt);
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
    return { ok: true, reviews };
  } catch (e) {
    return thrownFailure(e);
  }
}

interface TaskForm {
  docId: string;
  docTitle: string;
  programId: string | null;
  sectionCode: string | null;
  due: string;
  priority: Priority;
  instructions: string;
}

/** One task per reviewer, in turn. Null when the dialog went away part-way. */
async function createTasksFor(reviewers: Assignee[], form: TaskForm, alive: () => boolean): Promise<ReviewTaskOutcome[] | null> {
  const out: ReviewTaskOutcome[] = [];
  for (const a of reviewers) {
    const outcome: AssignOutcome = isSubmittableReviewer(a.id)
      ? await createReviewTask(buildReviewTaskBody({ ...form, assignee: a.id }))
      : { ok: false, unconfirmed: false, message: 'This member’s id is not one the task ledger takes.' };
    if (!alive()) return null;
    out.push({ reviewerId: a.id, reviewer: a.label ?? a.name, outcome });
  }
  return out;
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
  if (made === tasks.length) return made === 1 ? 'Their review task is in My work.' : 'Each reviewer asked has a review task in My work.';
  const groups = [
    made ? `${made} created` : null,
    refused ? `${refused} not created` : null,
    unknown ? `${unknown} with an unknown outcome` : null,
  ].filter(Boolean);
  return `Review tasks: ${groups.join(', ')}.${unknown ? ' Check the task list before sending again.' : ''}`;
}

export function sentToast(r: SendForReviewResult): string {
  const asked = askedReviews(r.reviews).map(x => x.reviewer);
  const kept = r.reviews.filter(x => x.status !== 'pending').map(x => `${x.reviewer} (${reviewStatusLabel(x.status)})`);
  return [
    asked.length ? `Review requested from ${asked.join(', ')}. It is listed on the Review board.` : null,
    kept.length ? `Not reopened; the earlier verdict stands: ${kept.join(', ')}.` : null,
    tasksSentence(r.tasks),
  ].filter(Boolean).join(' ');
}

/** The reason field: required, recorded on the audit trail, described by its rule. */
function ReasonField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="de-field">
      <label className="de-label" htmlFor="sfr-reason">Reason for the request<span className="req">*</span></label>
      <div className="de-desc" id="sfr-reason-note">
        Recorded with the request on the document’s audit trail, and given to each reviewer in their task. At least {GOVERNED_REASON_MIN} characters.
      </div>
      <textarea
        id="sfr-reason"
        className="c2c-input"
        value={value}
        onChange={e => onChange(e.target.value)}
        aria-required="true"
        aria-describedby="sfr-reason-note"
        placeholder="e.g. Ready for medical review before the pre-IND package."
        style={{ width: '100%', minHeight: 64, resize: 'vertical', fontSize: 13 }}
        data-testid="sfr-reason"
      />
    </div>
  );
}

/** The task half of the form: what each reviewer's My work task carries. */
function TaskFields({ instructions, onInstructions, due, onDue, priority, onPriority }: {
  instructions: string;
  onInstructions: (v: string) => void;
  due: string;
  onDue: (v: string) => void;
  priority: Priority;
  onPriority: (p: Priority) => void;
}) {
  return (
    <fieldset className="de-field">
      <legend className="de-label">In each reviewer’s My work</legend>
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
      <div className="de-field half">
        <label className="de-label" htmlFor="sfr-due">Due date</label>
        <input id="sfr-due" className="c2c-input" type="date" value={due} onChange={e => onDue(e.target.value)} data-testid="sfr-due" />
      </div>
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
    : `${label}: their earlier verdict stands. This request did not reopen their review, so no task was created`;
}

type TaskFate = 'created' | 'refused' | 'unknown';

function taskFate(t: ReviewTaskOutcome): TaskFate {
  if (t.outcome.ok) return 'created';
  return t.outcome.unconfirmed ? 'unknown' : 'refused';
}

/** One task's line: its id, or why there is none, or that whether there is one is unknown. */
export function taskLine(t: ReviewTaskOutcome): string {
  if (t.outcome.ok) return `Task ${t.outcome.taskId} in ${t.outcome.assigneeName ?? t.reviewer}’s My work`;
  if (t.outcome.unconfirmed) return `${t.reviewer}: ${t.outcome.message}`;
  return `${t.reviewer}: no task. ${t.outcome.message}`;
}

const TASK_ICON: Record<TaskFate, React.ReactNode> = { created: I.checkSquare, refused: I.alertTriangle, unknown: I.info };

/** The receipt's first sentence: what the request asked, and what it did not reopen. */
function receiptHeadline(reviews: ReviewRequestReceipt[]): string {
  const asked = askedReviews(reviews).length;
  const kept = reviews.length - asked;
  if (asked === 0) {
    return 'No review was reopened. The server kept each reviewer’s earlier verdict, so nothing new awaits review and no task was created.';
  }
  const recorded = `Review requested. The server recorded ${asked === 1 ? 'one request' : `${asked} requests`} on this document, listed on the Review board.`;
  return kept ? `${recorded} ${kept === 1 ? 'One reviewer’s earlier verdict stands' : `${kept} reviewers’ earlier verdicts stand`}; it was not reopened.` : recorded;
}

/** The server's answer: the requests it recorded, and what became of each task. */
function SentReceipt({ result }: { result: SendForReviewResult }) {
  const reopened = askedReviews(result.reviews).length > 0;
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
  const { docId, docTitle, programId, sectionCode, fireToast, onSent } = props;
  const generation = useRef(0);
  const pending = useRef(false);
  useEffect(() => () => { generation.current++; }, []);
  const { roster, rosterState, reload: reloadRoster } = useAssigneeRoster();
  const standing = useDocumentReviews(docId);
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
    ? roster.filter(a => selected.includes(a.id) && !alreadyAsked(standing.rows.find(r => r.reviewerId === a.id)))
    : [];
  const reasonProblem = reviewReasonProblem(reason);
  const canSend = phase === 'form' && !needsReconciliation && chosen.length > 0 && !reasonProblem;
  const toggle = (id: string) => setSelected(s => (s.includes(id) ? s.filter(x => x !== id) : [...s, id]));

  const send = async () => {
    if (pending.current || !canSend) return;
    pending.current = true;
    const seq = generation.current;
    const alive = () => seq === generation.current;
    setPhase('requesting');
    setError(null);
    try {
      const request = await requestReview(docId, buildReviewRequestBody(chosen, reason));
      if (!alive()) return;
      if (!request.ok) {
        setError(request.message);
        setNeedsReconciliation(request.unconfirmed);
        setPhase('form');
        return;
      }
      setPhase('tasks');
      const form = { docId, docTitle, programId, sectionCode, due, priority, instructions: reviewTaskDescription(reason, instructions) };
      /* A task only for a review the request actually opened: a row that came
         back with a verdict was not reopened, and its reviewer could not
         finish a task with one. */
      const asked = new Set(askedReviews(request.reviews).map(r => r.reviewerId));
      const tasks = await createTasksFor(chosen.filter(a => asked.has(a.id)), form, alive);
      if (!tasks) return;
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
    roster, rosterState, reloadRoster, standing, chosenCount: chosen.length, toggle, selected, reason, setReason,
    instructions, setInstructions, due, setDue, priority, setPriority, phase, error, needsReconciliation, result,
    reasonProblem, canSend, send,
  };
}

/** What the disabled Send button is waiting for, as visible text it is described by. */
function sendNote(chosenCount: number, reasonProblem: string | null): string | null {
  if (chosenCount === 0) return reasonProblem ? `Choose at least one reviewer. ${reasonProblem}` : 'Choose at least one reviewer.';
  return reasonProblem;
}

function submitLabel(phase: Phase): string {
  if (phase === 'requesting') return 'Sending…';
  if (phase === 'tasks') return 'Creating tasks…';
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
  const busy = s.phase === 'requesting' || s.phase === 'tasks';
  const ref = useDialog(() => {
    if (!busy) onClose();
  });
  const unconfirmedTask = s.result?.tasks.some(t => !t.outcome.ok && t.outcome.unconfirmed) ?? false;
  const waitingFor = s.phase === 'form' && !s.needsReconciliation ? sendNote(s.chosenCount, s.reasonProblem) : null;
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
          {s.result ? <SentReceipt result={s.result} /> : (
            <>
              <ReviewerChecklist
                roster={s.roster} rosterState={s.rosterState} onReloadRoster={s.reloadRoster}
                standing={s.standing} selected={s.selected} onToggle={s.toggle}
              />
              <ReasonField value={s.reason} onChange={s.setReason} />
              <TaskFields
                instructions={s.instructions} onInstructions={s.setInstructions}
                due={s.due} onDue={s.setDue} priority={s.priority} onPriority={s.setPriority}
              />
              <div className="de-gov">
                <span className="ico">{I.lock}</span>
                <span className="de-gov-t">
                  One act, two records. A review request is recorded on the document for each reviewer, with your reason on the audit trail, and the Review board lists it. Then a review task is added to each reviewer’s My work. Reviewers record their verdicts on the Review board, which completes their task; a binding §11.50 signature is applied on the document.
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
