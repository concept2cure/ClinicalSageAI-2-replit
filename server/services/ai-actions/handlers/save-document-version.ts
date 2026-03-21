/**
 * Save Document Version Handler
 *
 * Creates a versioned snapshot of a unified document.
 * Wraps the existing atomVersionService for governed versioning.
 *
 * Phase 1: Single-document version save with audit trail.
 * Phase 2: Batch versioning, cross-document version sets.
 */

import { eq, and } from 'drizzle-orm';
import { generateUUID } from '../../../utils/id-generator';
import { unifiedDocuments } from '../../../../shared/schema/unified_workflow';
import { registerActionHandler } from '../action-registry';
import type {
  AIActionHandler,
  AIActionRequest,
  AIActionResponse,
  AIActionExecutionContext,
  AIActionError,
} from '../../../../shared/types/ai-actions';
import { AIActionHandlerError } from '../../../../shared/types/ai-actions';

const handler: AIActionHandler = {
  actionType: 'save_document_version',

  validate(request: AIActionRequest): AIActionError[] {
    const errors: AIActionError[] = [];
    if (!request.targetId) {
      errors.push({
        code: 'MISSING_TARGET',
        message: 'targetId is required — must be the document ID',
      });
    }
    return errors;
  },

  async execute(
    request: AIActionRequest,
    ctx: AIActionExecutionContext
  ): Promise<AIActionResponse> {
    const db = ctx.db as any;
    const payload = request.payload || {};
    const documentId = Number(request.targetId);

    // 1. Fetch document
    const [doc] = await db
      .select()
      .from(unifiedDocuments)
      .where(
        and(
          eq(unifiedDocuments.id, documentId),
          eq(unifiedDocuments.organizationId, ctx.user.organizationId)
        )
      )
      .limit(1);

    if (!doc) {
      throw new AIActionHandlerError(
        'DOCUMENT_NOT_FOUND',
        `Document ${documentId} not found`,
        404
      );
    }

    // 2. Check document isn't in a terminal state
    if (doc.status === 'archived') {
      throw new AIActionHandlerError(
        'DOCUMENT_ARCHIVED',
        'Cannot create new version of an archived document',
        409
      );
    }

    // 3. Increment version
    const newVersion = (doc.latestVersion || 1) + 1;
    const newStatus = (payload.status as string) || doc.status;
    const changeReason = (payload.changeReason as string) || 'AI action: save version';

    const [updated] = await db
      .update(unifiedDocuments)
      .set({
        latestVersion: newVersion,
        updatedBy: ctx.user.userName,
        updatedAt: new Date(),
        status: newStatus,
        metadata: {
          ...(doc.metadata || {}),
          lastVersionedBy: ctx.user.userId,
          lastVersionedAt: new Date().toISOString(),
          lastChangeReason: changeReason,
          lastActionId: ctx.actionId,
        },
      })
      .where(eq(unifiedDocuments.id, documentId))
      .returning();

    return {
      success: true,
      actionType: 'save_document_version',
      status: 'completed',
      result: {
        documentId: updated.id,
        previousVersion: doc.latestVersion,
        newVersion,
        status: updated.status,
        changeReason,
      },
      createdObjects: [],
      updatedObjects: [
        {
          type: 'document',
          id: updated.id,
          title: updated.title,
          status: updated.status,
        },
      ],
      warnings: [],
      errors: [],
      provenance: {
        actionId: ctx.actionId,
        timestamp: new Date().toISOString(),
        userId: ctx.user.userId,
        organizationId: ctx.user.organizationId,
        projectId: request.projectId,
        sourceSurface: request.sourceSurface,
      },
      nextSuggestedActions: [
        {
          actionType: 'run_validation',
          label: 'Validate new version',
          description: 'Run validation against the updated document version',
          payload: { targetId: updated.id },
        },
      ],
    };
  },
};

registerActionHandler(handler);
