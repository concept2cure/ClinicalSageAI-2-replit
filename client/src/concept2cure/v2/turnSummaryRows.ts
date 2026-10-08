/**
 * The rows of a turn's work — the inline record under each answer and the
 * Summary — built in one place (ANA-SUMMARY S4,
 * docs/design/ANA_AGENT_WORK_VIEW_2026-10-08.md §2.6, §2.7, §3.3).
 *
 * Two inputs, one set of rules:
 *   - a turn's timeline events (live `timeline` frames, or a record's sealed
 *     timeline read back through /summary): every kind — AnA's notes, each
 *     step once under its handle, task changes, the person's controls by time,
 *     and the closing row;
 *   - for a turn without events (a record from before /4, or no record), its
 *     tool trace: labelled step rows, with no duration claimed.
 * `orderedItems` keeps the inline record's short form: no notes, and no
 * Started or Completed rows (`mode: 'record'`). The Summary takes every kind.
 *
 * Every sentence a row shows is the server's (stepMessage, rendered word for
 * word) or one of this module's fixed words for what the server sent; no row
 * counts a note, and the counts in the header are timelineHeader's.
 *
 * Pure: no React, no I/O.
 *
 * @module client/src/concept2cure/v2/turnSummaryRows
 */

import type { AnaChatMessage, AnaToolCall } from '../components/ana/useAnaChat';
import type { AnaPlanChange, AnaPlanStep } from '../components/ana/useAnaChat.types';
import { PLAN_TOOL } from '../components/ana/anaProgress';
import { STEP_SOURCES, formatStepDuration, unknownStepLabel, type StepFact, type StepSource } from '@shared/ana/step-verbs';
import {
  orderTimeline,
  stepStates,
  type StepState,
  type TaskEvent,
  type TimelineControl,
  type TimelineEvent,
} from '@shared/ana/turn-timeline';
import { isContinuable, stopLineText } from './anaWorkModel';

/* ── The inline record's items (moved from AnaActivity) ─────────────────────── */

/** The inline record's items: steps, her first plan, and the steps she added. */
export type RecordItem =
  | { kind: 'tool'; t: number; seq: number; call: AnaToolCall }
  | { kind: 'plan'; t: number; seq: number; steps: string[]; persisted?: boolean }
  | { kind: 'added'; t: number; seq: number; title: string };

/** The Summary's items: the record's, and every other change to the plan. */
export type Item = RecordItem | { kind: 'task'; t: number; seq: number; change: 'started' | 'completed' | 'removed'; title: string };

function toolItems(calls: AnaToolCall[], seq: { n: number }): Item[] {
  const items: Item[] = [];
  let lastT = Number.NEGATIVE_INFINITY;
  for (const c of calls) {
    if (c.name === PLAN_TOOL && c.status !== 'error' && c.status !== 'unconfirmed') continue;
    lastT = typeof c.startedAt === 'number' ? c.startedAt : lastT;
    items.push({ kind: 'tool', t: lastT, seq: seq.n++, call: c });
  }
  return items;
}

/**
 * Tool rows and plan rows in the order they happened. The first plan she
 * declared is one row ("Planned 5 steps"), not five; a step added later is
 * its own row. In the inline record ('record') starts and completions are not
 * rows — the panel's rail carries them — so the record stays the work, not
 * bookkeeping; the Summary ('summary') shows them. The plan tool's own call
 * is shown as the plan it recorded; a FAILED plan call stays a failed row,
 * because a failure is never folded away.
 */
export function orderedItems<M extends 'record' | 'summary' = 'record'>(
  calls: AnaToolCall[],
  changes: AnaPlanChange[],
  plan: AnaPlanStep[],
  mode?: M,
): M extends 'summary' ? Item[] : RecordItem[] {
  const seq = { n: 0 };
  const items: Item[] = toolItems(calls, seq);
  const initial = changes.filter((c) => c.initial && c.kind === 'added');
  if (initial.length > 0) {
    items.push({ kind: 'plan', t: initial[0].at, seq: seq.n++, steps: initial.map((c) => c.title) });
  } else if (changes.length === 0 && plan.length > 0) {
    // A reopened thread: the final plan, first, with no claim about when.
    items.push({ kind: 'plan', t: Number.NEGATIVE_INFINITY, seq: -1, steps: plan.map((s) => s.title), persisted: true });
  }
  for (const c of changes) {
    if (c.kind === 'added' && !c.initial) items.push({ kind: 'added', t: c.at, seq: seq.n++, title: c.title });
    else if (mode === 'summary' && c.kind !== 'added') items.push({ kind: 'task', t: c.at, seq: seq.n++, change: c.kind, title: c.title });
  }
  // The record's mode never adds a 'task' item, so its list is RecordItem[].
  return items.sort((a, b) => (a.t === b.t ? a.seq - b.seq : a.t - b.t)) as M extends 'summary' ? Item[] : RecordItem[];
}

/* ── The Summary's rows ─────────────────────────────────────────────────────── */

/** A row's status, in the four the transcript's rows already draw. */
export type RowStatus = AnaToolCall['status'];

export interface StepRow {
  kind: 'step';
  key: string;
  status: RowStatus;
  label: string;
  source: StepSource;
  /** Line two: the source's name, always, then the preview ("Vault · shelf life"). */
  sub: string;
  /** How long it took, or what it is waiting on. */
  trailing?: string;
  /** The server's sentence (stepMessage), word for word, never folded away. */
  message?: string;
  facts: StepFact[];
  /** The step's capture saw no model, and the register calls it an engine. */
  engine: boolean;
}

export type SummaryRow =
  | { kind: 'note'; key: string; text: string }
  | StepRow
  | { kind: 'task'; key: string; verb: string; title: string; list: AnaPlanStep[] }
  | { kind: 'control'; key: string; text: string; message?: string }
  | { kind: 'end'; key: string; text: string; reason: string | null; continuable: boolean }
  | { kind: 'working'; key: string };

/** Said of a step a sealed timeline announced and never finished (§2.6). */
export const NEVER_FINISHED = 'Did not finish. No result was recorded.';

const sourceName = (source: StepSource): string => STEP_SOURCES[source] ?? STEP_SOURCES.project;
const subLine = (source: StepSource, preview: string | null | undefined) =>
  preview ? `${sourceName(source)} · ${preview}` : sourceName(source);

function stepRowStatus(s: StepState, live: boolean): RowStatus {
  const f = s.finished;
  if (!f) return live ? 'running' : 'unconfirmed';
  return f.status === 'success' && !f.heldBack ? 'success' : 'error';
}

function stepTrailing(s: StepState, status: RowStatus): string | undefined {
  if (s.finished) return typeof s.finished.ms === 'number' && status === 'success' ? formatStepDuration(s.finished.ms) : undefined;
  return s.last.phase === 'awaiting_approval' ? 'waiting for approval' : status === 'running' ? 'running' : undefined;
}

export function stepRow(s: StepState, live: boolean): StepRow {
  const shown = s.finished ?? s.last;
  const status = stepRowStatus(s, live);
  const message = s.finished?.message ?? (status === 'unconfirmed' ? NEVER_FINISHED : undefined);
  return {
    kind: 'step',
    key: `s-${s.step}`,
    status,
    label: shown.label,
    source: shown.source,
    sub: subLine(shown.source, shown.preview),
    trailing: stepTrailing(s, status),
    ...(message ? { message } : {}),
    facts: s.finished?.facts ?? [],
    engine: shown.source === 'engine' && s.finished?.usedModel === false && status === 'success',
  };
}

const TASK_VERBS: Record<TaskEvent['change'], string> = {
  added: 'Added task',
  started: 'Started',
  completed: 'Completed',
  removed: 'Removed task',
};

/** The plan as it stood once this task event and every one before it had landed. */
function planAt(events: readonly TimelineEvent[], seq: number): AnaPlanStep[] {
  const list: AnaPlanStep[] = [];
  for (const e of events) {
    if (e.kind !== 'task' || e.seq > seq) continue;
    const i = list.findIndex((t) => t.title.toLowerCase() === e.title.toLowerCase());
    if (e.change === 'removed') {
      if (i >= 0) list.splice(i, 1);
      continue;
    }
    const status = e.change === 'started' ? 'in_progress' : e.change === 'completed' ? 'completed' : 'pending';
    if (i >= 0) list[i] = { ...list[i], status: e.change === 'added' ? list[i].status : status };
    else list.push({ title: e.title, status });
  }
  return list;
}

const CONTROL_WORDS: Record<string, string> = {
  pause: 'You paused AnA',
  resume: 'You resumed AnA',
  interject: 'You steered AnA',
  cancel: 'You stopped the run',
  approve: 'You approved an action',
  deny: 'You declined an action',
};

/** The closing row's words for how the turn ended. */
export function endText(outcome: string, reason: string | null): string {
  if (outcome === 'failed') return 'Did not finish: the turn ended with an error.';
  const line = stopLineText(reason);
  if (line) return line;
  if (outcome === 'stopped' || reason === 'cancelled') return 'Stopped.';
  return 'Answered.';
}

export interface SummaryRowOptions {
  /** The turn is still running here: an unfinished step is running, and "Working…" closes the list. */
  live: boolean;
  /**
   * How this view saw the turn end when its events carry no end (the stream
   * dropped, or the person stopped it here). The record's end replaces it.
   */
  clientEnding?: { outcome: 'stopped' | 'failed'; reason: string | null } | null;
}

function endRow(outcome: string, reason: string | null, key: string): SummaryRow {
  return {
    kind: 'end',
    key,
    text: endText(outcome, reason),
    reason,
    continuable: Boolean(reason) && isContinuable(reason as never),
  };
}

function itemRow(item: ReturnType<typeof orderTimeline>[number], events: readonly TimelineEvent[], states: Map<string, StepState>, opts: SummaryRowOptions): SummaryRow | null {
  if (item.kind === 'control') {
    const c: TimelineControl = item.control;
    return { kind: 'control', key: `c-${c.at}-${c.action}`, text: CONTROL_WORDS[c.action] ?? 'You took a control', ...(c.message ? { message: c.message } : {}) };
  }
  const e = item.event;
  if (e.kind === 'note') return { kind: 'note', key: `n-${e.seq}`, text: e.text.trim() };
  if (e.kind === 'task') return { kind: 'task', key: `t-${e.seq}`, verb: TASK_VERBS[e.change], title: e.title, list: planAt(events, e.seq) };
  if (e.kind === 'end') return endRow(e.outcome, e.stoppedReason, `e-${e.seq}`);
  const s = states.get(e.step);
  // One row per step, where it first appeared. Her plan updates are the task
  // rows; a plan update that did not go through stays a row, never folded away.
  if (!s || s.first.seq !== e.seq) return null;
  const row = stepRow(s, opts.live);
  return row.source === 'plan' && row.status === 'success' ? null : row;
}

/** Every row of the Summary, from the turn's events and the person's controls, in order. */
export function summaryRows(
  events: readonly TimelineEvent[],
  controls: readonly TimelineControl[] | null | undefined,
  opts: SummaryRowOptions,
): SummaryRow[] {
  const states = new Map(stepStates(events).map((s) => [s.step, s]));
  const rows: SummaryRow[] = [];
  for (const item of orderTimeline(events, controls)) {
    const row = itemRow(item, events, states, opts);
    if (row) rows.push(row);
  }
  const ended = rows.some((r) => r.kind === 'end');
  if (!ended && opts.live) rows.push({ kind: 'working', key: 'working' });
  else if (!ended && opts.clientEnding) rows.push(endRow(opts.clientEnding.outcome, opts.clientEnding.reason, 'e-client'));
  return rows;
}

/** A traced step as a row: its label and source, never a duration (the trace keeps none). */
function traceStepRow(c: AnaToolCall, seq: number): StepRow {
  const source = c.source ?? 'project';
  const failed = c.status === 'error' || c.status === 'unconfirmed';
  return {
    kind: 'step',
    key: `tr-${seq}`,
    status: c.status,
    label: c.label || unknownStepLabel(c.status === 'success' ? 'done' : 'doing'),
    source,
    sub: subLine(source, c.preview),
    ...(failed ? { message: c.message || NEVER_FINISHED } : {}),
    facts: (c.facts ?? []).filter((f) => f.name !== 'Took'),
    engine: false,
  };
}

function traceItemRow(it: Item): SummaryRow {
  if (it.kind === 'tool') return traceStepRow(it.call, it.seq);
  if (it.kind === 'plan') {
    const n = it.steps.length;
    return {
      kind: 'task',
      key: `tp-${it.seq}`,
      verb: it.persisted ? 'Plan ·' : 'Planned',
      title: `${n} ${n === 1 ? 'task' : 'tasks'}`,
      list: it.steps.map((title) => ({ title, status: 'pending' })),
    };
  }
  return { kind: 'task', key: `ta-${it.seq}`, verb: it.kind === 'added' ? 'Added task' : TASK_VERBS[it.change], title: it.title, list: [] };
}

/** A turn without events: its trace, labelled, with no durations claimed (§2.7). */
export function traceRows(turn: Pick<AnaChatMessage, 'toolCalls' | 'planChanges' | 'plan'>): SummaryRow[] {
  return orderedItems(turn.toolCalls ?? [], turn.planChanges ?? [], turn.plan ?? [], 'summary').map(traceItemRow);
}

/* ── The footer ─────────────────────────────────────────────────────────────── */

export type FooterState = 'Recorded' | 'Record could not be verified' | 'Not recorded' | 'Recording…' | null;

/**
 * What the Summary's footer says about the turn's record (§2.7): "Recorded"
 * only when the record verified on this read; "Record could not be verified"
 * when it did not; "Recording…" while the turn runs, while the record is being
 * filed, or while the confirm waits ask for it; "Not recorded" once nothing
 * says it was filed. Null while the verified read is still on its way.
 */
export function footerState(
  turn: Pick<AnaChatMessage, 'streaming' | 'recordConfirming' | 'turnRecord'>,
  verdict: { ok: boolean } | null | undefined,
): FooterState {
  if (turn.turnRecord?.status === 'recorded') {
    if (verdict) return verdict.ok ? 'Recorded' : 'Record could not be verified';
    return turn.streaming ? 'Recording…' : null;
  }
  if (turn.streaming || turn.recordConfirming) return 'Recording…';
  return 'Not recorded';
}
