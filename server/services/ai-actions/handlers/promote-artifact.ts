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
 */

import { eq, and } from 'drizzle-orm';
import * as crypto from 'crypto';
import {
  concept2cureArtifacts,
} from '../../../../shared/schema';
import { unifiedDocuments, workflowDocumentVersions } from '../../../../shared/schema/unified_workflow';
import { fetchArtifact } from '../shared-utils';
import { registerActionHandler } from '../action-registry';
import type {
  AIActionHandler,
  AIActionRequest,
  AIActionResponse,
  AIActionExecutionContext,
  AIActionError,
  AIActionObjectRef,
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

    // 2. Check artifact isn't already promoted (idempotency guard)
    if (artifact.status === 'locked') {
      throw new AIActionHandlerError(
        'ALREADY_LOCKED',
        'Artifact is locked and cannot be promoted again. Create a new version instead.',
        409
      );
    }

    // 3. Prepare promotion data
    const documentType = (payload.documentType as string) || mapArtifactTypeToDocType(artifact.type);
    const title = (payload.title as string) || artifact.title;
    const moduleType = request.module || inferModuleFromContext(request);
    const contentHash = crypto.createHash('sha256').update(artifact.content || '').digest('hex');

    // 4. Execute promotion in a transaction (atomic: create doc + version + update artifact)
    const { newDoc } = await db.transaction(async (tx: any) => {
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
      });

      // 4c. Update artifact status
      await tx
        .update(concept2cureArtifacts)
        .set({
          status: 'approved',
          metadata: {
            ...(artifact.metadata as Record<string, unknown> || {}),
            promotedToDocumentId: doc.id,
            promotedAt: new Date().toISOString(),
            promotedBy: ctx.user.userId,
            promotionActionId: ctx.actionId,
          },
          updatedAt: new Date(),
        })
        .where(eq(concept2cureArtifacts.id, artifact.id));

      return { newDoc: doc };
    });

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
      warnings: buildWarnings(artifact),
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
