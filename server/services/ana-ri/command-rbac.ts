/**
 * AnA command authorization registry — the single, central, fail-CLOSED
 * authorization decision for every dispatchable platform command.
 *
 * ## Why this exists (C2C-AI-001 / C2C-AI-002)
 *
 * `executeCommands` (command-executor.ts) is the one chokepoint every AnA
 * mutation entry point funnels through:
 *
 *   1. the `execute_platform_command` chat-bridge tool
 *      (server/services/ana/AnaToolExecutor.ts),
 *   2. POST /api/ana-ri/execute       (server/routes/ana-ri/generate-execute.ts),
 *   3. POST /api/ana-ri/governed-action (server/routes/ana-ri/utility.ts),
 *   4. chat action-block processing   (processCommandsInResponse).
 *
 * Before this module existed the dispatcher loaded tenant tool-policy and the
 * Part 11 flag and then invoked the handler with NO per-user authorization
 * decision at all: `CommandContext` carried org/user/project ids but never a
 * role or permission. Any authenticated tenant user — a read-only reviewer
 * included — could therefore invoke `create_project`, `submit_document`,
 * `freeze_document`, `place_in_dossier`, … through the generic bridge and
 * create or alter regulated records. (The bridge does not even populate
 * `ctx.userRole`, so the two handlers that self-asserted a role from the
 * context evaluated `undefined`.)
 *
 * ## The model
 *
 * `COMMAND_AUTHORIZATION` is machine-readable metadata for EVERY dispatchable
 * command: read-vs-write, the domain object it acts on, the minimum
 * organization role, and whether the platform's confirmation / Part 11
 * reason-for-change / e-signature ceremonies apply.
 *
 * `authorizeCommand` is fail-closed BY CONSTRUCTION:
 *
 *   - a command with NO metadata is DENIED. A new handler wired into
 *     COMMAND_HANDLERS without an authorization entry cannot be dispatched at
 *     all, so a mutation can never ship ungated by omission. (The companion
 *     test asserts total coverage so the failure surfaces in CI, not in prod.)
 *   - identity comes from the VERIFIED principal already on CommandContext
 *     (JWT-derived userId/organizationId); a non-finite id denies.
 *   - roles come from the platform's canonical RBAC service
 *     (server/services/roleBasedAccess.ts -> organization_users.role +
 *     client_user_permissions, FDA 21 CFR Part 11 §11.10(d)). No parallel
 *     role model is introduced here.
 *   - a role-lookup error denies (rbacService is itself deny-by-default; the
 *     try/catch makes that explicit at this call site too).
 *   - when tenant governance configuration could not be READ at all
 *     (`ctx.governanceUnavailable`), every mutation-capable command is
 *     blocked. Read-only commands deliberately continue to work: that is the
 *     documented degraded mode — AnA can still answer questions and list
 *     records during a settings/DB outage, it just cannot write.
 *
 * @module server/services/ana-ri/command-rbac
 */

// Type-only back-reference: command-executor imports THIS module at runtime,
// so the reverse edge must never become a runtime import (circular init).
import type { CommandContext, CommandResult } from './command-executor';
import rbacService from '../roleBasedAccess';

/**
 * Minimum organization role, expressed in the canonical hierarchy used by
 * roleBasedAccess.ts (viewer < member/user < manager < admin < super_admin).
 * A viewer satisfies NO tier — that is the point of the fix.
 */
export type MinRole = 'member' | 'manager' | 'admin';

export interface CommandAuthorization {
  /**
   * 'read'  — advisory / list / search / compute. Persists nothing.
   * 'write' — mutation-capable: persists, updates, or transmits a record.
   *
   * For the dotted MDX/PDEV commands this mirrors the platform's own
   * machine-readable marker: a handler that calls `requireGovernedToolGate`
   * is a governed mutation, one that does not is a read.
   */
  effect: 'read' | 'write';
  /** Domain object the command acts on. Grouping key for audit/reporting. */
  object: string;
  /**
   * Minimum organization role required to dispatch this command. Required for
   * every `effect: 'write'` entry unless `handlerAuthorized` is set (asserted
   * in command-rbac.test.ts).
   */
  minRole?: MinRole;
  /**
   * Handler applies the two-phase confirm + reason-for-change ceremony via
   * `requireGovernedToolGate` (mdx-tool-policy.ts). Documented here so the
   * ceremony requirement is discoverable from the registry rather than only
   * from the handler body.
   */
  requiresConfirmation?: true;
  /** 21 CFR Part 11 reason-for-change required (PART11_GOVERNED_COMMANDS). */
  requiresReasonForChange?: true;
  /** 21 CFR Part 11 §11.200 manifested e-signature required (PART11_ESIGN_COMMANDS). */
  requiresSignature?: true;
  /**
   * Authorization is PARAMETER-dependent and is therefore completed inside the
   * handler against rbacService — the central gate cannot decide it because it
   * deliberately never sees command params. Used only by the GDPR data-subject
   * commands, where the subject may act on their OWN record without any
   * elevated role but acting on ANOTHER subject's record requires a
   * privacy-admin role. The central gate still enforces identity presence and
   * governance availability for these.
   */
  handlerAuthorized?: true;
}

/**
 * Authorization metadata for every entry in `COMMAND_HANDLERS`.
 *
 * Classification basis (verified against the handler bodies, not the
 * registry prose):
 *   - non-dotted commands: does the handler execute INSERT/UPDATE/DELETE, or
 *     call a persistence helper (persistGovernedCommandArtifact /
 *     executeGovernedAnaOperation / classifyAndMapArtifactToSource /
 *     an engine that returns a persisted record id)?
 *   - dotted MDX/PDEV commands: does the handler call
 *     `requireGovernedToolGate`? That call IS the platform's declaration that
 *     the command is a governed mutation.
 *
 * Tiering:
 *   - `manager` for everything in PART11_GOVERNED_COMMANDS plus the
 *     approval / submission-transmit / assembly-compile actions that alter the
 *     official record or move submission state.
 *   - `member` for ordinary authoring mutations (viewers denied).
 *
 * KEEP IN SYNC: command-rbac.test.ts fails CI if any dispatchable command is
 * missing from this table, if a write has no role, or if the Part 11 flags
 * drift from part11-governance.ts.
 */
export const COMMAND_AUTHORIZATION: Readonly<Record<string, CommandAuthorization>> = {
  // ── Projects ────────────────────────────────────────────────────────────
  create_project: { effect: 'write', object: 'project', minRole: 'member' },
  update_project: { effect: 'write', object: 'project', minRole: 'member' },
  list_projects: { effect: 'read', object: 'project' },

  // ── Artifacts ───────────────────────────────────────────────────────────
  create_artifact: { effect: 'write', object: 'artifact', minRole: 'member' },
  update_artifact: { effect: 'write', object: 'artifact', minRole: 'member' },
  update_artifact_status: {
    effect: 'write',
    object: 'artifact',
    minRole: 'manager',
    requiresReasonForChange: true,
  },
  list_artifacts: { effect: 'read', object: 'artifact' },
  search_artifacts: { effect: 'read', object: 'artifact' },
  export_artifact: { effect: 'read', object: 'artifact' },
  run_compliance_scan: { effect: 'read', object: 'artifact' },
  list_artifact_versions: { effect: 'read', object: 'artifact_version' },
  compare_versions: { effect: 'read', object: 'artifact_version' },
  // Persists the impact review as a governed artifact when saveAsArtifact.
  review_version_impact: { effect: 'write', object: 'artifact_version', minRole: 'member' },
  revert_to_version: {
    effect: 'write',
    object: 'artifact_version',
    minRole: 'manager',
    requiresReasonForChange: true,
    requiresSignature: true,
  },

  // ── Dossier / submission ────────────────────────────────────────────────
  check_dossier_readiness: { effect: 'read', object: 'dossier' },
  place_in_dossier: {
    effect: 'write',
    object: 'dossier',
    minRole: 'manager',
    requiresReasonForChange: true,
    requiresSignature: true,
  },
  create_submission_package: {
    effect: 'write',
    object: 'submission_package',
    minRole: 'manager',
    requiresReasonForChange: true,
    requiresSignature: true,
  },

  // ── Tasks / collaboration ───────────────────────────────────────────────
  create_task: { effect: 'write', object: 'task', minRole: 'member' },
  update_task: { effect: 'write', object: 'task', minRole: 'member' },
  list_tasks: { effect: 'read', object: 'task' },
  create_review_thread: { effect: 'write', object: 'review_thread', minRole: 'member' },
  add_review_comment: { effect: 'write', object: 'review_thread', minRole: 'member' },
  list_team_members: { effect: 'read', object: 'organization' },

  // ── Milestones ──────────────────────────────────────────────────────────
  create_milestone: {
    effect: 'write',
    object: 'milestone',
    minRole: 'manager',
    requiresReasonForChange: true,
  },
  update_milestone: {
    effect: 'write',
    object: 'milestone',
    minRole: 'manager',
    requiresReasonForChange: true,
  },
  list_milestones: { effect: 'read', object: 'milestone' },

  // ── User context / privacy ──────────────────────────────────────────────
  load_user_context: { effect: 'read', object: 'user_context' },
  load_conversation_history: { effect: 'read', object: 'conversation' },
  // GDPR Art. 15/20 + Art. 17: a data subject may act on their OWN record with
  // no elevated role; acting on another subject requires a privacy-admin role.
  // That decision depends on params.dataSubjectId, so it is completed in the
  // handler (against rbacService, NOT against a self-asserted ctx.userRole).
  export_personal_data: { effect: 'read', object: 'personal_data', handlerAuthorized: true },
  erase_personal_data: { effect: 'write', object: 'personal_data', handlerAuthorized: true },

  // ── Document lifecycle ──────────────────────────────────────────────────
  // draft_section is a lookup + drafting affordance today, but it is an
  // authoring action by contract: gate it so viewers cannot drive drafting.
  draft_section: { effect: 'write', object: 'document_section', minRole: 'member' },
  scan_deficiencies: { effect: 'read', object: 'document_section' },
  generate_checklist: { effect: 'read', object: 'document' },
  // Writes an authoring_export_history row.
  export_document: { effect: 'write', object: 'document', minRole: 'member' },
  freeze_document: {
    effect: 'write',
    object: 'document',
    minRole: 'manager',
    requiresReasonForChange: true,
    requiresSignature: true,
  },
  sign_document: {
    effect: 'write',
    object: 'document',
    minRole: 'manager',
    requiresReasonForChange: true,
    requiresSignature: true,
  },
  submit_document: {
    effect: 'write',
    object: 'document',
    minRole: 'manager',
    requiresReasonForChange: true,
    requiresSignature: true,
  },

  // ── Biostatistics ───────────────────────────────────────────────────────
  // generate_sap runs the biostats orchestrator with generateDocument:true.
  generate_sap: { effect: 'write', object: 'biostatistics', minRole: 'member' },
  compute_sample_size: { effect: 'read', object: 'biostatistics' },
  compute_dose_escalation: { effect: 'read', object: 'biostatistics' },
  assess_defensibility: { effect: 'read', object: 'biostatistics' },
  design_trial: { effect: 'read', object: 'trial_design' },

  // ── Precedent engine ────────────────────────────────────────────────────
  search_precedents: { effect: 'read', object: 'precedent' },
  analyze_crl_triggers: { effect: 'read', object: 'precedent' },
  analyze_rtf_triggers: { effect: 'read', object: 'precedent' },
  recommend_strategy: { effect: 'read', object: 'precedent' },
  check_claim: { effect: 'read', object: 'precedent' },

  // ── Submission twin ─────────────────────────────────────────────────────
  run_submission_assessment: { effect: 'read', object: 'submission_twin' },
  simulate_challenges: { effect: 'read', object: 'submission_twin' },
  detect_drift: { effect: 'read', object: 'submission_twin' },
  predict_next_artifact: { effect: 'read', object: 'submission_twin' },
  compute_readiness: { effect: 'read', object: 'submission_twin' },

  // ── Contradiction / cross-jurisdiction / endpoints / RIM ────────────────
  scan_contradictions: { effect: 'read', object: 'contradiction' },
  check_promotion_blockers: { effect: 'read', object: 'contradiction' },
  analyze_jurisdictions: { effect: 'read', object: 'jurisdiction' },
  recommend_endpoints: { effect: 'read', object: 'endpoint' },
  evaluate_endpoint: { effect: 'read', object: 'endpoint' },
  run_rim_scan: { effect: 'read', object: 'rim' },

  // ── Reports / clinical intelligence / market access ─────────────────────
  // generate_report persists a sealed report record (returns report.record.id).
  generate_report: { effect: 'write', object: 'report', minRole: 'member' },
  generate_clinical_insights: { effect: 'read', object: 'clinical_intelligence' },
  analyze_cross_document: { effect: 'read', object: 'clinical_intelligence' },
  analyze_cms_strategy: { effect: 'read', object: 'market_access' },
  assess_diagnostic_validation: { effect: 'read', object: 'diagnostics' },

  // ── CMC / Module 3 ──────────────────────────────────────────────────────
  module3_build_all: { effect: 'write', object: 'cmc_module3', minRole: 'member' },
  module3_build_section: { effect: 'write', object: 'cmc_module3', minRole: 'member' },
  module3_refresh_stale: { effect: 'write', object: 'cmc_module3', minRole: 'member' },
  // Upserts cmc_source_objects + writes a cmc_provenance_events row.
  module3_classify_source: { effect: 'write', object: 'cmc_source_object', minRole: 'member' },
  module3_missing_inputs: { effect: 'read', object: 'cmc_module3' },
  module3_stale_sections: { effect: 'read', object: 'cmc_module3' },
  module3_readiness: { effect: 'read', object: 'cmc_module3' },
  module3_contradictions: { effect: 'read', object: 'cmc_module3' },
  module3_lineage: { effect: 'read', object: 'cmc_module3' },
  cmc_status: { effect: 'read', object: 'cmc_module3' },
  ich_compliance: { effect: 'read', object: 'cmc_module3' },
  control_strategy: { effect: 'read', object: 'cmc_module3' },
  variations_classify: { effect: 'read', object: 'cmc_variation' },

  // ── MDX phase 1 — Q-Sub / sections / 510(k) workflow ────────────────────
  'q_sub.create': {
    effect: 'write', object: 'q_sub', minRole: 'member', requiresConfirmation: true,
  },
  'q_sub.commitment.set_rolled_in': {
    effect: 'write', object: 'q_sub_commitment', minRole: 'member', requiresConfirmation: true,
  },
  'section.approve': {
    effect: 'write', object: 'document_section', minRole: 'manager', requiresConfirmation: true,
  },
  'section.update': {
    effect: 'write', object: 'document_section', minRole: 'member', requiresConfirmation: true,
  },
  'k510_workflow.preflight': { effect: 'read', object: 'k510_workflow' },
  // Transmits to the FDA ESG. Highest-impact mutation on this surface.
  'k510_workflow.transmit': {
    effect: 'write', object: 'k510_workflow', minRole: 'manager', requiresConfirmation: true,
  },
  'k510_workflow.document_preview': { effect: 'read', object: 'k510_workflow' },

  // ── MDX phase 2 — GSPR / post-market / evidence / reviewer sim ──────────
  'gspr.mapping.upsert': {
    effect: 'write', object: 'gspr_mapping', minRole: 'member', requiresConfirmation: true,
  },
  'post_market.document.create': {
    effect: 'write', object: 'post_market_document', minRole: 'member', requiresConfirmation: true,
  },
  'post_market.document.update': {
    effect: 'write', object: 'post_market_document', minRole: 'member', requiresConfirmation: true,
  },
  'post_market.document.validate': {
    effect: 'write', object: 'post_market_document', minRole: 'member', requiresConfirmation: true,
  },
  'post_market.document.approve': {
    effect: 'write', object: 'post_market_document', minRole: 'manager', requiresConfirmation: true,
  },
  'post_market.document.supersede': {
    effect: 'write', object: 'post_market_document', minRole: 'manager', requiresConfirmation: true,
  },
  'evidence_sufficiency.assess': {
    effect: 'write', object: 'evidence_sufficiency', minRole: 'member', requiresConfirmation: true,
  },
  'reviewer_simulation.run': {
    effect: 'write', object: 'reviewer_simulation', minRole: 'member', requiresConfirmation: true,
  },

  // ── MDX phase 3 — predicate / SE matrix / correspondence ────────────────
  'predicate.candidate.set_status': {
    effect: 'write', object: 'predicate_candidate', minRole: 'member', requiresConfirmation: true,
  },
  'se_matrix.patch': {
    effect: 'write', object: 'se_matrix', minRole: 'member', requiresConfirmation: true,
  },
  'correspondence.ingest': {
    effect: 'write', object: 'correspondence', minRole: 'member', requiresConfirmation: true,
  },

  // ── PDEV → IND workflow ─────────────────────────────────────────────────
  'pdev.registry.list': { effect: 'read', object: 'pdev_program' },
  'pdev.program.get': { effect: 'read', object: 'pdev_program' },
  'pdev.program.readiness': { effect: 'read', object: 'pdev_program' },
  'pdev.program.workstream': { effect: 'read', object: 'pdev_program' },
  'pdev.program.ind_assembly': { effect: 'read', object: 'pdev_ind_assembly' },
  'pdev.program.fda_interactions': { effect: 'read', object: 'pdev_fda_interaction' },
  'pdev.program.contradictions': { effect: 'read', object: 'pdev_program' },
  'pdev.fda_feedback.proposals': { effect: 'read', object: 'pdev_fda_feedback' },
  'pdev.activity.evidence_list': { effect: 'read', object: 'pdev_activity' },
  'pdev.activity.provenance': { effect: 'read', object: 'pdev_activity' },
  'pdev.workflow.status': { effect: 'read', object: 'pdev_workflow' },
  'pdev.activity.set_state': {
    effect: 'write', object: 'pdev_activity', minRole: 'member', requiresConfirmation: true,
  },
  'pdev.activity.ai_draft': {
    effect: 'write', object: 'pdev_activity', minRole: 'member', requiresConfirmation: true,
  },
  'pdev.activity.evidence_attach': {
    effect: 'write', object: 'pdev_activity', minRole: 'member', requiresConfirmation: true,
  },
  'pdev.activity.evidence_detach': {
    effect: 'write', object: 'pdev_activity', minRole: 'member', requiresConfirmation: true,
  },
  'pdev.fda_feedback.apply': {
    effect: 'write', object: 'pdev_fda_feedback', minRole: 'member', requiresConfirmation: true,
  },
  'pdev.readiness.snapshot': {
    effect: 'write', object: 'pdev_program', minRole: 'member', requiresConfirmation: true,
  },
  'pdev.workflow.kickoff': {
    effect: 'write', object: 'pdev_workflow', minRole: 'member', requiresConfirmation: true,
  },
  'pdev.ind_assembly.compile': {
    effect: 'write', object: 'pdev_ind_assembly', minRole: 'manager', requiresConfirmation: true,
  },
  'pdev.workflow.decide': {
    effect: 'write', object: 'pdev_workflow', minRole: 'manager', requiresConfirmation: true,
  },

  // ── Auditor capability ──────────────────────────────────────────────────
  'audit.explain': { effect: 'read', object: 'audit_row' },
};

export type AuthorizationDecision = { ok: true } | { ok: false; result: CommandResult };

/** Is this a positive integer id (from the verified principal)? */
function isValidId(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function deny(command: string, error: string, message: string): AuthorizationDecision {
  return { ok: false, result: { success: false, action: command, message, error } };
}

/**
 * Central, fail-closed authorization decision for one dispatched command.
 *
 * Called by `executeCommands` immediately before handler invocation, for every
 * command on every entry path. Never reads request bodies, headers, or command
 * params — identity comes only from the verified principal already stamped on
 * the CommandContext, and roles only from the canonical RBAC service.
 */
export async function authorizeCommand(
  command: string,
  ctx: CommandContext,
): Promise<AuthorizationDecision> {
  const authz = COMMAND_AUTHORIZATION[command];

  // 1. No authorization metadata → deny. This is the fail-closed-by-
  //    construction property: a handler cannot be dispatched until someone
  //    deliberately classifies it here.
  if (!authz) {
    return deny(
      command,
      'COMMAND_NOT_AUTHORIZED',
      `Command '${command}' has no authorization policy and cannot be executed.`,
    );
  }

  // 2. Read-only commands stay available even when tenant governance
  //    configuration cannot be read — the documented degraded mode. They are
  //    still tenant-scoped by ctx.organizationId in every handler's SQL and by
  //    the tenant_isolation_policy RLS underneath.
  if (authz.effect === 'read' && !authz.handlerAuthorized) {
    return { ok: true };
  }
  if (authz.effect === 'read') {
    // handlerAuthorized read (GDPR export): identity must still be provable.
    return isValidId(ctx.userId) && isValidId(ctx.organizationId)
      ? { ok: true }
      : deny(
          command,
          'RBAC_CONTEXT_MISSING',
          'Cannot authorize this action: missing user or organization context.',
        );
  }

  // ── mutation-capable from here down ────────────────────────────────────

  // 3. Governance configuration could not be read at all → block the write.
  //    A settings/DB outage must not silently strip the tenant tool policy and
  //    the Part 11 gate off a regulated mutation.
  if (ctx.governanceUnavailable === true) {
    return deny(
      command,
      'GOVERNANCE_UNAVAILABLE',
      "This change was blocked because your organization's governance configuration " +
        'could not be verified. Please retry; if it persists, contact an administrator.',
    );
  }

  // 4. Identity must come from the verified principal.
  if (!isValidId(ctx.userId) || !isValidId(ctx.organizationId)) {
    return deny(
      command,
      'RBAC_CONTEXT_MISSING',
      'Cannot authorize this action: missing user or organization context.',
    );
  }

  // 5. Parameter-dependent authorization is completed by the handler.
  if (authz.handlerAuthorized) {
    return { ok: true };
  }

  // 6. Defensive: a write with no tier is unauthorizable. CI asserts this can
  //    never happen, but never fall through to "allow".
  if (!authz.minRole) {
    return deny(
      command,
      'COMMAND_NOT_AUTHORIZED',
      `Command '${command}' has an incomplete authorization policy and cannot be executed.`,
    );
  }

  let allowed: boolean;
  try {
    allowed = await rbacService.hasRole(ctx.userId, authz.minRole, ctx.organizationId);
  } catch {
    allowed = false; // fail closed on any RBAC lookup failure
  }

  if (!allowed) {
    return deny(
      command,
      'RBAC_DENIED',
      `You do not have permission to perform '${command}'. ` +
        `This action requires at least the '${authz.minRole}' role in this organization.`,
    );
  }

  return { ok: true };
}

/**
 * Privacy-admin roles that are NOT expressible in the numeric RBAC hierarchy
 * but are recognised on organization_users.role. Read from the DB via
 * rbacService — never from a self-asserted context field.
 */
export const PRIVACY_ADMIN_ROLES: ReadonlySet<string> = new Set<string>([
  'owner',
  'dpo',
  'privacy_officer',
  'platform_admin',
]);

/**
 * Fail-closed, DB-sourced privacy-admin check for the GDPR data-subject
 * commands. Replaces the previous `hasPrivacyAdminRole(ctx.userRole)` test,
 * which read a context field the chat bridge never populates — so cross-subject
 * export/erase was decided on `undefined` rather than on a real grant.
 *
 * True when the user is manager+ in this organization, or carries one of the
 * dedicated privacy roles. Any lookup failure or missing identity → false.
 */
export async function isPrivacyAdmin(ctx: CommandContext): Promise<boolean> {
  if (!isValidId(ctx.userId) || !isValidId(ctx.organizationId)) return false;
  try {
    if (await rbacService.hasRole(ctx.userId, 'manager', ctx.organizationId)) return true;
    const roles = await rbacService.getUserRoles(ctx.userId, ctx.organizationId);
    return roles.some((r) => PRIVACY_ADMIN_ROLES.has(String(r).toLowerCase()));
  } catch {
    return false; // fail closed
  }
}
