/**
 * Simple Document Storage Service
 *
 * In-memory document storage for immediate functionality
 */

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

// In-memory storage
const documents: Map<number, DocumentResponse> = new Map();
let nextId = 1;

export class SimpleDocumentStorage {
  /**
   * Save a new document
   */
  async saveDocument(data: SaveDocumentRequest): Promise<DocumentResponse> {
    const now = new Date();
    const document: DocumentResponse = {
      id: nextId++,
      title: data.title,
      content: data.content,
      documentType: data.documentType,
      status: 'draft',
      version: '1.0.0',
      createdAt: now,
      updatedAt: now,
    };

    documents.set(document.id, document);
    return document;
  }

  /**
   * Get document by ID
   */
  async getDocument(id: number): Promise<DocumentResponse | null> {
    return documents.get(id) || null;
  }

  /**
   * List all documents
   */
  async listDocuments(): Promise<DocumentResponse[]> {
    return Array.from(documents.values()).sort(
      (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()
    );
  }

  /**
   * Update existing document
   */
  async updateDocument(
    id: number,
    data: Partial<SaveDocumentRequest>
  ): Promise<DocumentResponse | null> {
    const document = documents.get(id);
    if (!document) return null;

    const updatedDocument: DocumentResponse = {
      ...document,
      ...data,
      updatedAt: new Date(),
    };

    documents.set(id, updatedDocument);
    return updatedDocument;
  }
}

export const simpleDocumentStorage = new SimpleDocumentStorage();
