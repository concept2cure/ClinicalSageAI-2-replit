/**
 * AnA MDX command handlers — phase 2.
 *
 * Adds the remaining MDX tools beyond phase 1:
 *   - gspr.mapping.upsert
 *   - post_market.document.{create, update, validate, approve, supersede}
 *   - evidence_sufficiency.assess
 *   - reviewer_simulation.run
 *
 * Same contract as phase 1: every state-mutating handler enforces
 * confirm + reason via requireAgentConfirm; reads are gated lighter
 * (assess + reviewer_simulation are persisted-side-effect runs, so
 * they DO require confirm + reason despite being analysis actions).
 *
 * Tools NOT yet wired (gated on external work, not laziness):
 *   - correspondence.ingest — needs Brief #2 surface for AnA-driven
 *     ingestion to make sense. Direct service call without UI is
 *     low-value.
 *   - predicate.candidate.set_status / se_matrix.patch — proxy through
 *     the BFF route since the underlying mutation lives in the Python
 *     shadow service. Phase 3 can add an internal-fetch handler when
 *     we wire the shadow's tool surface.
 */

import auditService from '../auditService';
import {
  upsertMapping,
} from '../gspr-postmarket/gspr.service';
import {
  approveDocument,
  createDocument,
  supersedeDocument,
  updateDocument,
  validateDocument,
  getDocument,
  type ApproveArgs,
} from '../gspr-postmarket/post-market.service';
import {
  assessSufficiency,
  type DeviceProfileFlags,
} from '../evidence-sufficiency/evidence-sufficiency.service';
import { runReviewerSimulation } from '../intelligence-engine/reviewer-simulator.service';
import type { CommandContext, CommandResult } from './command-executor';
import { requireGovernedToolGate, mapServiceError, agentAuditDetails } from './mdx-tool-policy';

// ─── Local helpers ──────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ─── GSPR mapping upsert ────────────────────────────────────────────────────

export async function gsprMappingUpsert(
  ctx: CommandContext,
  params: Record<string, unknown>,
): Promise<CommandResult> {
  const action = 'gspr.mapping.upsert';
  const gate = requireGovernedToolGate(action, ctx, params);
  if (!gate.ok) return gate.result;

  const programId = typeof params.programId === 'string' ? params.programId : '';
  if (!UUID_RE.test(programId)) {
    return { success: false, action, message: 'programId must be a UUID.', error: 'INVALID_INPUT' };
  }
  const requirementId = typeof params.requirementId === 'string' ? params.requirementId : '';
  if (!requirementId) {
    return { success: false, action, message: 'requirementId is required.', error: 'INVALID_INPUT' };
  }
  const applicability = typeof params.applicability === 'string' ? params.applicability : '';
  if (!applicability) {
    return { success: false, action, message: 'applicability is required.', error: 'INVALID_INPUT' };
  }

  try {
    const row = await upsertMapping({
      organizationId: ctx.organizationId,
      programId,
      requirementId,
      applicability: applicability as any,
      decidedBy: `ana:${ctx.userId}`,
      decidedAt: new Date(),
    });

    void auditService.logAction({
      tenantId: ctx.organizationId,
      userId: ctx.userId,
      action: 'agent.ana.gspr.mapping.upsert',
      resourceType: 'gspr_program_mapping',
      resourceId: String((row as any)?.id ?? `${programId}:${requirementId}`),
      details: {
        ...agentAuditDetails(ctx, gate),
        programId,
        requirementId,
        applicability,
      },
    });

    return {
      success: true,
      action,
      data: row as Record<string, unknown>,
      message: `Upserted GSPR mapping (${requirementId} → ${applicability}) on program ${programId}.`,
    };
  } catch (err) {
    return mapServiceError(action, err);
  }
}

// ─── Post-market document mutations ─────────────────────────────────────────

export async function postMarketDocumentCreate(
  ctx: CommandContext,
  params: Record<string, unknown>,
): Promise<CommandResult> {
  const action = 'post_market.document.create';
  const gate = requireGovernedToolGate(action, ctx, params);
  if (!gate.ok) return gate.result;

  const programId = typeof params.programId === 'string' ? params.programId : '';
  if (!UUID_RE.test(programId)) {
    return { success: false, action, message: 'programId must be a UUID.', error: 'INVALID_INPUT' };
  }
  const documentType = typeof params.documentType === 'string' ? params.documentType : '';
  const code = typeof params.code === 'string' ? params.code : '';
  const title = typeof params.title === 'string' ? params.title : '';
  if (!documentType || !code || !title) {
    return {
      success: false,
      action,
      message: 'documentType, code, and title are required.',
      error: 'INVALID_INPUT',
    };
  }

  try {
    const doc = await createDocument({
      organizationId: ctx.organizationId,
      programId,
      documentType: documentType as any,
      code,
      title,
      createdBy: `ana:${ctx.userId}`,
      updatedBy: `ana:${ctx.userId}`,
    });

    void auditService.logAction({
      tenantId: ctx.organizationId,
      userId: ctx.userId,
      action: 'agent.ana.post_market.document.create',
      resourceType: 'post_market_document',
      resourceId: String((doc as any)?.id ?? code),
      details: {
        ...agentAuditDetails(ctx, gate),
        programId,
        documentType,
        code,
        title,
      },
    });

    return {
      success: true,
      action,
      data: doc as Record<string, unknown>,
      message: `Created post-market document ${code} (${documentType}).`,
    };
  } catch (err) {
    return mapServiceError(action, err);
  }
}

export async function postMarketDocumentApprove(
  ctx: CommandContext,
  params: Record<string, unknown>,
): Promise<CommandResult> {
  const action = 'post_market.document.approve';
  const gate = requireGovernedToolGate(action, ctx, params);
  if (!gate.ok) return gate.result;

  const documentId = typeof params.documentId === 'string' ? params.documentId : '';
  if (!documentId) {
    return { success: false, action, message: 'documentId is required.', error: 'INVALID_INPUT' };
  }

  try {
    const result = await approveDocument({
      organizationId: ctx.organizationId,
      documentId,
      approvedBy: `ana:${ctx.userId}`,
      signatureId: typeof params.signatureId === 'string' ? params.signatureId : undefined,
    } as ApproveArgs);

    if ('error' in (result as any)) {
      const code = (result as any).error;
      void auditService.logAction({
        tenantId: ctx.organizationId,
        userId: ctx.userId,
        action: 'agent.ana.post_market.document.approve.blocked',
        resourceType: 'post_market_document',
        resourceId: documentId,
        details: { ...agentAuditDetails(ctx, gate), reason: code },
      });
      return {
        success: false,
        action,
        message: `Approve refused: ${code}.`,
        error: code === 'NOT_FOUND' ? 'NOT_FOUND' : 'GATE_BLOCKED',
        data: result as Record<string, unknown>,
      };
    }

    void auditService.logAction({
      tenantId: ctx.organizationId,
      userId: ctx.userId,
      action: 'agent.ana.post_market.document.approve',
      resourceType: 'post_market_document',
      resourceId: documentId,
      details: {
        ...agentAuditDetails(ctx, gate),
        signatureId: typeof params.signatureId === 'string' ? params.signatureId : null,
      },
    });

    return {
      success: true,
      action,
      data: result as Record<string, unknown>,
      message: `Approved post-market document ${documentId}.`,
    };
  } catch (err) {
    return mapServiceError(action, err);
  }
}

// ─── Evidence sufficiency assess (always persisted; gated as mutation) ──────

export async function evidenceSufficiencyAssess(
  ctx: CommandContext,
  params: Record<string, unknown>,
): Promise<CommandResult> {
  const action = 'evidence_sufficiency.assess';
  const gate = requireGovernedToolGate(action, ctx, params);
  if (!gate.ok) return gate.result;

  const programId = typeof params.programId === 'string' ? params.programId : '';
  if (!UUID_RE.test(programId)) {
    return { success: false, action, message: 'programId must be a UUID.', error: 'INVALID_INPUT' };
  }
  const pathway = typeof params.pathway === 'string' ? params.pathway : '';
  if (!['PMA', 'DE_NOVO', '510K'].includes(pathway)) {
    return {
      success: false,
      action,
      message: 'pathway must be PMA | DE_NOVO | 510K.',
      error: 'INVALID_INPUT',
    };
  }
  const profile =
    params.profile && typeof params.profile === 'object'
      ? (params.profile as DeviceProfileFlags)
      : null;
  if (!profile) {
    return {
      success: false,
      action,
      message: 'profile (DeviceProfileFlags) is required.',
      error: 'INVALID_INPUT',
    };
  }

  try {
    const result = await assessSufficiency({
      organizationId: ctx.organizationId,
      programId,
      pathway: pathway as any,
      profile,
      trigger: 'ana',
      triggeredBy: `ana:${ctx.userId}`,
      dryRun: false,
    });

    void auditService.logAction({
      tenantId: ctx.organizationId,
      userId: ctx.userId,
      action: 'agent.ana.evidence_sufficiency.assess',
      resourceType: 'evidence_sufficiency_assessment',
      resourceId: (result as any)?.id ?? programId,
      details: {
        ...agentAuditDetails(ctx, gate),
        programId,
        pathway,
        verdict: (result as any)?.verdict ?? null,
        overallScore: (result as any)?.overallScore ?? null,
      },
    });

    return {
      success: true,
      action,
      // Serialization boundary: a typed SufficiencyResult is a plain JSON object.
      data: result as unknown as Record<string, unknown>,
      message: `Assessed evidence sufficiency: verdict=${(result as any)?.verdict}.`,
    };
  } catch (err) {
    return mapServiceError(action, err);
  }
}

// ─── Reviewer simulation run (persisted; gated) ─────────────────────────────

export async function reviewerSimulationRun(
  ctx: CommandContext,
  params: Record<string, unknown>,
): Promise<CommandResult> {
  const action = 'reviewer_simulation.run';
  const gate = requireGovernedToolGate(action, ctx, params);
  if (!gate.ok) return gate.result;

  const programId = typeof params.programId === 'string' ? params.programId : '';
  if (!UUID_RE.test(programId)) {
    return { success: false, action, message: 'programId must be a UUID.', error: 'INVALID_INPUT' };
  }
  if (!params.program || typeof params.program !== 'object') {
    return { success: false, action, message: 'program object is required.', error: 'INVALID_INPUT' };
  }
  if (!params.intel || typeof params.intel !== 'object') {
    return { success: false, action, message: 'intel object is required.', error: 'INVALID_INPUT' };
  }

  try {
    const result = await runReviewerSimulation({
      organizationId: ctx.organizationId,
      programId,
      program: params.program as any,
      packet: (params.packet as any) ?? null,
      intel: params.intel as any,
      reports: params.reports as any,
      personas: Array.isArray(params.personas) ? (params.personas as any) : undefined,
      defensePacketId: typeof params.defensePacketId === 'string' ? params.defensePacketId : undefined,
      trigger: 'ana',
      triggeredBy: `ana:${ctx.userId}`,
      dryRun: false,
    });

    void auditService.logAction({
      tenantId: ctx.organizationId,
      userId: ctx.userId,
      action: 'agent.ana.reviewer_simulation.run',
      resourceType: 'reviewer_simulation_run',
      resourceId: (result as any)?.runId ?? programId,
      details: {
        ...agentAuditDetails(ctx, gate),
        programId,
        personaCount: Array.isArray(params.personas) ? params.personas.length : null,
      },
    });

    return {
      success: true,
      action,
      // Serialization boundary: a typed SimulatorResult is a plain JSON object.
      data: result as unknown as Record<string, unknown>,
      message: `Ran reviewer simulation on program ${programId}.`,
    };
  } catch (err) {
    return mapServiceError(action, err);
  }
}

// ─── Post-market document update / validate / supersede ───────────────────

export async function postMarketDocumentUpdate(
  ctx: CommandContext,
  params: Record<string, unknown>,
): Promise<CommandResult> {
  const action = 'post_market.document.update';
  const gate = requireGovernedToolGate(action, ctx, params);
  if (!gate.ok) return gate.result;

  const documentId = typeof params.documentId === 'string' ? params.documentId : '';
  if (!documentId) {
    return { success: false, action, message: 'documentId is required.', error: 'INVALID_INPUT' };
  }
  const patch =
    params.patch && typeof params.patch === 'object' ? (params.patch as Record<string, unknown>) : null;
  if (!patch) {
    return { success: false, action, message: 'patch (object) is required.', error: 'INVALID_INPUT' };
  }

  try {
    const updated = await updateDocument(ctx.organizationId, documentId, {
      ...patch,
      updatedBy: `ana:${ctx.userId}`,
    });
    if (!updated) {
      return { success: false, action, message: 'Document not found.', error: 'NOT_FOUND' };
    }

    void auditService.logAction({
      tenantId: ctx.organizationId,
      userId: ctx.userId,
      action: 'agent.ana.post_market.document.update',
      resourceType: 'post_market_document',
      resourceId: documentId,
      details: {
        ...agentAuditDetails(ctx, gate),
        fieldsChanged: Object.keys(patch),
      },
    });

    return {
      success: true,
      action,
      data: updated as Record<string, unknown>,
      message: `Updated post-market document ${documentId}.`,
    };
  } catch (err) {
    return mapServiceError(action, err);
  }
}

export async function postMarketDocumentValidate(
  ctx: CommandContext,
  params: Record<string, unknown>,
): Promise<CommandResult> {
  const action = 'post_market.document.validate';
  // Validation is read-only-ish (returns findings; no mutation), but it
  // PERSISTS via downstream side effects in some pathways. Gate it
  // lightly: confirm + reason still required, since the act of running
  // a validation against a tenant's document is itself an audit event.
  const gate = requireGovernedToolGate(action, ctx, params);
  if (!gate.ok) return gate.result;

  const documentId = typeof params.documentId === 'string' ? params.documentId : '';
  if (!documentId) {
    return { success: false, action, message: 'documentId is required.', error: 'INVALID_INPUT' };
  }

  try {
    const doc = await getDocument(ctx.organizationId, documentId);
    if (!doc) {
      return { success: false, action, message: 'Document not found.', error: 'NOT_FOUND' };
    }
    const result = validateDocument(doc);

    void auditService.logAction({
      tenantId: ctx.organizationId,
      userId: ctx.userId,
      action: 'agent.ana.post_market.document.validate',
      resourceType: 'post_market_document',
      resourceId: documentId,
      details: {
        ...agentAuditDetails(ctx, gate),
        passed: (result as any)?.valid ?? null,
        findings: Array.isArray((result as any)?.findings) ? (result as any).findings.length : null,
      },
    });

    return {
      success: true,
      action,
      // Serialization boundary: a typed PostMarketValidationResult is a plain JSON object.
      data: result as unknown as Record<string, unknown>,
      message: `Validated post-market document ${documentId}: ${
        (result as any)?.valid ? 'pass' : 'findings present'
      }.`,
    };
  } catch (err) {
    return mapServiceError(action, err);
  }
}

export async function postMarketDocumentSupersede(
  ctx: CommandContext,
  params: Record<string, unknown>,
): Promise<CommandResult> {
  const action = 'post_market.document.supersede';
  const gate = requireGovernedToolGate(action, ctx, params);
  if (!gate.ok) return gate.result;

  const documentId = typeof params.documentId === 'string' ? params.documentId : '';
  if (!documentId) {
    return { success: false, action, message: 'documentId is required.', error: 'INVALID_INPUT' };
  }

  try {
    const newDoc = await supersedeDocument(ctx.organizationId, documentId, {
      newTitle: typeof params.newTitle === 'string' ? params.newTitle : undefined,
      createdBy: `ana:${ctx.userId}`,
    });
    if (!newDoc) {
      return { success: false, action, message: 'Document not found.', error: 'NOT_FOUND' };
    }

    void auditService.logAction({
      tenantId: ctx.organizationId,
      userId: ctx.userId,
      action: 'agent.ana.post_market.document.supersede',
      resourceType: 'post_market_document',
      resourceId: documentId,
      details: {
        ...agentAuditDetails(ctx, gate),
        newDocumentId: (newDoc as any)?.id ?? null,
        newTitle: typeof params.newTitle === 'string' ? params.newTitle : null,
      },
    });

    return {
      success: true,
      action,
      data: newDoc as Record<string, unknown>,
      message: `Superseded post-market document ${documentId}.`,
    };
  } catch (err) {
    return mapServiceError(action, err);
  }
}

// ─── Metadata ───────────────────────────────────────────────────────────────

export const MDX_COMMAND_METADATA_PHASE2 = [
  {
    name: 'gspr.mapping.upsert',
    description:
      'Upsert a GSPR (EU MDR Annex I / IVDR Annex I) requirement-to-program ' +
      'mapping. Captures sponsor applicability decision + decidedBy. ' +
      'Requires confirm + reason.',
    parameters: 'programId (UUID), requirementId, applicability, confirm="yes", reason',
    example:
      '"Mark GSPR-12 as applicable on program OR-801, reason: device contacts intact skin only."',
  },
  {
    name: 'post_market.document.create',
    description:
      'Create a draft post-market document (PMS plan, PMCF, complaint log, ' +
      'KPI report). Requires confirm + reason.',
    parameters: 'programId (UUID), documentType, code, title, confirm="yes", reason',
    example: '"Create a PMCF plan PMCF-2025-Q3 on program OR-801."',
  },
  {
    name: 'post_market.document.approve',
    description:
      'Approve a post-market document. Requires confirm + reason. May be ' +
      'gate-blocked if validation fails.',
    parameters: 'documentId, signatureId?, confirm="yes", reason',
    example: '"Approve PMCF document d-12 with signature sig-7."',
  },
  {
    name: 'post_market.document.update',
    description:
      'Patch a post-market document with arbitrary fields. Requires confirm + reason.',
    parameters: 'documentId, patch (object), confirm="yes", reason',
    example: '"Update PMCF document d-12, patch: {assignee: \'sarah.chen\'}"',
  },
  {
    name: 'post_market.document.validate',
    description:
      'Run validation against a post-market document. Returns findings list. ' +
      'Requires confirm + reason because the validation event is audited.',
    parameters: 'documentId, confirm="yes", reason',
    example: '"Validate PMCF document d-12 before approval."',
  },
  {
    name: 'post_market.document.supersede',
    description: 'Supersede a post-market document with a new version. Requires confirm + reason.',
    parameters: 'documentId, newTitle?, confirm="yes", reason',
    example: '"Supersede PMCF d-12 with new title PMCF-2026-Q1."',
  },
  {
    name: 'evidence_sufficiency.assess',
    description:
      'Run an evidence-sufficiency assessment for a regulatory program. ' +
      'Persists the assessment row. Requires confirm + reason.',
    parameters: 'programId (UUID), pathway (PMA|DE_NOVO|510K), profile (DeviceProfileFlags), confirm="yes", reason',
    example:
      '"Assess evidence sufficiency for OR-801 as 510K with profile {isImplantable: true}."',
  },
  {
    name: 'reviewer_simulation.run',
    description:
      'Run a multi-persona reviewer simulation against a program. Persists ' +
      'the run. Requires confirm + reason.',
    parameters:
      'programId (UUID), program (object), intel (object), packet?, reports?, personas?, defensePacketId?, confirm="yes", reason',
    example: '"Run a reviewer simulation on OR-801 with the standard 8-persona panel."',
  },
];

export const MDX_COMMAND_HANDLERS_PHASE2: Record<
  string,
  (ctx: CommandContext, params: Record<string, unknown>) => Promise<CommandResult>
> = {
  'gspr.mapping.upsert': gsprMappingUpsert,
  'post_market.document.create': postMarketDocumentCreate,
  'post_market.document.approve': postMarketDocumentApprove,
  'post_market.document.update': postMarketDocumentUpdate,
  'post_market.document.validate': postMarketDocumentValidate,
  'post_market.document.supersede': postMarketDocumentSupersede,
  'evidence_sufficiency.assess': evidenceSufficiencyAssess,
  'reviewer_simulation.run': reviewerSimulationRun,
};
