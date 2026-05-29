// LinkTaskDialog — link the source task to another task. Maps 1:1 to
// POST /api/regulatory/tasks/:id/link (linkTaskSchema): the route injects
// sourceTaskId from the path, so the body carries targetTaskId (string) +
// linkType (enum dependency | reference | parent-child | related). The optional
// dependencyType / isBlocking / impact fields are omitted to keep the form
// minimal; they are not required by the schema.
//
// The target picker is a labeled select over the already-loaded task list
// (excluding the source), so no extra fetch / heavy task-search is needed.

import * as React from 'react';
import { useLinkTask } from '../../hooks/useTasking';
import type { Task, TaskLinkType } from '../../services/taskingService';
import { TaskingIcon } from '../icons';
import { TaskDialog } from './TaskDialog';

const LINK_TYPE_OPTIONS: { value: TaskLinkType; label: string }[] = [
  { value: 'dependency', label: 'Depends on' },
  { value: 'related', label: 'Related to' },
  { value: 'reference', label: 'References' },
  { value: 'parent-child', label: 'Parent of' },
];

interface LinkTaskDialogProps {
  source: Task;
  /** All loaded tasks; the target options exclude the source. */
  tasks: Task[];
  onClose: () => void;
}

const taskKey = (t: Task) => t.taskId ?? String(t.id);

export function LinkTaskDialog({ source, tasks, onClose }: LinkTaskDialogProps) {
  const link = useLinkTask();
  const sourceKey = taskKey(source);
  const targets = React.useMemo(
    () => tasks.filter((t) => taskKey(t) !== sourceKey),
    [tasks, sourceKey],
  );
  const [targetTaskId, setTargetTaskId] = React.useState('');
  const [linkType, setLinkType] = React.useState<TaskLinkType>('dependency');
  const errId = React.useId();

  const valid = targetTaskId.length > 0;
  const pending = link.isPending;
  const error = link.error as Error | null;
  const formId = 'task-link-form';

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || pending) return;
    await link.mutateAsync({
      sourceTaskId: sourceKey,
      link: { targetTaskId, linkType },
    });
    onClose();
  };

  return (
    <TaskDialog
      open
      busy={pending}
      title="Link task"
      subtitle={`Connect "${source.title}" to another task.`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="bp-btn-tert" onClick={onClose} disabled={pending}>
            Cancel
          </button>
          <button type="submit" form={formId} className="bp-btn-primary" disabled={!valid || pending}>
            {pending ? 'Linking…' : 'Link task'}
          </button>
        </>
      }
    >
      <form id={formId} className="task-form" onSubmit={onSubmit} aria-describedby={error ? errId : undefined}>
        <div className="task-field">
          <label htmlFor="task-link-type">Relationship</label>
          <select id="task-link-type" value={linkType}
                  onChange={(e) => setLinkType(e.target.value as TaskLinkType)}>
            {LINK_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div className="task-field">
          <label htmlFor="task-link-target">Target task<span className="task-req" aria-hidden="true">*</span></label>
          <select id="task-link-target" required value={targetTaskId}
                  onChange={(e) => setTargetTaskId(e.target.value)}>
            <option value="">Select a task</option>
            {targets.map((t) => (
              <option key={taskKey(t)} value={taskKey(t)}>
                {t.title} · {t.moduleType}
              </option>
            ))}
          </select>
          {targets.length === 0 && (
            <span className="task-field-hint">No other tasks are available to link to yet.</span>
          )}
        </div>
        {error && (
          <div id={errId} className="task-form-error" role="alert">
            <TaskingIcon name="alertCircle" size={14} />
            Could not link the task. {error.message}
          </div>
        )}
      </form>
    </TaskDialog>
  );
}
