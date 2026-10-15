/**
 * The run policy's shared vocabulary (row 74, slice S4) — the readers and the
 * words both halves of the product need, so the server's record and the
 * client's screen cannot drift apart.
 *
 * Each of these existed as two to four copies before: a label filter in the
 * stream's record, the hook, the progress reader and the work panel; the hold
 * outcomes in the record and in the dossier; the policy check in the server's
 * parser, the prefs loader and the progress reader; and the ceilings written
 * as "10 minutes" on the server and derived from the constants on the client.
 * A copy that agrees today is how a pair survives long enough to stop
 * agreeing (run-control-limits.ts says the same of its own origin).
 *
 * @module shared/ana/run-policy
 */
import {
  ANA_RUN_POLICIES,
  AUTO_ACTIVE_MS,
  AUTO_WALL_MS,
  MAX_PAUSE_MS,
  type AnaRunPolicy,
} from './run-control-limits';

/** Exactly 'manual' or 'auto'. Anything else — 'AUTO', '', a number — is no policy. */
export function isAnaRunPolicy(raw: unknown): raw is AnaRunPolicy {
  return (ANA_RUN_POLICIES as readonly unknown[]).includes(raw);
}

/**
 * How one of AnA's Manual steps was settled, as the message keeps it and the
 * dossier reads it:
 *
 *   continued     she held, and the person said to run the step
 *   redirected    she held, and the person replaced the step ("Do this
 *                 instead"); it never ran
 *   superseded    NOT a hold: a steer the person sent while she was still
 *                 working reached the boundary first and replaced the step
 *                 before it was shown; it never ran
 *   expired       she held, and nobody answered within MAX_PAUSE_MS; the turn
 *                 ended there
 *   stopped       she held, and the run was stopped (Stop) while she waited;
 *                 the step never ran
 *   disconnected  she held, and the page went away while she waited; the step
 *                 never ran
 */
export const POLICY_HOLD_OUTCOMES = [
  'continued',
  'redirected',
  'superseded',
  'expired',
  'stopped',
  'disconnected',
] as const;
export type PolicyHoldOutcome = (typeof POLICY_HOLD_OUTCOMES)[number];

export function isPolicyHoldOutcome(raw: unknown): raw is PolicyHoldOutcome {
  return (POLICY_HOLD_OUTCOMES as readonly unknown[]).includes(raw);
}

/** Whether an outcome is a hold she actually made (a pause the person was shown). */
export function wasHeld(outcome: PolicyHoldOutcome): boolean {
  return outcome !== 'superseded';
}

/** Step labels: the non-empty strings, in order. Anything else is dropped, never guessed. */
export function stepLabels(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((s): s is string => typeof s === 'string' && s.trim() !== '') : [];
}

/** A duration in whole minutes, as the product says it ("10 minutes", "1 minute"). */
export function minutesWords(ms: number): string {
  const m = Math.round(ms / 60_000);
  return `${m} ${m === 1 ? 'minute' : 'minutes'}`;
}

/** How long a hold or an approval waits for a person: MAX_PAUSE_MS, in words. */
export const PAUSE_WORDS = minutesWords(MAX_PAUSE_MS);

/** Auto's time ceilings in words: the work budget, then the wall clock. */
export const AUTO_TIME_WORDS = `${minutesWords(AUTO_ACTIVE_MS)} of work, ${minutesWords(AUTO_WALL_MS)} in all`;

/**
 * The fact of a Manual turn that could not hold, as the stream warns it and
 * the transcript's note begins. What to do about it is the note's, which
 * alone offers Continue.
 */
export const MANUAL_UNAVAILABLE_TEXT =
  'Manual needs run control, which was not available for this turn, so AnA stopped where she would have asked you.';
