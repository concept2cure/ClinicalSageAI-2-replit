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
 */
export type RunStoppedReason =
  | 'cancelled'
  | 'client_disconnected'
  | 'orphaned'
  | 'approval_denied'
  | 'max_rounds'
  | 'duplicate_thrash'
  | 'no_more_tools'
  | 'error';

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
 * How long a run may sit paused before it is resumed as abandoned.
 *
 * Shared with the approval gate deliberately: an approval that outlives the
 * pause ceiling would be a second timeout number for the same human-is-away
 * condition.
 */
export const MAX_PAUSE_MS = 10 * 60_000;

/** Steer text cap — a redirect, not a new document. */
export const MAX_INTERJECTION_CHARS = 2_000;
