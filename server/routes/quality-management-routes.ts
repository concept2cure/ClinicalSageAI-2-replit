/**
 * Quality Management Routes Registration
 *
 * This module registers all quality management related routes, including
 * validation and traceability mapping endpoints.
 */
import { Express } from 'express';
import { createScopedLogger } from '../utils/logger';
import qualityValidationRoutes from './quality-validation-routes';
import traceabilityMappingRoutes from './traceability-mapping-routes';

const logger = createScopedLogger('quality-management-routes');

/**
 * Register all quality management API routes
 *
 * @param app Express application instance
 */
export function registerQualityManagementRoutes(app: Express): void {
  try {
    logger.info('Registering quality management API routes');

    // Register validation routes
    app.use('/api/quality/validation', qualityValidationRoutes);

    // Register traceability mapping routes
    app.use('/api/quality/traceability', traceabilityMappingRoutes);

    logger.info('Quality management API routes registered successfully');
  } catch (error) {
    // Log error but don't crash the server if route registration fails
    logger.error('Error registering quality management API routes', { error });
    // We don't rethrow the error to allow the application to continue starting up
  }
}
