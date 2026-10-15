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

/**
 * An Auto turn's work budget: 15 minutes of ACTIVE time — the turn's clock
 * less the time it spent held for a person (a pause) or waiting on an
 * approval. Past it, the next model call is the closing answer and the turn
 * reports `budget_exhausted`, with Continue.
 */
export const AUTO_ACTIVE_MS = 15 * 60_000;

/**
 * An Auto turn's wall-clock ceiling, whatever it spent waiting: twice the work
 * budget plus one full pause (40 minutes). A turn that keeps being held or
 * kept waiting still ends, and says so.
 */
export const AUTO_WALL_MS = 2 * AUTO_ACTIVE_MS + MAX_PAUSE_MS;

/**
 * The delegation tool's name (row 74). Named here, where the run policy reads
 * it — Manual also stops before a round that would START an agent, even the
 * first — ahead of the slice that registers the tool itself. Until then no
 * model is offered it, and nothing matches it.
 */
export const RUN_AGENT_TOOL = 'run_agent';

/*
 * Sub-agent ceilings (row 74, S5; ADR-0015 §4). A sub-agent is a bounded,
 * read-only child loop started by `run_agent`. Every number below is a hard
 * stop the server applies; the tool description states the ones the model has
 * to plan around (per round, per turn, rounds, minutes).
 */

/** Agents one parent turn may start in total. The seventh is refused. */
export const MAX_AGENTS_PER_TURN = 6;

/** Agents that run together in one parent round. The fifth in a round is refused. */
export const MAX_AGENTS_PER_ROUND = 4;

/**
 * Agents live at once for one organization, **per server process** — not
 * across the fleet. A counter in memory; it bounds what one tenant can make
 * one process do, it is not a global quota.
 */
export const MAX_LIVE_AGENTS_PER_ORG = 8;

/** Agents live at once across every organization, per server process (ADR-0015 §6). */
export const MAX_LIVE_AGENTS_PER_PROCESS = 10;

/** A child loop's round ceiling. It never earns an extension. */
export const CHILD_MAX_ROUNDS = 6;

/**
 * A child's token budget. Soft by up to two calls: the loop asks after a tool
 * round, so the call that crosses it and one closing call still run.
 */
export const CHILD_TOKEN_BUDGET = 200_000;

/** Past this much active time the child's next call is its closing report. */
export const CHILD_WRAP_UP_MS = 150_000;

/** A child's active-time ceiling: its timer aborts it here. Time held for a person does not count. */
export const CHILD_ACTIVE_MS = 180_000;

/** Tools one child runs at once. */
export const CHILD_TOOL_CONCURRENCY = 2;

/** `run_agent` input caps, in characters. Longer input is refused, not truncated. */
export const AGENT_OBJECTIVE_MAX = 200;
export const AGENT_INSTRUCTIONS_MAX = 8_000;
export const AGENT_TEXT_TO_CHECK_MAX = 40_000;
