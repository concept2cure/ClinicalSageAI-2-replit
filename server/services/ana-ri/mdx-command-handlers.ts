/**
 * AnA MDX command handlers — gives AnA the ability to execute governed
 * MDX-module mutations (Q-Sub, eSTAR sections, pre-flight, ESG transmit,
 * regulatory correspondence, etc.).
 *
 * Design principles (matches the answer in the AnA-MDX capability audit):
 *
 * 1. Every governed mutation requires a two-phase invocation:
 *      a. AnA proposes the action (or the user asks it to);
 *      b. The user confirms with `confirm: 'yes'` + a `reason` string.
 *    Without both, the handler returns `success: false, action:
 *    'confirmation_required'` and the chat layer re-prompts the user.
 *
 * 2. Audit codes are prefixed `agent.ana.<resource>.<verb>` so an auditor
 *    can distinguish AnA-initiated mutations from human ones in the
 *    central audit_logs table. The reason-for-change is captured in
 *    audit details.
 *
 * 3. Tenant scope: every handler reads `ctx.organizationId` from the
 *    chat context and passes it to the underlying service. The service
 *    enforces tenant isolation via its existing JOIN on
 *    `regulatory_programs.organization_id` (Q-Sub) or equivalent.
 *
 * 4. createdBy / approvedBy / etc. are stamped `ana:<userId>` so the
 *    underlying domain row also carries the agent provenance, even
 *    though the audit row is the canonical record.
 *
 * 5. Errors are mapped: TenantAccessError → 403-equivalent CommandResult,
 *    validation errors → 422-equivalent, everything else → generic.
 */

import {
  createQSubmission,
  setCommitmentRolledIn,
  TenantAccessError,
  type QSubType,
} from '../q-sub/q-sub.service';
import { Q_SUB_TYPES } from '../../../shared/schema/q-sub';
import auditService from '../auditService';
import type { CommandContext, CommandResult } from './command-executor';
import { requireGovernedToolGate, mapServiceError, agentAuditDetails } from './mdx-tool-policy';

// ─── Local helpers ──────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ─── Q-Sub create ───────────────────────────────────────────────────────────

export async function qSubCreate(
  ctx: CommandContext,
  params: Record<string, unknown>,
): Promise<CommandResult> {
  const action = 'q_sub.create';
  const gate = requireGovernedToolGate(action, ctx, params);
  if (!gate.ok) return gate.result;

  const programId = typeof params.programId === 'string' ? params.programId : '';
  if (!UUID_RE.test(programId)) {
    return {
      success: false,
      action,
      message: 'programId is required and must be a UUID.',
      error: 'INVALID_INPUT',
    };
  }
  const qSubType = typeof params.qSubType === 'string' ? params.qSubType : '';
  if (!Q_SUB_TYPES.includes(qSubType as QSubType)) {
    return {
      success: false,
      action,
      message: `qSubType must be one of: ${Q_SUB_TYPES.join(', ')}.`,
      error: 'INVALID_INPUT',
    };
  }
  const title = typeof params.title === 'string' ? params.title.trim() : '';
  if (title.length === 0) {
    return {
      success: false,
      action,
      message: 'title is required.',
      error: 'INVALID_INPUT',
    };
  }

  let targetDate: Date | null = null;
  if (typeof params.targetDate === 'string' && params.targetDate.length > 0) {
    const d = new Date(params.targetDate);
    if (Number.isNaN(d.getTime())) {
      return {
        success: false,
        action,
        message: 'targetDate must be an ISO-8601 date string.',
        error: 'INVALID_INPUT',
      };
    }
    targetDate = d;
  }

  try {
    const row = await createQSubmission(ctx.organizationId, {
      programId,
      qSubType: qSubType as QSubType,
      title,
      fdaTeam: typeof params.fdaTeam === 'string' ? params.fdaTeam : null,
      targetDate,
      summary: typeof params.summary === 'string' ? params.summary : null,
      createdBy: `ana:${ctx.userId}`,
    });

    void auditService.logAction({
      tenantId: ctx.organizationId,
      userId: ctx.userId,
      action: 'agent.ana.q_sub.create',
      resourceType: 'q_submission',
      resourceId: String(row.id),
      details: {
        ...agentAuditDetails(ctx, gate),
        programId: row.programId,
        qSubType: row.qSubType,
        title: row.title,
      },
    });

    return {
      success: true,
      action,
      data: {
        id: row.id,
        programId: row.programId,
        qSubType: row.qSubType,
        title: row.title,
        stage: row.stage,
      },
      message:
        `Created ${qSubType} Q-Sub "${title}" under program ${programId}. ` +
        `It is in stage 'plan' until you file the package.`,
    };
  } catch (err) {
    return mapServiceError(action, err);
  }
}

// ─── Q-Sub commitment rolled-in toggle ──────────────────────────────────────

export async function qSubCommitmentSetRolledIn(
  ctx: CommandContext,
  params: Record<string, unknown>,
): Promise<CommandResult> {
  const action = 'q_sub.commitment.set_rolled_in';
  const gate = requireGovernedToolGate(action, ctx, params);
  if (!gate.ok) return gate.result;

  const commitmentId = typeof params.commitmentId === 'string' ? params.commitmentId : '';
  if (!UUID_RE.test(commitmentId)) {
    return {
      success: false,
      action,
      message: 'commitmentId is required and must be a UUID.',
      error: 'INVALID_INPUT',
    };
  }
  if (typeof params.rolledIn !== 'boolean') {
    return {
      success: false,
      action,
      message: 'rolledIn (boolean) is required.',
      error: 'INVALID_INPUT',
    };
  }

  try {
    const updated = await setCommitmentRolledIn(ctx.organizationId, {
      commitmentId,
      rolledIn: params.rolledIn,
      rolledInBy: params.rolledIn ? `ana:${ctx.userId}` : null,
    });

    void auditService.logAction({
      tenantId: ctx.organizationId,
      userId: ctx.userId,
      action: params.rolledIn
        ? 'agent.ana.q_sub.commitment.rolled_in'
        : 'agent.ana.q_sub.commitment.rolled_out',
      resourceType: 'q_sub_commitment',
      resourceId: String(updated.id),
      details: {
        ...agentAuditDetails(ctx, gate),
        displayCode: updated.displayCode,
        dossierLinkSectionId: updated.dossierLinkSectionId,
        rolledIn: updated.rolledIn,
      },
    });

    return {
      success: true,
      action,
      data: {
        id: updated.id,
        displayCode: updated.displayCode,
        rolledIn: updated.rolledIn,
      },
      message: params.rolledIn
        ? `Marked commitment ${updated.displayCode} as rolled in.`
        : `Cleared rolled-in flag on commitment ${updated.displayCode}.`,
    };
  } catch (err) {
    return mapServiceError(action, err);
  }
}

// ─── Section approve (eSTAR / 510(k)) ───────────────────────────────────────

/**
 * AnA-driven section approval. Wraps the existing PATCH
 * /api/cerv2-sections/:sectionId behavior by directly setting status to
 * 'validated' or 'approved'. Uses raw SQL via pool because the section
 * service doesn't expose a public "approve" function — the handler in
 * server/routes/cerv2-sections.ts inlines the logic.
 *
 * For BETA, this is acceptable; in GA the section approval should be
 * extracted into a service module that the route AND this handler both
 * consume.
 */
export async function sectionApprove(
  ctx: CommandContext,
  params: Record<string, unknown>,
): Promise<CommandResult> {
  const action = 'section.approve';
  const gate = requireGovernedToolGate(action, ctx, params);
  if (!gate.ok) return gate.result;

  const sectionId = Number(params.sectionId);
  if (!Number.isFinite(sectionId)) {
    return {
      success: false,
      action,
      message: 'sectionId is required (numeric).',
      error: 'INVALID_INPUT',
    };
  }
  const targetStatus =
    typeof params.status === 'string' ? params.status.toLowerCase() : 'validated';
  if (!['validated', 'approved'].includes(targetStatus)) {
    return {
      success: false,
      action,
      message: 'status must be "validated" or "approved".',
      error: 'INVALID_INPUT',
    };
  }

  // Lazy import to avoid pulling pg at module load when the handler is
  // not invoked.
  const { pool } = await import('../../db');

  try {
    // Tenant gate via the org_id check in the WHERE clause.
    const existing = await pool.query(
      `SELECT id, section_number, section_title, status FROM cerv2_510k_sections
       WHERE organization_id = $1 AND id = $2 LIMIT 1`,
      [ctx.organizationId, sectionId],
    );
    if (existing.rows.length === 0) {
      return {
        success: false,
        action,
        message: `Section ${sectionId} not found in your organization.`,
        error: 'NOT_FOUND',
      };
    }

    const before = existing.rows[0];
    const now = new Date();
    await pool.query(
      `UPDATE cerv2_510k_sections
       SET status = $1, updated_at = $2
       WHERE organization_id = $3 AND id = $4`,
      [targetStatus, now, ctx.organizationId, sectionId],
    );

    void auditService.logAction({
      tenantId: ctx.organizationId,
      userId: ctx.userId,
      action: 'agent.ana.section.approve',
      resourceType: 'cerv2_510k_section',
      resourceId: String(sectionId),
      details: {
        ...agentAuditDetails(ctx, gate),
        sectionNumber: before.section_number,
        previousStatus: before.status ?? null,
        newStatus: targetStatus,
      },
    });

    return {
      success: true,
      action,
      data: {
        sectionId,
        sectionNumber: before.section_number,
        sectionTitle: before.section_title,
        previousStatus: before.status,
        newStatus: targetStatus,
      },
      message: `Section §${before.section_number} approved (${before.status ?? 'todo'} → ${targetStatus}).`,
    };
  } catch (err) {
    return mapServiceError(action, err);
  }
}

// ─── 510(k) module pre-flight (read-only — no confirmation required) ────────

/**
 * Pre-flight is a read action; it doesn't mutate state. We still audit
 * it so AnA-initiated runs are traceable, but we skip the confirmation
 * gate since the user can ask "preflight my dossier" without governance
 * cost.
 */
export async function preflightModule(
  ctx: CommandContext,
  params: Record<string, unknown>,
): Promise<CommandResult> {
  const action = 'k510_workflow.preflight';
  const projectId = Number(params.projectId);
  if (!Number.isFinite(projectId)) {
    return {
      success: false,
      action,
      message: 'projectId is required (numeric).',
      error: 'INVALID_INPUT',
    };
  }
  const moduleCode = typeof params.moduleCode === 'string' ? params.moduleCode : '';
  if (!moduleCode) {
    return {
      success: false,
      action,
      message: 'moduleCode is required.',
      error: 'INVALID_INPUT',
    };
  }

  // The route handler at /api/authoring-actions/module-preflight already
  // does the heavy lifting. We invoke its logic via internal HTTP fetch
  // to keep the orchestration consistent.
  const internalUrl = process.env.INTERNAL_BFF_URL || 'http://localhost:3000';
  try {
    const res = await fetch(`${internalUrl}/api/authoring-actions/module-preflight`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Service-to-service token; for production this should be a
        // dedicated AnA service principal, not the user's JWT.
        'X-Service-Token': process.env.ANA_SERVICE_TOKEN || '',
        'X-Tenant-Id': String(ctx.organizationId),
        'X-User-Id': String(ctx.userId),
      },
      body: JSON.stringify({
        projectId,
        moduleCode,
        regulatorBody: params.regulatorBody ?? null,
        submissionType: params.submissionType ?? null,
      }),
    });
    if (!res.ok) {
      return {
        success: false,
        action,
        message: `Pre-flight failed (HTTP ${res.status}).`,
        error: 'EXECUTION_FAILED',
      };
    }
    const body = await res.json();

    void auditService.logAction({
      tenantId: ctx.organizationId,
      userId: ctx.userId,
      action: 'agent.ana.k510_workflow.preflight',
      resourceType: 'k510_module_preflight',
      resourceId: `${projectId}:${moduleCode}`,
      details: {
        actorKind: 'agent:ana',
        // Read-only action: no gate, hence no agentReason / artifact flag.
        threadId: ctx.threadId ?? null,
        chatMessageId: ctx.chatMessageId ?? null,
        moduleCode,
        overall: body?.overall ?? null,
        majorBlockerCount: Array.isArray(body?.majorBlockers) ? body.majorBlockers.length : 0,
      },
    });

    return {
      success: true,
      action,
      data: body,
      message: `Pre-flight for module ${moduleCode}: ${body?.overall ?? 'unknown'}.`,
    };
  } catch (err) {
    return mapServiceError(action, err);
  }
}

// ─── 510(k) ESG transmit (most consequential — dual confirmation) ───────────

/**
 * ESG transmit is the single most consequential mutation in the platform.
 * Beyond the standard confirm + reason, this handler requires:
 *   - confirm = 'yes-transmit' (literal — the human must type this exact
 *     phrase, not just 'yes')
 *   - reason ≥ 30 characters
 * This is intentionally awkward to invoke via chat, matching the §11.10
 * deliberateness expectation.
 */
export async function esgTransmit(
  ctx: CommandContext,
  params: Record<string, unknown>,
): Promise<CommandResult> {
  const action = 'k510_workflow.transmit';

  // Strictest gate: 'yes-transmit' literal + 30-char reason. Tenant
  // policy + reason-quality filters apply too.
  const gate = requireGovernedToolGate(action, ctx, params, {
    expected: 'yes-transmit',
    minReasonLength: 30,
  });
  if (!gate.ok) return gate.result;

  const projectId = Number(params.projectId);
  if (!Number.isFinite(projectId)) {
    return {
      success: false,
      action,
      message: 'projectId is required (numeric).',
      error: 'INVALID_INPUT',
    };
  }

  try {
    const ESGSubmissionService = (await import('../ESGSubmissionService')).default;
    const svc = new ESGSubmissionService();
    const response = await svc.submitToFDA(projectId, ctx.userId, ctx.organizationId);

    void auditService.logAction({
      tenantId: ctx.organizationId,
      userId: ctx.userId,
      action: 'agent.ana.k510_workflow.transmit',
      resourceType: 'fda_510k_submission_package',
      resourceId: String((response as any)?.packageId ?? projectId),
      details: {
        ...agentAuditDetails(ctx, gate),
        projectId,
        transactionId: (response as any)?.transactionId ?? null,
      },
    });

    return {
      success: true,
      action,
      data: response as Record<string, unknown>,
      message: `Transmitted project ${projectId} to FDA ESG.`,
    };
  } catch (err) {
    void auditService.logAction({
      tenantId: ctx.organizationId,
      userId: ctx.userId,
      action: 'agent.ana.k510_workflow.transmit.failed',
      resourceType: 'fda_510k_submission_package',
      resourceId: String(projectId),
      details: {
        ...agentAuditDetails(ctx, gate),
        error: err instanceof Error ? err.message : 'unknown',
      },
    });
    return mapServiceError(action, err);
  }
}

// ─── Metadata for the AnA intent parser / OpenAI tools ──────────────────────

export const MDX_COMMAND_METADATA = [
  {
    name: 'q_sub.create',
    description:
      'Create a new Pre-Submission, Submission Issue Request, Study Risk ' +
      'Determination, Agreement, or Informational Q-Submission for a ' +
      'regulatory program. Lands in stage="plan". Requires confirm and reason.',
    parameters:
      'programId (UUID), qSubType (presub|sir|srd|agree|info), title, fdaTeam?, targetDate?, summary?, confirm="yes", reason',
    example: '"File a Pre-Sub on OR-801 for predicate-strategy questions, with reason."',
  },
  {
    name: 'q_sub.commitment.set_rolled_in',
    description:
      'Toggle the rolled-in flag on a Q-Sub commitment to mark whether it ' +
      'has been integrated into the dossier. Requires confirm and reason.',
    parameters: 'commitmentId (UUID), rolledIn (boolean), confirm="yes", reason',
    example: '"Mark commitment cm-1142-3 as rolled in, reason: SAP amendment landed."',
  },
  {
    name: 'section.approve',
    description:
      'Approve an eSTAR / 510(k) section by transitioning its status to ' +
      '"validated" or "approved". Requires confirm and reason.',
    parameters: 'sectionId (numeric), status (validated|approved), confirm="yes", reason',
    example: '"Approve section 42 as validated, reason: peer review complete."',
  },
  {
    name: 'k510_workflow.preflight',
    description:
      'Run a pre-flight RTA gate on a 510(k) project module. Read-only; no ' +
      'confirmation required.',
    parameters: 'projectId (numeric), moduleCode, regulatorBody?, submissionType?',
    example: '"Pre-flight module 6 of project 12."',
  },
  {
    name: 'k510_workflow.transmit',
    description:
      'Transmit a 510(k) submission package to the FDA Electronic ' +
      'Submissions Gateway. The single most consequential mutation in the ' +
      'platform — requires confirm="yes-transmit" and reason ≥ 30 chars.',
    parameters: 'projectId (numeric), confirm="yes-transmit", reason',
    example:
      '"Transmit project 12 to FDA ESG, reason: pre-flight green, RA + QA sign-off complete, all blockers cleared."',
  },
];

// ─── Dispatch map exported for command-executor to merge ────────────────────

export const MDX_COMMAND_HANDLERS: Record<
  string,
  (ctx: CommandContext, params: Record<string, unknown>) => Promise<CommandResult>
> = {
  'q_sub.create': qSubCreate,
  'q_sub.commitment.set_rolled_in': qSubCommitmentSetRolledIn,
  'section.approve': sectionApprove,
  'k510_workflow.preflight': preflightModule,
  'k510_workflow.transmit': esgTransmit,
};
