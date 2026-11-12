/**
 * The project's program plan: its filing's work breakdown, with this project's
 * progress (S11; founder decision P-82; docs/design/THE_PROGRAM_2026-11-01.md
 * §7.2 and §9 step 2).
 *
 * Split out of Pyramid.tsx. The phases, tasks, roles, hours, dependencies and
 * critical path are the submission-pyramid engine's
 * (services/regulatory/SubmissionPyramidEngine.ts), the same as on the
 * standalone pyramid. Here they are this project's: the pyramid is the one its
 * recorded filing resolves to, and each task's status is recorded on this
 * project (GET/PATCH /api/v1/pyramids/by-project/:ref, pyramid.routes.ts), no
 * longer shared by every project of the same filing type. It lives in the
 * project's Plan step: no new screen.
 *
 * Step 3: each task's start and due date, back-scheduled by the engine from the
 * project's target submission date (the route's `schedule`), and its owner: a
 * task in the one task store, made through the Plan step's existing Assign
 * (PlanAssign.tsx, POST /api/tasks/tasks), so it is in the owner's tasks.
 *
 * @module client/src/concept2cure/v2/surfaces/PyramidProject
 */
import { applySurfaceAction } from '../surfaceActions';
import React, { useEffect, useMemo, useState } from 'react';
import { apiRequest, serverMessage } from '@/lib/queryClient';
import { useLiveData, type DataState } from '../dataConnect';
import { setEditorTarget } from '../editorTarget';
import {
  pyProgress, pyStanding, pyWorkStatus, PY_STANDING_WORDS, PY_WORK_STATUS_WORDS,
  type PyPhase, type PyPyramid, type PyReviewClock, type PySchedule, type PyScheduledTask, type PyStanding, type PyTask,
} from '../fixtures/pyramid-data';
import { PyTaskSheet, PyWorkBreakdown, statusRefusal, workDocumentAsk } from './Pyramid';
import { dayMs, dayWords, filingName, type LineMark } from './PyramidPortfolio';
import { AssignAction, AssignmentLine, buildPyramidTaskBody, UseScheduleDate, type PlanAssignment } from './PlanAssign';

/** A recorded filing in words: the catalogue's name, or nothing when the catalogue does not know it. */

export interface ProjectPyramidRead {
  programId: string;
  /** The engine's pyramid type, or null when the project's filing has none. */
  type: string | null;
  label?: string;
  filing: string | null;
  pyramid?: PyPyramid;
  statuses?: Record<string, string>;
  pendingStore?: boolean;
  /** The project's target submission date (YYYY-MM-DD), or null when none is recorded. */
  target?: string | null;
  /** The day the server read the schedule on. */
  asOf?: string;
  schedule?: PySchedule | null;
  scheduleRefusal?: string;
  /** The agency's clock after the filing, or null where none is held. */
  reviewClock?: PyReviewClock | null;
}
export const projectPyramidPath = (programId: string) => `/api/v1/pyramids/by-project/${encodeURIComponent(programId)}`;

const isRead = (v: unknown): v is ProjectPyramidRead =>
  !!v && typeof v === 'object' && 'type' in v && (((v as ProjectPyramidRead).type === null) || Array.isArray((v as ProjectPyramidRead).pyramid?.tasks));

/** This project's task statuses: the read's, with this visit's writes over them. A write is applied at once and
 *  reverted when refused. The read's statuses are used from the first render, so the plan never claims, even for a
 *  moment, that nothing is done. */
function useProjectTaskStatuses(path: string, read: ProjectPyramidRead | null) {
  const [edits, setEdits] = useState<{ of: ProjectPyramidRead | null; statuses: Record<string, string> } | null>(null);
  const [refusal, setRefusal] = useState('');
  useEffect(() => { setRefusal(''); }, [read]);
  const statuses = edits && edits.of === read ? edits.statuses : (read?.statuses ?? {});
  const setStatus = async (taskId: string, status: string) => {
    const before = statuses;
    const next = { ...statuses };
    if (status === 'todo') delete next[taskId];
    else next[taskId] = status;
    setEdits({ of: read, statuses: next });
    setRefusal('');
    try {
      const res = await apiRequest('PATCH', `${path}/progress/${encodeURIComponent(taskId)}`, { status });
      if (!res.ok) {
        setEdits({ of: read, statuses: before });
        const body = await res.json().catch(() => null);
        setRefusal(statusRefusal(serverMessage(body) ?? `the server refused it (HTTP ${res.status})`));
      }
    } catch (e) {
      setEdits({ of: read, statuses: before });
      setRefusal(statusRefusal(e instanceof Error ? e.message : String(e)));
    }
  };
  return { statuses, refusal, setStatus };
}


/** The plan's one sentence about its dates. */
export function scheduleSentence(read: Pick<ProjectPyramidRead, 'target' | 'schedule' | 'scheduleRefusal'>, late: number): string {
  if (read.scheduleRefusal) return `The tasks could not be scheduled: ${read.scheduleRefusal.replace(/[.\s]+$/, '')}.`;
  if (!read.target || !read.schedule) {
    return 'No target submission date is recorded, so the tasks have no due dates. Set one in Project settings, at the top of this page.';
  }
  const lateWords = late === 0 ? '' : late === 1 ? ' One unfinished task is past its dates.' : ` ${late} unfinished tasks are past their dates.`;
  return `Scheduled back from the target submission date, ${dayWords(read.target)}: the work starts by ${dayWords(read.schedule.start)}.${lateWords}`;
}

/** The row's line: the owner (or none) and the due date, with a word when the task is behind. Words, not colour alone. */
function RowPlan({ slot, owner, standing }: { slot?: PyScheduledTask; owner?: PlanAssignment; standing: PyStanding }) {
  return (
    <span className="py-row-plan" data-standing={standing ?? undefined}>
      <span className="py-row-owner">{owner ? owner.assigneeName ?? 'Owner not returned' : 'No owner'}</span>
      {slot && <span className="py-row-due">due {dayWords(slot.due)}{standing ? ` · ${PY_STANDING_WORDS[standing]}` : ''}</span>}
    </span>
  );
}

/** "Use the schedule's date", offered only where an unfinished owner's task is due on another day than the plan's. */
export function MoveToSchedule({ owner, slot, ownerDay, onMoved }: {
  owner?: PlanAssignment; slot?: PyScheduledTask; ownerDay: string | null; onMoved?: () => void;
}) {
  if (!owner || !slot || !onMoved || ownerDay === slot.due || ['completed', 'cancelled'].includes(owner.status)) return null;
  return <UseScheduleDate assignment={owner} scheduleDay={slot.due} scheduleWords={dayWords(slot.due)} onMoved={onMoved} />;
}

/** The task sheet's schedule and owner. */
function TaskPlan({ slot, standing, owner, ownersUnread, assign, onMoved }: {
  slot?: PyScheduledTask; standing: PyStanding; owner?: PlanAssignment; ownersUnread: boolean; assign: React.ReactNode;
  /** Reads the owners again after the owner's task was moved to the schedule's date. */
  onMoved?: () => void;
}) {
  const ownerDue = owner?.dueDate ? new Date(owner.dueDate) : null;
  const ownerDay = ownerDue && Number.isFinite(ownerDue.getTime())
    ? `${ownerDue.getFullYear()}-${String(ownerDue.getMonth() + 1).padStart(2, '0')}-${String(ownerDue.getDate()).padStart(2, '0')}` : null;
  return (
    <div className="py-sheet-sec" data-testid="py-task-plan">
      <div className="py-sheet-sec-l">Schedule and owner</div>
      {slot ? (
        <p className="py-sheet-sched">
          Starts by {dayWords(slot.start)}, due {dayWords(slot.due)} · {slot.workingDays} working {slot.workingDays === 1 ? 'day' : 'days'}
          {slot.basis === 'typical-duration' ? ", its typical duration" : ' from its estimated hours'}
          {slot.afterSubmission ? ' · after the submission' : ''}
          {standing ? ` · ${PY_STANDING_WORDS[standing]}` : ''}.
        </p>
      ) : <p className="py-sheet-sched">No due date: this project has no target submission date recorded.</p>}
      {owner ? <p><AssignmentLine assignment={owner} />{slot && ownerDay && ownerDay !== slot.due ? `. The schedule now says ${dayWords(slot.due)}.` : ''}</p>
        : <p>{ownersUnread ? 'Who owns this task could not be read.' : 'No owner yet.'}</p>}
      <MoveToSchedule owner={owner} slot={slot} ownerDay={ownerDay} onMoved={onMoved} />
      {assign}
    </div>
  );
}

/** The project's pyramid read (step 2 and 3's route), read once by the Plan step and shared by its sections. The target
 *  date is a dependency, so a change in Project settings reads it again. */
export function useProjectPyramid(programId: string, targetKey?: string | null): DataState<ProjectPyramidRead> {
  const path = projectPyramidPath(programId);
  return useLiveData<ProjectPyramidRead>(path, [path, targetKey ?? ''], isRead);
}

/** The work-breakdown task an IND catalogue document comes from. The catalogue derives each document from the IND
 *  pyramid and ids it '<task id>:deliverable:<n>' or '<task id>:subtask:<id>'
 *  (server/services/authoring/ind-document-catalog-source.ts); any other id has none. */
export function producingTaskId(deliverableId: string): string | null {
  const m = /^(.+?):(?:deliverable|subtask):[^:]+$/.exec(deliverableId);
  return m ? m[1] : null;
}

/** The producing task, where it is in this project's pyramid. */
export function producingTask(deliverableId: string, read: ProjectPyramidRead | null): PyTask | null {
  const taskId = producingTaskId(deliverableId);
  return (taskId && read?.pyramid?.tasks.find((t) => t.id === taskId)) || null;
}

/**
 * The content plan's join (THE_PROGRAM §3.5): beside a document the filing needs, the work-breakdown task that produces
 * it, with that task's due date and owner. Said only where the document's task is in this project's pyramid: a
 * document with none, or a plan not yet read, shows nothing rather than a guessed task.
 */
export function ProducedBy({ deliverableId, read, owners }: {
  deliverableId: string; read: ProjectPyramidRead | null; owners?: Map<string, PlanAssignment>;
}) {
  const task = producingTask(deliverableId, read);
  if (!task) return null;
  const slot = read?.schedule?.tasks[task.id];
  const owner = owners?.get(task.id);
  return (
    <span className="pj-plan-producedby" data-testid="plan-produced-by">
      {/* "task owner": beside "Assigned to Dana, due Nov 20" (the document's own assignment), a bare "no owner" read as a
          contradiction (human test J1, 2026-11-06). This line is the producing task's, and says so. */}
      Work: {task.name}{slot ? ` · due ${dayWords(slot.due)}` : ''} · task owner: {owner ? owner.assigneeName ?? 'not returned' : 'none'}
    </span>
  );
}

export function ProjectProgramPlan({ programId, read: shared, projectId = null, owners, ownersUnread = false, onAssigned, targetKey, workstreamNote, canEdit = true, onNav, onAsk }: {
  /** Whether the person may change this project (not a viewer, not archived). Default true: the server still decides. */
  canEdit?: boolean;
  programId: string;
  /** Said under the workstreams: a device plan's workstreams have no work-breakdown key (ProjectPlan.tsx). */
  workstreamNote?: string;
  /** The Plan step's read of the project's pyramid (useProjectPyramid), so it is read once; read here when absent. */
  read?: DataState<ProjectPyramidRead>;
  /** projects.id behind the program (useProjectTeam), the key the owner's task is scoped by; null until verified. */
  projectId?: number | null;
  /** This project's work-breakdown tasks that have an owner (usePlanAssignments().byPyramidTask). */
  owners?: Map<string, PlanAssignment>;
  ownersUnread?: boolean;
  onAssigned?: () => void;
  /** The recorded target date, so a change in Project settings reads the schedule again. */
  targetKey?: string | null;
  onNav: (id: string) => void;
  onAsk: (text: string) => void;
}) {
  const path = projectPyramidPath(programId);
  const own = useLiveData<ProjectPyramidRead>(shared ? null : path, [shared ? '' : path, targetKey ?? ''], isRead);
  const read = shared ?? own;
  const data = read.data;
  const { statuses, refusal, setStatus } = useProjectTaskStatuses(path, data);
  const tasks = useMemo<PyTask[]>(
    () => (data?.pyramid?.tasks ?? []).map((t) => (statuses[t.id] ? { ...t, status: statuses[t.id] } : t)),
    [data, statuses],
  );

  if (!data) {
    if (read.loading) return null;
    return <p className="pj-desc pj-fact-none" role="note">This project's program plan could not be read.</p>;
  }
  // A filing the engine has no work breakdown for: said once, quietly, never an invented plan.
  if (!data.type || !data.pyramid) {
    return (
      <p className="pj-desc pj-fact-none" data-testid="pj-program-none">
        A work breakdown is available for INDs, NDAs, BLAs, MAAs, Japanese marketing applications, 510(k)s, De Novos and PMAs.
        {/* Named as the catalogue names it: "(us_510k_ivd)" read as a stored key, and beside "510(k)s" as a contradiction
            to a device tester (human test J1, 2026-11-06). The 510(k) for IVD is its own filing in the catalogue. */}
        This project&apos;s filing{filingName(data.filing) ? `, ${filingName(data.filing)},` : ''} has none yet.
      </p>
    );
  }
  return (
    <ProgramPlanBody data={data} pyramid={data.pyramid} tasks={tasks} refusal={refusal} setStatus={setStatus}
      canEdit={canEdit} programId={programId} projectId={projectId} owners={owners} ownersUnread={ownersUnread} onAssigned={onAssigned}
      workstreamNote={workstreamNote} onNav={onNav} onAsk={onAsk} />
  );
}

interface PlanOwners {
  /** False for a viewer or an archived project: statuses are shown, not offered. */
  canEdit: boolean;
  programId: string;
  projectId: number | null;
  owners?: Map<string, PlanAssignment>;
  ownersUnread: boolean;
  onAssigned?: () => void;
}

/** Said wherever a schedule rests on working hours alone: typical task durations are regulatory content with a cited
 *  source, and none is on record for this filing type yet, so the dates are a floor and are never shown as a forecast. */
export const MINIMUM_DATES_NOTE =
  'These are the earliest possible dates, not a forecast. Typical task durations are not on record for this filing type yet, '
  + 'so each task is given only its working hours. Allow for review cycles, testing and waiting time when you set the target date.';

/** The schedule's sentence, how many tasks have an owner, and how the dates were reached. */
function PlanScheduleLines({ data, late, owned, total, ownersUnread }: {
  data: ProjectPyramidRead; late: number; owned: number; total: number; ownersUnread: boolean;
}) {
  return <>
    <p className="pj-desc" data-testid="pj-program-schedule">
      {scheduleSentence(data, late)}
      {data.schedule && ` ${ownersUnread ? 'Who owns each task could not be read.' : `${owned} of ${total} ${owned === 1 ? 'task has' : 'tasks have'} an owner.`}`}
    </p>
    {data.schedule?.durations === 'hours-only' && (
      <p className="pj-desc" data-testid="pj-program-minimum" role="note">{MINIMUM_DATES_NOTE}</p>
    )}
    {data.schedule && (
      <details className="pj-more py-how">
        <summary>How these dates are worked out</summary>
        <p className="pj-desc pj-fact-none">
          Each task is due the working day before the work that depends on it starts, counting back from the target
          submission date. A task&apos;s length is its typical duration for this filing type or, where none is on record,
          its estimated hours at an eight-hour day. Working days are Monday to Friday; holidays are not counted.
        </p>
      </details>
    )}
  </>;
}

/** The task sheet, with this project's schedule and owner for the task, and its Assign. */
function ProjectTaskSheet({ pyr, task, tasks, slot, standing, ind, setStatus, onOpenTask, onNav, onAsk, plan }: {
  pyr: PyPyramid; task: PyTask; tasks: PyTask[]; slot?: PyScheduledTask; standing: PyStanding; ind: boolean;
  setStatus: (id: string, status: string) => Promise<void>; onOpenTask: (id: string | null) => void;
  onNav: (id: string) => void; onAsk: (text: string) => void; plan: PlanOwners;
}) {
  const { programId, projectId, owners, ownersUnread, onAssigned } = plan;
  const assign = onAssigned && (
    <AssignAction deliverable={{ id: task.id, title: task.name, group: task.phase }} programId={programId} projectId={projectId}
      assigned={owners?.has(task.id) ?? false} onAssigned={onAssigned}
      due={slot ? { value: slot.due, desc: "The schedule's date for this task, back-scheduled from the target submission date." } : undefined}
      buildBody={(form) => buildPyramidTaskBody({ programId, projectId: projectId as number, task, ...form })} />
  );
  return (
    <PyTaskSheet pyr={pyr} task={task} tasks={tasks} onClose={() => onOpenTask(null)} onTask={onOpenTask}
      onStatus={(id, s) => void setStatus(id, s)} projectOpen readOnly={!plan.canEdit}
      plan={<TaskPlan slot={slot} standing={standing} owner={owners?.get(task.id)} ownersUnread={ownersUnread} assign={assign} onMoved={onAssigned} />}
      onOpenSection={ind ? (code, title) => {
        setEditorTarget({ docType: null, code, label: title, programId });
        onOpenTask(null);
        onNav('document-authoring');
      } : undefined}
      onWorkDocument={ind ? (title) => { onOpenTask(null); onAsk(workDocumentAsk(title, task.name)); } : undefined}
      onOpenVaultFolder={(code) => {
        onOpenTask(null);
        /* The Vault's own open-folder action: the binder heading for the code, or the nearest above it (S6 step 3). */
        applySurfaceAction({ actionType: 'surface_action', actionId: 'vault.open-folder', surfaceId: 'vault',
          label: `Open ${code} in the Vault`, params: { folder: code, folderId: `bn:${code}` } }, onNav);
      }} />
  );
}

function ProgramPlanBody({ data, pyramid, tasks, refusal, setStatus, onNav, onAsk, workstreamNote, ...plan }: PlanOwners & {
  data: ProjectPyramidRead; pyramid: PyPyramid; tasks: PyTask[]; refusal: string; workstreamNote?: string;
  setStatus: (id: string, status: string) => Promise<void>; onNav: (id: string) => void; onAsk: (text: string) => void;
}) {
  const [openTask, setOpenTask] = useState<string | null>(null);
  const pyr: PyPyramid = { ...pyramid, tasks };
  const progress = pyProgress(pyr);
  const open = openTask ? tasks.find((t) => t.id === openTask) ?? null : null;
  const slots = data.schedule?.tasks ?? {};
  const standingOf = (t: PyTask) => pyStanding(t.status, slots[t.id], data.asOf ?? '');
  const late = tasks.filter((t) => standingOf(t) !== null).length;
  const owned = plan.owners ? tasks.filter((t) => plan.owners!.has(t.id)).length : 0;
  return (
    <section className="pj-sec" aria-labelledby="pj-program-h" data-testid="pj-program-plan">
      <div className="pj-sec-h">
        <h2 id="pj-program-h">Program plan</h2>
        <span className="sec-sub">{data.label ?? data.type} work breakdown</span>
      </div>
      <p className="pj-desc">
        {progress.completed} of {progress.total} tasks done · critical path {progress.criticalPathPct}% done · about {progress.hoursRemaining} hours of work remaining.
        The work breakdown is the standard one for this filing type; progress, owners and dates are this project&apos;s.
      </p>
      <PlanScheduleLines data={data} late={late} owned={owned} total={progress.total} ownersUnread={plan.ownersUnread} />
      {data.pendingStore && <p className="pj-desc pj-fact-none" role="note">Recorded progress is not available in this deployment, so every task reads as not started.</p>}
      {refusal && <p className="pj-desc" role="alert">{refusal}</p>}
      {data.schedule && <ScheduleLine schedule={data.schedule} pyr={pyr} asOf={data.asOf ?? ''} clock={data.reviewClock ?? null} />}
      <Workstreams pyr={pyr} slots={data.schedule ? slots : null} asOf={data.asOf ?? ''} owners={plan.owners} note={workstreamNote}
        breakdown={(phaseId) => <PyWorkBreakdown pyr={pyr} focusPhase={phaseId} tasks={tasks} onTask={setOpenTask}
          onStatus={(id, s) => void setStatus(id, s)} readOnly={!plan.canEdit}
          rowPlan={(t) => <RowPlan slot={slots[t.id]} owner={plan.owners?.get(t.id)} standing={standingOf(t)} />} />} />
      {open && <ProjectTaskSheet pyr={pyr} task={open} tasks={tasks} slot={slots[open.id]} standing={standingOf(open)}
        ind={data.type === 'IND'} setStatus={setStatus} onOpenTask={setOpenTask} onNav={onNav} onAsk={onAsk} plan={plan} />}
    </section>
  );
}

// ── §8 item 3: workstreams ──────────────────────────────────────────────────

/** One workstream per phase of the work breakdown (THE_PROGRAM §8 item 3): its name, lead, tasks done, the date it
 *  completes and a status word, opening to its tasks. The lead is the owner of the task that completes it: leads are
 *  not otherwise recorded (§6), and the list says so. Colour only on Blocked and At risk, always with the word. */
export function Workstreams({ pyr, slots, asOf, owners, note, breakdown }: {
  pyr: PyPyramid; slots: Record<string, PyScheduledTask> | null; asOf: string; owners?: Map<string, PlanAssignment>;
  note?: string; breakdown: (phaseId: string) => React.ReactNode;
}) {
  return (
    <div className="py-ws" data-testid="pj-workstreams">
      <h3 className="py-ws-h">Workstreams</h3>
      {[...pyr.phases].sort((a, b) => a.order - b.order).map((ph) => (
        <WorkstreamRow key={ph.id} phase={ph} tasks={pyr.tasks.filter((t) => t.phase === ph.id)} slots={slots} asOf={asOf}
          owners={owners} breakdown={breakdown} />
      ))}
      <p className="pj-desc pj-fact-none">A workstream&apos;s lead is the owner of the task that completes it. Open one to see its tasks.</p>
      {note && <p className="pj-desc pj-fact-none" data-testid="pj-workstreams-note">{note}</p>}
    </div>
  );
}

function WorkstreamRow({ phase, tasks, slots, asOf, owners, breakdown }: {
  phase: PyPhase; tasks: PyTask[]; slots: Record<string, PyScheduledTask> | null; asOf: string;
  owners?: Map<string, PlanAssignment>; breakdown: (phaseId: string) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const status = pyWorkStatus(tasks, slots, asOf);
  const done = tasks.filter((t) => t.status === 'done').length;
  const gate = phase.gate ? tasks.find((t) => t.id === phase.gate) : undefined;
  const lead = gate ? owners?.get(gate.id)?.assigneeName : undefined;
  const ends = gate && slots?.[gate.id] ? slots[gate.id].due : null;
  return (
    <details className="py-ws-row" data-status={status} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>
        <span className="py-ws-name">{phase.name}</span>
        <span className="py-ws-lead">{lead ? `Lead ${lead}` : 'No lead'}</span>
        <span className="py-ws-n">{done} of {tasks.length} done</span>
        <span className="py-ws-date">{status === 'complete' ? 'Completed' : ends ? `Completes ${dayWords(ends)}` : 'No date'}</span>
        <span className="py-ws-status">{PY_WORK_STATUS_WORDS[status]}</span>
      </summary>
      {open && breakdown(phase.id)}
    </details>
  );
}

// ── §8 item 4: the schedule line ────────────────────────────────────────────


/** The critical path's spans: the merged date ranges of the critical tasks before the submission. */
function criticalSpans(pyr: PyPyramid, schedule: PySchedule): [string, string][] {
  const spans = pyr.tasks.filter((t) => t.critical && schedule.tasks[t.id] && !schedule.tasks[t.id].afterSubmission)
    .map((t) => [schedule.tasks[t.id].start, schedule.tasks[t.id].due] as [string, string]).sort((a, b) => a[0].localeCompare(b[0]));
  const out: [string, string][] = [];
  for (const [a, b] of spans) {
    const last = out[out.length - 1];
    if (last && a <= last[1]) last[1] = b > last[1] ? b : last[1];
    else out.push([a, b]);
  }
  return out;
}


function scheduleMarks(pyr: PyPyramid, schedule: PySchedule, clock: PyReviewClock | null): LineMark[] {
  const marks: LineMark[] = pyr.phases.flatMap((ph) => {
    const slot = ph.gate ? schedule.tasks[ph.gate] : undefined;
    return slot && !slot.afterSubmission && ph.gate !== schedule.anchorTaskId
      ? [{ key: ph.id, at: slot.due, label: `${ph.name} complete`, kind: 'milestone' as const }] : [];
  });
  marks.push({ key: 'submission', at: schedule.target, label: 'Submission (target date)', kind: 'submission' });
  for (const m of clock?.milestones ?? []) marks.push({ key: `clock-${m.day}`, at: m.date, label: `${m.label} (day ${m.day})`, kind: 'clock' });
  if (clock) marks.push({ key: 'decision', at: clock.ends, label: `${clock.label} (day ${clock.days})`, kind: 'decision' });
  return marks;
}

/**
 * The schedule (THE_PROGRAM §8 item 4): one calm line from the start of the work through the submission and the
 * agency's clock. Each phase's completion is a dot, today a mark, the critical path the darker line; a dot's date is
 * on hover and focus. Every date is the engine's or the agency clock's; the caption says them in words.
 */
export function ScheduleLine({ schedule, pyr, asOf, clock }: { schedule: PySchedule; pyr: PyPyramid; asOf: string; clock: PyReviewClock | null }) {
  const lo = Math.min(dayMs(schedule.start), asOf ? dayMs(asOf) : Infinity);
  const hi = Math.max(dayMs(clock?.ends ?? schedule.target), asOf ? dayMs(asOf) : -Infinity);
  const pct = (iso: string) => `${(((dayMs(iso) - lo) / Math.max(1, hi - lo)) * 100).toFixed(2)}%`;
  const width = (a: string, b: string) => `${(((dayMs(b) - dayMs(a)) / Math.max(1, hi - lo)) * 100).toFixed(2)}%`;
  const marks = scheduleMarks(pyr, schedule, clock);
  return (
    <figure className="py-line" data-testid="pj-schedule-line">
      <div className="py-line-track" role="group"
        aria-label={`Schedule from ${dayWords(schedule.start)} to submission on ${dayWords(schedule.target)}${clock ? ` and ${clock.label.toLowerCase()} by ${dayWords(clock.ends)}` : ''}; today is ${dayWords(asOf)}.`}>
        <span className="py-line-base" style={{ left: pct(schedule.start), width: width(schedule.start, schedule.target) }} />
        {criticalSpans(pyr, schedule).map(([a, b]) => <span key={a} className="py-line-crit" style={{ left: pct(a), width: width(a, b) }} />)}
        {clock && <span className="py-line-clock" style={{ left: pct(schedule.target), width: width(schedule.target, clock.ends) }} />}
        {marks.map((m) => (
          <span key={m.key} className="py-line-dot" data-kind={m.kind} style={{ left: pct(m.at) }} role="img" tabIndex={0}
            title={`${m.label} · ${dayWords(m.at)}`} aria-label={`${m.label}, ${dayWords(m.at)}`} />
        ))}
        {asOf && <span className="py-line-today" style={{ left: pct(asOf) }} aria-hidden="true"><span>Today</span></span>}
      </div>
      <figcaption className="pj-desc pj-fact-none">
        Starts {dayWords(schedule.start)} · submission {dayWords(schedule.target)}
        {clock ? ` · ${clock.label} by ${dayWords(clock.ends)} (${clock.authority}, ${clock.basis}).` : '. No agency review clock is on record for this filing type.'}
        {' '}The darker line is the critical path; each dot is a phase completing.
        {clock?.clockStops ? ' The agency’s days exclude clock stops, so the decision can come later.' : ''}
      </figcaption>
    </figure>
  );
}

// The portfolio line and the global schedule: ./PyramidPortfolio.tsx (split out at 500 lines), re-exported here.
export * from './PyramidPortfolio';
