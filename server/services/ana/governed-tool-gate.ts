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

import { createHash } from 'node:crypto';
import { stableStringify } from '../../../shared/canonical-json.js';
import type { SkillPolicyApproval } from '../../../shared/ana/skills.js';
import type { MandatorySkillGate } from '../account-skill-bundles.js';
import type { RequestSqlClient } from '../../db/requestDb.js';
import { isProposeOnlyCommand } from '../ana-ri/command-rbac.js';
import { governedTierOf } from '../ana-ri/part11-governance.js';
import { reasonRequiredFor } from './stated-reason-input.js';
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
  | { kind: 'NEEDS_APPROVAL'; command: string; params: Record<string, unknown>; tier: ApprovalTier; skillPolicyApproval?: SkillPolicyApproval }
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
export function classifyToolCall(call: ClassifiableToolCall, gates?: ToolSkillGateSnapshot | null): ToolGateVerdict {
  const base = classifyBaseToolCall(call);
  if (!gates || base.kind === 'REFUSED' || base.kind === 'UNDECIDABLE' || toolAuthorizationOf(call.name, call.input).class === 'refuse') return base;
  const approval = skillPolicyApprovalFor(call, gates);
  if (!approval) return base;
  if (base.kind === 'NEEDS_APPROVAL') return { ...base, skillPolicyApproval: approval };
  const params = asRecord(call.input);
  return params ? { kind: 'NEEDS_APPROVAL', command: call.name, params, tier: registeredToolTier(call.name, params), skillPolicyApproval: approval }
    : { kind: 'UNDECIDABLE', why: 'the policy-gated call carried no arguments object' };
}

function classifyBaseToolCall(call: ClassifiableToolCall): ToolGateVerdict {
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

  const params = asRecord(input.params) ?? {};
  return {
    kind: 'NEEDS_APPROVAL',
    command,
    params,
    // With the params: a command's tier can follow what the call does
    // (part11-governance.ts requiredSignatureMeaning — AnA approving or locking
    // an artifact is an e-signature, moving it to review is not).
    tier: governedTierOf(command, params),
  };
}

/**
 * The tier a person approves a registered tool's write at. A tool that records
 * the person's reason for change (REASON_REQUIRED_TOOLS) is put to them at the
 * reason tier: the reason is typed, or AnA's wording adopted, by the person at
 * confirmation, and that text is what the tool records — not the reason the
 * model wrote into the call (D5, 2026-09-29). Every other write is a yes.
 * The confirmation route reads the same answer (routes/ana-ri/utility.ts).
 */
export function registeredToolTier(name: string, input: unknown): ApprovalTier {
  return reasonRequiredFor(name, input) ? 'reason' : 'confirm';
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
  return { kind: 'NEEDS_APPROVAL', command: call.name, params: toolInput, tier: registeredToolTier(call.name, toolInput) };
}


export interface SkillGateToolScope {
  organizationId?: number | null;
  userId?: number | null;
  projectId?: number | null;
  projectRef?: string | null;
  sqlClient?: RequestSqlClient;
}
export interface ToolSkillGateSnapshot {
  organizationId: number;
  userId: number | null;
  projectId: number | null;
  rules: MandatorySkillGate[];
  ruleHash: string;
}

/** Policy admission is a current database read, never the model's selected skills. */
export async function loadToolSkillGates(scope?: SkillGateToolScope, call?: ClassifiableToolCall): Promise<ToolSkillGateSnapshot | null> {
  if (scope?.organizationId == null) return null;
  if (!Number.isSafeInteger(scope.organizationId) || scope.organizationId <= 0) throw new Error('Invalid policy tenant');
  const [{ loadMandatorySkillGates }, { admitAnaProjectScope }] = await Promise.all([
    import('../account-skill-bundles.js'), import('./project-scope-admission.js'),
  ]);
  const client = scope.sqlClient ?? (await import('../../db/runtime.js')).getPool();
  let project = await admitAnaProjectScope(client, { organizationId: scope.organizationId, userId: scope.userId, projectId: scope.projectId, projectRef: scope.projectRef });
  const input = asRecord(call?.input);
  // Project bindings are supported only for this proven, actually consumed target.
  // Other tools can have tenant bindings; arbitrary similarly named arguments do not define their scope.
  const targets = (call?.name === 'check_dossier_consistency' ? [input?.project_id] : [])
    .filter(value => value !== undefined && value !== null && value !== '');
  for (const target of targets) {
    const admitted = await admitAnaProjectScope(client, { organizationId: scope.organizationId, userId: scope.userId, projectRef: target });
    if (project.projectId !== null && admitted.projectId !== project.projectId) throw new Error('The action targets a different project');
    project = admitted;
  }
  return { organizationId: scope.organizationId, userId: scope.userId ?? null, projectId: project.projectId,
    ...await loadMandatorySkillGates(client, scope.organizationId, project.projectId, scope.userId) };
}

/** Exact held action, including tenant and project; none of these hashes confers authority on its own. */
export function skillPolicyApprovalFor(call: ClassifiableToolCall, gates: ToolSkillGateSnapshot): SkillPolicyApproval | null {
  if (!gates.rules.some(rule => rule.toolName === call.name)) return null;
  return { rulesHash: gates.ruleHash, actionHash: createHash('sha256').update(stableStringify({
    organizationId: gates.organizationId, userId: gates.userId, projectId: gates.projectId, tool: call.name, input: call.input,
  })).digest('hex') };
}

const confirmedSkillContexts = new WeakMap<object, SkillPolicyApproval>();

/** Only the held approval route calls this, after its current-policy and exact-action checks. */
export function authorizeSkillGateContext(context: object, approval: SkillPolicyApproval): void {
  confirmedSkillContexts.set(context, Object.freeze({ ...approval }));
}

/** A serialized body flag/hash cannot reproduce this one-use, process-local authorization. */
export function consumeSkillGateAuthorization(context: object, expected: SkillPolicyApproval | null): boolean | null {
  const approved = confirmedSkillContexts.get(context);
  confirmedSkillContexts.delete(context);
  if (!approved) return null;
  return expected !== null && approved.actionHash === expected.actionHash && approved.rulesHash === expected.rulesHash;
}


/** Current held-action validation happens before any approval claim or sign-off. */
export async function validateHeldSkillApproval(scope: SkillGateToolScope | null, call: ClassifiableToolCall, approved?: SkillPolicyApproval): Promise<
  { gates: ToolSkillGateSnapshot | null } | { status: number; code: string; error: string; decisionPackage?: import('../../../shared/ana/skills.js').RuleConflictDecisionPackage }
> {
  if (!scope) return { gates: null };
  if (classifyToolCall(call).kind === 'REFUSED') return { status: 400, code: 'NOT_AN_ANA_ACTION', error: 'This is not an action AnA can take on a confirmation' };
  let gates: ToolSkillGateSnapshot | null;
  try { gates = await loadToolSkillGates(scope, call); }
  catch (error) {
    const { OrgSkillRefusal } = await import('../account-skill-bundles.js');
    if (error instanceof OrgSkillRefusal && error.code === 'RULE_CONFLICT') {
      return { status: 409, code: error.code, error: error.message, decisionPackage: error.decisionPackage };
    }
    return { status: 503, code: 'SKILL_POLICY_UNAVAILABLE', error: 'Current organization and project rules could not be verified. Nothing was run.' };
  }
  const current = gates ? skillPolicyApprovalFor(call, gates) : null;
  if ((approved || current) && (!approved || !current || approved.actionHash !== current.actionHash || approved.rulesHash !== current.rulesHash)) {
    return { status: 409, code: 'SKILL_POLICY_CHANGED', error: 'The action or its approval rules changed. Ask AnA to propose it again.' };
  }
  return { gates };
}
