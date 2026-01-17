/**
 * @file VaultDMSService.js
 * @description Single source of truth for all TrialSage Vault DMS operations.
 * This service handles database integration, multi-tenancy, file storage,
 * and business logic for the document management system.
 *
 * ARCHITECT: Google Gemini
 * DATE: 2025-07-10
 */
import { logAction } from '../utils/audit-logger.js';

class VaultDMSService {
  constructor(dbPool, storageClient) {
    if (!dbPool || !storageClient) {
      throw new Error('VaultDMSService requires a database pool and a storage client.');
    }
    this.db = dbPool;
    this.storage = storageClient;
    console.log('✅ VaultDMSService initialized.');
  }

  // =================================================================
  // SECTION 1: CORE DOCUMENT OPERATIONS (CRUD)
  // =================================================================

  /**
   * Retrieves all documents for a specific tenant.
   * @param {string} tenantId - The UUID of the tenant.
   * @returns {Promise<Array>} A promise that resolves to an array of documents.
   */
  async listDocuments(tenantId) {
    if (!tenantId) {
      throw new Error('tenantId is required to list documents.');
    }
    const sql = `
            SELECT id, title, type, date, status, file_path, created_at, updated_at 
            FROM vault_documents 
            WHERE organization_id = $1 
            ORDER BY updated_at DESC;
        `;
    try {
      const { rows } = await this.db.query(sql, [tenantId]);
      console.log(`[VaultDMSService] Found ${rows.length} documents for tenant ${tenantId}`);
      return rows;
    } catch (error) {
      console.error(`[VaultDMSService] Error fetching documents for tenant ${tenantId}:`, error);
      throw new Error('Failed to retrieve documents from the database.');
    }
  }

  /**
   * Retrieves a specific document by its ID for a given tenant.
   * @param {string} tenantId - The UUID of the tenant.
   * @param {number} documentId - The ID of the document to retrieve.
   * @returns {Promise<Object|null>} A promise that resolves to the document object or null if not found.
   */
  async getDocumentById(tenantId, documentId) {
    if (!tenantId) {
      throw new Error('tenantId is required to retrieve a document.');
    }
    if (!documentId) {
      throw new Error('documentId is required to retrieve a document.');
    }

    const sql = `
            SELECT id, title, type, date, status, file_path, created_at, updated_at 
            FROM vault_documents 
            WHERE organization_id = $1 AND id = $2;
        `;

    try {
      const { rows } = await this.db.query(sql, [tenantId, documentId]);
      if (rows.length === 0) {
        console.log(`[VaultDMSService] Document ${documentId} not found for tenant ${tenantId}`);
        return null;
      }

      const document = rows[0];
      console.log(
        `[VaultDMSService] Retrieved document ${documentId} for tenant ${tenantId}: ${document.title}`
      );
      return document;
    } catch (error) {
      console.error(
        `[VaultDMSService] Error fetching document ${documentId} for tenant ${tenantId}:`,
        error
      );
      throw new Error('Failed to retrieve document from the database.');
    }
  }

  /**
   * Creates a new document in the vault.
   * @param {string} tenantId - The UUID of the tenant.
   * @param {Object} documentData - The document metadata.
   * @param {string} documentData.title - The document title.
   * @param {string} documentData.type - The document type (IND, NDA, BLA, etc.).
   * @param {string} documentData.status - The document status.
   * @param {Date} documentData.date - The document date.
   * @param {Object} file - The file object (for storage simulation).
   * @returns {Promise<Object>} A promise that resolves to the created document object.
   */
  async createDocument(tenantId, documentData, file) {
    if (!tenantId) {
      throw new Error('tenantId is required to create a document.');
    }
    if (!documentData || !documentData.title || !documentData.type || !documentData.status) {
      throw new Error('documentData with title, type, and status are required.');
    }

    // Simulate file storage (in production, this would upload to actual storage)
    let filePath = null;
    if (file && file.originalname) {
      filePath = `/uploads/${tenantId}/${Date.now()}-${file.originalname}`;
      console.log(`[VaultDMSService] Simulated file upload: ${filePath}`);
    }

    const sql = `
            INSERT INTO vault_documents (organization_id, title, type, date, status, file_path)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id, organization_id, title, type, date, status, file_path, created_at, updated_at;
        `;
    const values = [
      tenantId,
      documentData.title,
      documentData.type,
      documentData.date || new Date().toISOString().split('T')[0],
      documentData.status,
      filePath,
    ];

    try {
      const { rows } = await this.db.query(sql, values);
      const createdDocument = rows[0];
      console.log(
        `[VaultDMSService] Created document ${createdDocument.id} for tenant ${tenantId}: ${createdDocument.title}`
      );

      // Log audit event
      const userId = documentData.userId || 'system-user';
      await this.logAuditEvent(tenantId, userId, 'document.create', createdDocument.id, {
        title: createdDocument.title,
        type: createdDocument.type,
        status: createdDocument.status,
      });

      return createdDocument;
    } catch (error) {
      console.error(`[VaultDMSService] Error creating document for tenant ${tenantId}:`, error);
      throw new Error('Failed to create document in the database.');
    }
  }

  /**
   * Updates a document's metadata dynamically based on the provided fields.
   * @param {string} tenantId - The UUID of the tenant.
   * @param {number} documentId - The ID of the document to update.
   * @param {object} updates - An object with the fields to update (e.g., { title: 'New Title', status: 'Archived' }).
   * @returns {Promise<Object|null>} A promise that resolves to the updated document object, or null if not found.
   */
  async updateDocumentMetadata(tenantId, documentId, updates) {
    if (!tenantId) {
      throw new Error('tenantId is required to update a document.');
    }
    if (!documentId) {
      throw new Error('documentId is required to update a document.');
    }

    const updateFields = Object.keys(updates);
    if (updateFields.length === 0) {
      throw new Error('No update fields provided.');
    }

    // Dynamically build the SET part of the SQL query
    const setClause = updateFields.map((field, index) => `"${field}" = $${index + 1}`).join(', ');
    const updateValues = Object.values(updates);

    const sql = `
            UPDATE vault_documents
            SET ${setClause}, updated_at = NOW()
            WHERE id = $${updateFields.length + 1} AND organization_id = $${updateFields.length + 2}
            RETURNING id, organization_id, title, type, date, status, file_path, created_at, updated_at;
        `;

    try {
      const { rows, rowCount } = await this.db.query(sql, [...updateValues, documentId, tenantId]);
      if (rowCount === 0) {
        console.warn(
          `[VaultDMSService] Attempted to update document ${documentId} for tenant ${tenantId}, but it was not found.`
        );
        return null;
      }

      const updatedDocument = rows[0];
      console.log(
        `[VaultDMSService] Successfully updated document ${documentId} for tenant ${tenantId}: ${updatedDocument.title}`
      );

      // Log audit event for update
      const userId = updates.userId || 'system-user';
      await this.logAuditEvent(tenantId, userId, 'document.update', documentId, {
        updatedFields: updateFields,
      });

      return updatedDocument;
    } catch (error) {
      console.error(`[VaultDMSService] Error updating document ${documentId}:`, error);
      if (error.message.includes('column') && error.message.includes('does not exist')) {
        throw new Error(
          `Invalid field provided for update. One of [${updateFields.join(', ')}] is not a valid column.`
        );
      }
      throw new Error('Failed to update document in the database.');
    }
  }

  /**
   * Deletes a document from the database.
   * @param {string} tenantId - The UUID of the tenant.
   * @param {number} documentId - The ID of the document to delete.
   * @returns {Promise<boolean>} A promise that resolves to true if deleted, false if not found.
   */
  async deleteDocument(tenantId, documentId) {
    if (!tenantId) {
      throw new Error('tenantId is required to delete a document.');
    }
    if (!documentId) {
      throw new Error('documentId is required to delete a document.');
    }

    const sql = `
            DELETE FROM vault_documents
            WHERE id = $1 AND organization_id = $2;
        `;

    try {
      const { rowCount } = await this.db.query(sql, [documentId, tenantId]);
      if (rowCount > 0) {
        console.log(
          `[VaultDMSService] Successfully deleted document ${documentId} for tenant ${tenantId}.`
        );

        // Log audit event
        const userId = 'system-user';
        await this.logAuditEvent(tenantId, userId, 'document.delete', documentId, {});
        return true;
      } else {
        console.warn(
          `[VaultDMSService] Attempted to delete document ${documentId} for tenant ${tenantId}, but it was not found.`
        );
        return false;
      }
    } catch (error) {
      console.error(`[VaultDMSService] Error deleting document ${documentId}:`, error);
      throw new Error('Failed to delete document from the database.');
    }
  }

  /**
   * Searches for documents based on a term, matching against title and type.
   * @param {string} tenantId - The UUID of the tenant.
   * @param {string} searchTerm - The term to search for.
   * @returns {Promise<Array>} A promise that resolves to an array of matching documents.
   */
  async searchDocuments(tenantId, searchTerm) {
    if (!tenantId) {
      throw new Error('tenantId is required for search.');
    }
    if (!searchTerm) {
      throw new Error('searchTerm is required for search.');
    }

    const sql = `
            SELECT id, organization_id, title, type, date, status, file_path, created_at, updated_at 
            FROM vault_documents 
            WHERE organization_id = $1 AND (title ILIKE $2 OR type ILIKE $2)
            ORDER BY updated_at DESC;
        `;
    const wildcardSearchTerm = `%${searchTerm}%`;

    try {
      const { rows } = await this.db.query(sql, [tenantId, wildcardSearchTerm]);
      console.log(
        `[VaultDMSService] Found ${rows.length} documents matching "${searchTerm}" for tenant ${tenantId}`
      );
      return rows;
    } catch (error) {
      console.error(`[VaultDMSService] Error searching documents for term "${searchTerm}":`, error);
      throw new Error('Failed to search documents in the database.');
    }
  }

  /**
   * Retrieves documents within a specific folder for a tenant.
   * @param {string} tenantId - The UUID of the tenant.
   * @param {number|string} folderId - The ID of the folder to filter documents.
   * @returns {Promise<Array>} A promise that resolves to an array of documents in the folder.
   */
  async listDocumentsByFolder(tenantId, folderId) {
    if (!tenantId) {
      throw new Error('tenantId is required to list documents by folder.');
    }
    if (!folderId) {
      throw new Error('folderId is required to list documents by folder.');
    }
    const sql = `
            SELECT id, organization_id, title, type, date, status, file_path, created_at, updated_at
            FROM vault_documents
            WHERE organization_id = $1 AND folder_id = $2
            ORDER BY updated_at DESC;
        `;
    try {
      const { rows } = await this.db.query(sql, [tenantId, folderId]);
      console.log(
        `[VaultDMSService] Found ${rows.length} documents in folder ${folderId} for tenant ${tenantId}`
      );
      return rows;
    } catch (error) {
      console.error(
        `[VaultDMSService] Error fetching documents in folder ${folderId} for tenant ${tenantId}:`,
        error
      );
      throw new Error('Failed to retrieve documents by folder from the database.');
    }
  }

  // =================================================================
  // SECTION 2: MULTI-TENANCY & SECURITY
  // =================================================================

  /**
   * Checks DocuShare API connectivity and validates connection
   * @returns {Promise<boolean>} A promise that resolves to true if connection is successful
   */
  async checkDocuShareConnection(tenantId = null) {
    try {
      if (!process.env.DOCUSHARE_API_URL || !process.env.DOCUSHARE_API_KEY) {
        throw new Error('DocuShare configuration missing');
      }
      if (
        process.env.NODE_ENV === 'production' &&
        !process.env.DOCUSHARE_API_URL.startsWith('https://')
      ) {
        throw new Error('HTTPS required for DocuShare in production');
      }

      const headers = {
        'X-DocuShare-Api-Key': process.env.DOCUSHARE_API_KEY,
        Accept: 'application/json',
        'User-Agent': 'TrialSage-VaultDMS/1.0',
      };
      if (tenantId) {
        headers['X-Tenant-Id'] = tenantId;
      }

      const response = await fetch(`${process.env.DOCUSHARE_API_URL}/api/version`, {
        method: 'GET',
        headers: headers,
        timeout: parseInt(process.env.DOCUSHARE_CONNECTION_TIMEOUT || '30000'),
      });

      if (response.ok) {
        console.log(
          `✅ DocuShare API connection verified${tenantId ? ` for tenant ${tenantId}` : ''}`
        );
        return true;
      } else {
        console.error(
          `❌ DocuShare API connection failed: ${response.status} ${response.statusText}`
        );
        return false;
      }
    } catch (error) {
      console.error('❌ DocuShare connection failed:', error.message);
      throw new Error('Cannot connect to DocuShare: ' + error.message);
    }
  }

  // =================================================================
  // SECTION 3: FILE STORAGE & VERSIONING
  // =================================================================

  /**
   * Creates a new version of a document by uploading a new file to DocuShare and updating the database.
   * @param {string} tenantId - The UUID of the tenant.
   * @param {number} documentId - The ID of the document to version.
   * @param {Object} file - The new file object containing buffer and originalname properties.
   * @param {string} versionNote - Optional note describing the changes in this version.
   * @returns {Promise<Object>} A promise that resolves to the updated document record.
   */
  async createNewVersion(tenantId, documentId, file, versionNote = '') {
    if (!tenantId) {
      throw new Error('tenantId is required to create a new version.');
    }
    if (!documentId) {
      throw new Error('documentId is required to create a new version.');
    }
    if (!file || !file.originalname) {
      throw new Error('file with originalname is required to create a new version.');
    }

    const currentResult = await this.db.query(
      `SELECT id, version, file_path FROM vault_documents WHERE id = $1 AND organization_id = $2`,
      [documentId, tenantId]
    );
    if (currentResult.rows.length === 0) {
      throw new Error(`Document ${documentId} not found for tenant ${tenantId}`);
    }
    const currentDoc = currentResult.rows[0];

    let docuResult;
    try {
      docuResult = await docuShareClient.createVersion(documentId, file, versionNote);
    } catch (error) {
      console.error(
        `[VaultDMSService] Error creating new version for document ${documentId} on DocuShare:`,
        error
      );
      throw new Error('Failed to create new version in DocuShare');
    }

    const currentVersion = currentDoc.version || '1.0';
    let newVersion;
    const parts = currentVersion.split('.');
    if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      const major = parseInt(parts[0], 10);
      const minor = parseInt(parts[1], 10) + 1;
      newVersion = `${major}.${minor}`;
    } else {
      newVersion = '1.1';
    }

    const updateSql = `
        UPDATE vault_documents
        SET version = $1, updated_at = NOW()
        WHERE id = $2 AND organization_id = $3
        RETURNING id, organization_id, title, type, date, status, file_path, version, created_at, updated_at;
      `;
    const { rows: updatedRows } = await this.db.query(updateSql, [newVersion, documentId, tenantId]);
    const updatedDoc = updatedRows[0];

    const userId = file.userId || 'system-user';
    try {
      await this.logAuditEvent(tenantId, userId, 'document.version', documentId, {
        newVersion,
        docuShareVersion: docuResult.version,
        note: versionNote,
      });
    } catch (auditError) {
      console.warn('[VaultDMSService] Audit logging failed during version creation:', auditError);
    }

    return updatedDoc;
  }

  /**
   * Logs an audit event using the centralized audit logger.
   * @param {string} tenantId - The UUID of the tenant
   * @param {string} userId - The ID of the user performing the action
   * @param {string} action - The action performed (e.g., 'document.create')
   * @param {number|string} documentId - The ID of the document
   * @param {object} details - Additional details about the action
   */
  async logAuditEvent(tenantId, userId, action, documentId, details = {}) {
    try {
      await logAction({
        action,
        userId,
        username: userId,
        entityType: 'document',
        entityId: documentId,
        details: { tenantId, ...details },
        ipAddress: '',
        userAgent: '',
      });
    } catch (error) {
      console.error('[VaultDMSService] Audit logging failed:', error);
    }
  }
}

// DocuShare OEM API Client Implementation
const docuShareClient = {
  baseUrl:
    process.env.DOCUSHARE_API_URL || 'https://docushare.yourcompany.com/docushare/dsweb/Services',
  apiVersion: process.env.DOCUSHARE_API_VERSION || '7.5',
  apiKey: process.env.DOCUSHARE_API_KEY,
  oemId: process.env.DOCUSHARE_OEM_ID,
  username: process.env.DOCUSHARE_USERNAME,
  password: process.env.DOCUSHARE_PASSWORD,
  domain: process.env.DOCUSHARE_DOMAIN,
  sessionToken: null,
  lastAuthTime: null,
  retryAttempts: parseInt(process.env.DOCUSHARE_RETRY_ATTEMPTS || '3'),

  async authenticate() {
    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      try {
        const authPayload = {
          username: this.username,
          password: this.password,
          domain: this.domain,
          oemId: this.oemId,
        };

        const response = await fetch(`${this.baseUrl}/Session`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
            'X-OEM-ID': this.oemId,
            'User-Agent': 'TrialSage-DocuShare-Client/1.0',
          },
          body: JSON.stringify(authPayload),
          timeout: parseInt(process.env.DOCUSHARE_CONNECTION_TIMEOUT || '30000'),
        });

        if (!response.ok) {
          throw new Error(`Authentication failed: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        this.sessionToken = data.dsessionid || data.sessionToken;
        this.lastAuthTime = Date.now();

        console.log(`✅ DocuShare authentication successful (attempt ${attempt})`);
        return this.sessionToken;
      } catch (error) {
        console.error(`❌ DocuShare authentication attempt ${attempt} failed:`, error.message);
        if (attempt === this.retryAttempts) {
          throw new Error(
            `DocuShare authentication failed after ${this.retryAttempts} attempts: ${error.message}`
          );
        }
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
      }
    }
  },

  async ensureValidSession() {
    const sessionTimeout = parseInt(process.env.DOCUSHARE_SESSION_TIMEOUT || '3600') * 1000;
    if (
      !this.sessionToken ||
      !this.lastAuthTime ||
      Date.now() - this.lastAuthTime > sessionTimeout
    ) {
      await this.authenticate();
    }
    return this.sessionToken;
  },

  async upload(file) {
    await this.authenticate();
    const formData = new FormData();
    // Implementation omitted for brevity
  },

  async createVersion(documentId, file, versionNote) {
    await this.ensureValidSession();
    // Implementation omitted; should return an object with a "version" property
    return { version: '2.0' };
  },
};
export default VaultDMSService;
