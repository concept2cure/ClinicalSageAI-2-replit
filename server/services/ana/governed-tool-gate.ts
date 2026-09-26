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
 * This function speaks for `execute_platform_command` only: it unwraps the
 * command and asks the command partition. Any other tool is UNGOVERNED to it —
 * not because those tools are ungoverned, but because they are classified by
 * `classifyDirectToolCall` below against the tool-name registry. Until the
 * 2026-09-26 lens (audit DP-36, plan P1-34) this docstring said the direct
 * handlers were out of scope by design, on the reasoning that ordinary
 * authoring mutations were "work, not attestation"; P0-12 had already reversed
 * that for commands (every write is a proposal at the confirm tier), and
 * DP-36 found the consequence of not reversing it for tools: a model response
 * could save to the vault, revise a controlled document or approve an import
 * with nobody confirming. The stream door still consults only this function;
 * routes/ana-ri/stream.ts settleApprovals adds classifyDirectToolCall when its
 * window opens, and governed-tool-gate.test.ts pins the interim.
 */
export function classifyToolCall(call: ClassifiableToolCall): ToolGateVerdict {
  if (call.inputParseError) {
    return { kind: 'UNDECIDABLE', why: `arguments did not parse: ${call.inputParseError}` };
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
