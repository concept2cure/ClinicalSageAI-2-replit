/**
 * Export Document Handler
 *
 * Wraps existing export capabilities under the unified action API.
 * Delegates to CERV2 export routes for actual PDF/DOCX generation.
 *
 * Phase 1: Metadata-only export tracking (provenance + status).
 * Phase 2: Inline export execution with streaming download.
 */

import { eq } from 'drizzle-orm';
import { unifiedDocuments } from '../../../../shared/schema/unified_workflow';
import { registerActionHandler } from '../action-registry';
import { fetchDocument } from '../shared-utils';
import type {
  AIActionHandler,
  AIActionRequest,
  AIActionResponse,
  AIActionExecutionContext,
  AIActionError,
} from '../../../../shared/types/ai-actions';
import { AIActionHandlerError } from '../../../../shared/types/ai-actions';

const handler: AIActionHandler = {
  actionType: 'export_document',

  validate(request: AIActionRequest): AIActionError[] {
    const errors: AIActionError[] = [];
    if (!request.targetId) {
      errors.push({ code: 'MISSING_TARGET', message: 'targetId (document ID) is required' });
    }
    return errors;
  },

  async execute(
    request: AIActionRequest,
    ctx: AIActionExecutionContext
  ): Promise<AIActionResponse> {
    const db = ctx.db as any;
    const documentId = Number(request.targetId);
    const format = (request.payload?.format as string) || 'pdf';

    // 1. Verify document exists (org-scoped)
    const doc = await fetchDocument(db, documentId, ctx.user.organizationId);

    // Phase 1: Record the export intent and return the export URL for client-side download.
    // Actual export is handled by existing routes (cerv2-export-routes, export_routes).
    // Phase 2: Execute export inline and return download URL.

    const exportUrl = `/api/cerv2/export/${format}`;
    const exportPayload = {
      documentId,
      format,
      title: doc.title,
      documentType: doc.documentType,
      version: doc.latestVersion,
    };

    // Update document metadata to track export
    await db
      .update(unifiedDocuments)
      .set({
        metadata: {
          ...(doc.metadata || {}),
          lastExportedAt: new Date().toISOString(),
          lastExportedBy: ctx.user.userId,
          lastExportFormat: format,
          lastExportActionId: ctx.actionId,
        },
        updatedAt: new Date(),
      })
      .where(eq(unifiedDocuments.id, documentId));

    return {
      success: true,
      actionType: 'export_document',
      status: 'completed',
      result: {
        documentId,
        format,
        exportUrl,
        exportPayload,
        version: doc.latestVersion,
        note: 'Use exportUrl with exportPayload to trigger download via existing export routes',
      },
      createdObjects: [],
      updatedObjects: [
        {
          type: 'document',
          id: documentId,
          title: doc.title,
          status: 'exported',
        },
      ],
      warnings: doc.status === 'draft'
        ? ['Exporting a draft document — consider completing review first']
        : [],
      errors: [],
      provenance: {
        actionId: ctx.actionId,
        timestamp: new Date().toISOString(),
        userId: ctx.user.userId,
        organizationId: ctx.user.organizationId,
        projectId: request.projectId,
        sourceSurface: request.sourceSurface,
      },
      nextSuggestedActions: [],
    };
  },
};

registerActionHandler(handler);
