/**
 * API Request Validation Middleware
 *
 * Zod-based request validation for API endpoints.
 * Validates body, query, and params against schemas.
 *
 * @version 2.0.0
 * @module server/middleware/apiValidation
 */

import { Request, Response, NextFunction } from 'express';
import { z, ZodSchema, ZodError } from 'zod';
import { createScopedLogger } from '../utils/logger';

const logger = createScopedLogger('api-validation');

// Validation target options
export interface ValidationOptions {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
  stripUnknown?: boolean;
}

// Validation error response
export interface ValidationErrorResponse {
  error: 'Validation Error';
  details: Array<{
    field: string;
    message: string;
    code: string;
  }>;
}

/**
 * Format Zod errors into user-friendly response
 */
function formatZodErrors(error: ZodError): ValidationErrorResponse {
  return {
    error: 'Validation Error',
    details: error.errors.map(err => ({
      field: err.path.join('.'),
      message: err.message,
      code: err.code,
    })),
  };
}

/**
 * Create validation middleware from schemas
 */
export function validate(options: ValidationOptions) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Validate body
      if (options.body && req.body) {
        const result = options.body.safeParse(req.body);
        if (!result.success) {
          logger.warn('Body validation failed', { errors: result.error.errors });
          res.status(400).json(formatZodErrors(result.error));
          return;
        }
        req.body = result.data;
      }

      // Validate query
      if (options.query && req.query) {
        const result = options.query.safeParse(req.query);
        if (!result.success) {
          logger.warn('Query validation failed', { errors: result.error.errors });
          res.status(400).json(formatZodErrors(result.error));
          return;
        }
        req.query = result.data as any;
      }

      // Validate params
      if (options.params && req.params) {
        const result = options.params.safeParse(req.params);
        if (!result.success) {
          logger.warn('Params validation failed', { errors: result.error.errors });
          res.status(400).json(formatZodErrors(result.error));
          return;
        }
        req.params = result.data as any;
      }

      next();
    } catch (error) {
      logger.error('Validation middleware error', { error });
      res.status(500).json({ error: 'Validation error' });
    }
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMMON VALIDATION SCHEMAS
// ═══════════════════════════════════════════════════════════════════════════════

// UUID validation
export const uuidSchema = z.string().uuid();

// Pagination schema
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

// Date range schema
export const dateRangeSchema = z.object({
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

// Search schema
export const searchSchema = z.object({
  query: z.string().min(1).max(500),
  filters: z.record(z.string()).optional(),
});

// ID param schema
export const idParamSchema = z.object({
  id: z.string().min(1),
});

// Organization header schema
export const orgHeaderSchema = z.object({
  'x-organization-id': z.string().min(1),
});

// Document schemas
export const createDocumentSchema = z.object({
  name: z.string().min(1).max(255),
  category: z.string().min(1),
  content: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
  tags: z.array(z.string()).optional(),
});

export const updateDocumentSchema = createDocumentSchema.partial();

// Device profile schemas (510k)
export const createDeviceProfileSchema = z.object({
  deviceName: z.string().min(1).max(255),
  manufacturer: z.string().min(1).max(255),
  deviceClass: z.enum(['I', 'II', 'III']),
  productCode: z.string().optional(),
  regulationNumber: z.string().optional(),
  intendedUse: z.string().min(1),
  indications: z.string().optional(),
  predicateDevice: z
    .object({
      kNumber: z.string(),
      deviceName: z.string(),
    })
    .optional(),
});

// Submission schemas
export const createSubmissionSchema = z.object({
  type: z.enum(['510k', 'PMA', 'De_Novo', 'IND', 'NDA', 'BLA']),
  projectId: z.string().uuid(),
  targetAgency: z.string().min(1),
  targetDate: z.coerce.date().optional(),
});

// CER report schemas
export const createCERSchema = z.object({
  deviceName: z.string().min(1),
  manufacturer: z.string().min(1),
  indication: z.string().min(1),
  templateId: z.string().optional(),
});

/**
 * Validate body with schema
 */
export function validateBody<T>(schema: ZodSchema<T>) {
  return validate({ body: schema });
}

/**
 * Validate query with schema
 */
export function validateQuery<T>(schema: ZodSchema<T>) {
  return validate({ query: schema });
}

/**
 * Validate params with schema
 */
export function validateParams<T>(schema: ZodSchema<T>) {
  return validate({ params: schema });
}

// Alias for validateRequest (used by V2 routes)
export const validateRequest = validate;

export default {
  validate,
  validateRequest,
  validateBody,
  validateQuery,
  validateParams,
  // Schemas
  uuidSchema,
  paginationSchema,
  dateRangeSchema,
  searchSchema,
  idParamSchema,
  createDocumentSchema,
  updateDocumentSchema,
  createDeviceProfileSchema,
  createSubmissionSchema,
  createCERSchema,
};
