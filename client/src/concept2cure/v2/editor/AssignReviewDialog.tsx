/**
 * Assign review — create a review task linked to the open document.
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
 *
 * ── The task half of Send for review (2026-10-08) ────────────────────────────
 * A task is not a review request: the Review board reads authoring_reviews,
 * never unified_tasks, so a document assigned only through this dialog never
 * reached the board. The workbench now sends a document for review through
 * `SendForReviewDialog.tsx`, which records the review request first and then
 * creates each reviewer's task with the helpers exported here (the roster
 * read, the reviewer checklist, the task body, the create and its
 * confirmation), so the task write has one implementation. This dialog's own
 * form remains only for the document canvas card (`DocumentCanvas.tsx`), until
 * that file opens the send-for-review dialog instead
 * (docs/evidence/D2-ONE-ANA/2026-10-08/ana-2c-send-for-review/).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { apiRequest, ApiRequestError, redactInternals, serverMessage } from '@/lib/queryClient';
import { I } from '../icons';
import { useDialog } from '../useDialog';
import type { FireToast } from '../toast';
import {
  AUTHORING_TASK_ENTITY,
  AUTHORING_TASK_MODULE,
  reviewStatusLabel,
  type DocumentReviewsRead,
  type StandingReview,
} from './ReviewTasksPanel';

export interface Assignee {
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
  onClose: () => void;
  onCreated: (task: { taskId: string; assigneeName: string | null }) => void;
  fireToast: FireToast;
  /** Open the existing task list to reconcile an unconfirmed creation. */
  onCheckTasks?: () => void;
}

export const PRIORITIES = ['low', 'medium', 'high', 'critical'] as const;
export type Priority = (typeof PRIORITIES)[number];
export type RosterState = 'loading' | 'ready' | 'error';

/** What POST /api/tasks/tasks answers with, as much of it as this dialog reads. */
type CreatedTaskEnvelope = { success?: boolean; error?: string; data?: { taskId?: string; assigneeName?: string | null; assigneeId?: number | null; sourceEntityType?: string | null; sourceEntityId?: string | null } } | null;

/** The create either produced a server-issued task, or it did not and says why. */
export type AssignOutcome =
  | { ok: true; taskId: string; assigneeName: string | null }
  | { ok: false; message: string; unconfirmed: boolean };

/**
 * Reads the Task board roster, again on `reload`, and abandons a read if the
 * dialog closes first. Its own function so the dialog body holds the form, not
 * the fetch.
 */
export function useAssigneeRoster(): { roster: Assignee[]; rosterState: RosterState; reload: () => void } {
  const [roster, setRoster] = useState<Assignee[]>([]);
  const [rosterState, setRosterState] = useState<RosterState>('loading');
  const [epoch, setEpoch] = useState(0);

  useEffect(() => {
    let alive = true;
    setRosterState('loading');
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
  }, [epoch]);

  const reload = useCallback(() => setEpoch(e => e + 1), []);
  return { roster, rosterState, reload };
}

/**
 * A read that failed, said in place of the control it would have filled, with
 * the way to read it again. One component for both review dialogs, so a failed
 * read never renders as an organisation with no members.
 */
export function ReadFailed({ label, message, againLabel, onAgain, testId }: {
  label: string;
  message: string;
  againLabel: string;
  onAgain: () => void;
  testId?: string;
}) {
  return (
    <div className="de-field" data-testid={testId}>
      <div className="de-label">{label}<span className="req">*</span></div>
      <div className="de-err" role="status">{message}</div>
      <button type="button" className="de-btn ghost" onClick={onAgain}>{againLabel}</button>
    </div>
  );
}

export const ROSTER_UNREAD = 'The reviewer roster could not be read, so no one can be chosen.';

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
export async function createReviewTask(body: Record<string, unknown>): Promise<AssignOutcome> {
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

/**
 * The reviewer field. Its own component because a roster that could not be read
 * is reported in place of the control, never as an empty list of people.
 */
function ReviewerSelect({ roster, rosterState, onReload, value, onChange }: {
  roster: Assignee[];
  rosterState: RosterState;
  onReload: () => void;
  value: string;
  onChange: (id: string) => void;
}) {
  if (rosterState === 'error') {
    return <ReadFailed label="Reviewer" message={ROSTER_UNREAD} againLabel="Read the roster again" onAgain={onReload} />;
  }
  const placeholder = rosterState === 'loading'
    ? 'Reading the roster…'
    : roster.length === 0 ? 'No members in this organization' : 'Choose a reviewer';
  return (
    <div className="de-field">
      <label className="de-label" htmlFor="ar-assignee">
        Reviewer<span className="req">*</span>
      </label>
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
    </div>
  );
}

const DATE = { year: 'numeric', month: 'short', day: 'numeric' } as const;

/** " on <date>" for a valid timestamp, and nothing for anything else. */
function onDate(iso: string | null): string {
  const d = iso ? new Date(iso) : null;
  return d && Number.isFinite(d.getTime()) ? ` on ${d.toLocaleDateString(undefined, DATE)}` : '';
}

/** Why a member with a review request on this document cannot be asked again. */
export function priorRequestNote(r: StandingReview): string {
  if (r.status === 'pending') return `Already asked${onDate(r.requestedAt)}; their review is pending.`;
  return `${reviewStatusLabel(r.status)}${onDate(r.reviewedAt)}. A new request does not reopen a recorded verdict, so they cannot be asked again here.`;
}

/**
 * The reviewers, one checkbox each. A roster, or the document's existing
 * requests, that could not be read is reported in place of the list with the
 * way to read it again, never as an organisation with no members. A member who
 * already has a request on this document is shown with it and cannot be chosen.
 */
export function ReviewerChecklist({ roster, rosterState, onReloadRoster, standing, selected, onToggle }: {
  roster: Assignee[];
  rosterState: RosterState;
  onReloadRoster: () => void;
  standing: DocumentReviewsRead;
  selected: string[];
  onToggle: (id: string) => void;
}) {
  if (rosterState === 'error') {
    return <ReadFailed label="Reviewers" message={ROSTER_UNREAD} againLabel="Read the roster again" onAgain={onReloadRoster} testId="sfr-roster-error" />;
  }
  if (standing.state === 'error') {
    return (
      <ReadFailed
        label="Reviewers"
        message="This document’s existing review requests could not be read, so who has already been asked is unknown and no one can be chosen."
        againLabel="Read them again"
        onAgain={standing.reload}
        testId="sfr-standing-error"
      />
    );
  }
  const reading = rosterState === 'loading' || standing.state !== 'ready';
  const note = reading ? 'Reading the roster and this document’s review requests…' : roster.length === 0 ? 'No members in this organization.' : null;
  return (
    <fieldset className="de-field" data-testid="sfr-reviewers">
      <legend className="de-label">Reviewers<span className="req">*</span></legend>
      {note ? (
        <div className="de-desc" role="status">{note}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 200, overflowY: 'auto' }}>
          {roster.map(a => (
            <ReviewerOption key={a.id} member={a} prior={standing.rows.find(r => r.reviewerId === a.id) ?? null}
              checked={selected.includes(a.id)} onToggle={onToggle} />
          ))}
        </div>
      )}
    </fieldset>
  );
}

/** One member: a checkbox, or, when they already have a request here, that request instead. */
function ReviewerOption({ member, prior, checked, onToggle }: {
  member: Assignee;
  prior: StandingReview | null;
  checked: boolean;
  onToggle: (id: string) => void;
}) {
  const noteId = `sfr-prior-${member.id}`;
  return (
    <div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
        <input
          type="checkbox"
          checked={!prior && checked}
          disabled={!!prior}
          onChange={() => onToggle(member.id)}
          aria-describedby={prior ? noteId : undefined}
          data-testid={`sfr-reviewer-${member.id}`}
        />
        {member.label ?? member.name}
      </label>
      {prior && (
        <div className="de-desc" id={noteId} style={{ margin: '0 0 4px 24px' }} data-testid={`sfr-prior-${member.id}`}>
          {priorRequestNote(prior)}
        </div>
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

function AssignReviewDialogForSource({ docId, docTitle, programId, sectionCode, onClose, onCreated, fireToast, onCheckTasks }: AssignReviewDialogProps) {
  const [saving, setSaving] = useState(false);
  const generation = useRef(0);
  const pendingWrite = useRef(false);
  useEffect(() => () => { generation.current++; }, []);
  const ref = useDialog(() => {
    if (!saving) onClose();
  });
  const { roster, rosterState, reload: reloadRoster } = useAssigneeRoster();
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
      const outcome = await createReviewTask(
        buildReviewTaskBody({ docId, docTitle, programId, sectionCode, assignee, due, priority, instructions }),
      );
      if (seq !== generation.current) return;
      if (!outcome.ok) {
        setError(outcome.message);
        setNeedsReconciliation(outcome.unconfirmed);
        return;
      }
      const assigneeName = outcome.assigneeName ?? chosen?.name ?? null;
      fireToast(`Review task ${outcome.taskId} assigned${assigneeName ? ` to ${assigneeName}` : ''} — linked to “${docTitle}” on the task ledger.`);
      onCreated({ taskId: outcome.taskId, assigneeName });
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
            <div className="de-h-s">Creates a review task linked to “{docTitle}” on the organization’s task ledger.</div>
          </div>
          <button className="de-x" onClick={onClose} aria-label="Close" disabled={saving}>
            {I.close}
          </button>
        </div>
        <div className="de-body">
          <ReviewerSelect roster={roster} rosterState={rosterState} onReload={reloadRoster} value={assignee} onChange={setAssignee} />
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
              The task is written to the task ledger with its origin recorded as this document. The create is audited and an assignment notification is requested; completing an approval-gated task requires a §11.50 e-signature, taken on the document’s Tasks rail or the Task board. This task is not a review request: the Review board does not list it.
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
