/**
 * Middleware Setup for TrialSage
 *
 * This file sets up all the middleware for the Express application
 * in the proper order.
 */
import { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { tenantContextMiddleware } from './tenantContext';
import { authMiddleware } from '../auth';
import { createScopedLogger } from '../utils/logger';

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
      origin: process.env.CORS_ORIGIN || '*',
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant-ID'],
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

  // Authentication and Tenant isolation (only for API routes)
  app.use('/api', (req, res, next) => {
    // Skip middleware for public routes
    if (
      req.path === '/api/health' ||
      req.path.startsWith('/api/auth/login') ||
      req.path.startsWith('/api/auth/register') ||
      req.path.startsWith('/api/public')
    ) {
      return next();
    }

    // Apply authentication middleware
    authMiddleware(req, res, err => {
      if (err) return next(err);

      // If authentication successful, apply tenant context middleware
      tenantContextMiddleware(req, res, next);
    });
  });

  logger.info('Middleware setup completed');
}
