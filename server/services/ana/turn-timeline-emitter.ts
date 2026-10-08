/**
 * The one producer of a turn's Summary timeline (ANA-SUMMARY S4,
 * docs/design/ANA_AGENT_WORK_VIEW_2026-10-08.md §2.1, §2.4, §4 "update_plan").
 *
 * `emitTimeline(event)` does three things and only these: it appends the event
 * to the turn's recorder, enqueues it to the run's live mirror
 * (public.ana_run_events, run-events.ts; AnA detach DT1), and writes it to the
 * client as a `timeline` frame. So the live Summary, the mirror a second device
 * reads, and the record's sealed `/4` timeline are the same events (S4 test 1;
 * DT1 test 1). The mirror's truncation marker is the mirror's own (run-events.ts
 * caps at 1,999): nothing here emits it, so the frames and the record never
 * carry one. The stream calls the methods below at the points
 * where each fact becomes known; the presentation (labels, sources, previews,
 * facts, the status sentence) is step-presentation.ts's, never this module's.
 *
 *   note       AnA's words from a model call that also called tools: held
 *              until the first step event that follows, so a note always
 *              precedes its round's steps, and a call whose tools never ran
 *              leaves none. The text is the call's own prose, never the
 *              "(Ran: …)" staging and never reasoning (§2.4).
 *   step       announced → awaiting_approval → finished, under a per-turn
 *              handle ("s1"), never the tool-use id. `startedAt` is handler
 *              dispatch, so `ms` excludes the wait for a person. `task` (S5)
 *              is the one task in progress when the step first appears —
 *              before its round dispatches, so a plan change in the same
 *              round, whose result lands after dispatch, does not move it.
 *   task       each change between successive validated plans, with the
 *              server's task id (shared/ana/plan-diff.ts).
 *   end        the turn's outcome and why it stopped.
 *
 * The recorder is in memory and takes events until it seals, whatever the
 * run's status, so the steps a cancel stopped are kept (§2.2, S4 test 8).
 *
 * @module server/services/ana/turn-timeline-emitter
 */

import type { StepFact, StepSource } from '@shared/ana/step-verbs';
import type { StepEvent, StepRecordTimes as RecordedStepTimes, StepStatus, TimelineEvent, TurnEndOutcome } from '@shared/ana/turn-timeline';
import { TaskIds, taskChanges, type PlanStep } from '@shared/ana/plan-diff';
import type { GatewayServerToolUse } from '../ai-gateway/types.js';
import { presentStep, stepMessage } from './step-presentation.js';
import { serverToolStepFields } from './server-tool-steps.js';
import type { RunEventsMirror } from './run-events.js';
import type { TurnRecorder } from './turn-record.js';
import { UPDATE_PLAN_TOOL_NAME } from './turn-plan.js';

type WithoutStamp<T> = T extends unknown ? Omit<T, 'seq' | 'at'> : never;
/** An event before the emitter numbers and times it. */
export type TimelineEventInput = WithoutStamp<TimelineEvent>;

interface TimelineSink {
  /** Writes one SSE frame to the client; never throws for a closed socket. */
  write: (frame: string) => void;
  /** The turn's recorder, once it is open; null for a turn that has none. */
  recorder: () => TurnRecorder | null | undefined;
  /** The run's live mirror, once the run is open; null for a turn with no durable run. */
  mirror?: () => Pick<RunEventsMirror, 'enqueue'> | null | undefined;
}

interface StepCall {
  id: string;
  name: string;
  input?: unknown;
}

/** What a row shows of a step, from presentStep. */
interface Shown {
  label: string;
  source: StepSource;
  preview: string | null;
}

/** How a step ended, as the stream measured it. */
export interface FinishedStep extends Shown {
  status: StepStatus;
  heldBack: boolean;
  facts?: StepFact[];
  message?: string;
  usedModel?: boolean | null;
  /** Handler dispatch to result, ms. */
  ms: number;
  /** Handler dispatch, epoch ms. */
  startedAt: number;
}

const iso = (ms: number) => new Date(ms).toISOString();

export class TurnTimeline {
  private seq = 0;
  private lastRound = 0;
  private readonly handles = new Map<string, string>();
  /** Each step's task, fixed when the step first appears (S5). */
  private readonly taskOf = new Map<string, string | null>();
  private readonly shown = new Map<string, Shown>();
  private pendingNote = '';
  private plan: PlanStep[] = [];
  private readonly tasks = new TaskIds();

  constructor(private readonly sink: TimelineSink) {}

  /** Number and time one event, append it to the recorder, write it to the client. */
  emitTimeline(input: TimelineEventInput): TimelineEvent {
    this.seq += 1;
    this.lastRound = Math.max(this.lastRound, input.round);
    // Date.now, not new Date(): one clock for `at`, `startedAt` and `ms`.
    const event = { seq: this.seq, at: iso(Date.now()), ...input } as TimelineEvent;
    this.sink.recorder()?.addEvent(event);
    this.sink.mirror?.()?.enqueue(event);
    this.sink.write(`data: ${JSON.stringify({ type: 'timeline', event })}\n\n`);
    return event;
  }

  /**
   * The prose of a model call that returned tool calls. Kept as the call wrote
   * it (the record then shares the blob of the round's input); emitted before
   * the next step event. A call with no prose leaves no note.
   */
  noteFrom(text: string): void {
    this.pendingNote = text && text.trim() ? text : '';
  }

  /** A model call returned: its prose is a note only when the call also called tools. */
  noteFromCall(text: string, response: unknown): void {
    const uses = (response as { toolUses?: unknown[] } | null)?.toolUses;
    if (Array.isArray(uses) && uses.length > 0) this.noteFrom(text);
  }

  /** The step's per-turn handle: "s1", "s2", … in the order steps first appear. */
  handleFor(toolUseId: string): string {
    let h = this.handles.get(toolUseId);
    if (!h) {
      h = `s${this.handles.size + 1}`;
      this.handles.set(toolUseId, h);
    }
    return h;
  }

  private step(round: number, call: StepCall, fields: Omit<StepEvent, 'seq' | 'at' | 'kind' | 'round' | 'step' | 'task'>): StepEvent {
    if (this.pendingNote) {
      const text = this.pendingNote;
      this.pendingNote = '';
      this.emitTimeline({ kind: 'note', round, text });
    }
    const step = this.handleFor(call.id);
    if (!this.taskOf.has(step)) this.taskOf.set(step, this.taskInProgress(call.name));
    return this.emitTimeline({ kind: 'step', round, step, task: this.taskOf.get(step) ?? null, ...fields }) as StepEvent;
  }

  /**
   * The task a step dispatched now serves (S5, design §2.1): the one task in
   * progress. With none, or with several, the step cannot be said to serve
   * one, so it serves none. A plan update is bookkeeping about the tasks, not
   * work on one, so it never does.
   */
  private taskInProgress(tool: string): string | null {
    if (tool === UPDATE_PLAN_TOOL_NAME) return null;
    const open = this.plan.filter((s) => s.status === 'in_progress');
    return open.length === 1 ? this.tasks.idFor(open[0].title) : null;
  }

  /** A step the round is about to run, as its `tool_use` frame shows it. */
  announced(round: number, call: StepCall, shown: Shown): void {
    const s = { label: shown.label, source: shown.source, preview: shown.preview };
    this.shown.set(this.handleFor(call.id), s);
    this.step(round, call, { phase: 'announced', ...s });
  }

  /** A step put to a person, waiting on their decision. */
  awaiting(round: number, call: StepCall): void {
    const s = this.shown.get(this.handleFor(call.id)) ?? doingOf(call);
    this.step(round, call, { phase: 'awaiting_approval', ...s });
  }

  /** A step that ended; returns what its record adds (/4). */
  finished(round: number, call: StepCall, f: FinishedStep): RecordedStepTimes {
    const e = this.step(round, call, {
      phase: 'finished',
      label: f.label,
      source: f.source,
      preview: f.preview,
      status: f.status,
      heldBack: f.heldBack,
      ...(f.message ? { message: f.message } : {}),
      usedModel: f.usedModel ?? null,
      ms: f.ms,
      facts: f.facts ?? [],
    });
    return {
      handle: e.step,
      taskId: e.task,
      startedAt: iso(f.startedAt),
      endedAt: e.at,
      heldBack: f.heldBack,
      ...(f.message ? { message: f.message } : {}),
      usedModel: f.usedModel ?? null,
    };
  }

  /** A step she chose that the turn stopped before it ran (a Manual hold, a stop). */
  notRun(round: number, call: StepCall, why: string | undefined): RecordedStepTimes {
    const p = presentStep(call.name, call.input ?? {});
    const message = stepMessage('not_run', false, why, p.doing) ?? undefined;
    const e = this.step(round, call, {
      phase: 'finished',
      label: p.label,
      source: p.source,
      preview: p.preview,
      status: 'not_run',
      heldBack: false,
      ...(message ? { message } : {}),
      usedModel: false,
      facts: p.facts,
    });
    return { handle: e.step, taskId: e.task, endedAt: e.at, heldBack: false, ...(message ? { message } : {}), usedModel: false };
  }

  /** A step a model provider ran inside its own call (web search, web fetch): over when it is reported. */
  serverStep(round: number, step: GatewayServerToolUse, index: number): void {
    const shown = serverToolStepFields(step);
    const call = { id: typeof step.id === 'string' && step.id ? step.id : `server:${round}:${index}`, name: step.name };
    this.announced(round, call, shown.announced);
    this.step(round, call, {
      phase: 'finished',
      ...shown.finished,
      status: step.isError ? 'error' : 'success',
      heldBack: false,
    });
  }

  /** A plan update_plan validated: one task event per change, with the task's id. */
  planned(round: number, steps: PlanStep[]): void {
    for (const c of taskChanges(this.plan, steps, this.tasks)) {
      this.emitTimeline({ kind: 'task', round, task: c.task, change: c.change, title: c.title });
    }
    this.plan = steps.map((s) => ({ ...s }));
  }

  /** The turn's end, and why it stopped (null when it was not stopped). */
  end(outcome: TurnEndOutcome, stoppedReason: string | null): void {
    // A note whose call's tools never ran is not one: its steps are not here.
    this.pendingNote = '';
    // The record's `stoppedReason` is this event's (turn-record.ts seal).
    this.emitTimeline({ kind: 'end', round: this.lastRound, outcome, stoppedReason });
  }
}

/** A step's doing form, for one awaited before it was announced (never, in the stream; kept total). */
function doingOf(call: StepCall): Shown {
  const p = presentStep(call.name, call.input ?? {});
  return { label: p.doing, source: p.source, preview: p.preview };
}
