/**
 * 510(k) Literature API Routes (DEPRECATED)
 *
 * @deprecated This route file is deprecated as of 2026-01-26.
 * Please migrate to /api/fda510k-unified/literature
 * Sunset date: 2026-06-30
 *
 * API endpoints for the 510(k) literature search, aggregation, and citation
 * functionality, supporting the Enhanced Literature Discovery feature.
 *
 * @see /api/fda510k-unified/docs for migration guide
 */

import { Router, Request, Response } from 'express';
import { create510kDeprecationNotice } from '../middleware/deprecation';
import literatureAggregator, { LITERATURE_SOURCES } from '../services/LiteratureAggregatorService';
import literatureSummarizer from '../services/LiteratureSummarizerService';

const router = Router();

// Apply deprecation notice to all routes in this file
router.use(create510kDeprecationNotice('/literature'));

/**
 * Middleware to extract tenant context information
 */
const extractTenantContext = (req: Request, res: Response, next: Function) => {
  // For now, just ensure organizationId is available in the query or body
  if (!req.query.organizationId && !req.body?.organizationId) {
    req.query.organizationId = 'test-org-id'; // Default for development
  }

  next();
};

// Custom validation helper functions
interface ValidationError {
  param: string;
  msg: string;
}

/**
 * Get value from the appropriate location in the request
 */
const getValueFromRequest = (req: Request, field: string, location: string = 'body'): any => {
  switch (location) {
    case 'params':
      return req.params[field];
    case 'query':
      return req.query[field];
    case 'body':
    default:
      return req.body?.[field];
  }
};

const validateRequest = (req: Request, rules: Record<string, any>): ValidationError[] => {
  const errors: ValidationError[] = [];

  for (const [field, validation] of Object.entries(rules)) {
    const value = getValueFromRequest(req, field, validation.location);

    // Check if field is required but missing
    if (validation.required && (value === undefined || value === null || value === '')) {
      errors.push({
        param: field,
        msg: validation.message || `${field} is required`,
      });
      continue;
    }

    // Skip other validations if field is not present and not required
    if (value === undefined || value === null) {
      continue;
    }

    // Type validations
    if (validation.type === 'string' && typeof value !== 'string') {
      errors.push({
        param: field,
        msg: `${field} must be a string`,
      });
    }

    if (validation.type === 'number' && typeof value !== 'number' && isNaN(Number(value))) {
      errors.push({
        param: field,
        msg: `${field} must be a number`,
      });
    }

    if (validation.type === 'boolean' && typeof value !== 'boolean') {
      // Try to convert string 'true'/'false' to boolean
      if (value === 'true' || value === 'false') {
        req.body[field] = value === 'true';
      } else {
        errors.push({
          param: field,
          msg: `${field} must be a boolean`,
        });
      }
    }

    if (validation.type === 'array' && !Array.isArray(value)) {
      errors.push({
        param: field,
        msg: `${field} must be an array`,
      });
    }

    // Range validations for numbers
    if (validation.type === 'number' && (typeof value === 'number' || !isNaN(Number(value)))) {
      const numValue = typeof value === 'number' ? value : Number(value);

      if (validation.min !== undefined && numValue < validation.min) {
        errors.push({
          param: field,
          msg: `${field} must be at least ${validation.min}`,
        });
      }

      if (validation.max !== undefined && numValue > validation.max) {
        errors.push({
          param: field,
          msg: `${field} must be at most ${validation.max}`,
        });
      }
    }

    // Enum validation (allowable values)
    if (validation.enum && !validation.enum.includes(value)) {
      errors.push({
        param: field,
        msg: `${field} must be one of: ${validation.enum.join(', ')}`,
      });
    }
  }

  return errors;
};

// This function is already defined above

// This middleware is already defined above

/**
 * Get available literature sources
 */
router.get('/sources', async (req: Request, res: Response) => {
  try {
    const sources = LITERATURE_SOURCES.filter(source => source.enabled);

    res.json({
      sources,
      count: sources.length,
    });
  } catch (error) {
    console.error('Error fetching literature sources:', error);
    res.status(500).json({
      error: 'Failed to fetch literature sources',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * Search literature from multiple sources
 */
router.post('/search', extractTenantContext, async (req: Request, res: Response) => {
  try {
    // Define validation rules
    const validationRules = {
      query: {
        required: true,
        type: 'string',
        message: 'Search query is required',
        location: 'body',
      },
      sources: {
        required: false,
        type: 'array',
        location: 'body',
      },
      startDate: {
        required: false,
        type: 'string',
        location: 'body',
      },
      endDate: {
        required: false,
        type: 'string',
        location: 'body',
      },
      useSemanticSearch: {
        required: false,
        type: 'boolean',
        location: 'body',
      },
      filters: {
        required: false,
        type: 'object',
        location: 'body',
      },
      limit: {
        required: false,
        type: 'number',
        min: 1,
        max: 100,
        location: 'body',
      },
      offset: {
        required: false,
        type: 'number',
        min: 0,
        location: 'body',
      },
    };

    // Validate request
    const errors = validateRequest(req, validationRules);
    if (errors.length > 0) {
      return res.status(400).json({ errors });
    }

    const searchParams = {
      query: req.body.query,
      sources: req.body.sources,
      startDate: req.body.startDate,
      endDate: req.body.endDate,
      useSemanticSearch: req.body.useSemanticSearch !== false, // Default to true
      filters: req.body.filters || {},
      limit: req.body.limit || 20,
      offset: req.body.offset || 0,
      organizationId: req.body.organizationId,
    };

    const results = await literatureAggregator.searchLiterature(searchParams);

    res.json(results);
  } catch (error) {
    console.error('Error searching literature:', error);
    res.status(500).json({
      error: 'Failed to search literature',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * Get literature entry by ID
 */
router.get('/entry/:id', extractTenantContext, async (req: Request, res: Response) => {
  try {
    // Validate parameters
    const validationRules = {
      id: {
        location: 'params',
        required: true,
        type: 'string',
        message: 'Literature ID is required',
      },
    };

    const errors = validateRequest(req, validationRules);
    if (errors.length > 0) {
      return res.status(400).json({ errors });
    }

    const organizationId = req.query.organizationId?.toString() || 'test-org-id';
    const entry = await literatureAggregator.getLiteratureById(req.params.id, organizationId);

    if (!entry) {
      return res.status(404).json({ error: 'Literature entry not found' });
    }

    res.json({ entry });
  } catch (error) {
    console.error('Error fetching literature entry:', error);
    res.status(500).json({
      error: 'Failed to fetch literature entry',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * Get recent literature entries
 */
router.get('/recent', extractTenantContext, async (req: Request, res: Response) => {
  try {
    // Validate parameters
    const validationRules = {
      limit: {
        location: 'query',
        required: false,
        type: 'number',
        validator: (value: any) => {
          const num = parseInt(value, 10);
          return !isNaN(num) && num >= 1 && num <= 50;
        },
        message: 'Limit must be a number between 1 and 50',
      },
    };

    const errors = validateRequest(req, validationRules);
    if (errors.length > 0) {
      return res.status(400).json({ errors });
    }

    const limit = req.query.limit ? parseInt(req.query.limit.toString(), 10) : 10;
    const organizationId = req.query.organizationId?.toString() || 'test-org-id';

    const entries = await literatureAggregator.getRecentLiterature(organizationId, limit);

    res.json({ entries, count: entries.length });
  } catch (error) {
    console.error('Error fetching recent literature:', error);
    res.status(500).json({
      error: 'Failed to fetch recent literature',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * Cite literature in a document
 */
router.post('/cite', extractTenantContext, async (req: Request, res: Response) => {
  try {
    // Validate parameters
    const validationRules = {
      literatureId: {
        location: 'body',
        required: true,
        type: 'string',
        message: 'Literature ID is required',
      },
      documentId: {
        location: 'body',
        required: true,
        type: 'string',
        message: 'Document ID is required',
      },
      documentType: {
        location: 'body',
        required: true,
        type: 'string',
        message: 'Document type is required',
      },
      sectionId: {
        location: 'body',
        required: true,
        type: 'string',
        message: 'Section ID is required',
      },
      sectionName: {
        location: 'body',
        required: true,
        type: 'string',
        message: 'Section name is required',
      },
      citationText: {
        location: 'body',
        required: false,
        type: 'string',
      },
    };

    const errors = validateRequest(req, validationRules);
    if (errors.length > 0) {
      return res.status(400).json({ errors });
    }

    const citation = await literatureAggregator.addCitation(
      req.body.literatureId,
      req.body.documentId,
      req.body.documentType,
      req.body.sectionId,
      req.body.sectionName,
      req.body.citationText || '',
      req.body.organizationId
    );

    res.json({
      message: 'Literature cited successfully',
      citation_id: citation.id,
      citation,
    });
  } catch (error) {
    console.error('Error citing literature:', error);
    res.status(500).json({
      error: 'Failed to cite literature',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * Get citations for a document
 */
router.get('/citations/:documentId', extractTenantContext, async (req: Request, res: Response) => {
  try {
    // Validate parameters
    const validationRules = {
      documentId: {
        location: 'params',
        required: true,
        type: 'string',
        message: 'Document ID is required',
      },
      type: {
        location: 'query',
        required: false,
        type: 'string',
      },
    };

    const errors = validateRequest(req, validationRules);
    if (errors.length > 0) {
      return res.status(400).json({ errors });
    }

    const documentType = req.query.type?.toString() || '510k';
    const organizationId = req.query.organizationId?.toString() || 'test-org-id';

    const citations = await literatureAggregator.getCitations(
      req.params.documentId,
      documentType,
      organizationId
    );

    res.json({ citations, count: citations.length });
  } catch (error) {
    console.error('Error fetching citations:', error);
    res.status(500).json({
      error: 'Failed to fetch citations',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * Remove a citation
 */
router.delete(
  '/citations/:citationId',
  extractTenantContext,
  async (req: Request, res: Response) => {
    try {
      // Validate parameters
      const validationRules = {
        citationId: {
          location: 'params',
          required: true,
          type: 'string',
          message: 'Citation ID is required',
        },
      };

      const errors = validateRequest(req, validationRules);
      if (errors.length > 0) {
        return res.status(400).json({ errors });
      }

      const organizationId = req.query.organizationId?.toString() || 'test-org-id';

      await literatureAggregator.removeCitation(req.params.citationId, organizationId);

      res.json({
        message: 'Citation removed successfully',
        citation_id: req.params.citationId,
      });
    } catch (error) {
      console.error('Error removing citation:', error);
      res.status(500).json({
        error: 'Failed to remove citation',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

/**
 * Generate a summary from multiple literature entries
 */
router.post('/summarize', extractTenantContext, async (req: Request, res: Response) => {
  try {
    // Validate parameters
    const validationRules = {
      literatureIds: {
        location: 'body',
        required: true,
        type: 'array',
        message: 'Literature IDs are required',
      },
      summaryType: {
        location: 'body',
        required: true,
        type: 'string',
        validator: (value: any) => {
          return ['standard', 'detailed', 'critical', 'comparison'].includes(value);
        },
        message: 'Valid summary type is required (standard, detailed, critical, or comparison)',
      },
      focus: {
        location: 'body',
        required: false,
        type: 'string',
      },
    };

    const errors = validateRequest(req, validationRules);
    if (errors.length > 0) {
      return res.status(400).json({ errors });
    }

    const result = await literatureSummarizer.generateSummary({
      literatureIds: req.body.literatureIds,
      summaryType: req.body.summaryType,
      focus: req.body.focus,
      organizationId: req.body.organizationId,
    });

    res.json({
      summary: result.summary,
      summary_id: result.id,
      processing_time_ms: result.processing_time_ms,
      literature_count: result.total_literature_count,
    });
  } catch (error) {
    console.error('Error generating summary:', error);
    res.status(500).json({
      error: 'Failed to generate summary',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * Get recent summaries
 */
router.get('/summaries', extractTenantContext, async (req: Request, res: Response) => {
  try {
    // Validate parameters
    const validationRules = {
      limit: {
        location: 'query',
        required: false,
        type: 'number',
        validator: (value: any) => {
          const num = parseInt(value, 10);
          return !isNaN(num) && num >= 1 && num <= 20;
        },
        message: 'Limit must be a number between 1 and 20',
      },
    };

    const errors = validateRequest(req, validationRules);
    if (errors.length > 0) {
      return res.status(400).json({ errors });
    }

    const limit = req.query.limit ? parseInt(req.query.limit.toString(), 10) : 5;
    const organizationId = req.query.organizationId?.toString() || 'test-org-id';

    const summaries = await literatureSummarizer.getRecentSummaries(organizationId, limit);

    res.json({ summaries, count: summaries.length });
  } catch (error) {
    console.error('Error fetching summaries:', error);
    res.status(500).json({
      error: 'Failed to fetch summaries',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * Get summary by ID
 */
router.get('/summary/:id', extractTenantContext, async (req: Request, res: Response) => {
  try {
    // Validate parameters
    const validationRules = {
      id: {
        location: 'params',
        required: true,
        type: 'string',
        message: 'Summary ID is required',
      },
    };

    const errors = validateRequest(req, validationRules);
    if (errors.length > 0) {
      return res.status(400).json({ errors });
    }

    const organizationId = req.query.organizationId?.toString() || 'test-org-id';
    const summary = await literatureSummarizer.getSummaryById(req.params.id, organizationId);

    if (!summary) {
      return res.status(404).json({ error: 'Summary not found' });
    }

    res.json({ summary });
  } catch (error) {
    console.error('Error fetching summary:', error);
    res.status(500).json({
      error: 'Failed to fetch summary',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
