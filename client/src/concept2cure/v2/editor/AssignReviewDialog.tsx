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
 */
import React, { useEffect, useState } from 'react';
import { apiRequest, redactInternals, serverMessage } from '@/lib/queryClient';
import { I } from '../icons';
import { useDialog } from '../useDialog';
import type { FireToast } from '../toast';
import { AUTHORING_TASK_ENTITY, AUTHORING_TASK_MODULE } from './ReviewTasksPanel';

interface Assignee {
  id: string;
  name: string;
}

export interface AssignReviewDialogProps {
  docId: string;
  docTitle: string;
  programId: string | null;
  sectionCode: string | null;
  onClose: () => void;
  onCreated: (task: { taskId: string; assigneeName: string | null }) => void;
  fireToast: FireToast;
}

const PRIORITIES = ['low', 'medium', 'high', 'critical'] as const;
type Priority = (typeof PRIORITIES)[number];
type RosterState = 'loading' | 'ready' | 'error';

/** What POST /api/tasks/tasks answers with, as much of it as this dialog reads. */
type CreatedTaskEnvelope = { success?: boolean; data?: { taskId?: string; assigneeName?: string | null } } | null;

/** The create either produced a server-issued task, or it did not and says why. */
type AssignOutcome =
  | { ok: true; taskId: string; assigneeName: string | null }
  | { ok: false; message: string };

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
  return assignee.trim().length > 0 && Number.isFinite(Number(assignee));
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
 * declined — and both must end by saying nothing was recorded.
 */
function refusalMessage(status: number, json: CreatedTaskEnvelope): string {
  if (status === 401) return 'Not assigned — your session isn’t authenticated. Sign in and retry.';
  return 'The review task was not created — ' + (serverMessage(json) ?? `the server refused it (HTTP ${status})`) + '. Nothing was recorded.';
}

/**
 * The sentence for a create that never reached an answer. Shared by the request
 * and the dialog so an unreachable server reads the same either way, and so no
 * internal text escapes into the UI.
 */
function unreachableMessage(e: unknown): string {
  return 'The review task was not created — ' + redactInternals(e instanceof Error ? e.message : '', 'the server could not be reached') + '. Nothing was recorded.';
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
    if (res.status === 401 || !res.ok || !json?.success || !taskId) {
      return { ok: false, message: refusalMessage(res.status, json) };
    }
    return { ok: true, taskId: String(taskId), assigneeName: json.data?.assigneeName ?? null };
  } catch (e) {
    return { ok: false, message: unreachableMessage(e) };
  }
}

/**
 * The reviewer field. Its own component because a roster that could not be read
 * is reported in place of the control, never as an empty list of people.
 */
function ReviewerSelect({ roster, rosterState, value, onChange }: {
  roster: Assignee[];
  rosterState: RosterState;
  value: string;
  onChange: (id: string) => void;
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
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
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

export function AssignReviewDialog({ docId, docTitle, programId, sectionCode, onClose, onCreated, fireToast }: AssignReviewDialogProps) {
  const [saving, setSaving] = useState(false);
  const ref = useDialog(() => {
    if (!saving) onClose();
  });
  const { roster, rosterState } = useAssigneeRoster();
  const [assignee, setAssignee] = useState('');
  const [due, setDue] = useState('');
  const [priority, setPriority] = useState<Priority>('medium');
  const [instructions, setInstructions] = useState('');
  const [error, setError] = useState<string | null>(null);

  const canSubmit = !saving && isSubmittableReviewer(assignee);

  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      const chosen = roster.find(a => a.id === assignee) ?? null;
      const outcome = await createReviewTask(
        buildReviewTaskBody({ docId, docTitle, programId, sectionCode, assignee, due, priority, instructions }),
      );
      if (!outcome.ok) {
        setError(outcome.message);
        return;
      }
      const assigneeName = outcome.assigneeName ?? chosen?.name ?? null;
      fireToast(`Review task ${outcome.taskId} assigned${assigneeName ? ` to ${assigneeName}` : ''} — linked to “${docTitle}” on the task ledger.`);
      onCreated({ taskId: outcome.taskId, assigneeName });
      onClose();
    } catch (e) {
      setError(unreachableMessage(e));
    } finally {
      setSaving(false);
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
          <ReviewerSelect roster={roster} rosterState={rosterState} value={assignee} onChange={setAssignee} />
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
              The task is written to the task ledger with its origin recorded as this document. The create is audited and the reviewer is notified; completing an approval-gated task requires a §11.50 e-signature on the Task board.
            </span>
          </div>
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
