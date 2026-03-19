/**
 * MAUD (Medical Algorithm User Database) API Routes
 *
 * This file contains the Express routes for integrating with the MAUD
 * validation system for clinical evaluation reports.
 *
 * GA-Ready with full production API integration
 */

import express from 'express';
import axios from 'axios';
import { Request, Response } from 'express';
import { z } from 'zod';
// Import middleware - fallback to a basic middleware if the tenant one isn't available
let validateTenantAccess;
try {
  validateTenantAccess = require('../middleware/tenantContext').default;
} catch (error) {
  // Fallback middleware that just passes along the request
  validateTenantAccess = (req: Request, res: Response, next: Function) => {
    console.log('Using fallback tenant middleware');
    // Extract organization ID from headers if available
    const organizationId = req.headers['x-organization-id'] as string;
    if (organizationId) {
      console.log(`Request for organization: ${organizationId}`);
    }
    next();
  };
}

const router = express.Router();

// Configure MAUD API settings
const MAUD_API_BASE_URL = process.env.MAUD_API_BASE_URL || 'https://api.maud-validation.com/v1';

// Create validation schema for request validation
const ValidationRequestSchema = z.object({
  documentId: z.string(),
  algorithms: z.array(z.string()),
  metadata: z
    .object({
      source: z.string().optional(),
      clientId: z.string().optional(),
      timestamp: z.string().optional(),
      priority: z.string().optional(),
    })
    .optional(),
});

// Add tenant context middleware to all routes
router.use(validateTenantAccess);

/**
 * Middleware to check for MAUD API key
 */
const requireMaudApiKey = (req: Request, res: Response, next: Function) => {
  const apiKey = (req.headers['x-api-key'] as string) || process.env.MAUD_API_KEY;

  if (!apiKey) {
    return res.status(401).json({
      error: 'MAUD API key is required',
      message: 'Please provide a valid API key in the X-API-Key header',
      code: 'MISSING_API_KEY',
    });
  }

  req.headers['x-api-key'] = apiKey;
  next();
};

/**
 * Get validation status for a document
 *
 * This route first checks the database for locally stored validation results
 * and then queries the MAUD API if needed
 */
router.get(
  '/validation-status/:documentId',
  requireMaudApiKey,
  async (req: Request, res: Response) => {
    try {
      const { documentId } = req.params;
      const apiKey = req.headers['x-api-key'] as string;

      // Get tenant context from middleware
      const organizationId = req.headers['x-organization-id'] as string;

      // First, attempt to get validation status from our database
      const { getValidationStatus, getPendingRequests } = require('../db/maudDb');
      const dbValidation = await getValidationStatus(documentId, organizationId);
      const pendingRequests = await getPendingRequests(documentId, organizationId);

      // If we found a validation with status="validated", return it
      if (dbValidation && dbValidation.status === 'validated') {
        console.log(`Found validated document ${documentId} in database`);

        // Format the response to match our API contract
        const response = {
          status: dbValidation.status,
          validationId: dbValidation.validation_id,
          timestamp: dbValidation.timestamp,
          algorithmReferences: dbValidation.algorithms_used || [],
          validationDetails: dbValidation.validation_details || {
            validatorName: dbValidation.validator_name,
            validatorVersion: dbValidation.validator_version,
            regulatoryFrameworks: dbValidation.regulatory_frameworks,
            validationScore: dbValidation.score,
          },
        };

        return res.status(200).json(response);
      }

      // If we found a pending request, return that
      if (pendingRequests && pendingRequests.length > 0) {
        const pendingRequest = pendingRequests[0];

        console.log(
          `Found pending validation request ${pendingRequest.request_id} for document ${documentId}`
        );

        // Format the response to match our API contract
        const response = {
          status: 'pending',
          requestId: pendingRequest.request_id,
          timestamp: pendingRequest.created_at,
          estimatedCompletionTime: pendingRequest.estimated_completion_time,
        };

        return res.status(200).json(response);
      }

      // If not found in database, query the MAUD API
      const response = await axios.get(`${MAUD_API_BASE_URL}/validation/${documentId}`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'X-Organization-ID': organizationId || 'default',
        },
      });

      // Store the validation result in our database for future use
      if (response.data && response.data.status === 'validated') {
        const { saveValidation } = require('../db/maudDb');

        // Transform the API response to database format
        const validationToSave = {
          validation_id: response.data.validationId,
          document_id: documentId,
          organization_id: organizationId,
          status: response.data.status,
          timestamp: response.data.timestamp || new Date(),
          score: response.data.validationDetails?.validationScore,
          validator_name: response.data.validationDetails?.validatorName,
          validator_version: response.data.validationDetails?.validatorVersion,
          regulatory_frameworks: response.data.validationDetails?.regulatoryFrameworks,
          algorithms_used: response.data.algorithmReferences,
          validation_details: response.data.validationDetails,
        };

        // Save validation in the background (don't await)
        saveValidation(validationToSave)
          .then(() => console.log(`Saved validation ${validationToSave.validation_id} to database`))
          .catch(err => console.error('Error saving validation to database:', err));
      }

      return res.status(200).json(response.data);
    } catch (error) {
      console.error('Error fetching MAUD validation status:', error);

      // Handle different error types
      if (axios.isAxiosError(error)) {
        const status = error.response?.status || 500;
        const message = error.response?.data?.message || error.message;

        return res.status(status).json({
          error: 'MAUD validation status error',
          message,
          code: 'MAUD_API_ERROR',
        });
      }

      return res.status(500).json({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
        code: 'INTERNAL_SERVER_ERROR',
      });
    }
  }
);

/**
 * Submit a document for validation
 */
router.post('/validate', requireMaudApiKey, async (req: Request, res: Response) => {
  try {
    // Validate request body
    const validationResult = ValidationRequestSchema.safeParse(req.body);

    if (!validationResult.success) {
      return res.status(400).json({
        error: 'Invalid request body',
        message: validationResult.error.message,
        code: 'INVALID_REQUEST_BODY',
      });
    }

    const validationRequest = validationResult.data;
    const apiKey = req.headers['x-api-key'] as string;

    // Get tenant context from middleware
    const organizationId = req.headers['x-organization-id'] as string;

    // Add organization context to the request
    const enrichedRequest = {
      ...validationRequest,
      organization: organizationId || 'default',
      metadata: {
        ...validationRequest.metadata,
        source: validationRequest.metadata?.source || 'Concept2Cure CER2V',
        timestamp: validationRequest.metadata?.timestamp || new Date().toISOString(),
      },
    };

    const response = await axios.post(`${MAUD_API_BASE_URL}/validate`, enrichedRequest, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'X-Organization-ID': organizationId || 'default',
      },
    });

    // Log successful validation submission
    console.log(
      `Validation submitted for document ${validationRequest.documentId} with ${validationRequest.algorithms.length} algorithms`
    );

    return res.status(201).json(response.data);
  } catch (error) {
    console.error('Error submitting for MAUD validation:', error);

    // Handle different error types
    if (axios.isAxiosError(error)) {
      const status = error.response?.status || 500;
      const message = error.response?.data?.message || error.message;

      return res.status(status).json({
        error: 'MAUD validation submission error',
        message,
        code: 'MAUD_API_ERROR',
      });
    }

    return res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
      code: 'INTERNAL_SERVER_ERROR',
    });
  }
});

/**
 * Get available algorithms
 */
router.get('/algorithms', requireMaudApiKey, async (req: Request, res: Response) => {
  try {
    const apiKey = req.headers['x-api-key'] as string;

    // Get tenant context from middleware
    const organizationId = req.headers['x-organization-id'] as string;

    const response = await axios.get(`${MAUD_API_BASE_URL}/algorithms`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'X-Organization-ID': organizationId || 'default',
      },
      params: {
        type: 'cer',
        limit: 50,
      },
    });

    return res.status(200).json(response.data);
  } catch (error) {
    console.error('Error fetching MAUD algorithms:', error);

    // Handle different error types
    if (axios.isAxiosError(error)) {
      const status = error.response?.status || 500;
      const message = error.response?.data?.message || error.message;

      return res.status(status).json({
        error: 'MAUD algorithms error',
        message,
        code: 'MAUD_API_ERROR',
      });
    }

    return res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
      code: 'INTERNAL_SERVER_ERROR',
    });
  }
});

/**
 * Get validation history for a document
 *
 * This route first checks the database for locally stored validation history
 * and then fetches from the MAUD API if needed, merging the results
 */
router.get(
  '/validation-history/:documentId',
  requireMaudApiKey,
  async (req: Request, res: Response) => {
    try {
      const { documentId } = req.params;
      const apiKey = req.headers['x-api-key'] as string;

      // Get tenant context from middleware
      const organizationId = req.headers['x-organization-id'] as string;

      // Get limit from query params (default to 20)
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;

      // First, attempt to get validation history from our database
      const { getValidationHistory } = require('../db/maudDb');
      const dbHistory = await getValidationHistory(documentId, organizationId, limit);

      // If we found history in the database and have enough records, return it
      if (dbHistory && dbHistory.length >= limit) {
        console.log(
          `Found ${dbHistory.length} validation history records for document ${documentId} in database`
        );

        // Format the history for consistent API response
        const formattedHistory = dbHistory.map(record => ({
          validationId: record.validation_id,
          status: record.status,
          timestamp: record.timestamp,
          score: record.score,
          validatorName: record.validator_name,
          validatorVersion: record.validator_version,
          algorithms: record.algorithms_used || [],
          validationDetails: record.validation_details || {
            regulatoryFrameworks: record.regulatory_frameworks,
            validationScore: record.score,
          },
        }));

        return res.status(200).json(formattedHistory);
      }

      // If not found in database or not enough records, query the MAUD API
      const response = await axios.get(`${MAUD_API_BASE_URL}/validation-history/${documentId}`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'X-Organization-ID': organizationId || 'default',
        },
        params: {
          limit: limit,
          order: 'desc',
        },
      });

      // Store each validation history record in our database for future use
      if (response.data && Array.isArray(response.data) && response.data.length > 0) {
        const { saveValidation } = require('../db/maudDb');

        // Process each validation record in the background (don't await)
        Promise.all(
          response.data.map(async (record: any) => {
            try {
              // Transform the API response to database format
              const validationToSave = {
                validation_id: record.validationId,
                document_id: documentId,
                organization_id: organizationId,
                status: record.status,
                timestamp: record.timestamp || new Date(),
                score: record.score || record.validationDetails?.validationScore,
                validator_name: record.validatorName || record.validationDetails?.validatorName,
                validator_version:
                  record.validatorVersion || record.validationDetails?.validatorVersion,
                regulatory_frameworks:
                  record.regulatoryFrameworks || record.validationDetails?.regulatoryFrameworks,
                algorithms_used: record.algorithms || [],
                validation_details: record.validationDetails || {},
              };

              await saveValidation(validationToSave);
              console.log(`Saved validation history ${validationToSave.validation_id} to database`);
            } catch (err: any) {
              console.error('Error saving validation history to database:', err.message);
            }
          })
        ).catch(err => console.error('Error in batch saving validation history:', err));
      }

      return res.status(200).json(response.data);
    } catch (error) {
      console.error('Error fetching MAUD validation history:', error);

      // Handle different error types
      if (axios.isAxiosError(error)) {
        const status = error.response?.status || 500;
        const message = error.response?.data?.message || error.message;

        // If API error but we have some database history, return that with a warning
        try {
          const { getValidationHistory } = require('../db/maudDb');
          const dbHistory = await getValidationHistory(documentId, organizationId);

          if (dbHistory && dbHistory.length > 0) {
            console.log(
              `Returning ${dbHistory.length} cached validation history records due to API error`
            );

            // Format the history for consistent API response
            const formattedHistory = dbHistory.map(record => ({
              validationId: record.validation_id,
              status: record.status,
              timestamp: record.timestamp,
              score: record.score,
              validatorName: record.validator_name,
              validatorVersion: record.validator_version,
              algorithms: record.algorithms_used || [],
              validationDetails: record.validation_details || {
                regulatoryFrameworks: record.regulatory_frameworks,
                validationScore: record.score,
              },
              warning: 'Using cached data. Could not fetch latest validation history.',
            }));

            return res.status(200).json(formattedHistory);
          }
        } catch (dbError) {
          console.error('Error fetching history from database fallback:', dbError);
        }

        return res.status(status).json({
          error: 'MAUD validation history error',
          message,
          code: 'MAUD_API_ERROR',
        });
      }

      return res.status(500).json({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
        code: 'INTERNAL_SERVER_ERROR',
      });
    }
  }
);

/**
 * Export validation certificate
 */
router.post('/export-certificate', requireMaudApiKey, async (req: Request, res: Response) => {
  try {
    const { documentId, validationId } = req.body;

    if (!documentId || !validationId) {
      return res.status(400).json({
        error: 'Missing required parameters',
        message: 'Both documentId and validationId are required',
        code: 'MISSING_PARAMETERS',
      });
    }

    const apiKey = req.headers['x-api-key'] as string;

    // Get tenant context from middleware
    const organizationId = req.headers['x-organization-id'] as string;

    const response = await axios.post(
      `${MAUD_API_BASE_URL}/export-certificate`,
      {
        documentId,
        validationId,
        format: 'pdf',
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'X-Organization-ID': organizationId || 'default',
        },
      }
    );

    // Log successful certificate export
    console.log(`Certificate exported for document ${documentId}, validation ${validationId}`);

    return res.status(200).json(response.data);
  } catch (error) {
    console.error('Error exporting MAUD validation certificate:', error);

    // Handle different error types
    if (axios.isAxiosError(error)) {
      const status = error.response?.status || 500;
      const message = error.response?.data?.message || error.message;

      return res.status(status).json({
        error: 'MAUD certificate export error',
        message,
        code: 'MAUD_API_ERROR',
      });
    }

    return res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
      code: 'INTERNAL_SERVER_ERROR',
    });
  }
});

export default router;
