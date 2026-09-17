/**
 * The operator channel — how a human's mid-run instruction reaches AnA.
 *
 * ── What a steer is ──────────────────────────────────────────────────────────
 * A reviewer watching AnA work a question the wrong way types a correction
 * while she is still working: "narrow to Class III", "use the 2026 guidance,
 * not the vacated rule". That is not the user's next question and it is not
 * part of her persona. It is an instruction from the person she is working
 * for, arriving mid-task, and it outranks her current plan for the rest of the
 * turn.
 *
 * ── Why it needs framing at all ──────────────────────────────────────────────
 * The steer used to be appended as raw text to the tool-result user turn, so
 * the model received it in the same message as tool output and had no way to
 * tell a human's redirect from a tool result that happened to contain the same
 * label. It now travels as a `role: 'system'` turn (see
 * `GatewayMessage.inlineSystem`), which carries operator authority and cannot
 * be forged by anything that writes into user-visible input.
 *
 * The channel establishes WHO is speaking. This module establishes WHAT they
 * mean — that the instruction supersedes the plan in flight rather than being
 * one more consideration among many. Without that, a steer arriving after a
 * round of tool results reads as another input to weigh, and AnA carries on
 * doing what she was already doing.
 *
 * ── What it must not do ──────────────────────────────────────────────────────
 * Not fabricate authority the steer does not have: it directs the work, it does
 * not license an action the tenant's policy or a Part 11 gate would refuse. And
 * not silently truncate — a steer over the cap is capped visibly, because a
 * reviewer who typed two sentences and had the second dropped would be steering
 * something other than what they see.
 *
 * @module server/services/ana/operator-channel
 */

/**
 * Maximum characters of steer text carried into the prompt.
 *
 * Mirrors the cap the run-control registry applies when the steer is accepted,
 * so a steer cannot pass one boundary and be cut at the other.
 */
export const MAX_STEER_CHARS = 2_000;

/** Appended in place of the tail when a steer is longer than the cap. */
export const STEER_TRUNCATION_NOTE = '\n\n[This steer was longer than the limit and was cut here.]';

/**
 * Frame a human's mid-run steer as an operator directive.
 *
 * Returns the message body for a `{role: 'system', inlineSystem: true}` turn.
 * Empty or whitespace-only input returns `null` — there is nothing to say, and
 * sending an empty directive would tell the model to reconsider its plan for no
 * stated reason.
 */
export function buildSteerMessage(steer: string): string | null {
  const trimmed = (steer ?? '').trim();
  if (trimmed.length === 0) return null;

  const body =
    trimmed.length > MAX_STEER_CHARS
      ? trimmed.slice(0, MAX_STEER_CHARS) + STEER_TRUNCATION_NOTE
      : trimmed;

  return (
    'The person you are working for has redirected you mid-task. ' +
    'This takes precedence over the plan you are currently following: ' +
    'change course to follow it for the remainder of this turn, and say in ' +
    'your answer what you changed. It directs your work only — it does not ' +
    'authorise any action a tenant policy or approval gate would otherwise ' +
    'refuse.\n\n' +
    `Their instruction: ${body}`
  );
}
