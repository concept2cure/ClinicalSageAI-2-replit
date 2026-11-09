/* ── A work project's own tasks, in its work area (S12; founder decision P-111, slice 2) ─────────────────────────
   Split from ProjectCoreWork.tsx (RULE 6: a split stays in the folder it came from).

   A work project's door (ProjectCoreWork.tsx WorkProjectItem) opens its area bound to it: the door hands the work
   project's id to the area through the one navigation hand-off (navParams.ts), and the area keeps it on its URL
   (`?workProject=<id>`), so a reload or a copied link stays bound. The area's own records are unchanged: they are the
   program's. What the binding adds, at the top of the area, is the work project's name and its tasks.

   - The binding is proven, never trusted: the work project is read through the project hierarchy with the open
     program (GET /api/project-hierarchy/:id/children?programId=), which refuses a project outside that program.
   - Its tasks are its `unified_tasks` rows, read through the existing work read on its own projects.id
     (GET /api/concept2cure/projects/:id/unified-work, `board` items), admitted by the one task admission
     (tasking/task-project.ts; the coordinating session's ruling (b): a filing project's writer, one direction only).
   - "Add a task" is the one task create (editor/AssignReviewDialog.tsx createAssignedTask, POST /api/tasks/tasks),
     filed on the work project, with origin `work_project_task` so it is never the work project's "Deliver" task
     (ProjectCoreWork.tsx WORK_PROJECT_TASK_ENTITY), whose newest row is its owner and due date. */
import React from 'react';
import { useAuth } from '@/services/portal/authService';
import { canGovernedWrite } from '@shared/constants/permissions';
import { C2CForm, type C2CFormConfig } from '../C2CForm';
import { readRefusalWords, useLiveData, type ShapeGuard } from '../dataConnect';
import { I } from '../icons';
import { consumeNavParams, NAV_PARAMS_EVENT, resolveSurfaceIdForTarget, stashNavParamsForTarget } from '../navParams';
import { shellProgramId, useShellProject } from '../shellProject';
import { createAssignedTask, isSubmittableReviewer, useAssigneeRoster, type AssignOutcome } from '../editor/AssignReviewDialog';
import { TASK_STATE_LABEL } from '../editor/ReviewTasksPanel';

export const WORK_PROJECT_URL_PARAM = 'workProject';
/** The origin of a task filed in a work project from its area. */
export const WORK_PROJECT_TASKS_ENTITY = 'work_project_task';

/** The task module each bound area files its tasks under, as its other tasks are. */
const AREA_TASK_MODULE: Record<string, string> = { cmc: 'CMC', quality: 'Quality' };
const AREA_LABEL: Record<string, string> = { cmc: 'CMC', quality: 'Quality' };

function positiveId(value: unknown): number | null {
  const n = typeof value === 'string' && /^\d{1,10}$/.test(value.trim()) ? Number(value) : NaN;
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/** The areas that show a work project's tasks when opened from its door (P-111: CMC and Quality). */
export const WORK_PROJECT_BOUND_AREAS: ReadonlySet<string> = new Set(['cmc', 'quality']);

/** Open an area bound to a work project: the hand-off the area's useBoundWorkProject reads. Other areas open as they
 *  did, with nothing handed off. */
export function bindWorkProject(areaId: string, workProjectId: number): void {
  if (WORK_PROJECT_BOUND_AREAS.has(areaId)) stashNavParamsForTarget(areaId, { [WORK_PROJECT_URL_PARAM]: String(workProjectId) });
}

function writeUrlBinding(id: number | null): void {
  try {
    const url = new URL(window.location.href);
    if ((url.searchParams.get(WORK_PROJECT_URL_PARAM) ?? null) === (id === null ? null : String(id))) return;
    if (id === null) url.searchParams.delete(WORK_PROJECT_URL_PARAM);
    else url.searchParams.set(WORK_PROJECT_URL_PARAM, String(id));
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
  } catch {
    /* no window or history: nothing to keep */
  }
}

/** The work project this area is bound to: the door's hand-off, else the URL's; kept on the URL; null when unbound. */
export function useBoundWorkProject(areaId: string): [number | null, () => void] {
  const surfaceId = React.useMemo(() => resolveSurfaceIdForTarget(areaId), [areaId]);
  const [id, setId] = React.useState<number | null>(() => {
    const handed = positiveId(consumeNavParams(surfaceId)?.[WORK_PROJECT_URL_PARAM]);
    if (handed !== null) return handed;
    try { return positiveId(new URLSearchParams(window.location.search).get(WORK_PROJECT_URL_PARAM)); } catch { return null; }
  });
  React.useEffect(() => { writeUrlBinding(id); }, [id]);
  React.useEffect(() => {
    /* A door pressed while the area is already open hands off without a new mount. */
    const onHandOff = () => {
      const handed = positiveId(consumeNavParams(surfaceId)?.[WORK_PROJECT_URL_PARAM]);
      if (handed !== null) setId(handed);
    };
    window.addEventListener(NAV_PARAMS_EVENT, onHandOff);
    return () => window.removeEventListener(NAV_PARAMS_EVENT, onHandOff);
  }, [surfaceId]);
  return [id, () => setId(null)];
}

interface Children { anchorProjectId: number; children: Array<{ id: number; name: string; workKind: string | null; ownerName: string | null }> }
const isChildren: ShapeGuard<Children> = (value): value is Children => {
  const v = value as Partial<Children> | null;
  return !!v && typeof v.anchorProjectId === 'number' && Array.isArray(v.children);
};

export interface WorkItem { id: string; source: string; title: string; status: string; dueAt: string | null; ownerName: string | null }
interface WorkRead { items: WorkItem[]; summary?: { partial?: boolean } }
const isWorkRead: ShapeGuard<WorkRead> = (value): value is WorkRead => {
  const items = (value as Partial<WorkRead> | null)?.items;
  return Array.isArray(items) && items.every((i) => i && typeof i.id === 'string' && typeof i.title === 'string');
};

const DATE = { year: 'numeric', month: 'short', day: 'numeric' } as const;
const WORK_STATUS: Record<string, string> = { open: 'Open', in_progress: 'In progress', blocked: 'Blocked', done: 'Done' };

/** "Confirm the drug substance specification · Dana Ruiz · due Nov 30, 2026 · Open". */
export function workTaskText(item: WorkItem): string {
  const due = item.dueAt && Number.isFinite(new Date(item.dueAt).getTime()) ? `due ${new Date(item.dueAt).toLocaleDateString('en-US', DATE)}` : null;
  const status = WORK_STATUS[item.status] ?? TASK_STATE_LABEL[item.status]?.label ?? item.status;
  return [item.title, item.ownerName ?? 'No one assigned', due, status].filter(Boolean).join(' · ');
}

/** The one task create's body for a task in a work project. */
export function buildWorkProjectAreaTaskBody(form: {
  areaId: string; programId: string; workProjectId: number; title: string; assignee: string; due: string; note: string;
}): Record<string, unknown> {
  return {
    title: form.title.trim(),
    description: form.note.trim() || undefined,
    moduleType: AREA_TASK_MODULE[form.areaId] ?? 'Plan', moduleSource: 'work-project-tasks', category: 'work-project', taskType: 'work-project-task',
    priority: 'medium',
    projectId: form.workProjectId,
    assigneeId: Number(form.assignee),
    ...(form.due ? { dueDate: new Date(`${form.due}T17:00:00`).toISOString() } : {}),
    sourceEntityType: WORK_PROJECT_TASKS_ENTITY,
    sourceEntityId: `${form.programId}:${form.workProjectId}`,
    moduleData: { programId: form.programId, workProjectId: form.workProjectId, area: form.areaId },
    tags: ['work-project'],
  };
}

const TASK_WORDS = { noun: 'task', unmatched: 'The response did not confirm this task. Read the work project’s tasks again before adding it again.' };

function addTaskForm(name: string, roster: Array<{ id: string; name: string; label?: string }>, rosterState: string): C2CFormConfig {
  const unread = rosterState === 'error';
  return {
    eyebrow: 'Work project',
    title: `Add a task to ${name}`,
    sub: 'Creates a task in this work project for one person, with a due date. It appears in their tasks.',
    submitLabel: 'Add task',
    busy: rosterState === 'loading' ? 'Reading your organisation’s members…' : undefined,
    notice: unread ? 'The member list could not be read, so no one can be chosen. Close this and try again.' : undefined,
    fields: unread ? [] : [
      { key: 'title', label: 'Task', type: 'text', required: true, placeholder: 'e.g. Confirm the drug substance specification' },
      { key: 'assignee', label: 'Person', type: 'select', required: true, options: roster.map((a) => ({ value: a.id, label: a.label ?? a.name })) },
      { key: 'due', label: 'Due date', type: 'date', required: true },
      { key: 'note', label: 'Note', type: 'textarea', rows: 3, placeholder: 'What they should know (optional)' },
    ],
  };
}

function AddTaskDrawer({ name, onCancel, onSubmit }: { name: string; onCancel: () => void; onSubmit: (v: Record<string, string>) => void }) {
  const { roster, rosterState } = useAssigneeRoster();
  return <C2CForm config={addTaskForm(name, roster, rosterState)} onCancel={onCancel} onSubmit={onSubmit} />;
}

function AddTask({ areaId, programId, workProjectId, name, onAdded }: {
  areaId: string; programId: string; workProjectId: number; name: string; onAdded: () => void;
}) {
  const { user } = useAuth();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [outcome, setOutcome] = React.useState<AssignOutcome | null>(null);
  if (!canGovernedWrite(user)) return null;
  const submit = async (v: Record<string, string>) => {
    setOpen(false);
    if (!(v.title ?? '').trim() || !isSubmittableReviewer(v.assignee ?? '')) {
      setOutcome({ ok: false, unconfirmed: false, message: 'A task needs its name and one person, so nothing was added.' });
      return;
    }
    setBusy(true);
    const result = await createAssignedTask(buildWorkProjectAreaTaskBody({ areaId, programId, workProjectId,
      title: v.title, assignee: v.assignee, due: v.due ?? '', note: v.note ?? '' }), TASK_WORDS);
    setBusy(false);
    setOutcome(result);
    if (result.ok || result.unconfirmed) onAdded();
  };
  return <>
    <button type="button" className="btn ghost small" disabled={busy} onClick={() => { setOutcome(null); setOpen(true); }}>
      {I.plus} {busy ? 'Adding…' : 'Add a task'}
    </button>
    {outcome && !outcome.ok && <p className="pj-card-note" role="alert" data-testid="work-project-task-error">{outcome.message}</p>}
    {open && <AddTaskDrawer name={name} onCancel={() => setOpen(false)} onSubmit={(v) => void submit(v)} />}
  </>;
}

/** A binding that could not be proven: said, with the way back to the whole project. */
function BindingRefused({ proof, unbind }: { proof: ReturnType<typeof useLiveData<Children>>; unbind: () => void }) {
  const refusal = proof.error ? readRefusalWords(proof, 'this work project') : null;
  return (
    <div className="pj-work-projects" data-testid="work-project-bound" role="alert">
      <p className="pj-card-note">{refusal ? `${refusal.title}. ${refusal.message}` : 'This work project could not be read, so nothing is shown for it.'}</p>
      <button type="button" className="btn ghost small" onClick={unbind}>Show the whole project</button>
    </div>
  );
}

/** The work project's own tasks: read, failed, none, or listed; never a failed read shown as none. */
function TaskList({ tasks }: { tasks: ReturnType<typeof useLiveData<WorkRead>> }) {
  if (tasks.loading && !tasks.data) return <p className="pj-card-note" role="status">Reading its tasks…</p>;
  if (tasks.error || !tasks.data) return <p className="pj-card-note" role="alert">Its tasks could not be read.</p>;
  const own = tasks.data.items.filter((i) => i.source === 'board');
  return <>
    {own.length === 0 ? <p className="pj-card-note">No tasks in this work project yet.</p> : (
      <ul className="pj-work-projects-l" data-testid="work-project-tasks">
        {own.map((t) => <li key={t.id}><span className="pj-card-note">{workTaskText(t)}</span></li>)}
      </ul>
    )}
    {tasks.data.summary?.partial && <p className="pj-card-note sp-tone-warn">Some of its work could not be read, so this list may be incomplete.</p>}
  </>;
}

/** The reads a binding needs: the proof (the work project is under the open program), its row, and its tasks. */
function useBoundReads(programId: string | null, workProjectId: number | null, version: number) {
  const bound = programId !== null && workProjectId !== null;
  const program = encodeURIComponent(programId ?? '');
  const proofPath = bound ? `/api/project-hierarchy/${workProjectId}/children?programId=${program}` : null;
  const proof = useLiveData<Children>(proofPath, [proofPath], isChildren);
  const anchor = proof.data?.anchorProjectId ?? null;
  const siblingsPath = bound && anchor !== null ? `/api/project-hierarchy/${anchor}/children?programId=${program}` : null;
  const siblings = useLiveData<Children>(siblingsPath, [siblingsPath], isChildren);
  const tasksPath = bound && proof.data ? `/api/concept2cure/projects/${workProjectId}/unified-work` : null;
  const tasks = useLiveData<WorkRead>(tasksPath, [tasksPath, version], isWorkRead);
  const row = siblings.data?.children.find((c) => c.id === workProjectId) ?? null;
  return { proof, tasks, row };
}

/** At the top of a work area opened from a work project's door: the work project's name and its tasks. Nothing
 *  when the area is not bound, or no project is open. */
export function WorkProjectTasks({ area }: { area: 'cmc' | 'quality' }) {
  const programId = shellProgramId(useShellProject());
  const [workProjectId, unbind] = useBoundWorkProject(area);
  const [version, setVersion] = React.useState(0);
  const { proof, tasks, row } = useBoundReads(programId, workProjectId, version);
  if (!programId || workProjectId === null) return null;
  if (proof.loading) return <p className="pj-card-note" role="status" data-testid="work-project-bound">Reading the work project…</p>;
  if (proof.error || !proof.data) return <BindingRefused proof={proof} unbind={unbind} />;
  const name = row?.name ?? 'This work project';
  const facts = [name, AREA_LABEL[area], row?.ownerName].filter(Boolean).join(' · ');
  return (
    <section className="pj-work-projects" data-testid="work-project-bound" aria-label={`Work project: ${name}`}>
      <div className="pj-work-projects-h">
        <p className="pj-work-project-n">Working in {facts}</p>
        <button type="button" className="btn ghost small" onClick={unbind}>Show the whole project</button>
      </div>
      <TaskList tasks={tasks} />
      <AddTask areaId={area} programId={programId} workProjectId={workProjectId} name={name} onAdded={() => setVersion((n) => n + 1)} />
    </section>
  );
}
