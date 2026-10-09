/**
 * Promote Artifact Handler
 *
 * Bridges the "two-world problem" identified in the audit:
 * concept2cureArtifacts (AI-generated, lightweight) → unifiedDocuments (governed, versioned).
 *
 * Supports two action types:
 * - promote_artifact: Full promotion to unified document
 * - create_document_from_artifact: Alias with auto-promotion
 *
 * Phase 1: Direct promotion with version snapshot and audit trail.
 * Phase 2: Add approval gates, multi-section promotion, dossier placement.
 *
 * 2026-09-29 (D5): promotion is not an approval. It creates the governed
 * document, as a draft, from the artifact, under a human confirmation with a
 * reason, and leaves the artifact's status where it was. It flipped the
 * artifact to 'approved' and wrote a 'signature_apply' audit event with no
 * signature anywhere: an approval nobody signed, recorded as a signature that
 * never happened. An artifact is approved only by the status route's review →
 * approved, an electronic signature (server/services/artifact-signed-act.ts).
 */

import { governedActor } from '../../part11/governed-actor';
import { eq } from 'drizzle-orm';
import * as crypto from 'crypto';
import {
  concept2cureArtifacts,
} from '../../../../shared/schema';
import { unifiedDocuments, workflowDocumentVersions } from '../../../../shared/schema/unified_workflow';
import { resolveGovernedContext } from '../../concept2cure/governedDocumentContractService.js';
import { fetchArtifact } from '../shared-utils';
import { artifactApproval } from '../../ectd/package-content-fingerprint';
import { approvalRecordedOnlyByGovernedAct } from '../../artifact-approval-act';
import { registerActionHandler } from '../action-registry';
import auditService from '../../auditService';
import type {
  AIActionHandler,
  AIActionRequest,
  AIActionResponse,
  AIActionExecutionContext,
  AIActionError,
  AIActionObjectRef,
  AIActionProvenance,
  AIActionModuleType,
} from '../../../../shared/types/ai-actions';
import { AIActionHandlerError } from '../../../../shared/types/ai-actions';

// ---------------------------------------------------------------------------
// Promote Artifact Handler
// ---------------------------------------------------------------------------

const promoteArtifactHandler: AIActionHandler = {
  actionType: 'promote_artifact',

  validate(request: AIActionRequest): AIActionError[] {
    const errors: AIActionError[] = [];

    if (!request.targetId) {
      errors.push({
        code: 'MISSING_TARGET',
        message: 'targetId is required — must be the artifact ID or artifactId string',
      });
    }

    if (!request.projectId) {
      errors.push({
        code: 'MISSING_PROJECT',
        message: 'projectId is required for artifact promotion',
      });
    }

    return errors;
  },

  async execute(
    request: AIActionRequest,
    ctx: AIActionExecutionContext
  ): Promise<AIActionResponse> {
    const db = ctx.db as any; // Drizzle instance
    const payload = request.payload || {};

    // 1. Fetch the artifact (org-scoped via shared utility)
    const artifact = await fetchArtifact(db, request.targetId!, ctx.user.organizationId);

    // 2. Check artifact status is promotable
    const PROMOTABLE_STATUSES = ['draft', 'review'];
    if (artifact.status === 'locked') {
      throw new AIActionHandlerError(
        'ALREADY_LOCKED',
        'Artifact is locked and cannot be promoted again. Create a new version instead.',
        409
      );
    }
    if ((artifact.metadata as any)?.promotedToDocumentId) {
      throw new AIActionHandlerError(
        'ALREADY_PROMOTED',
        `Artifact was already promoted to document ${(artifact.metadata as any).promotedToDocumentId}`,
        409
      );
    }

    // 2a. Human confirmation gate. Promoting an AI-generated artifact to a
    // governed document is a governed action and MUST NOT happen without an
    // explicit, authenticated human confirmation with a reason. Enforced here
    // in addition to the dispatcher's role pre-check. It is not an approval:
    // the artifact's status is not changed (header note, 2026-09-29).
    const confirmation = requireHumanApproval(request, ctx);

    // 2b. Check contradiction governance — hard block if unresolved blocking findings
    try {
      const { contradictionEngineService } = await import('../../contradiction-engine-service');
      const { blocked, blockingFindings } = await contradictionEngineService.checkPromotionBlocked(
        ctx.user.organizationId, request.projectId!, artifact.id
      );
      if (blocked) {
        throw new AIActionHandlerError(
          'PROMOTION_BLOCKED',
          `Artifact promotion blocked by ${blockingFindings.length} unresolved contradiction(s). Resolve before promoting.`,
          409
        );
      }
    } catch (e) {
      if (e instanceof AIActionHandlerError) throw e;
      // Contradiction check failure shouldn't block (table may not exist yet)
    }

    // 3. Prepare promotion data
    const documentType = (payload.documentType as string) || mapArtifactTypeToDocType(artifact.type);
    const title = (payload.title as string) || artifact.title;
    const moduleType = request.module || inferModuleFromContext(request);
    const contentHash = crypto.createHash('sha256').update(artifact.content || '').digest('hex');
    const artifactMetadata =
      artifact.metadata && typeof artifact.metadata === 'object'
        ? (artifact.metadata as Record<string, unknown>)
        : {};
    const existingHarness =
      artifactMetadata.harness && typeof artifactMetadata.harness === 'object'
        ? (artifactMetadata.harness as Record<string, unknown>)
        : {};
    const mockReq = {
      body: {
        projectId: request.projectId,
        metadata: {
          source: 'ai_actions',
          sourceRefs: [`artifact:${artifact.artifactId}`],
        },
      },
      ...governedActor(ctx.user.userId, 'ai-action-promote-artifact'),
      userRole: ctx.user.userRole || 'regulatory',
    } as any;
    const governedResolution = resolveGovernedContext({
      req: mockReq,
      projectId: request.projectId,
      artifactId: artifact.id,
      documentType: artifact.type || 'regulatory_document',
      generationMode: 'amendment',
      // The document is created as a draft: promotion approves nothing.
      lifecycleStatus: 'draft',
      originSurface: 'api_route',
      clientTrack:
        existingHarness.clientTrack === 'device'
          ? 'device'
          : existingHarness.clientTrack === 'diagnostics'
            ? 'diagnostics'
            : 'biotech',
      submissionProgram:
        existingHarness.submissionProgram === 'ind' ||
        existingHarness.submissionProgram === 'ectd' ||
        existingHarness.submissionProgram === '510k' ||
        existingHarness.submissionProgram === 'pma' ||
        existingHarness.submissionProgram === 'cer' ||
        existingHarness.submissionProgram === 'ivdr'
          ? (existingHarness.submissionProgram as any)
          : 'general_ri',
      persona:
        existingHarness.persona === 'medical_writer' ||
        existingHarness.persona === 'cmc' ||
        existingHarness.persona === 'clinical' ||
        existingHarness.persona === 'qa' ||
        existingHarness.persona === 'executive' ||
        existingHarness.persona === 'cro'
          ? (existingHarness.persona as any)
          : 'regulatory',
      regulatorScope:
        existingHarness.regulatorScope === 'ema' ||
        existingHarness.regulatorScope === 'mhra' ||
        existingHarness.regulatorScope === 'hc' ||
        existingHarness.regulatorScope === 'pmda' ||
        existingHarness.regulatorScope === 'multi'
          ? (existingHarness.regulatorScope as any)
          : 'fda',
      evidenceMode: 'mixed',
      documentClass: 'submission_component',
      readinessGate: 'submission_candidate',
      approvalPathType: 'regulated_dual_review',
      recommendationSource: 'ana_ri',
      workspaceTarget: 'project',
      regulatorIntent: 'submission_authoring',
      placementContainerId: String(request.projectId),
      title,
      content: artifact.content || '',
      ctdSection:
        artifact.ctdSection ||
        (typeof payload.ctdSection === 'string' ? payload.ctdSection : null),
      sourceRefs: [`artifact:${artifact.artifactId}`],
      provider: 'ai_actions',
      model: 'promote_artifact',
      exportAllowed: false,
      eventType: 'artifact.updated',
    });
    if (!governedResolution.validation.valid) {
      throw new AIActionHandlerError(
        'GOVERNED_CONTRACT_INVALID',
        `Governed contract validation failed: ${governedResolution.validation.errors.join('; ')}`,
        400,
        {
          errors: governedResolution.validation.errors,
          warnings: governedResolution.validation.warnings,
          resolved: governedResolution.resolved,
        }
      );
    }

    // 4. Execute promotion in a transaction (atomic: create doc + version + update artifact)
    const { newDoc, promoted } = await db.transaction(async (tx: any) => {
      // 4a. Create unified document with content in metadata
      const [doc] = await tx
        .insert(unifiedDocuments)
        .values({
          title,
          documentType,
          status: 'draft',
          createdBy: ctx.user.userName,
          organizationId: ctx.user.organizationId,
          latestVersion: 1,
          metadata: {
            content: artifact.content || '',
            sourceArtifactId: artifact.id,
            sourceArtifactExternalId: artifact.artifactId,
            promotedBy: ctx.user.userId,
            promotedAt: new Date().toISOString(),
            projectId: request.projectId,
            module: moduleType,
            ctdSection: artifact.ctdSection || (payload.ctdSection as string) || null,
            contentHash,
            promotionActionId: ctx.actionId,
            // Who confirmed the promotion, and why. Not an approval: nothing
            // was signed (header note, 2026-09-29).
            promotion: {
              confirmedBy: ctx.user.userId,
              confirmedByName: ctx.user.userName,
              confirmerRole: ctx.user.userRole,
              confirmedAt: confirmation.approvedAt,
              reason: confirmation.reason,
              sourceSurface: request.sourceSurface,
            },
          },
        })
        .returning();

      // 4b. Create initial version record for audit trail
      await tx.insert(workflowDocumentVersions).values({
        documentId: doc.id,
        version: 1,
        content: { body: artifact.content || '', sourceArtifactId: artifact.artifactId },
        createdBy: ctx.user.userName,
        comments: `Promoted from artifact ${artifact.artifactId}`,
        organizationId: doc.organizationId,
      });

      // 4c. Record the promotion on the artifact. Its status is not changed.
      // 2026-09-23 (W5/D7, final pass): promotion is not the approval act, so
      // it records no approved version. 2026-09-29 (D5): nor does it set the
      // status to 'approved' — an approval is the status route's electronic
      // signature (server/services/artifact-signed-act.ts). RETURNING reads
      // what was written, so the warning below is judged on it.
      const [promotedRow] = await tx
        .update(concept2cureArtifacts)
        .set({
          metadata: {
            ...(artifactMetadata || {}),
            promotedToDocumentId: doc.id,
            promotedAt: new Date().toISOString(),
            promotedBy: ctx.user.userId,
            promotionActionId: ctx.actionId,
            promotionReason: confirmation.reason,
            harness: {
              ...existingHarness,
              clientTrack: governedResolution.contract.clientTrack,
              submissionProgram: governedResolution.contract.submissionProgram,
              persona: governedResolution.contract.persona,
              regulatorScope: governedResolution.contract.regulatorScope,
              documentClass: governedResolution.contract.documentClass,
              readinessGate: governedResolution.contract.readinessGate,
              workspaceTarget: governedResolution.contract.workspaceTarget,
              originSurface: governedResolution.contract.originSurface,
              recommendationSource: governedResolution.contract.recommendationSource,
              regulatorIntent: governedResolution.contract.regulatorIntent,
              gateChecks: governedResolution.contract.exportEligibility.gateChecks,
              blockingReasons: governedResolution.contract.exportEligibility.blockingReasons,
              readinessOutcome: governedResolution.contract.exportEligibility.readinessOutcome,
            },
          },
          updatedAt: new Date(),
        })
        .where(eq(concept2cureArtifacts.id, artifact.id))
        .returning({
          status: concept2cureArtifacts.status,
          version: concept2cureArtifacts.version,
          approvedVersionId: concept2cureArtifacts.approvedVersionId,
          publishedVersionId: concept2cureArtifacts.publishedVersionId,
        });

      return { newDoc: doc, promoted: promotedRow };
    });

    // 5. The audit entry for the promotion. It was action 'signature_apply'
    // with event 'artifact_promoted_to_approved': a signature recorded that no
    // one applied (2026-09-29, D5). Its outcome is read, not discarded: a
    // promotion whose entry was not written says so in its warnings.
    const audit = await auditService.logAction({
      organizationId: ctx.user.organizationId,
      userId: ctx.user.userId,
      action: 'data_modify',
      resourceType: 'document',
      resourceId: newDoc.id,
      ipAddress: ctx.ipAddress,
      details: {
        event: 'artifact_promoted',
        actionType: 'promote_artifact',
        actionId: ctx.actionId,
        artifactId: artifact.id,
        artifactExternalId: artifact.artifactId,
        documentId: newDoc.id,
        projectId: request.projectId,
        confirmedBy: ctx.user.userId,
        confirmerRole: ctx.user.userRole,
        reason: confirmation.reason,
        confirmedAt: confirmation.approvedAt,
        artifactStatus: promoted?.status ?? null,
        sourceSurface: request.sourceSurface,
      },
    });
    const auditWarnings = audit?.persisted
      ? []
      : ['The audit entry for this promotion could not be written. The document was created; the failure has been logged.'];

    // 6. Build response
    const createdObjects: AIActionObjectRef[] = [
      {
        type: 'document',
        id: newDoc.id,
        title: newDoc.title,
        status: newDoc.status,
        url: `/concept2cure/project/${request.projectId}/document/${newDoc.id}`,
      },
    ];

    const updatedObjects: AIActionObjectRef[] = [
      {
        type: 'artifact',
        id: artifact.id,
        title: artifact.title,
        status: 'promoted',
      },
    ];

    const provenance: AIActionProvenance = {
      actionId: ctx.actionId,
      timestamp: new Date().toISOString(),
      userId: ctx.user.userId,
      organizationId: ctx.user.organizationId,
      projectId: request.projectId,
      sourceSurface: request.sourceSurface,
    };

    return {
      success: true,
      actionType: 'promote_artifact',
      status: 'completed',
      result: {
        documentId: newDoc.id,
        artifactId: artifact.id,
        artifactExternalId: artifact.artifactId,
        documentType,
        module: moduleType,
        contentLength: (artifact.content || '').length,
      },
      createdObjects,
      updatedObjects,
      warnings: [...buildWarnings(artifact), ...filingWarnings(promoted), ...auditWarnings],
      errors: [],
      provenance,
      nextSuggestedActions: [
        {
          actionType: 'run_validation',
          label: 'Validate document',
          description: 'Run compliance validation on the promoted document',
          payload: { targetId: newDoc.id, documentType },
        },
        {
          actionType: 'route_document_to_module',
          label: 'Route to module',
          description: `Place this document in the ${moduleType || 'appropriate'} module`,
          payload: { targetId: newDoc.id, module: moduleType },
        },
      ],
    };
  },
};

// ---------------------------------------------------------------------------
// Create Document From Artifact Handler (alias)
// ---------------------------------------------------------------------------

const createDocumentFromArtifactHandler: AIActionHandler = {
  actionType: 'create_document_from_artifact',

  validate: promoteArtifactHandler.validate,

  async execute(
    request: AIActionRequest,
    ctx: AIActionExecutionContext
  ): Promise<AIActionResponse> {
    // Delegate to promote, just change the action type in the response
    const response = await promoteArtifactHandler.execute(request, ctx);
    response.actionType = 'create_document_from_artifact';
    return response;
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Human confirmation gate for promoting an AI-generated artifact to a
 * governed document. (Named for its payload fields — confirmApproval,
 * approvalReason — which callers already send; it approves nothing.)
 *
 * Enforces:
 *  - an authenticated human actor (req.user from JWT) is present;
 *  - the actor holds an approval-capable role (no AI/system self-approval);
 *  - automated/AI surfaces (workflow_trigger) cannot confirm a promotion;
 *  - an explicit approval intent: a non-empty approvalReason/reasonForChange
 *    plus an explicit confirmation flag.
 *
 * Returns the captured approval reason + timestamp to be recorded on the
 * promotion. Throws AIActionHandlerError (401/403/400) otherwise.
 *
 * 2026-09-29 (D5): the TODO that stood here — require a signature before
 * flipping the status to 'approved' — is resolved the other way: promotion no
 * longer changes the status. The approval is the status route's electronic
 * signature.
 */
const APPROVAL_ROLES = ['editor', 'admin', 'super_admin', 'regulatory', 'approver'];

function requireHumanApproval(
  request: AIActionRequest,
  ctx: AIActionExecutionContext
): { reason: string; approvedAt: string } {
  // 1. Authenticated human actor required.
  if (!ctx.user || ctx.user.userId == null) {
    throw new AIActionHandlerError(
      'APPROVAL_UNAUTHENTICATED',
      'Promotion to a governed document requires an authenticated person to confirm it.',
      401
    );
  }

  // 2. Block AI/automated self-approval — an automated workflow actor must not
  //    promote an AI-generated artifact to approved without a human in the loop.
  if (request.sourceSurface === 'workflow_trigger') {
    throw new AIActionHandlerError(
      'APPROVAL_HUMAN_REQUIRED',
      'An automated or AI actor cannot confirm a governed promotion. A person must perform this action.',
      403
    );
  }

  // 3. Approval-capable role required (defense-in-depth over the dispatcher check).
  const role = ctx.user.userRole;
  if (!role || !APPROVAL_ROLES.includes(role)) {
    throw new AIActionHandlerError(
      'APPROVAL_FORBIDDEN',
      `Role '${role ?? 'none'}' is not permitted to confirm a governed promotion. Required: ${APPROVAL_ROLES.join(', ')}`,
      403
    );
  }

  // 4. Explicit approval intent + reason-for-change.
  const payload = request.payload || {};
  const rawReason = (payload.approvalReason ?? payload.reasonForChange) as unknown;
  const reason = typeof rawReason === 'string' ? rawReason.trim() : '';
  const confirmed = payload.confirmApproval === true;
  if (!reason || !confirmed) {
    throw new AIActionHandlerError(
      'APPROVAL_REASON_REQUIRED',
      'Promotion to a governed document requires an explicit approvalReason (reason-for-change) and confirmApproval: true.',
      400
    );
  }

  return { reason, approvedAt: new Date().toISOString() };
}

function mapArtifactTypeToDocType(artifactType: string): string {
  const mapping: Record<string, string> = {
    markdown: 'regulatory_document',
    code: 'technical_specification',
    table: 'data_table',
    chart: 'analysis_report',
    form: 'regulatory_form',
    document: 'regulatory_document',
  };
  return mapping[artifactType] || 'regulatory_document';
}

function inferModuleFromContext(
  request: AIActionRequest
): AIActionModuleType | undefined {
  // Try to infer from submission type in context
  const submissionType = request.context?.submissionType as string | undefined;
  if (!submissionType) return request.module;

  const normalized = submissionType.toLowerCase();
  const mapping: Record<string, AIActionModuleType> = {
    'ind': 'ind',
    'nda': 'nda',
    '510(k)': '510k',
    '510k': '510k',
    'cer': 'cer',
    'ivdr': 'ivdr',
    'cmc': 'cmc',
    'ectd': 'ectd',
  };
  return mapping[normalized] || request.module;
}

/**
 * Says, truthfully, whether the promoted artifact can be filed: nothing when
 * the filing rule (artifactApproval) accepts the row as written — an artifact
 * the governed act approved at its current version stays filable — otherwise
 * why not and which governed act files it. A row that could not be read back is not
 * reported as filable. 2026-09-23 (W5/D7, final pass).
 */
function filingWarnings(
  row: { status: string | null; version: number | null; approvedVersionId: number | null; publishedVersionId: number | null } | undefined
): string[] {
  if (!row) return ['The promoted artifact could not be read back, so it cannot be shown to be filable.'];
  const approval = artifactApproval(row);
  if (approval.filable) return [];
  // 2026-09-23 (W5/D7, final pass, repair): names the governed act that
  // records the version and says this action records none (it said "approval
  // through review", which a user could take to mean this action).
  return [`It cannot be filed yet: ${approval.problem}. ${approvalRecordedOnlyByGovernedAct('action')}`];
}

function buildWarnings(artifact: any): string[] {
  const warnings: string[] = [];
  if (!artifact.content || artifact.content.length === 0) {
    warnings.push('Artifact has empty content — document will be created with no body');
  }
  if (!artifact.ctdSection) {
    warnings.push('No CTD section assigned — document may need manual section placement');
  }
  if (artifact.status === 'draft') {
    warnings.push('Artifact was still in draft status — consider reviewing before promotion');
  }
  return warnings;
}

// ---------------------------------------------------------------------------
// Register
// ---------------------------------------------------------------------------

registerActionHandler(promoteArtifactHandler);
registerActionHandler(createDocumentFromArtifactHandler);
