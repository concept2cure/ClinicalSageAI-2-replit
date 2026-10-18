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
import { DocumentAttachmentService } from './module-integration/attachment-service';
import { DocumentNotFoundException } from './module-integration/errors';

// The attachment family is its own three modules under module-integration/.
// Re-exported here so the names this service's callers already import keep
// resolving from one place, and so a route can catch what it throws without
// knowing which file it came from.
export { DocumentAttachmentService } from './module-integration/attachment-service';
export {
  DocumentNotFoundException,
  AttachmentNotFoundException,
  AttachmentRejectedException,
} from './module-integration/errors';
export { type DocumentAttachmentInput } from './module-integration/attachment-input';

import {
  unifiedDocuments,
  moduleDocuments,
  moduleTypeEnum,
  workflowDocumentVersions,
  documentAuditLogs,
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
 * documentExists() dedupes on. There is no status: this service registers
 * every document as 'draft'.
 */
export interface RegisterDocumentInput {
  title: string;
  documentType: string;
  /** The authenticated actor. A route takes it from the session, never from a request body. */
  createdBy: string;
  organizationId: number;
  moduleType: ModuleType;
  originalId: string;
  content?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * What updateDocument may change. status is a review outcome ('approved' is
 * what the eCTD leaf resolver treats as finalized), and created_by,
 * organization_id and latest_version are the server's, so none of them is here.
 */
export interface UpdateDocumentInput {
  /** The authenticated actor. A route takes it from the session, never from a request body. */
  updatedBy: string;
  title?: string;
  documentType?: string;
  metadata?: Record<string, unknown>;
  /** New content is written as a new version. */
  content?: unknown;
}

/** The unified_documents columns a patch may set. */
const PATCHABLE_FIELDS = ['title', 'documentType', 'metadata'] as const;

export class ModuleIntegrationService {
  private workflowService: WorkflowService;

  /**
   * Attachments are their own service now; this holds one so getDocument can
   * carry `attachments`. Routes that act on attachments use it directly rather
   * than reaching through here — a facade that only forwards is a second name
   * for the same capability.
   */
  readonly attachments: DocumentAttachmentService;

  constructor(private db: RequestDb) {
    this.workflowService = new WorkflowService(db);
    this.attachments = new DocumentAttachmentService(db);
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
            // 2026-10-15: was `documentData.status || 'draft'`, and the route
            // spread its request body into documentData, so a caller could
            // register a document as 'approved' (finalized, to the eCTD leaf
            // resolver) with no approval behind it. The server sets it.
            status: 'draft',
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

    // Attachments ride on the existing document read rather than a new
    // endpoint. GET /api/module-integration/document/:id is already mounted,
    // already org-scoped, and is where a caller looking at a document would
    // expect to see what is attached to it. The attachment service re-runs the
    // ownership check this method has just done; one indexed PK lookup is a
    // cheap price for a single implementation of the tenant walk, and it
    // matches the defence-in-depth this file already practises.
    const attachments = await this.attachments.list(documentId, organizationId);

    return {
      ...document[0],
      moduleType: moduleDoc[0]?.moduleType,
      originalId: moduleDoc[0]?.originalId,
      version: latestVersion[0],
      attachments,
    };
  }

  /**
   * Update a document
   *
   * @param documentId The document ID
   * @param updateData The fields to change, and the actor changing them
   * @returns The updated document
   */
  async updateDocument(documentId: number, updateData: UpdateDocumentInput, organizationId: number) {
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

      // 2026-10-15: the whole patch was spread into the UPDATE, so a caller
      // could set status, created_by, latest_version and organization_id —
      // moving the document into another tenant. Only these columns are taken.
      const docUpdateData: Record<string, unknown> = {};
      for (const field of PATCHABLE_FIELDS) {
        if (updateData[field] !== undefined) docUpdateData[field] = updateData[field];
      }

      // Check if content is being updated
      let newVersion = null;
      if (updateData.content !== undefined) {
        const nextVersion = existingDoc[0].latestVersion + 1;
        // Create a new version
        const [version] = await tx
          .insert(workflowDocumentVersions)
          .values({
            documentId,
            version: nextVersion,
            content: updateData.content,
            createdBy: updateData.updatedBy,
            organizationId,
          })
          .returning();

        newVersion = version;

        // Update latestVersion in document
        docUpdateData.latestVersion = nextVersion;

        // Add audit log for version change
        await tx.insert(documentAuditLogs).values({
          documentId,
          action: 'version_created',
          performedBy: updateData.updatedBy,
          details: {
            previousVersion: existingDoc[0].latestVersion,
            newVersion: nextVersion,
          },
        });

        // Create diff logs if needed
        if (existingDoc[0].latestVersion > 0) {
          await this.logDocumentChanges(
            tx,
            documentId,
            existingDoc[0].latestVersion,
            nextVersion,
            updateData.updatedBy
          );
        }
      }

      const changedFields = Object.keys(docUpdateData).filter(
        key => docUpdateData[key] !== existingDoc[0][key]
      );

      // Nothing changed: no write, so no "updated by" for an update that did not happen.
      if (changedFields.length === 0) {
        return {
          ...existingDoc[0],
          version: newVersion,
        };
      }

      // Update the document
      const [updatedDoc] = await tx
        .update(unifiedDocuments)
        .set({
          ...docUpdateData,
          updatedBy: updateData.updatedBy,
          updatedAt: new Date(),
        })
        .where(and(
          eq(unifiedDocuments.id, documentId),
          eq(unifiedDocuments.organizationId, organizationId)
        ))
        .returning();

      // 2026-10-15: these rows were built in a forEach and never awaited, and a
      // Drizzle builder sends nothing until it is awaited — so no field change
      // was ever audited. One awaited insert on this transaction: the change and
      // its audit rows commit or roll back together.
      await tx.insert(documentAuditLogs).values(
        changedFields.map(field => ({
          documentId,
          action: 'field_updated',
          performedBy: updateData.updatedBy,
          details: {
            field,
            previous: existingDoc[0][field],
            current: docUpdateData[field],
          },
        }))
      );

      return {
        ...updatedDoc,
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
}
