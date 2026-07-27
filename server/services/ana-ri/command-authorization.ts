/**
 * Central authorization envelope for AnA chat-initiated commands (G-05).
 *
 * The command dispatcher (`executeCommands`) applied exactly one
 * authorization-adjacent check before invoking a handler — the Part 11 sign-off
 * — and nothing else. Role, entitlement and tenant tool policy were enforced (if
 * at all) inside individual handlers: the MDX/PDEV governed-tool gate reached
 * only the MDX/PDEV handlers, and only two handlers (GDPR export/erase) checked a
 * role. So a broad catalogue of mutations — create_artifact, place_in_dossier,
 * create_milestone, tasks, review comments … — dispatched with no central
 * decision, and a NEW command added without its own gate would inherit none.
 *
 * This module is the single place every command passes through before dispatch:
 *   1. Every dispatchable command MUST have a policy. An unknown / unmapped
 *      command is DENIED (fail closed) — the parity guard
 *      (command-authorization.parity test) makes an unmapped handler a build
 *      failure so this can never silently under-authorize.
 *   2. The per-tenant tool allow/deny policy is applied to ALL commands, not
 *      just the MDX/PDEV subset.
 *   3. Declared capabilities are enforced centrally (today: privacy-admin for
 *      GDPR export/erase, folded out of the two bespoke handler checks).
 *   4. The decision (class + reason + policy version) is returned so the caller
 *      can record it on the result / receipt.
 *
 * Object-scope (does THIS principal own the specific project/artifact in params)
 * is still enforced by each handler's tenant-scoped SQL (`WHERE organization_id
 * = …`); tightening it into a per-object-type check here is the next increment
 * and is tracked separately. Tool-relevance filtering is never treated as
 * security — this gate is.
 */

import { MDX_COMMAND_HANDLERS } from './mdx-command-handlers';
import { MDX_COMMAND_HANDLERS_PHASE2 } from './mdx-command-handlers-phase2';
import { MDX_COMMAND_HANDLERS_PHASE3 } from './mdx-command-handlers-phase3';
import { PDEV_COMMAND_HANDLERS } from './pdev-command-handlers';

export const COMMAND_POLICY_VERSION = 'ana-cmd-authz-v1';

/** Action class of a command — recorded for audit and used to route Part 11. */
export type CommandClass = 'read' | 'mutation' | 'sign' | 'privacy' | 'delegated';

export interface CommandPolicy {
  class: CommandClass;
  /** Capabilities the principal must hold (checked against ctx.userRole). */
  requiredCapabilities?: string[];
}

/**
 * The minimal principal shape the gate needs. CommandContext (command-executor)
 * is structurally assignable to this; declared locally so this module does not
 * import command-executor (which imports this one).
 */
export interface AuthzContext {
  userId?: number;
  organizationId?: number;
  activeProjectId?: number;
  userRole?: string;
  anaToolPolicy?: { allow?: string[]; deny?: string[] };
}

export interface AuthzDecision {
  allowed: boolean;
  command: string;
  class: CommandClass | 'unknown';
  reason: string;
  policyVersion: string;
}

// ── Command classification ────────────────────────────────────────────────────
// Read: retrieval / deterministic computation / advisory analysis.
const READ_COMMANDS = [
  'list_projects', 'list_artifacts', 'list_tasks', 'list_team_members',
  'list_artifact_versions', 'list_milestones',
  'load_user_context', 'load_conversation_history',
  'check_dossier_readiness', 'check_promotion_blockers', 'check_claim',
  'search_artifacts', 'search_precedents',
  'compare_versions', 'review_version_impact',
  'run_compliance_scan', 'run_submission_assessment', 'run_rim_scan',
  'compute_sample_size', 'compute_dose_escalation', 'compute_readiness',
  'assess_defensibility', 'assess_diagnostic_validation',
  'scan_deficiencies', 'scan_contradictions',
  'analyze_crl_triggers', 'analyze_rtf_triggers', 'analyze_jurisdictions',
  'analyze_cross_document', 'analyze_cms_strategy',
  'recommend_strategy', 'recommend_endpoints', 'evaluate_endpoint',
  'simulate_challenges', 'detect_drift', 'predict_next_artifact',
  'generate_checklist', 'generate_clinical_insights',
  'module3_missing_inputs', 'module3_stale_sections', 'module3_readiness',
  'module3_contradictions', 'module3_lineage', 'module3_classify_source',
  'cmc_status', 'ich_compliance', 'control_strategy', 'variations_classify',
  'audit.explain', 'k510_workflow.document_preview',
];

// Mutation: alters a non-record-critical object (drafts, tasks, comments,
// milestones, generated artifacts). Confirmation UX is handled upstream.
const MUTATION_COMMANDS = [
  'create_project', 'update_project',
  'create_artifact', 'update_artifact', 'update_artifact_status',
  'create_task', 'update_task',
  'create_review_thread', 'add_review_comment',
  'create_milestone', 'update_milestone',
  'generate_sap', 'design_trial', 'draft_section',
  'export_artifact', 'export_document', 'generate_report',
  'module3_build_all', 'module3_build_section', 'module3_refresh_stale',
];

// Sign: record-altering / submission-state actions. Also gated by the Part 11
// sign-off in executeCommands; this classifies them for the audit decision.
const SIGN_COMMANDS = [
  'place_in_dossier', 'revert_to_version', 'freeze_document',
  'sign_document', 'submit_document', 'create_submission_package',
];

// Privacy: personal-data export/erasure. Requires a privacy-admin capability.
const PRIVACY_COMMANDS = ['export_personal_data', 'erase_personal_data'];

function buildPolicy(): Record<string, CommandPolicy> {
  const p: Record<string, CommandPolicy> = {};
  for (const c of READ_COMMANDS) p[c] = { class: 'read' };
  for (const c of MUTATION_COMMANDS) p[c] = { class: 'mutation' };
  for (const c of SIGN_COMMANDS) p[c] = { class: 'sign' };
  for (const c of PRIVACY_COMMANDS) p[c] = { class: 'privacy', requiredCapabilities: ['privacy_admin'] };
  return p;
}

export const COMMAND_POLICY: Record<string, CommandPolicy> = buildPolicy();

/**
 * Commands whose handler carries its own governance gate (`requireGovernedToolGate`
 * — multi-turn confirm, reason-for-change, per-tenant tool allow/deny). The
 * central gate still applies the tenant tool policy + capability layer to them,
 * then defers the confirm/reason contract to the handler. Recognised by
 * membership in the MDX/PDEV handler maps so new MDX/PDEV commands are covered
 * automatically.
 */
export const DELEGATED_COMMANDS: ReadonlySet<string> = new Set<string>([
  ...Object.keys(MDX_COMMAND_HANDLERS),
  ...Object.keys(MDX_COMMAND_HANDLERS_PHASE2),
  ...Object.keys(MDX_COMMAND_HANDLERS_PHASE3),
  ...Object.keys(PDEV_COMMAND_HANDLERS),
]);

/** Resolve a command to its policy, or null when nothing declares one. */
export function resolvePolicy(command: string): CommandPolicy | null {
  if (Object.prototype.hasOwnProperty.call(COMMAND_POLICY, command)) return COMMAND_POLICY[command];
  if (DELEGATED_COMMANDS.has(command)) return { class: 'delegated' };
  return null;
}

/** Mirrors command-executor's hasPrivacyAdminRole; kept local to avoid a cycle. */
function hasPrivacyAdminRole(role?: string): boolean {
  const normalized = String(role || '').toLowerCase();
  return ['admin', 'manager', 'owner', 'super_admin', 'platform_admin', 'dpo', 'privacy_officer'].includes(normalized);
}

function principalHasCapability(ctx: AuthzContext, capability: string): boolean {
  if (capability === 'privacy_admin') return hasPrivacyAdminRole(ctx.userRole);
  return false; // unknown capability ⇒ deny (fail closed)
}

/** Tenant tool allow/deny, applied to EVERY command. Returns a deny reason or null. */
function toolPolicyDenyReason(command: string, policy?: AuthzContext['anaToolPolicy']): string | null {
  if (!policy) return null;
  if (Array.isArray(policy.deny) && policy.deny.includes(command)) return 'tenant-tool-policy-deny';
  if (Array.isArray(policy.allow) && policy.allow.length > 0 && !policy.allow.includes(command)) {
    return 'tenant-tool-policy-not-allowed';
  }
  return null;
}

/**
 * The central decision. Fails closed on an unknown command, a tenant tool-policy
 * denial, or a missing capability. Pure (no I/O) so it is trivially testable and
 * cannot itself become a source of latency or partial failure.
 */
export function authorizeCommand(command: string, ctx: AuthzContext): AuthzDecision {
  const policyVersion = COMMAND_POLICY_VERSION;

  const policy = resolvePolicy(command);
  if (!policy) {
    return { allowed: false, command, class: 'unknown', reason: 'no-authorization-policy', policyVersion };
  }

  const toolDeny = toolPolicyDenyReason(command, ctx.anaToolPolicy);
  if (toolDeny) {
    return { allowed: false, command, class: policy.class, reason: toolDeny, policyVersion };
  }

  for (const cap of policy.requiredCapabilities ?? []) {
    if (!principalHasCapability(ctx, cap)) {
      return { allowed: false, command, class: policy.class, reason: `missing-capability:${cap}`, policyVersion };
    }
  }

  return { allowed: true, command, class: policy.class, reason: 'authorized', policyVersion };
}
