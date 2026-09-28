/**
 * Limits on AnA's mid-run controls, shared by both halves of the product.
 *
 * These live in `shared/` because the server enforces them and the client has
 * to render them — the steer box needs the same cap the service will apply, or
 * the box silently accepts text the server then truncates, with nothing telling
 * the person which of their words survived.
 *
 * It was two numbers before: `MAX_INTERJECTION_CHARS` in the service and a bare
 * `maxLength={2000}` in the composer. They agreed, which is exactly how a pair
 * like that survives long enough to stop agreeing.
 *
 * @module shared/ana/run-control-limits
 */

/** Steer text cap — a redirect, not a new document. */
export const MAX_INTERJECTION_CHARS = 2_000;

/**
 * How long a run may sit paused before the server resumes it as abandoned.
 *
 * Shared with the approval gate deliberately: an approval that outlived the
 * pause ceiling would be a second timeout number for the same condition, a
 * human who is not coming back.
 */
export const MAX_PAUSE_MS = 10 * 60_000;

/**
 * What AnA does between steps when nobody is watching the turn (row 74).
 *
 *   manual  she takes the step the message asked for, then waits for the
 *           person before each further step that would run without one.
 *   auto    she keeps going until she judges the task done, within the
 *           ceilings below.
 *
 * Named "run policy", never "mode": `mode` is the engine/effort pair
 * (ANA_MODES, prefs.anaMode). A turn that sends no policy keeps today's
 * effort-bounded behaviour. Declared here, beside the pause ceiling, because
 * the server enforces it and the client has to state it.
 */
export const ANA_RUN_POLICIES = ['manual', 'auto'] as const;
export type AnaRunPolicy = (typeof ANA_RUN_POLICIES)[number];

/**
 * The absolute round ceiling of an Auto turn. A `roundCap` in the loop
 * (server/services/ana/agentic-loop.ts resolveRoundBudget): progress-earned
 * extension stops here, and a demonstration promoted mid-turn cannot lift it.
 */
export const AUTO_MAX_ROUNDS = 20;
