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
