/**
 * Module Integration Service
 *
 * This service handles the integration of module-specific documents with the unified
 * document workflow system. It provides methods for registering, retrieving, and
 * managing documents across different modules.
 */

import { eq, and, inArray } from 'drizzle-orm';
import type { RequestDb } from '../db/requestDb';
import { WorkflowService } from './WorkflowService';
import { isAllowedUpload } from '../middleware/uploadAllowlist';
import { hasUnsafePathSyntax } from './submission-gateways/bundle-namespace';
import {
  unifiedDocuments,
  moduleDocuments,
  moduleTypeEnum,
  workflowDocumentVersions,
  documentAuditLogs,
  documentAttachments,
  documentWorkflows,
} from '../../shared/schema/unified_workflow';

/**
 * The module_type enum's value union — the only legal module identities. Typing
 * the enrollment boundary against this (rather than `any`) is what keeps an
 * unknown module string from being written into module_documents.module_type,
 * which is a NOT NULL enum column that would otherwise reject it at runtime only.
 */
export type ModuleType = (typeof moduleTypeEnum.enumValues)[number];

/** Narrow an untrusted request value to a legal module_type enum member. */
export function isModuleType(value: unknown): value is ModuleType {
  return typeof value === 'string' && (moduleTypeEnum.enumValues as readonly string[]).includes(value);
}

/**
 * The document-enrollment input contract. This service is the canonical boundary
 * through which a module document enters the unified workflow, so the shape is
 * declared here rather than accepted as `any`: title/documentType/createdBy are
 * the NOT NULL columns of unified_documents, organizationId is its integer tenant
 * key, and moduleType/originalId form the module_documents identity that
 * documentExists() dedupes on.
 */
export interface RegisterDocumentInput {
  title: string;
  documentType: string;
  status?: string;
  createdBy: string;
  organizationId: number;
  moduleType: ModuleType;
  originalId: string;
  content?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * The attachment-record input contract.
 *
 * Declared here rather than accepted as `any`, for the same reason
 * RegisterDocumentInput is: fileName / fileType / fileSize / filePath are the
 * NOT NULL columns of document_attachments (migrations/20260729b), so an
 * `any` boundary defers a missing one to a runtime 23502 inside an open
 * transaction instead of rejecting it at the edge with a usable message.
 *
 * This service records an attachment; it does not receive or store the bytes.
 * `filePath` must already point at a file placed through the caller's own
 * storage path — this boundary validates the SYNTAX it is handed and the file
 * type policy, and nothing here should be read as having verified that the
 * file exists or is what it claims.
 */
export interface DocumentAttachmentInput {
  fileName: string;
  fileType: string;
  /** Bytes. Stored in an `integer` column, so bounded by INT4_MAX. */
  fileSize: number;
  filePath: string;
  description?: string | null;
  metadata?: Record<string, unknown>;
}

/** `file_size integer` — Postgres rejects anything past this, so we do first. */
const INT4_MAX = 2_147_483_647;

/**
 * Exception for document not found errors
 */
export class DocumentNotFoundException extends Error {
  constructor(documentId: number | string) {
    super(`Document with ID ${documentId} not found`);
    this.name = 'DocumentNotFoundException';
  }
}

/** An attachment that does not exist on the named document, in this tenant. */
export class AttachmentNotFoundException extends Error {
  constructor(attachmentId: number | string) {
    super(`Attachment with ID ${attachmentId} not found`);
    this.name = 'AttachmentNotFoundException';
  }
}

/** An attachment record this boundary refuses to write. */
export class AttachmentRejectedException extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'AttachmentRejectedException';
  }
}

/**
 * Narrow an untrusted attachment payload, or throw.
 *
 * Reuses the repo's canonical validators rather than restating them:
 * `hasUnsafePathSyntax` (empty / embedded NUL / `..` traversal, in either
 * separator style) and `isAllowedUpload` (the shared extension + MIME policy,
 * which rejects the BLOCKED_EXTENSIONS executables outright). A second copy of
 * either rule here is a second place for them to drift apart.
 *
 * `fileName` is checked for path syntax too: a name is not a path, and one
 * carrying separators or `..` is either a mistake or an attempt to make a
 * later consumer join it onto a directory.
 */
function requireText(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new AttachmentRejectedException(`${field} is required`);
  }
  return value;
}

/** `file_size` is a NOT NULL `integer`; anything else is rejected here, not by PG. */
function requireByteCount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new AttachmentRejectedException('fileSize must be a non-negative integer number of bytes');
  }
  if (value > INT4_MAX) {
    throw new AttachmentRejectedException('fileSize exceeds the maximum this record can store');
  }
  return value;
}

function assertAttachmentRecordable(input: unknown): asserts input is DocumentAttachmentInput {
  const candidate = input as Partial<DocumentAttachmentInput> | null | undefined;
  if (!candidate || typeof candidate !== 'object') {
    throw new AttachmentRejectedException('attachment data is required');
  }

  const fileName = requireText(candidate.fileName, 'fileName');
  const fileType = requireText(candidate.fileType, 'fileType');
  const filePath = requireText(candidate.filePath, 'filePath');
  requireByteCount(candidate.fileSize);

  if (hasUnsafePathSyntax(fileName) || /[\\/]/.test(fileName)) {
    throw new AttachmentRejectedException('fileName must be a file name, not a path');
  }
  if (hasUnsafePathSyntax(filePath)) {
    throw new AttachmentRejectedException('filePath must not contain traversal syntax');
  }
  if (!isAllowedUpload(fileName, fileType)) {
    throw new AttachmentRejectedException(`Unsupported file type: ${fileName}`);
  }
}

/**
 * The tenant a governed write is filed under is never optional and never
 * inferred. An unusable organization id fails closed rather than reaching a
 * query as NaN — `Number(undefined)` and `Number('x')` are both NaN, and a NaN
 * in an equality predicate matches nothing, which reads as "not found" instead
 * of "you did not pass a tenant".
 */
function requireOrgId(organizationId: unknown, method: string): number {
  const parsed =
    typeof organizationId === 'number' ? organizationId : Number(String(organizationId ?? '').trim());
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${method} requires an organization context`);
  }
  return parsed;
}

export class ModuleIntegrationService {
  private workflowService: WorkflowService;

  constructor(private db: RequestDb) {
    this.workflowService = new WorkflowService(db);
  }

  /**
   * Register a new document in the unified system
   *
   * @param documentData The document data to register
   * @returns The registered document
   */
  async registerDocument(documentData: RegisterDocumentInput) {
    return this.db.transaction(async (tx: any) => {
      try {
        // Create the unified document
        const [unifiedDoc] = await tx
          .insert(unifiedDocuments)
          .values({
            title: documentData.title,
            documentType: documentData.documentType,
            status: documentData.status || 'draft',
            createdBy: documentData.createdBy,
            organizationId: documentData.organizationId,
            latestVersion: 1,
            metadata: documentData.metadata || {},
          })
          .returning();

        // Create the initial version
        const [version] = await tx
          .insert(workflowDocumentVersions)
          .values({
            documentId: unifiedDoc.id,
            version: 1,
            content: documentData.content || null,
            createdBy: documentData.createdBy,
            organizationId: documentData.organizationId,
          })
          .returning();

        // Link to the original module document
        const [moduleDoc] = await tx
          .insert(moduleDocuments)
          .values({
            unifiedDocumentId: unifiedDoc.id,
            moduleType: documentData.moduleType,
            originalId: documentData.originalId,
            organizationId: documentData.organizationId,
          })
          .returning();

        // Create audit log entry
        await tx.insert(documentAuditLogs).values({
          documentId: unifiedDoc.id,
          action: 'document_created',
          performedBy: documentData.createdBy,
          details: {
            moduleType: documentData.moduleType,
            originalId: documentData.originalId,
          },
        });

        return {
          ...unifiedDoc,
          version,
          moduleDocument: moduleDoc,
        };
      } catch (error) {
        console.error('Error registering document:', error);
        throw error;
      }
    });
  }

  /**
   * Check if a document exists in the unified system
   *
   * @param moduleType The module type
   * @param originalId The original ID in the module
   * @param organizationId The organization ID
   * @returns Whether the document exists
   */
  async documentExists(
    moduleType: ModuleType,
    originalId: string,
    organizationId: number
  ): Promise<boolean> {
    // Existence check, not a count. The previous form selected
    // `{ count: { count: 'id' } }` — a nested plain object that is neither a
    // column nor a `sql` expression, so Drizzle never emitted COUNT(*) and
    // result[0].count was never a real number; the guard's truth value was an
    // accident of that malformed projection. A LIMIT 1 on the id column is the
    // idiomatic exists probe and cannot scan more than one row.
    const rows = await this.db
      .select({ id: moduleDocuments.id })
      .from(moduleDocuments)
      .where(
        and(
          eq(moduleDocuments.moduleType, moduleType),
          eq(moduleDocuments.originalId, originalId),
          eq(moduleDocuments.organizationId, organizationId)
        )
      )
      .limit(1);

    return rows.length > 0;
  }

  /**
   * Get documents by module type
   *
   * @param moduleType The module type
   * @param organizationId The organization ID
   * @returns Array of documents
   */
  async getDocumentsByModule(moduleType: any, organizationId: any) {
    const moduleDocsResult = await this.db
      .select()
      .from(moduleDocuments)
      .where(
        and(
          eq(moduleDocuments.moduleType, moduleType),
          eq(moduleDocuments.organizationId, organizationId)
        )
      );

    if (!moduleDocsResult.length) {
      return [];
    }

    const documentIds = moduleDocsResult.map((doc: any) => doc.unifiedDocumentId);

    const docsResult = await this.db
      .select()
      .from(unifiedDocuments)
      .where(
        and(
          inArray(unifiedDocuments.id, documentIds),
          // Defense-in-depth: repeat the tenant predicate even though the ids
          // came from org-scoped rows, so no query trusts an id list alone.
          eq(unifiedDocuments.organizationId, organizationId)
        )
      );

    // Join the results
    return docsResult.map((doc: any) => {
      const moduleDoc = moduleDocsResult.find((md: any) => md.unifiedDocumentId === doc.id);
      return {
        ...doc,
        moduleType,
        originalId: moduleDoc?.originalId,
      };
    });
  }

  /**
   * Get documents in review (with active workflows)
   *
   * @param organizationId The organization ID
   * @returns Array of documents with their active workflows
   */
  async getDocumentsInReview(organizationId: any) {
    // Get active workflows
    const workflows = await this.db
      .select()
      .from(documentWorkflows)
      .where(
        and(
          eq(documentWorkflows.status, 'active'),
          eq(documentWorkflows.organizationId, organizationId)
        )
      );

    if (!workflows.length) {
      return [];
    }

    // Get the documents
    const documentIds = workflows.map((w: any) => w.documentId);
    const documents = await this.db
      .select()
      .from(unifiedDocuments)
      .where(
        and(
          inArray(unifiedDocuments.id, documentIds),
          // Defense-in-depth: repeat the tenant predicate even though the ids
          // came from org-scoped rows, so no query trusts an id list alone.
          eq(unifiedDocuments.organizationId, organizationId)
        )
      );

    // Join with module documents
    const moduleDocsResult = await this.db
      .select()
      .from(moduleDocuments)
      .where(
        and(
          inArray(moduleDocuments.unifiedDocumentId, documentIds),
          eq(moduleDocuments.organizationId, organizationId)
        )
      );

    // Get current approvals for each workflow
    const workflowsWithApprovals = await Promise.all(
      workflows.map(async (w: any) => {
        const approvals = await this.workflowService.getWorkflowApprovals(
          w.id,
          organizationId,
        );
        const currentApproval = approvals.find((a: any) => a.status === 'pending');
        return {
          ...w,
          approvals,
          currentApproval,
        };
      })
    );

    // Join everything together
    return documents.map((doc: any) => {
      const moduleDoc = moduleDocsResult.find((md: any) => md.unifiedDocumentId === doc.id);
      const docWorkflows = workflowsWithApprovals.filter(w => w.documentId === doc.id);

      return {
        document: {
          ...doc,
          moduleType: moduleDoc?.moduleType,
          originalId: moduleDoc?.originalId,
        },
        workflows: docWorkflows,
        id: doc.id,
        status: doc.status,
        // For documents with pending approval
        currentApproval: docWorkflows[0]?.currentApproval,
      };
    });
  }

  /**
   * Get a specific document
   *
   * @param documentId The document ID
   * @returns The document
   */
  async getDocument(documentId: number, organizationId: number) {
    const document = await this.db
      .select()
      .from(unifiedDocuments)
      .where(and(eq(unifiedDocuments.id, documentId), eq(unifiedDocuments.organizationId, organizationId)))
      .limit(1);

    if (!document.length) {
      throw new DocumentNotFoundException(documentId);
    }

    const moduleDoc = await this.db
      .select()
      .from(moduleDocuments)
      .where(and(
        eq(moduleDocuments.unifiedDocumentId, documentId),
        eq(moduleDocuments.organizationId, organizationId)
      ))
      .limit(1);

    const latestVersion = await this.db
      .select()
      .from(workflowDocumentVersions)
      .where(
        and(
          eq(workflowDocumentVersions.documentId, documentId),
          eq(workflowDocumentVersions.version, document[0].latestVersion)
        )
      )
      .limit(1);

    return {
      ...document[0],
      moduleType: moduleDoc[0]?.moduleType,
      originalId: moduleDoc[0]?.originalId,
      version: latestVersion[0],
    };
  }

  /**
   * Update a document
   *
   * @param documentId The document ID
   * @param updateData The data to update
   * @returns The updated document
   */
  async updateDocument(documentId: number, updateData: any, organizationId: number) {
    return this.db.transaction(async (tx: any) => {
      // Check if document exists
      const existingDoc = await tx
        .select()
        .from(unifiedDocuments)
        .where(and(
          eq(unifiedDocuments.id, documentId),
          eq(unifiedDocuments.organizationId, organizationId)
        ))
        .limit(1);

      if (!existingDoc.length) {
        throw new DocumentNotFoundException(documentId);
      }

      // Check if content is being updated
      let newVersion = null;
      if (updateData.content !== undefined) {
        // Create a new version
        const [version] = await tx
          .insert(workflowDocumentVersions)
          .values({
            documentId,
            version: existingDoc[0].latestVersion + 1,
            content: updateData.content,
            createdBy: updateData.updatedBy,
            organizationId,
          })
          .returning();

        newVersion = version;

        // Update latestVersion in document
        updateData.latestVersion = existingDoc[0].latestVersion + 1;

        // Add audit log for version change
        await tx.insert(documentAuditLogs).values({
          documentId,
          action: 'version_created',
          performedBy: updateData.updatedBy,
          details: {
            previousVersion: existingDoc[0].latestVersion,
            newVersion: updateData.latestVersion,
          },
        });

        // Create diff logs if needed
        if (existingDoc[0].latestVersion > 0) {
          await this.logDocumentChanges(
            tx,
            documentId,
            existingDoc[0].latestVersion,
            updateData.latestVersion,
            updateData.updatedBy
          );
        }
      }

      // Remove content from updateData since it's stored in versions
      const { content, ...docUpdateData } = updateData;

      // Update the document
      if (Object.keys(docUpdateData).length > 0) {
        const [updatedDoc] = await tx
          .update(unifiedDocuments)
          .set({
            ...docUpdateData,
            updatedAt: new Date(),
          })
          .where(and(
            eq(unifiedDocuments.id, documentId),
            eq(unifiedDocuments.organizationId, organizationId)
          ))
          .returning();

        // Create audit log for document update
        const changedFields = Object.keys(docUpdateData).filter(
          key =>
            key !== 'updatedBy' && key !== 'updatedAt' && docUpdateData[key] !== existingDoc[0][key]
        );

        if (changedFields.length > 0) {
          changedFields.forEach(field => {
            tx.insert(documentAuditLogs).values({
              documentId,
              action: 'field_updated',
              performedBy: updateData.updatedBy,
              details: {
                field,
                previous: existingDoc[0][field],
                current: docUpdateData[field],
              },
            });
          });
        }

        return {
          ...updatedDoc,
          version: newVersion,
        };
      }

      return {
        ...existingDoc[0],
        version: newVersion,
      };
    });
  }

  /**
   * Log changes between document versions
   *
   * @param tx Transaction object
   * @param documentId Document ID
   * @param previousVersionId Previous version ID
   * @param currentVersionId Current version ID
   * @param userId User making the change
   */
  private async logDocumentChanges(
    tx: any,
    documentId: any,
    previousVersionId: any,
    currentVersionId: any,
    userId: string
  ) {
    // In a real implementation, this would do a diff of the versions
    // and log specific changes. For simplicity, we'll just log that a change occurred.

    await tx.insert(documentAuditLogs).values({
      documentId,
      action: 'content_changed',
      performedBy: userId,
      details: {
        field: 'content',
        action: 'update',
        value: `Updated from version ${previousVersionId} to ${currentVersionId}`,
      },
    });
  }

  /**
   * Resolve a document the caller's organization owns, or throw.
   *
   * `document_attachments` carries no organization_id of its own — it reaches a
   * tenant only through `document_id -> unified_documents.organizationId` — and
   * neither table is RLS-protected, so this walk IS the tenant boundary for
   * both attachment methods below.
   */
  private async requireOwnedDocument(tx: any, documentId: number, orgId: number) {
    const rows = await tx
      .select()
      .from(unifiedDocuments)
      .where(
        and(
          eq(unifiedDocuments.id, documentId),
          eq(unifiedDocuments.organizationId, orgId)
        )
      )
      .limit(1);
    // A document in another tenancy reports the same "not found" as one that
    // does not exist, so the error cannot be used to probe for document ids.
    if (!rows.length) throw new DocumentNotFoundException(documentId);
    return rows[0];
  }

  /**
   * Add an attachment to a document.
   *
   * ── What this method used to do ──────────────────────────────────────────
   * It wrote `action: 'attachment_added'` into document_audit_logs and never
   * touched document_attachments. The insert was a comment. Every part of the
   * system that reads that trail — a reviewer, an inspector, an export — would
   * have been told a file was attached to a regulated document when no row had
   * been written and no attachment existed. The whole table had, and still has
   * as of this change, no other writer anywhere in the codebase.
   *
   * That is the failure this repo names as "never fabricate", and it is the
   * server-side twin of the UI defect check-action-overclaim.mjs was built for:
   * a control that promises a governed act and only emits a message. Here the
   * message went somewhere worse than a toast — into the audit trail itself.
   *
   * The act and its audit now happen in ONE transaction, so a failure of either
   * rolls back both: the ledger never records an attachment that was not made,
   * and no attachment is recorded without its audit entry (§ 11.10(e)) — the
   * same contract the c2c evidence-delete path is held to.
   *
   * @param documentId Document ID
   * @param attachmentData Attachment record (see DocumentAttachmentInput)
   * @param userId User adding the attachment
   * @param organizationId The caller's organization ID (required)
   * @returns The stored attachment row
   */
  async addDocumentAttachment(
    documentId: number,
    attachmentData: unknown,
    userId: string,
    organizationId: unknown
  ) {
    const orgId = requireOrgId(organizationId, 'addDocumentAttachment');
    // Validate before opening the transaction: a rejected payload should cost
    // nothing and should say which field is wrong.
    assertAttachmentRecordable(attachmentData);
    const attachment = attachmentData;

    return this.db.transaction(async (tx: any) => {
      await this.requireOwnedDocument(tx, documentId, orgId);

      const [stored] = await tx
        .insert(documentAttachments)
        .values({
          documentId,
          fileName: attachment.fileName,
          fileType: attachment.fileType,
          fileSize: attachment.fileSize,
          filePath: attachment.filePath,
          uploadedBy: userId,
          description: attachment.description ?? null,
          metadata: attachment.metadata ?? {},
        })
        .returning();

      // Audited only now that the row exists, and with the identifiers the
      // insert actually produced rather than the ones that were requested.
      await tx.insert(documentAuditLogs).values({
        documentId,
        action: 'attachment_added',
        performedBy: userId,
        details: {
          field: 'attachments',
          action: 'add',
          attachmentId: stored.id,
          fileName: stored.fileName,
          fileType: stored.fileType,
          fileSize: stored.fileSize,
        },
      });

      return stored;
    });
  }

  /**
   * Remove an attachment from a document.
   *
   * Same defect and same repair as addDocumentAttachment: this wrote
   * `attachment_removed` without deleting anything.
   *
   * The delete is scoped by BOTH the attachment id and the document id, so an
   * attachment cannot be removed via a document the caller does not own, and
   * the audit row is written only when a row was actually removed — deleting
   * nothing and recording a removal is the same fabrication in miniature.
   *
   * The removal is a hard delete. document_attachments has no lifecycle column
   * to mark instead, and its parent is ON DELETE CASCADE, so there is no
   * soft-delete affordance in this schema to use; the audit row carries the id,
   * name and type of what was removed, which is the same delete-with-atomic-
   * audit shape the c2c evidence path uses. Introducing a REPLACED/SUSPENDED
   * lifecycle here, as ectd_v4 has, would be a schema change and a product
   * decision, not part of making this method tell the truth.
   *
   * @param documentId Document ID
   * @param attachmentId Attachment ID
   * @param userId User removing the attachment
   * @param organizationId The caller's organization ID (required)
   * @returns The removed attachment row
   */
  async removeDocumentAttachment(
    documentId: number,
    attachmentId: number,
    userId: string,
    organizationId: unknown
  ) {
    const orgId = requireOrgId(organizationId, 'removeDocumentAttachment');

    return this.db.transaction(async (tx: any) => {
      await this.requireOwnedDocument(tx, documentId, orgId);

      const [removed] = await tx
        .delete(documentAttachments)
        .where(
          and(
            eq(documentAttachments.id, attachmentId),
            eq(documentAttachments.documentId, documentId)
          )
        )
        .returning();

      // Nothing was removed — do not record a removal.
      if (!removed) throw new AttachmentNotFoundException(attachmentId);

      await tx.insert(documentAuditLogs).values({
        documentId,
        action: 'attachment_removed',
        performedBy: userId,
        details: {
          field: 'attachments',
          action: 'remove',
          attachmentId: removed.id,
          fileName: removed.fileName,
          fileType: removed.fileType,
        },
      });

      return removed;
    });
  }
}
