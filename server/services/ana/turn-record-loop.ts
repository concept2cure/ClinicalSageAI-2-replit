/**
 * The turn record for the doors that run AnA's agentic loop without the
 * stream route: POST /api/chat/send-message, POST /api/claude/agent and the
 * /ana socket namespace.
 *
 * Both call `executeAgenticLoop` (AnaToolExecutor), the same governed,
 * tool-executing loop the stream runs, and until this module neither wrote a
 * turn record — so a turn through either left nothing an inspector could be
 * shown. They now write the same record, through the same writer, in the same
 * append-only store (services/ana/turn-record.ts).
 *
 * What these doors can report is less than the stream can: the loop gives the
 * first call's input, every tool call with its input and result, and the final
 * response, and each model the gateway reports as having returned a call —
 * not tool-step round assignments, nor what each later model call was sent.
 * The record says so in its warnings rather than leaving the gap to be inferred.
 *
 * @compliance 21 CFR Part 11 §11.10(e); EU Annex 11 §9.
 * @module server/services/ana/turn-record-loop
 */

import { describeToolPlan } from './agentic-loop.js';
import {
  openTurnRecorder,
  writeTurnRecordSafely,
  type TurnOutcome,
  type TurnRecordStatus,
  type TurnRecorder,
} from './turn-record.js';

/** One tool call the loop reported through `onToolExecution`. */
export interface LoopToolCall {
  tool: string;
  input: Record<string, unknown>;
  result: string;
  latencyMs: number;
}

/** A returned gateway call, not a requested model or a failed dispatch. */
export interface LoopServedCall {
  round: number;
  provider: string | null;
  model: string | null;
  requestId: string | null;
}

/** The existing rule for metadata the native door can actually name. */
function statedString(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

/** Collect the loop's tools and returned model metadata through its existing hooks. */
export function loopToolCollector(): {
  calls: LoopToolCall[];
  servedCalls: LoopServedCall[];
  onModelResponse: (response: { provider?: unknown; model?: unknown; requestId?: unknown }, round: number) => void;
  onToolExecution: (tool: string, input: Record<string, unknown>, result: string) => void;
} {
  const calls: LoopToolCall[] = [];
  const servedCalls: LoopServedCall[] = [];
  let since = Date.now();
  return {
    calls,
    servedCalls,
    onModelResponse: (response, round) => {
      // Copy primitives now: later response mutation cannot rewrite authorship.
      servedCalls.push({ round, provider: statedString(response.provider), model: statedString(response.model), requestId: statedString(response.requestId) });
    },
    onToolExecution: (tool, input, result) => {
      const now = Date.now();
      calls.push({ tool, input, result, latencyMs: now - since });
      since = now;
    },
  };
}

/** A tool result that is a JSON object with an `error` names that error. */
function errorOf(result: string): string | null {
  try {
    const parsed = JSON.parse(result);
    return parsed && typeof parsed === 'object' && typeof parsed.error === 'string' ? parsed.error : null;
  } catch {
    return null;
  }
}

const LOOP_DOOR_LIMITS =
  'This turn ran through a door that reports its tool calls and final answer but not its rounds or what each later model call was sent; the record holds the first call\'s input, every tool call and the answer.';

const LOOP_MODEL_CALL_LIMITS =
  'This turn reports its served model calls and raw tool calls; tool-step round assignments and later model inputs are not reported by this door.';

/** Retain returned calls, and state the limits of the metadata actually available. */
function recordServedCalls(recorder: TurnRecorder, calls: readonly LoopServedCall[] | undefined): string {
  for (const call of calls ?? []) recorder.addServed(call.round, call);
  return calls?.length ? LOOP_MODEL_CALL_LIMITS : LOOP_DOOR_LIMITS;
}

type ConnectablePool = Parameters<typeof writeTurnRecordSafely>[0];

/** Record a turn that ran through executeAgenticLoop. Never throws. */
export async function recordLoopTurn(
  pool: ConnectablePool,
  turn: {
    orgId: unknown;
    userId: unknown;
    surface: string;
    projectId?: unknown;
    /** The conversation the door saved the turn into, when it has one. */
    threadId?: string | null;
    typed: string;
    messages: Array<{ role: string; content: unknown }>;
    calls: LoopToolCall[];
    /** Only calls the gateway returned, in observer order; absent for legacy callers. */
    servedCalls?: readonly LoopServedCall[];
    response?: { content?: unknown; thinking?: unknown; model?: unknown; provider?: unknown } | null;
    outcome: TurnOutcome;
    error?: unknown;
  },
  audit: { ipAddress?: string; userAgent?: string } = {},
): Promise<TurnRecordStatus> {
  const recorder = openTurnRecorder({
    orgId: turn.orgId,
    userId: turn.userId,
    typed: turn.typed,
    projectId: turn.projectId,
    surface: turn.surface,
  });
  if (recorder) {
    if (turn.threadId) recorder.setThread(turn.threadId);
    recorder.setModelInput(turn.messages);
    for (const c of turn.calls) {
      const error = errorOf(c.result);
      recorder.addStep({
        round: 0,
        tool: c.tool,
        label: describeToolPlan([{ id: c.tool, name: c.tool, input: c.input }])[0].label,
        status: error ? 'error' : 'success',
        latencyMs: c.latencyMs,
        input: c.input,
        result: c.result,
        error,
      });
    }
    const r = turn.response ?? null;
    recorder.setModel({ provider: statedString(r?.provider), model: statedString(r?.model) });
    const modelCallLimits = recordServedCalls(recorder, turn.servedCalls);
    recorder.setReasoning(statedString(r?.thinking));
    recorder.setAnswer({ streamed: statedString(r?.content) });
    recorder.warn(modelCallLimits);
    if (turn.outcome === 'failed' && turn.error !== undefined) {
      const message = turn.error instanceof Error ? turn.error.message : String(turn.error);
      recorder.warn(`The turn ended with an error: ${message.slice(0, 500)}`);
    }
  }
  return writeTurnRecordSafely(pool, recorder, turn.outcome, audit);
}
