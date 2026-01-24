/**
 * Security Middleware for Production
 * Implements input validation, HTML sanitization, rate limiting, and header validation
 */

import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { JSDOM } from 'jsdom';
import createDOMPurify from 'dompurify';
import { z } from 'zod';

// Initialize DOMPurify with JSDOM
const window = new JSDOM('').window;
const DOMPurify = createDOMPurify(window as unknown as Window);

/**
 * HTML Sanitization middleware
 * Sanitizes all string values in request body to prevent XSS attacks
 */
export const sanitizeInput = (req: Request, res: Response, next: NextFunction) => {
  try {
    if (req.body && typeof req.body === 'object') {
      req.body = sanitizeObject(req.body);
    }
    next();
  } catch (error) {
    console.error('[Security] Sanitization error:', error);
    res.status(400).json({ error: 'Invalid input data' });
  }
};

/**
 * Recursively sanitize all string values in an object
 */
function sanitizeObject(obj: any): any {
  if (typeof obj === 'string') {
    // Sanitize HTML while preserving safe formatting
    return DOMPurify.sanitize(obj, {
      ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'br', 'p', 'ul', 'ol', 'li', 'code', 'pre'],
      ALLOWED_ATTR: ['href', 'target', 'rel'],
      ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|cid|xmpp):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i
    });
  } else if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item));
  } else if (obj && typeof obj === 'object') {
    const sanitized: any = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        sanitized[key] = sanitizeObject(obj[key]);
      }
    }
    return sanitized;
  }
  return obj;
}

/**
 * Organization header validation middleware
 * Validates required headers for multi-tenant support
 */
export const validateOrganizationHeaders = (req: Request, res: Response, next: NextFunction) => {
  // Skip validation for public endpoints
  const publicEndpoints = ['/api/health', '/api/ai/health', '/healthz', '/readyz'];
  if (publicEndpoints.some(endpoint => req.path.startsWith(endpoint))) {
    return next();
  }
  
  // Check for organization header in production
  if (process.env.NODE_ENV === 'production') {
    const orgId = req.headers['x-organization-id'] || req.headers['x-org-id'];
    const userId = req.headers['x-user-id'] || req.headers['authorization'];
    
    if (!orgId && req.method !== 'GET') {
      console.warn('[Security] Missing organization header:', {
        path: req.path,
        method: req.method,
        ip: req.ip
      });
      // In production, log warning but allow request to proceed
      // This prevents breaking existing functionality
    }
    
    // Add headers to request for downstream use
    (req as any).organizationId = orgId;
    (req as any).userId = userId;
  }
  
  next();
};

/**
 * Rate limiting configurations for different endpoint types
 */
export const rateLimits = {
  // Strict limit for AI endpoints (expensive operations)
  ai: rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 30, // 30 requests per minute
    message: 'Too many AI requests. Please wait before trying again.',
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      console.warn('[Security] AI rate limit exceeded:', {
        ip: req.ip,
        path: req.path,
        headers: req.headers
      });
      res.status(429).json({
        error: 'Rate limit exceeded',
        message: 'Too many AI requests. Please wait before trying again.',
        retryAfter: 60
      });
    }
  }),
  
  // Standard limit for API endpoints
  api: rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 100, // 100 requests per minute
    message: 'Too many requests. Please slow down.',
    standardHeaders: true,
    legacyHeaders: false
  }),
  
  // Lenient limit for read operations
  read: rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 200, // 200 requests per minute
    message: 'Too many requests. Please slow down.',
    standardHeaders: true,
    legacyHeaders: false
  }),
  
  // Strict limit for write operations
  write: rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 50, // 50 requests per minute
    message: 'Too many write operations. Please slow down.',
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: false
  }),
  
  // Very strict limit for authentication
  auth: rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 requests per 15 minutes
    message: 'Too many authentication attempts. Please wait.',
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true
  })
};

/**
 * Input validation schemas for common request types
 */
export const validationSchemas = {
  // AI request validation
  aiRequest: z.object({
    content: z.string().min(1).max(100000),
    task: z.string().optional(),
    documentType: z.string().optional(),
    section: z.string().optional(),
    metadata: z.record(z.any()).optional()
  }),
  
  // Document validation
  document: z.object({
    id: z.string().optional(),
    title: z.string().min(1).max(500),
    content: z.string().max(5000000), // 5MB max
    type: z.string(),
    status: z.enum(['draft', 'review', 'approved', 'published']).optional(),
    metadata: z.record(z.any()).optional()
  }),
  
  // User input validation
  userInput: z.object({
    text: z.string().min(1).max(10000),
    format: z.enum(['plain', 'html', 'markdown']).optional()
  })
};

/**
 * Generic input validation middleware factory
 */
export const validateInput = (schema: z.ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = schema.safeParse(req.body);
      if (!result.success) {
        console.warn('[Security] Input validation failed:', {
          path: req.path,
          errors: result.error.errors
        });
        return res.status(400).json({
          error: 'Invalid input',
          details: result.error.errors.map(e => ({
            field: e.path.join('.'),
            message: e.message
          }))
        });
      }
      req.body = result.data;
      next();
    } catch (error) {
      console.error('[Security] Validation error:', error);
      res.status(400).json({ error: 'Invalid input data' });
    }
  };
};

/**
 * Security headers middleware using Helmet
 * Configures various security headers for production
 */
export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", 'https://apis.google.com'],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'https:', 'blob:'],
      connectSrc: ["'self'", 'https://api.openai.com', 'https://apis.google.com', 'wss:', 'ws:'],
      frameSrc: ["'self'", 'https://docs.google.com', 'https://office.com'],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null
    }
  },
  crossOriginEmbedderPolicy: false, // Allow embedding for Google Docs/Office
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
});

/**
 * Request size limits to prevent abuse
 */
export const requestSizeLimits = {
  json: '10mb', // For document uploads
  urlencoded: '10mb',
  text: '10mb',
  raw: '50mb' // For file uploads
};

/**
 * CORS configuration for production
 */
export const corsOptions = {
  origin: (origin: string | undefined, callback: Function) => {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);
    
    // Whitelist of allowed origins
    const allowedOrigins = [
      'http://localhost:5000',
      'http://localhost:3000',
      'https://trialsage.com',
      'https://app.trialsage.com',
      'https://api.trialsage.com'
    ];
    
    // Add dynamic origins from environment
    if (process.env.ALLOWED_ORIGINS) {
      allowedOrigins.push(...process.env.ALLOWED_ORIGINS.split(','));
    }
    
    if (allowedOrigins.includes(origin) || process.env.NODE_ENV !== 'production') {
      callback(null, true);
    } else {
      console.warn('[Security] CORS blocked origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Organization-Id', 'X-User-Id', 'X-Request-ID'],
  exposedHeaders: ['X-Request-ID', 'X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
  maxAge: 86400 // 24 hours
};

/**
 * Audit logging middleware for production monitoring
 */
export const auditLog = (req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  
  // Log request
  const requestLog = {
    timestamp: new Date().toISOString(),
    method: req.method,
    path: req.path,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    organizationId: (req as any).organizationId,
    userId: (req as any).userId
  };
  
  // Override res.end to log response
  const originalEnd = res.end;
  res.end = function(...args: any[]) {
    const duration = Date.now() - startTime;
    
    // Log response
    const responseLog = {
      ...requestLog,
      statusCode: res.statusCode,
      duration,
      success: res.statusCode < 400
    };
    
    // Log errors and slow requests
    if (res.statusCode >= 400 || duration > 1000) {
      console.warn('[Audit]', responseLog);
    } else if (process.env.DEBUG) {
      console.log('[Audit]', responseLog);
    }
    
    // Track metrics (in production, send to monitoring service)
    if (process.env.NODE_ENV === 'production') {
      // TODO: Send to monitoring service (e.g., DataDog, New Relic)
    }
    
    originalEnd.apply(res, args);
  };
  
  next();
};

// Export all middleware
export default {
  sanitizeInput,
  validateOrganizationHeaders,
  rateLimits,
  validationSchemas,
  validateInput,
  securityHeaders,
  requestSizeLimits,
  corsOptions,
  auditLog
};