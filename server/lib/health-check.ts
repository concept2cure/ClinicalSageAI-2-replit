/**
 * Health Check Endpoints - System Observability
 * 
 * FDA 21 CFR Part 11 Compliant - System Monitoring
 * 
 * Comprehensive health checks for:
 * - Kubernetes liveness/readiness probes
 * - Load balancer health checks
 * - Monitoring systems (Prometheus, Datadog, etc.)
 * - Operational dashboards
 * 
 * Endpoints:
 * - /health/live   - Basic liveness (is the process running?)
 * - /health/ready  - Readiness (can it accept traffic?)
 * - /health/full   - Full system health with dependencies
 * - /health/metrics - Prometheus-compatible metrics
 * 
 * @module HealthCheck
 * @version 1.0.0
 * @compliance FDA 21 CFR Part 11
 */

import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { getOpenAICircuitBreaker } from './circuit-breaker';
import { getGracefulDegradationService } from './graceful-degradation';
import { getRateLimiters } from './rate-limiting';

// =============================================================================
// Types
// =============================================================================

export interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  version?: string;
  uptime?: number;
  checks?: Record<string, ComponentHealth>;
  degradation?: {
    level: string;
    features: Record<string, boolean>;
  };
}

export interface ComponentHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  latencyMs?: number;
  message?: string;
  details?: Record<string, unknown>;
}

// =============================================================================
// Health Check Service
// =============================================================================

export class HealthCheckService {
  private startTime: Date;
  
  constructor(
    private pool: Pool,
    private version: string = '1.0.0'
  ) {
    this.startTime = new Date();
  }

  /**
   * Liveness check - is the process running?
   * Should always return 200 unless the process is dead
   */
  async checkLiveness(): Promise<HealthCheckResult> {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: this.version,
      uptime: this.getUptimeSeconds()
    };
  }

  /**
   * Readiness check - can it accept traffic?
   * Returns unhealthy if critical dependencies are down
   */
  async checkReadiness(): Promise<HealthCheckResult> {
    const dbHealth = await this.checkDatabase();
    
    const isReady = dbHealth.status === 'healthy';
    
    return {
      status: isReady ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      version: this.version,
      uptime: this.getUptimeSeconds(),
      checks: {
        database: dbHealth
      }
    };
  }

  /**
   * Full health check - all dependencies
   */
  async checkFull(): Promise<HealthCheckResult> {
    const [dbHealth, openAIHealth, memoryHealth] = await Promise.all([
      this.checkDatabase(),
      this.checkOpenAI(),
      this.checkMemory()
    ]);

    const degradation = getGracefulDegradationService();
    const degradationState = degradation.getState();

    // Determine overall status
    let status: HealthCheckResult['status'] = 'healthy';
    if (dbHealth.status === 'unhealthy') {
      status = 'unhealthy';
    } else if (
      openAIHealth.status === 'unhealthy' || 
      degradationState.level !== 'FULL'
    ) {
      status = 'degraded';
    }

    return {
      status,
      timestamp: new Date().toISOString(),
      version: this.version,
      uptime: this.getUptimeSeconds(),
      checks: {
        database: dbHealth,
        openai: openAIHealth,
        memory: memoryHealth
      },
      degradation: {
        level: degradationState.level,
        features: degradationState.features
      }
    };
  }

  /**
   * Check database connectivity
   */
  private async checkDatabase(): Promise<ComponentHealth> {
    const startTime = Date.now();
    
    try {
      const result = await this.pool.query('SELECT 1 as check, NOW() as time');
      const latencyMs = Date.now() - startTime;

      // Check connection pool status
      const poolStatus = {
        total: this.pool.totalCount,
        idle: this.pool.idleCount,
        waiting: this.pool.waitingCount
      };

      return {
        status: latencyMs < 1000 ? 'healthy' : 'degraded',
        latencyMs,
        message: 'Database connection successful',
        details: {
          serverTime: result.rows[0]?.time,
          pool: poolStatus
        }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        latencyMs: Date.now() - startTime,
        message: error instanceof Error ? error.message : 'Database connection failed',
        details: { error: String(error) }
      };
    }
  }

  /**
   * Check OpenAI circuit breaker status
   */
  private async checkOpenAI(): Promise<ComponentHealth> {
    const breaker = getOpenAICircuitBreaker();
    const metrics = breaker.getMetrics();
    const state = breaker.getState();

    let status: ComponentHealth['status'] = 'healthy';
    if (state === 'OPEN') {
      status = 'unhealthy';
    } else if (state === 'HALF_OPEN' || metrics.avgResponseTimeMs > 5000) {
      status = 'degraded';
    }

    return {
      status,
      latencyMs: metrics.avgResponseTimeMs,
      message: `Circuit breaker state: ${state}`,
      details: {
        circuitState: state,
        ...metrics
      }
    };
  }

  /**
   * Check memory usage
   */
  private async checkMemory(): Promise<ComponentHealth> {
    const memUsage = process.memoryUsage();
    const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
    const heapTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024);
    const heapUsedPercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;

    let status: ComponentHealth['status'] = 'healthy';
    if (heapUsedPercent > 90) {
      status = 'unhealthy';
    } else if (heapUsedPercent > 75) {
      status = 'degraded';
    }

    return {
      status,
      message: `Heap usage: ${heapUsedMB}MB / ${heapTotalMB}MB (${heapUsedPercent.toFixed(1)}%)`,
      details: {
        heapUsedMB,
        heapTotalMB,
        heapUsedPercent: Math.round(heapUsedPercent),
        rssMB: Math.round(memUsage.rss / 1024 / 1024),
        externalMB: Math.round(memUsage.external / 1024 / 1024)
      }
    };
  }

  /**
   * Get uptime in seconds
   */
  private getUptimeSeconds(): number {
    return Math.round((Date.now() - this.startTime.getTime()) / 1000);
  }

  /**
   * Get Prometheus-compatible metrics
   */
  async getPrometheusMetrics(): Promise<string> {
    const [full] = await Promise.all([this.checkFull()]);
    const degradation = getGracefulDegradationService();
    const state = degradation.getState();
    const limiters = getRateLimiters();
    const breaker = getOpenAICircuitBreaker();
    const metrics = breaker.getMetrics();

    const lines: string[] = [];
    const timestamp = Date.now();

    // Helper to add metric
    const addMetric = (name: string, value: number, help: string, labels?: Record<string, string>) => {
      lines.push(`# HELP ${name} ${help}`);
      lines.push(`# TYPE ${name} gauge`);
      const labelStr = labels 
        ? `{${Object.entries(labels).map(([k, v]) => `${k}="${v}"`).join(',')}}` 
        : '';
      lines.push(`${name}${labelStr} ${value} ${timestamp}`);
    };

    // Uptime
    addMetric('concept2cure-ri_uptime_seconds', this.getUptimeSeconds(), 'Process uptime in seconds');

    // Overall health (1 = healthy, 0.5 = degraded, 0 = unhealthy)
    const healthValue = full.status === 'healthy' ? 1 : full.status === 'degraded' ? 0.5 : 0;
    addMetric('concept2cure-ri_health_status', healthValue, 'Overall health status');

    // Degradation level
    const levelValue = { 'FULL': 0, 'DEGRADED': 1, 'MINIMAL': 2, 'MAINTENANCE': 3 }[state.level] || 0;
    addMetric('concept2cure-ri_degradation_level', levelValue, 'Current degradation level');

    // Circuit breaker
    addMetric('concept2cure-ri_circuit_breaker_state', 
      metrics.state === 'CLOSED' ? 0 : metrics.state === 'HALF_OPEN' ? 1 : 2,
      'OpenAI circuit breaker state (0=closed, 1=half-open, 2=open)',
      { service: 'openai' }
    );
    addMetric('concept2cure-ri_circuit_breaker_failures', metrics.totalFailures, 'Total circuit breaker failures', { service: 'openai' });
    addMetric('concept2cure-ri_circuit_breaker_successes', metrics.totalSuccesses, 'Total circuit breaker successes', { service: 'openai' });
    addMetric('concept2cure-ri_circuit_breaker_latency_ms', metrics.avgResponseTimeMs, 'Average response time in ms', { service: 'openai' });

    // Memory
    const mem = process.memoryUsage();
    addMetric('concept2cure-ri_memory_heap_used_bytes', mem.heapUsed, 'Heap memory used in bytes');
    addMetric('concept2cure-ri_memory_heap_total_bytes', mem.heapTotal, 'Heap memory total in bytes');
    addMetric('concept2cure-ri_memory_rss_bytes', mem.rss, 'Resident set size in bytes');

    // Database pool
    addMetric('concept2cure-ri_db_pool_total', this.pool.totalCount, 'Total database connections in pool');
    addMetric('concept2cure-ri_db_pool_idle', this.pool.idleCount, 'Idle database connections');
    addMetric('concept2cure-ri_db_pool_waiting', this.pool.waitingCount, 'Requests waiting for connection');

    return lines.join('\n');
  }
}

// =============================================================================
// Router Factory
// =============================================================================

export function createHealthRouter(pool: Pool, version?: string): Router {
  const router = Router();
  const healthService = new HealthCheckService(pool, version);

  /**
   * GET /health/live - Kubernetes liveness probe
   */
  router.get('/live', async (req: Request, res: Response) => {
    const result = await healthService.checkLiveness();
    res.status(200).json(result);
  });

  /**
   * GET /health/ready - Kubernetes readiness probe
   */
  router.get('/ready', async (req: Request, res: Response) => {
    const result = await healthService.checkReadiness();
    res.status(result.status === 'healthy' ? 200 : 503).json(result);
  });

  /**
   * GET /health/full - Full health check
   */
  router.get('/full', async (req: Request, res: Response) => {
    const result = await healthService.checkFull();
    const statusCode = result.status === 'healthy' ? 200 
      : result.status === 'degraded' ? 200 
      : 503;
    res.status(statusCode).json(result);
  });

  /**
   * GET /health/metrics - Prometheus metrics
   */
  router.get('/metrics', async (req: Request, res: Response) => {
    const metrics = await healthService.getPrometheusMetrics();
    res.setHeader('Content-Type', 'text/plain; version=0.0.4');
    res.send(metrics);
  });

  /**
   * GET /health - Alias for /health/full
   */
  router.get('/', async (req: Request, res: Response) => {
    const result = await healthService.checkFull();
    const statusCode = result.status === 'healthy' ? 200 
      : result.status === 'degraded' ? 200 
      : 503;
    res.status(statusCode).json(result);
  });

  return router;
}
