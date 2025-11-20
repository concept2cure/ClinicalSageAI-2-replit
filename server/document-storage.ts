/**
 * Document Storage Service
 *
 * Handles saving and retrieving documents from the database.
 */
import { createScopedLogger } from './utils/logger';
import { db } from './db';
import {
  regulatoryDocuments,
  documentVersions,
  insertRegulatoryDocumentSchema,
  insertDocumentVersionSchema,
} from '../shared/schema';
import { eq, desc } from 'drizzle-orm';
import { z } from 'zod';

const logger = createScopedLogger('document-storage');

export interface SaveDocumentRequest {
  title: string;
  content: string;
  documentType: string;
  organizationId?: number;
  userId?: number;
}

export interface DocumentResponse {
  id: number;
  title: string;
  content: string;
  documentType: string;
  status: string;
  version: string;
  createdAt: Date;
  updatedAt: Date;
}

export class DocumentStorage {
  /**
   * Save a new document or update existing one
   */
  async saveDocument(data: SaveDocumentRequest): Promise<DocumentResponse> {
    try {
      logger.info('Saving document', { title: data.title, type: data.documentType });

      const documentData = {
        title: data.title,
        content: data.content,
        documentType: data.documentType,
        organizationId: data.organizationId || 1, // Default org
        status: 'draft',
        version: '1.0.0',
        createdById: data.userId || 1,
        lastModifiedById: data.userId || 1,
        metadata: {},
        complianceMetrics: {},
      };

      // Insert document
      const [savedDocument] = await db.insert(regulatoryDocuments).values(documentData).returning();

      // Create initial version
      await db.insert(documentVersions).values({
        documentId: savedDocument.id,
        versionNumber: '1.0.0',
        content: data.content,
        changeDescription: 'Initial version',
        createdById: data.userId || 1,
      });

      logger.info('Document saved successfully', {
        id: savedDocument.id,
        title: savedDocument.title,
      });

      return {
        id: savedDocument.id,
        title: savedDocument.title,
        content: savedDocument.content,
        documentType: savedDocument.documentType,
        status: savedDocument.status,
        version: savedDocument.version,
        createdAt: savedDocument.createdAt,
        updatedAt: savedDocument.updatedAt,
      };
    } catch (error) {
      logger.error('Failed to save document', { error: error.message });
      throw new Error('Failed to save document to database');
    }
  }

  /**
   * Get document by ID
   */
  async getDocument(id: number): Promise<DocumentResponse | null> {
    try {
      const [document] = await db
        .select()
        .from(regulatoryDocuments)
        .where(eq(regulatoryDocuments.id, id));

      if (!document) {
        return null;
      }

      return {
        id: document.id,
        title: document.title,
        content: document.content,
        documentType: document.documentType,
        status: document.status,
        version: document.version,
        createdAt: document.createdAt,
        updatedAt: document.updatedAt,
      };
    } catch (error) {
      logger.error('Failed to get document', { id, error: error.message });
      return null;
    }
  }

  /**
   * List all documents for an organization
   */
  async listDocuments(organizationId: number = 1): Promise<DocumentResponse[]> {
    try {
      const documentList = await db
        .select()
        .from(regulatoryDocuments)
        .where(eq(regulatoryDocuments.organizationId, organizationId))
        .orderBy(desc(regulatoryDocuments.updatedAt));

      return documentList.map(doc => ({
        id: doc.id,
        title: doc.title,
        content: doc.content,
        documentType: doc.documentType,
        status: doc.status,
        version: doc.version || '1.0.0',
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      }));
    } catch (error) {
      logger.error('Failed to list documents', { organizationId, error: error.message });
      return [];
    }
  }

  /**
   * Update existing document
   */
  async updateDocument(
    id: number,
    data: Partial<SaveDocumentRequest>
  ): Promise<DocumentResponse | null> {
    try {
      logger.info('Updating document', { id, title: data.title });

      const updateData: any = {
        updatedAt: new Date(),
      };

      if (data.title) updateData.title = data.title;
      if (data.content) updateData.content = data.content;
      if (data.documentType) updateData.documentType = data.documentType;
      if (data.userId) updateData.lastModifiedById = data.userId;

      const [updatedDocument] = await db
        .update(documents)
        .set(updateData)
        .where(eq(documents.id, id))
        .returning();

      if (!updatedDocument) {
        return null;
      }

      // Create new version if content changed
      if (data.content) {
        await db.insert(documentVersions).values({
          documentId: id,
          versionNumber: `${Math.floor(Math.random() * 100)}.0.0`, // Simple versioning
          content: data.content,
          changeDescription: 'Document updated',
          createdById: data.userId || 1,
        });
      }

      return {
        id: updatedDocument.id,
        title: updatedDocument.title,
        content: updatedDocument.content,
        documentType: updatedDocument.documentType,
        status: updatedDocument.status,
        version: updatedDocument.version,
        createdAt: updatedDocument.createdAt,
        updatedAt: updatedDocument.updatedAt,
      };
    } catch (error) {
      logger.error('Failed to update document', { id, error: error.message });
      return null;
    }
  }
}

// Export singleton instance
export const documentStorage = new DocumentStorage();
