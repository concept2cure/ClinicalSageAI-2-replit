/**
 * Reference Model Helper Utilities
 *
 * These utilities provide helper functions for working with the Veeva-style document reference model:
 * - Getting subtype information
 * - Enforcing folder hierarchy based on document types
 * - Validating document metadata against reference model
 */

import { createClient } from '@supabase/supabase-js';
import { logger } from '../utils/logger.js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Get detailed information about a document subtype
 * @param {string} id - Subtype ID to retrieve
 * @returns {Promise<Object>} - Document subtype information
 */
export async function getSubtype(id) {
  try {
    const { data, error } = await supabase
      .from('document_subtypes')
      .select(
        `
        *,
        document_types:type_id (*),
        lifecycle:lifecycle_id (*)
      `
      )
      .eq('id', id)
      .single();

    if (error) throw error;
    if (!data) throw new Error(`Subtype with ID '${id}' not found`);

    return data;
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
    const { data, error } = await supabase.from('folders').select('*').eq('id', id).single();

    if (error) throw error;
    if (!data) throw new Error(`Folder with ID '${id}' not found`);

    return data;
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
      const { data, error } = await supabase
        .from('retention_rules')
        .select('*')
        .eq('document_subtype_id', subtypeId)
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (!error) {
        retentionRule = data;
      }
    }

    // If no tenant-specific rule, get default from subtype
    if (!retentionRule) {
      const { data, error } = await supabase
        .from('document_subtypes')
        .select('review_interval, archive_after, delete_after')
        .eq('id', subtypeId)
        .single();

      if (error) throw error;

      retentionRule = {
        archive_after: data.archive_after,
        delete_after: data.delete_after,
        review_interval: data.review_interval,
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
