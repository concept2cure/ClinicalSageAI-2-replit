/**
 * Input Validation Middleware
 *
 * This middleware uses Zod to validate request bodies against defined schemas
 * to ensure only properly formatted data reaches our handlers.
 */

import { z } from 'zod';

/**
 * Creates a middleware that validates the request body against the provided schema
 *
 * @param {z.ZodSchema} schema - The Zod schema to validate against
 * @returns {Function} Express middleware
 */
export const validateBody = schema => (req, res, next) => {
  try {
    const validatedData = schema.parse(req.body);
    req.validatedBody = validatedData;
    next();
  } catch (error) {
    const formattedError = error.format ? error.format() : error.errors || error.message;

    // Log validation errors
    console.error(`[Validation Error] ${req.method} ${req.originalUrl}:`, formattedError);

    // Return standardized error response
    return res.status(400).json({
      status: 'error',
      message: 'Validation failed',
      errors: formattedError,
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * Common schemas for reuse across routes
 */
export const schemas = {
  // Retention Policy Schema
  retentionPolicy: z.object({
    id: z.string().uuid().optional(), // Optional for creation
    policyName: z.string().min(3).max(100),
    documentType: z.string().min(1),
    retentionPeriod: z.number().int().positive(),
    periodUnit: z.enum(['days', 'months', 'years']),
    archiveBeforeDelete: z.boolean().default(true),
    notifyBeforeDeletion: z.boolean().default(true),
    notificationPeriod: z.number().int().nonnegative(),
    notificationUnit: z.enum(['days', 'months', 'years']),
    active: z.boolean().default(true),
  }),

  // Document Schema
  document: z.object({
    id: z.string().uuid().optional(),
    name: z.string().min(1).max(255),
    type: z.string().min(1),
    path: z.string().min(1),
    size: z.number().nonnegative(),
    mimeType: z.string(),
    createdBy: z.string(),
    metadata: z.record(z.string(), z.any()).optional(),
  }),

  // User Schema
  user: z.object({
    id: z.string().uuid().optional(),
    username: z.string().min(3).max(50),
    email: z.string().email(),
    role: z.enum(['admin', 'manager', 'user', 'auditor']),
    active: z.boolean().default(true),
  }),

  // Audit Log Schema
  auditLog: z.object({
    action: z.string().min(1),
    entityType: z.string().min(1),
    entityId: z.string().optional(),
    userId: z.string(),
    details: z.string().optional(),
    ipAddress: z.string().optional(),
    timestamp: z.string().datetime().optional(),
  }),

  // Quality Event Schema
  qualityEvent: z.object({
    id: z.string().uuid().optional(),
    title: z.string().min(3).max(255),
    description: z.string().min(1),
    eventType: z.enum(['deviation', 'capa', 'complaint', 'audit_finding']),
    severity: z.enum(['critical', 'major', 'minor', 'observation']),
    status: z.enum(['open', 'in_progress', 'pending_review', 'closed']),
    assignedTo: z.string().optional(),
    dueDate: z.string().datetime().optional(),
    createdBy: z.string(),
  }),

  // Promotional Review Schema
  promoReview: z.object({
    id: z.string().uuid().optional(),
    materialName: z.string().min(3).max(255),
    materialType: z.enum([
      'brochure',
      'website',
      'email',
      'advertisement',
      'social_media',
      'other',
    ]),
    content: z.string().min(1),
    status: z.enum(['draft', 'submitted', 'in_review', 'approved', 'rejected']),
    submittedBy: z.string(),
    reviewers: z.array(z.string()).optional(),
    comments: z
      .array(
        z.object({
          user: z.string(),
          comment: z.string().min(1),
          timestamp: z.string().datetime().optional(),
        })
      )
      .optional(),
  }),
};
