/**
 * Auto-Link Service
 *
 * Intelligent document linking to clinical trial modules and regulatory submissions.
 *
 * Enterprise features include:
 * - Automatic module detection and assignment
 * - Smart document categorization for IND/NDA/BLA submissions
 * - Trial phase-specific document mapping
 * - Document relevance scoring for module placement
 * - Audit logging of auto-linking decisions
 */

/**
 * Auto-link a document to appropriate regulatory modules
 *
 * @param {string} documentId - Document ID to auto-link
 * @param {Object} [options] - Additional options
 * @param {boolean} [options.autoAssign=false] - Whether to automatically assign the document
 * @param {string} [options.tenantId] - Tenant ID for multi-tenant isolation
 * @returns {Promise<Object>} - Auto-link results with module recommendations
 */
export async function autoLinkDocument(documentId, options = {}) {
  try {
    const response = await fetch('/api/autolink/document', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        documentId,
        autoAssign: options.autoAssign,
        tenantId: options.tenantId,
      }),
    });

    if (!response.ok) {
      throw new Error(`Error auto-linking document: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Auto-Link Service Error (autoLinkDocument):', error);
    throw error;
  }
}

/**
 * Get module recommendations for a document
 *
 * @param {string} documentId - Document ID to get recommendations for
 * @param {string} [tenantId] - Tenant ID for multi-tenant isolation
 * @returns {Promise<Object>} - Module recommendations with confidence scores
 */
export async function getModuleRecommendations(documentId, tenantId) {
  try {
    const params = new URLSearchParams();
    params.append('documentId', documentId);
    if (tenantId) params.append('tenantId', tenantId);

    const response = await fetch(`/api/autolink/recommendations?${params.toString()}`);

    if (!response.ok) {
      throw new Error(`Error getting module recommendations: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Auto-Link Service Error (getModuleRecommendations):', error);
    throw error;
  }
}

/**
 * Assign a document to specific modules
 *
 * @param {string} documentId - Document ID to assign
 * @param {Array<string>} moduleIds - Module IDs to assign the document to
 * @param {string} [tenantId] - Tenant ID for multi-tenant isolation
 * @returns {Promise<Object>} - Assignment result
 */
export async function assignDocumentToModules(documentId, moduleIds, tenantId) {
  try {
    const response = await fetch('/api/autolink/assign', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        documentId,
        moduleIds,
        tenantId,
      }),
    });

    if (!response.ok) {
      throw new Error(`Error assigning document to modules: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Auto-Link Service Error (assignDocumentToModules):', error);
    throw error;
  }
}

/**
 * Get modules a document is currently assigned to
 *
 * @param {string} documentId - Document ID to check
 * @param {string} [tenantId] - Tenant ID for multi-tenant isolation
 * @returns {Promise<Array>} - List of assigned modules
 */
export async function getDocumentModules(documentId, tenantId) {
  try {
    const params = new URLSearchParams();
    params.append('documentId', documentId);
    if (tenantId) params.append('tenantId', tenantId);

    const response = await fetch(`/api/autolink/document-modules?${params.toString()}`);

    if (!response.ok) {
      throw new Error(`Error getting document modules: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Auto-Link Service Error (getDocumentModules):', error);
    return [];
  }
}

/**
 * Get all documents assigned to a specific module
 *
 * @param {string} moduleId - Module ID to get documents for
 * @param {string} [tenantId] - Tenant ID for multi-tenant isolation
 * @returns {Promise<Array>} - List of documents assigned to the module
 */
export async function getModuleDocuments(moduleId, tenantId) {
  try {
    const params = new URLSearchParams();
    params.append('moduleId', moduleId);
    if (tenantId) params.append('tenantId', tenantId);

    const response = await fetch(`/api/autolink/module-documents?${params.toString()}`);

    if (!response.ok) {
      throw new Error(`Error getting module documents: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Auto-Link Service Error (getModuleDocuments):', error);
    return [];
  }
}

/**
 * Unassign a document from a module
 *
 * @param {string} documentId - Document ID to unassign
 * @param {string} moduleId - Module ID to unassign from
 * @param {string} [tenantId] - Tenant ID for multi-tenant isolation
 * @returns {Promise<Object>} - Unassignment result
 */
export async function unassignDocumentFromModule(documentId, moduleId, tenantId) {
  try {
    const response = await fetch('/api/autolink/unassign', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        documentId,
        moduleId,
        tenantId,
      }),
    });

    if (!response.ok) {
      throw new Error(`Error unassigning document from module: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Auto-Link Service Error (unassignDocumentFromModule):', error);
    throw error;
  }
}
