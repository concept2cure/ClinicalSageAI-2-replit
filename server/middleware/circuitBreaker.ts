/**
 * Circuit Breaker Pattern Implementation
 *
 * Prevents cascading failures and provides fault isolation through:
 * - Automatic detection of service failures
 * - Fast failing when threshold is reached
 * - Self-healing with automatic service recovery
 * - Request queuing to manage load during recovery
 */
import { Request, Response, NextFunction } from 'express';
import { createContextLogger } from '../utils/logger';

export enum CircuitState {
  CLOSED = 'CLOSED', // Normal operation, requests pass through
  OPEN = 'OPEN', // Failure threshold reached, fast fails
  HALF_OPEN = 'HALF_OPEN', // Testing if service recovered
}

export interface CircuitBreakerOptions {
  failureThreshold: number; // Number of failures before opening circuit
  resetTimeout: number; // Time in ms to wait before half-open state
  monitorInterval: number; // Time in ms between internal health checks
  maxTimeout: number; // Maximum timeout for requests in ms
  maxQueueSize?: number; // Maximum size of request queue during recovery
}

const DEFAULT_OPTIONS: CircuitBreakerOptions = {
  failureThreshold: 5,
  resetTimeout: 30000, // 30 seconds
  monitorInterval: 5000, // 5 seconds
  maxTimeout: 10000, // 10 seconds
  maxQueueSize: 100, // Maximum 100 queued requests
};

// Registry of circuit breakers
const circuitBreakers: Record<string, CircuitBreaker> = {};

export function getCircuitBreaker(name: string): CircuitBreaker | undefined {
  return circuitBreakers[name];
}

/**
 * Circuit Breaker implementation
 */
export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failures: number = 0;
  private options: CircuitBreakerOptions;
  private resetTimer: NodeJS.Timeout | null = null;
  private stateChangeTime: number = Date.now();
  private monitorTimer: NodeJS.Timeout;
  private requestQueue: Array<{ resolve: Function; reject: Function }> = [];

  // Creating logger with circuit name as context
  private logger = createContextLogger({
    module: 'circuit-breaker',
    name: this.name,
  });

  constructor(
    public name: string,
    options: Partial<CircuitBreakerOptions> = {}
  ) {
    this.options = { ...DEFAULT_OPTIONS, ...options };

    // Register in global registry
    circuitBreakers[name] = this;

    // Start monitoring (unref so it doesn't prevent process exit)
    this.monitorTimer = setInterval(() => this.monitor(), this.options.monitorInterval);
    this.monitorTimer.unref();

    this.logger.info('Circuit breaker initialized', {
      failureThreshold: this.options.failureThreshold,
      resetTimeout: this.options.resetTimeout,
      state: this.state,
    });
  }

  /**
   * Execute function with circuit breaker protection
   */
  async execute<T>(func: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      // Circuit is open, fast fail
      this.logger.warn('Circuit open, fast failing request');
      throw new Error(`Service ${this.name} is unavailable`);
    }

    if (this.state === CircuitState.HALF_OPEN) {
      // Allow only one test request in HALF_OPEN state
      return this.allowSingleRequest(func);
    }

    try {
      // Execute with timeout protection
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Operation timed out after ${this.options.maxTimeout}ms`));
        }, this.options.maxTimeout);
      });

      // Race between actual operation and timeout
      return await Promise.race([func(), timeoutPromise]);
    } catch (error) {
      // Record failure and potentially open circuit
      this.recordFailure(error);
      throw error;
    }
  }

  /**
   * Process a single test request in HALF_OPEN state
   */
  private async allowSingleRequest<T>(func: () => Promise<T>): Promise<T> {
    // If current state is not HALF_OPEN or it changed during this call,
    // restart with the regular execute flow
    if (this.state !== CircuitState.HALF_OPEN) {
      return this.execute(func);
    }

    this.logger.info('Testing circuit with a single request in HALF_OPEN state');

    try {
      const result = await func();
      // Success, close the circuit
      this.close();

      // Process any queued requests
      this.processQueue();

      return result;
    } catch (error) {
      // Test request failed, open circuit again
      this.open();
      throw error;
    }
  }

  /**
   * Queue a request for later execution
   */
  private queueRequest<T>(): Promise<T> {
    return new Promise((resolve, reject) => {
      const queueSize = this.requestQueue.length;

      if (queueSize >= (this.options.maxQueueSize || DEFAULT_OPTIONS.maxQueueSize)) {
        reject(new Error(`Request queue full for service ${this.name}`));
        return;
      }

      this.logger.debug('Queuing request for later execution', { queueSize: queueSize + 1 });
      this.requestQueue.push({ resolve, reject });
    });
  }

  /**
   * Process queued requests after recovery
   */
  private async processQueue() {
    if (this.state !== CircuitState.CLOSED || this.requestQueue.length === 0) {
      return;
    }

    const queue = [...this.requestQueue];
    this.requestQueue.length = 0;

    this.logger.info('Processing queued requests', { count: queue.length });

    for (const { resolve, reject } of queue) {
      try {
        // Resolve with success, actual request will be executed by caller
        resolve(true);
      } catch (err) {
        reject(err);
      }
    }
  }

  /**
   * Record a failure and open circuit if threshold reached
   */
  recordFailure(error: any) {
    this.failures++;

    this.logger.warn('Request failed', {
      failure: this.failures,
      threshold: this.options.failureThreshold,
      error: error instanceof Error ? error.message : String(error),
    });

    if (this.failures >= this.options.failureThreshold) {
      this.open();
    }
  }

  /**
   * Transition to OPEN state
   */
  private open() {
    if (this.state !== CircuitState.OPEN) {
      this.state = CircuitState.OPEN;
      this.stateChangeTime = Date.now();

      this.logger.warn('Circuit opened due to failures');

      // Schedule reset to HALF_OPEN state (unref so it doesn't prevent process exit)
      this.resetTimer = setTimeout(() => {
        this.halfOpen();
      }, this.options.resetTimeout);
      this.resetTimer.unref();
    }
  }

  /**
   * Transition to HALF_OPEN state
   */
  private halfOpen() {
    if (this.state === CircuitState.OPEN) {
      this.state = CircuitState.HALF_OPEN;
      this.stateChangeTime = Date.now();

      this.logger.info('Circuit half-open, testing with next request');
    }
  }

  /**
   * Transition to CLOSED state
   */
  private close() {
    if (this.state !== CircuitState.CLOSED) {
      this.state = CircuitState.CLOSED;
      this.failures = 0;
      this.stateChangeTime = Date.now();

      // Clear any reset timer
      if (this.resetTimer) {
        clearTimeout(this.resetTimer);
        this.resetTimer = null;
      }

      this.logger.info('Circuit closed, normal operation resumed');
    }
  }

  /**
   * Periodically check circuit state
   */
  private monitor() {
    const stateDuration = Date.now() - this.stateChangeTime;

    // Log long-duration open circuits
    if (this.state === CircuitState.OPEN && stateDuration > this.options.resetTimeout * 2) {
      this.logger.warn('Circuit has been open for extended period', {
        duration: Math.round(stateDuration / 1000),
        seconds: true,
      });
    }

    // Auto-reset to HALF_OPEN if reset timer failed
    if (
      this.state === CircuitState.OPEN &&
      stateDuration > this.options.resetTimeout &&
      !this.resetTimer
    ) {
      this.logger.warn('Reset timer failed, forcing half-open state');
      this.halfOpen();
    }
  }

  /**
   * Get current circuit state
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Check if circuit is open
   */
  isCircuitOpen(): boolean {
    return this.state === CircuitState.OPEN;
  }

  /**
   * Reset the circuit breaker
   */
  reset() {
    this.logger.info('Manually resetting circuit breaker');
    this.failures = 0;
    this.close();

    // Process any queued requests
    this.processQueue();
  }

  /**
   * Clean up resources
   */
  destroy() {
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
    }

    clearInterval(this.monitorTimer);
    delete circuitBreakers[this.name];

    this.logger.info('Circuit breaker destroyed');
  }
}

/**
 * Circuit breaker middleware factory
 */
export function createCircuitBreakerMiddleware(
  name: string,
  options: Partial<CircuitBreakerOptions> = {}
) {
  if (!circuitBreakers[name]) {
    new CircuitBreaker(name, options);
  }

  const breaker = circuitBreakers[name];
  const logger = createContextLogger({ module: 'circuit-breaker-middleware', name });

  return function circuitBreakerMiddleware(req: Request, res: Response, next: NextFunction) {
    if (breaker.isCircuitOpen()) {
      logger.warn('Circuit open, fast failing request', {
        path: req.path,
        method: req.method,
      });

      res.status(503).json({
        error: `Service ${name} is temporarily unavailable`,
        status: 'circuit_open',
        retry_after: 10, // seconds
      });
      return;
    }

    // Track 5xx responses as circuit breaker failures
    const originalJson = res.json.bind(res);
    res.json = function (body?: any): Response {
      if (res.statusCode >= 500) {
        breaker.recordFailure(new Error(`Server error ${res.statusCode} on ${req.method} ${req.path}`));
      }
      return originalJson(body);
    };

    next();
  };
}

export default CircuitBreaker;
