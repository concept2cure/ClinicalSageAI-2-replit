/**
 * Reference Model Middleware
 *
 * This middleware provides functions for enforcing the reference model requirements
 * during document operations like upload, move, or status change.
 */

import { logger } from '../utils/logger.js';
import refModel from '../hooks/refModel.js';

/**
 * Middleware to validate and enrich document data based on reference model
 *
 * This middleware will:
 * 1. Validate that the document is being placed in the correct folder hierarchy
 * 2. Set default status based on lifecycle if not provided
 * 3. Calculate and set retention dates based on subtype
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
export async function validateDocumentAgainstModel(req, res, next) {
  try {
    // Only apply to requests with document_subtype_id
    if (!req.body.document_subtype_id) {
      return next();
    }

    const { document_subtype_id, folder_id } = req.body;
    const tenantId = req.user?.tenant_id;

    try {
      // Check folder hierarchy if folder is specified
      if (folder_id) {
        await refModel.enforceFolder(folder_id, document_subtype_id);
      }

      // Get subtype to use lifecycle information
      const subtype = await refModel.getSubtype(document_subtype_id);

      // Set default status based on lifecycle if not provided
      if (!req.body.status) {
        req.body.status = subtype.lifecycle.start_state;
      }

      // Calculate retention dates if this is a new document or status has changed to effective
      if (
        !req.body.id ||
        (req.method === 'PUT' && req.body.status === subtype.lifecycle.steady_state)
      ) {
        const retentionDates = await refModel.calculateRetentionDates(
          document_subtype_id,
          tenantId
        );

        // Add retention dates to the document
        req.body.periodic_review_date = retentionDates.periodic_review_date;
        req.body.archive_date = retentionDates.archive_date;
        req.body.delete_date = retentionDates.delete_date;
      }

      next();
    } catch (validationError) {
      // Return a 400 error for validation failures
      logger.warn(
        {
          err: validationError,
          document_subtype_id,
          folder_id,
        },
        'Document validation failed against reference model'
      );

      return res.status(400).json({
        error: 'Reference model validation failed',
        details: validationError.message,
      });
    }
  } catch (error) {
    logger.error({ err: error }, 'Error in reference model middleware');

    // Don't block the request for unexpected errors
    next();
  }
}

/**
 * Middleware to configure initial document folders for a new tenant
 *
 * This middleware checks if the tenant has the basic folder structure
 * and creates it if needed.
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
export async function ensureTenantFolders(req, res, next) {
  try {
    // Skip if no tenant_id
    if (!req.user?.tenant_id) {
      return next();
    }

    // Check if tenant already has folders
    const { data: folders } = await supabase
      .from('folders')
      .select('id')
      .eq('tenant_id', req.user.tenant_id)
      .limit(1);

    // If no folders, redirect to initialization endpoint
    if (!folders || folders.length === 0) {
      // Make a request to the initialize-folders endpoint
      const response = await fetch(
        `${req.protocol}://${req.get('host')}/api/meta/initialize-folders`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: req.headers.authorization,
          },
        }
      );

      if (!response.ok) {
        logger.warn(`Failed to initialize folders for tenant ${req.user.tenant_id}`);
      } else {
        logger.info(`Initialized folders for tenant ${req.user.tenant_id}`);
      }
    }

    next();
  } catch (error) {
    logger.error({ err: error }, 'Error in tenant folders middleware');
    next();
  }
}

export default {
  validateDocumentAgainstModel,
  ensureTenantFolders,
};
