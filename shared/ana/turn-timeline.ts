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
export type StepStatus = 'success' | 'error' | 'not_found' | 'cancelled' | 'not_run';
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

export type TimelineEvent = NoteEvent | StepEvent | TaskEvent | EndEvent;

/** A text by its hash and length, as the record holds every text. */
export interface TimelineTextRef {
  sha256: string;
  chars: number;
}

/** The sealed form: a note's text is a reference to its blob, shared with the round's prose. */
export type SealedNoteEvent = Omit<NoteEvent, 'text'> & { text: TimelineTextRef };
export type SealedTimelineEvent = SealedNoteEvent | StepEvent | TaskEvent | EndEvent;

/** A person's control as the Summary shows it: never who took it. */
export interface TimelineControl {
  action: string;
  round: number;
  at: string;
  message?: string;
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

const STATUSES: ReadonlySet<string> = new Set<StepStatus>(['success', 'error', 'not_found', 'cancelled', 'not_run']);
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
  switch (r.kind) {
    case 'note':
      return str(r.text) && r.text.trim() ? { ...base, kind: 'note', text: r.text } : null;
    case 'step':
      return readStep(r, base);
    case 'task':
      return readTask(r, base);
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
