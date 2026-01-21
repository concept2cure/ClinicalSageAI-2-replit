/**
 * Reference Model Helper Utilities
 *
 * These utilities provide helper functions for working with the Veeva-style document reference model:
 * - Getting subtype information
 * - Enforcing folder hierarchy based on document types
 * - Validating document metadata against reference model
 */

import { query } from '../lib/db.js';
import { logger } from '../utils/logger.js';

/**
 * Get detailed information about a document subtype
 * @param {string} id - Subtype ID to retrieve
 * @returns {Promise<Object>} - Document subtype information
 */
export async function getSubtype(id) {
  try {
    const result = await query(
      `SELECT 
        ds.*,
        dt.id as type_id, dt.name as type_name, dt.description as type_description,
        lc.id as lifecycle_id, lc.name as lifecycle_name, lc.start_state
      FROM document_subtypes ds
      LEFT JOIN document_types dt ON ds.type_id = dt.id
      LEFT JOIN lifecycle lc ON ds.lifecycle_id = lc.id
      WHERE ds.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      throw new Error(`Subtype with ID '${id}' not found`);
    }

    const row = result.rows[0];
    
    // Format to match previous structure
    return {
      ...row,
      document_types: {
        id: row.type_id,
        name: row.type_name,
        description: row.type_description,
      },
      lifecycle: {
        id: row.lifecycle_id,
        name: row.lifecycle_name,
        start_state: row.start_state,
      },
    };
  } catch (error) {
    logger.error({ err: error, subtypeId: id }, 'Error fetching document subtype');
    throw error;
  }
}

/**
 * Get folder information by ID
 * @param {number} id - Folder ID to retrieve
 * @returns {Promise<Object>} - Folder information
 */
export async function getFolder(id) {
  try {
    const result = await query('SELECT * FROM folders WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      throw new Error(`Folder with ID '${id}' not found`);
    }

    return result.rows[0];
  } catch (error) {
    logger.error({ err: error, folderId: id }, 'Error fetching folder');
    throw error;
  }
}

/**
 * Enforce folder hierarchy - validates that a document with the specified subtype
 * is being placed in a folder of the correct document type
 *
 * @param {number} folderId - ID of the folder where the document will be placed
 * @param {string} subtypeId - Document subtype ID
 * @returns {Promise<boolean>} - true if valid, throws error if invalid
 */
export async function enforceFolder(folderId, subtypeId) {
  try {
    // Get folder information
    const folder = await getFolder(folderId);

    // Get subtype information
    const subtype = await getSubtype(subtypeId);

    // If folder has a document_type_id, verify it matches the subtype's type_id
    if (folder.document_type_id && folder.document_type_id !== subtype.type_id) {
      throw new Error(
        `Documents of type '${subtype.document_types.name}' must be placed in a '${subtype.document_types.name}' folder. Current folder is for '${folder.document_type_id}'.`
      );
    }

    // Check if the folder is a sub-folder and navigate up to find the top-level folder
    if (!folder.document_type_id && folder.parent_id) {
      // Recursive check of parent folders until we find one with a document_type_id
      let currentFolderId = folder.parent_id;
      let maxDepth = 10; // Safety limit to prevent infinite loops

      while (currentFolderId && maxDepth > 0) {
        const parentFolder = await getFolder(currentFolderId);

        if (parentFolder.document_type_id) {
          // Found a parent with document_type_id, verify it matches
          if (parentFolder.document_type_id !== subtype.type_id) {
            throw new Error(
              `Documents of type '${subtype.document_types.name}' must be placed in a '${subtype.document_types.name}' folder hierarchy. Current hierarchy is for '${parentFolder.document_type_id}'.`
            );
          }
          break;
        }

        // Continue up the hierarchy
        currentFolderId = parentFolder.parent_id;
        maxDepth--;
      }
    }

    // Document placement is valid
    return true;
  } catch (error) {
    logger.error(
      {
        err: error,
        folderId,
        subtypeId,
      },
      'Error enforcing folder hierarchy'
    );
    throw error;
  }
}

/**
 * Calculate retention dates for a document based on its subtype
 *
 * @param {string} subtypeId - Document subtype ID
 * @param {string|null} tenantId - Optional tenant ID for tenant-specific rules
 * @returns {Promise<Object>} - Object containing periodic_review_date, archive_date, delete_date
 */
export async function calculateRetentionDates(subtypeId, tenantId = null) {
  try {
    // First check if there's a tenant-specific rule
    let retentionRule = null;

    if (tenantId) {
      const tenantRuleResult = await query(
        'SELECT * FROM retention_rules WHERE document_subtype_id = $1 AND tenant_id = $2',
        [subtypeId, tenantId]
      );

      if (tenantRuleResult.rows.length > 0) {
        retentionRule = tenantRuleResult.rows[0];
      }
    }

    // If no tenant-specific rule, get default from subtype
    if (!retentionRule) {
      const subtypeResult = await query(
        'SELECT review_interval, archive_after, delete_after FROM document_subtypes WHERE id = $1',
        [subtypeId]
      );

      if (subtypeResult.rows.length === 0) {
        throw new Error(`Subtype with ID '${subtypeId}' not found`);
      }

      retentionRule = {
        archive_after: subtypeResult.rows[0].archive_after,
        delete_after: subtypeResult.rows[0].delete_after,
        review_interval: subtypeResult.rows[0].review_interval,
      };
    }

    // Calculate dates based on current date
    const today = new Date();
    const result = {
      periodic_review_date: retentionRule.review_interval
        ? new Date(today.setMonth(today.getMonth() + retentionRule.review_interval))
        : null,
      archive_date: retentionRule.archive_after
        ? new Date(today.setMonth(today.getMonth() + retentionRule.archive_after))
        : null,
      delete_date: retentionRule.delete_after
        ? new Date(today.setMonth(today.getMonth() + retentionRule.delete_after))
        : null,
    };

    return result;
  } catch (error) {
    logger.error({ err: error, subtypeId }, 'Error calculating retention dates');
    throw error;
  }
}

/**
 * Validate document metadata against reference model requirements
 *
 * @param {Object} documentData - Document data to validate
 * @returns {Promise<Object>} - Validated and potentially enriched document data
 */
export async function validateDocumentMetadata(documentData) {
  try {
    if (!documentData.document_subtype_id) {
      return documentData; // No validation needed if no subtype specified
    }

    // Get subtype information
    const subtype = await getSubtype(documentData.document_subtype_id);

    // Set default status based on lifecycle if not provided
    if (!documentData.status) {
      documentData.status = subtype.lifecycle.start_state;
    }

    // If folder_id is provided, validate folder hierarchy
    if (documentData.folder_id) {
      await enforceFolder(documentData.folder_id, documentData.document_subtype_id);
    }

    // Return the validated and potentially enriched document data
    return documentData;
  } catch (error) {
    logger.error({ err: error, document: documentData }, 'Error validating document metadata');
    throw error;
  }
}

export default {
  getSubtype,
  getFolder,
  enforceFolder,
  calculateRetentionDates,
  validateDocumentMetadata,
};
