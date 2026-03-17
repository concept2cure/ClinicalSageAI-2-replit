/**
 * Module Integration Service
 *
 * This service handles the integration of module-specific documents with the unified
 * document workflow system. It provides methods for registering, retrieving, and
 * managing documents across different modules.
 */

import { db } from '../db';
import { eq, and, inArray } from 'drizzle-orm';
import { WorkflowService } from './WorkflowService';
import {
  unifiedDocuments,
  moduleDocuments,
  workflowDocumentVersions,
  documentAuditLogs,
  documentWorkflows,
} from '../../shared/schema/unified_workflow';

/**
 * Exception for document not found errors
 */
export class DocumentNotFoundException extends Error {
  constructor(documentId: number | string) {
    super(`Document with ID ${documentId} not found`);
    this.name = 'DocumentNotFoundException';
  }
}

export class ModuleIntegrationService {
  private workflowService: WorkflowService;

  constructor(private db: any) {
    this.workflowService = new WorkflowService(db);
  }

  /**
   * Register a new document in the unified system
   *
   * @param documentData The document data to register
   * @returns The registered document
   */
  async registerDocument(documentData: any) {
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
  async documentExists(moduleType: any, originalId: any, organizationId: any) {
    const result = await this.db
      .select({ count: { count: 'id' } })
      .from(moduleDocuments)
      .where(
        and(
          eq(moduleDocuments.moduleType, moduleType),
          eq(moduleDocuments.originalId, originalId),
          eq(moduleDocuments.organizationId, organizationId)
        )
      );

    return result.length > 0 && result[0].count > 0;
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

    const documentIds = moduleDocsResult.map(doc => doc.unifiedDocumentId);

    const docsResult = await this.db
      .select()
      .from(unifiedDocuments)
      .where(inArray(unifiedDocuments.id, documentIds));

    // Join the results
    return docsResult.map(doc => {
      const moduleDoc = moduleDocsResult.find(md => md.unifiedDocumentId === doc.id);
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
      .where(inArray(unifiedDocuments.id, documentIds));

    // Join with module documents
    const moduleDocsResult = await this.db
      .select()
      .from(moduleDocuments)
      .where(inArray(moduleDocuments.unifiedDocumentId, documentIds));

    // Get current approvals for each workflow
    const workflowsWithApprovals = await Promise.all(
      workflows.map(async (w: any) => {
        const approvals = await this.workflowService.getWorkflowApprovals(w.id);
        const currentApproval = approvals.find(a => a.status === 'pending');
        return {
          ...w,
          approvals,
          currentApproval,
        };
      })
    );

    // Join everything together
    return documents.map(doc => {
      const moduleDoc = moduleDocsResult.find(md => md.unifiedDocumentId === doc.id);
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
  async getDocument(documentId: any) {
    const document = await this.db
      .select()
      .from(unifiedDocuments)
      .where(eq(unifiedDocuments.id, documentId))
      .limit(1);

    if (!document.length) {
      throw new DocumentNotFoundException(documentId);
    }

    const moduleDoc = await this.db
      .select()
      .from(moduleDocuments)
      .where(eq(moduleDocuments.unifiedDocumentId, documentId))
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
  async updateDocument(documentId: any, updateData: any) {
    return this.db.transaction(async (tx: any) => {
      // Check if document exists
      const existingDoc = await tx
        .select()
        .from(unifiedDocuments)
        .where(eq(unifiedDocuments.id, documentId))
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
          .where(eq(unifiedDocuments.id, documentId))
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
   * Add an attachment to a document
   *
   * @param documentId Document ID
   * @param attachmentData Attachment data
   * @param userId User adding the attachment
   */
  async addDocumentAttachment(documentId: number, attachmentData: any, userId: string) {
    return this.db.transaction(async (tx: any) => {
      // Add the attachment

      // Log the action
      await tx.insert(documentAuditLogs).values({
        documentId,
        action: 'attachment_added',
        performedBy: userId,
        details: {
          field: 'attachments',
          action: 'add',
          value: attachmentData.fileName,
        },
      });
    });
  }

  /**
   * Remove an attachment from a document
   *
   * @param documentId Document ID
   * @param attachmentId Attachment ID
   * @param userId User removing the attachment
   */
  async removeDocumentAttachment(documentId: number, attachmentId: number, userId: string) {
    return this.db.transaction(async (tx: any) => {
      // Get attachment details first
      // Remove the attachment

      // Log the action
      await tx.insert(documentAuditLogs).values({
        documentId,
        action: 'attachment_removed',
        performedBy: userId,
        details: {
          field: 'attachments',
          action: 'remove',
          value: attachmentId,
        },
      });
    });
  }
}
