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
 * response — not the rounds, nor what each later model call was sent. The
 * record says so in its warnings rather than leaving the gap to be inferred.
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
} from './turn-record.js';

/** One tool call the loop reported through `onToolExecution`. */
export interface LoopToolCall {
  tool: string;
  input: Record<string, unknown>;
  result: string;
  latencyMs: number;
}

/** Collects the loop's tool calls; pass `onToolExecution` to executeAgenticLoop. */
export function loopToolCollector(): {
  calls: LoopToolCall[];
  onToolExecution: (tool: string, input: Record<string, unknown>, result: string) => void;
} {
  const calls: LoopToolCall[] = [];
  let since = Date.now();
  return {
    calls,
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
    const str = (v: unknown) => (typeof v === 'string' && v ? v : null);
    recorder.setModel({ provider: str(r?.provider), model: str(r?.model) });
    recorder.setReasoning(str(r?.thinking));
    recorder.setAnswer({ streamed: str(r?.content) });
    recorder.warn(LOOP_DOOR_LIMITS);
    if (turn.outcome === 'failed' && turn.error !== undefined) {
      const message = turn.error instanceof Error ? turn.error.message : String(turn.error);
      recorder.warn(`The turn ended with an error: ${message.slice(0, 500)}`);
    }
  }
  return writeTurnRecordSafely(pool, recorder, turn.outcome, audit);
}
