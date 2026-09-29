/**
 * Which of AnA's tool calls a person has to authorise before they run.
 *
 * ── This module decides nothing ──────────────────────────────────────────────
 * It is a classifier over TOOL CALLS that delegates every judgment to
 * `command-rbac.ts`'s `isProposeOnlyCommand`, which is itself DERIVED from
 * `COMMAND_AUTHORIZATION` rather than hand-listed — so a new governed handler
 * joins the partition the moment it is registered. Restating that membership
 * here would create the hand-maintained copy that derivation exists to prevent,
 * and the copy would drift silently: a new approve-shaped command would simply
 * become executable by the agent, with nothing to say so.
 *
 * What this module adds is only the translation. The gate speaks COMMANDS; the
 * agentic loop speaks TOOL CALLS. `execute_platform_command` carries the
 * command in `input.command`, so somebody has to unwrap it, and doing that
 * inline at the call site is how the unwrapping comes to disagree with itself.
 * Every other tool is judged by the tool register in `tool-authorization.ts`,
 * which the registry wrapper in AnaToolExecutor reads too (P1-34).
 *
 * ── Why a missing command is its own answer ──────────────────────────────────
 * `UNDECIDABLE` is not a tidier spelling of "not governed", and collapsing the
 * two is the bug this file is shaped around.
 *
 * Until the streamed-tool-input fix, every tool call on AnA's main path arrived
 * with `input: {}` — the `input_json_delta` branch of the gateway's stream
 * handler was an empty comment, so nothing accumulated. A classifier that read
 * `input.command` and returned "not governed" on `undefined` would therefore
 * have waved through EVERY governed call on the streaming surface while
 * reporting a clean gate. The gate would have been most confident exactly when
 * it was blind.
 *
 * So an unreadable call is refused, never passed. It is also not a theoretical
 * state: `ToolCall.inputParseError` carries a tool whose arguments failed to
 * parse mid-stream, and that tool must not reach a dispatcher either.
 *
 * Pure, no I/O, no database. The tier and the enforcement live where they
 * already do.
 *
 * @module server/services/ana/governed-tool-gate
 */

import { isProposeOnlyCommand } from '../ana-ri/command-rbac.js';
import { governedTierOf } from '../ana-ri/part11-governance.js';
import { buildToolRefusal, toolAuthorizationOf } from './tool-authorization.js';

/** The tool that carries a platform command in its input. */
export const PLATFORM_COMMAND_TOOL = 'execute_platform_command';

/**
 * What a person must supply before the action runs.
 *
 *   reason       a reason-for-change, recorded verbatim
 *   esignature   re-authentication as well (§11.200), for the high-impact tier
 */
export type ApprovalTier = 'confirm' | 'reason' | 'esignature';

export type ToolGateVerdict =
  /** Runs as usual. Nothing to ask. */
  | { kind: 'UNGOVERNED' }
  /** A person must authorise it. Carries what they are authorising. */
  | { kind: 'NEEDS_APPROVAL'; command: string; params: Record<string, unknown>; tier: ApprovalTier }
  /**
   * The call could not be read, so it cannot be cleared. Distinct from
   * UNGOVERNED on purpose — see the module docstring.
   */
  | { kind: 'UNDECIDABLE'; why: string }
  /**
   * A person's own act (tool-authorization.ts `refuse`). Not put to anyone:
   * a confirmation would not make it AnA's to take. Carries what she is told.
   */
  | { kind: 'REFUSED'; why: string; result: ReturnType<typeof buildToolRefusal> };

/** A tool call as the agentic loop holds one. */
export interface ClassifiableToolCall {
  name: string;
  input: unknown;
  /** Set when the streamed arguments failed to parse. */
  inputParseError?: string;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/**
 * Classify one tool call.
 *
 * `execute_platform_command` carries a command, judged by the propose-only
 * partition and its tier. Every other tool is judged by the tool register
 * (tool-authorization.ts): a read or AnA's own state runs; a write is put to a
 * person at the confirm tier; a person's own act is refused outright; a tool
 * the register does not know is proposed.
 */
export function classifyToolCall(call: ClassifiableToolCall): ToolGateVerdict {
  if (call.inputParseError) {
    return { kind: 'UNDECIDABLE', why: `arguments did not parse: ${call.inputParseError}` };
  }
  if (call.name !== PLATFORM_COMMAND_TOOL) return classifyRegisteredTool(call);

  const input = asRecord(call.input);
  if (!input) {
    return { kind: 'UNDECIDABLE', why: 'the call carried no arguments object' };
  }
  const command = input.command;
  if (typeof command !== 'string' || !command.trim()) {
    // The streamed-tool-input defect made this the state of EVERY call on the
    // main path. Reporting it as ungoverned would have opened the gate widest
    // at the moment it could see least.
    return { kind: 'UNDECIDABLE', why: 'no command name in the call' };
  }

  if (!isProposeOnlyCommand(command)) return { kind: 'UNGOVERNED' };

  return {
    kind: 'NEEDS_APPROVAL',
    command,
    params: asRecord(input.params) ?? {},
    tier: governedTierOf(command),
  };
}

/** A tool other than the command carrier, judged by the register. */
function classifyRegisteredTool(call: ClassifiableToolCall): ToolGateVerdict {
  const auth = toolAuthorizationOf(call.name, call.input);
  if (auth.class === 'read' || auth.class === 'self' || auth.class === 'command') return { kind: 'UNGOVERNED' };
  // Its handler is the refusal, and the more useful one (see refusedBy).
  if (auth.refusedBy === 'handler') return { kind: 'UNGOVERNED' };
  if (auth.class === 'refuse') {
    return { kind: 'REFUSED', why: auth.why ?? 'a person’s own act', result: buildToolRefusal(call.name, auth.why) };
  }
  // What a person is asked to confirm is the call itself, so it must be readable.
  const toolInput = asRecord(call.input);
  if (!toolInput) return { kind: 'UNDECIDABLE', why: 'the call carried no arguments object' };
  return { kind: 'NEEDS_APPROVAL', command: call.name, params: toolInput, tier: 'confirm' };
}
