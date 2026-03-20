/**
 * Middleware Setup for Concept2Cure
 *
 * This file sets up all the middleware for the Express application
 * in the proper order.
 */
import { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { requireTenantContext, tenantContextMiddleware } from './tenantContext';
import { authMiddleware } from '../auth';
import { createScopedLogger } from '../utils/logger';
import { createRateLimiter } from './rateLimiter';
import { query } from '../db';

const logger = createScopedLogger('middleware');

/**
 * Set up all middleware for the Express application
 */
export function setupMiddleware(app: Express): void {
  logger.info('Setting up middleware');

  // Security middleware
  app.use(helmet());

  // CORS configuration
  app.use(
    cors({
      origin: process.env.CLIENT_URL,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Tenant-ID',
        'X-Org-Id',
        'X-Org-UUID',
        'X-Client-Id',
        'X-Module',
      ],
    })
  );

  // Compression
  app.use(compression());

  // Body parsing middleware
  app.use(require('express').json());
  app.use(require('express').urlencoded({ extended: true }));

  // Request logging
  app.use((req, res, next) => {
    logger.info(`${req.method} ${req.path}`);
    next();
  });

  // API rate limiting
  app.use('/api', createRateLimiter({ windowMs: 15 * 60 * 1000, max: 100 }));

  // Authentication and Tenant isolation (only for API routes)
  app.use('/api', (req, res, next) => {
    // Skip middleware for public routes
    if (
      req.path === '/api/health' ||
      req.path.startsWith('/api/auth/login') ||
      req.path.startsWith('/api/auth/signup') ||
      req.path.startsWith('/api/auth/register') ||
      req.path.startsWith('/api/public')
    ) {
      return next();
    }

    // Apply authentication middleware
    authMiddleware(req, res, err => {
      if (err) return next(err);

      // If authentication successful, apply tenant context middleware
      tenantContextMiddleware(req, res, async () => {
        await requireTenantContext(req, res, next);
      });
    });
  });

  // Audit logging for all mutating requests
  app.use('/api', (req, res, next) => {
    if (
      req.method === 'GET' ||
      req.path === '/api/health' ||
      req.path.startsWith('/api/auth/login') ||
      req.path.startsWith('/api/auth/signup') ||
      req.path.startsWith('/api/auth/register') ||
      req.path.startsWith('/api/public')
    ) {
      return next();
    }

    const originalSend = res.send.bind(res);
    res.send = (body: any) => {
      const action =
        req.method === 'POST'
          ? 'CREATE'
          : req.method === 'PUT' || req.method === 'PATCH'
            ? 'UPDATE'
            : req.method === 'DELETE'
              ? 'DELETE'
              : 'UNKNOWN';

      const recordId = body?.id || req.params?.id || 'unknown';
      const payload = typeof body === 'string' ? null : body;

      if (res.statusCode >= 200 && res.statusCode < 300 && req.user) {
        query(
          `INSERT INTO audit_logs (
            tenant_id,
            user_id,
            action,
            table_name,
            record_id,
            new_values,
            ip_address,
            user_agent,
            created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
          [
            req.user.tenantId,
            req.user.id,
            action,
            req.baseUrl || req.path,
            String(recordId),
            payload ? JSON.stringify(payload) : null,
            req.ip,
            req.headers['user-agent'] || null,
          ]
        ).catch(error => {
          logger.warn('Audit logging failed', { error });
        });
      }

      return originalSend(body);
    };

    next();
  });

  logger.info('Middleware setup completed');
}
