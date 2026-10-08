/**
 * Assign review — request the review of the open document, and create the
 * review task that carries it.
 *
 * QA 2026-10-08 (browser walk j4-authoring): this dialog created a task and
 * nothing else. The review store the Review board reads (authoring_reviews)
 * never heard of the request, the reviewer was granted nothing on the document
 * (so could neither comment nor sign the review), and the author could name
 * herself. The governed act is now POST /api/authoring/documents/:id/request-
 * review, sent FIRST: it refuses the author, records the request on the Review
 * board, and — when the requester may manage the document's access — grants
 * the reviewer the Reviewer role. The task below is the reviewer's to-do,
 * created only after the request is confirmed. The author is not offered.
 *
 * POST /api/tasks/tasks (taskManagement.routes.ts), the canonical task write
 * path — see ReviewTasksPanel.tsx for why that one. The task carries:
 *
 *   sourceEntityType 'authoring_document', sourceEntityId <docId>   the link
 *   moduleType 'Authoring', taskType 'review', category 'review'     the kind
 *   assigneeId, dueDate, description (the reviewer's instructions)   the ask
 *   moduleData { authoringDocId, programId, sectionCode }            context,
 *     in the JSON column the schema documents for module context — not in
 *     free text.
 *
 * The roster is GET /api/task-management/assignees (the same list the Task
 * board offers). The server audits the create and notifies the assignee.
 * What is shown afterwards is the server's own task id and assignee, never a
 * locally composed confirmation.
 *
 * Gap, stated: unified_tasks.project_id is an integer FK to `projects`, not
 * the regulatory_programs UUID, so the program travels in moduleData and the
 * task cannot be joined to the program by key. Recorded in docs/evidence/WN.
 */
import React, { useEffect, useRef, useState } from 'react';
import { apiRequest, ApiRequestError, redactInternals, serverMessage } from '@/lib/queryClient';
import { I } from '../icons';
import { useDialog } from '../useDialog';
import type { FireToast } from '../toast';
import { AUTHORING_TASK_ENTITY, AUTHORING_TASK_MODULE } from './ReviewTasksPanel';

interface Assignee {
  id: string;
  name: string;
  /** The name, with the address where two members share one (shared/utils/member-labels.ts). */
  label?: string;
}

export interface AssignReviewDialogProps {
  docId: string;
  docTitle: string;
  programId: string | null;
  sectionCode: string | null;
  /** The document's author (authoring_documents.created_by): not offered as its
   *  reviewer. The server refuses the author either way (REVIEWER_IS_AUTHOR). */
  authorId?: string | null;
  onClose: () => void;
  onCreated: (task: { taskId: string; assigneeName: string | null }) => void;
  fireToast: FireToast;
  /** Open the existing task list to reconcile an unconfirmed creation. */
  onCheckTasks?: () => void;
}

const PRIORITIES = ['low', 'medium', 'high', 'critical'] as const;
type Priority = (typeof PRIORITIES)[number];
type RosterState = 'loading' | 'ready' | 'error';

/** What POST /api/tasks/tasks answers with, as much of it as this dialog reads. */
type CreatedTaskEnvelope = { success?: boolean; error?: string; data?: { taskId?: string; assigneeName?: string | null; assigneeId?: number | null; sourceEntityType?: string | null; sourceEntityId?: string | null } } | null;

/** The create either produced a server-issued task, or it did not and says why. */
type AssignOutcome =
  | { ok: true; taskId: string; assigneeName: string | null }
  | { ok: false; message: string; unconfirmed: boolean };

/**
 * Reads the Task board roster once, and abandons the read if the dialog closes
 * first. Its own function so the dialog body holds the form, not the fetch.
 */
function useAssigneeRoster(): { roster: Assignee[]; rosterState: RosterState } {
  const [roster, setRoster] = useState<Assignee[]>([]);
  const [rosterState, setRosterState] = useState<RosterState>('loading');

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const res = await apiRequest('GET', '/api/task-management/assignees');
        const json = (await res.json().catch(() => null)) as { success?: boolean; data?: Assignee[] } | null;
        if (!alive) return;
        if (!res.ok || !json?.success || !Array.isArray(json.data)) {
          setRosterState('error');
          return;
        }
        setRoster(json.data.filter(a => a && a.id));
        setRosterState('ready');
      } catch {
        if (alive) setRosterState('error');
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return { roster, rosterState };
}

/**
 * Whether a reviewer has been chosen that the task API can take: assigneeId is
 * an integer column, so a non-numeric selection is not submittable. Pure, so
 * the submit path does no validation of its own.
 */
export function isSubmittableReviewer(assignee: string): boolean {
  return /^[1-9][0-9]*$/.test(assignee) && Number.isSafeInteger(Number(assignee));
}

/**
 * Composes the POST body from what the form holds. Separate from the request
 * so the shape of the task — the link, the kind, the ask, the context — can be
 * read and tested without a server.
 */
export function buildReviewTaskBody(form: {
  docId: string;
  docTitle: string;
  programId: string | null;
  sectionCode: string | null;
  assignee: string;
  due: string;
  priority: Priority;
  instructions: string;
}): Record<string, unknown> {
  return {
    title: `Review: ${form.docTitle}`,
    description: form.instructions.trim() || undefined,
    moduleType: AUTHORING_TASK_MODULE,
    moduleSource: 'document-workbench',
    category: 'review',
    taskType: 'review',
    priority: form.priority,
    assigneeId: Number(form.assignee),
    ...(form.due ? { dueDate: new Date(`${form.due}T17:00:00`).toISOString() } : {}),
    sourceEntityType: AUTHORING_TASK_ENTITY,
    sourceEntityId: form.docId,
    regulatoryImpact: true,
    moduleData: {
      authoringDocId: form.docId,
      programId: form.programId,
      sectionCode: form.sectionCode,
      raisedFrom: 'document-workbench',
    },
    tags: ['review', 'authoring'],
  };
}

/**
 * The one sentence shown when the server answered but created nothing. Its own
 * function because a refusal has two honest forms — unauthenticated, and
 * declined — without inferring a rollback from an unconfirmed response.
 */
function refusalMessage(status: number, json: CreatedTaskEnvelope): string {
  if (status === 401) return 'Not assigned — your session isn’t authenticated. Sign in and retry.';
  return 'The review task was not confirmed — ' + (serverMessage(json) ?? `the server returned HTTP ${status}`) + '. Reload the task list before retrying.';
}

/**
 * The sentence for a create that never reached an answer. Shared by the request
 * and the dialog so an unreachable server reads the same either way, and so no
 * internal text escapes into the UI.
 */
function unreachableMessage(e: unknown): string {
  return 'The review task outcome is unknown — ' + redactInternals(e instanceof Error ? e.message : '', 'no confirmed response was received') + '. Reload the task list before retrying.';
}

function assignmentFailure(error: unknown): AssignOutcome {
  if (error instanceof ApiRequestError && (error.code === 'AUDIT_WRITE_FAILED' || [400, 401, 403, 422].includes(error.status))) {
    return { ok: false, unconfirmed: false, message: 'The review task was refused — ' + redactInternals(error.message, 'the request was not accepted') };
  }
  return { ok: false, message: unreachableMessage(error), unconfirmed: true };
}

function matchesAssignment(data: NonNullable<CreatedTaskEnvelope>['data'], body: Record<string, unknown>): boolean {
  return data?.sourceEntityType === body.sourceEntityType && data?.sourceEntityId === body.sourceEntityId &&
    data?.assigneeId === body.assigneeId;
}

/**
 * Sends the create and maps its answer onto the two outcomes the dialog acts
 * on. Nothing is treated as created without the server's own task id.
 */
async function createReviewTask(body: Record<string, unknown>): Promise<AssignOutcome> {
  try {
    const res = await apiRequest('POST', '/api/tasks/tasks', body);
    const json = (await res.json().catch(() => null)) as CreatedTaskEnvelope;
    const taskId = json?.data?.taskId;
    if (!res.ok) {
      return { ok: false, message: refusalMessage(res.status, json), unconfirmed: res.status >= 500 && json?.error !== 'AUDIT_WRITE_FAILED' || res.status === 408 };
    }
    if (!json?.success || typeof taskId !== 'string' || !taskId.trim() || !matchesAssignment(json.data, body)) {
      return { ok: false, message: 'The response did not confirm this document’s review assignment. Reload the task list before retrying.', unconfirmed: true };
    }
    return { ok: true, taskId, assigneeName: json.data?.assigneeName ?? null };
  } catch (e) {
    return assignmentFailure(e);
  }
}

/** What POST /api/authoring/documents/:id/request-review answers, as much as this dialog reads. */
type ReviewRequestEnvelope = {
  success?: boolean;
  reviews?: Array<{ reviewer_id?: string | number | null }>;
  grants?: Array<{ reviewerId?: string; granted?: boolean; reason?: string }>;
} | null;

/** The review request was recorded for this reviewer (and whether access came with it), or it was not. */
type RequestOutcome =
  | { ok: true; granted: boolean; grantNote: string | null }
  | { ok: false; message: string; unconfirmed: boolean };

/**
 * Request the review on the authoring review store — the act the Review board
 * reads and the server judges (the author is refused; the reviewer is granted
 * the Reviewer role when the requester may manage the document's access).
 * Nothing counts as requested without the server's row for this reviewer.
 */
async function requestReview(docId: string, reviewer: { id: string; name: string | null }): Promise<RequestOutcome> {
  try {
    const res = await apiRequest('POST', `/api/authoring/documents/${encodeURIComponent(docId)}/request-review`, {
      reviewers: [{ id: reviewer.id, ...(reviewer.name ? { name: reviewer.name } : {}) }],
    });
    const json = (await res.json().catch(() => null)) as ReviewRequestEnvelope;
    return res.ok ? confirmedRequest(json, reviewer.id) : unacceptedRequest(res.status, json);
  } catch (e) {
    return failedRequest(e);
  }
}

/** A 2xx is a request only with the server's row for this reviewer; with it, what access came with it. */
function confirmedRequest(json: ReviewRequestEnvelope, reviewerId: string): RequestOutcome {
  const recorded = Array.isArray(json?.reviews) && json!.reviews!.some((r) => String(r?.reviewer_id ?? '') === reviewerId);
  if (!json?.success || !recorded) {
    return { ok: false, unconfirmed: true, message: 'The response did not confirm the review request for this reviewer. Reload the task list before retrying.' };
  }
  const grant = (json.grants ?? []).find((g) => String(g?.reviewerId ?? '') === reviewerId);
  const granted = grant?.granted === true;
  return { ok: true, granted, grantNote: !granted && typeof grant?.reason === 'string' ? grant.reason : null };
}

/** The non-2xx apiRequest returns rather than throws (a 401), or any other it hands back. */
function unacceptedRequest(status: number, json: ReviewRequestEnvelope): RequestOutcome {
  if (status === 401) return { ok: false, unconfirmed: false, message: 'Not requested — your session isn’t authenticated. Sign in and retry.' };
  return { ok: false, unconfirmed: status >= 500, message: 'The review request was not confirmed — ' + (serverMessage(json) ?? `the server returned HTTP ${status}`) + '. Nothing was assigned.' };
}

/** A thrown refusal is a refusal (the author named as reviewer is a 409); anything else is an unknown outcome. */
function failedRequest(e: unknown): RequestOutcome {
  if (e instanceof ApiRequestError && (e.code === 'AUDIT_WRITE_FAILED' || [400, 401, 403, 409, 422].includes(e.status))) {
    return { ok: false, unconfirmed: false, message: 'The review request was refused — ' + redactInternals(e.message, 'the request was not accepted') };
  }
  return {
    ok: false,
    unconfirmed: true,
    message: 'The review request outcome is unknown — ' + redactInternals(e instanceof Error ? e.message : '', 'no confirmed response was received') + '. Reload the task list before retrying.',
  };
}

/** What one Assign review did: a superseded attempt, a failure to show, or a task to confirm. */
type AssignmentResult =
  | { kind: 'stale' }
  | { kind: 'failed'; message: string; unconfirmed: boolean }
  | { kind: 'done'; taskId: string; assigneeName: string | null; toast: string };

/**
 * The two writes of one Assign review, in order: the review request (the
 * governed act — a refusal stops here, before any task), then the reviewer's
 * task. `current` says whether the dialog still wants the answer.
 */
async function runAssignment(
  form: Parameters<typeof buildReviewTaskBody>[0],
  chosenName: string | null,
  current: () => boolean,
): Promise<AssignmentResult> {
  const requested = await requestReview(form.docId, { id: form.assignee, name: chosenName });
  if (!current()) return { kind: 'stale' };
  if (!requested.ok) return { kind: 'failed', message: requested.message, unconfirmed: requested.unconfirmed };
  const outcome = await createReviewTask(buildReviewTaskBody(form));
  if (!current()) return { kind: 'stale' };
  if (!outcome.ok) {
    return {
      kind: 'failed',
      unconfirmed: outcome.unconfirmed,
      message: `The review was requested — it is on the Review board for ${chosenName ?? 'the reviewer'}.` +
        grantSentence(chosenName, requested) + ' ' + outcome.message,
    };
  }
  const assigneeName = outcome.assigneeName ?? chosenName;
  return {
    kind: 'done',
    taskId: outcome.taskId,
    assigneeName,
    toast: `Review requested and task ${outcome.taskId} assigned${assigneeName ? ` to ${assigneeName}` : ''} — linked to “${form.docTitle}” on the Review board and the task ledger.` +
      grantSentence(assigneeName, requested),
  };
}

/**
 * The roster a reviewer is chosen from. A different person reviews (the rule
 * the Vault states and the server enforces): the author is not offered.
 */
function useReviewerRoster(authorId: string | null | undefined) {
  const { roster: everyone, rosterState } = useAssigneeRoster();
  const author = String(authorId ?? '').trim();
  const roster = author ? everyone.filter(a => a.id !== author) : everyone;
  return { roster, rosterState, authorWithheld: author !== '' && roster.length !== everyone.length };
}

/** What the confirmation says about the reviewer's access to the document. */
function grantSentence(name: string | null, requested: Extract<RequestOutcome, { ok: true }>): string {
  if (requested.granted) return ` ${name ?? 'The reviewer'} has the Reviewer role on this document.`;
  return requested.grantNote ? ` ${requested.grantNote}` : '';
}

/**
 * The reviewer field. Its own component because a roster that could not be read
 * is reported in place of the control, never as an empty list of people.
 */
function ReviewerSelect({ roster, rosterState, value, onChange, authorWithheld }: {
  roster: Assignee[];
  rosterState: RosterState;
  value: string;
  onChange: (id: string) => void;
  /** The document's author was left out of the roster: said, not silent. */
  authorWithheld?: boolean;
}) {
  const placeholder = rosterState === 'loading'
    ? 'Reading the roster…'
    : roster.length === 0 ? 'No members in this organization' : 'Choose a reviewer';
  return (
    <div className="de-field">
      <label className="de-label" htmlFor="ar-assignee">
        Reviewer<span className="req">*</span>
      </label>
      {rosterState === 'error' ? (
        <div className="de-err" role="status">The reviewer roster could not be read, so no one can be chosen. Retry after checking the service is reachable.</div>
      ) : (
        <select
          id="ar-assignee"
          className="c2c-input"
          value={value}
          onChange={e => onChange(e.target.value)}
          disabled={rosterState === 'loading'}
          data-testid="ar-assignee"
        >
          <option value="">{placeholder}</option>
          {roster.map(a => (
            <option key={a.id} value={a.id}>{a.label ?? a.name}</option>
          ))}
        </select>
      )}
      {authorWithheld && (
        <div className="de-desc" data-testid="ar-author-note">The document’s author is not offered: a different person reviews it.</div>
      )}
    </div>
  );
}

/**
 * The instructions field, with the example it offers keyed to the section in
 * view. Its own component to keep that one piece of wording out of the dialog.
 */
function ReviewInstructionsField({ value, onChange, sectionCode }: {
  value: string;
  onChange: (text: string) => void;
  sectionCode: string | null;
}) {
  return (
    <div className="de-field">
      <label className="de-label" htmlFor="ar-instructions">Instructions to the reviewer</label>
      <div className="de-desc">What to check, and what a finding should say. Recorded as the task description.</div>
      <textarea
        id="ar-instructions"
        className="c2c-input"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={sectionCode ? `e.g. Review §${sectionCode} against the cited sources.` : 'e.g. Review the clinical claims against the cited sources.'}
        style={{ width: '100%', minHeight: 72, resize: 'vertical', fontSize: 13 }}
        data-testid="ar-instructions"
      />
    </div>
  );
}

function AssignReviewDialogForSource({ docId, docTitle, programId, sectionCode, authorId, onClose, onCreated, fireToast, onCheckTasks }: AssignReviewDialogProps) {
  const [saving, setSaving] = useState(false);
  const generation = useRef(0);
  const pendingWrite = useRef(false);
  useEffect(() => () => { generation.current++; }, []);
  const ref = useDialog(() => {
    if (!saving) onClose();
  });
  const { roster, rosterState, authorWithheld } = useReviewerRoster(authorId);
  const [assignee, setAssignee] = useState('');
  const [due, setDue] = useState('');
  const [priority, setPriority] = useState<Priority>('medium');
  const [instructions, setInstructions] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [needsReconciliation, setNeedsReconciliation] = useState(false);

  const canSubmit = !saving && !needsReconciliation && isSubmittableReviewer(assignee) && roster.some(a => a.id === assignee);

  const submit = async () => {
    if (pendingWrite.current || !canSubmit) return;
    pendingWrite.current = true;
    const seq = generation.current;
    setSaving(true);
    setError(null);
    try {
      const chosen = roster.find(a => a.id === assignee) ?? null;
      const result = await runAssignment(
        { docId, docTitle, programId, sectionCode, assignee, due, priority, instructions },
        chosen?.name ?? null,
        () => seq === generation.current,
      );
      if (result.kind === 'stale') return;
      if (result.kind === 'failed') {
        setError(result.message);
        setNeedsReconciliation(result.unconfirmed);
        return;
      }
      fireToast(result.toast);
      onCreated({ taskId: result.taskId, assigneeName: result.assigneeName });
      onClose();
    } catch (e) {
      if (seq === generation.current) { setError(unreachableMessage(e)); setNeedsReconciliation(true); }
    } finally {
      pendingWrite.current = false;
      if (seq === generation.current) setSaving(false);
    }
  };

  return (
    <div
      className="de-bd"
      onMouseDown={e => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
    >
      <div className="de" ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="ar-title" data-testid="assign-review-dialog">
        <div className="de-h">
          <div>
            <div className="de-h-eye">Tasking</div>
            <div className="de-h-t" id="ar-title">Assign review</div>
            <div className="de-h-s">Requests the review of “{docTitle}” — it appears on the Review board — and creates the reviewer’s task on the organization’s task ledger.</div>
          </div>
          <button className="de-x" onClick={onClose} aria-label="Close" disabled={saving}>
            {I.close}
          </button>
        </div>
        <div className="de-body">
          <ReviewerSelect roster={roster} rosterState={rosterState} value={assignee} onChange={setAssignee} authorWithheld={authorWithheld} />
          <div className="de-field half">
            <label className="de-label" htmlFor="ar-due">Due date</label>
            <input id="ar-due" className="c2c-input" type="date" value={due} onChange={e => setDue(e.target.value)} data-testid="ar-due" />
          </div>
          <div className="de-field half">
            <label className="de-label" htmlFor="ar-priority">Priority</label>
            <select id="ar-priority" className="c2c-input" value={priority} onChange={e => setPriority(e.target.value as Priority)}>
              {PRIORITIES.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          <ReviewInstructionsField value={instructions} onChange={setInstructions} sectionCode={sectionCode} />
          <div className="de-gov">
            <span className="ico">{I.lock}</span>
            <span className="de-gov-t">
              The review request is recorded on the document and audited. When you own the document (or are an administrator), the reviewer is granted the Reviewer role on it, which lets them comment and sign the review. The task is written to the task ledger with its origin recorded as this document; completing an approval-gated task requires a §11.50 e-signature on the Task board.
            </span>
          </div>
          {needsReconciliation && <button className="de-btn ghost" onClick={onCheckTasks ?? onClose}>Check existing review tasks</button>}
          {error && (
            <div className="de-err" role="alert" data-testid="ar-error">{error}</div>
          )}
        </div>
        <div className="de-f">
          <button className="de-btn ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="de-btn primary" onClick={() => void submit()} disabled={!canSubmit} data-testid="ar-submit">
            {saving ? 'Assigning…' : 'Assign review'}
          </button>
        </div>
      </div>
    </div>
  );
}


/** Each document/program/section gets its own ask and request lifetime. */
export function AssignReviewDialog(props: AssignReviewDialogProps) {
  return <AssignReviewDialogForSource key={JSON.stringify([props.programId, props.docId, props.sectionCode])} {...props} />;
}
