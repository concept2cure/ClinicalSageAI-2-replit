/**
 * Save Document Version Handler
 *
 * Creates a real versioned snapshot in workflowDocumentVersions table,
 * increments the document counter, and may move a draft into review.
 * All operations run in a transaction for atomicity.
 *
 * 2026-10-15: it wrote any valid `payload.status` — 'approved' and 'published'
 * included — with no review, quorum or signature; a new version of an approved
 * document kept 'approved' for content nobody approved; a version with no
 * content anywhere was saved as an empty body; and the actor columns held the
 * display name where every other writer stores the user id. Saving a version
 * is not a decision: approval, publication, rejection and archiving go through
 * the review workflow.
 */

/** The statuses this action may set: workflow steps, not decisions. */
const SETTABLE_STATUSES = ['draft', 'in_review'];

import * as crypto from 'crypto';
import { eq } from 'drizzle-orm';
import { unifiedDocuments, workflowDocumentVersions } from '../../../../shared/schema/unified_workflow';
import { registerActionHandler } from '../action-registry';
import { fetchDocument, isValidDocumentStatus } from '../shared-utils';
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
    // Validate status if provided
    const status = request.payload?.status as string | undefined;
    if (status && !isValidDocumentStatus(status)) {
      errors.push({
        code: 'INVALID_STATUS',
        message: `Invalid document status '${status}'. Allowed: draft, in_review, approved, published, archived, rejected`,
      });
    } else if (status && !SETTABLE_STATUSES.includes(status)) {
      errors.push({
        code: 'GOVERNED_STATUS',
        message:
          `save_document_version cannot set status '${status}'. It may move a document to ${SETTABLE_STATUSES.join(' or ')}; ` +
          'approval, publication, rejection and archiving go through the review workflow, which records who decided.',
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

    // 1. Fetch document (org-scoped)
    const doc = await fetchDocument(db, documentId, ctx.user.organizationId);

    // 2. Check terminal state
    if (doc.status === 'archived') {
      throw new AIActionHandlerError(
        'DOCUMENT_ARCHIVED',
        'Cannot create new version of an archived document',
        409
      );
    }

    // 3. Execute in transaction: create version record + bump counter
    const newVersion = (doc.latestVersion || 1) + 1;
    const changeReason = (payload.changeReason as string) || 'AI action: save version';
    const previousContent = ((doc.metadata as any)?.content as string | undefined) || '';
    const content = (payload.content as string) || previousContent;
    if (!content) {
      throw new AIActionHandlerError(
        'NO_CONTENT',
        'There is no content to save as a version: none was supplied and the document holds none.',
        400
      );
    }
    // A changed approved/published document is a new, unapproved version: it
    // returns to draft for review rather than carrying the old approval.
    const warnings: string[] = [];
    const approvedBefore = doc.status === 'approved' || doc.status === 'published';
    const contentChanged = content !== previousContent;
    let newStatus = (payload.status as string) || doc.status;
    if (approvedBefore && contentChanged && !payload.status) {
      newStatus = 'draft';
      warnings.push(
        `v${newVersion} changes the content of a ${doc.status} document and is not approved; the document returns to draft for review.`
      );
    }
    const actor = String(ctx.user.userId);

    const { updated, versionRecord } = await db.transaction(async (tx: any) => {
      // 3a. Create actual version snapshot
      const [ver] = await tx
        .insert(workflowDocumentVersions)
        .values({
          documentId,
          version: newVersion,
          content: {
            body: content,
            previousVersion: doc.latestVersion,
            contentHash: crypto.createHash('sha256').update(content).digest('hex'),
          },
          createdBy: actor,
          comments: changeReason,
          organizationId: doc.organizationId,
        })
        .returning();

      // 3b. Update document counter and metadata
      const [upd] = await tx
        .update(unifiedDocuments)
        .set({
          latestVersion: newVersion,
          updatedBy: actor,
          updatedAt: new Date(),
          status: newStatus,
          metadata: {
            ...(doc.metadata || {}),
            content, // Keep latest content in metadata for quick access
            lastVersionedBy: ctx.user.userId,
            lastVersionedAt: new Date().toISOString(),
            lastChangeReason: changeReason,
            lastActionId: ctx.actionId,
          },
        })
        .where(eq(unifiedDocuments.id, documentId))
        .returning();

      return { updated: upd, versionRecord: ver };
    });

    return {
      success: true,
      actionType: 'save_document_version',
      status: 'completed',
      result: {
        documentId: updated.id,
        previousVersion: doc.latestVersion,
        newVersion,
        versionRecordId: versionRecord.id,
        status: updated.status,
        changeReason,
      },
      createdObjects: [
        {
          type: 'version',
          id: versionRecord.id,
          title: `v${newVersion} — ${updated.title}`,
          status: 'created',
        },
      ],
      updatedObjects: [
        {
          type: 'document',
          id: updated.id,
          title: updated.title,
          status: updated.status,
        },
      ],
      warnings,
      errors: [],
      provenance: {
        actionId: ctx.actionId,
        timestamp: new Date().toISOString(),
        userId: ctx.user.userId,
        organizationId: ctx.user.organizationId,
        projectId: request.projectId,
        sourceSurface: request.sourceSurface,
        versionId: String(versionRecord.id),
      },
      nextSuggestedActions: [
        {
          actionType: 'run_validation',
          label: 'Validate new version',
          description: 'Run validation against the updated document version',
          payload: { targetId: updated.id, targetType: 'document' },
        },
      ],
    };
  },
};

registerActionHandler(handler);
