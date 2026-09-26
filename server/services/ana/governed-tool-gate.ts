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
  | { kind: 'UNDECIDABLE'; why: string };

/**
 * Tools that change records through their own handlers rather than through the
 * platform-command surface, so the every-write partition (P0-12) does not reach
 * them. Each is a confirm-tier proposal like any command that writes:
 *
 *   save_document_to_vault     a new governed artifact and its first version
 *   update_vault_document      a new version of an existing artifact
 *   file_chat_upload_to_vault  a document filed into the project Vault
 *   seed_tmf                   the trial master file's reference model
 *   save_report_definition     a saved report the organisation will use
 *
 * Enforced twice, and the two are one list: here, so the live chat stream holds
 * the turn and asks; and in AnaToolExecutor's registerToolHandler wrapper, so a
 * path that cannot ask refuses to run one no person confirmed. A new tool that
 * writes on its own handler belongs on this list, and the anti-drift test
 * (direct-mutator-confirm-gate.test.ts) names it.
 */
export const CONFIRM_TIER_TOOLS: ReadonlySet<string> = new Set([
  'save_document_to_vault',
  'update_vault_document',
  'file_chat_upload_to_vault',
  'seed_tmf',
  'save_report_definition',
]);

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
 * Two kinds of call can be governed: `execute_platform_command`, whose command
 * is judged by the propose-only partition and its tier; and the tools on
 * CONFIRM_TIER_TOOLS, which write through their own handlers and are always the
 * confirm tier. Everything else is ungoverned here.
 */
export function classifyToolCall(call: ClassifiableToolCall): ToolGateVerdict {
  if (call.inputParseError) {
    return { kind: 'UNDECIDABLE', why: `arguments did not parse: ${call.inputParseError}` };
  }
  if (CONFIRM_TIER_TOOLS.has(call.name)) {
    const toolInput = asRecord(call.input);
    if (!toolInput) return { kind: 'UNDECIDABLE', why: 'the call carried no arguments object' };
    return { kind: 'NEEDS_APPROVAL', command: call.name, params: toolInput, tier: 'confirm' };
  }
  if (call.name !== PLATFORM_COMMAND_TOOL) return { kind: 'UNGOVERNED' };

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
