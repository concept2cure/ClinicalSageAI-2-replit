/**
 * Health Check API Routes
 *
 * Provides endpoints to check and monitor the health of the application.
 * These routes are critical for ensuring system stability and preventing downtime.
 *
 * CRITICAL STABILITY COMPONENT - DO NOT MODIFY WITHOUT THOROUGH TESTING
 */

import { Router } from 'express';
import { Pool } from 'pg';
import applicationHealth from '../utils/applicationHealthCheck';

/**
 * Creates and configures the health check router
 *
 * @param dbPool Database connection pool
 * @returns Express router with health check routes
 */
export function createHealthCheckRouter(dbPool: Pool): Router {
  const router = Router();

  // Basic health check endpoint that always returns 200 OK
  // This is used by load balancers and monitoring tools
  router.get('/health', (req, res) => {
    res.status(200).json({
      status: 'ok',
      message: 'Application is running',
      timestamp: new Date().toISOString(),
    });
  });

  // Detailed health check that performs comprehensive checks
  router.get('/health/detailed', async (req, res) => {
    try {
      const healthCheckResult = await applicationHealth.performHealthCheck(dbPool);

      // Set appropriate status code based on health check result
      const statusCode =
        healthCheckResult.status === 'healthy'
          ? 200
          : healthCheckResult.status === 'degraded'
            ? 200 // Still return 200 for degraded to avoid false alarms
            : 503; // Service Unavailable for unhealthy

      res.status(statusCode).json(healthCheckResult);

      // If system is unhealthy, trigger recovery attempts in the background
      if (healthCheckResult.status === 'unhealthy') {
        // Don't await this to avoid blocking the response
        applicationHealth
          .attemptServiceRecovery(dbPool)
          .then(success => {
            console.log(`Recovery attempt ${success ? 'succeeded' : 'failed'}`);
          })
          .catch(err => {
            console.error('Error during recovery attempt:', err);
          });
      }
    } catch (error) {
      // If the health check itself fails, that's a critical issue
      console.error('Failed to perform health check:', error);
      res.status(500).json({
        status: 'critical',
        message: 'Health check system failure',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      });
    }
  });

  // Readiness probe for Kubernetes
  router.get('/ready', async (req, res) => {
    try {
      const healthCheck = await applicationHealth.performHealthCheck(dbPool);

      if (healthCheck.status === 'unhealthy') {
        return res.status(503).json({
          status: 'not_ready',
          message: 'Application is not ready to serve traffic',
          timestamp: new Date().toISOString(),
        });
      }

      res.status(200).json({
        status: 'ready',
        message: 'Application is ready to serve traffic',
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      res.status(503).json({
        status: 'not_ready',
        message: 'Failed to determine readiness',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      });
    }
  });

  return router;
}

export default createHealthCheckRouter;
