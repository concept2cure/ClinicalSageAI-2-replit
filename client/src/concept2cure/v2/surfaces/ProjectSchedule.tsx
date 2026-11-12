/**
 * The Plan step's schedule (founder decision P-122 §3.5, 2026-11-10): project management that was built on the server
 * and never shown, reached here. Nothing is computed in the browser; every figure is the engine's.
 *
 *   - Section owners, deadlines and milestones: GET /api/project-sections/summary and /timeline
 *     (server/routes/project-sections.ts), by the project's id, admitted by the sharing policy. A person who may change
 *     the project records a milestone (POST /api/project-sections/milestones) and moves an open one's date or marks it
 *     done (PATCH …/milestones/:id), each admitted as a write on the project, through the form drawer (C2CForm); the
 *     list is read again after a change (P-122, 2026-11-10).
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
import { normalizeCtdCode } from '@shared/regulatory/section-code';
import { apiRequest, assertApiResponseOk } from '@/lib/queryClient';
import { C2CForm, type C2CFormConfig } from '../C2CForm';
import { useLiveData, type DataState, type ShapeGuard } from '../dataConnect';
import { I } from '../icons';
import { C2CToast, useToast } from '../toast';
import { enumWords } from './projectWords';

interface SectionsSummary {
  overall: { total: number; completed: number; assigned: number; overdue: number };
  teamWorkload: Array<{ user_id: number; user_name: string | null; assigned_sections: string | number; active_sections: string | number }>;
}
interface TimelineEvent {
  date: string; type: 'section_deadline' | 'milestone'; title: string; status: string;
  metadata: { assignedTo?: string | null; milestoneId?: number; linkedSections?: string[] | null };
}
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
/* The timeline's dates are calendar days: a section deadline and a milestone are recorded as a day (YYYY-MM-DD) and
   stored at its midnight UTC, so they are said in UTC. Read in local time, a browser west of UTC showed the day before
   the one recorded. */
const calendarDay = (iso: string | null | undefined) => {
  const d = iso ? new Date(iso) : null;
  return d && Number.isFinite(d.getTime()) ? d.toLocaleDateString(undefined, { ...DATE, timeZone: 'UTC' }) : null;
};
const isoDay = (iso: string) => {
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : '';
};
const n = (v: string | number) => Number(v) || 0;
const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** Section numbers as a person writes them ("1.2, 2.5 3.2.s.4") as the project's section codes (m1.2, m2.5,
 *  m3.2.S.4, the form project_sections and the milestone store keep), or the first that is not a CTD section number. */
export function linkedSectionCodes(text: string): { codes: string[] } | { bad: string } {
  const codes: string[] = [];
  for (const token of text.split(/[\s,;]+/).filter(Boolean)) {
    const code = normalizeCtdCode(token);
    if (!code) return { bad: token };
    if (!codes.includes(`m${code}`)) codes.push(`m${code}`);
  }
  return { codes };
}
const sectionNumbers = (codes: readonly string[]) => codes.map((c) => c.replace(/^m/i, '')).join(', ');
const linkedWords = (text: string) => {
  if (!text.trim()) return '';
  const parsed = linkedSectionCodes(text);
  return 'bad' in parsed ? `"${parsed.bad}" is not a CTD section number.` : `Reads as ${sectionNumbers(parsed.codes)}.`;
};

/** The submission milestone catalogue's key for a filing type (c2c/tasks.ts SUBMISSION_MILESTONES), or null. */
export function milestoneCatalogueKey(filingType: string | null | undefined): string | null {
  const key = String(filingType ?? '').trim().toUpperCase().replace(/[\s-]+/g, '_');
  return ['IND', 'NDA', 'BLA', '510K', 'PMA', 'CER', 'DE_NOVO'].includes(key) ? key : null;
}

/** A read's three honest states, then its body. A read again after a change keeps what it last read on screen until
 *  the new answer lands, so the list does not empty under the person, and the button that opened a drawer is still
 *  there to take the focus back when it closes. */
function Read<T>({ state, what, onRetry, children }: {
  state: DataState<T>; what: string; onRetry: () => void; children: (data: T) => React.ReactNode;
}) {
  if (state.loading && !state.data) return <p role="status" aria-busy="true" className="pj-card-note">Reading {what}…</p>;
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

type MilestoneDraft = { kind: 'record' } | { kind: 'update'; event: TimelineEvent };
type MilestoneWrite =
  | { refused: string }
  | { method: 'POST' | 'PATCH'; url: string; body: Record<string, unknown> | null; done: string };

/** What a filled drawer sends: a record (POST) or an update (PATCH, only what changed), or why nothing is sent. */
function milestoneWrite(projectId: number, event: TimelineEvent | null, v: Record<string, string>): MilestoneWrite {
  if (!event) {
    const parsed = linkedSectionCodes(v.linked ?? '');
    if ('bad' in parsed) {
      return { refused: `Nothing was recorded. "${parsed.bad}" is not a CTD section number; write section numbers such as 2.5 or 3.2.S.4.` };
    }
    const name = v.name.trim();
    return { method: 'POST', url: '/api/project-sections/milestones', done: `Milestone "${name}" recorded.`,
      body: { project_id: projectId, name, target_date: v.target_date, linked_sections: parsed.codes } };
  }
  const body: Record<string, unknown> = {};
  if (v.target_date !== isoDay(event.date)) body.target_date = v.target_date;
  if (v.state === 'done') body.status = 'completed';
  const done = v.state === 'done' ? `Milestone "${event.title}" marked done.` : `Milestone "${event.title}" moved to ${calendarDay(v.target_date)}.`;
  return { method: 'PATCH', url: `/api/project-sections/milestones/${event.metadata.milestoneId}`, done,
    body: Object.keys(body).length ? body : null };
}

function milestoneForm(event: TimelineEvent | null, linked: string, failed: string | null): C2CFormConfig {
  if (event) {
    return {
      title: 'Update the milestone', sub: event.title, submitLabel: 'Save', notice: failed ?? undefined,
      fields: [
        { key: 'target_date', label: 'Due date', type: 'date', required: true, default: isoDay(event.date) },
        { key: 'state', label: 'Status', type: 'seg', options: [{ value: 'open', label: 'Open' }, { value: 'done', label: 'Done' }],
          desc: 'Done records today as the day it was completed. A done milestone is not reopened here.' },
      ],
    };
  }
  return {
    title: 'Record a milestone', sub: 'A dated milestone on this project’s schedule, listed with the section deadlines.',
    submitLabel: 'Record milestone', notice: failed ?? undefined,
    fields: [
      { key: 'name', label: 'Name', type: 'text', required: true, placeholder: 'e.g. Pre-IND briefing package sent' },
      { key: 'target_date', label: 'Due date', type: 'date', required: true },
      { key: 'linked', label: 'Linked CTD sections', type: 'text', placeholder: 'e.g. 1.2, 2.5',
        desc: 'Optional. The section numbers this milestone depends on, separated by commas.', descStatus: linkedWords(linked) },
    ],
  };
}

/** Record a milestone, or move an open one's date or mark it done, in the form drawer. The server admits each write
 *  as a write on the project; a refusal keeps the drawer open and says that nothing was changed. */
function MilestoneForm({ projectId, draft, onClose, onSaved }: {
  projectId: number; draft: MilestoneDraft; onClose: () => void; onSaved: (done: string) => void;
}) {
  const [linked, setLinked] = React.useState('');
  const [failed, setFailed] = React.useState<string | null>(null);
  const saving = React.useRef(false);
  const event = draft.kind === 'update' ? draft.event : null;
  const submit = async (v: Record<string, string>) => {
    if (saving.current) return;
    const write = milestoneWrite(projectId, event, v);
    if ('refused' in write) {
      setFailed(write.refused);
      return;
    }
    if (!write.body) {
      onClose();
      return;
    }
    saving.current = true;
    setFailed(null);
    try {
      const res = await apiRequest(write.method, write.url, write.body);
      if (!res.ok) await assertApiResponseOk(res);
      onSaved(write.done);
    } catch (e) {
      const why = e instanceof Error && e.message ? e.message.replace(/\.?$/, '.') : 'The request failed.';
      setFailed(`${event ? 'Nothing was changed.' : 'Nothing was recorded.'} ${why}`);
    } finally {
      saving.current = false;
    }
  };
  return (
    <C2CForm config={milestoneForm(event, linked, failed)} onCancel={onClose} onSubmit={(v) => void submit(v)}
      onFieldChange={(key, value) => { if (key === 'linked') setLinked(value); }} />
  );
}

/** One dated section or milestone. An open milestone offers "Update" to a person who may change the project. */
function TimelineRow({ event: e, onUpdate }: { event: TimelineEvent; onUpdate: (() => void) | null }) {
  const milestone = e.type === 'milestone';
  const linked = milestone && e.metadata?.linkedSections?.length ? ` · Sections ${sectionNumbers(e.metadata.linkedSections)}` : '';
  const open = milestone && e.status !== 'completed' && Number.isSafeInteger(e.metadata?.milestoneId);
  return (
    <div role="listitem" className="pj-act">
      <span className="pj-act-w">{e.title}</span>
      <span className="pj-act-t">
        {milestone ? 'Milestone' : `Section deadline · ${e.metadata?.assignedTo ?? 'No owner'}`} · {enumWords(e.status) ?? 'Status not recorded'}{linked}
      </span>
      {/* Before the date, so every row's date stays at the row's end. */}
      {open && onUpdate && <button type="button" className="btn ghost small" aria-label={`Update ${e.title}`} onClick={onUpdate}>Update</button>}
      <span className="pj-act-n pj-sched-date">{calendarDay(e.date) ?? 'No date'}</span>
    </div>
  );
}

/** Section owners and deadlines, and the dated sections and milestones in date order. */
function SectionSchedule({ projectId, canChange }: { projectId: number; canChange: boolean }) {
  const [epoch, retry] = useRetry();
  const [draft, setDraft] = React.useState<MilestoneDraft | null>(null);
  const [toast, notify] = useToast();
  const summary = useLiveData<SectionsSummary>(`/api/project-sections/summary?project_id=${projectId}`, [projectId, epoch], isSummary);
  const timeline = useLiveData<Timeline>(`/api/project-sections/timeline?project_id=${projectId}`, [projectId, epoch], isTimeline);
  const saved = (done: string) => { setDraft(null); notify(done); retry(); };
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
        {(t) => (
          <>
            {t.events.length === 0 ? <p className="pj-card-note">No section deadline or milestone is recorded.</p> : (
              <div className="pj-acts" role="list" aria-label="Deadlines and milestones">
                {t.events.map((e, i) => (
                  <TimelineRow key={`${e.type}:${e.title}:${i}`} event={e} onUpdate={canChange ? () => setDraft({ kind: 'update', event: e }) : null} />
                ))}
              </div>
            )}
            {canChange && (
              <div className="pj-sched-act">
                <button type="button" className="btn ghost small" onClick={() => setDraft({ kind: 'record' })}>{I.plus} Record a milestone</button>
              </div>
            )}
          </>
        )}
      </Read>
      {draft && <MilestoneForm projectId={projectId} draft={draft} onClose={() => setDraft(null)} onSaved={saved} />}
      <C2CToast msg={toast} />
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
          <SectionSchedule projectId={projectId} canChange={canChange} />
          <MilestoneTasks projectId={projectId} filingType={filingType} targetDate={targetDate} canChange={canChange} />
          <HierarchyRollup projectId={projectId} />
        </>
      )}
    </section>
  );
}
