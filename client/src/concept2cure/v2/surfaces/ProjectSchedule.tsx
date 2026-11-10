/**
 * The Plan step's schedule (founder decision P-122 §3.5, 2026-11-10): project management that was built on the server
 * and never shown, reached here. Nothing is computed in the browser; every figure is the engine's.
 *
 *   - Section owners, deadlines and milestones: GET /api/project-sections/summary and /timeline
 *     (server/routes/project-sections.ts), by the project's id, admitted by the sharing policy.
 *   - The milestone tasks: the project's task list in its submission milestone order, GET
 *     /api/concept2cure/projects/:id/tasks and /tasks/summary (server/routes/c2c/tasks.ts). With none, the filing
 *     type's milestone catalogue (GET /api/concept2cure/submission-milestones/:type) says what would be added, and the
 *     existing generator (POST …/tasks/bulk) adds them, due between today and the recorded target submission date.
 *     The same tasks are also rows of "Tasks and approvals" above (the unified work view's Schedule source); here
 *     they are read as the milestone track.
 *   - The project hierarchy's roll-up: GET /api/project-hierarchy/:id/rollup (server/routes/project-hierarchy.ts),
 *     its counts only. Its progress, risk and budget figures are not shown: a leaf's progress is a column nothing
 *     here maintains, and its risk reads "medium" where none is recorded.
 *
 * Every read is by the integer projects.id (the page's verified `projectId`). A failed read says it failed, with a
 * retry; an empty store says what is empty. None of them is drawn as 0.
 */
import React from 'react';
import { apiRequest } from '@/lib/queryClient';
import { useLiveData, type DataState, type ShapeGuard } from '../dataConnect';
import { enumWords } from './projectWords';

interface SectionsSummary {
  overall: { total: number; completed: number; assigned: number; overdue: number };
  teamWorkload: Array<{ user_id: number; user_name: string | null; assigned_sections: string | number; active_sections: string | number }>;
}
interface TimelineEvent { date: string; type: 'section_deadline' | 'milestone'; title: string; status: string; metadata: { assignedTo?: string | null } }
interface Timeline { events: TimelineEvent[] }
interface ProjectTask { id: number; name: string; status: string; moduleType: string | null; dueDate: string | null; metadata?: { milestoneOrder?: number } | null }
interface TaskSummary { total: number; completed: number; overdue: number }
interface Milestone { name: string; category: string; order: number }
interface Rollup { rollup: { childCount: number; childStatusSummary: Record<string, number>; totalTasks: number; completedTasks: number; blockedTasks: number; overdueTasks: number } | null }

/* A 200 without the engine's shape is a failed read, never an empty one (and never a crash of the page). */
const isObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const isSummary: ShapeGuard<SectionsSummary> = (v): v is SectionsSummary =>
  isObject(v) && isObject(v.overall) && typeof v.overall.total === 'number' && Array.isArray(v.teamWorkload);
const isTimeline: ShapeGuard<Timeline> = (v): v is Timeline => isObject(v) && Array.isArray(v.events);
const isTaskList: ShapeGuard<ProjectTask[]> = (v): v is ProjectTask[] => Array.isArray(v);
const isTaskSummary: ShapeGuard<TaskSummary> = (v): v is TaskSummary => isObject(v) && typeof v.total === 'number' && typeof v.completed === 'number';
const isCatalogue: ShapeGuard<Milestone[]> = (v): v is Milestone[] => Array.isArray(v);
const isRollup: ShapeGuard<Rollup> = (v): v is Rollup => isObject(v) && 'rollup' in v && (v.rollup === null || isObject(v.rollup));

const DATE = { year: 'numeric', month: 'short', day: 'numeric' } as const;
const day = (iso: string | null | undefined) => {
  const d = iso ? new Date(iso) : null;
  return d && Number.isFinite(d.getTime()) ? d.toLocaleDateString(undefined, DATE) : null;
};
const n = (v: string | number) => Number(v) || 0;
const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** The submission milestone catalogue's key for a filing type (c2c/tasks.ts SUBMISSION_MILESTONES), or null. */
export function milestoneCatalogueKey(filingType: string | null | undefined): string | null {
  const key = String(filingType ?? '').trim().toUpperCase().replace(/[\s-]+/g, '_');
  return ['IND', 'NDA', 'BLA', '510K', 'PMA', 'CER', 'DE_NOVO'].includes(key) ? key : null;
}

/** A read's three honest states, then its body. */
function Read<T>({ state, what, onRetry, children }: {
  state: DataState<T>; what: string; onRetry: () => void; children: (data: T) => React.ReactNode;
}) {
  if (state.loading) return <p role="status" aria-busy="true" className="pj-card-note">Reading {what}…</p>;
  if (state.error || !state.data) {
    return (
      <div role="alert">
        <p className="pj-card-note">{what.charAt(0).toUpperCase() + what.slice(1)} could not be read.</p>
        <button type="button" className="btn small" onClick={onRetry}>Retry</button>
      </div>
    );
  }
  return <>{children(state.data)}</>;
}

function useRetry(): [number, () => void] {
  const [epoch, setEpoch] = React.useState(0);
  return [epoch, React.useCallback(() => setEpoch((v) => v + 1), [])];
}

/** Section owners and deadlines, and the dated sections and milestones in date order. */
function SectionSchedule({ projectId }: { projectId: number }) {
  const [epoch, retry] = useRetry();
  const summary = useLiveData<SectionsSummary>(`/api/project-sections/summary?project_id=${projectId}`, [projectId, epoch], isSummary);
  const timeline = useLiveData<Timeline>(`/api/project-sections/timeline?project_id=${projectId}`, [projectId, epoch], isTimeline);
  return (
    <div className="pj-tracking-module" data-testid="pj-schedule-sections">
      <h3>Section owners and deadlines</h3>
      <Read state={summary} what="the project's section tracking" onRetry={retry}>
        {(s) => s.overall.total === 0 ? <p className="pj-card-note">No CTD sections are tracked on this project yet.</p> : (
          <>
            <p className="pj-card-note">
              {s.overall.assigned} of {plural(s.overall.total, 'section has', 'sections have')} an owner · {s.overall.completed} complete
              {s.overall.overdue ? ` · ${s.overall.overdue} overdue` : ''}
            </p>
            {s.teamWorkload.length > 0 && (
              <div className="pj-acts" role="list" aria-label="Section owners">
                {s.teamWorkload.map((w) => (
                  <div role="listitem" key={w.user_id} className="pj-act">
                    <span className="pj-act-w">{w.user_name ?? 'A former member'}</span>
                    <span className="pj-act-t">{n(w.active_sections)} open of {plural(n(w.assigned_sections), 'section', 'sections')}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </Read>
      <Read state={timeline} what="the project's deadlines and milestones" onRetry={retry}>
        {(t) => t.events.length === 0 ? <p className="pj-card-note">No section deadline or milestone is recorded.</p> : (
          <div className="pj-acts" role="list" aria-label="Deadlines and milestones">
            {t.events.map((e, i) => (
              <div role="listitem" key={`${e.type}:${e.title}:${i}`} className="pj-act">
                <span className="pj-act-w">{e.title}</span>
                <span className="pj-act-t">
                  {e.type === 'milestone' ? 'Milestone' : `Section deadline · ${e.metadata?.assignedTo ?? 'No owner'}`} · {enumWords(e.status) ?? 'Status not recorded'}
                </span>
                <span className="pj-act-n">{day(e.date) ?? 'No date'}</span>
              </div>
            ))}
          </div>
        )}
      </Read>
    </div>
  );
}

/** Add the filing type's milestones as tasks, once a person has seen what it adds. */
function AddMilestones({ projectId, type, targetDate, count, onAdded }: {
  projectId: number; type: string; targetDate: string; count: number; onAdded: () => void;
}) {
  const [step, setStep] = React.useState<'idle' | 'confirm' | 'saving'>('idle');
  const [failed, setFailed] = React.useState<string | null>(null);
  const add = async () => {
    setStep('saving');
    setFailed(null);
    try {
      const res = await apiRequest('POST', `/api/concept2cure/projects/${projectId}/tasks/bulk`, { submissionType: type, targetDate });
      if (!res.ok) throw new Error(String(res.status));
      setStep('idle');
      onAdded();
    } catch {
      setStep('confirm');
      setFailed('The milestones could not be added. Nothing was changed; try again.');
    }
  };
  if (step === 'idle') return <button type="button" className="btn small" onClick={() => setStep('confirm')}>Add the {count} {type} milestones</button>;
  return (
    <div role="group" aria-label="Add the milestones">
      <p className="pj-card-note">Adds {count} tasks, one per milestone, due at even intervals from today to the target submission date, {day(targetDate)}.</p>
      {failed && <p role="alert" className="pj-card-note">{failed}</p>}
      <button type="button" className="btn small" disabled={step === 'saving'} onClick={add}>{step === 'saving' ? 'Adding…' : 'Add'}</button>{' '}
      <button type="button" className="btn small" disabled={step === 'saving'} onClick={() => { setStep('idle'); setFailed(null); }}>Cancel</button>
    </div>
  );
}

/** The project's tasks in milestone order, the server's counts, or what a filing type's milestones would add. */
function MilestoneTasks({ projectId, filingType, targetDate, canChange }: {
  projectId: number; filingType: string | null; targetDate: string | null; canChange: boolean;
}) {
  const [epoch, retry] = useRetry();
  const tasks = useLiveData<ProjectTask[]>(`/api/concept2cure/projects/${projectId}/tasks`, [projectId, epoch], isTaskList);
  const summary = useLiveData<TaskSummary>(`/api/concept2cure/projects/${projectId}/tasks/summary`, [projectId, epoch], isTaskSummary);
  const type = milestoneCatalogueKey(filingType);
  const none = !tasks.loading && !tasks.error && Array.isArray(tasks.data) && tasks.data.length === 0;
  const catalogue = useLiveData<Milestone[]>(none && type ? `/api/concept2cure/submission-milestones/${type}` : null, [none, type], isCatalogue);
  return (
    <div className="pj-tracking-module" data-testid="pj-schedule-milestones">
      <h3>Milestone tasks</h3>
      <Read state={tasks} what="the project's milestone tasks" onRetry={retry}>
        {(list) => {
          const rows = [...list].sort((a, b) => (a.metadata?.milestoneOrder ?? 1e9) - (b.metadata?.milestoneOrder ?? 1e9)
            || String(a.dueDate ?? '').localeCompare(String(b.dueDate ?? '')));
          if (rows.length === 0) {
            const milestones = catalogue.data ?? [];
            return (
              <>
                <p className="pj-card-note">No milestone tasks on this project yet.{type ? '' : ' This filing type has no milestone catalogue.'}</p>
                {type && catalogue.error && <p className="pj-card-note">The {type} milestone catalogue could not be read.</p>}
                {type && milestones.length > 0 && (
                  <>
                    <p className="pj-card-note">An {type}&apos;s milestones: {milestones.map((m) => m.name).join(' · ')}.</p>
                    {!targetDate ? <p className="pj-card-note">Record a target submission date in the project&apos;s settings to add them with due dates.</p>
                      : canChange && <AddMilestones projectId={projectId} type={type} targetDate={targetDate} count={milestones.length} onAdded={retry} />}
                  </>
                )}
              </>
            );
          }
          return (
            <>
              <Read state={summary} what="the task summary" onRetry={retry}>
                {(s) => <p className="pj-card-note">{s.completed} of {plural(s.total, 'task', 'tasks')} done{s.overdue ? ` · ${s.overdue} overdue` : ''}</p>}
              </Read>
              <div className="pj-acts" role="list" aria-label="Milestone tasks">
                {rows.map((t) => (
                  <div role="listitem" key={t.id} className="pj-act">
                    <span className="pj-act-w">{t.name}</span>
                    <span className="pj-act-t">{[enumWords(t.moduleType), enumWords(t.status)].filter(Boolean).join(' · ')}</span>
                    <span className="pj-act-n">{day(t.dueDate) ? `Due ${day(t.dueDate)}` : 'No due date'}</span>
                  </div>
                ))}
              </div>
            </>
          );
        }}
      </Read>
    </div>
  );
}

/** The project hierarchy's roll-up: its work projects and the tasks across the hierarchy, as the server counts them. */
function HierarchyRollup({ projectId }: { projectId: number }) {
  const [epoch, retry] = useRetry();
  const state = useLiveData<Rollup>(`/api/project-hierarchy/${projectId}/rollup`, [projectId, epoch], isRollup);
  return (
    <div className="pj-tracking-module" data-testid="pj-schedule-rollup">
      <h3>Project roll-up</h3>
      <Read state={state} what="the project's roll-up" onRetry={retry}>
        {({ rollup: r }) => !r ? <p className="pj-card-note">The roll-up is not available for this project.</p> : (
          <>
            <p className="pj-card-note">
              {r.childCount === 0 ? 'No work projects under this project.'
                : `${plural(r.childCount, 'work project', 'work projects')}: ${Object.entries(r.childStatusSummary).map(([status, count]) => `${count} ${enumWords(status) ?? status}`).join(', ')}.`}
            </p>
            <p className="pj-card-note">
              {r.totalTasks === 0 ? 'No project tasks across the hierarchy.'
                : `Across the hierarchy: ${r.completedTasks} of ${plural(r.totalTasks, 'task', 'tasks')} done · ${r.blockedTasks} blocked · ${r.overdueTasks} overdue.`}
            </p>
          </>
        )}
      </Read>
    </div>
  );
}

/** The Plan step's schedule section. `projectId` is the verified integer project id; `unverified` says why there is
 *  none once the page knows (no tracking record, or a record that could not be verified). */
export function ProjectSchedule({ projectId, unverified, filingType, targetDate, canChange }: {
  projectId: number | null; unverified: string | null; filingType: string | null; targetDate: string | null; canChange: boolean;
}) {
  return (
    <section className="pj-sec" aria-labelledby="pj-schedule-h" data-testid="pj-plan-schedule">
      <div className="pj-sec-h">
        <h2 id="pj-schedule-h">Schedule</h2>
        <span className="sec-sub">Section owners, deadlines and milestones, the milestone tasks, and the project roll-up</span>
      </div>
      {projectId === null ? (
        unverified ? <p className="pj-card-note">{unverified}</p> : <p role="status" aria-busy="true" className="pj-card-note">Reading this project’s record…</p>
      ) : (
        <>
          <SectionSchedule projectId={projectId} />
          <MilestoneTasks projectId={projectId} filingType={filingType} targetDate={targetDate} canChange={canChange} />
          <HierarchyRollup projectId={projectId} />
        </>
      )}
    </section>
  );
}
