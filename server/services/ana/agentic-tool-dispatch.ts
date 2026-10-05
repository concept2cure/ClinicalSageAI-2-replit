/**
 * One tool dispatch inside executeAgenticLoop, with the loop's opt-in dispatch
 * options applied (row 74, slice S3).
 *
 *   allowedToolNames  a call to any other tool is answered TOOL_NOT_OFFERED and
 *                     nothing runs. The answer lists no other tools: a caller
 *                     that narrowed the set did so on purpose, and the
 *                     "available" list the unknown-tool answer carries would
 *                     hand the model every name it was not offered.
 *   onToolEvent       'start' as the worker picks the call up and 'end' with
 *                     its result and latency, so a caller sees real concurrency
 *                     and real per-call time, not a round-end summary.
 *   toolModelCalls    'refuse': the dispatch runs inside the model-call refusal
 *                     scope (ai-gateway/model-call-scope.ts), so anything the
 *                     tool tries to send to a model is refused before it is
 *                     sent.
 *
 * Always, whatever the options: a call whose arguments were lost in transport
 * (`inputParseError`) is answered with lostToolInputResult and nothing runs,
 * as the stream has done since S1 (row 74, S5).
 *
 * Every option is optional. With none set, {@link dispatchLoopCall} is the
 * dispatch the adapter always made, except for the lost-input refusal above.
 *
 * An observer (onToolEvent, and the adapter's onModelResponse) is told, never
 * obeyed: one that throws is logged and the loop goes on, because by then the
 * tool has run or the tokens are spent, and a call the model made must still
 * get its result.
 *
 * Kept beside the adapter rather than inside it: AnaToolExecutor.ts is the one
 * module every tool registers into, and what lives here does not need to.
 *
 * @module server/services/ana/agentic-tool-dispatch
 */

import { createScopedLogger } from '../../utils/logger';
import { runRefusingModelCalls } from '../ai-gateway/model-call-scope.js';
import { lostToolInputResult, type ToolCall } from './agentic-loop.js';

const log = createScopedLogger('ana-agentic-dispatch');

/** Tell an observer something; if it throws, log it and carry on (see the module header). */
export function notifyObserver(hook: string, notify: () => void): void {
  try {
    notify();
  } catch (err) {
    log.warn(`[ana-agentic-dispatch] ${hook} threw; the loop carries on: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * The lanes a round runs in: 4 unless asked, and a whole number of at least 1
 * when asked. Anything else is refused before the loop spends a model call,
 * rather than failing at the first tool round (0) or running no tool at all
 * (NaN).
 */
export function resolveToolConcurrency(asked: number | undefined): number {
  if (asked === undefined) return 4;
  if (!Number.isInteger(asked) || asked < 1) {
    throw new RangeError(`toolConcurrency must be a whole number of at least 1 (got ${String(asked)})`);
  }
  return asked;
}

/** One tool call's start or end, as the worker that runs it sees it. */
export interface AgenticToolEvent {
  phase: 'start' | 'end';
  /** The loop round the call belongs to (1-based). */
  round: number;
  call: ToolCall;
  /** The result string the model will read ('end' only). */
  result?: string;
  /** Set when the call failed ('end' only). */
  errorMessage?: string;
  /** Wall time from pick-up to result ('end' only). */
  latencyMs?: number;
}

/** What one dispatch hands back to the round. */
export interface DispatchedCall {
  call: ToolCall;
  result: string;
  errorMessage?: string;
}

export interface LoopDispatchOptions {
  allowedToolNames?: ReadonlySet<string>;
  onToolEvent?: (event: AgenticToolEvent) => void;
  toolModelCalls?: 'refuse';
  /** Whose tools these are, named in the refusal (the request's own run ids). */
  runId?: string;
  parentRunId?: string;
}

/** The answer for a call to a tool this loop was not offered. House shape: {error, tool, message}. */
export function toolNotOfferedResult(tool: string): { error: 'TOOL_NOT_OFFERED'; tool: string; message: string } {
  return {
    error: 'TOOL_NOT_OFFERED',
    tool,
    message: 'This tool was not offered to this agent; nothing was run.',
  };
}

/**
 * Dispatch one call through `run` (the adapter's own handler lookup and
 * runOneTool), applying the options. `run` is not called for a tool outside
 * `allowedToolNames`.
 */
export async function dispatchLoopCall(
  call: ToolCall,
  round: number,
  options: LoopDispatchOptions,
  run: () => Promise<DispatchedCall>,
): Promise<DispatchedCall> {
  const onToolEvent = options.onToolEvent;
  if (onToolEvent) notifyObserver('onToolEvent', () => onToolEvent({ phase: 'start', round, call }));
  const started = Date.now();
  const out = await dispatchOnce(call, options, run);
  if (onToolEvent) {
    const end: AgenticToolEvent = {
      phase: 'end',
      round,
      call,
      result: out.result,
      ...(out.errorMessage ? { errorMessage: out.errorMessage } : {}),
      latencyMs: Date.now() - started,
    };
    notifyObserver('onToolEvent', () => onToolEvent(end));
  }
  return out;
}

function dispatchOnce(call: ToolCall, options: LoopDispatchOptions, run: () => Promise<DispatchedCall>): Promise<DispatchedCall> {
  if (options.allowedToolNames && !options.allowedToolNames.has(call.name)) {
    return Promise.resolve({
      call,
      result: JSON.stringify(toolNotOfferedResult(call.name)),
      errorMessage: 'not offered',
    });
  }
  // Arguments lost in transport: the handler would run on `{}` as though the
  // model had asked for nothing (row 74, S5). After the allowlist, so a tool
  // that was not offered is still answered as one.
  const lost = lostToolInputResult(call);
  if (lost) return Promise.resolve({ call, result: JSON.stringify(lost), errorMessage: call.inputParseError });
  if (options.toolModelCalls !== 'refuse') return run();
  return runRefusingModelCalls(
    { runId: options.runId ?? '', parentRunId: options.parentRunId ?? '', tool: call.name },
    run,
  );
}
