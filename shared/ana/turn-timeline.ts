/**
 * One turn of AnA's work as a timeline of client-safe events — one shape for
 * the wire, the sealed record and the Summary (ANA-SUMMARY S4,
 * docs/design/ANA_AGENT_WORK_VIEW_2026-10-08.md §2.1, §2.4, §3.3).
 *
 * ── One producer ─────────────────────────────────────────────────────────────
 * The stream emits each event once (server/services/ana/turn-timeline-emitter.ts
 * emitTimeline): it is appended to the turn's recorder and written to the
 * client as a `timeline` frame. The record seals what the recorder holds, so
 * the live Summary and the reloaded one are built from the same events.
 *
 * ── What an event may hold ───────────────────────────────────────────────────
 * Only what a row says: AnA's own words (a note), a step's label, source,
 * allow-listed preview and facts and the server's status sentence, a task's
 * title, and the turn's ending. Never a tool's name, a tool-use id, an input,
 * a result, an organisation or a person's id: a step is named by a per-turn
 * handle ("s7"), a task by the server's id ("t2").
 *
 * ── Controls ─────────────────────────────────────────────────────────────────
 * Pause, resume, steer and stop are not copied in. They are the run row's
 * (`controls` on the record); `orderTimeline` merges them by time when rows are
 * built, events first on a tie.
 *
 * Pure, no I/O.
 *
 * @module shared/ana/turn-timeline
 */

import type { StepFact, StepSource } from './step-verbs';
import { STEP_FACT_NAMES, STEP_SOURCES } from './step-verbs';

export type SourceKey = StepSource;
/**
 * 'incomplete' is a sub-agent that stopped before finishing its brief — at a
 * budget, or at a step it kept repeating (row 74, S5): neither a success nor a
 * failure, and the only status no other tool produces.
 */
export type StepStatus = 'success' | 'error' | 'not_found' | 'cancelled' | 'not_run' | 'incomplete';
export type Fact = StepFact;
export type StepPhase = 'announced' | 'awaiting_approval' | 'finished';
export type TaskChangeKind = 'added' | 'started' | 'completed' | 'removed';
export type TurnEndOutcome = 'answered' | 'stopped' | 'failed';

interface EventBase {
  seq: number;
  /** Server ISO time. */
  at: string;
  round: number;
}

/** AnA's words from a model call that also called tools. Never counted. */
export type NoteEvent = EventBase & { kind: 'note'; text: string };

export type StepEvent = EventBase & {
  kind: 'step';
  phase: StepPhase;
  /** Opaque per-turn handle ("s7"); never the tool-use id. */
  step: string;
  /**
   * The task the step served (S5): the id of the one task in progress when it
   * was dispatched. Null with none or several in progress, and for update_plan.
   */
  task: string | null;
  source: SourceKey;
  /** The doing form while announced or awaiting; the done form once it succeeded. */
  label: string;
  preview: string | null;
  /** Finished only. */
  status?: StepStatus;
  /** Finished only: a person's no, no answer, or an act only a person may take. */
  heldBack?: boolean;
  /**
   * Finished only: held back because the person asked for a read-only answer
   * (2aa766a76). Nobody declined it, so it is not one of the steps "not
   * authorised" the closing row and a detached turn's notice count (AnA
   * detach DT3).
   */
  readOnly?: boolean;
  /** Finished only: the server's sentence (stepMessage), rendered word for word. */
  message?: string;
  /** Finished only: the step's generation capture saw a model call; null when unknown. */
  usedModel?: boolean | null;
  /** Finished only: handler dispatch to result; approval waiting excluded. */
  ms?: number;
  facts?: Fact[];
};

export type TaskEvent = EventBase & { kind: 'task'; task: string; change: TaskChangeKind; title: string };

export type EndEvent = EventBase & { kind: 'end'; outcome: TurnEndOutcome; stoppedReason: string | null };

export type WorkerPhase = 'assigned' | 'started' | 'checking' | 'waiting' | 'reported' | 'held' | 'stopped';
export type WorkerOutcome = 'completed' | 'incomplete' | 'cancelled' | 'failed';
export type WorkerDisposition = 'pending' | 'accepted_as_proposal' | 'rework' | 'rejected';
export interface WorkerReceipt { eventId: string; eventHash: string }
export interface WorkerEstimate {
  basis: 'observed_check_durations'; scope: 'remaining_checks'; lowerMs: number; upperMs: number; sampleCount: number; at: string;
}
/** A content-free projection of an appended coordination record. Completion
 * counts describe measured work; neither counts nor a report approve a filing. */
export interface WorkerSnapshot {
  parent: string; worker: string; revision: number; parentStep: string; task: string | null;
  /** Optional exact title from a currently admitted canonical project task. */
  taskCaption?: string;
  /** Current parent liveness from an admitted run-row read; never a fabricated worker outcome. */
  parentState?: 'running' | 'paused' | 'awaiting_approval' | 'finished' | 'cancelled' | 'failed' | 'stale';
  role: 'research' | 'verify'; workKind: 'research' | 'verification'; label: string;
  phase: WorkerPhase; outcome: WorkerOutcome | null; completed: number | null; total: number | null;
  basis: 'deterministic_checks' | 'observed_steps' | null; parentDisposition: WorkerDisposition;
  estimate: WorkerEstimate | null; receipt: WorkerReceipt;
}
export type WorkerEvent = EventBase & WorkerSnapshot & { kind: 'worker' };
export interface ProjectTeamMonitor {
  state: 'current' | 'stale' | 'unavailable'; snapshotRevisionId: number | null;
  work: { total: number; completed: number; percentage: number | null };
  gates: { source: TeamGateState; document: TeamGateState; filing: TeamGateState }; blockers: string[];
}
type TeamGateState = 'not_assessed' | 'unavailable' | 'blocked' | 'satisfied';
export interface ProjectTeamSnapshot {
  organizationId: number; projectId: number; projectRef: string; asOf: string; cursor: string | null; complete: boolean;
  goal: ProjectTeamGoal | null; workers: WorkerSnapshot[]; projectMonitor?: ProjectTeamMonitor;
}
export interface ProjectTeamGoal {
  alias: string; label: 'Project objective'; version: number; summary?: string; truncated?: boolean;
  source?: { charterId: number; sectionKey: 'objectives'; version: number; contentHash: string; status: string; locked: boolean };
}
export type TimelineEvent = NoteEvent | StepEvent | TaskEvent | WorkerEvent | EndEvent;

/**
 * The live mirror's cap (AnA detach DT1, docs/design/ANA_DETACH_2026-10-08.md
 * §3.5): seq 1–1,999 are events, seq 2,000 is this marker, and nothing is
 * mirrored after it. The recorder is uncapped, so the record keeps every event
 * and the marker is never part of it — which is why it is a member of the
 * mirror's union below and not of TimelineEvent, whose consumers (the live
 * frames, the sealed record, the Summary rows) never meet it.
 */
export const MIRROR_EVENT_CAP = 1_999;
export const MIRROR_TRUNCATED_SEQ = 2_000;
export type TruncatedEvent = EventBase & { kind: 'truncated' };

/** A row of the live mirror (public.ana_run_events): an event, or the truncation marker. */
export type MirroredTimelineEvent = TimelineEvent | TruncatedEvent;

/** A text by its hash and length, as the record holds every text. */
export interface TimelineTextRef {
  sha256: string;
  chars: number;
}

/** The sealed form: a note's text is a reference to its blob, shared with the round's prose. */
export type SealedNoteEvent = Omit<NoteEvent, 'text'> & { text: TimelineTextRef };
export type SealedTimelineEvent = SealedNoteEvent | StepEvent | TaskEvent | WorkerEvent | EndEvent;

/** A person's control as the Summary shows it: never who took it. */
/**
 * Who took a control, in terms its reader may be told (AnA detach DT3 review:
 * a control is never credited to a person who did not take it). Absent: the
 * person who asked, reading their own turn — "You …".
 *
 *   asker                 the person who asked, read by someone else (never
 *                         named: the Summary does not name the asker)
 *   administrator         an organisation administrator, by name, or
 *                         "user <id>" when the name cannot be read
 *   you_as_administrator  the reader, who took it as an administrator
 */
export type TimelineControlBy =
  | { kind: 'asker' }
  | { kind: 'administrator'; name: string }
  | { kind: 'you_as_administrator' };

export interface TimelineControl {
  action: string;
  round: number;
  at: string;
  message?: string;
  /** Who took it, when that is not the reader asking about their own turn. */
  by?: TimelineControlBy;
  /** The reason an administrator gave for stopping the turn (required for that cancel). */
  reason?: string;
}

/** The sealed events with each note's text resolved from the record's texts; a note whose text is missing is left out. */
export function resolveTimeline(sealed: readonly SealedTimelineEvent[], texts: ReadonlyMap<string, string>): TimelineEvent[] {
  const out: TimelineEvent[] = [];
  for (const e of sealed) {
    if (e.kind !== 'note') {
      out.push(e);
      continue;
    }
    const text = texts.get(e.text.sha256);
    if (typeof text === 'string') out.push({ ...e, text });
  }
  return out;
}

/* ── Reading an event off the wire ──────────────────────────────────────────── */

/* A status outside this set is dropped by the reader below, so a step would
   reach the person's timeline with no outcome at all: every status the server
   can send belongs here. */
const STATUSES: ReadonlySet<string> = new Set<StepStatus>(['success', 'error', 'not_found', 'cancelled', 'not_run', 'incomplete']);
const PHASES: ReadonlySet<string> = new Set<StepPhase>(['announced', 'awaiting_approval', 'finished']);
const TASK_CHANGES: ReadonlySet<string> = new Set<TaskChangeKind>(['added', 'started', 'completed', 'removed']);
const OUTCOMES: ReadonlySet<string> = new Set<TurnEndOutcome>(['answered', 'stopped', 'failed']);
const FACT_NAMES: ReadonlySet<string> = new Set<string>(STEP_FACT_NAMES);

const str = (v: unknown): v is string => typeof v === 'string';
/** Own keys only: a source named `constructor` is not one. */
const isSource = (v: unknown): v is SourceKey => str(v) && Object.prototype.hasOwnProperty.call(STEP_SOURCES, v);

function readFacts(raw: unknown): Fact[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  return raw.filter((f): f is Fact => Boolean(f) && FACT_NAMES.has(f.name) && str(f.value));
}

/** A finished step's own fields, each only when it reads. */
function finishedFields(r: Record<string, any>): Partial<StepEvent> {
  const out: Partial<StepEvent> = {};
  if (STATUSES.has(r.status)) out.status = r.status;
  if (typeof r.heldBack === 'boolean') out.heldBack = r.heldBack;
  if (r.readOnly === true) out.readOnly = true;
  if (str(r.message)) out.message = r.message;
  if (typeof r.usedModel === 'boolean' || r.usedModel === null) out.usedModel = r.usedModel;
  if (typeof r.ms === 'number' && r.ms >= 0) out.ms = r.ms;
  const facts = readFacts(r.facts);
  if (facts) out.facts = facts;
  return out;
}

function readStep(r: Record<string, any>, base: EventBase): StepEvent | null {
  if (!PHASES.has(r.phase) || !str(r.step) || !str(r.label) || !isSource(r.source)) return null;
  return {
    ...base,
    kind: 'step',
    phase: r.phase,
    step: r.step,
    task: str(r.task) ? r.task : null,
    source: r.source,
    label: r.label,
    preview: str(r.preview) ? r.preview : null,
    ...finishedFields(r),
  };
}

function readTask(r: Record<string, any>, base: EventBase): TaskEvent | null {
  return str(r.task) && str(r.title) && TASK_CHANGES.has(r.change)
    ? { ...base, kind: 'task', task: r.task, change: r.change, title: r.title }
    : null;
}

const workerPhases = new Set(['assigned', 'started', 'checking', 'waiting', 'reported', 'held', 'stopped']);
const workerOutcomes = new Set(['completed', 'incomplete', 'cancelled', 'failed']);
const workerDispositions = new Set(['pending', 'accepted_as_proposal', 'rework', 'rejected']);
const teamGates = new Set(['not_assessed', 'unavailable', 'blocked', 'satisfied']);
const objectOf = (v: unknown): Record<string, unknown> | null => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null;
const integer = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const positive = (v: unknown): v is number => integer(v) && v > 0;
const opaque = (v: unknown): v is string => str(v) && /^[a-z0-9][a-z0-9_.:-]{0,199}$/i.test(v);
const isoTime = (v: unknown): v is string => str(v) && v.length <= 40 && Number.isFinite(Date.parse(v));
const hash = (v: unknown): v is string => str(v) && /^[a-f0-9]{64}$/.test(v);
export const workerLabel = (role: WorkerSnapshot['role']): string => role === 'verify' ? 'Check assigned work' : 'Research assigned work';

function readWorkerReceipt(raw: unknown): WorkerReceipt | null {
  const r = objectOf(raw);
  return r && str(r.eventId) && /^[a-f0-9]{8}-[a-f0-9-]{27}$/i.test(r.eventId) && hash(r.eventHash)
    ? { eventId: r.eventId, eventHash: r.eventHash } : null;
}
function readWorkerEstimate(raw: unknown): WorkerEstimate | null {
  const r = objectOf(raw);
  if (!r || r.basis !== 'observed_check_durations' || r.scope !== 'remaining_checks' || !integer(r.lowerMs) || !integer(r.upperMs) ||
    r.lowerMs > r.upperMs || !integer(r.sampleCount) || r.sampleCount < 3 || !isoTime(r.at)) return null;
  return { basis: 'observed_check_durations', scope: 'remaining_checks', lowerMs: r.lowerMs, upperMs: r.upperMs, sampleCount: r.sampleCount, at: r.at };
}
function workerIdentityReads(r: Record<string, unknown>): boolean {
  return opaque(r.parent) && str(r.worker) && /^w[1-9]\d{0,4}$/.test(r.worker) && positive(r.revision) &&
    str(r.parentStep) && /^s[1-9]\d*$/.test(r.parentStep) && (r.task === null || str(r.task) && /^t[1-9]\d*$/.test(r.task));
}
function workerProgressReads(r: Record<string, unknown>): boolean {
  const counts = [r.completed, r.total].every(v => v === null || integer(v));
  const bounded = r.total === null || integer(r.total) && integer(r.completed) && r.completed <= r.total;
  return counts && bounded && (r.basis === null || r.basis === 'deterministic_checks' || r.basis === 'observed_steps');
}
function workerStatesRead(r: Record<string, unknown>): boolean {
  return (r.role === 'research' || r.role === 'verify') && str(r.phase) && workerPhases.has(r.phase) &&
    (r.outcome === null || str(r.outcome) && workerOutcomes.has(r.outcome)) && str(r.parentDisposition) && workerDispositions.has(r.parentDisposition);
}
function workerOptionalFieldsRead(r: Record<string, unknown>): boolean {
  return (r.taskCaption === undefined || str(r.taskCaption) && Boolean(r.taskCaption.trim()) && r.taskCaption.length <= 200) &&
    (r.parentState === undefined || ['running', 'paused', 'awaiting_approval', 'finished', 'cancelled', 'failed', 'stale'].includes(String(r.parentState)));
}
/** Strict known-field projection; raw objectives, peer bodies and errors never
 * become labels, even when supplied beside an otherwise valid event. */
export function readWorkerSnapshot(raw: unknown): WorkerSnapshot | null {
  const r = objectOf(raw); if (!r || !workerIdentityReads(r) || !workerProgressReads(r)) return null;
  if (!workerStatesRead(r)) return null;
  if (!workerOptionalFieldsRead(r)) return null;
  const receipt = readWorkerReceipt(r.receipt), estimate = r.estimate === null ? null : readWorkerEstimate(r.estimate);
  if (!receipt || r.estimate !== null && !estimate) return null;
  return { parent: String(r.parent), worker: String(r.worker), revision: Number(r.revision), parentStep: String(r.parentStep), task: r.task as string | null,
    role: r.role as WorkerSnapshot['role'], workKind: r.role === 'verify' ? 'verification' : 'research', label: workerLabel(r.role as WorkerSnapshot['role']), phase: r.phase as WorkerPhase,
    outcome: r.outcome as WorkerOutcome | null, completed: r.completed as number | null, total: r.total as number | null,
    basis: r.basis as WorkerSnapshot['basis'], parentDisposition: r.parentDisposition as WorkerDisposition, estimate, receipt,
    ...(str(r.taskCaption) ? { taskCaption: r.taskCaption } : {}),
    ...(r.parentState ? { parentState: r.parentState as WorkerSnapshot['parentState'] } : {}) };
}
function readTeamMonitor(raw: unknown): ProjectTeamMonitor | null {
  const r = objectOf(raw), work = objectOf(r?.work), gates = objectOf(r?.gates);
  if (!r || !work || !gates || !['current', 'stale', 'unavailable'].includes(String(r.state)) ||
    r.snapshotRevisionId !== null && !positive(r.snapshotRevisionId) || !teamWorkReads(work)) return null;
  if (![gates.source, gates.document, gates.filing].every(v => str(v) && teamGates.has(v)) || !Array.isArray(r.blockers) || r.blockers.length > 40 ||
    !r.blockers.every(v => str(v) && /^[A-Z][A-Z0-9_]{0,79}$/.test(v))) return null;
  return { state: r.state as ProjectTeamMonitor['state'], snapshotRevisionId: r.snapshotRevisionId as number | null,
    work: { total: Number(work.total), completed: Number(work.completed), percentage: work.percentage as number | null },
    gates: gates as unknown as ProjectTeamMonitor['gates'], blockers: r.blockers };
}
function teamWorkReads(work: Record<string, unknown>): boolean {
  if (!integer(work.total) || !integer(work.completed) || work.completed > work.total) return false;
  if (work.percentage === null) return true;
  return work.total > 0 && typeof work.percentage === 'number' && Number.isFinite(work.percentage) &&
    Math.abs(work.percentage - work.completed * 100 / work.total) <= 0.5000001;
}
function projectTeamHeaderReads(r: Record<string, unknown>): boolean {
  return positive(r.organizationId) && positive(r.projectId) && opaque(r.projectRef) && isoTime(r.asOf) &&
    (r.cursor === null || opaque(r.cursor)) && typeof r.complete === 'boolean' && Array.isArray(r.workers) && r.workers.length <= 128;
}
export function readProjectTeamSnapshot(raw: unknown): ProjectTeamSnapshot | null {
  const r = objectOf(raw); if (!r || !projectTeamHeaderReads(r) || !Array.isArray(r.workers)) return null;
  const workers = r.workers.map(readWorkerSnapshot); if (workers.some(v => v === null)) return null;
  const goal = r.goal === null ? null : readTeamGoal(r.goal), monitor = r.projectMonitor === undefined ? undefined : readTeamMonitor(r.projectMonitor);
  if (r.goal !== null && !goal || monitor === null) return null;
  return { organizationId: Number(r.organizationId), projectId: Number(r.projectId), projectRef: String(r.projectRef), asOf: String(r.asOf), cursor: r.cursor as string | null,
    complete: r.complete as boolean, goal,
    workers: workers.filter((v): v is WorkerSnapshot => v !== null), ...(monitor ? { projectMonitor: monitor } : {}) };
}
function readTeamGoal(raw: unknown): ProjectTeamGoal | null {
  const r = objectOf(raw); if (!r || !opaque(r.alias) || r.label !== 'Project objective' || !positive(r.version)) return null;
  const base: ProjectTeamGoal = { alias: r.alias, label: 'Project objective', version: r.version };
  if (r.summary === undefined && r.source === undefined && r.truncated === undefined) return base;
  const source = readObjectiveSource(r.source, r.version);
  if (!str(r.summary) || r.summary.length > 600 || typeof r.truncated !== 'boolean' || !source) return null;
  return { ...base, summary: r.summary, truncated: r.truncated, source };
}
function readObjectiveSource(raw: unknown, version: number): ProjectTeamGoal['source'] | null {
  const s = objectOf(raw);
  if (!s || !positive(s.charterId) || s.sectionKey !== 'objectives' || s.version !== version || !hash(s.contentHash) || !str(s.status) ||
    !/^[a-z][a-z0-9_-]{0,39}$/i.test(s.status) || typeof s.locked !== 'boolean') return null;
  return { charterId: s.charterId, sectionKey: 'objectives', version, contentHash: s.contentHash, status: s.status, locked: s.locked };
}

/**
 * One event from a `timeline` frame or a Summary payload, or null when it is
 * not one. A field it cannot read is left out; an event with a kind it does
 * not know, or without what that kind needs, is dropped whole.
 */
export function readTimelineEvent(raw: unknown): TimelineEvent | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, any>;
  if (typeof r.seq !== 'number' || !str(r.at) || typeof r.round !== 'number') return null;
  const base: EventBase = { seq: r.seq, at: r.at, round: r.round };
  return readEventKind(r, base);
}
function readEventKind(r: Record<string, any>, base: EventBase): TimelineEvent | null {
  switch (r.kind) {
    case 'note':
      return str(r.text) && r.text.trim() ? { ...base, kind: 'note', text: r.text } : null;
    case 'step':
      return readStep(r, base);
    case 'task':
      return readTask(r, base);
    case 'worker': {
      const worker = readWorkerSnapshot(r); return worker ? { ...base, kind: 'worker', ...worker } : null;
    }
    case 'end':
      return OUTCOMES.has(r.outcome)
        ? { ...base, kind: 'end', outcome: r.outcome, stoppedReason: str(r.stoppedReason) ? r.stoppedReason : null }
        : null;
    default:
      return null;
  }
}

/** Events in seq order, each seq once (a frame seen twice is one event). */
export function sortTimeline(events: readonly TimelineEvent[]): TimelineEvent[] {
  const bySeq = new Map<number, TimelineEvent>();
  for (const e of events) bySeq.set(e.seq, e);
  return [...bySeq.values()].sort((a, b) => a.seq - b.seq);
}

/* ── Ordering with the controls ─────────────────────────────────────────────── */

export type TimelineItem = { kind: 'event'; event: TimelineEvent } | { kind: 'control'; control: TimelineControl };

/**
 * The events and the person's controls in one order, by time. Ties keep the
 * recorder's order first. A control accepted on another instance can sit one
 * row off by clock skew (design §6, risks).
 */
export function orderTimeline(events: readonly TimelineEvent[], controls: readonly TimelineControl[] | null | undefined): TimelineItem[] {
  const items: Array<TimelineItem & { t: number; i: number }> = [];
  sortTimeline(events).forEach((event, i) => items.push({ kind: 'event', event, t: Date.parse(event.at), i }));
  (controls ?? []).forEach((control, i) => items.push({ kind: 'control', control, t: Date.parse(control.at), i: 1e9 + i }));
  return items
    .sort((a, b) => (a.t === b.t || Number.isNaN(a.t) || Number.isNaN(b.t) ? a.i - b.i : a.t - b.t))
    .map(({ t: _t, i: _i, ...item }) => item as TimelineItem);
}

/* ── One step, from its events ──────────────────────────────────────────────── */

/** A step as its latest event left it. */
export interface StepState {
  step: string;
  first: StepEvent;
  last: StepEvent;
  /** Its finished event, when it has one. */
  finished: StepEvent | null;
}

/** Each step's state, in the order the steps first appeared. */
export function stepStates(events: readonly TimelineEvent[]): StepState[] {
  const states = new Map<string, StepState>();
  for (const e of sortTimeline(events)) {
    if (e.kind !== 'step') continue;
    const s = states.get(e.step);
    if (!s) states.set(e.step, { step: e.step, first: e, last: e, finished: e.phase === 'finished' ? e : null });
    else {
      s.last = e;
      if (e.phase === 'finished') s.finished = e;
    }
  }
  return [...states.values()];
}

/**
 * The steps a person did not authorise and that did not run — "{n} step(s)
 * were not authorised and did not run." (AnA detach §2.7): held back, but not
 * for a read-only answer the person asked for. The one rule for the closing
 * row (client) and a detached turn's notice (server).
 */
export function notAuthorisedStep(f: { heldBack?: boolean; readOnly?: boolean } | null | undefined): boolean {
  return f?.heldBack === true && f.readOnly !== true;
}

/** A step that did not do its work: it failed, was held back, or never finished. */
export function stepDidNotComplete(s: StepState): boolean {
  return !s.finished || s.finished.status !== 'success' || s.finished.heldBack === true;
}

/* ── The header line ────────────────────────────────────────────────────────── */

/** Sources that are not somewhere AnA looked: her plan, an engine, the screen she drives. */
const NOT_A_SOURCE: ReadonlySet<SourceKey> = new Set<SourceKey>(['plan', 'engine', 'screen']);

/** "6m 12s", "57s", "1h 05m" — one format for every elapsed time AnA's work shows. */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`;
  return `${s}s`;
}

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * The Summary's one header line, every number from the server's events:
 * "18 steps · 4 sources · 1 did not complete · 6m 12s". Plan updates are
 * task rows, not steps; the plan, an engine and the screen are not sources.
 * The duration runs from the first event to the end event (or the latest,
 * while the turn runs). Notes are never counted.
 */
export function timelineHeader(events: readonly TimelineEvent[]): string {
  const sorted = sortTimeline(events);
  const steps = stepStates(sorted).filter((s) => s.first.source !== 'plan');
  const sources = new Set(steps.map((s) => s.last.source).filter((src) => !NOT_A_SOURCE.has(src)));
  const incomplete = steps.filter(stepDidNotComplete).length;
  const parts = [count(steps.length, 'step', 'steps')];
  if (sources.size > 0) parts.push(count(sources.size, 'source', 'sources'));
  if (incomplete > 0) parts.push(`${incomplete} did not complete`);
  const first = sorted[0];
  const last = sorted.find((e) => e.kind === 'end') ?? sorted[sorted.length - 1];
  if (first && last && last !== first) {
    const ms = Date.parse(last.at) - Date.parse(first.at);
    if (Number.isFinite(ms) && ms >= 0) parts.push(formatElapsed(ms));
  }
  return parts.join(' · ');
}

/* ── What a /4 record keeps of a step ───────────────────────────────────────── */

/**
 * What a `/4` turn record adds to a step (server: turn-record.ts RecordedStep):
 * its link to its timeline events and how it ended. Absent on a step recorded
 * before the timeline, and each field only when the stream reported it.
 */
export interface StepRecordLink {
  /** The model's id for the call: how the step joins what the model was sent. */
  toolUseId?: string;
  /** The step's handle on the timeline ("s7"). */
  handle?: string;
  /** Handler dispatch, ISO; any wait for a person came before it. */
  startedAt?: string;
  endedAt?: string;
  /** A person's no, no answer, or an act only a person may take. */
  heldBack?: boolean;
  /** The status sentence the person was shown (stepMessage); absent for a step that succeeded. */
  message?: string;
  /** The step's generation capture saw a model call; null when unknown. */
  usedModel?: boolean | null;
  /** The task the step served (S5), as its timeline events say; null for none. */
  taskId?: string | null;
}

/** What the timeline emitter reports when a step ends (the tool-use id is the stream's own). */
export type StepRecordTimes = Omit<StepRecordLink, 'toolUseId'>;

const LINK_FIELDS = ['toolUseId', 'handle', 'startedAt', 'endedAt', 'heldBack', 'message', 'usedModel', 'taskId'] as const;

/** Only the link fields a step reported: nothing is written as unknown-by-default. */
export function stepRecordLink(s: StepRecordLink): StepRecordLink {
  const out: Record<string, unknown> = {};
  for (const k of LINK_FIELDS) if (s[k] !== undefined) out[k] = s[k];
  return out as StepRecordLink;
}

/** Why the turn stopped, as its end event says; null when it has none or was not stopped. */
export function endReasonOf(events: ReadonlyArray<{ kind: string; stoppedReason?: string | null }>): string | null {
  const end = events.find((e) => e.kind === 'end');
  return end?.stoppedReason ?? null;
}
