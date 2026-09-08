/**
 * Circuit Breaker Pattern Implementation
 * 
 * FDA 21 CFR Part 11 Compliant - System Survivability Layer
 * 
 * Protects against cascading failures from external service outages.
 * When OpenAI or other external services fail, the circuit breaker:
 *   1. CLOSED: Normal operation, requests pass through
 *   2. OPEN: Service failing, requests fail fast without calling external service
 *   3. HALF-OPEN: Testing if service recovered, allow limited requests
 * 
 * Key Features:
 * - Configurable failure thresholds
 * - Exponential backoff for retries
 * - Health check integration
 * - Metrics and observability
 * - Fallback handlers for graceful degradation
 * 
 * @module CircuitBreaker
 * @version 1.0.0
 * @compliance FDA 21 CFR Part 11
 */

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerOptions {
  /** Name for logging and metrics */
  name: string;
  /** Number of failures before opening circuit */
  failureThreshold: number;
  /** Time in ms before attempting to close circuit */
  resetTimeoutMs: number;
  /** Number of successful calls to close circuit from half-open */
  successThreshold: number;
  /** Timeout for individual requests in ms */
  requestTimeoutMs: number;
  /** Optional fallback function when circuit is open */
  fallback?: () => Promise<unknown>;
  /** Optional health check function */
  healthCheck?: () => Promise<boolean>;
  /** Callback when circuit state changes */
  onStateChange?: (from: CircuitState, to: CircuitState, reason: string) => void;
}

export interface CircuitBreakerMetrics {
  state: CircuitState;
  failureCount: number;
  successCount: number;
  lastFailureTime: Date | null;
  lastSuccessTime: Date | null;
  totalRequests: number;
  totalFailures: number;
  totalSuccesses: number;
  totalFallbacks: number;
  avgResponseTimeMs: number;
}

export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime: Date | null = null;
  private lastSuccessTime: Date | null = null;
  private nextRetryTime: Date | null = null;
  
  // Metrics
  private totalRequests = 0;
  private totalFailures = 0;
  private totalSuccesses = 0;
  private totalFallbacks = 0;
  private responseTimes: number[] = [];
  
  constructor(private readonly options: CircuitBreakerOptions) {
    console.log(`[CircuitBreaker:${options.name}] Initialized with threshold=${options.failureThreshold}, resetTimeout=${options.resetTimeoutMs}ms`);
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.totalRequests++;
    const startTime = Date.now();

    // Check if we should attempt a retry (half-open transition)
    if (this.state === 'OPEN') {
      if (this.nextRetryTime && new Date() >= this.nextRetryTime) {
        this.transitionTo('HALF_OPEN', 'Reset timeout elapsed');
      } else {
        // Circuit is open, use fallback or throw
        return this.handleOpenCircuit();
      }
    }

    try {
      // Execute with timeout
      const result = await this.executeWithTimeout(fn, this.options.requestTimeoutMs);
      this.handleSuccess(startTime);
      return result;
    } catch (error) {
      this.handleFailure(error, startTime);
      throw error;
    }
  }

  /**
   * Execute with timeout protection
   */
  private async executeWithTimeout<T>(fn: () => Promise<T>, timeoutMs: number): Promise<T> {
    return Promise.race([
      fn(),
      new Promise<T>((_, reject) => 
        setTimeout(() => reject(new CircuitBreakerError('Request timeout', 'TIMEOUT')), timeoutMs)
      )
    ]);
  }

  /**
   * Handle successful execution
   */
  private handleSuccess(startTime: number): void {
    const responseTime = Date.now() - startTime;
    this.responseTimes.push(responseTime);
    if (this.responseTimes.length > 100) this.responseTimes.shift();
    
    this.totalSuccesses++;
    this.successCount++;
    this.lastSuccessTime = new Date();
    
    if (this.state === 'HALF_OPEN') {
      if (this.successCount >= this.options.successThreshold) {
        this.transitionTo('CLOSED', `${this.successCount} consecutive successes`);
        this.failureCount = 0;
        this.successCount = 0;
      }
    } else if (this.state === 'CLOSED') {
      // Reset failure count on success
      this.failureCount = 0;
    }
  }

  /**
   * Handle failed execution
   */
  private handleFailure(error: unknown, startTime: number): void {
    const responseTime = Date.now() - startTime;
    this.responseTimes.push(responseTime);
    if (this.responseTimes.length > 100) this.responseTimes.shift();
    
    this.totalFailures++;
    this.failureCount++;
    this.successCount = 0;
    this.lastFailureTime = new Date();

    console.error(`[CircuitBreaker:${this.options.name}] Failure #${this.failureCount}: ${error instanceof Error ? error.message : error}`);

    if (this.state === 'HALF_OPEN') {
      // Any failure in half-open immediately opens circuit
      this.transitionTo('OPEN', 'Failure during half-open state');
      this.scheduleRetry();
    } else if (this.state === 'CLOSED' && this.failureCount >= this.options.failureThreshold) {
      this.transitionTo('OPEN', `Failure threshold (${this.options.failureThreshold}) exceeded`);
      this.scheduleRetry();
    }
  }

  /**
   * Handle open circuit (use fallback or throw)
   */
  private async handleOpenCircuit<T>(): Promise<T> {
    this.totalFallbacks++;
    
    if (this.options.fallback) {
      console.log(`[CircuitBreaker:${this.options.name}] Using fallback handler`);
      return this.options.fallback() as Promise<T>;
    }
    
    throw new CircuitBreakerError(
      `Circuit breaker is OPEN for ${this.options.name}. Service unavailable.`,
      'CIRCUIT_OPEN'
    );
  }

  /**
   * Schedule the next retry attempt
   */
  private scheduleRetry(): void {
    this.nextRetryTime = new Date(Date.now() + this.options.resetTimeoutMs);
    console.log(`[CircuitBreaker:${this.options.name}] Next retry scheduled at ${this.nextRetryTime.toISOString()}`);
  }

  /**
   * Transition to a new state
   */
  private transitionTo(newState: CircuitState, reason: string): void {
    const oldState = this.state;
    this.state = newState;
    
    console.log(`[CircuitBreaker:${this.options.name}] State transition: ${oldState} → ${newState} (${reason})`);
    
    if (this.options.onStateChange) {
      this.options.onStateChange(oldState, newState, reason);
    }
  }

  /**
   * Perform health check and potentially recover
   */
  async healthCheck(): Promise<boolean> {
    if (!this.options.healthCheck) {
      return this.state === 'CLOSED';
    }

    try {
      const healthy = await this.options.healthCheck();
      if (healthy && this.state === 'OPEN') {
        this.transitionTo('HALF_OPEN', 'Health check passed');
      }
      return healthy;
    } catch {
      return false;
    }
  }

  /**
   * Force circuit to open (manual intervention)
   */
  forceOpen(reason: string = 'Manual intervention'): void {
    this.transitionTo('OPEN', reason);
    this.scheduleRetry();
  }

  /**
   * Force circuit to close (manual intervention)
   */
  forceClose(reason: string = 'Manual intervention'): void {
    this.transitionTo('CLOSED', reason);
    this.failureCount = 0;
    this.successCount = 0;
  }

  /**
   * Get current metrics
   */
  getMetrics(): CircuitBreakerMetrics {
    const avgResponseTime = this.responseTimes.length > 0
      ? this.responseTimes.reduce((a, b) => a + b, 0) / this.responseTimes.length
      : 0;

    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      totalRequests: this.totalRequests,
      totalFailures: this.totalFailures,
      totalSuccesses: this.totalSuccesses,
      totalFallbacks: this.totalFallbacks,
      avgResponseTimeMs: Math.round(avgResponseTime)
    };
  }

  /**
   * Get current state
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Check if circuit is allowing requests
   */
  isAllowingRequests(): boolean {
    if (this.state === 'CLOSED' || this.state === 'HALF_OPEN') {
      return true;
    }
    // Check if it's time to try again
    return this.nextRetryTime !== null && new Date() >= this.nextRetryTime;
  }
}

/**
 * Circuit Breaker specific error
 */
export class CircuitBreakerError extends Error {
  constructor(
    message: string,
    public readonly code: 'CIRCUIT_OPEN' | 'TIMEOUT' | 'HEALTH_CHECK_FAILED'
  ) {
    super(message);
    this.name = 'CircuitBreakerError';
  }
}

// =============================================================================
// Pre-configured Circuit Breakers for Common Services
// Priority: Kimi AI (Primary) → OpenAI (Secondary Fallback)
// =============================================================================

let kimiBreaker: CircuitBreaker | null = null;
let openAIBreaker: CircuitBreaker | null = null;

/**
 * Get or create the Kimi AI circuit breaker (PRIMARY)
 * Kimi AI (Moonshot) is the primary LLM provider
 */
export function getKimiCircuitBreaker(): CircuitBreaker {
  if (!kimiBreaker) {
    kimiBreaker = new CircuitBreaker({
      name: 'Kimi-AI',
      failureThreshold: 5,
      resetTimeoutMs: 30000, // 30 seconds
      successThreshold: 2,
      requestTimeoutMs: 120000, // 2 minutes (Kimi can be slow on complex queries)
      onStateChange: (from, to, reason) => {
        console.log(`[Kimi AI Circuit Breaker] ${from} → ${to}: ${reason}`);
        // Emit metrics/alerts - Kimi is PRIMARY so this is critical
        if (to === 'OPEN') {
          console.warn('[CRITICAL] Primary LLM provider (Kimi AI) circuit is OPEN - falling back to OpenAI');
        }
      }
    });
  }
  return kimiBreaker;
}

/**
 * Get or create the OpenAI circuit breaker (SECONDARY FALLBACK)
 * OpenAI is used when Kimi AI is unavailable
 */
export function getOpenAICircuitBreaker(): CircuitBreaker {
  if (!openAIBreaker) {
    openAIBreaker = new CircuitBreaker({
      name: 'OpenAI',
      failureThreshold: 5,
      resetTimeoutMs: 30000, // 30 seconds
      successThreshold: 2,
      requestTimeoutMs: 120000, // 2 minutes
      onStateChange: (from, to, reason) => {
        console.log(`[OpenAI Circuit Breaker] ${from} → ${to}: ${reason}`);
        if (to === 'OPEN') {
          console.error('[CRITICAL] Secondary LLM provider (OpenAI) circuit is OPEN - all LLM services may be degraded');
        }
      }
    });
  }
  return openAIBreaker;
}

/**
 * Reset the Kimi AI circuit breaker (for testing)
 */
export function resetKimiCircuitBreaker(): void {
  kimiBreaker = null;
}

/**
 * Reset the OpenAI circuit breaker (for testing)
 */
export function resetOpenAICircuitBreaker(): void {
  openAIBreaker = null;
}

/**
 * Get the best available LLM circuit breaker
 * Returns Kimi if available, otherwise OpenAI
 */
export function getBestAvailableLLMBreaker(): { breaker: CircuitBreaker; provider: 'KIMI' | 'OPENAI' } {
  const kimi = getKimiCircuitBreaker();
  const openai = getOpenAICircuitBreaker();
  
  // Prefer Kimi if it's allowing requests
  if (kimi.isAllowingRequests()) {
    return { breaker: kimi, provider: 'KIMI' };
  }
  
  // Fall back to OpenAI
  if (openai.isAllowingRequests()) {
    return { breaker: openai, provider: 'OPENAI' };
  }
  
  // If both are open, return Kimi (it will fail but we need to return something)
  return { breaker: kimi, provider: 'KIMI' };
}

/**
 * Get all LLM circuit breaker metrics
 */
export function getAllLLMCircuitMetrics(): {
  kimi: CircuitBreakerMetrics;
  openai: CircuitBreakerMetrics;
  primaryAvailable: boolean;
  fallbackAvailable: boolean;
} {
  const kimi = getKimiCircuitBreaker();
  const openai = getOpenAICircuitBreaker();
  
  return {
    kimi: kimi.getMetrics(),
    openai: openai.getMetrics(),
    primaryAvailable: kimi.isAllowingRequests(),
    fallbackAvailable: openai.isAllowingRequests()
  };
}
