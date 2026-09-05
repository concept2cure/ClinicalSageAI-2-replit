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
import { validateSignoff, buildSignatureRequiredResult } from './part11-governance';

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

// ─── Section content update (eSTAR / 510(k)) ────────────────────────────────

/**
 * AnA-driven section content edit. Mirrors the human path at
 * PATCH /api/cerv2-sections/:sectionId — same tenant gate, same version
 * row, same `section.edit` audit row + the `agent.ana.section.edit`
 * counterpart so an auditor can filter agent vs. human edits.
 *
 * Use case: "Update §6.0 to read 'OR-801 is substantially equivalent to
 * K191822 …'". The user can edit the document via chat, and the version
 * history captures both the previous and new content for the diff.
 *
 * Per the comment on sectionApprove above — in GA, the route + this
 * handler should call into a single section service rather than each
 * inline its own update. For BETA they share the schema and audit shape,
 * which is the property that matters for compliance.
 */
export async function sectionUpdate(
  ctx: CommandContext,
  params: Record<string, unknown>,
): Promise<CommandResult> {
  const action = 'section.update';
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
  if (typeof params.content !== 'string') {
    return {
      success: false,
      action,
      message: 'content is required (string).',
      error: 'INVALID_INPUT',
    };
  }
  const newContent = params.content;
  // 1MB cap — the largest 510(k) section in the wild we have seen is ~120KB.
  if (newContent.length > 1_000_000) {
    return {
      success: false,
      action,
      message: 'content exceeds 1MB limit.',
      error: 'INVALID_INPUT',
    };
  }

  let nextStatus: string | null = null;
  if (typeof params.status === 'string') {
    const s = params.status.toLowerCase();
    if (!['todo', 'drafting', 'validated', 'approved'].includes(s)) {
      return {
        success: false,
        action,
        message: 'status must be one of: todo, drafting, validated, approved.',
        error: 'INVALID_INPUT',
      };
    }
    nextStatus = s;
  }

  let nextCompletion: number | null = null;
  if (params.completionPercentage !== undefined && params.completionPercentage !== null) {
    const n = Number(params.completionPercentage);
    if (!Number.isInteger(n) || n < 0 || n > 100) {
      return {
        success: false,
        action,
        message: 'completionPercentage must be an integer 0–100.',
        error: 'INVALID_INPUT',
      };
    }
    nextCompletion = n;
  }

  const { pool } = await import('../../db');
  const { writeKitSectionTx, KitSectionNotFoundError } = await import('../cerv2/kit-section-write');

  /* One transaction, one writer (ledger L160). This command used to issue
     three bare pool statements — UPDATE, SELECT max(version), INSERT version —
     that could commit separately, and recorded no lineage at all. It now runs
     the shared kit-section writer on a single transaction client, so the
     content, its version row and its span lineage land together or not at
     all, exactly as the write_kit_section tool and the human PATCH do. */
  const client = await pool.connect();
  let written;
  try {
    await client.query('BEGIN');
    try {
      written = await writeKitSectionTx(client, ctx.organizationId, { sectionId }, {
        content: newContent,
        status: nextStatus,
        completionPercentage: nextCompletion,
        changeSummary: `Edited via AnA (thread ${ctx.threadId ?? '-'})`,
        actorUserId: ctx.userId,
        changedByName: `ana:${ctx.userId}`,
      });
    } catch (e) {
      await client.query('ROLLBACK').catch(() => undefined);
      if (e instanceof KitSectionNotFoundError) {
        return { success: false, action, message: e.message, error: 'NOT_FOUND' };
      }
      throw e;
    }
    await client.query('COMMIT');
  } catch (err) {
    return mapServiceError(action, err);
  } finally {
    client.release();
  }
  const before = written.before;
  const targetStatus = written.row.status;
  const targetCompletion = written.row.completionPercentage;
  const nextVersion = written.versionNumber;
  const fieldsChanged = written.fieldsChanged;

  try {
    void auditService.logAction({
      tenantId: ctx.organizationId,
      userId: ctx.userId,
      action: 'agent.ana.section.edit',
      resourceType: 'cerv2_510k_section',
      resourceId: String(sectionId),
      details: {
        ...agentAuditDetails(ctx, gate),
        sectionNumber: before.section_number,
        versionNumber: nextVersion,
        fieldsChanged,
        previousLength: (before.content ?? '').length,
        newLength: newContent.length,
        statusChanged:
          nextStatus !== null && nextStatus !== before.status
            ? `${before.status ?? 'todo'} → ${targetStatus}`
            : null,
      },
    });

    return {
      success: true,
      action,
      data: {
        sectionId,
        sectionNumber: before.section_number,
        sectionTitle: before.section_title,
        versionNumber: nextVersion,
        previousLength: (before.content ?? '').length,
        newLength: newContent.length,
        status: targetStatus,
        completionPercentage: targetCompletion,
      },
      message:
        `Updated §${before.section_number} (${(before.content ?? '').length} → ${newContent.length} chars). ` +
        `Version ${nextVersion} recorded; section.edit + agent.ana.section.edit audit rows written.`,
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

// ─── 510(k) ESG transmit (most consequential — real agency transport) ──────

/**
 * Transmit an assembled 510(k) package to the FDA Electronic Submissions
 * Gateway — the real one.
 *
 * HISTORY (why this handler looks the way it does). It used to call
 * `server/services/ESGSubmissionService`, a SECOND, parallel "ESG service"
 * whose `transmitToESG` threw `not-implemented` in production and returned a
 * `SIMULATED-NOT-SENT-*` record everywhere else. The platform's genuine AS2 /
 * RFC-4130 implementation — envelope framing, Message-ID, signed MDN with a
 * SHA-256 MIC, mTLS, SFTP fallback, the ack1/ack2/ack3 ladder — lives in
 * `server/services/submission-gateways/fda-esg.ts` and was reachable only from
 * the HTTP transmit route. So the product's device transmit affordance was
 * wired to the one path that could never reach an agency, while the path that
 * could was wired to nothing on this surface. That second transport is gone;
 * this handler now runs the SAME governed transmit as the HTTP route
 * (`executeGovernedTransmit`), so there is exactly one implementation of
 * "ship bytes to a regulator" and every guarantee travels with it.
 *
 * The governance preconditions, none of them dropped:
 *
 *   1. Verified human actor + re-authentication. `k510_workflow.transmit` is in
 *      PART11_ESIGN_COMMANDS, so the ONLY dispatch that can carry it is
 *      POST /api/ana-ri/governed-action, which verifies the signer's password
 *      (and TOTP when MFA is on) server-side before executing. This handler
 *      re-checks the verified sign-off UNCONDITIONALLY — it does not consult
 *      the tenant's `anaPart11Enforce` flag, because a tenant opt-out must not
 *      be able to un-gate an agency transmission — and refuses when the
 *      verification instant is absent rather than synthesising one.
 *   2. Stated reason. Two of them: the tool gate's ≥30-character reason and the
 *      Part 11 reason-for-change. Both are recorded.
 *   3. Deliberateness. confirm='yes-transmit' literal (not 'yes').
 *   4. Package gate. The bytes must be the server-generated descriptor the
 *      tenant-scoped assemble route wrote; missing structural-validation
 *      evidence is UNKNOWN and blocks; error-severity findings block; the path
 *      and any durable key must stay inside the bundle namespace; an active
 *      transmittal for the same package blocks. All enforced inside
 *      executeGovernedTransmit.
 *   5. Audit. The governed `sign` ledger entry is written by the shared
 *      service; the `agent.ana.*` rows below record the agent provenance.
 *
 * Fail-closed: with no FDA ESG credentials the gateway raises `CredentialError`
 * naming exactly which FDA_ESG_* variables are missing, and that is returned as
 * a structured refusal. No simulated success, no fabricated acknowledgement
 * number, no transactionId that has no agency meaning.
 *
 * NOTE ON `projectId`. The old parameter named an `fda_510k_projects` row, and
 * the deleted service "packaged" it as a zip of JSON documents plus a
 * hand-built `estar.xml` — not an FDA eSTAR (a PDF form) and not a valid eCopy.
 * Transmitting that would have been a real transmission of an invalid
 * submission, which is worse than refusing. The parameter is now `packageId`:
 * the numeric id of a locked `c2c_submission_packages` row that has been
 * assembled, which is the only trusted producer of transmittable bytes.
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

  // ── Part 11 §11.200 human gate — UNCONDITIONAL ────────────────────────
  // Not `if (ctx.part11Enforce)`: that flag is a per-tenant opt-in that
  // defaults OFF, and an agency transmission is not a thing a tenant may opt
  // out of. Absent or unverified sign-off returns the structured
  // PART11_SIGNATURE_REQUIRED refusal, which cues the client to collect the
  // reason-for-change + re-authentication and retry via
  // POST /api/ana-ri/governed-action with the same params.
  const signoffCheck = validateSignoff(ctx.signoff, { requireSignature: true });
  if (!signoffCheck.ok) {
    return buildSignatureRequiredResult(action, signoffCheck, params);
  }
  // The gateway is handed the moment the human was actually verified. A handler
  // cannot observe that, so it must be carried on the sign-off; inventing
  // `new Date()` here would stamp a fabricated verification time onto an
  // irreversible transmission.
  const reauthVerifiedAt = ctx.signoff?.verifiedAt;
  if (!(reauthVerifiedAt instanceof Date) || Number.isNaN(reauthVerifiedAt.getTime())) {
    return {
      success: false,
      action,
      message:
        'Refusing to transmit: the sign-off carries no server-recorded re-authentication time, ' +
        'so this transmission cannot name the human gate it passed. Re-submit through ' +
        'POST /api/ana-ri/governed-action.',
      error: 'PART11_SIGNATURE_REQUIRED',
    };
  }

  const packageId = Number(params.packageId);
  if (!Number.isInteger(packageId) || packageId <= 0) {
    return {
      success: false,
      action,
      message:
        'packageId is required (positive integer): the id of a locked submission package that has ' +
        'already been assembled via POST /api/submission-ops/packages/:packageId/assemble. ' +
        'Only an assembled package has transmittable bytes and a server-generated bundle descriptor.',
      error: 'INVALID_INPUT',
    };
  }

  // Never defaulted. `environment` decides whether bytes land on FDA's real
  // endpoint, and this value arrives as model-supplied JSON; silently defaulting
  // it to 'production' is how a conversation reaches a regulator by omission.
  const envRaw = typeof params.environment === 'string' ? params.environment.toLowerCase() : '';
  if (envRaw !== 'staging' && envRaw !== 'production') {
    return {
      success: false,
      action,
      message:
        "environment is required and must be 'staging' or 'production'. It is deliberately not " +
        'defaulted — it decides whether the package reaches the real FDA gateway.',
      error: 'INVALID_INPUT',
    };
  }
  const environment: 'staging' | 'production' = envRaw;

  const auditBase = {
    ...agentAuditDetails(ctx, gate),
    packageId,
    environment,
    region: 'fda',
    gateway: 'esg',
    part11ReasonForChange: ctx.signoff?.reasonForChange ?? null,
    reauthVerifiedAt: reauthVerifiedAt.toISOString(),
  };

  try {
    const { executeGovernedTransmit } = await import(
      '../submission-gateways/governed-transmit'
    );
    const { recordGovernedAction } = await import('../../routes/c2c/actions');

    const outcome = await executeGovernedTransmit({
      region: 'fda',
      gateway: 'esg',
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      packageId,
      environment,
      submissionType: '510k',
      metadata: { threadId: ctx.threadId ?? null, initiatedBy: 'agent:ana' },
      reason: gate.reason,
      reauthVerifiedAt,
      recordGovernedAction,
      surface: 'ana-mdx-command',
    });

    void auditService.logAction({
      tenantId: ctx.organizationId,
      userId: ctx.userId,
      action: 'agent.ana.k510_workflow.transmit',
      resourceType: 'submission_transmittal',
      resourceId: String(outcome.result.transmittalId),
      details: {
        ...auditBase,
        transmittalId: outcome.result.transmittalId,
        transmissionId: outcome.result.transmissionId ?? null,
        status: outcome.result.status,
        transport: outcome.result.transport,
        bundleSha256: outcome.bundle.sha256,
        ledgerWriteFailed: outcome.ledgerWriteFailed,
      },
    });

    return {
      success: true,
      action,
      data: {
        transmittalId: outcome.result.transmittalId,
        transmissionId: outcome.result.transmissionId ?? null,
        status: outcome.result.status,
        transport: outcome.result.transport,
        ackReceivedAt: outcome.result.ackReceivedAt ?? null,
        bundleSha256: outcome.bundle.sha256,
        region: 'fda',
        gateway: 'esg',
        environment,
      },
      message:
        `Package ${packageId} handed to the FDA ESG (${environment}, ${outcome.result.transport}). ` +
        `Transmittal #${outcome.result.transmittalId}, status '${outcome.result.status}'. ` +
        `${outcome.result.message} ` +
        'Poll the transmittal for the ack1/ack2/ack3 ladder — an FDA acknowledgement exists only ' +
        'once the agency sends one.',
    };
  } catch (err) {
    void auditService.logAction({
      tenantId: ctx.organizationId,
      userId: ctx.userId,
      action: 'agent.ana.k510_workflow.transmit.failed',
      resourceType: 'c2c_submission_package',
      resourceId: String(packageId),
      details: {
        ...auditBase,
        errorName: err instanceof Error ? err.name : 'unknown',
        error: err instanceof Error ? err.message : 'unknown',
      },
    });
    return mapTransmitError(action, err);
  }
}

/**
 * Map a governed-transmit failure onto a CommandResult.
 *
 * Every branch is a refusal or a failure — never a success, and never a
 * synthesised identifier. In particular `CredentialError` (raised by the FDA
 * ESG gateway when FDA_ESG_* configuration is missing) is surfaced verbatim
 * with the missing variable names it already carries, under a distinct
 * `GATEWAY_NOT_CONFIGURED` code so a surface can tell "you are not provisioned"
 * apart from "the transmission failed".
 */
function mapTransmitError(action: string, err: unknown): CommandResult {
  const name = err instanceof Error ? err.name : '';
  const detail = err instanceof Error ? err.message : 'unknown';

  if (name === 'GovernedTransmitRefusal') {
    const e = err as { code?: string; details?: Record<string, unknown> };
    return {
      success: false,
      action,
      message: `Refused: ${detail}`,
      error: e.code ?? 'TRANSMIT_REFUSED',
      data: e.details,
    };
  }
  if (name === 'CredentialError') {
    return {
      success: false,
      action,
      message:
        `Nothing was transmitted. ${detail} ` +
        'No submission was made and no FDA acknowledgement exists.',
      error: 'GATEWAY_NOT_CONFIGURED',
    };
  }
  if (name === 'TransmitAuthorizationError') {
    return { success: false, action, message: detail, error: 'HUMAN_AUTHORIZATION_REQUIRED' };
  }
  if (name === 'ValidationError') {
    return {
      success: false,
      action,
      message: detail,
      error: 'PACKAGE_NOT_TRANSMITTABLE',
      data: { findings: (err as { findings?: unknown[] }).findings ?? [] },
    };
  }
  if (name === 'TransportError' || name === 'GatewayError') {
    return {
      success: false,
      action,
      message:
        `Transmission failed at the gateway: ${detail} ` +
        'Check the transmittal record before retrying — the package may already be at FDA.',
      error: 'TRANSMIT_FAILED',
    };
  }
  return mapServiceError(action, err);
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
    name: 'section.update',
    description:
      'Edit the content of an eSTAR / 510(k) section. Replaces the section ' +
      'body with new text and writes a new version row so the diff trail ' +
      'matches the human edit path. Optional status (todo|drafting|validated|' +
      'approved) and completionPercentage (0–100). Requires confirm and reason.',
    parameters:
      'sectionId (numeric), content (string ≤1MB), status?, completionPercentage?, confirm="yes", reason',
    example:
      '"Update section 87 to read \'OR-801 is substantially equivalent to K191822 …\', reason: predicate analysis finalized after PSC review."',
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
      'Transmit an ASSEMBLED 510(k) submission package to the FDA Electronic ' +
      'Submissions Gateway over AS2. The single most consequential action in ' +
      'the platform and the only irreversible one — nothing can un-send bytes ' +
      'to an agency. Requires confirm="yes-transmit", reason ≥ 30 chars, an ' +
      'explicit environment, AND a server-verified Part 11 electronic ' +
      'signature: a chat dispatch is refused with PART11_SIGNATURE_REQUIRED ' +
      'and must be re-submitted through POST /api/ana-ri/governed-action after ' +
      'the user re-authenticates. The package must already be locked and ' +
      'assembled (POST /api/submission-ops/packages/:packageId/assemble); an ' +
      'un-assembled package has no transmittable bytes and is refused.',
    parameters:
      'packageId (positive integer — the assembled submission package, NOT a 510(k) project id), ' +
      'environment ("staging" | "production", required, never defaulted), confirm="yes-transmit", reason',
    example:
      '"Transmit submission package 12 to FDA ESG production, reason: pre-flight green, RA + QA sign-off complete, all blockers cleared."',
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
  'section.update': sectionUpdate,
  'k510_workflow.preflight': preflightModule,
  'k510_workflow.transmit': esgTransmit,
};
