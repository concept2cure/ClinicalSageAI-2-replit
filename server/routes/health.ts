/**
 * Health Check Routes
 *
 * Provides endpoints for monitoring service health and dependencies.
 * Used by Kubernetes, load balancers, and monitoring systems.
 */
import express, { Request, Response } from 'express';
import { createContextLogger } from '../utils/logger';
import { healthCheck as dbHealthCheck, pool } from '../db';
import { CircuitState, getCircuitBreaker } from '../middleware/circuitBreaker';
import { healthCheck as sagePlusHealthCheck } from '../sage-plus-service';

const router = express.Router();
const logger = createContextLogger({ module: 'health-routes' });

// Endpoints

/**
 * Simple liveness probe
 * Used to check if the service is running at all
 */
router.get('/health/live', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

/**
 * Readiness probe
 * Used to check if the service is ready to accept traffic
 */
router.get('/health/ready', async (req: Request, res: Response) => {
  try {
    // Check database connection
    const databaseHealthy = await dbHealthCheck();

    // Check circuit breakers
    const validatorState = getCircuitBreaker('validator')?.getState() || CircuitState.CLOSED;
    const openaiState = getCircuitBreaker('openai')?.getState() || CircuitState.CLOSED;
    const databaseState = getCircuitBreaker('database')?.getState() || CircuitState.CLOSED;

    const isValidatorHealthy = validatorState !== CircuitState.OPEN;
    const isOpenaiHealthy = openaiState !== CircuitState.OPEN;
    const isDatabaseHealthy = databaseHealthy && databaseState !== CircuitState.OPEN;

    // Overall health status
    const isHealthy = isDatabaseHealthy && isValidatorHealthy && isOpenaiHealthy;

    // Respond with detailed health status
    const status = {
      status: isHealthy ? 'ok' : 'degraded',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      services: {
        database: isDatabaseHealthy,
        validator: isValidatorHealthy,
        openai: isOpenaiHealthy,
        circuit_states: {
          database: databaseState,
          validator: validatorState,
          openai: openaiState,
        },
      },
    };

    // Return appropriate status code
    res.status(isHealthy ? 200 : 503).json(status);
  } catch (error) {
    logger.error('Health check failed', {
      error: error instanceof Error ? error.message : String(error),
    });

    res.status(500).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Deep health check
 * Performs comprehensive checks on all dependencies
 */
router.get('/health/deep', async (req: Request, res: Response) => {
  try {
    // Start time for performance measurement
    const startTime = Date.now();

    // Database checks
    let databaseResult;
    if (pool) {
      try {
        const dbStatus = await dbHealthCheck();
        const connectionCount = pool.totalCount || 0;
        const waitingCount = pool.waitingCount || 0;

        databaseResult = {
          status: dbStatus ? 'ok' : 'error',
          connections: connectionCount,
          waiting: waitingCount,
          latency: 0, // Will be updated below
        };
      } catch (error) {
        databaseResult = {
          status: 'error',
          error: error instanceof Error ? error.message : String(error),
          latency: 0,
        };
      }
    } else {
      databaseResult = {
        status: 'not_configured',
        latency: 0,
      };
    }

    // SagePlus service check
    let sagePlusResult;
    try {
      const startSagePlus = Date.now();
      const sagePlusStatus = await sagePlusHealthCheck();
      const sagePlusLatency = Date.now() - startSagePlus;

      sagePlusResult = {
        status: sagePlusStatus.status,
        databaseConnected: sagePlusStatus.databaseConnected,
        latency: sagePlusLatency,
      };
    } catch (error) {
      sagePlusResult = {
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
        latency: 0,
      };
    }

    // Measure database latency
    if (pool && databaseResult.status === 'ok') {
      try {
        const startDb = Date.now();
        await pool.query('SELECT 1');
        databaseResult.latency = Date.now() - startDb;
      } catch (error) {
        // Keep existing status but note latency error
        databaseResult.latencyError = error instanceof Error ? error.message : String(error);
      }
    }

    // Circuit breaker states
    const circuitBreakers = {
      validator: getCircuitBreaker('validator')?.getState() || CircuitState.CLOSED,
      openai: getCircuitBreaker('openai')?.getState() || CircuitState.CLOSED,
      database: getCircuitBreaker('database')?.getState() || CircuitState.CLOSED,
    };

    // Memory usage
    const memoryUsage = process.memoryUsage();

    // Overall health determination
    const isHealthy =
      (databaseResult.status === 'ok' || databaseResult.status === 'not_configured') &&
      sagePlusResult.status === 'operational' &&
      circuitBreakers.validator !== CircuitState.OPEN &&
      circuitBreakers.openai !== CircuitState.OPEN &&
      circuitBreakers.database !== CircuitState.OPEN;

    // Build comprehensive health report
    const healthReport = {
      status: isHealthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      responseTime: Date.now() - startTime,
      services: {
        database: databaseResult,
        sagePlus: sagePlusResult,
        circuitBreakers,
      },
      system: {
        memory: {
          rss: Math.round(memoryUsage.rss / 1024 / 1024),
          heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
          heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
          external: Math.round(memoryUsage.external / 1024 / 1024),
          units: 'MB',
        },
        nodeVersion: process.version,
        platform: process.platform,
      },
    };

    // Log if degraded
    if (!isHealthy) {
      logger.warn('Deep health check reports degraded system', healthReport);
    }

    res.status(isHealthy ? 200 : 503).json(healthReport);
  } catch (error) {
    logger.error('Deep health check failed', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    res.status(500).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Health metrics (Prometheus compatible)
 * Provides metrics for monitoring systems
 */
router.get('/metrics', async (req: Request, res: Response) => {
  try {
    const startTime = Date.now();

    // Database status (1 = up, 0 = down)
    let databaseUp = 0;
    let databaseLatency = 0;
    if (pool) {
      try {
        const dbStartTime = Date.now();
        const dbStatus = await dbHealthCheck();
        databaseLatency = Date.now() - dbStartTime;
        databaseUp = dbStatus ? 1 : 0;
      } catch (error) {
        databaseUp = 0;
      }
    }

    // Application metrics
    const uptime = process.uptime();
    const { rss, heapTotal, heapUsed, external } = process.memoryUsage();

    // Circuit breaker states (1 = closed, 0 = open)
    const validatorState = getCircuitBreaker('validator')?.getState() || CircuitState.CLOSED;
    const openaiState = getCircuitBreaker('openai')?.getState() || CircuitState.CLOSED;
    const databaseState = getCircuitBreaker('database')?.getState() || CircuitState.CLOSED;

    const validatorUp = validatorState !== CircuitState.OPEN ? 1 : 0;
    const openaiUp = openaiState !== CircuitState.OPEN ? 1 : 0;
    const databaseCircuitUp = databaseState !== CircuitState.OPEN ? 1 : 0;

    // Build Prometheus metrics output
    const metrics = [
      '# HELP trialsage_up Whether the service is up (1) or down (0)',
      'trialsage_up 1',
      '',
      '# HELP trialsage_uptime_seconds How long the service has been running',
      `trialsage_uptime_seconds ${uptime}`,
      '',
      '# HELP trialsage_memory_usage_bytes Memory usage in bytes',
      `trialsage_memory_rss_bytes ${rss}`,
      `trialsage_memory_heap_total_bytes ${heapTotal}`,
      `trialsage_memory_heap_used_bytes ${heapUsed}`,
      `trialsage_memory_external_bytes ${external}`,
      '',
      '# HELP trialsage_database_up Whether the database is up (1) or down (0)',
      `trialsage_database_up ${databaseUp}`,
      '',
      '# HELP trialsage_database_latency_ms Database query latency in milliseconds',
      `trialsage_database_latency_ms ${databaseLatency}`,
      '',
      '# HELP trialsage_circuit_status Whether the circuit is up (1) or down (0)',
      `trialsage_circuit_validator ${validatorUp}`,
      `trialsage_circuit_openai ${openaiUp}`,
      `trialsage_circuit_database ${databaseCircuitUp}`,
      '',
      '# HELP trialsage_health_response_ms Response time of health check in milliseconds',
      `trialsage_health_response_ms ${Date.now() - startTime}`,
    ].join('\n');

    res.set('Content-Type', 'text/plain');
    res.send(metrics);
  } catch (error) {
    logger.error('Metrics collection failed', {
      error: error instanceof Error ? error.message : String(error),
    });

    // Still return something valid for Prometheus
    res.set('Content-Type', 'text/plain');
    res.send('# HELP trialsage_up Whether the service is up (1) or down (0)\ntrialsage_up 1\n');
  }
});

export default router;
