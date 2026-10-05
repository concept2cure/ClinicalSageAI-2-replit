/**
 * The run policy's part of one stream turn (row 74, slice S4): Manual's hold
 * before each further step, the round-boundary checkpoint it lives in, and the
 * stop directive Auto's ceilings are read through.
 *
 * ── Where the policy is read ─────────────────────────────────────────────────
 * The stream parses `run_policy` once and reads it in exactly five places: the
 * round budget (agentic-loop.ts resolveRoundBudget), the loop's stop directive
 * ({@link TurnPolicy.stopWhen}), the hold's expiry (Manual ends, never
 * resumes), the checkpoint ({@link TurnPolicy.checkpoint}), and the turn's
 * ending (done frame, metadata, record). It is NOT read by the approval gate:
 * the gate decides whether a step that changes a record may run, and that is a
 * person's decision whatever the policy (auto-never-approves.test.ts). The
 * approvals' outcome reaches this module only afterwards, from outside the
 * gate ({@link TurnPolicy.noteApprovals}).
 *
 * ── Manual ───────────────────────────────────────────────────────────────────
 * Before every further step that would run without a person, AnA stops, says
 * what the step is, and waits: "Run this step" resumes the run (the person's
 * own control, recorded as theirs), "Do this instead" is a steer that REPLACES
 * the step (the loop's 'replan': the step never runs and the model is told
 * so), and Stop cancels. Her own stop is not a control — nobody pressed Pause —
 * so it is kept as a policy hold, which the lineage dossier shows beside the
 * person's resume. A hold nobody answers ends the turn (the hold's 'end'
 * expiry), with the steps it did not run named. Manual that cannot hold (no
 * run row, or no owner who could resume it) stops where it would have asked,
 * with a warning: it never runs on as if it were Auto.
 *
 * Every way a held step does not run is written down — replaced, expired,
 * stopped, or the page gone — as a not-run step and a policy hold. A steer
 * that was already waiting when the step came up replaces it too, but that is
 * NOT a hold (nothing paused, no Next was shown): it is filed as `superseded`,
 * and nothing says she stopped.
 *
 * ── Only a person's answer runs a held step ─────────────────────────────────
 * The hold returns 'running' for a run that left 'paused' any way that is not
 * a cancel — resumed, but also reaped as an orphan ('failed'), ended, or gone
 * (run-hold.ts leave, as the stream's loop always did). Under Manual that is
 * not an answer: the held step runs only when the row reads 'running' (or
 * 'paused' again, after Run this step) once the hold is over, which only a
 * person's resume or steer writes. Anything else fails closed. And a hold she
 * could not write stands only on a person's own pause already in place — shown
 * to them as hers, with Next — never on a row that is not live.
 *
 * The checkpoint without a policy, and under Auto, is the stream's checkpoint
 * as it was: hold while a person paused, splice queued steers, abort on
 * cancel — in the same order, with the same frames.
 *
 * @module server/services/ana/turn-run-policy
 */

import type { LoopCheckpoint, LoopStopDirective, StoppedReason, ToolCall } from './agentic-loop.js';
import type { RunHold, RunHoldAnnounce, RunHoldOutcome } from './run-hold.js';
import {
  manualHoldDue,
  policyStopDirective,
  turnStoppedReason,
  type AnaRunPolicy,
  type PolicyHold,
  type RunStatus,
  type TurnStoppedReason,
} from './run-status.js';
import { MANUAL_UNAVAILABLE_TEXT, PAUSE_WORDS } from '@shared/ana/run-policy';

/** Why each kind of unrun step did not run, as the turn record files it. */
const NOT_RUN = {
  redirected: 'redirected by the person before it ran',
  superseded: 'replaced by a steer the person sent while AnA was working, before the step was shown; it was not run.',
  expiredHold: `AnA waited ${PAUSE_WORDS} for the person before this step and nobody answered, so it was not run.`,
  expiredPause: `The run was paused and nobody resumed it within ${PAUSE_WORDS}, so this step was not run.`,
  unavailable: 'Manual could not hold this turn, so AnA stopped before this step; it was not run.',
  stopped: 'The run was stopped while AnA waited for the person before this step, so it was not run.',
  disconnected: 'The page was closed while AnA waited for the person before this step, so it was not run.',
} as const;

/** What the row reads after a hold when a person answered it: their resume or steer ('paused': and paused again). */
const ANSWERED: ReadonlySet<RunStatus | null> = new Set<RunStatus | null>(['running', 'paused']);

/** The turn's run row, as the checkpoint uses it. Absent when the turn has none. */
export interface TurnPolicyRun {
  hold: RunHold;
  /** The run's cancel signal has fired (a person's Stop, or a dropped client). */
  cancelled(): boolean;
  heartbeat(round: number): void;
  /** Drain the run's queue into the next model turn; returns the steers among it, by text. */
  drainSteers(): Promise<string[]>;
  /** running → paused for the policy, with no control event (run-control.ts holdForPerson). */
  holdForPerson(): Promise<boolean>;
  /** The run's status as the ROW has it now (null when the row is gone). */
  status(): Promise<RunStatus | null>;
}

/** What the checkpoint needs from the turn it runs in. */
export interface TurnPolicyWiring {
  run: TurnPolicyRun | null;
  /**
   * A demonstration the PERSON started is driving the screens: Manual does not
   * hold. Read as the turn began — a demonstration the model starts mid-turn
   * does not switch Manual off.
   */
  demo(): boolean;
  /** The gate's own verdict: this call would run without a person. */
  isUngoverned(call: ToolCall): boolean;
  label(call: ToolCall): string;
  emit(frame: Record<string, unknown>): void;
  /** File a step that never ran in the turn record, with why. */
  notRun(call: ToolCall, round: number, why: string): void;
}

/** One held step, while it is being settled. */
interface HeldStep {
  w: TurnPolicyWiring;
  run: TurnPolicyRun;
  round: number;
  pending: readonly ToolCall[];
  next: string[];
}

export class TurnPolicy {
  /** Manual was asked for and the turn could not hold: it stopped where it would have asked. */
  holdUnavailable = false;
  /** The steps she had chosen that a stop left unrun, by label. */
  pendingSteps: string[] = [];
  /** AnA's own Manual holds (and the steps a waiting steer replaced), in order. */
  readonly policyHolds: PolicyHold[] = [];
  private approvalWaitMs = 0;
  private approvalTimedOut = false;
  private wiring: TurnPolicyWiring | null = null;
  private readonly now: () => number;

  constructor(
    private readonly opts: {
      runPolicy: AnaRunPolicy | null;
      /** A run row and an owner who could resume it (run-status.ts isHoldable). */
      holdable: boolean;
      /** When the turn started: the Auto ceilings are measured from here. */
      startedAt: number;
      now?: () => number;
    },
  ) {
    this.now = opts.now ?? Date.now;
  }

  get runPolicy(): AnaRunPolicy | null {
    return this.opts.runPolicy;
  }

  /** The loop's checkpoint, wired to this turn. */
  checkpoint(wiring: TurnPolicyWiring): LoopCheckpoint {
    this.wiring = wiring;
    return (upcomingRound, pending) => this.atBoundary(wiring, upcomingRound, pending);
  }

  /**
   * After each round's approvals settled, from outside the gate: how long the
   * turn waited on them, and whether one went unanswered.
   */
  noteApprovals(waitedMs: number, timedOut: boolean): void {
    this.approvalWaitMs += Math.max(0, waitedMs);
    if (timedOut) this.approvalTimedOut = true;
  }

  /** The loop's stopWhen: see run-status.ts policyStopDirective. */
  readonly stopWhen = (): LoopStopDirective => {
    const hold = this.wiring?.run?.hold;
    const wallMs = this.now() - this.opts.startedAt;
    return policyStopDirective({
      runPolicy: this.opts.runPolicy,
      holdExpired: hold?.expired() ?? false,
      approvalTimedOut: this.approvalTimedOut,
      activeMs: wallMs - (hold?.heldMs() ?? 0) - this.approvalWaitMs,
      wallMs,
    });
  };

  /** Why the turn stopped, from why its loop did. */
  stoppedReason(loopReason: StoppedReason | TurnStoppedReason): TurnStoppedReason {
    return turnStoppedReason(loopReason, {
      holdExpired: this.wiring?.run?.hold.expired() ?? false,
      holdUnavailable: this.holdUnavailable,
    });
  }

  private async atBoundary(
    w: TurnPolicyWiring,
    round: number,
    pending: readonly ToolCall[],
  ): Promise<'continue' | 'abort' | 'replan'> {
    const due = manualHoldDue({
      policy: this.opts.runPolicy,
      upcomingRound: round,
      pending,
      demo: w.demo(),
      isUngoverned: c => w.isUngoverned(c as ToolCall),
    });
    if (due && !this.opts.holdable) return this.failClosed(w, round, pending);
    const run = w.run;
    if (!run) return 'continue';
    if (run.cancelled()) return this.cancelled(w, round);
    run.heartbeat(round);
    if (run.hold.expired()) return this.expired(w, round, pending, null);
    if (!due) return this.personHold(w, run, round, pending);
    return this.manualHold({ w, run, round, pending, next: pending.map(c => w.label(c)) });
  }

  /**
   * No policy hold due: wait while a person paused, splice queued steers, abort
   * on cancel — the stream's checkpoint as it was. Under Manual the hold's
   * expiry is 'end', so a person's pause nobody answers ends the turn too.
   */
  private async personHold(
    w: TurnPolicyWiring,
    run: TurnPolicyRun,
    round: number,
    pending: readonly ToolCall[],
  ): Promise<'continue' | 'abort'> {
    const announce: RunHoldAnnounce | undefined = this.opts.runPolicy ? { reason: 'person' } : undefined;
    const held = await run.hold.hold(round, announce);
    if (held === 'expired') return this.expired(w, round, pending, null);
    // Steers and screen reports: drained atomically, so neither applies twice.
    const steers = await run.drainSteers();
    if (run.cancelled() || held === 'cancelled') return this.cancelled(w, round);
    /* `interjected` is announced AFTER the cancel check, not beside the drain.
       The client renders it as "You steered AnA:" on the turn; emitted at
       drain time it could say so and be followed at once by an abort — the
       steer drained out of the queue, never reached a model turn, and the
       transcript claimed it had. This announces delivery to the next turn.
       The AUDIT record is a different thing, written at queue time by the
       control endpoint (run-control.ts queueSteer), where it means "the
       operator submitted this steer" whether or not the run consumed it. */
    for (const message of steers) w.emit({ type: 'interjected', round, message });
    return 'continue';
  }

  /** Manual: stop before the step, say what it is, and wait for the person. */
  private async manualHold(step: HeldStep): Promise<'continue' | 'abort' | 'replan'> {
    const { w, run, round } = step;
    // A steer typed while the last round ran already answers "what next" —
    // before the step was ever shown. It replaces it, and that is no hold.
    const early = await run.drainSteers();
    if (early.length > 0) {
      if (run.cancelled()) return this.cancelled(w, round);
      return this.replan(step, early, 'superseded');
    }
    const placed = await this.placeHold(run);
    if (placed === 'cancelled') return this.cancelled(w, round);
    if (placed === 'unavailable') return this.failClosed(w, round, step.pending);
    const outcome = await run.hold.hold(round, { reason: 'manual', next: step.next });
    return this.settleHold(step, outcome);
  }

  /**
   * Put the run on hold for the person. 'held' when she paused it, or when a
   * person's own pause is already in place (the row reads 'paused'); never on
   * a row that is not live. A write that threw, or a row that is gone, ended
   * or failed, is 'unavailable': she stops, and the step does not run.
   */
  private async placeHold(run: TurnPolicyRun): Promise<'held' | 'cancelled' | 'unavailable'> {
    try {
      // Twice at most: a person may pause and resume between the write and the read.
      for (let attempt = 0; attempt < 2; attempt++) {
        if (await run.holdForPerson()) return 'held';
        const status = await run.status();
        if (status === 'paused') return 'held';
        if (status === 'cancelled' || run.cancelled()) return 'cancelled';
        if (status !== 'running') return 'unavailable';
      }
    } catch {
      // The run could not be held: stop where she would have asked, never run on.
    }
    return 'unavailable';
  }

  /** The hold is over: only a person's answer — the row live again — runs or replaces the step. */
  private async settleHold(step: HeldStep, outcome: RunHoldOutcome): Promise<'continue' | 'abort' | 'replan'> {
    const { w, run, round, pending, next } = step;
    if (outcome === 'expired') return this.expired(w, round, pending, next);
    // Never run a held step for a client that is gone.
    if (outcome === 'disconnected') return this.endedAtHold(step, 'disconnected');
    const steers = await run.drainSteers();
    if (run.cancelled() || outcome === 'cancelled') return this.endedAtHold(step, 'stopped');
    const status = await run.status().catch(() => undefined);
    if (status === 'cancelled') return this.endedAtHold(step, 'stopped');
    if (status === undefined || !ANSWERED.has(status)) return this.failClosed(w, round, pending);
    if (steers.length > 0) return this.replan(step, steers, 'redirected');
    this.policyHolds.push(this.hold(round, next, 'continued'));
    return 'continue';
  }

  /** The step is replaced, and never runs: "Do this instead", or a steer that was already waiting. */
  private replan(step: HeldStep, steers: string[], outcome: 'redirected' | 'superseded'): 'replan' {
    const { w, round, pending, next } = step;
    for (const message of steers) w.emit({ type: 'interjected', round, message, replaced: next });
    for (const c of pending) w.notRun(c, round, NOT_RUN[outcome]);
    this.policyHolds.push(this.hold(round, next, outcome));
    return 'replan';
  }

  /** A hold the run ended while she waited — Stop, or the page gone: the step is filed not run. */
  private endedAtHold(step: HeldStep, outcome: 'stopped' | 'disconnected'): 'abort' {
    const { w, round, pending, next } = step;
    this.stopUnrun(w, round, pending, NOT_RUN[outcome]);
    this.policyHolds.push(this.hold(round, next, outcome));
    // A Stop is acknowledged on the wire, as every cancel is; a page that is gone hears nothing.
    if (outcome === 'stopped') w.emit({ type: 'cancelled', round });
    return 'abort';
  }

  /**
   * The hold ran out: the turn ends here, with the steps it did not run named.
   * `manualNext` is set for her own hold; null for a person's pause, which is
   * filed as theirs.
   */
  private expired(
    w: TurnPolicyWiring,
    round: number,
    pending: readonly ToolCall[],
    manualNext: string[] | null,
  ): 'abort' {
    this.stopUnrun(w, round, pending, manualNext ? NOT_RUN.expiredHold : NOT_RUN.expiredPause);
    if (manualNext) this.policyHolds.push(this.hold(round, manualNext, 'expired'));
    return 'abort';
  }

  /** Manual asked for, and the turn cannot hold: stop where she would have asked. */
  private failClosed(w: TurnPolicyWiring, round: number, pending: readonly ToolCall[]): 'abort' {
    this.holdUnavailable = true;
    // The fact only (shared with the transcript's note, which says what to do).
    w.emit({ type: 'warning', code: 'MANUAL_UNAVAILABLE', message: MANUAL_UNAVAILABLE_TEXT });
    this.stopUnrun(w, round, pending, NOT_RUN.unavailable);
    return 'abort';
  }

  private cancelled(w: TurnPolicyWiring, round: number): 'abort' {
    w.emit({ type: 'cancelled', round });
    return 'abort';
  }

  private stopUnrun(w: TurnPolicyWiring, round: number, pending: readonly ToolCall[], why: string): void {
    this.pendingSteps = pending.map(c => w.label(c));
    for (const c of pending) w.notRun(c, round, why);
  }

  private hold(round: number, next: string[], outcome: PolicyHold['outcome']): PolicyHold {
    return { round, reason: 'manual', next, outcome, at: new Date(this.now()).toISOString() };
  }
}
