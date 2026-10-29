/**
 * The most one windowed read may weigh, serialized as its handler returns it
 * (JSON.stringify, escapes counted). P-24 / ANA-SUMMARY S1: the one read window
 * for every windowed read (read_project_document, the authoring reads, the
 * knowledge lookups). A handler shrinks its window to fit rather than let
 * capToolResultForModel cut it: a cut loses text from the middle with nothing
 * to say so, and the offset it carries then skips what was cut. Four such
 * results (20,000) pass a round's budget untouched.
 *
 * Its own module (2026-10-29) so a deterministic tool can fit its result
 * without importing the agentic loop, whose module graph reaches the model
 * gateway (ci:step-presentation ENGINE). agentic-loop.ts re-exports it.
 *
 * @module server/services/ana/result-budget
 */
export const RESULT_BUDGET = 5000;
