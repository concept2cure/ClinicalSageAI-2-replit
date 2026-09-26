/**
 * Which of AnA's tool calls a person has to authorise before they run.
 *
 * ── This module decides nothing ──────────────────────────────────────────────
 * It is a classifier over TOOL CALLS that delegates every judgment to a
 * registry it does not own. For the one tool that carries a platform command,
 * `execute_platform_command`, that is `command-rbac.ts`'s `isProposeOnlyCommand`,
 * DERIVED from `COMMAND_AUTHORIZATION` rather than hand-listed — so a new
 * governed handler joins the partition the moment it is registered. For every
 * other tool it is `propose-only-tools.ts`, the tool-name-keyed sibling that
 * classifies the directly registered handlers and is held to its sources by
 * an anti-drift test. Restating either membership here would create the
 * hand-maintained copy that derivation and that test exist to prevent, and
 * the copy would drift silently: a new approve-shaped command or a new vault
 * writer would simply become executable by the agent, with nothing to say so.
 *
 * What this module adds is only the translation. The registries speak COMMANDS
 * and TOOL NAMES; the agentic loop speaks TOOL CALLS. `execute_platform_command`
 * carries the command in `input.command`, so somebody has to unwrap it, and
 * doing that inline at the call site is how the unwrapping comes to disagree
 * with itself. `qms_change_transition` carries its refused-or-proposed target in
 * `input.to`, and the same applies.
 *
 * Two classifiers, one discipline: `classifyToolCall` answers for the command
 * tool and `classifyDirectToolCall` for the rest. They are separate exports
 * rather than one function because `classifyToolCall`'s return union is what
 * `routes/ana-ri/stream.ts` narrows on (`Extract<…, {kind:'NEEDS_APPROVAL'}>`
 * in awaitDecision); widening it there is the second step, taken when that
 * file's window opens.
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
import { REFUSE_IN_CHAT_TOOLS, isProposeOnlyTool, refusedInChatTool, toolTierOf } from './propose-only-tools.js';

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
 * Classify one call of the command tool.
 *
 * Two kinds of call are governed here: `execute_platform_command`, whose
 * command is judged by the propose-only partition and its tier; and the tools
 * on CONFIRM_TIER_TOOLS, which write through their own handlers and are always
 * the confirm tier (P0-12, 69f93d98: the registerToolHandler wrapper in
 * AnaToolExecutor.ts refuses to run one without ToolContext.humanConfirmed,
 * and POST /governed-action runs a confirmed one). Everything else is
 * UNGOVERNED to this function — not because those tools are ungoverned, but
 * because the whole population of directly registered write tools is
 * classified by `classifyDirectToolCall` below against the tool-name registry
 * (propose-only-tools.ts, P1-34 / audit DP-36: about 170 writers, not five).
 * CONFIRM_TIER_TOOLS is the first slice of that registry wired at every door;
 * the registry's anti-drift test pins that the five are proposals there too,
 * so the two cannot disagree, and folding the rest of the registry into the
 * wrapper is one change whose size (the confirm tier for ~160 more tools) is
 * the founder's call, recorded on the work-order board.
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

export type DirectToolVerdict =
  /** A read, or the command tool (classifyToolCall owns it). Nothing to ask. */
  | { kind: 'UNGOVERNED' }
  /** A person must authorise it. Carries what they are authorising, and the tier they authorise at. */
  | { kind: 'NEEDS_APPROVAL'; tool: string; input: Record<string, unknown>; tier: ApprovalTier }
  /** An act no chat confirmation can supply — an approval, attestation, signature or transmission. Refused, with where a person takes it. */
  | { kind: 'REFUSE_IN_CHAT'; tool: string; act: string; where: string; why: string }
  /** The call could not be read, so it cannot be cleared. See the module docstring. */
  | { kind: 'UNDECIDABLE'; why: string };

/**
 * Classify one call of a directly registered tool against propose-only-tools.ts.
 *
 * Same discipline as classifyToolCall: arguments that failed to parse, or a
 * governed tool whose input is not an object, are UNDECIDABLE — refused, never
 * passed. A refusal that depends on one input value (qms_change_transition on
 * `to`) is UNDECIDABLE when that value cannot be read, because a gate must not
 * open widest when it can see least. `execute_platform_command` is UNGOVERNED
 * here so that the two classifiers never answer for the same call.
 */
export function classifyDirectToolCall(call: ClassifiableToolCall): DirectToolVerdict {
  if (call.inputParseError) {
    return { kind: 'UNDECIDABLE', why: `arguments did not parse: ${call.inputParseError}` };
  }
  if (call.name === PLATFORM_COMMAND_TOOL) return { kind: 'UNGOVERNED' };

  const isRefusalClass = Object.prototype.hasOwnProperty.call(REFUSE_IN_CHAT_TOOLS, call.name);
  if (!isRefusalClass && !isProposeOnlyTool(call.name)) return { kind: 'UNGOVERNED' };

  const input = asRecord(call.input);
  if (!input) {
    return { kind: 'UNDECIDABLE', why: 'the call carried no arguments object' };
  }

  if (isRefusalClass) {
    const refusal = refusedInChatTool(call.name, input);
    if (refusal) {
      if (refusal.target === null) {
        return { kind: 'UNDECIDABLE', why: `no transition target (${REFUSE_IN_CHAT_TOOLS[call.name].when?.field}) in the call` };
      }
      return { kind: 'REFUSE_IN_CHAT', tool: refusal.tool, act: refusal.act, where: refusal.where, why: refusal.why };
    }
  }

  const tier = toolTierOf(call.name);
  if (tier === null) {
    // A refusal-class tool with no proposal side and no refusal for this input
    // cannot happen (an unconditional entry always refuses); named rather than
    // assumed, and refused rather than cleared.
    return { kind: 'UNDECIDABLE', why: `${call.name} is governed but has no tier for this call` };
  }
  return { kind: 'NEEDS_APPROVAL', tool: call.name, input, tier };
}
