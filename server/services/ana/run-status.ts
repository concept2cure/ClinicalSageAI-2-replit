/**
 * The AnA run state machine — pure, no I/O.
 *
 * Split out from the service that persists it so the rules can be read and
 * tested without a database, and so there is exactly one place that answers
 * "is this transition legal". The registry this replaces encoded the same rules
 * implicitly, spread across four methods that each re-checked `status ===
 * 'cancelled'`; a rule expressed four times is four places to get it wrong.
 *
 * @module server/services/ana/run-status
 */

import { AUTO_ACTIVE_MS, AUTO_WALL_MS, RUN_AGENT_TOOL, type AnaRunPolicy } from '@shared/ana/run-control-limits';
import { isAnaRunPolicy, type PolicyHoldOutcome } from '@shared/ana/run-policy';

/**
 * Where a run is.
 *
 *   running            generating, or running tools
 *   paused             held at the next round boundary
 *   awaiting_approval  stopped before a governed tool, waiting on a human
 *   cancelled          terminal — the person stopped it
 *   finished           terminal — the turn completed
 *   failed             terminal — it errored, or a restart orphaned it
 */
export type RunStatus =
  | 'running'
  | 'paused'
  | 'awaiting_approval'
  | 'cancelled'
  | 'finished'
  | 'failed';

/** The three states from which a run can still move. */
export const LIVE_RUN_STATUSES: readonly RunStatus[] = [
  'running',
  'paused',
  'awaiting_approval',
] as const;

/**
 * Why a run stopped.
 *
 * `cancelled` and `client_disconnected` are deliberately separate. A dropped
 * socket is not a human decision, and recording one as the other would put a
 * choice nobody made into the decision lineage the dossier reads.
 *
 * The run policy's reasons (row 74; named in slice S1, produced since S4):
 *
 *   budget_exhausted  Auto reached its time ceiling (AUTO_ACTIVE_MS of work,
 *                     AUTO_WALL_MS in all); the last call was the closing answer
 *   approval_timeout  a turn with a policy had an approval go unanswered for
 *                     MAX_PAUSE_MS — denied, as it always is — and ended there
 *   hold_expired      a Manual hold (or a person's pause in a Manual turn) went
 *                     unanswered for MAX_PAUSE_MS; the turn ENDED, never resumed
 *                     (run-control.ts endHeldRun)
 *   hold_unavailable  Manual was asked for but the turn could not hold (no run
 *                     row, or no owner to resume it), so it stopped where it
 *                     would have asked
 */
export type RunStoppedReason =
  | 'cancelled'
  | 'client_disconnected'
  | 'orphaned'
  | 'approval_denied'
  | 'max_rounds'
  | 'duplicate_thrash'
  | 'no_more_tools'
  | 'error'
  | 'budget_exhausted'
  | 'approval_timeout'
  | 'hold_expired'
  | 'hold_unavailable'
  /** The loop ended, but the answer it ended on was cut off — the model's
   *  length limit, or a stream that stalled mid-answer (finish-reason.ts). */
  | 'answer_cut_off'
  /*
   * AnA detach DT3 (docs/design/ANA_DETACH_2026-10-08.md §2.10). Each is the
   * run ROW's reason, written by a server path that is not the turn's loop,
   * and each reaches the turn through the abort's RunStopped (run-control.ts):
   * the row's reason wins over what the loop saw.
   *
   *   unattended_limit  a detached turn nobody watched for 15 minutes
   *   session_ended     the session or the organisation that started it ended
   *   server_shutdown   a graceful shutdown (a deploy) ended it
   *   admin_cancelled   an organisation admin or owner stopped it — the
   *                     admin variant of `cancelled`, so "Stopped by an
   *                     administrator." has a producer
   */
  | 'unattended_limit'
  | 'session_ended'
  | 'server_shutdown'
  | 'admin_cancelled';

/**
 * Why a TURN's work stopped — the subset of {@link RunStoppedReason} that the
 * turn's own loop decides, as the `done` frame and the assistant message's
 * metadata carry it. The rest (a restart, a refused gate, an error) end the
 * RUN and are recorded on the run row, not on the answer.
 *
 * `client_disconnected` is both since ANA-SUMMARY S4: the page lost its
 * connection (a phone locked, a tab closed), the run was stopped for it, and
 * the answer says so — "Stopped: this page lost its connection." with
 * Continue — rather than reading as a person's Stop (TurnPolicy.noteDisconnected).
 *
 * And since AnA detach DT3 every run-row reason except `approval_denied` (a
 * gate's, never a turn's end): a turn the reaper, a shutdown, the session's
 * end, an admin or the unattended limit stopped says so on its answer and its
 * record, as the row does (§5.3).
 */
export type TurnStoppedReason = Exclude<RunStoppedReason, 'approval_denied'>;

/**
 * Why a turn ended, as its saved answer and its record say it: the person's
 * Stop is `cancelled` whatever the loop reported, unless the loop named a stop
 * of its own (a hold that ran out, the round limit, a lost connection) — that
 * one says more. The one copy: post-processing saves it, the Summary's end
 * event reads it.
 */
export function stoppedTurnReason(stopped: boolean | undefined, reason: TurnStoppedReason | undefined): TurnStoppedReason | undefined {
  return stopped && (!reason || reason === 'no_more_tools') ? 'cancelled' : reason;
}

/** The same, as the Summary's end event says it: null for a turn she finished (turn-timeline-emitter.ts). */
export function endStoppedReason(stopped: boolean, reason: TurnStoppedReason | undefined): TurnStoppedReason | null {
  const r = stoppedTurnReason(stopped, reason);
  return r && r !== 'no_more_tools' ? r : null;
}

/**
 * One of AnA's OWN holds under Manual, as the assistant message keeps it.
 *
 * Kept apart from {@link HumanControlEvent} on purpose: the policy made this
 * pause, not a person, so it is never recorded as a control (run-control.ts
 * holdForPerson writes no event). It is what explains the resume that follows
 * it — "Run this step" is the person's control; the stop before it was hers.
 *
 * The outcomes are shared with the dossier (shared/ana/run-policy.ts
 * POLICY_HOLD_OUTCOMES): continued, redirected, expired, stopped and
 * disconnected settle a hold she made; `superseded` is NOT a hold — a steer
 * sent while she worked replaced the step before it was ever shown — and is
 * kept here only so the record says what happened to that step.
 */
export interface PolicyHold {
  /** The round she held before. */
  round: number;
  reason: 'manual';
  /** The steps she was about to run, by label. */
  next: string[];
  outcome: PolicyHoldOutcome;
  /** ISO-8601, when the hold was settled. */
  at: string;
}

export type { AnaRunPolicy };

/**
 * The run policy a request asked for: exactly 'manual' or 'auto', else none.
 * Anything else — 'AUTO', '', a number — is no policy (today's effort-bounded
 * turn), never a 400 and never a guess.
 */
export function parseRunPolicy(raw: unknown): AnaRunPolicy | null {
  return isAnaRunPolicy(raw) ? raw : null;
}

/**
 * Can this turn hold for a person? It needs a run row to hold on, AND an owner:
 * a run with no user can be resumed by nobody (applyControl refuses NOT_YOURS),
 * so a hold on it would wait out its ceiling for an answer no one may give.
 */
export function isHoldable(run: { runId: string | null | undefined; runUserId: number | null | undefined }): boolean {
  return Boolean(run.runId) && run.runUserId !== null && run.runUserId !== undefined;
}

/**
 * Does this turn go on when its page closes (AnA detach §2.1)? It needs a run
 * row and an owner (as a hold does: isHoldable), and its conversation must be
 * resolved: the thread beginRun verified, or the one minted for a new
 * conversation and stamped on the run (§2.8, G-2). A run with no conversation
 * could not be found again by thread, and its notice could name nothing, so it
 * does not run on unseen. A page that closes before a new conversation's
 * thread exists is decided once it does (stream.ts).
 *
 * A turn that asked to drive the screen detaches like any other (D-7, decided
 * 2026-10-22 by the coordinator under the founder's delegation, replacing
 * "a Live Drive turn stops on close"): Live Drive is on by default since
 * 9db931c56, so the old rule kept every default turn from detaching. From the
 * close, AnA stops driving: stream.ts refuses any further screen action
 * (screenActionRefusal) and lists it as a step that did not run, and the rest
 * of the turn's work goes on.
 */
export function detachable(input: {
  runId: string | null | undefined;
  runUserId: number | null | undefined;
  threadResolved: boolean;
}): boolean {
  return isHoldable(input) && input.threadResolved;
}

/**
 * The tools that act on the person's screen under Live Drive: a move, an
 * on-screen operation, and starting a driven demonstration. Each one's result
 * is applied to the page as it streams (services/ana-ri/navigation-actions.ts,
 * live-drive.ts). The listings beside them (list_app_screens,
 * list_screen_actions, list_demo_scripts) only read the registry.
 */
export const SCREEN_ACTION_TOOLS: ReadonlySet<string> = new Set(['navigate_to', 'act_on_screen', 'start_product_demo']);

/**
 * Does Manual stop before this round? Pure; the caller supplies the gate's
 * verdict as `isUngoverned`, so this never classifies anything itself.
 *
 *   - Only under Manual, and never while a demonstration drives (the tour is
 *     a script the person started; stopping it between screens breaks it).
 *   - Only when some pending call would run WITHOUT a person. A step that
 *     already goes to one (an approval) or will not run (refused, unreadable)
 *     is not held for twice.
 *   - Not before round 1 — the step the message asked for runs — unless that
 *     step starts an agent, which is asked about first.
 */
export function manualHoldDue(input: {
  policy: AnaRunPolicy | null;
  upcomingRound: number;
  pending: readonly { name: string }[];
  demo: boolean;
  isUngoverned: (call: { name: string }) => boolean;
}): boolean {
  const { policy, upcomingRound, pending, demo, isUngoverned } = input;
  if (policy !== 'manual' || demo) return false;
  if (!pending.some(c => isUngoverned(c))) return false;
  return upcomingRound >= 2 || pending.some(c => c.name === RUN_AGENT_TOOL);
}

/**
 * Why the TURN stopped, from why its loop stopped and what its hold saw. A
 * hold that could not be made, then a hold that expired, outrank the loop's
 * own reason: the loop saw only an abort ('cancelled'), which would read as a
 * person's Stop.
 */
export function turnStoppedReason(
  loopReason: TurnStoppedReason,
  hold: {
    holdExpired: boolean;
    holdUnavailable: boolean;
    disconnected?: boolean;
    /**
     * The run row's reason, when the row's stop is what aborted the turn
     * (run-control.ts RunStopped): it wins (AnA detach §2.4), so the answer
     * and the record say what the row says.
     */
    rowReason?: RunStoppedReason | null;
  },
): TurnStoppedReason {
  if (hold.rowReason && hold.rowReason !== 'approval_denied') return hold.rowReason;
  if (hold.holdUnavailable) return 'hold_unavailable';
  if (hold.holdExpired) return 'hold_expired';
  // The loop saw only the abort; the socket that dropped is why (S4).
  if (hold.disconnected && loopReason === 'cancelled') return 'client_disconnected';
  return loopReason;
}

/**
 * What the stream tells the loop after each round (agentic-loop.ts
 * LoopStopDirective), in this order:
 *
 *   halt              the turn's hold expired: no further model call
 *   approval_timeout  a turn WITH a policy had an approval go unanswered
 *   budget_exhausted  Auto past its work or wall-clock ceiling
 *   null              carry on — always, for a turn with no policy, whose
 *                     ceilings are today's rounds and nothing else
 *
 * `activeMs` is the turn's clock less time held for a person and time waiting
 * on approvals; both waits are measured by the caller, outside the gate.
 */
export function policyStopDirective(input: {
  runPolicy: AnaRunPolicy | null;
  holdExpired: boolean;
  approvalTimedOut: boolean;
  activeMs: number;
  wallMs: number;
  /**
   * A detached turn's unattended limit has come (AnA detach §2.6): which one.
   * Any policy, or none: the limit bounds unwatched work, not a policy's.
   */
  unattended?: 'unattended_limit' | 'budget_exhausted' | null;
}): 'halt' | 'approval_timeout' | 'budget_exhausted' | 'unattended_limit' | null {
  if (input.holdExpired) return 'halt';
  if (input.runPolicy !== null && input.approvalTimedOut) return 'approval_timeout';
  if (input.runPolicy === 'auto' && (input.activeMs > AUTO_ACTIVE_MS || input.wallMs > AUTO_WALL_MS)) {
    return 'budget_exhausted';
  }
  return input.unattended ?? null;
}

const ALLOWED_TRANSITIONS: Record<RunStatus, readonly RunStatus[]> = {
  running: ['paused', 'awaiting_approval', 'cancelled', 'finished', 'failed'],
  // A paused run can be cancelled but cannot jump straight to an approval
  // gate: the gate is reached by executing, and a paused run is not executing.
  paused: ['running', 'cancelled', 'failed'],
  awaiting_approval: ['running', 'cancelled', 'failed'],
  // Terminal. Nothing leaves. `cancelled` in particular is the invariant the
  // old registry pinned ("cancel is terminal — pause/resume/interject are
  // refused afterward") and the reason the completion writer has to guard its
  // UPDATE: whichever writer finishes last must not be able to rewrite it.
  cancelled: [],
  finished: [],
  failed: [],
};

/** Is this transition legal? Pure. */
export function canTransitionRunStatus(from: RunStatus, to: RunStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Can this run still be controlled, or has it already settled? */
export function isLiveRunStatus(status: RunStatus): boolean {
  return LIVE_RUN_STATUSES.includes(status);
}

/** A human control action taken against an in-flight run. */
export type RunControlAction =
  | 'pause'
  | 'resume'
  | 'interject'
  | 'cancel'
  | 'approve'
  | 'deny';

/**
 * The status a control action moves a run to, or null when the action does not
 * change status (a steer is a redirect, not a state change).
 *
 * `interject` returning null is load-bearing: a steer accepted while paused
 * also resumes the run, and that resume is a SEPARATE transition rather than a
 * side effect hidden inside this mapping — see the service.
 */
export function statusAfterControl(action: RunControlAction): RunStatus | null {
  switch (action) {
    case 'pause':
      return 'paused';
    case 'resume':
    case 'approve':
      return 'running';
    case 'cancel':
      return 'cancelled';
    case 'deny':
      // The gate was refused, so the run continues WITHOUT that tool — the
      // model is told the person declined and adapts. Denying an action is not
      // cancelling the turn.
      return 'running';
    case 'interject':
      return null;
  }
}

/**
 * A human control action taken against an in-flight run.
 *
 * Recorded onto the run row at the moment of ACCEPTANCE, then projected onto
 * the assistant turn's metadata at turn end, so a redirection is part of the
 * auditable decision lineage the document dossier reads.
 *
 * It lives in this module rather than in the service because `tool-trace.ts`
 * and `post-processing.ts` need the shape and nothing else — importing it from
 * the service would put `pg` on their import graph for a type that erases.
 */
export interface HumanControlEvent {
  action: RunControlAction;
  /** The steering text, for an interjection. */
  message?: string;
  /** The upcoming round number at which the control was applied. */
  round: number;
  /** ISO-8601 timestamp. */
  at: string;
  /** Who took the action. Null for a control the server applied itself. */
  byUserId?: number | null;
  /**
   * Set when an organisation admin or owner took it on a colleague's run
   * (AnA detach §2.5: cancel only). Absent for the asker's own controls.
   */
  byRole?: 'admin';
  /**
   * The reason an administrator gave for stopping a colleague's turn (DT3
   * review, DP-82): required for that cancel, absent otherwise.
   */
  reason?: string;
}

/**
 * A live run whose heartbeat is older than this is presumed orphaned by a
 * restart.
 *
 * One number for the whole platform: `deep-investigation.ts` re-exports this
 * rather than declaring its own, because two different answers to "how long
 * before we stop believing a background run is alive" is how a reaper and a
 * status reporter come to disagree in front of a user.
 */
export const STALE_AFTER_MS = 5 * 60_000;

/**
 * The two limits the client also has to know, re-exported rather than
 * re-declared. The steer cap in particular is rendered as the composer's
 * maxLength, and a box that accepts more than the server keeps would truncate a
 * person's redirect with nothing saying which half landed.
 */
export { MAX_INTERJECTION_CHARS, MAX_PAUSE_MS } from '@shared/ana/run-control-limits';
