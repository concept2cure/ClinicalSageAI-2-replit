// NewTaskDialog — real task creation form (replaces the AnA-composer "new task"
// intent). Maps 1:1 to the POST /api/regulatory/tasks/unified body validated by
// server/routes/unifiedTasks.routes.ts (createTaskSchema):
//
//   moduleType   enum  REQUIRED — CMC | IND | MedicalDevice | eCTD | Vault | ProtocolDesign
//   title        string REQUIRED (min 1)
//   description  string  optional
//   priority     enum    optional — low | medium | high | critical
//   status       — NOT accepted by the create schema; new tasks default to
//                  "pending" server-side, so status is omitted here (see note).
//   dueDate      string  optional (ISO date)
//   assigneeId   number  optional (numeric users FK). Resolved from the team
//                  roster picker (useTeamMembers → GET /api/collaboration/team).
//   assigneeName string  optional (free-text assignee name). Sent alongside
//                  assigneeId for display when a member is picked; sent alone as
//                  a graceful fallback when the roster is empty.
//   projectId    number  optional FK. The canonical concept2cure project id is a
//                  non-numeric string that does NOT map to this numeric
//                  projects.id FK, so it is exposed as an optional numeric
//                  "program id" input rather than forced from the canonical id.
//   organizationId is injected by taskingService (resolved client-side).
//
// a11y mirrors RiskDialog usage in Register.tsx: labeled inputs, required
// markers, selects for enums, submit disabled until valid + during mutation,
// errors in a role=alert region.

import * as React from 'react';
import { useCreateTask } from '../../hooks/useTasking';
import { useTeamMembers } from '../../hooks/useTeam';
import type {
  TaskCreate,
  TaskModuleType,
  TaskPriority,
} from '../../services/taskingService';
import { TASK_PRIORITY_LABEL } from '../data/nav';
import { TaskingIcon } from '../icons';
import { TaskDialog } from './TaskDialog';

// The create schema's moduleType enum, in the order they appear server-side.
const MODULE_OPTIONS: { value: TaskModuleType; label: string }[] = [
  { value: 'CMC', label: 'CMC' },
  { value: 'IND', label: 'IND' },
  { value: 'MedicalDevice', label: 'Medical device' },
  { value: 'eCTD', label: 'eCTD' },
  { value: 'Vault', label: 'Vault' },
  { value: 'ProtocolDesign', label: 'Protocol design' },
];

const PRIORITY_OPTIONS: TaskPriority[] = ['low', 'medium', 'high', 'critical'];

interface NewTaskDialogProps {
  /** Optional numeric program id pre-selected by the shell, if one exists. */
  defaultProgramId?: number | null;
  onClose: () => void;
}

interface NewTaskState {
  moduleType: TaskModuleType;
  title: string;
  description: string;
  priority: TaskPriority;
  dueDate: string;
  /** Selected team member id as a string ('' = unassigned). */
  assigneeId: string;
  /** Free-text fallback when the team roster is empty. */
  assigneeName: string;
  programId: string;
}

export function NewTaskDialog({ defaultProgramId, onClose }: NewTaskDialogProps) {
  const create = useCreateTask();
  const team = useTeamMembers();
  const members = team.data ?? [];
  const hasRoster = members.length > 0;
  const [form, setForm] = React.useState<NewTaskState>({
    moduleType: 'CMC',
    title: '',
    description: '',
    priority: 'medium',
    dueDate: '',
    assigneeId: '',
    assigneeName: '',
    programId: defaultProgramId != null ? String(defaultProgramId) : '',
  });
  const errId = React.useId();
  const set = <K extends keyof NewTaskState>(k: K, v: NewTaskState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  // A numeric program id, if supplied, must parse to a finite number.
  const programIdValid =
    form.programId.trim() === '' || Number.isFinite(Number(form.programId.trim()));
  const valid = form.title.trim().length > 0 && form.moduleType.length > 0 && programIdValid;
  const pending = create.isPending;
  const error = create.error as Error | null;
  const formId = 'task-new-form';

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || pending) return;
    const programId = form.programId.trim();
    // Resolve the picked member to a numeric assigneeId + display name. When the
    // roster is empty we keep the free-text assigneeName fallback.
    const picked = hasRoster
      ? members.find((m) => String(m.id) === form.assigneeId)
      : undefined;
    const assignee = picked
      ? { assigneeId: picked.id, assigneeName: picked.name || picked.email || `User ${picked.id}` }
      : !hasRoster && form.assigneeName.trim()
        ? { assigneeName: form.assigneeName.trim() }
        : {};
    const body: TaskCreate = {
      moduleType: form.moduleType,
      title: form.title.trim(),
      priority: form.priority,
      ...(form.description.trim() ? { description: form.description.trim() } : {}),
      ...(form.dueDate ? { dueDate: form.dueDate } : {}),
      ...assignee,
      ...(programId ? { projectId: Number(programId) } : {}),
    };
    await create.mutateAsync(body);
    onClose();
  };

  return (
    <TaskDialog
      open
      busy={pending}
      title="New task"
      subtitle="Create a task in any program. It appears on the board and list once saved."
      onClose={onClose}
      footer={
        <>
          <button type="button" className="bp-btn-tert" onClick={onClose} disabled={pending}>
            Cancel
          </button>
          <button type="submit" form={formId} className="bp-btn-primary" disabled={!valid || pending}>
            {pending ? 'Creating…' : 'Create task'}
          </button>
        </>
      }
    >
      <form id={formId} className="task-form" onSubmit={onSubmit} aria-describedby={error ? errId : undefined}>
        <div className="task-field">
          <label htmlFor="task-new-title">Title<span className="task-req" aria-hidden="true">*</span></label>
          <input id="task-new-title" required value={form.title}
                 onChange={(e) => set('title', e.target.value)}
                 placeholder="e.g. Draft the stability summary" />
        </div>

        <div className="task-field">
          <label htmlFor="task-new-desc">Description</label>
          <textarea id="task-new-desc" value={form.description}
                    onChange={(e) => set('description', e.target.value)}
                    placeholder="What needs to be done, and any context the owner needs" />
        </div>

        <div className="task-field-row">
          <div className="task-field">
            <label htmlFor="task-new-module">Program<span className="task-req" aria-hidden="true">*</span></label>
            <select id="task-new-module" value={form.moduleType}
                    onChange={(e) => set('moduleType', e.target.value as TaskModuleType)}>
              {MODULE_OPTIONS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
          <div className="task-field">
            <label htmlFor="task-new-priority">Priority</label>
            <select id="task-new-priority" value={form.priority}
                    onChange={(e) => set('priority', e.target.value as TaskPriority)}>
              {PRIORITY_OPTIONS.map((p) => (
                <option key={p} value={p}>{TASK_PRIORITY_LABEL[p]}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="task-field-row">
          <div className="task-field">
            <label htmlFor="task-new-due">Due date</label>
            <input id="task-new-due" type="date" value={form.dueDate}
                   onChange={(e) => set('dueDate', e.target.value)} />
          </div>
          <div className="task-field">
            <label htmlFor="task-new-assignee">Assignee</label>
            {hasRoster ? (
              <select id="task-new-assignee" value={form.assigneeId}
                      onChange={(e) => set('assigneeId', e.target.value)}>
                <option value="">Unassigned</option>
                {members.map((m) => (
                  <option key={m.id} value={String(m.id)}>
                    {m.name || m.email || `User ${m.id}`}
                    {m.title ? ` — ${m.title}` : ''}
                  </option>
                ))}
              </select>
            ) : (
              <input id="task-new-assignee" value={form.assigneeName}
                     onChange={(e) => set('assigneeName', e.target.value)}
                     placeholder="Name of the owner" />
            )}
            <span className="task-field-hint">
              {team.isLoading
                ? 'Loading the team roster.'
                : hasRoster
                  ? `${members.length} team members. Pick one to assign.`
                  : 'No team roster available. Enter an owner name.'}
            </span>
          </div>
        </div>

        <div className="task-field">
          <label htmlFor="task-new-program-id">Program id (numeric, optional)</label>
          <input id="task-new-program-id" inputMode="numeric" value={form.programId}
                 onChange={(e) => set('programId', e.target.value)}
                 aria-invalid={!programIdValid || undefined}
                 placeholder="Leave blank to scope to the organization" />
          <span className="task-field-hint">
            New tasks start as to do. Only a numeric program id is accepted here.
          </span>
        </div>

        {error && (
          <div id={errId} className="task-form-error" role="alert">
            <TaskingIcon name="alertCircle" size={14} />
            Could not create the task. {error.message}
          </div>
        )}
      </form>
    </TaskDialog>
  );
}
