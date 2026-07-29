/**
 * Route Document to Module Handler
 *
 * Places a unified document into a specific module context.
 * Uses the existing moduleDocuments table from unified_workflow schema.
 *
 * Phase 1: Basic module routing with metadata.
 * Phase 2: Auto-routing based on content analysis, multi-module placement.
 */

import { eq, and } from 'drizzle-orm';
import {
  unifiedDocuments,
  moduleDocuments,
  moduleTypeEnum,
} from '../../../../shared/schema/unified_workflow';

type ModuleType = (typeof moduleTypeEnum.enumValues)[number];
import { registerActionHandler } from '../action-registry';
import { fetchDocument, isValidModuleType } from '../shared-utils';
import type {
  AIActionHandler,
  AIActionRequest,
  AIActionResponse,
  AIActionExecutionContext,
  AIActionError,
} from '../../../../shared/types/ai-actions';
import { AIActionHandlerError } from '../../../../shared/types/ai-actions';

const handler: AIActionHandler = {
  actionType: 'route_document_to_module',

  validate(request: AIActionRequest): AIActionError[] {
    const errors: AIActionError[] = [];
    if (!request.targetId) {
      errors.push({ code: 'MISSING_TARGET', message: 'targetId (document ID) is required' });
    }
    const moduleType = (request.module || request.payload?.module) as string | undefined;
    if (!moduleType) {
      errors.push({ code: 'MISSING_MODULE', message: 'module is required for routing' });
    } else if (!isValidModuleType(moduleType)) {
      errors.push({ code: 'INVALID_MODULE', message: `Invalid module type '${moduleType}'. Allowed: cmc, cer, study, ectd, 510k, vault` });
    }
    return errors;
  },

  async execute(
    request: AIActionRequest,
    ctx: AIActionExecutionContext
  ): Promise<AIActionResponse> {
    const db = ctx.db as any;
    const documentId = Number(request.targetId);
    // validate() has already confirmed this is one of the allowed module enum values.
    const moduleType = (request.module || request.payload?.module) as ModuleType;

    // 1. Verify document exists and belongs to org
    const doc = await fetchDocument(db, documentId, ctx.user.organizationId);

    // 2. Check for existing module link (prevent duplicates)
    const existing = await db
      .select()
      .from(moduleDocuments)
      .where(
        and(
          eq(moduleDocuments.unifiedDocumentId, documentId),
          eq(moduleDocuments.moduleType, moduleType as any)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      return {
        success: true,
        actionType: 'route_document_to_module',
        status: 'completed',
        result: {
          documentId,
          moduleType,
          alreadyRouted: true,
          moduleDocumentId: existing[0].id,
        },
        createdObjects: [],
        updatedObjects: [],
        warnings: [`Document is already routed to module ${moduleType}`],
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
    }

    // 3. Create module-document link
    const sectionCode = (request.payload?.sectionCode || request.context?.sectionCode) as string | undefined;

    const [link] = await db
      .insert(moduleDocuments)
      .values({
        unifiedDocumentId: documentId,
        moduleType,
        originalId: (request.payload?.moduleSpecificId as string) || `doc-${documentId}`,
        organizationId: ctx.user.organizationId,
        metadata: {
          routedBy: ctx.user.userId,
          routedAt: new Date().toISOString(),
          projectId: request.projectId,
          sectionCode,
          actionId: ctx.actionId,
        },
      })
      .returning();

    return {
      success: true,
      actionType: 'route_document_to_module',
      status: 'completed',
      result: {
        documentId,
        moduleType,
        moduleDocumentId: link.id,
        sectionCode,
      },
      createdObjects: [
        {
          type: 'module_link',
          id: link.id,
          title: `${doc.title} → ${moduleType}`,
          status: 'active',
        },
      ],
      updatedObjects: [],
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
          label: 'Validate in module context',
          description: `Run ${moduleType}-specific validation on this document`,
          payload: { targetId: documentId, targetType: 'document' },
        },
      ],
    };
  },
};

registerActionHandler(handler);
