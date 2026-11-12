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
import { resolveFilingCatalogEntry } from '@shared/regulatory/filing-catalog';
import { AssignAction, AssignmentLine, buildPyramidTaskBody, UseScheduleDate, type PlanAssignment } from './PlanAssign';

/** A recorded filing in words: the catalogue's name, or nothing when the catalogue does not know it. */
const filingName = (filing: string | null | undefined) => (filing ? resolveFilingCatalogEntry(filing)?.displayName ?? null : null);

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

const DAY = { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' } as const;
/** A YYYY-MM-DD date in words, read as the calendar day it names. */
export function dayWords(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isFinite(d.getTime()) ? d.toLocaleDateString(undefined, DAY) : iso;
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

const dayMs = (iso: string) => Date.parse(`${iso}T00:00:00Z`);

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

interface LineMark { key: string; at: string; label: string; kind: 'milestone' | 'submission' | 'clock' | 'decision' }

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

// ── THE_PROGRAM §5, §9 step 6: the portfolio line on Projects ───────────────

/** One project's plan in a few figures (the engine's scheduleSummary), as GET /api/v1/pyramids/by-project?refs= sends
 *  it, or why there is none. */
export interface PortfolioLineData {
  unavailable?: boolean;
  unreadable?: boolean;
  type?: string | null;
  /** The recorded filing (catalogue id), as the single read gives it. */
  filing?: string | null;
  target?: string | null;
  /** The back-schedule's first day, or null when the project has no target date. */
  start?: string | null;
  /** The agency's clock after the filing, or null where none is held. */
  reviewClock?: PyReviewClock | null;
  /** 'hours-only': the plan's dates are the earliest possible, so "on schedule" is said against minimum dates. */
  durations?: 'typical' | 'hours-only' | 'mixed' | null;
  summary?: {
    total: number; done: number; blocked: number; overdue: number; lateToStart: number;
    next: { phaseId: string; phaseName: string; taskId: string; due: string | null } | null;
    status: 'complete' | 'blocked' | 'at-risk' | 'on-track' | 'unscheduled';
  };
}
interface PortfolioRead { asOf: string; lines: Record<string, PortfolioLineData> }
const isPortfolioRead = (v: unknown): v is PortfolioRead => !!v && typeof v === 'object' && typeof (v as PortfolioRead).lines === 'object';

/** The batch's limit (pyramid.routes.ts). Projects reads 50 cards a page. */
export const PORTFOLIO_BATCH = 100;

/** The portfolio lines for a page of projects: one read for the page, not one per card. */
export function usePortfolioLines(programIds: string[]): { lines: Record<string, PortfolioLineData>; error: boolean; loading: boolean; asOf: string | null } {
  const ids = programIds.slice(0, PORTFOLIO_BATCH);
  const key = ids.join(',');
  const read = useLiveData<PortfolioRead>(key ? `/api/v1/pyramids/by-project?refs=${encodeURIComponent(key)}` : null, [key], isPortfolioRead);
  return { lines: read.data?.lines ?? {}, error: Boolean(read.error), loading: read.loading, asOf: read.data?.asOf ?? null };
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The line's words. Nothing for a filing with no work breakdown or a project not admitted: the card says its filing. */
export function portfolioWords(line: PortfolioLineData | undefined): { text: string; tone?: 'warn' | 'err' } | null {
  if (!line || line.unavailable || !line.summary) return line?.unreadable ? { text: 'The plan could not be read.' } : null;
  const s = line.summary;
  const next = s.next?.due ? ` · ${s.next.phaseName} by ${dayWords(s.next.due)}` : '';
  switch (s.status) {
    case 'complete': return { text: 'Plan complete' };
    case 'blocked': return { text: `${plural(s.blocked, 'task blocked', 'tasks blocked')}${next}`, tone: 'err' };
    case 'unscheduled': return { text: 'Not scheduled: no target date' };
    case 'at-risk': return {
      text: s.overdue > 0 ? `${plural(s.overdue, 'task', 'tasks')} past due${next}` : `${plural(s.lateToStart, 'task', 'tasks')} should have started${next}`,
      tone: 'warn',
    };
    default: return { text: `${line.durations === 'hours-only' ? 'On schedule against minimum dates' : 'On schedule'}${next}` };
  }
}

/** The card's (or list row's) one quiet line about the plan. Colour only where it is behind, beside the words. */
export function PortfolioLine({ line, className = 'pj-card-plan' }: { line: PortfolioLineData | undefined; className?: string }) {
  const words = portfolioWords(line);
  return words ? <div className={className} data-tone={words.tone} data-testid="portfolio-line">{words.text}</div> : null;
}

/** Said once above the cards when the page's plan lines could not be read: never a page of cards that only looks calm. */
export function PortfolioLinesNote({ error }: { error: boolean }) {
  return error ? <p className="pf-sel-m" role="status" data-testid="portfolio-lines-error">Where each project’s plan stands could not be read.</p> : null;
}

// ── THE_PROGRAM §5, §9 step 6: the global schedule in Reporting & analytics ──

/** A project the global schedule is asked about: its program id and the name the reader knows it by. */
export interface ScheduleProject { programId: string; name: string }

type Drawn = PortfolioLineData & { target: string; start: string; summary: NonNullable<PortfolioLineData['summary']> };

/** Why a project is not drawn on the global schedule, in words; null when it is drawn. */
export function offScheduleReason(line: PortfolioLineData | undefined): string | null {
  if (!line) return 'not read';
  if (line.unavailable) return 'not available to you';
  if (line.unreadable) return 'its plan could not be read';
  if (!line.type) return 'no work breakdown for its filing';
  if (!line.target) return 'no target date';
  return line.start && line.summary ? null : 'its dates could not be laid out';
}

const drawnEnd = (l: Drawn) => l.reviewClock?.ends ?? l.target;

/** One project's line on the shared axis: its work, the filing (filled dot), the agency's clock dashed to its goal,
 *  the next phase to complete, and today. Every date is the read's. */
function GlobalScheduleTrack({ name, line, asOf, pct, width }: {
  name: string; line: Drawn; asOf: string | null; pct: (iso: string) => string; width: (a: string, b: string) => string;
}) {
  const clock = line.reviewClock ?? null;
  const next = line.summary.next?.due ? line.summary.next : null;
  const marks: LineMark[] = [
    ...(next ? [{ key: 'next', at: next.due as string, label: `${next.phaseName} complete`, kind: 'milestone' as const }] : []),
    { key: 'submission', at: line.target, label: 'Submission (target date)', kind: 'submission' },
    ...(clock ? [{ key: 'decision', at: clock.ends, label: `${clock.label} (day ${clock.days})`, kind: 'decision' as const }] : []),
  ];
  return (
    <div className="py-line-track" role="group"
      aria-label={`${name}: work from ${dayWords(line.start)}, submission ${dayWords(line.target)}${clock ? `, ${clock.label.toLowerCase()} by ${dayWords(clock.ends)}` : ''}.`}>
      <span className="py-line-base" style={{ left: pct(line.start), width: width(line.start, line.target) }} />
      {clock && <span className="py-line-clock" style={{ left: pct(line.target), width: width(line.target, clock.ends) }} />}
      {marks.map((m) => (
        <span key={m.key} className="py-line-dot" data-kind={m.kind} style={{ left: pct(m.at) }} role="img" tabIndex={0}
          title={`${m.label} · ${dayWords(m.at)}`} aria-label={`${m.label}, ${dayWords(m.at)}`} />
      ))}
      {asOf && <span className="py-line-today" style={{ left: pct(asOf) }} aria-hidden="true" />}
    </div>
  );
}

function GlobalScheduleRow({ project, line, asOf, pct, width, onOpen }: {
  project: ScheduleProject; line: Drawn; asOf: string | null; pct: (iso: string) => string; width: (a: string, b: string) => string;
  onOpen?: (programId: string) => void;
}) {
  const filing = filingName(line.filing) ?? line.type;
  const agency = line.reviewClock?.authority;
  return (
    <li className="py-gs-row" data-testid="global-schedule-row">
      <div className="py-gs-head">
        {onOpen
          ? <button type="button" className="py-gs-name py-gs-open" onClick={() => onOpen(project.programId)}>{project.name}</button>
          : <span className="py-gs-name">{project.name}</span>}
        <span className="py-gs-sub">{[filing, agency].filter(Boolean).join(' · ')}</span>
        <PortfolioLine line={line} className="py-gs-plan" />
      </div>
      <GlobalScheduleTrack name={project.name} line={line} asOf={asOf} pct={pct} width={width} />
    </li>
  );
}

/**
 * The global schedule (THE_PROGRAM §5: "each region's filing date and review clock side by side"; §9 step 6): one row
 * per project on one shared date axis, sorted by target date, each the Plan step's line. Read once for the chart from
 * the portfolio line's batch read. A project that cannot be drawn is named with why; a failed read is said.
 */
export function GlobalSchedule({ projects, onOpen }: { projects: ScheduleProject[]; onOpen?: (programId: string) => void }) {
  const shown = projects.slice(0, PORTFOLIO_BATCH);
  const { lines, error, loading, asOf } = usePortfolioLines(shown.map((p) => p.programId));
  if (error) return <PortfolioLinesNote error />;
  if (loading) return <p className="pj-desc" role="status">Reading each project’s plan…</p>;
  const drawn = shown.filter((p) => offScheduleReason(lines[p.programId]) === null)
    .map((p) => ({ project: p, line: lines[p.programId] as Drawn }))
    .sort((a, b) => a.line.target.localeCompare(b.line.target) || a.project.name.localeCompare(b.project.name));
  const off = shown.flatMap((p) => { const why = offScheduleReason(lines[p.programId]); return why ? [`${p.name} (${why})`] : []; });
  const days = drawn.flatMap(({ line }) => [dayMs(line.start), dayMs(drawnEnd(line))]).concat(asOf ? [dayMs(asOf)] : []);
  const lo = Math.min(...days);
  const hi = Math.max(...days);
  const pct = (iso: string) => `${(((dayMs(iso) - lo) / Math.max(1, hi - lo)) * 100).toFixed(2)}%`;
  const width = (a: string, b: string) => `${(((dayMs(b) - dayMs(a)) / Math.max(1, hi - lo)) * 100).toFixed(2)}%`;
  return (
    <figure className="py-gs" data-testid="global-schedule">
      {drawn.length > 0
        ? <ol className="py-gs-rows">{drawn.map(({ project, line }) => <GlobalScheduleRow key={project.programId} project={project} line={line} asOf={asOf} pct={pct} width={width} onOpen={onOpen} />)}</ol>
        : <p className="pj-desc">No project has both a work breakdown and a target date yet, so none can be laid on the schedule.</p>}
      {drawn.length > 0 && (
        <figcaption className="pj-desc pj-fact-none">
          From {dayWords(new Date(lo).toISOString().slice(0, 10))} to {dayWords(new Date(hi).toISOString().slice(0, 10))}{asOf ? `; today is ${dayWords(asOf)}, the thin mark` : ''}.
          {' '}Each line runs from the work’s start to the target submission (the filled dot); the dashed part is the
          agency’s review clock to its decision goal, and the open dot is the next phase to complete. The dates are the
          engine’s schedule back from each target date and the agencies’ published clocks, which exclude clock stops
          where they apply.
        </figcaption>
      )}
      {off.length > 0 && <p className="pj-desc" data-testid="global-schedule-off">Not on the schedule: {off.join('; ')}.</p>}
      {projects.length > shown.length && <p className="pj-desc" role="status">The schedule shows the first {shown.length} of {projects.length} projects.</p>}
    </figure>
  );
}
